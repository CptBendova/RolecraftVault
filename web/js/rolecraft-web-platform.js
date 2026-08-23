/* Rolecraft Vault — web platform layer
   Provides window.storage, window.auth and window.vaultInfo with the same
   contract as the Windows desktop build, implemented on IndexedDB + WebCrypto.
   Load this BEFORE rolecraft-app.web.js. */
(function () {
  "use strict";

  /* ---------- IndexedDB key-value store ---------- */
  var DB_NAME = "rolecraft-vault";
  var STORE = "kv";
  var dbPromise = null;
  function openDb() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function db() { return dbPromise || (dbPromise = openDb()); }
  function idbGet(k) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readonly").objectStore(STORE).get(k);
        t.onsuccess = function () { res(t.result === undefined ? null : t.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbSet(k, v) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k);
        t.onsuccess = function () { res(true); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbDel(k) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readwrite").objectStore(STORE).delete(k);
        t.onsuccess = function () { res(true); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function idbKeys() {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, "readonly").objectStore(STORE).getAllKeys();
        t.onsuccess = function () { res(t.result || []); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  /* IndexedDB on Android WebView fills up around a gigabyte and then either
     throws QuotaExceededError or never finishes a put. A 4 GB vault cannot
     live there. On Capacitor we write anything larger than FS_LARGE as a file
     in the app's private directory, in small chunks so the native bridge
     (about 1 MB) is never asked to swallow a whole picture. The IDB value is
     only a pointer. The browser edition has no Filesystem plugin and stays
     on IndexedDB. */
  var FILE_MARK = "file:";
  var FS_DIR = "DATA";
  var FS_CHUNK = 512 * 1024;
  var FS_LARGE = 16 * 1024;
  function nativeFs() {
    var C = window.Capacitor;
    return C && typeof C.nativePromise === "function" ? C : null;
  }
  function fsCall(method, opts) {
    return nativeFs().nativePromise("Filesystem", method, opts);
  }
  function fsPath(key) {
    return "kv/" + encodeURIComponent(key);
  }
  function storePayload(key, payload) {
    if (!(nativeFs() && payload.length > FS_LARGE)) return idbSet("v:" + key, payload);
    var path = fsPath(key);
    var off = 0;
    var first = payload.slice(0, FS_CHUNK);
    off = first.length;
    return fsCall("writeFile", {
      path: path, data: first, directory: FS_DIR, encoding: "utf8", recursive: true
    }).then(function appendMore() {
      if (off >= payload.length) return idbSet("v:" + key, FILE_MARK + path);
      var piece = payload.slice(off, off + FS_CHUNK);
      off += piece.length;
      return fsCall("appendFile", {
        path: path, data: piece, directory: FS_DIR, encoding: "utf8"
      }).then(appendMore);
    });
  }
  function loadPayload(stored) {
    if (typeof stored !== "string" || stored.indexOf(FILE_MARK) !== 0) return Promise.resolve(stored);
    if (!nativeFs()) return Promise.resolve(null);
    var path = stored.slice(FILE_MARK.length);
    return fsCall("stat", { path: path, directory: FS_DIR }).then(function (st) {
      var size = st.size || 0, parts = [], off = 0;
      function readMore() {
        if (off >= size) return parts.join("");
        var n = Math.min(FS_CHUNK, size - off);
        return fsCall("readFile", {
          path: path, directory: FS_DIR, encoding: "utf8", offset: off, length: n
        }).then(function (r) {
          parts.push(r.data || "");
          off += n;
          return readMore();
        });
      }
      return readMore();
    }).catch(function () { return null; });
  }
  function dropPayloadFile(stored) {
    if (typeof stored !== "string" || stored.indexOf(FILE_MARK) !== 0 || !nativeFs()) return Promise.resolve();
    return fsCall("deleteFile", {
      path: stored.slice(FILE_MARK.length), directory: FS_DIR
    }).catch(function () { return true; });
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }

  /* ---------- crypto helpers (WebCrypto) ---------- */
  var te = new TextEncoder();
  var td = new TextDecoder();
  var ITER = 210000;

  function b64encode(bytes) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function b64decode(str) {
    var bin = atob(str), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }
  function hex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }
  function randomHex(n) {
    var b = new Uint8Array(n);
    crypto.getRandomValues(b);
    return hex(b);
  }
  function kdfBits(secret, salt) {
    return crypto.subtle.importKey("raw", te.encode(secret), "PBKDF2", false, ["deriveBits"])
      .then(function (km) {
        return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: te.encode(salt), iterations: ITER }, km, 256);
      })
      .then(function (bits) { return new Uint8Array(bits); });
  }
  function importAesKey(raw) {
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  function aesEncrypt(plain, key) {
    var iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, te.encode(plain)).then(function (ct) {
      var c = new Uint8Array(ct), out = new Uint8Array(12 + c.length);
      out.set(iv, 0); out.set(c, 12);
      return b64encode(out);
    });
  }
  function aesDecrypt(b64, key) {
    var buf = b64decode(b64);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12)).then(function (pt) {
      return td.decode(pt);
    });
  }
  function constEq(a, b) {
    if (a.length !== b.length) return false;
    var r = 0;
    for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
  }

  /* ---------- auth state ---------- */
  var SEC_KEY = "__security__";       // security record (never enters the v: namespace)
  var masterRaw = null;               // Uint8Array(32) while unlocked
  var masterKey = null;               // CryptoKey while unlocked

  function loadSecurity() {
    return idbGet(SEC_KEY).then(function (s) { return s ? JSON.parse(s) : null; });
  }
  function saveSecurity(s) {
    return s ? idbSet(SEC_KEY, JSON.stringify(s)) : idbDel(SEC_KEY);
  }
  function deriveFor(pw, salt) {
    return Promise.all([kdfBits(pw, salt + ":key"), kdfBits(pw, salt + ":chk")]).then(function (r) {
      return { keyRaw: r[0], verifier: hex(r[1]) };
    });
  }
  function verifyPassword(pw) {
    return loadSecurity().then(function (s) {
      if (!s) return null;
      return deriveFor(pw, s.salt).then(function (d) {
        return constEq(d.verifier, s.verifier) ? d.keyRaw : null;
      });
    });
  }

  /* ---------- value layer: "pwd:" AES-GCM when a password is set, else "raw:" ---------- */
  function encodeValue(value) {
    if (masterKey) return aesEncrypt(String(value), masterKey).then(function (b) { return "pwd:" + b; });
    return Promise.resolve("raw:" + String(value));
  }
  function decodeValue(payload) {
    if (payload == null) return Promise.resolve(null);
    if (payload.indexOf("pwd:") === 0) {
      if (!masterKey) return Promise.reject(new Error("locked"));
      return aesDecrypt(payload.slice(4), masterKey);
    }
    if (payload.indexOf("raw:") === 0) return Promise.resolve(payload.slice(4));
    return Promise.resolve(payload);
  }
  function dataKeys() {
    return idbKeys().then(function (keys) {
      return keys.filter(function (k) { return typeof k === "string" && k.indexOf("v:") === 0; })
        .map(function (k) { return k.slice(2); });
    });
  }
  function rewrapAll(oldRaw, newRaw) {
    // re-encrypt every stored value from the old key layer to the new one
    var oldKeyP = oldRaw ? importAesKey(oldRaw) : Promise.resolve(null);
    var newKeyP = newRaw ? importAesKey(newRaw) : Promise.resolve(null);
    return Promise.all([oldKeyP, newKeyP, dataKeys()]).then(function (r) {
      var oldKey = r[0], newKey = r[1], keys = r[2];
      var chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          return idbGet("v:" + k).then(loadPayload).then(function (payload) {
            if (payload == null) return null;
            var plainP;
            if (payload.indexOf("pwd:") === 0) {
              if (!oldKey) throw new Error("locked");
              plainP = aesDecrypt(payload.slice(4), oldKey);
            } else if (payload.indexOf("raw:") === 0) plainP = Promise.resolve(payload.slice(4));
            else plainP = Promise.resolve(payload);
            return plainP.then(function (plain) {
              if (plain == null) return null;
              if (newKey) return aesEncrypt(plain, newKey).then(function (b) { return storePayload(k, "pwd:" + b); });
              return storePayload(k, "raw:" + plain);
            });
          });
        });
      });
      return chain;
    });
  }
  function setMaster(raw) {
    masterRaw = raw;
    if (!raw) { masterKey = null; return Promise.resolve(); }
    return importAesKey(raw).then(function (k) { masterKey = k; });
  }

  /* ---------- window.storage ---------- */
  window.storage = {
    get: function (key) {
      return idbGet("v:" + key).then(loadPayload).then(decodeValue).then(function (value) {
        if (value === null || value === undefined) throw new Error("key not found: " + key);
        return { key: key, value: value };
      });
    },
    set: function (key, value) {
      return loadSecurity().then(function (s) {
        if (s && !masterKey) throw new Error("locked");
        return encodeValue(value);
      }).then(function (payload) {
        return storePayload(key, payload);
      }).then(function () { return { key: key, value: value }; });
    },
    delete: function (key) {
      // gated like set: a locked vault that can still lose records is not locked
      return loadSecurity().then(function (s) {
        if (s && !masterKey) throw new Error("locked");
        return idbGet("v:" + key).then(function (stored) {
          return dropPayloadFile(stored).then(function () { return idbDel("v:" + key); });
        });
      }).then(function () { return { key: key, deleted: true }; });
    },
    list: function (prefix) {
      return dataKeys().then(function (keys) {
        return { keys: keys.filter(function (k) { return !prefix || k.indexOf(prefix) === 0; }), prefix: prefix };
      });
    },
  };

  /* ---------- window.auth (same contract as the desktop build) ---------- */
  window.auth = {
    status: function () {
      return loadSecurity().then(function (s) {
        return { passwordSet: !!s, pinSet: !!(s && s.pinBlob), locked: !!s && !masterKey };
      });
    },
    setPassword: function (pw) {
      return loadSecurity().then(function (s) {
        if (s) return { ok: false, error: "Password already set" };
        if (!pw || pw.length < 8) return { ok: false, error: "Use at least 8 characters" };
        var salt = randomHex(16);
        return deriveFor(pw, salt).then(function (d) {
          /* Security record first, then re-encrypt. Interrupted the other way
             round — a closed tab, a crash — the values are already encrypted
             but nothing records the salt they were encrypted under, and they
             cannot be read again by anyone. This order leaves stragglers as
             "raw:", which still decode and get encrypted on their next write. */
          return saveSecurity({ salt: salt, verifier: d.verifier }).then(function () {
            return setMaster(d.keyRaw);
          }).then(function () {
            return rewrapAll(null, d.keyRaw);
          }).then(function () { return { ok: true }; });
        });
      });
    },
    changePassword: function (oldPw, newPw) {
      return verifyPassword(oldPw).then(function (oldRaw) {
        if (!oldRaw) return { ok: false, error: "Current password is incorrect" };
        if (!newPw || newPw.length < 8) return { ok: false, error: "Use at least 8 characters" };
        var salt = randomHex(16);
        return deriveFor(newPw, salt).then(function (d) {
          return rewrapAll(oldRaw, d.keyRaw).then(function () {
            return saveSecurity({ salt: salt, verifier: d.verifier }); // PIN invalidated
          }).then(function () {
            return setMaster(d.keyRaw);
          }).then(function () { return { ok: true }; });
        });
      });
    },
    removePassword: function (pw) {
      return verifyPassword(pw).then(function (raw) {
        if (!raw) return { ok: false, error: "Password is incorrect" };
        return rewrapAll(raw, null).then(function () {
          return saveSecurity(null);
        }).then(function () {
          return setMaster(null);
        }).then(function () { return { ok: true }; });
      });
    },
    unlockPassword: function (pw) {
      return verifyPassword(pw).then(function (raw) {
        if (!raw) return { ok: false, error: "That password doesn't match" };
        return setMaster(raw).then(function () { return { ok: true }; });
      });
    },
    setPin: function (pw, pin) {
      return verifyPassword(pw).then(function (raw) {
        if (!raw) return { ok: false, error: "Password is incorrect" };
        if (!pin || pin.length < 4) return { ok: false, error: "PIN needs at least 4 digits" };
        return loadSecurity().then(function (s) {
          s.pinSalt = randomHex(16);
          return kdfBits(pin, s.pinSalt + ":pin").then(importAesKey).then(function (pinKey) {
            return aesEncrypt(b64encode(raw), pinKey);
          }).then(function (blob) {
            s.pinBlob = blob;
            return saveSecurity(s);
          }).then(function () { return { ok: true }; });
        });
      });
    },
    removePin: function (pw) {
      return verifyPassword(pw).then(function (raw) {
        if (!raw) return { ok: false, error: "Password is incorrect" };
        return loadSecurity().then(function (s) {
          delete s.pinBlob; delete s.pinSalt;
          return saveSecurity(s);
        }).then(function () { return { ok: true }; });
      });
    },
    unlockPin: function (pin) {
      return loadSecurity().then(function (s) {
        if (!s || !s.pinBlob) return { ok: false, error: "No PIN is set" };
        return kdfBits(pin, s.pinSalt + ":pin").then(importAesKey).then(function (pinKey) {
          return aesDecrypt(s.pinBlob, pinKey); // GCM auth tag rejects wrong PINs
        }).then(function (rawB64) {
          return setMaster(b64decode(rawB64)).then(function () { return { ok: true }; });
        }).catch(function () { return { ok: false, error: "That PIN doesn't match" }; });
      });
    },
    lock: function () {
      return setMaster(null).then(function () { return { ok: true }; });
    },
  };

  window.vaultInfo = {
    encrypted: function () {
      return loadSecurity().then(function (s) {
        return { dpapi: false, password: !!s, web: true };
      });
    },
  };
  window.vaultPlatform = "web";
})();
