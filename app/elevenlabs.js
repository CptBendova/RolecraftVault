"use strict";

/* ElevenLabs character voices (1.339). The renderer never receives the saved
   credential and never opens a socket. Every request is pinned to
   api.elevenlabs.io over HTTPS, follows no redirects, is bounded in size and
   time, and starts only from an explicit Chat action (tap to play, the chosen
   auto-read setting, or loading the voice list). The key is sealed with
   Windows safeStorage outside vault data, backups and paired sync. */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const HOST = "api.elevenlabs.io";
const MODELS = Object.freeze(["eleven_v4", "eleven_v4_turbo"]);
const OUTPUT_FORMAT = "mp3_44100_128";
const MAX_TEXT = 4000;
const MAX_AUDIO = 16 * 1024 * 1024;
const MAX_VOICES_RESPONSE = 2 * 1024 * 1024;
const MAX_ERROR_BYTES = 64 * 1024;
const SPEECH_TIMEOUT = 120000;
const VOICES_TIMEOUT = 30000;

class VoiceError extends Error {}
function fail(message) { throw new VoiceError(message); }
function failure(error, fallback) { return { ok: false, error: error instanceof VoiceError ? error.message : fallback }; }
function cleanKey(value) {
  if (typeof value !== "string") fail("Enter a valid ElevenLabs API key.");
  const key = value.trim();
  if (key.length < 16 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) fail("Enter a valid ElevenLabs API key.");
  return key;
}
function voiceIdOf(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(value)) fail("Choose an ElevenLabs voice for this character first.");
  return value;
}
function modelOf(value) {
  if (value === undefined || value === null || value === "") return MODELS[0];
  if (!MODELS.includes(value)) fail("Choose Eleven v4 or Eleven v4 Turbo.");
  return value;
}
function textOf(value) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT) fail("Choose a reply under 4,000 characters to voice.");
  return value;
}
// MP3 with an ID3 tag or a raw MPEG audio frame header. Anything else is refused.
function mp3(data) {
  if (data.length < 128) return false;
  if (data.toString("ascii", 0, 3) === "ID3") return true;
  return data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
}
// Plain display text only: no control characters, links or long encoded runs.
function plain(value, max) {
  if (typeof value !== "string") return "";
  const text = value.replace(/https?:\/\/[^\s"'<>]+/gi, "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).replace(/[\uD800-\uDBFF]$/, "") + "…" : text;
}
function voiceRow(value) {
  if (!value || typeof value !== "object" || typeof value.voice_id !== "string" || !/^[A-Za-z0-9]{8,64}$/.test(value.voice_id)) return null;
  const name = plain(value.name, 100);
  if (!name) return null;
  const labels = [];
  if (value.labels && typeof value.labels === "object" && !Array.isArray(value.labels)) {
    for (const [label, text] of Object.entries(value.labels)) {
      if (labels.length >= 6) break;
      const k = plain(label, 30).replace(/_/g, " "), v = plain(text, 40);
      if (k && v) labels.push(k + ": " + v);
    }
  }
  const category = typeof value.category === "string" && /^[a-z_]{1,40}$/.test(value.category) ? value.category : "";
  return { id: value.voice_id, name, category, description: plain(value.description, 200), labels };
}
function readVoices(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.voices)) fail("ElevenLabs returned an invalid voice list.");
  const voices = value.voices.slice(0, 100).map(voiceRow).filter(Boolean);
  const token = typeof value.next_page_token === "string" && /^[A-Za-z0-9_=.+\/-]{1,512}$/.test(value.next_page_token) ? value.next_page_token : "";
  return { voices, hasMore: value.has_more === true && !!token, nextPageToken: value.has_more === true ? token : "" };
}
function httpFailure(code) {
  if (code === 401) return "ElevenLabs rejected the API key. Check the key in Chat connection settings.";
  if (code === 402) return "Your ElevenLabs plan or credit does not cover this request.";
  if (code === 403) return "This ElevenLabs account cannot use that voice, model or privacy mode.";
  if (code === 404) return "ElevenLabs could not find this voice. Choose it again in the character's voice settings.";
  if (code === 429) return "ElevenLabs reached its rate, concurrency or quota limit. Try again later; nothing was retried.";
  if (code >= 300 && code < 400) return "ElevenLabs requested a redirect. It was blocked to protect your API key.";
  if (code >= 500) return "ElevenLabs is temporarily unavailable. Try again later; nothing was retried.";
  return "ElevenLabs rejected the request (HTTP " + code + ").";
}
// Only parsed, sanitised fields reach the renderer; never raw bodies or headers.
function providerFailure(status, raw, secrets) {
  let message = "";
  if (status !== 401 && !(status >= 300 && status < 400)) {
    try {
      const body = JSON.parse(raw);
      const detail = body && body.detail;
      if (typeof detail === "string") message = detail;
      else if (detail && typeof detail.message === "string") message = detail.message;
      else if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === "string") message = detail[0].msg;
    } catch (_) {}
    for (const secret of secrets) if (secret) message = message.split(secret).join("[redacted]");
    message = plain(message.replace(/\b(?:sk|xi)[_-][A-Za-z0-9_-]+/gi, "[key removed]").replace(/[A-Za-z0-9_+/=-]{80,}/g, "[data removed]"), 400);
  }
  return httpFailure(status) + (message ? "\n" + message : "");
}

function setupElevenLabsIpc({ ipcMain, safeStorage, app, isLocked = () => true }) {
  const active = new Set();
  let speaking = null;
  const guard = () => { if (isLocked()) fail("Unlock the vault before using ElevenLabs voices."); };
  const secure = () => { if (!safeStorage.isEncryptionAvailable()) fail("Windows credential encryption is unavailable."); };
  const keyFile = () => path.join(app.getPath("userData"), "elevenlabs-key.bin");
  const readKey = () => {
    secure();
    try { return cleanKey(safeStorage.decryptString(fs.readFileSync(keyFile()))); }
    catch (_) { fail("Add your ElevenLabs API key in Chat connection settings first."); }
  };
  const cancelAll = () => { for (const operation of [...active]) operation.abort("ElevenLabs request stopped."); };

  // One bounded HTTPS exchange. Resolves {status, headers, body} or rejects.
  function exchange({ method, apiPath, key, body, accept, limit, timeout, onOperation }) {
    return new Promise((resolve, reject) => {
      let req, res, settled = false, deadline = null;
      const done = (error, value) => {
        if (settled) return;
        settled = true; clearTimeout(deadline); active.delete(operation);
        if (error) reject(error); else resolve(value);
      };
      const operation = { abort: message => { done(new VoiceError(message)); if (res) res.destroy(); if (req) req.destroy(); } };
      active.add(operation);
      if (onOperation) onOperation(operation);
      deadline = setTimeout(() => operation.abort("ElevenLabs did not answer in time. Nothing was retried."), timeout);
      const headers = { "xi-api-key": key, Accept: accept };
      if (body) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = String(body.length); }
      try {
        req = https.request({ protocol: "https:", hostname: HOST, servername: HOST, port: 443, method, path: apiPath, headers }, incoming => {
          res = incoming;
          if (settled) { res.destroy(); return; }
          const success = res.statusCode >= 200 && res.statusCode < 300, max = success ? limit : MAX_ERROR_BYTES;
          if (Number(res.headers && res.headers["content-length"]) > max) { operation.abort(success ? "ElevenLabs returned more data than allowed." : httpFailure(res.statusCode)); return; }
          const chunks = []; let bytes = 0;
          res.on("data", chunk => {
            if (settled) return;
            bytes += chunk.length;
            if (bytes > max) { operation.abort(success ? "ElevenLabs returned more data than allowed." : httpFailure(res.statusCode)); return; }
            chunks.push(Buffer.from(chunk));
          });
          res.on("end", () => done(null, { status: res.statusCode, headers: res.headers || {}, body: Buffer.concat(chunks) }));
          res.on("error", () => done(new VoiceError("The ElevenLabs connection was interrupted. Nothing was retried.")));
        });
        req.setTimeout(timeout, () => operation.abort("ElevenLabs did not answer in time. Nothing was retried."));
        req.on("error", () => done(new VoiceError("Could not reach ElevenLabs. Check your connection; nothing was retried.")));
        if (body) req.write(body);
        req.end();
      } catch (_) { done(new VoiceError("Could not reach ElevenLabs. Nothing was retried.")); }
    });
  }

  ipcMain.handle("elevenlabs-status", () => {
    try { guard(); return { ok: true, secure: safeStorage.isEncryptionAvailable(), configured: fs.existsSync(keyFile()) }; }
    catch (error) { return failure(error, "Could not read ElevenLabs settings."); }
  });
  ipcMain.handle("elevenlabs-set-key", (_event, input) => {
    let temporary;
    try {
      guard(); secure();
      const key = cleanKey(input && input.key), file = keyFile();
      cancelAll();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      temporary = file + "." + crypto.randomBytes(12).toString("hex") + ".tmp";
      fs.writeFileSync(temporary, safeStorage.encryptString(key), { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, file);
      return { ok: true };
    } catch (error) { return failure(error, "Could not securely save the ElevenLabs key."); }
    finally { if (temporary) try { fs.unlinkSync(temporary); } catch (_) {} }
  });
  ipcMain.handle("elevenlabs-clear-key", () => {
    try { guard(); cancelAll(); if (fs.existsSync(keyFile())) fs.unlinkSync(keyFile()); return { ok: true }; }
    catch (error) { return failure(error, "Could not remove the ElevenLabs key."); }
  });
  // Windows uses its authoritative lock state, never a renderer assertion.
  ipcMain.handle("elevenlabs-set-unlocked", () => ({ ok: true }));
  ipcMain.handle("elevenlabs-cancel", () => { cancelAll(); return { ok: true }; });
  ipcMain.handle("elevenlabs-voices", async (_event, input) => {
    try {
      guard();
      const key = readKey(), options = input && typeof input === "object" ? input : {};
      const query = new URLSearchParams({ page_size: "100" });
      if (options.search !== undefined && options.search !== "") {
        if (typeof options.search !== "string" || options.search.length > 100) fail("Search for a voice with at most 100 characters.");
        query.set("search", options.search.trim());
      }
      if (options.pageToken !== undefined && options.pageToken !== "") {
        if (typeof options.pageToken !== "string" || !/^[A-Za-z0-9_=.+\/-]{1,512}$/.test(options.pageToken)) fail("Invalid voice list page.");
        query.set("next_page_token", options.pageToken);
      }
      const reply = await exchange({ method: "GET", apiPath: "/v2/voices?" + query.toString(), key, accept: "application/json", limit: MAX_VOICES_RESPONSE, timeout: VOICES_TIMEOUT });
      guard();
      if (reply.status < 200 || reply.status >= 300) fail(providerFailure(reply.status, reply.body.toString("utf8"), [key]));
      let parsed;
      try { parsed = JSON.parse(reply.body.toString("utf8")); } catch (_) { fail("ElevenLabs returned an invalid voice list."); }
      return { ok: true, ...readVoices(parsed) };
    } catch (error) { return failure(error, "Could not load ElevenLabs voices."); }
  });
  ipcMain.handle("elevenlabs-speech", async (_event, input) => {
    try {
      guard();
      const request = input && typeof input === "object" ? input : {};
      const text = textOf(request.text), voiceId = voiceIdOf(request.voiceId), model = modelOf(request.model);
      if (request.zeroRetention !== undefined && typeof request.zeroRetention !== "boolean") fail("Invalid ElevenLabs privacy setting.");
      const key = readKey();
      // The newest explicit request wins; an earlier one is abandoned.
      if (speaking) speaking.abort("Voice playback was replaced by a newer request.");
      const query = new URLSearchParams({ output_format: OUTPUT_FORMAT });
      // Zero retention is an ElevenLabs Enterprise feature; other plans refuse it.
      if (request.zeroRetention === true) query.set("enable_logging", "false");
      const body = Buffer.from(JSON.stringify({ text, model_id: model }), "utf8");
      let mine = null, reply;
      try {
        reply = await exchange({ method: "POST", apiPath: "/v1/text-to-speech/" + voiceId + "?" + query.toString(), key, body, accept: "audio/mpeg", limit: MAX_AUDIO, timeout: SPEECH_TIMEOUT, onOperation: operation => { mine = operation; speaking = operation; } });
      } finally { if (speaking === mine) speaking = null; }
      guard();
      if (reply.status < 200 || reply.status >= 300) fail(providerFailure(reply.status, reply.body.toString("utf8"), [key, text]));
      const declared = String(reply.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
      if (declared !== "audio/mpeg" || !mp3(reply.body)) fail("ElevenLabs returned invalid voice audio.");
      return { ok: true, audio: reply.body.toString("base64"), mime: "audio/mpeg" };
    } catch (error) { return failure(error, "ElevenLabs voice generation failed."); }
  });
  return cancelAll;
}

module.exports = { setupElevenLabsIpc, MODELS, readVoices, providerFailure, mp3 };
