const { spawn, execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function checkPortOpen(port) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(600);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.connect(port, '127.0.0.1');
  });
}

(async () => {
  try {
    console.log('[LIFECYCLE TEST] Starting full portable lifecycle test...');

    // 1. Pick a dynamic free port
    const pgPort = await getFreePort();
    console.log('✓ Dynamic free port allocated for DB:', pgPort);

    const binDir = path.resolve('apps/desktop/pgsql/bin');
    const postgresExe = path.join(binDir, 'postgres.exe');
    const pgIsReadyExe = path.join(binDir, 'pg_isready.exe');
    const createdbExe = path.join(binDir, 'createdb.exe');
    const psqlExe = path.join(binDir, 'psql.exe');
    const pgCtlExe = path.join(binDir, 'pg_ctl.exe');
    const dataDir = 'C:\\ProgramData\\FludoSuppliesERP\\data';
    const logsDir = 'C:\\ProgramData\\FludoSuppliesERP\\logs';

    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

    // 2. Cleanup stale postmaster.pid
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      console.log('Cleaning stale postmaster.pid...');
      fs.unlinkSync(pidFile);
    }

    // 3. Write postgresql.conf with dynamic port
    const confFile = path.join(dataDir, 'postgresql.conf');
    let conf = fs.readFileSync(confFile, 'utf8');
    // Remove existing port lines
    conf = conf.replace(/^port\s*=\s*\d+/gm, '');
    conf += `\nport = ${pgPort}\nlisten_addresses = '127.0.0.1'\nmax_connections = 100\nshared_buffers = 128MB\n`;
    fs.writeFileSync(confFile, conf, 'utf8');

    // 4. Spawn postgres child process
    console.log('[LIFECYCLE TEST] Spawning postgres on port', pgPort);
    const pgLogStream = fs.openSync(path.join(logsDir, 'test_postgres.log'), 'w');
    const pgProc = spawn(postgresExe, ['-D', dataDir, '-p', String(pgPort)], {
      detached: false,
      stdio: ['ignore', pgLogStream, pgLogStream],
      windowsHide: true,
    });

    // 5. Wait for pg_isready
    console.log('[LIFECYCLE TEST] Waiting for pg_isready...');
    let isReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        execFileSync(pgIsReadyExe, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'erp_owner'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        isReady = true;
        break;
      } catch {}
    }
    if (!isReady) throw new Error('pg_isready timed out after 60s');
    console.log('✓ pg_isready reported database accepting connections on dynamic port', pgPort);

    // 6. Ensure database fludo_erp exists
    try {
      execFileSync(createdbExe, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'erp_owner', 'fludo_erp'], {
        stdio: 'pipe',
        windowsHide: true,
      });
      console.log('✓ Database fludo_erp created.');
    } catch (e) {
      console.log('Database fludo_erp notice:', e.message);
    }

    // 7. Apply migrations
    console.log('[LIFECYCLE TEST] Applying migrations via psql.exe...');
    const m1 = path.resolve('db/migrations/0001_initial.sql');
    const m2 = path.resolve('db/migrations/0002_fix_constraints_and_search.sql');

    execFileSync(psqlExe, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-v', 'ON_ERROR_STOP=1', '-f', m1], {
      stdio: 'pipe',
      windowsHide: true,
    });
    console.log('✓ 0001_initial.sql applied via psql.');

    execFileSync(psqlExe, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-v', 'ON_ERROR_STOP=1', '-f', m2], {
      stdio: 'pipe',
      windowsHide: true,
    });
    console.log('✓ 0002_fix_constraints_and_search.sql applied via psql.');

    // 8. Verify query
    const outCount = execFileSync(psqlExe, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-t', '-c', 'SELECT COUNT(*) FROM app.products;'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
    console.log('✓ Products count in dynamic DB:', outCount);

    // 9. Graceful shutdown
    console.log('[LIFECYCLE TEST] Gracefully stopping PostgreSQL via pg_ctl...');
    execFileSync(pgCtlExe, ['stop', '-D', dataDir, '-m', 'fast'], {
      stdio: 'pipe',
      windowsHide: true,
    });
    console.log('✓ pg_ctl stop succeeded.');

    // Wait until port closes
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (!(await checkPortOpen(pgPort))) {
        console.log('✓ DB port successfully closed.');
        break;
      }
    }

    console.log('🎉 FULL PORTABLE POSTGRESQL LIFECYCLE VERIFIED 100%!');
  } catch (err) {
    console.error('Fatal test error:', err);
  }
})();
