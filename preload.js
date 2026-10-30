const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (c) => ipcRenderer.invoke('cfg:set', c),
  listAgents: () => ipcRenderer.invoke('agents:list'),
  addAgent: (d) => ipcRenderer.invoke('agents:add', d),
  removeAgent: (id) => ipcRenderer.invoke('agents:remove', id),
  resetAgent: (id) => ipcRenderer.invoke('agents:reset', id),
  stopAll: () => ipcRenderer.invoke('agents:stop'),
  onAgents: (cb) => ipcRenderer.on('agents:update', (_, a) => cb(a)),
  openLogin: () => ipcRenderer.invoke('login:open'),
  version: () => ipcRenderer.invoke('app:version'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_, u) => cb(u)),
  officeUrl: () => ipcRenderer.invoke('office:url'),
  onOfficeReady: (cb) => ipcRenderer.on('office:ready', (_, u) => cb(u)),
  historyQuery: (o) => ipcRenderer.invoke('history:query', o),
  openHistoryDir: () => ipcRenderer.invoke('history:open'),
  openData: () => ipcRenderer.invoke('log:open'),
});
