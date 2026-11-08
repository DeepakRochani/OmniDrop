const { contextBridge, ipcRenderer } = require('electron');

// Expose safe native Desktop APIs to OmniDrop Web Client
contextBridge.exposeInMainWorld('electronAPI', {
  acquireWakeLock: () => ipcRenderer.invoke('acquire-wake-lock'),
  releaseWakeLock: () => ipcRenderer.invoke('release-wake-lock'),
  isDesktop: true
});

