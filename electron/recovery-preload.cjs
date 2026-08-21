const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recovery", {
  state: () => ipcRenderer.invoke("health:state"),
  rollback: () => ipcRenderer.invoke("health:rollback"),
  retry: () => ipcRenderer.invoke("health:retry"),
  resumeUpdates: () => ipcRenderer.invoke("health:resume-updates"),
  openLogs: () => ipcRenderer.invoke("health:open-logs"),
  collectDiagnostics: () => ipcRenderer.invoke("health:collect-diagnostics"),
  quit: () => ipcRenderer.invoke("health:quit"),
  onProgress: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("health:progress", handler);
    return () => ipcRenderer.removeListener("health:progress", handler);
  },
});
