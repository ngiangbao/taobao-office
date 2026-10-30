const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('splash', {
  version: () => ipcRenderer.invoke('app:version'),
  onMessage: (cb) => ipcRenderer.on('splash:msg', (_, t) => cb(t)),
});
