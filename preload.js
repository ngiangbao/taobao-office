const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (c) => ipcRenderer.invoke('cfg:set', c),
  send: (text, files) => ipcRenderer.invoke('chat:send', { text, files }),
  stop: () => ipcRenderer.invoke('chat:stop'),
  reset: () => ipcRenderer.invoke('chat:reset'),
  saveFile: (name, data) => ipcRenderer.invoke('file:save', { name, data }),
  openLogin: () => ipcRenderer.invoke('login:open'),
  openData: () => ipcRenderer.invoke('log:open'),
  onEvent: (cb) => ipcRenderer.on('claude:event', (_, ev) => cb(ev)),
});
