const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recovery", {
  state: () => ipcRenderer.invoke("health:state"),
  rollback: () => ipcRenderer.invoke("health:rollback"),
  retry: () => ipcRenderer.invoke("health:retry"),
  openLogs: () => ipcRenderer.invoke("health:open-logs"),
  quit: () => ipcRenderer.invoke("health:quit"),
  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("health:progress", handler);
    return () => ipcRenderer.removeListener("health:progress", handler);
  },
});
