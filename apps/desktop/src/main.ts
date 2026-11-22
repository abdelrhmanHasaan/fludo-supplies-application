// Ensure ELECTRON_RUN_AS_NODE is deleted from environment
delete process.env.ELECTRON_RUN_AS_NODE;

import { app, BrowserWindow, ipcMain, utilityProcess, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync, execSync, ChildProcess } from 'node:child_process';

let safeDirs: { baseDir: string; dataDir: string; logsDir: string } | null = null;

// Safe ASCII Path Resolver (Requirement 2b - Never non-ASCII/Arabic usernames)
function resolveSafeAsciiDir(): { baseDir: string; dataDir: string; logsDir: string } {
  // 1. Primary: C:\ProgramData\FludoSuppliesERP (Standard Windows shared ASCII path)
  const progData = process.env.ProgramData || 'C:\\ProgramData';
  const cand1 = path.join(progData, 'FludoSuppliesERP');
  try {
    fs.mkdirSync(cand1, { recursive: true });
    const testFile = path.join(cand1, 'perm.tmp');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return {
      baseDir: cand1,
      dataDir: path.join(cand1, 'data'),
      logsDir: path.join(cand1, 'logs'),
    };
  } catch {}

  // 2. Secondary: Windows 8.3 Short ASCII Path of LOCALAPPDATA
  try {
    const localApp = process.env.LOCALAPPDATA || 'C:\\';
    const shortLocal = execSync(`cmd /c for %I in ("${localApp}") do @echo %~sI`, { encoding: 'utf8' }).trim();
    if (shortLocal) {
      const cand2 = path.join(shortLocal, 'FludoERP');
      fs.mkdirSync(cand2, { recursive: true });
      return {
        baseDir: cand2,
        dataDir: path.join(cand2, 'data'),
        logsDir: path.join(cand2, 'logs'),
      };
    }
  } catch {}

  // 3. Fallback: C:\FludoERP
  const cand3 = 'C:\\FludoERP';
  fs.mkdirSync(cand3, { recursive: true });
  return {
    baseDir: cand3,
    dataDir: path.join(cand3, 'data'),
    logsDir: path.join(cand3, 'logs'),
  };
}

// Persistent logger
function logDesktop(msg: string) {
  try {
    if (!safeDirs) safeDirs = resolveSafeAsciiDir();
    if (!fs.existsSync(safeDirs.logsDir)) fs.mkdirSync(safeDirs.logsDir, { recursive: true });
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(safeDirs.logsDir, 'desktop.log'), line, 'utf8');
  } catch {}
  console.log(msg);
}

// Global Exception Trap
process.on('uncaughtException', (err: any) => {
  logDesktop(`[FATAL UNCAUGHT] ${err?.stack || err?.message || err}`);
});
process.on('unhandledRejection', (reason: any) => {
  logDesktop(`[FATAL REJECTION] ${reason?.stack || reason?.message || reason}`);
});

logDesktop(`=== APP LAUNCH (PID: ${process.pid}, version: 1.4.0) ===`);

// 1. Single Instance Lock (Requirement 4)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  logDesktop('[INSTANCE] Secondary instance detected. Exiting.');
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let apiProcess: any = null;
let apiServerInstance: any = null;
let pgProcess: ChildProcess | null = null;
let dynamicPgPort = 0;
let dynamicApiPort = 0;
let apiSecretToken = crypto.randomBytes(32).toString('hex');
let pgBinaries: any = null;
let isStartingUp = false;
let isSystemReady = false;
let startupError: string | null = null;
let systemReadyResolve: ((value: boolean) => void) | null = null;
let systemReadyPromise = new Promise<boolean>((resolve) => {
  systemReadyResolve = resolve;
});

// Broadcast startup progress or errors to UI
function broadcastProgress(step: string, message: string, progress: number) {
  logDesktop(`[PROGRESS ${progress}%] [${step}] ${message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-progress', { step, message, progress });
  }
}

function broadcastError(step: string, error: string) {
  logDesktop(`[ERROR] [${step}] ${error}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('startup-error', {
      step,
      error,
      logsPath: safeDirs?.logsDir || 'C:\\ProgramData\\FludoSuppliesERP\\logs',
    });
  }
}

// Dynamic Free Port Allocator (Requirement 2a & 3 - Zero hardcoded ports)
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function checkPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
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

function checkApiHealth(port: number, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/health',
        headers: { 'x-app-token': token },
        timeout: 800,
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Locate Portable PostgreSQL Binaries
function resolvePostgresBinaries(): {
  binDir: string;
  postgresExe: string;
  initdbExe: string;
  createdbExe: string;
  psqlExe: string;
  pgIsReadyExe: string;
  pgCtlExe: string;
  shareDir: string;
} {
  const appPath = app.getAppPath();
  const candidates = [
    path.join(process.resourcesPath || '', 'pgsql', 'bin'),
    path.join(appPath, 'pgsql', 'bin'),
    path.resolve(__dirname, '../pgsql/bin'),
    path.resolve(appPath, '../../pgsql/bin'),
    path.resolve(appPath, '../../data/pgsql/bin'),
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
  ];
  const binDir = candidates.find((b) => fs.existsSync(path.join(b, 'postgres.exe')));
  if (!binDir) {
    throw new Error('تعذر العثور على حزمة تشغيل PostgreSQL المحمولة في موارد التطبيق.');
  }

  const shareDir = path.join(path.dirname(binDir), 'share');
  return {
    binDir,
    postgresExe: path.join(binDir, 'postgres.exe'),
    initdbExe: path.join(binDir, 'initdb.exe'),
    createdbExe: path.join(binDir, 'createdb.exe'),
    psqlExe: path.join(binDir, 'psql.exe'),
    pgIsReadyExe: path.join(binDir, 'pg_isready.exe'),
    pgCtlExe: path.join(binDir, 'pg_ctl.exe'),
    shareDir,
  };
}

// Stale PID and Orphan Process Cleanup (Requirement 2e)
function cleanupStaleProcesses(dataDir: string) {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try {
      const content = fs.readFileSync(pidFile, 'utf8');
      const firstLine = content.split('\n')[0].trim();
      const pid = parseInt(firstLine, 10);
      if (pid && !isNaN(pid)) {
        logDesktop(`[CLEANUP] Found postmaster.pid with PID ${pid}. Verifying...`);
        try {
          process.kill(pid);
          logDesktop(`[CLEANUP] Sent kill signal to old process ${pid}.`);
        } catch (killErr: any) {
          logDesktop(`[CLEANUP] Process ${pid} is not running (${killErr?.message}).`);
        }
      }
      try {
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
          logDesktop('[CLEANUP] Removed stale postmaster.pid.');
        }
      } catch (unlinkErr: any) {
        logDesktop(`[CLEANUP] Notice during unlinking postmaster.pid: ${unlinkErr?.message}`);
      }
    } catch (e: any) {
      logDesktop(`[CLEANUP] Notice during pid cleanup: ${e.message}`);
    }
  }
}

// Graceful DB & API Shutdown (Requirement 2f)
async function gracefulShutdown() {
  logDesktop('[SHUTDOWN] Starting graceful system shutdown...');
  if (apiServerInstance && typeof apiServerInstance.close === 'function') {
    try {
      await apiServerInstance.close();
      logDesktop('[SHUTDOWN] In-process Fastify API closed.');
    } catch {}
  }
  if (apiProcess) {
    try {
      if (typeof apiProcess.kill === 'function') apiProcess.kill();
    } catch {}
  }

  if (pgBinaries && safeDirs) {
    try {
      execFileSync(pgBinaries.pgCtlExe, ['stop', '-D', safeDirs.dataDir, '-m', 'fast'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      logDesktop('[SHUTDOWN] PostgreSQL cluster stopped cleanly via pg_ctl.');
    } catch {}
  }

  if (pgProcess) {
    try {
      pgProcess.kill();
    } catch {}
  }
}

// Full Startup Orchestrator
async function startFullSystem(): Promise<boolean> {
  if (isStartingUp) return false;
  isStartingUp = true;

  try {
    safeDirs = resolveSafeAsciiDir();
    logDesktop(`[STARTUP] Safe ASCII Data directory: ${safeDirs.dataDir}`);
    logDesktop(`[STARTUP] Safe ASCII Logs directory: ${safeDirs.logsDir}`);

    // Clean stale postmaster.pid and orphans
    cleanupStaleProcesses(safeDirs.dataDir);

    // 1. Locate Binaries
    broadcastProgress('binaries', 'جاري فحص وتجهيز محرك البيانات المحمول...', 15);
    pgBinaries = resolvePostgresBinaries();
    logDesktop(`[STARTUP] Using PG binaries from: ${pgBinaries.binDir}`);

    // 2. Initialize DB Cluster if fresh install (Requirement 2c)
    const isClusterInitialized = fs.existsSync(path.join(safeDirs.dataDir, 'PG_VERSION'));
    if (!isClusterInitialized) {
      broadcastProgress('db_init', 'جاري تهيئة وتأسيس قاعدة البيانات للمرة الأولى (UTF-8)...', 30);
      logDesktop('[STARTUP] Initializing cluster with initdb.exe...');
      fs.mkdirSync(safeDirs.dataDir, { recursive: true });

      const initArgs = [
        '-D', safeDirs.dataDir,
        '-U', 'erp_owner',
        '-A', 'trust',
        '-E', 'UTF8',
      ];
      if (fs.existsSync(pgBinaries.shareDir)) {
        initArgs.push('-L', pgBinaries.shareDir);
      }

      try {
        execFileSync(pgBinaries.initdbExe, initArgs, {
          windowsHide: true,
          stdio: 'pipe',
          encoding: 'utf8',
        });
        logDesktop('[STARTUP] initdb completed successfully.');
      } catch (initErr: any) {
        throw new Error(`فشلت تهيئة قاعدة البيانات (initdb): ${initErr?.stderr || initErr?.message || initErr}`);
      }
    }

    // 3. Allocate Dynamic Ports (Requirement 2a & 3)
    dynamicPgPort = await getFreePort();
    dynamicApiPort = await getFreePort();
    logDesktop(`[STARTUP] Allocated dynamic PG port: ${dynamicPgPort}, API port: ${dynamicApiPort}`);

    // 4. Configure postgresql.conf with dynamic port
    const confPath = path.join(safeDirs.dataDir, 'postgresql.conf');
    let confContent = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf8') : '';
    confContent = confContent.replace(/^port\s*=\s*\d+/gm, '');
    confContent += `\nport = ${dynamicPgPort}\nlisten_addresses = '127.0.0.1'\nmax_connections = 100\nshared_buffers = 128MB\n`;
    fs.writeFileSync(confPath, confContent, 'utf8');

    // 5. Start postgres child process
    broadcastProgress('db_start', `جاري تشغيل محرك البيانات على المنفذ الحر ${dynamicPgPort}...`, 45);
    const pgLogPath = path.join(safeDirs.logsDir, 'postgres.log');
    const pgLogFd = fs.openSync(pgLogPath, 'a');

    pgProcess = spawn(pgBinaries.postgresExe, ['-D', safeDirs.dataDir, '-p', String(dynamicPgPort)], {
      detached: false,
      stdio: ['ignore', pgLogFd, pgLogFd],
      windowsHide: true,
    });

    // 6. Wait for pg_isready (Requirement 2d - up to 60s)
    broadcastProgress('db_ready', 'جاري انتظار جاهزية واستقرار محرك البيانات (pg_isready)...', 60);
    let ready = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        execFileSync(pgBinaries.pgIsReadyExe, ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        ready = true;
        break;
      } catch {}
    }

    if (!ready) {
      let tailLog = '';
      try {
        tailLog = fs.readFileSync(pgLogPath, 'utf8').split('\n').slice(-10).join('\n');
      } catch {}
      throw new Error(`تعذر على محرك البيانات بدء العمل خلال 60 ثانية. تفاصيل السجل: ${tailLog}`);
    }
    logDesktop('[STARTUP] PostgreSQL accepted connections.');

    // 7. Ensure database fludo_erp exists
    broadcastProgress('migrations', 'جاري التحقق من وجود قاعدة البيانات والجداول الهيكلية...', 75);
    try {
      execFileSync(pgBinaries.createdbExe, ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', 'fludo_erp'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      logDesktop('[STARTUP] Created fludo_erp database.');
    } catch {
      // already exists
    }

    const appPath = app.getAppPath();

    // Check if initial schema is present, if not run 0001 and 0002
    try {
      const checkTables = execFileSync(
        pgBinaries.psqlExe,
        ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-t', '-c', "SELECT to_regclass('app.users');"],
        { encoding: 'utf8', windowsHide: true, stdio: 'pipe' }
      ).trim();

      if (!checkTables || checkTables === '') {
        logDesktop('[STARTUP] Fresh DB detected. Applying migrations 0001 and 0002...');
        broadcastProgress('migrations', 'جاري تهيئة جداول النظام والمحاسبة والمخازن...', 80);
        const mig1Candidates = [
          path.join(appPath, '0001_initial.sql'),
          path.join(__dirname, '../0001_initial.sql'),
          path.join(__dirname, '0001_initial.sql'),
          path.resolve(__dirname, '../../db/migrations/0001_initial.sql'),
        ];
        const mig1 = mig1Candidates.find((m) => fs.existsSync(m));
        if (mig1) {
          execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-f', mig1], {
            stdio: 'pipe',
            windowsHide: true,
          });
          logDesktop('[STARTUP] 0001_initial.sql applied via psql.');
        }

        const mig2Candidates = [
          path.join(appPath, '0002_fix_constraints_and_search.sql'),
          path.join(__dirname, '../0002_fix_constraints_and_search.sql'),
          path.join(__dirname, '0002_fix_constraints_and_search.sql'),
          path.resolve(__dirname, '../../db/migrations/0002_fix_constraints_and_search.sql'),
        ];
        const mig2 = mig2Candidates.find((m) => fs.existsSync(m));
        if (mig2) {
          execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-f', mig2], {
            stdio: 'pipe',
            windowsHide: true,
          });
          logDesktop('[STARTUP] 0002_fix_constraints_and_search.sql applied via psql.');
        }
      }

      // Check Migration 0003
      const checkM3 = execFileSync(
        pgBinaries.psqlExe,
        ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-t', '-c', "SELECT to_regclass('app.v_dashboard_metrics');"],
        { encoding: 'utf8', windowsHide: true, stdio: 'pipe' }
      ).trim();

      if (!checkM3 || checkM3 === '') {
        logDesktop('[STARTUP] Migration 0003 needed. Applying 0003_comprehensive_schema_update.sql...');
        const mig3Candidates = [
          path.join(appPath, '0003_comprehensive_schema_update.sql'),
          path.join(__dirname, '../0003_comprehensive_schema_update.sql'),
          path.join(__dirname, '0003_comprehensive_schema_update.sql'),
          path.resolve(__dirname, '../../db/migrations/0003_comprehensive_schema_update.sql'),
        ];
        const mig3 = mig3Candidates.find((m) => fs.existsSync(m));
        if (mig3) {
          execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(dynamicPgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-f', mig3], {
            stdio: 'pipe',
            windowsHide: true,
          });
          logDesktop('[STARTUP] 0003_comprehensive_schema_update.sql applied via psql.');
        }
      }
    } catch (migErr: any) {
      logDesktop(`[STARTUP] Note on migration check: ${migErr?.message}`);
    }

    // 8. Launch API Server child process with dynamic ports & security token
    broadcastProgress('api_start', `جاري تشغيل خادم النظام الآمن على المنفذ الحر ${dynamicApiPort}...`, 85);
    const apiCandidates = [
      path.join(appPath, 'api', 'index.js'),
      path.join(__dirname, '../api/index.js'),
      path.join(__dirname, 'api/index.js'),
      path.resolve(__dirname, '../../services/api/dist/index.js'),
    ];
    const targetScript = apiCandidates.find((p) => fs.existsSync(p));
    if (!targetScript) {
      throw new Error('تعذر العثور على ملفات تشغيل خادم النظام (api/index.js).');
    }

    process.env.PORT = String(dynamicApiPort);
    process.env.PGPORT = String(dynamicPgPort);
    process.env.PGHOST = '127.0.0.1';
    process.env.PGUSER = 'erp_owner';
    process.env.PGDATABASE = 'fludo_erp';
    process.env.APP_SECRET_TOKEN = apiSecretToken;
    process.env.NODE_ENV = 'production';

    const apiEnv = {
      ...process.env,
    };

    const apiLogPath = path.join(safeDirs.logsDir, 'api.log');
    const apiLogFd = fs.openSync(apiLogPath, 'a');

    logDesktop(`[STARTUP] Starting Fastify API in Electron main process on dynamic port ${dynamicApiPort}...`);
    try {
      logDesktop(`[STARTUP] Loading API module from: ${targetScript}`);
      let apiModule: any;
      try {
        apiModule = require(targetScript);
      } catch (reqErr: any) {
        logDesktop(`[STARTUP] require() notice (${reqErr?.message}), trying dynamic import...`);
        const scriptUrl = pathToFileURL(targetScript).href;
        apiModule = await import(scriptUrl);
      }

      if (typeof apiModule.startServer === 'function') {
        apiServerInstance = await apiModule.startServer(dynamicApiPort, dynamicPgPort, apiSecretToken);
      } else if (typeof apiModule.start === 'function') {
        apiServerInstance = await apiModule.start();
      }
      logDesktop(`[STARTUP] Fastify API listening in main process on http://127.0.0.1:${dynamicApiPort}`);
    } catch (inProcErr: any) {
      logDesktop(`[STARTUP] In-process API start failed (${inProcErr?.message}). Falling back to child process...`);
      const { fork } = await import('node:child_process');
      apiProcess = fork(targetScript, [], {
        env: apiEnv,
        stdio: ['ignore', apiLogFd, apiLogFd, 'ipc'],
      });
    }

    // Wait for API to accept requests
    let apiReady = false;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (await checkApiHealth(dynamicApiPort, apiSecretToken)) {
        apiReady = true;
        break;
      }
    }

    if (!apiReady) {
      let tailApiLog = '';
      try {
        tailApiLog = fs.readFileSync(apiLogPath, 'utf8').split('\n').slice(-10).join('\n');
      } catch {}
      throw new Error(`تعذر بدء خادم النظام خلال 45 ثانية. تفاصيل السجل: ${tailApiLog}`);
    }

    broadcastProgress('ready', 'تم تشغيل النظام ومحرك البيانات بنجاح!', 100);
    logDesktop(`[STARTUP] Entire system running successfully! API: ${dynamicApiPort}, DB: ${dynamicPgPort}`);

    isSystemReady = true;
    startupError = null;
    isStartingUp = false;
    systemReadyResolve?.(true);
    return true;
  } catch (err: any) {
    isStartingUp = false;
    isSystemReady = false;
    startupError = err?.message || String(err);
    systemReadyResolve?.(false);
    broadcastError('startup', startupError || 'خطأ غير معروف في بدء تشغيل النظام');
    return false;
  }
}

// Window Management
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Fludo Supplies ERP',
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

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:3000');
  } else if (fs.existsSync(packagedUiPath)) {
    mainWindow.loadFile(packagedUiPath);
  } else if (fs.existsSync(localUiDistPath)) {
    mainWindow.loadFile(localUiDistPath);
  } else {
    mainWindow.loadURL('http://127.0.0.1:3000');
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Electron Application Lifecycle
app.whenReady().then(async () => {
  createWindow();

  // IPC Handlers
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-api-config', async () => {
    if (!isSystemReady && !startupError) {
      await Promise.race([
        systemReadyPromise,
        new Promise((r) => setTimeout(r, 45000)),
      ]);
    }
    return {
      apiBase: dynamicApiPort > 0 ? `http://127.0.0.1:${dynamicApiPort}/api` : '',
      appToken: apiSecretToken,
      dbPort: dynamicPgPort,
      apiPort: dynamicApiPort,
      isReady: isSystemReady,
      error: startupError,
    };
  });

  ipcMain.on('print-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.webContents.print({ silent: false, printBackground: true });
    }
  });

  ipcMain.on('open-logs-folder', () => {
    if (safeDirs?.logsDir && fs.existsSync(safeDirs.logsDir)) {
      shell.openPath(safeDirs.logsDir);
    }
  });

  ipcMain.handle('export-diagnostics', async () => {
    try {
      const desktopPath = app.getPath('desktop');
      const diagFileName = `fludo_erp_diagnostics_${Date.now()}.txt`;
      const targetFile = path.join(desktopPath, diagFileName);

      let report = `=== FLUDO ERP DIAGNOSTICS REPORT ===\n`;
      report += `Generated at: ${new Date().toISOString()}\n`;
      report += `OS: ${os.type()} ${os.release()} (${os.arch()})\n`;
      report += `App Version: ${app.getVersion()}\n`;
      report += `Dynamic DB Port: ${dynamicPgPort}\n`;
      report += `Dynamic API Port: ${dynamicApiPort}\n`;
      report += `Data Directory: ${safeDirs?.dataDir}\n`;
      report += `Logs Directory: ${safeDirs?.logsDir}\n\n`;

      const files = ['desktop.log', 'postgres.log', 'api.log'];
      for (const f of files) {
        report += `--- LOG: ${f} ---\n`;
        const logFile = path.join(safeDirs?.logsDir || '', f);
        if (fs.existsSync(logFile)) {
          const content = fs.readFileSync(logFile, 'utf8');
          report += content.split('\n').slice(-50).join('\n') + '\n\n';
        } else {
          report += '(file not found)\n\n';
        }
      }

      fs.writeFileSync(targetFile, report, 'utf8');
      return { success: true, path: targetFile };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  ipcMain.on('retry-startup', async () => {
    logDesktop('[STARTUP] User requested retry startup.');
    isStartingUp = false;
    isSystemReady = false;
    startupError = null;
    systemReadyPromise = new Promise<boolean>((resolve) => {
      systemReadyResolve = resolve;
    });
    await startFullSystem();
  });

  // Start orchestrator in background
  await startFullSystem();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('will-quit', async (e) => {
  await gracefulShutdown();
});

app.on('window-all-closed', async () => {
  await gracefulShutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
