"use strict";

/* Private Chat only. Explicit Generate requests use fixed provider endpoints.
   Credentials remain DPAPI-sealed in the native shell, outside vault/sync data. */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const MODELS = Object.freeze({
  openai: Object.freeze(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare", "gpt-image-2"]),
  xai: Object.freeze(["grok-imagine-image-2.0"]),
});
// Fixed presets keep every generated size inside provider limits. No upscaling.
const OPENAI_SIZES = Object.freeze({
  standard: Object.freeze({ square: "1024x1024", portrait: "1024x1536", landscape: "1536x1024", wide: "1536x864", tall: "864x1536" }),
  "2k": Object.freeze({ square: "2048x2048", portrait: "1344x2016", landscape: "2016x1344", wide: "2048x1152", tall: "1152x2048" }),
  max: Object.freeze({ square: "2880x2880", portrait: "2336x3504", landscape: "3504x2336", wide: "3840x2160", tall: "2160x3840" }),
});
const ASPECT_RATIOS = Object.freeze({ square: "1:1", portrait: "2:3", landscape: "3:2", wide: "16:9", tall: "9:16" });
const MAX_REFERENCE = 4 * 1024 * 1024;
const MAX_REFERENCES = 12 * 1024 * 1024;
const MAX_OUTPUT = 20 * 1024 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;
const REQUEST_TIMEOUT = 300000;
class ImageError extends Error {}
function fail(message) { throw new ImageError(message); }
function failure(error, fallback = "Image generation could not finish. Please try again.") {
  return { ok: false, error: error instanceof ImageError ? error.message : fallback };
}
function providerOf(value) {
  if (value !== "openai" && value !== "xai") fail("Choose OpenAI or xAI for image generation.");
  return value;
}
function cleanKey(value) {
  if (typeof value !== "string") fail("Enter a valid provider API key.");
  const key = value.trim();
  if (key.length < 16 || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) fail("Enter a valid provider API key.");
  return key;
}
function imageType(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && /^VP8[ LX]$/.test(bytes.toString("ascii", 12, 16))) return "image/webp";
  fail("The image is not a supported PNG, JPEG or WebP file.");
}
function decodeImage(value, maximum) {
  if (typeof value !== "string" || !value.length || value.length > Math.ceil(maximum / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail("Image data is invalid or exceeds the size limit.");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > maximum || bytes.toString("base64") !== value) fail("Image data is invalid or exceeds the size limit.");
  return { bytes, mime: imageType(bytes) };
}
function referenceImage(value) {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_REFERENCE / 3) * 4 + 40) fail("Each reference image must be at most 4 MiB.");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match) fail("Reference images must be local PNG, JPEG or WebP data.");
  const image = decodeImage(match[2], MAX_REFERENCE);
  if (image.mime !== match[1]) fail("A reference image does not match its declared file type.");
  return { ...image, dataUrl: value };
}
function validateRequest(input) {
  if (!input || typeof input !== "object") fail("Missing image generation request.");
  const provider = providerOf(input.provider);
  const model = input.model || MODELS[provider][0];
  if (!MODELS[provider].includes(model)) fail("Choose a supported image model for this provider.");
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestId)) fail("Invalid image request ID.");
  if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 8000) fail("Enter an image prompt between 1 and 8,000 characters.");
  const shape = input.shape === undefined ? "square" : input.shape;
  const quality = input.quality === undefined ? "auto" : input.quality;
  const resolution = input.resolution === undefined ? "standard" : input.resolution;
  if (!["square", "portrait", "landscape", "wide", "tall"].includes(shape)) fail("Choose a supported image shape.");
  if (!["standard", "2k", "max"].includes(resolution)) fail("Choose a supported image resolution.");
  if (provider === "xai" && resolution === "max") fail("Grok supports Standard (1K) or 2K resolution.");
  if (!["auto", "low", "medium", "high", "xhigh", "max"].includes(quality)) fail("Choose a supported image quality.");
  if (provider === "xai" && !["auto", "low", "medium"].includes(quality)) fail("Grok supports Auto, Low or Medium image quality.");
  if (model === "gpt-image-2" && ["xhigh", "max"].includes(quality)) fail("GPT Image 2 supports image quality up to High. Choose a GPT Image 2.5 model for higher quality.");
  const references = input.references === undefined ? [] : input.references;
  if (!Array.isArray(references) || references.length > 4) fail("Choose up to four reference images.");
  const images = references.map(referenceImage);
  if (images.reduce((sum, image) => sum + image.bytes.length, 0) > MAX_REFERENCES) fail("Reference images must total at most 12 MiB.");
  return { provider, model, requestId: input.requestId, prompt: input.prompt.trim(), shape, quality, resolution, images };
}
function requestBody(input) {
  const request = validateRequest(input);
  const { provider, model, prompt, shape, quality, resolution, images } = request;
  const apiPath = "/v1/images/" + (images.length ? "edits" : "generations");
  let body, contentType = "application/json";
  if (provider === "xai") {
    const data = { model, prompt, n: 1, quality, resolution: resolution === "2k" ? "2k" : "1k", response_format: "b64_json", aspect_ratio: ASPECT_RATIOS[shape] };
    if (images.length === 1) data.image = { type: "image_url", url: images[0].dataUrl };
    else if (images.length) data.images = images.map(image => ({ type: "image_url", url: image.dataUrl }));
    body = Buffer.from(JSON.stringify(data), "utf8");
  } else {
    const data = { model, prompt, n: 1, size: OPENAI_SIZES[resolution][shape], quality, output_format: "png" };
    if (!images.length) body = Buffer.from(JSON.stringify(data), "utf8");
    else {
      const boundary = "RolecraftImage" + crypto.randomBytes(24).toString("hex");
      contentType = "multipart/form-data; boundary=" + boundary;
      const parts = [];
      for (const [name, value] of Object.entries(data)) parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n", "utf8"));
      images.forEach((image, index) => {
        const extension = image.mime === "image/jpeg" ? "jpg" : image.mime.split("/")[1];
        parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"image[]\"; filename=\"reference-" + (index + 1) + "." + extension + "\"\r\nContent-Type: " + image.mime + "\r\n\r\n", "utf8"), image.bytes, Buffer.from("\r\n"));
      });
      parts.push(Buffer.from("--" + boundary + "--\r\n"));
      body = Buffer.concat(parts);
    }
  }
  return { request, body, contentType, apiPath, host: provider === "openai" ? "api.openai.com" : "api.x.ai" };
}
function responseImage(value) {
  if (!value || !Array.isArray(value.data) || value.data.length !== 1 || !value.data[0] || typeof value.data[0].b64_json !== "string") fail("The provider did not return a complete image. No image was saved.");
  if (value.respect_moderation === false || value.data[0].respect_moderation === false) fail("The provider filtered this image. No image was saved.");
  const image = decodeImage(value.data[0].b64_json, MAX_OUTPUT);
  return "data:" + image.mime + ";base64," + image.bytes.toString("base64");
}
function httpFailure(code) {
  if (code === 401) return "The provider rejected the API key. Check the key for the selected provider.";
  if (code === 403) return "The provider refused this request. Check model access, account verification and provider policy.";
  if (code === 429) return "The provider rate or spending limit was reached. Check billing and try again later.";
  if (code === 400 || code === 422) return "The provider rejected the image request. Check the prompt, references and model access.";
  return "The image provider returned HTTP " + (Number.isInteger(code) ? code : "error") + ". No image was saved.";
}
// Only parsed error fields reach the renderer. Never return raw bodies/headers.
function errorText(value, secrets = []) {
  if (typeof value !== "string" || value.length > 16384) return "";
  let text = value;
  for (const secret of secrets) if (typeof secret === "string" && secret.length) text = text.split(secret).join("[redacted]");
  return text.replace(/data:[^\s"'<>]+/gi, "[image data removed]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[link removed]")
    .replace(/\b(?:sk-|xai-)[A-Za-z0-9_*.-]+/gi, "[key removed]")
    .replace(/\bBearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_+/=-]{80,}/g, "[data removed]")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
}
function providerFailure(status, raw, provider, secrets, requestId) {
  let body;
  try { if (typeof raw === "string" && Buffer.byteLength(raw) <= 65536) body = JSON.parse(raw); } catch (_) {}
  const candidate = body && body.error;
  const error = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  const token = (value, pattern) => typeof value === "string" && pattern.test(value) && errorText(value, secrets) === value ? value : "";
  const code = token(error.code, /^[A-Za-z0-9_.-]{1,80}$/), type = token(error.type, /^[A-Za-z0-9_.-]{1,80}$/);
  const param = token(error.param, /^[A-Za-z0-9_.\[\]-]{1,80}$/);
  const id = token(requestId, /^[A-Za-z0-9_-]{1,128}$/);
  let message = errorText(error.message || (typeof candidate === "string" ? candidate : body && body.message), secrets);
  // Auth responses may echo partially masked credentials. Do not display them.
  if (status === 401 || status >= 300 && status < 400) message = "";
  if (["moderation_blocked", "content_policy_violation", "safety_violation"].includes(code)) message = "The provider blocked this request under its image safety policy. No image was saved.";
  if (message.length > 900) message = message.slice(0, 900).replace(/[\uD800-\uDBFF]$/, "") + "…";
  return (provider === "xai" ? "xAI" : "OpenAI") + " (HTTP " + status + "): " + httpFailure(status)
    + (message ? "\n" + message : "\nNo safe provider explanation was available.")
    + (code ? "\nCode: " + code : "") + (type ? "\nType: " + type : "")
    + (param ? "\nParameter: " + param : "") + (id ? "\nRequest ID: " + id : "");
}
function setupImageGenerationIpc({ ipcMain, safeStorage, app, isLocked = () => true }) {
  let active = null;
  const guard = () => { if (isLocked()) fail("Unlock the vault before using image generation."); };
  const secure = () => { if (!safeStorage.isEncryptionAvailable()) fail("Windows credential encryption is unavailable."); };
  const keyFile = provider => path.join(app.getPath("userData"), "image-generation-" + providerOf(provider) + "-key.bin");
  const readKey = provider => {
    secure();
    try { return cleanKey(safeStorage.decryptString(fs.readFileSync(keyFile(provider)))); }
    catch (_) { fail("Save a valid API key for this provider before generating an image."); }
  };
  const cancelAll = () => { if (active) active.abort("Image generation stopped. The provider may still charge for work already started."); };
  ipcMain.handle("image-generation-status", () => {
    try { guard(); return { ok: true, secure: safeStorage.isEncryptionAvailable(), openai: fs.existsSync(keyFile("openai")), xai: fs.existsSync(keyFile("xai")) }; }
    catch (error) { return failure(error, "Could not read image provider settings."); }
  });
  ipcMain.handle("image-generation-set-key", (_event, input) => {
    let temporary;
    try {
      guard(); secure();
      const file = keyFile(input && input.provider), key = cleanKey(input && input.key);
      cancelAll();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      temporary = file + "." + crypto.randomBytes(12).toString("hex") + ".tmp";
      fs.writeFileSync(temporary, safeStorage.encryptString(key), { flag: "wx", mode: 0o600 });
      fs.renameSync(temporary, file);
      return { ok: true };
    } catch (error) { return failure(error, "Could not securely save this provider key."); }
    finally { if (temporary) try { fs.unlinkSync(temporary); } catch (_) {} }
  });
  ipcMain.handle("image-generation-clear-key", (_event, input) => {
    try { guard(); const file = keyFile(input && input.provider); cancelAll(); if (fs.existsSync(file)) fs.unlinkSync(file); return { ok: true }; }
    catch (error) { return failure(error, "Could not remove this provider key."); }
  });
  // Windows always uses its authoritative lock state, never a renderer assertion.
  ipcMain.handle("image-generation-set-unlocked", () => ({ ok: true }));
  ipcMain.handle("image-generation-cancel", (_event, input) => {
    if (active && input && active.id === input.requestId) cancelAll();
    return { ok: true };
  });
  ipcMain.handle("image-generation-generate", (event, input) => new Promise(resolve => {
    let prepared, key;
    try { guard(); if (event && event.sender && event.sender.isDestroyed && event.sender.isDestroyed()) fail("The image workspace was closed. No image was saved."); if (active) fail("Wait for the current image or stop it before generating another."); prepared = requestBody(input); key = readKey(prepared.request.provider); }
    catch (error) { resolve(failure(error)); return; }
    let req, res, timer, settled = false;
    const chunks = [];
    const sender = event && event.sender;
    const finish = result => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (active === operation) active = null;
      if (sender && sender.removeListener) sender.removeListener("destroyed", onDestroyed);
      chunks.length = 0;
      resolve(result);
    };
    const abort = message => {
      finish({ ok: false, error: message });
      if (res) res.destroy();
      if (req) req.destroy();
    };
    const onDestroyed = () => abort("The image workspace was closed. No image was saved.");
    const operation = { id: prepared.request.requestId, abort };
    active = operation;
    if (sender && sender.once) sender.once("destroyed", onDestroyed);
    timer = setTimeout(() => abort("Image generation timed out after five minutes. No image was saved; the provider may still charge for work already started."), REQUEST_TIMEOUT);
    try {
      req = https.request({ protocol: "https:", hostname: prepared.host, servername: prepared.host, port: 443, method: "POST", path: prepared.apiPath, headers: { Authorization: "Bearer " + key, Accept: "application/json", "Content-Type": prepared.contentType, "Content-Length": String(prepared.body.length) } }, incoming => {
        if (settled) { incoming.destroy(); return; }
        res = incoming;
        let bytes = 0, ended = false;
        const success = res.statusCode >= 200 && res.statusCode < 300;
        const rejection = raw => providerFailure(res.statusCode, raw, prepared.request.provider, [key, prepared.request.prompt], res.headers && res.headers["x-request-id"]);
        const limit = success ? MAX_RESPONSE : 64 * 1024;
        const declaredLength = Number(res.headers && res.headers["content-length"]);
        if (declaredLength > limit) { abort(success ? "The provider response exceeded the image size limit. No image was saved." : rejection("")); return; }
        res.on("data", chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > limit) { abort(success ? "The provider response exceeded the image size limit. No image was saved." : rejection("")); return; }
          chunks.push(Buffer.from(chunk));
        });
        res.on("end", () => {
          ended = true;
          if (settled) return;
          try {
            guard();
            if (!success) fail(rejection(Buffer.concat(chunks).toString("utf8")));
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (_) { fail("The provider returned an incomplete image response. No image was saved."); }
            const dataUrl = responseImage(body);
            guard();
            finish({ ok: true, dataUrl, provider: prepared.request.provider, model: prepared.request.model });
          } catch (error) { finish(failure(error)); }
        });
        res.on("error", () => abort("The image connection was interrupted. No image was saved."));
        res.on("aborted", () => abort("The image connection was interrupted. No image was saved."));
        res.on("close", () => { if (!ended && !settled) abort("The image connection closed before it finished. No image was saved."); });
      });
      req.on("error", () => abort("Could not reach the image provider securely. Check your connection and try again."));
      req.on("close", () => { if (!res && !settled) abort("The image connection closed before it finished. No image was saved."); });
      req.end(prepared.body);
    } catch (_) { abort("Could not start image generation. Check your connection and provider settings."); }
  }));
  app.on("before-quit", cancelAll);
  return cancelAll;
}

module.exports = { setupImageGenerationIpc, validateRequest, requestBody, responseImage, imageType, providerFailure, errorText, MAX_REFERENCE, MAX_REFERENCES, MAX_OUTPUT, MAX_RESPONSE, REQUEST_TIMEOUT };
