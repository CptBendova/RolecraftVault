const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("setup", {
  info: () => ipcRenderer.invoke("setup-info"),
  pickDir: () => ipcRenderer.invoke("setup-pick-dir"),
  install: (dir) => ipcRenderer.invoke("setup-install", dir),
  launch: () => ipcRenderer.invoke("setup-launch"),
  quit: () => ipcRenderer.invoke("setup-quit"),
  onProgress: (cb) => {
    const h = (_e, payload) => { try { cb(payload); } catch (err) {} };
    ipcRenderer.on("setup-progress", h);
    return () => ipcRenderer.removeListener("setup-progress", h);
  }
});
