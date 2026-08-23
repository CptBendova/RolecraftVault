const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("storage", {
  get: async (key) => {
    const value = await ipcRenderer.invoke("vault-get", key);
    if (value === null || value === undefined) throw new Error("key not found: " + key);
    return { key, value };
  },
  set: async (key, value) => { await ipcRenderer.invoke("vault-set", key, value); return { key, value }; },
  delete: async (key) => { await ipcRenderer.invoke("vault-delete", key); return { key, deleted: true }; },
  list: async (prefix) => ({ keys: await ipcRenderer.invoke("vault-list", prefix || ""), prefix }),
});

contextBridge.exposeInMainWorld("auth", {
  status: () => ipcRenderer.invoke("auth-status"),
  setPassword: (pw) => ipcRenderer.invoke("auth-set-password", pw),
  changePassword: (o, n) => ipcRenderer.invoke("auth-change-password", o, n),
  removePassword: (pw) => ipcRenderer.invoke("auth-remove-password", pw),
  unlockPassword: (pw) => ipcRenderer.invoke("auth-unlock-password", pw),
  setPin: (pw, pin) => ipcRenderer.invoke("auth-set-pin", pw, pin),
  removePin: (pw) => ipcRenderer.invoke("auth-remove-pin", pw),
  unlockPin: (pin) => ipcRenderer.invoke("auth-unlock-pin", pin),
  lock: () => ipcRenderer.invoke("auth-lock"),
});

contextBridge.exposeInMainWorld("transfer", {
  start: () => ipcRenderer.invoke("transfer-start"),
  stop: () => ipcRenderer.invoke("transfer-stop"),
  status: () => ipcRenderer.invoke("transfer-status"),
  receive: (code, replace) => ipcRenderer.invoke("transfer-receive", code, replace),
  // read-only: reports what a sync would do to this device, changes nothing
  preview: (code, replace) => ipcRenderer.invoke("transfer-preview", code, replace),
  /* Progress ticks while a preview or a sync is running. Returns the
     unsubscribe, and only the payload is passed on — never the IPC event, which
     would hand the renderer a way back into the bridge. */
  onProgress: (cb) => {
    const h = (_e, payload) => { try { cb(payload); } catch (err) {} };
    ipcRenderer.on("transfer-progress", h);
    return () => ipcRenderer.removeListener("transfer-progress", h);
  },
  /* The other device is asking whether it may mirror from this one. The reply
     goes back by id, so an answer cannot land on a different question. */
  onMirrorRequest: (cb) => {
    const h = (_e, payload) => { try { cb(payload); } catch (err) {} };
    ipcRenderer.on("transfer-mirror-request", h);
    return () => ipcRenderer.removeListener("transfer-mirror-request", h);
  },
  respondMirror: (id, decision) => ipcRenderer.invoke("transfer-mirror-respond", id, decision),
});
contextBridge.exposeInMainWorld("updater", {
  status: () => ipcRenderer.invoke("updates-status"),
  install: (text) => ipcRenderer.invoke("updates-install", text),
  revert: () => ipcRenderer.invoke("updates-revert"),
  relaunch: () => ipcRenderer.invoke("updates-relaunch"),
});
/* The window's own shape. Read only apart from full screen, which the Settings
   panel offers because a full screen window has no title bar to close from. */
contextBridge.exposeInMainWorld("win", {
  state: () => ipcRenderer.invoke("window-state"),
  setFullScreen: on => ipcRenderer.invoke("window-fullscreen", !!on),
  onChange: cb => {
    const h = (e, s) => cb(s);
    ipcRenderer.on("window-state", h);
    return () => ipcRenderer.removeListener("window-state", h);
  }
});
contextBridge.exposeInMainWorld("vaultInfo", {
  encrypted: () => ipcRenderer.invoke("vault-encrypted"),
});
