'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('naruDesktop', Object.freeze({
  platform: process.platform,
  chooseDirectory: () => ipcRenderer.invoke('naru:choose-directory'),
  revealPath: (path) => ipcRenderer.invoke('naru:reveal-path', path),
  openPath: (path) => ipcRenderer.invoke('naru:open-path', path),
  openExternal: (url) => ipcRenderer.invoke('naru:open-external', url),
  setTheme: (theme) => ipcRenderer.invoke('naru:set-theme', theme),
  getPreference: (key) => ipcRenderer.sendSync('naru:get-preference', key),
  setPreference: (key, value) => ipcRenderer.sendSync('naru:set-preference', key, value),
  version: () => ipcRenderer.invoke('naru:version')
}));
