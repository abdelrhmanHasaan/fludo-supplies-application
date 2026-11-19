import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  print: () => ipcRenderer.send('print-window'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  platform: process.platform,
});

