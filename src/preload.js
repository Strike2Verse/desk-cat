const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskCat', {
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  getCursorPoint: () => ipcRenderer.invoke('get-cursor-point'),
  getScreenMetrics: () => ipcRenderer.invoke('get-screen-metrics'),
  getSurfaces: () => ipcRenderer.invoke('get-surfaces'),
  showCatMenu: () => ipcRenderer.send('show-cat-menu'),
  onPet: (callback) => ipcRenderer.on('pet', () => callback()),
  onSetEnabled: (callback) =>
    ipcRenderer.on('set-enabled', (_event, value) => callback(value)),

  // Cat girl.
  getGirlSettings: () => ipcRenderer.invoke('get-girl-settings'),
  showGirlMenu: (state) => ipcRenderer.send('show-girl-menu', state),
  girlOutfitChanged: (name) => ipcRenderer.send('girl-outfit-changed', name),
  onGirlCommand: (callback) =>
    ipcRenderer.on('girl-command', (_event, cmd) => callback(cmd)),
  onGirlSettings: (callback) =>
    ipcRenderer.on('girl-settings', (_event, settings) => callback(settings)),
});
