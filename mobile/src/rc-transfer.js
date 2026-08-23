/* window.transfer for Android.

   The desktop app is both ends of a transfer: it serves /manifest and /delta,
   and it receives from another copy. A WebView cannot listen on a socket, so
   this half does the receiving only. That is enough to carry a whole vault from
   the PC to a phone or tablet, because receiveTransfer on the desktop side is a
   pure HTTP client: it asks for a listing, works out what it is missing, asks
   for those records, and writes them. Nothing about that needs a server here.

   Sending FROM the device would need a listening socket, which means a native
   plugin. Not done: the PC is the source of truth.

   Everything below runs in the WebView. The native HTTP plugin is used rather than fetch
   because the page is served over https: and the other device is a plain http://
   address on the LAN, which the WebView blocks as mixed content, and those
   endpoints send no CORS headers either. A native request is subject to neither.

   The crypto is the same as the desktop: PBKDF2-SHA256 150,000 rounds to a
   256-bit key, then AES-256-GCM. WebCrypto does all of it, so no native crypto
   is involved and the two sides cannot drift on algorithm choice. */
(function () {
  "use strict";
  /* Whatever happens below, window.transfer ends up defined. A panel that
     explains why it cannot work is worth more than a panel that is not there. */
  const fail = why => {
    window.transfer = {
      canShare: false,
      status: () => Promise.resolve({ active: false, device: "This device" }),
      start: () => Promise.resolve({ ok: false, error: why }),
      stop: () => Promise.resolve({ ok: true }),
      preview: () => Promise.resolve({ ok: false, error: why }),
      receive: () => Promise.resolve({ ok: false, error: why }),
      onProgress: () => () => {}
    };
  };
  try {

  /* Resolved when a request is actually made, not while this file is being read.
     The native bridge injects window.Capacitor itself, and reaching into
     .Plugins before it exists throws, which would abort this whole script and
     leave window.transfer undefined. The interface only shows a transfer panel
     when window.transfer exists, so the failure looked like the feature simply
     not being there, with nothing on screen to explain it. */
  function nativeRequest(opts) {
    const C = window.Capacitor;
    if (!C) throw new Error("This is not running inside the app, so it cannot reach the other device.");
    const plugin = C.Plugins && C.Plugins.CapacitorHttp;
    if (plugin && typeof plugin.request === "function") return plugin.request(opts);
    if (typeof C.nativePromise === "function") return C.nativePromise("CapacitorHttp", "request", opts);
    throw new Error("The native network bridge did not load, so this device cannot reach the other one.");
  }

  /* ---------- the pairing code ---------- */
  /* Same alphabet as makeCode on the desktop, and the same forgiving reading of
     it: letters that look like digits are folded together so a code read off
     another screen still works. */
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  function fromBase32(str) {
    const clean = String(str).toUpperCase().replace(/[^0-9A-Z]/g, "")
      .replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0").replace(/U/g, "V");
    let bits = 0, value = 0;
    const out = [];
    for (const ch of clean) {
      const idx = ALPHA.indexOf(ch);
      if (idx < 0) throw new Error("Bad character in code");
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  function parseCode(code) {
    const buf = fromBase32(code);
    if (buf.length < 12) throw new Error("That code looks incomplete");
    return {
      ip: [buf[0], buf[1], buf[2], buf[3]].join("."),
      port: (buf[4] << 8) | buf[5],
      secret: buf.slice(6, 12)
    };
  }

  /* ---------- crypto, matching main.js exactly ---------- */
  async function keyFrom(secret, salt) {
    const base = await crypto.subtle.importKey("raw", secret, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const ascii = s => new TextEncoder().encode(s);
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  /* RCVX1: a whole small payload in one piece. 5 magic, 16 salt, 12 iv, 16 tag,
     then the body. WebCrypto wants the tag appended to the ciphertext, so it is
     moved rather than passed separately. */
  async function decryptPayload(blob, secret) {
    if (!sameBytes(blob.slice(0, 5), ascii("RCVX1"))) throw new Error("Not a Rolecraft transfer");
    const salt = blob.slice(5, 21), iv = blob.slice(21, 33);
    const tag = blob.slice(33, 49), body = blob.slice(49);
    const joined = new Uint8Array(body.length + tag.length);
    joined.set(body, 0);
    joined.set(tag, body.length);
    const key = await keyFrom(secret, salt);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, joined));
  }
  async function encryptPayload(plain, secret) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFrom(secret, salt);
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, plain));
    const body = sealed.slice(0, sealed.length - 16), tag = sealed.slice(sealed.length - 16);
    const out = new Uint8Array(5 + 16 + 12 + 16 + body.length);
    out.set(ascii("RCVX1"), 0);
    out.set(salt, 5);
    out.set(iv, 21);
    out.set(tag, 33);
    out.set(body, 49);
    return out;
  }

  /* RCVX2: the record stream. 5 magic, 16 salt, 12 iv, ciphertext, and the tag
     at the very end, which is the order WebCrypto already expects once the magic
     and header are dropped. Newline-delimited JSON inside: one header line, then
     {k, v} per record. */
  async function decryptRecordFile(bytes, secret) {
    if (!sameBytes(bytes.slice(0, 5), ascii("RCVX2"))) throw new Error("Not a Rolecraft record file");
    const salt = bytes.slice(5, 21), iv = bytes.slice(21, 33);
    const key = await keyFrom(secret, salt);
    const plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 }, key, bytes.slice(33)));
    const lines = new TextDecoder().decode(plain).split("\n").filter(Boolean);
    const head = JSON.parse(lines[0]);
    if (head.app !== "rolecraft-vault") throw new Error("That file is not from Rolecraft Vault");
    return lines.slice(1).map(l => JSON.parse(l));
  }

  /* ---------- talking to the other device ---------- */
  const b64ToBytes = b64 => {
    const bin = atob(String(b64).replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const bytesToB64 = bytes => {
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  async function ask(base, path, method, bodyBytes, timeoutMs) {
    const res = await nativeRequest({
      url: "http://" + base.ip + ":" + base.port + path,
      method: method,
      responseType: "arraybuffer",
      connectTimeout: timeoutMs || 30000,
      readTimeout: timeoutMs || 30000,
      headers: bodyBytes ? { "Content-Type": "application/octet-stream" } : undefined,
      /* base64 goes in, raw bytes must go out. Android only runs the body
         through a base64 decoder when dataType is "file"; without it the
         base64 text is sent as the body verbatim, and the other device gets a
         payload half again as long that it cannot decrypt. Nothing reports an
         error, so a transfer would have failed at the far end looking like a
         wrong pairing code. */
      dataType: bodyBytes ? "file" : undefined,
      data: bodyBytes ? bytesToB64(bodyBytes) : undefined
    });
    if (res.status !== 200) throw new Error("status " + res.status);
    return typeof res.data === "string" ? b64ToBytes(res.data) : new Uint8Array(res.data);
  }

  /* CapacitorHttp loads a whole response into JS as base64. Around 130 MB the
     phone stops. Slices stay at 1 MB, so a 12 MB picture is twelve calls that
     are joined here, never one giant native payload. */
  const SLICE_BYTES = 1 << 20;
  async function downloadSliced(target, path, totalBytes, timeoutMs, onBytes) {
    if (!totalBytes || totalBytes <= SLICE_BYTES) {
      const blob = await ask(target, path, "GET", null, timeoutMs);
      if (onBytes) onBytes(blob.length, totalBytes || blob.length);
      return blob;
    }
    const out = new Uint8Array(totalBytes);
    let got = 0;
    while (got < totalBytes) {
      const n = Math.min(SLICE_BYTES, totalBytes - got);
      const sep = path.indexOf("?") >= 0 ? "&" : "?";
      const piece = await ask(target, path + sep + "off=" + got + "&n=" + n, "GET", null, timeoutMs);
      if (!piece || !piece.length) throw new Error("The other device sent an empty piece of the vault.");
      if (got + piece.length > totalBytes) throw new Error("The other device sent more than it said it would.");
      out.set(piece, got);
      got += piece.length;
      if (onBytes) onBytes(got, totalBytes);
    }
    return out;
  }

  /* ---------- the local half ---------- */
  /* window.storage is the web edition's IndexedDB layer, already loaded. The
     manifest is built the same way the desktop builds its own: a short hash of
     every stored value, so only what actually differs is asked for. */
  async function sha16(text) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  /* The web platform is not a bare key/value map: list() returns { keys }, get()
     returns { value } and rejects outright when a key is missing rather than
     answering null. Both shapes are handled here so a record that vanishes
     mid-scan is skipped instead of taking the whole sync down. */
  async function localManifest(report) {
    const keys = (await window.storage.list()).keys;
    const m = {};
    for (let i = 0; i < keys.length; i++) {
      try {
        const got = await window.storage.get(keys[i]);
        const v = got && got.value;
        if (v !== null && v !== undefined) m[keys[i]] = await sha16(String(v));
      } catch (e) {}
      if (report) report(i + 1, keys.length);
    }
    return m;
  }

  const countRecords = manifest =>
    Object.keys(manifest).filter(k => !/^(img:|th:|sz:|ui:)/.test(k)).length;

  async function receive(code, mirror, preview, onProgress) {
    const phase = (name, done, total) => {
      if (onProgress) onProgress({ phase: name, done, total, pct: total > 0 ? done / total : 0 });
    };
    let target;
    try { target = parseCode(code); } catch (e) { return { ok: false, error: "That code isn't valid" }; }

    let remote, them = null;
    try {
      phase("asking", 0, 0);
      remote = JSON.parse(new TextDecoder().decode(
        await decryptPayload(await ask(target, "/manifest", "GET", null, 180000), target.secret)));
    } catch (e) {
      return { ok: false, error: String(e.message).indexOf("timeout") >= 0
        ? "The other device didn't answer. Same Wi-Fi? Still on the Send screen?"
        : "Couldn't read the other device. Check the code was typed correctly." };
    }
    try {
      them = JSON.parse(new TextDecoder().decode(
        await decryptPayload(await ask(target, "/whoami", "GET", null, 30000), target.secret)));
    } catch (e) {}

    const local = await localManifest((i, n) => phase("comparing", i, n));
    const needed = [];
    let added = 0, updated = 0;
    for (const k of Object.keys(remote)) {
      if (local[k] === undefined) { needed.push(k); added++; }
      else if (local[k] !== remote[k]) { needed.push(k); updated++; }
    }
    const removable = mirror ? Object.keys(local).filter(k => remote[k] === undefined) : [];
    const who = {
      thisDevice: "This device",
      thisRecords: countRecords(local),
      otherDevice: (them && them.device) || null,
      otherRecords: them && typeof them.records === "number" ? them.records : null
    };
    const unchanged = Object.keys(remote).length - needed.length;

    if (preview) {
      return Object.assign({ ok: true, preview: true, mirror: !!mirror,
        added, updated, removed: removable.length, unchanged,
        upToDate: !needed.length && !removable.length }, who);
    }
    if (!needed.length && !removable.length) {
      return Object.assign({ ok: true, added: 0, updated: 0, removed: 0, unchanged, bytes: 0, upToDate: true }, who);
    }

    /* Mirroring deletes, so the other device is asked first, exactly as a
       desktop receiver asks. It cannot be told to skip that: no answer, or a
       device too old to be asked, both mean no. */
    if (mirror && removable.length) {
      let decision = "unavailable";
      try {
        const body = await encryptPayload(new TextEncoder().encode(JSON.stringify({
          device: "This device", code: "", added, updated, removed: removable.length
        })), target.secret);
        decision = JSON.parse(new TextDecoder().decode(
          await decryptPayload(await ask(target, "/mirror-request", "POST", body, 240000), target.secret))).decision;
      } catch (e) { decision = "unavailable"; }
      if (decision === "unavailable") {
        return Object.assign({ ok: false, needsBothUpdated: true,
          error: "This device could not ask " + (who.otherDevice || "the other device")
            + " to approve. Mirroring needs the newer version on both. Merging still works." }, who);
      }
      if (decision !== "allow") {
        return Object.assign({ ok: false, refused: true,
          error: (who.otherDevice || "The other device") + " refused the mirror. Nothing was changed." }, who);
      }
    }

    let bytes = 0, records = [], saved = 0;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const saveRecords = async recs => {
      for (let i = 0; i < recs.length; i++) {
        try {
          await window.storage.set(recs[i].k, recs[i].v);
        } catch (e) {
          recs[i].v = null;
          const m = String((e && e.message) || e);
          const quota = (e && e.name === "QuotaExceededError") || /quota|full|disk|space|sqlite/i.test(m);
          throw new Error(quota
            ? "This phone ran out of room while saving (" + saved + " of " + needed.length + " records already in). Free space and try again — what already arrived is kept."
            : "Could not save on this phone: " + m);
        }
        recs[i].v = null;
        saved++;
        phase("saving", saved, needed.length);
        await wait(0);
      }
    };
    try {
    if (needed.length) {
      const readProgress = async () => {
        try {
          return JSON.parse(new TextDecoder().decode(
            await decryptPayload(await ask(target, "/progress", "GET", null, 8000), target.secret)));
        } catch (e) { return null; }
      };
      const applyProgress = st => {
        if (!st || !st.phase) return;
        if (st.phase === "packing") phase("packing", st.done || 0, st.total || 0);
        else if (st.phase === "sending") phase("receiving", st.bytes || st.done || 0, st.byteTotal || st.total || 0);
      };
      const body = await encryptPayload(new TextEncoder().encode(JSON.stringify(needed)), target.secret);
      let blob = null;
      let started = false;
      let batchSizes = null;
      try {
        const msg = JSON.parse(new TextDecoder().decode(
          await decryptPayload(await ask(target, "/delta-start", "POST", body, 30000), target.secret)));
        started = !!(msg && msg.ok);
        if (started) phase("packing", 0, msg.total || needed.length);
      } catch (e) { started = false; }
      if (started) {
        for (;;) {
          const st = await readProgress();
          applyProgress(st);
          if (st && st.phase === "ready") {
            if (Array.isArray(st.sizes) && st.sizes.length) batchSizes = st.sizes;
            break;
          }
          if (st && st.phase === "error") {
            return { ok: false, error: st.error || "The other device failed while gathering records." };
          }
          await wait(400);
        }
        if (batchSizes) {
          const totalBytes = batchSizes.reduce((a, b) => a + (Number(b) || 0), 0) || 1;
          let bytesDone = 0;
          for (let i = 0; i < batchSizes.length; i++) {
            const want = Number(batchSizes[i]) || 0;
            const piece = await downloadSliced(target, "/delta-file?i=" + i, want, 600000, got => {
              phase("receiving", bytesDone + got, totalBytes);
            });
            bytes += piece.length;
            bytesDone += want || piece.length;
            phase("unpacking", i + 1, batchSizes.length);
            await saveRecords(await decryptRecordFile(piece, target.secret));
          }
        } else {
          phase("receiving", 0, 1);
          blob = await ask(target, "/delta-file", "GET", null, 600000);
        }
      } else {
        phase("packing", 0, 0);
        const download = ask(target, "/delta", "POST", body, 600000);
        for (;;) {
          const winner = await Promise.race([
            download.then(b => ({ t: "data", b }), e => ({ t: "err", e })),
            wait(500).then(() => ({ t: "tick" }))
          ]);
          if (winner.t === "data") { blob = winner.b; break; }
          if (winner.t === "err") throw winner.e;
          applyProgress(await readProgress());
        }
      }
      if (blob) {
        bytes = blob.length;
        phase("unpacking", 0, 0);
        records = await decryptRecordFile(blob, target.secret);
      }
    }

    /* Batched transfers already saved each piece after its tag checked. A single
       file still waits until the whole payload has decrypted, so a truncated
       download cannot leave the vault half updated. */
    if (records.length) await saveRecords(records);
    for (let i = 0; i < removable.length; i++) {
      await window.storage.delete(removable[i]);
      phase("removing", i + 1, removable.length);
    }
    phase("done", 1, 1);
    return Object.assign({ ok: true, added, updated, removed: removable.length, unchanged, bytes }, who);
    } catch (e) {
      return Object.assign({ ok: false, error: e && e.message ? e.message : String(e) }, who);
    }
  }

  const progressHandlers = [];
  window.transfer = {
    /* Sharing needs a listening socket, which a WebView does not have. Reported
       honestly so the interface can hide the half it cannot offer rather than
       showing a button that fails. */
    canShare: false,
    status: () => Promise.resolve({ active: false, device: "This device" }),
    start: () => Promise.resolve({ ok: false, error: "This device can receive a vault, but cannot share one. Start the transfer on the computer and type its code here." }),
    stop: () => Promise.resolve({ ok: true }),
    preview: (code, mirror) => receive(code, mirror, true, p => progressHandlers.forEach(h => h(p))),
    receive: (code, mirror) => receive(code, mirror, false, p => progressHandlers.forEach(h => h(p))),
    onProgress: cb => {
      progressHandlers.push(cb);
      return () => {
        const i = progressHandlers.indexOf(cb);
        if (i >= 0) progressHandlers.splice(i, 1);
      };
    }
  };
  } catch (e) {
    fail("The transfer could not start up on this device: " + (e && e.message ? e.message : e));
  }
})();
