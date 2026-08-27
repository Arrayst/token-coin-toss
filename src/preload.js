'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tct', {
  platform: process.platform,
  getState: () => ipcRenderer.invoke('get-state'),
  rescan: () => ipcRenderer.invoke('rescan'),
  bet: (choice, amount) => ipcRenderer.invoke('bet', { choice, amount }),
  hidePanel: () => ipcRenderer.invoke('hide-panel'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
});
