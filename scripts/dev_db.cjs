const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pgBinDir = path.join(__dirname, '..', 'apps', 'desktop', 'pgsql', 'bin');
const pgCtlExe = path.join(pgBinDir, 'pg_ctl.exe');
const pgIsReadyExe = path.join(pgBinDir, 'pg_isready.exe');
const targetDataDir = 'C:\\ProgramData\\FludoSuppliesERP\\data';
const targetLogsDir = 'C:\\ProgramData\\FludoSuppliesERP\\logs';
const port = 5434;

const cmd = process.argv[2] || 'status';

if (cmd === 'start') {
  try {
    execFileSync(pgIsReadyExe, ['-h', '127.0.0.1', '-p', String(port), '-U', 'erp_owner', '-t', '1'], { stdio: 'pipe' });
    console.log(`[DB] Already running on port ${port}`);
    process.exit(0);
  } catch (e) {}

  const pidFile = path.join(targetDataDir, 'postmaster.pid');
  if (fs.existsSync(pidFile)) {
    try { fs.unlinkSync(pidFile); } catch (e) {}
  }

  if (!fs.existsSync(targetLogsDir)) fs.mkdirSync(targetLogsDir, { recursive: true });
  const logFile = path.join(targetLogsDir, 'postgres_dev.log');

  try {
    execFileSync(pgCtlExe, [
      'start',
      '-D', targetDataDir,
      '-l', logFile,
      '-o', `-p ${port} -h 127.0.0.1`,
      '-w',
      '-t', '30'
    ], { stdio: 'pipe', windowsHide: true });
    console.log(`[DB] Successfully started portable PostgreSQL on port ${port} via pg_ctl`);
  } catch (err) {
    console.error('[DB] pg_ctl start failed:', err.message);
    if (err.stdout) console.log('stdout:', err.stdout.toString());
    if (err.stderr) console.log('stderr:', err.stderr.toString());
    process.exit(1);
  }
} else if (cmd === 'stop') {
  try {
    execFileSync(pgCtlExe, ['stop', '-D', targetDataDir, '-m', 'fast'], { stdio: 'pipe', windowsHide: true });
    console.log('[DB] PostgreSQL stopped gracefully.');
  } catch (e) {
    console.log('[DB] Stop returned:', e.message);
  }
} else {
  try {
    execFileSync(pgIsReadyExe, ['-h', '127.0.0.1', '-p', String(port), '-U', 'erp_owner', '-t', '1'], { stdio: 'pipe' });
    console.log(`[DB] Running and healthy on port ${port}`);
  } catch (e) {
    console.log(`[DB] Not running on port ${port}`);
  }
}
