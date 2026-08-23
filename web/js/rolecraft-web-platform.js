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

  /* Pictures and other large records on Android live as encrypted files in
     the app's private vault folder (Directory.DATA/vault/), not as strings
     inside IndexedDB or the WebView. IDB only holds a pointer and a short
     fingerprint. The native bridge tops out around 1 MB, so reads and writes
     go in small binary chunks. Builds from 1.168–1.171 wrote UTF-8 under kv/;
     those still load. The browser edition has no Filesystem plugin and stays
     on IndexedDB. */
  var FILE_MARK = "file:";
  var BIN_MARK = "bin:";
  var FS_DIR = "DATA";
  var FS_CHUNK = 512 * 1024;
  var BIN_CHUNK = 384 * 1024;
  var FS_LARGE = 16 * 1024;
  var VAULT_DIR = "vault/";
  var WRAP_KEY_ID = "__wrap__";
  var wrapKey = null;
  function nativeFs() {
    var C = window.Capacitor;
    return C && typeof C.nativePromise === "function" ? C : null;
  }
  function fsCall(method, opts) {
    return nativeFs().nativePromise("Filesystem", method, opts);
  }
  var vaultReady = null;
  function ensureVaultDir() {
    if (vaultReady) return vaultReady;
    if (!nativeFs()) return Promise.resolve();
    vaultReady = fsCall("requestPermissions", {}).catch(function () { return true; }).then(function () {
      return fsCall("mkdir", { path: "vault", directory: FS_DIR, recursive: true });
    }).catch(function () { return true; });
    return vaultReady;
  }
  function vaultPath(key) {
    return VAULT_DIR + encodeURIComponent(key);
  }
  function filePointerPath(stored) {
    if (typeof stored !== "string") return null;
    if (stored.indexOf(BIN_MARK) === 0) return stored.slice(BIN_MARK.length);
    if (stored.indexOf(FILE_MARK) === 0) return stored.slice(FILE_MARK.length);
    return null;
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
    var path = filePointerPath(stored);
    if (!path || !nativeFs()) return Promise.resolve();
    return fsCall("deleteFile", {
      path: path, directory: FS_DIR
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
  function sha16plain(text) {
    return crypto.subtle.digest("SHA-256", te.encode(String(text))).then(function (d) {
      return hex(new Uint8Array(d)).slice(0, 16);
    });
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

  function encryptBytes(plainBytes, key) {
    var iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plainBytes).then(function (ct) {
      var c = new Uint8Array(ct), out = new Uint8Array(5 + 12 + c.length);
      out[0] = 82; out[1] = 67; out[2] = 86; out[3] = 83; out[4] = 49; // RCVS1
      out.set(iv, 5);
      out.set(c, 17);
      return out;
    });
  }
  function decryptBytes(buf, key) {
    if (!buf || buf.length < 33) return Promise.reject(new Error("truncated vault file"));
    if (buf[0] !== 82 || buf[1] !== 67 || buf[2] !== 86 || buf[3] !== 83 || buf[4] !== 49) {
      return Promise.reject(new Error("not a vault file"));
    }
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buf.subarray(5, 17) },
      key,
      buf.subarray(17)
    ).then(function (pt) { return new Uint8Array(pt); });
  }
  function writeBin(path, bytes) {
    var off = 0, first = true;
    function next() {
      if (off >= bytes.length) return Promise.resolve();
      var n = Math.min(BIN_CHUNK, bytes.length - off);
      var b64 = b64encode(bytes.subarray(off, off + n));
      off += n;
      var method = first ? "writeFile" : "appendFile";
      first = false;
      return fsCall(method, { path: path, data: b64, directory: FS_DIR, recursive: true }).then(next);
    }
    return next();
  }
  function readBin(path) {
    return fsCall("stat", { path: path, directory: FS_DIR }).then(function (st) {
      var size = st.size || 0, buf = new Uint8Array(size), off = 0;
      function more() {
        if (off >= size) return buf;
        var n = Math.min(BIN_CHUNK, size - off);
        return fsCall("readFile", { path: path, directory: FS_DIR, offset: off, length: n }).then(function (r) {
          var piece = b64decode(r.data || "");
          buf.set(piece, off);
          off += piece.length;
          return more();
        });
      }
      return more();
    });
  }
  function ensureWrapKey() {
    if (wrapKey) return Promise.resolve(wrapKey);
    if (!nativeFs()) return Promise.resolve(null);
    return idbGet(WRAP_KEY_ID).then(function (s) {
      var raw;
      if (typeof s === "string" && s.length) {
        raw = b64decode(s);
        return importAesKey(raw).then(function (k) { wrapKey = k; return k; });
      }
      raw = new Uint8Array(32);
      crypto.getRandomValues(raw);
      return idbSet(WRAP_KEY_ID, b64encode(raw)).then(function () {
        return importAesKey(raw).then(function (k) { wrapKey = k; return k; });
      });
    });
  }
  /* Files are sealed with the password key when one is set, otherwise with a
     device wrap key. Do not fall back to masterKey here: rewrapAll runs while
     masterKey has already moved, and must decrypt with the key it was given. */
  function sealKey(explicit) {
    return explicit || wrapKey;
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
  function decodeWith(payload, key) {
    if (payload == null) return Promise.resolve(null);
    if (payload.indexOf("pwd:") === 0) {
      if (!key) return Promise.reject(new Error("locked"));
      return aesDecrypt(payload.slice(4), key);
    }
    if (payload.indexOf("raw:") === 0) return Promise.resolve(payload.slice(4));
    return Promise.resolve(payload);
  }
  function decodeValue(payload) {
    return decodeWith(payload, masterKey);
  }
  function dataKeys() {
    return idbKeys().then(function (keys) {
      return keys.filter(function (k) { return typeof k === "string" && k.indexOf("v:") === 0; })
        .map(function (k) { return k.slice(2); });
    });
  }
  function plainFromStored(stored, aesKey) {
    if (stored == null) return Promise.resolve(null);
    if (typeof stored === "string" && stored.indexOf(BIN_MARK) === 0) {
      var k = sealKey(aesKey);
      if (!k) return Promise.reject(new Error("locked"));
      return readBin(stored.slice(BIN_MARK.length)).then(function (bin) {
        return decryptBytes(bin, k).then(function (pt) { return td.decode(pt); });
      });
    }
    return loadPayload(stored).then(function (payload) { return decodeWith(payload, aesKey); });
  }
  /* Remember the fingerprint, then write. Large values on Android become one
     encrypted file under vault/; IDB only stores the pointer. Small values stay
     in IDB as pwd:/raw: the way the browser edition always has. */
  function putPlain(key, plain, aesKey) {
    var text = String(plain);
    function remember() {
      return sha16plain(text).then(function (h) { return idbSet("h:" + key, h); });
    }
    return idbGet("v:" + key).then(dropPayloadFile).then(function () {
      if (nativeFs() && text.length > FS_LARGE) {
        var k = sealKey(aesKey);
        if (!k) return Promise.reject(new Error("locked"));
        return encryptBytes(te.encode(text), k).then(function (bin) {
          var path = vaultPath(key);
          return writeBin(path, bin).then(function () {
            return idbSet("v:" + key, BIN_MARK + path);
          });
        });
      }
      var payloadP = aesKey
        ? aesEncrypt(text, aesKey).then(function (b) { return "pwd:" + b; })
        : Promise.resolve("raw:" + text);
      return payloadP.then(function (payload) { return idbSet("v:" + key, payload); });
    }).then(remember);
  }
  function hashUtf8File(path) {
    /* Old 1.168–1.171 files are UTF-8 of "raw:"+dataURL. Read as bytes so we
       never build the JavaScript string (UTF-16, twice the RAM) just to hash. */
    return readBin(path).then(function (buf) {
      if (buf.length >= 4 && buf[0] === 114 && buf[1] === 97 && buf[2] === 119 && buf[3] === 58) {
        return crypto.subtle.digest("SHA-256", buf.subarray(4)).then(function (d) {
          return hex(new Uint8Array(d)).slice(0, 16);
        });
      }
      return decodeValue(td.decode(buf)).then(function (v) {
        return v == null ? null : sha16plain(v);
      });
    }).catch(function () { return null; });
  }
  function hashStored(stored) {
    if (typeof stored === "string" && stored.indexOf(BIN_MARK) === 0) {
      return ensureWrapKey().then(function () {
        return plainFromStored(stored, masterKey);
      }).then(function (v) {
        return v == null ? null : sha16plain(v);
      });
    }
    if (typeof stored === "string" && stored.indexOf(FILE_MARK) === 0) {
      return hashUtf8File(stored.slice(FILE_MARK.length));
    }
    return decodeValue(stored).then(function (v) {
      return v == null ? null : sha16plain(v);
    });
  }
  function rewrapAll(oldRaw, newRaw) {
    var oldKeyP = oldRaw ? importAesKey(oldRaw) : Promise.resolve(null);
    var newKeyP = newRaw ? importAesKey(newRaw) : Promise.resolve(null);
    return Promise.all([oldKeyP, newKeyP, dataKeys(), ensureWrapKey()]).then(function (r) {
      var oldKey = r[0], newKey = r[1], keys = r[2];
      var chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          return idbGet("v:" + k).then(function (stored) {
            return plainFromStored(stored, oldKey).then(function (plain) {
              if (plain == null) return null;
              return putPlain(k, plain, newKey);
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
      return loadSecurity().then(function (s) {
        if (s && !masterKey) throw new Error("locked");
        return ensureWrapKey();
      }).then(function () {
        return idbGet("v:" + key);
      }).then(function (stored) {
        if (stored == null) throw new Error("key not found: " + key);
        return plainFromStored(stored, masterKey);
      }).then(function (value) {
        if (value === null || value === undefined) throw new Error("key not found: " + key);
        return { key: key, value: value };
      });
    },
    set: function (key, value) {
      return loadSecurity().then(function (s) {
        if (s && !masterKey) throw new Error("locked");
        return ensureWrapKey();
      }).then(function () {
        return ensureVaultDir();
      }).then(function () {
        return putPlain(key, value, masterKey);
      }).then(function () { return { key: key, value: value }; });
    },
    delete: function (key) {
      // gated like set: a locked vault that can still lose records is not locked
      return loadSecurity().then(function (s) {
        if (s && !masterKey) throw new Error("locked");
        return idbGet("v:" + key).then(function (stored) {
          return dropPayloadFile(stored).then(function () {
            return Promise.all([idbDel("v:" + key), idbDel("h:" + key)]);
          });
        });
      }).then(function () { return { key: key, deleted: true }; });
    },
    /* Tiny 16-char fingerprint. Used by a phone copy to skip records already
       here without reading every picture off disk again. Written when a value
       is saved; computed once and remembered if an older copy is missing it.
       Never loads the whole picture into the interface just to hash it. */
    hash: function (key) {
      return idbGet("h:" + key).then(function (h) {
        if (typeof h === "string" && h.length === 16) return h;
        return ensureWrapKey().then(function () { return idbGet("v:" + key); }).then(function (stored) {
          if (stored == null) return null;
          return hashStored(stored).then(function (nh) {
            if (!nh) return null;
            return idbSet("h:" + key, nh).then(function () { return nh; });
          });
        }).catch(function () { return null; });
      });
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
