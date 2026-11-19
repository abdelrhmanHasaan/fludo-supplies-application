// Ensure ELECTRON_RUN_AS_NODE is deleted from environment
delete process.env.ELECTRON_RUN_AS_NODE;

import { app, BrowserWindow, ipcMain, utilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';

let mainWindow: BrowserWindow | null = null;
let apiProcess: any = null;
let pgProcess: ChildProcess | null = null;

// Helper to check if a local TCP port is open
function checkPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

// Health check for local Fastify API
function checkApiHealth(port = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Start PostgreSQL if port 5433 is not already listening
async function ensureDatabase() {
  const isDbListening = await checkPortOpen(5433);
  if (isDbListening) {
    console.log('[DESKTOP] PostgreSQL is already listening on port 5433.');
    return;
  }

  // Look for PostgreSQL installation candidates
  const appPath = app.getAppPath();
  const pgExeCandidates = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\postgres.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe',
    path.join(process.resourcesPath || '', 'pgsql', 'bin', 'postgres.exe'),
    path.resolve(appPath, '../../data/pgsql/bin/postgres.exe'),
  ];
  const pgExe = pgExeCandidates.find((p) => fs.existsSync(p));

  const pgDataCandidates = [
    path.resolve(__dirname, '../../../data/pgdata'),
    path.resolve(appPath, '../../data/pgdata'),
    path.join(process.resourcesPath || '', 'data', 'pgdata'),
    'C:\\ProgramData\\FludoSuppliesERP\\pgdata',
  ];
  const pgData = pgDataCandidates.find((p) => fs.existsSync(p));

  if (pgExe && pgData) {
    console.log(`[DESKTOP] Starting PostgreSQL engine: ${pgExe} with data: ${pgData}`);
    try {
      pgProcess = spawn(pgExe, ['-D', pgData, '-p', '5433'], {
        detached: false,
        stdio: 'ignore',
        windowsHide: true,
      });

      // Wait with backoff up to 60 seconds for DB to accept connections
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await checkPortOpen(5433)) {
          console.log('[DESKTOP] PostgreSQL successfully listening on port 5433.');
          break;
        }
      }
    } catch (err) {
      console.warn('[DESKTOP] Could not auto-spawn PostgreSQL process:', err);
    }
  } else {
    console.log('[DESKTOP] Checking system PostgreSQL service on port 5433...');
    for (let i = 0; i < 30; i++) {
      if (await checkPortOpen(5433)) {
        console.log('[DESKTOP] PostgreSQL service detected and accepting connections.');
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Start backend API if not already listening
async function ensureApiServer() {
  const isHealthy = await checkApiHealth(4000);
  if (isHealthy) {
    console.log('[DESKTOP] API server is already healthy on port 4000.');
    return;
  }

  const appPath = app.getAppPath();
  const apiCandidates = [
    path.join(appPath, 'api', 'index.js'),
    path.join(__dirname, '../api/index.js'),
    path.join(__dirname, 'api/index.js'),
    path.resolve(__dirname, '../../services/api/dist/index.js'),
  ];
  const targetScript = apiCandidates.find((p) => fs.existsSync(p));

  if (targetScript) {
    console.log(`[DESKTOP] Launching backend API from: ${targetScript}`);

    const apiEnv = {
      ...process.env,
      PORT: '4000',
      PGPORT: '5433',
      NODE_ENV: 'production',
    };

    try {
      if (typeof utilityProcess !== 'undefined' && utilityProcess.fork) {
        apiProcess = utilityProcess.fork(targetScript, [], {
          env: apiEnv,
          stdio: 'inherit',
        });
      } else {
        const { fork } = await import('node:child_process');
        apiProcess = fork(targetScript, [], {
          env: apiEnv,
          stdio: 'inherit',
        });
      }

      // Wait up to 30 seconds for API to be ready
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (await checkApiHealth(4000)) {
          console.log('[DESKTOP] Backend API is ready on port 4000.');
          break;
        }
      }
    } catch (err) {
      console.error('[DESKTOP] Failed to fork backend API:', err);
    }
  } else {
    console.warn('[DESKTOP] API script bundle not found in candidate paths.');
  }
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'شركة الرضا للتوريدات — Fludo ERP',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.maximize();

  const isDev = process.env.NODE_ENV === 'development';
  const appPath = app.getAppPath();
  const packagedUiPath = path.join(appPath, 'ui', 'index.html');
  const localUiDistPath = path.resolve(__dirname, '../../ui/dist/index.html');

  console.log('[DESKTOP] appPath:', appPath);
  console.log('[DESKTOP] packagedUiPath:', packagedUiPath, 'exists:', fs.existsSync(packagedUiPath));

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000');
  } else if (fs.existsSync(packagedUiPath)) {
    console.log('[DESKTOP] Loading UI from packaged file:', packagedUiPath);
    mainWindow.loadFile(packagedUiPath);
  } else if (fs.existsSync(localUiDistPath)) {
    console.log('[DESKTOP] Loading UI from local dist file:', localUiDistPath);
    mainWindow.loadFile(localUiDistPath);
  } else {
    console.log('[DESKTOP] Falling back to URL http://127.0.0.1:3000');
    mainWindow.loadURL('http://127.0.0.1:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[DESKTOP] Failed to load URL: ${validatedURL} (Code: ${errorCode}, Desc: ${errorDescription})`);
  });

  // F12 to toggle DevTools if needed
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await ensureDatabase();
  await ensureApiServer();
  createWindow();

  ipcMain.on('print-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.print({ silent: false, printBackground: true });
    }
  });

  ipcMain.handle('get-app-version', () => app.getVersion());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  if (apiProcess) {
    try {
      if (typeof apiProcess.kill === 'function') apiProcess.kill();
    } catch {}
  }
  if (pgProcess) {
    try {
      pgProcess.kill();
    } catch {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
