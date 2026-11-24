import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  print: () => ipcRenderer.send('print-window'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  openLogsFolder: () => ipcRenderer.send('open-logs-folder'),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),
  restoreLatestBackup: () => ipcRenderer.invoke('restore-latest-backup'),
  retryStartup: () => ipcRenderer.send('retry-startup'),
  onStartupProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('startup-progress', (_event, value) => callback(value));
  },
  onStartupError: (callback: (data: any) => void) => {
    ipcRenderer.on('startup-error', (_event, value) => callback(value));
  },
  platform: process.platform,
});
