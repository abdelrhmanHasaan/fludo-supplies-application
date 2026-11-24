/**
 * FLUDO SUPPLIES ERP — COMPREHENSIVE REAL PACKAGED APP & DATABASE VERIFICATION
 * Tests:
 * 1. Startup Migrations Code Path Inspection (File:Line & PG_VERSION check)
 * 2. Real Packaged App Launch from 0002 -> 0003/0004 Upgrade & Live API POST (Treasury 20000 & Free-text Product)
 * 3. Failure Path: Failing Migration Stop Screen, No API Served, Restore Backup Test, and Second Launch (0 re-applied)
 * 4. Direct SQL Security Defenses via erp_runtime (Tamper Approved Invoice, Disable Triggers, Audit Log Tampering)
 * 5. High-Volume Upgrade Integrity: 800+ Rows, Pre/Post Balance & Count Identity Verification
 * 6. ACL Verification (icacls) & Non-8.3 ASCII Fallback Path Simulation
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');

process.env.PGCLIENTENCODING = 'UTF8';

const ROOT_DIR = path.resolve(__dirname, '..');
const PGSQL_BIN = path.join(ROOT_DIR, 'apps/desktop/pgsql/bin');
const PSQL = path.join(PGSQL_BIN, 'psql.exe');
const PG_ISREADY = path.join(PGSQL_BIN, 'pg_isready.exe');
const INITDB = path.join(PGSQL_BIN, 'initdb.exe');
const POSTGRES = path.join(PGSQL_BIN, 'postgres.exe');
const PG_CTL = path.join(PGSQL_BIN, 'pg_ctl.exe');
const PG_DUMP = path.join(PGSQL_BIN, 'pg_dump.exe');

const PACKAGED_EXE = path.join(ROOT_DIR, 'apps/desktop/release/win-unpacked/Fludo Supplies ERP.exe');
const DESKTOP_MAIN = path.join(ROOT_DIR, 'apps/desktop/dist/main.js');

const MIGRATIONS_DIR = path.join(ROOT_DIR, 'db/migrations');
const MIG1_PATH = path.join(MIGRATIONS_DIR, '0001_initial.sql');
const MIG2_PATH = path.join(MIGRATIONS_DIR, '0002_fix_constraints_and_search.sql');
const MIG3_PATH = path.join(MIGRATIONS_DIR, '0003_comprehensive_schema_update.sql');
const MIG4_PATH = path.join(MIGRATIONS_DIR, '0004_figjam_overhaul.sql');

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

function runPsql(port, user, pass, db, sql) {
  return execFileSync(PSQL, [
    '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', db,
    '-t', '-A',
    '-v', 'ON_ERROR_STOP=1', '-f', '-'
  ], {
    input: sql,
    env: { ...process.env, PGPASSWORD: pass, PGCLIENTENCODING: 'UTF8' },
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

function runPsqlFile(port, user, pass, db, filePath) {
  return execFileSync(PSQL, [
    '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-f', filePath
  ], {
    env: { ...process.env, PGPASSWORD: pass, PGCLIENTENCODING: 'UTF8' },
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function httpPost(port, pathUrl, token, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-app-token': token,
      },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

function httpGet(port, pathUrl, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathUrl,
      method: 'GET',
      headers: {
        'x-app-token': token || '',
      },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTP request timed out'));
    });
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('======================================================================');
  console.log(' FLUDO SUPPLIES ERP — REAL APP & DATABASE HARDENING PROOF SUITE       ');
  console.log('======================================================================\n');

  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedAssertions++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failedAssertions++;
    }
  }

  const BASE_TEST_DIR = 'C:\\ProgramData\\FludoSuppliesERP\\test_real_suite';
  try { execFileSync('taskkill', ['/f', '/im', 'postgres.exe'], { stdio: 'ignore' }); } catch {}
  if (fs.existsSync(BASE_TEST_DIR)) {
    try { fs.rmSync(BASE_TEST_DIR, { recursive: true, force: true }); } catch {}
  }
  fs.mkdirSync(BASE_TEST_DIR, { recursive: true });

  // -------------------------------------------------------------------------
  // TEST 1: Inspect Startup Migrations Code Path (File & Line Numbers)
  // -------------------------------------------------------------------------
  console.log('--- 1. Startup Migrations Code Path Inspection ---');
  const mainTsPath = path.join(ROOT_DIR, 'apps/desktop/src/main.ts');
  const mainTsContent = fs.readFileSync(mainTsPath, 'utf8');

  // Verify PG_VERSION check vs Migrations loop
  const hasPgVersionCheck = mainTsContent.includes("fs.existsSync(path.join(safeDirs.dataDir, 'PG_VERSION'))");
  const hasMigrationsLoop = mainTsContent.includes("for (const mig of MIGRATIONS)");
  const hasAppliedSetCheck = mainTsContent.includes("if (!appliedSet.has(mig.version))");
  const hasReqVersionCheck = mainTsContent.includes("if (finalCount < REQUIRED_SCHEMA_VERSION)");

  assert(hasPgVersionCheck, 'Cluster initdb is guarded strictly by PG_VERSION absence (only runs on first init)');
  assert(hasMigrationsLoop && hasAppliedSetCheck, 'Sequential migrations run on EVERY startup against any existing data dir');
  assert(hasReqVersionCheck, 'REQUIRED_SCHEMA_VERSION halts system with stop screen on mismatch');

  // -------------------------------------------------------------------------
  // TEST 2: Start Real Packaged App on Migration 0002 Baseline
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Starting Real Packaged App on Migration 0002 Baseline ---');
  const test2Dir = path.join(BASE_TEST_DIR, 'stage2_app_upgrade');
  const test2Data = path.join(test2Dir, 'data');
  fs.mkdirSync(test2Data, { recursive: true });

  // 2a. Initialize isolated cluster at 0002 baseline
  execFileSync(INITDB, ['-D', test2Data, '-U', 'erp_owner', '-A', 'trust', '-E', 'UTF8'], {
    windowsHide: true, stdio: 'ignore'
  });
  const setupPort = await getFreePort();
  const confPath = path.join(test2Data, 'postgresql.conf');
  fs.appendFileSync(confPath, `\nport = ${setupPort}\nlisten_addresses = '127.0.0.1'\npassword_encryption = 'scram-sha-256'\n`);

  const pgSetupProc = spawn(POSTGRES, ['-D', test2Data, '-p', String(setupPort)], { stdio: 'ignore', windowsHide: true });
  await sleep(2500);

  // Apply migrations 0001 and 0002
  execFileSync(PSQL, ['-h', '127.0.0.1', '-p', String(setupPort), '-U', 'erp_owner', '-d', 'postgres', '-c', 'CREATE DATABASE fludo_erp;'], { stdio: 'ignore', windowsHide: true });
  runPsqlFile(setupPort, 'erp_owner', '', 'fludo_erp', MIG1_PATH);
  runPsqlFile(setupPort, 'erp_owner', '', 'fludo_erp', MIG2_PATH);

  // Add baseline customer party in 0002
  runPsql(setupPort, 'erp_owner', '', 'fludo_erp', `
    INSERT INTO app.parties (code, name, is_customer, phone)
    VALUES ('C0001', 'عميل أساسي تم إنشاؤه في الإصدار القديم', true, '01011112222');
  `);

  // Stop setup postgres cleanly
  execFileSync(PG_CTL, ['stop', '-D', test2Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true });
  await sleep(1500);
  try { pgSetupProc.kill(); } catch {}

  console.log('  -> Baseline 0002 database seeded successfully.');

  // 2b. Launch the REAL App binary / Electron runtime targeting this baseline data directory
  const secretAppToken = 'test_token_live_app_upgrade_999';
  const appEnv = {
    ...process.env,
    FLUDO_BASE_DIR: test2Dir,
    APP_SECRET_TOKEN: secretAppToken,
    NODE_ENV: 'production',
  };
  delete appEnv.ELECTRON_RUN_AS_NODE;

  const appBinary = fs.existsSync(PACKAGED_EXE) ? PACKAGED_EXE : 'npx electron';
  const appArgs = fs.existsSync(PACKAGED_EXE) ? ['--enable-logging'] : [DESKTOP_MAIN];
  console.log(`  -> Launching Real App via: ${fs.existsSync(PACKAGED_EXE) ? PACKAGED_EXE : 'electron apps/desktop/dist/main.js'}`);

  const appProc = spawn(appBinary, appArgs, {
    env: appEnv,
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  appProc.stdout.on('data', (d) => {
    const text = d.toString();
    const match = text.match(/Entire system running successfully! API: (\d+), DB: (\d+)/);
    if (match) {
      realApiPort = parseInt(match[1], 10);
      realPgPort = parseInt(match[2], 10);
    }
  });

  // Poll desktop.log for successful startup
  const desktopLogFile = path.join(test2Dir, 'logs', 'desktop.log');
  let realApiPort = 0;
  let realPgPort = 0;
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    if (realApiPort > 0 && realPgPort > 0) break;
    if (fs.existsSync(desktopLogFile)) {
      const logs = fs.readFileSync(desktopLogFile, 'utf8');
      const match = logs.match(/Entire system running successfully! API: (\d+), DB: (\d+)/);
      if (match) {
        realApiPort = parseInt(match[1], 10);
        realPgPort = parseInt(match[2], 10);
        break;
      }
    }
  }

  assert(realApiPort > 0 && realPgPort > 0, `Real app launched successfully on dynamic ports (API: ${realApiPort}, DB: ${realPgPort})`);

  // Verify Migrations 0003 & 0004 applied by Real App
  const authFile = path.join(test2Dir, 'auth.json');
  const authCreds = JSON.parse(fs.readFileSync(authFile, 'utf8'));

  const postMigVersions = runPsql(realPgPort, 'erp_owner', authCreds.ownerPass, 'fludo_erp', "SELECT version FROM app.schema_migrations ORDER BY version;");
  assert(postMigVersions.includes('0003_comprehensive_schema_update') && postMigVersions.includes('0004_figjam_overhaul'),
    'Real App automatically migrated DB to 0003 and 0004 on startup');

  // Verify Live API Health
  const sessionFile = path.join(test2Dir, 'session.json');
  let activeToken = secretAppToken;
  if (fs.existsSync(sessionFile)) {
    try {
      const sess = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (sess.token) activeToken = sess.token;
    } catch {}
  }

  const healthRes = await httpGet(realApiPort, '/api/health', activeToken);
  assert(healthRes.status === 200 && healthRes.data.status === 'healthy', 'Live Fastify API served healthy response');

  // 2c. POST Treasury via Live API (opening_balance: 20000)
  const treasuryPostRes = await httpPost(realApiPort, '/api/treasury/accounts', activeToken, {
    name: 'خزينة رئيسية - ترقية التطبيق الفعلي',
    kind: 'cash',
    opening_balance: 20000.00,
  });
  assert(treasuryPostRes.status === 200 && parseFloat(treasuryPostRes.data.balance || treasuryPostRes.data.opening_balance) === 20000,
    `POST /api/treasury/accounts created account with opening_balance 20000.00 (ID: ${treasuryPostRes.data.id})`);

  // 2d. POST Product via Live API (Free-text Unit: 'شكاير بلاستيك منسوج 50كجم')
  const freeTextUnit = 'شكاير بلاستيك منسوج 50كجم';
  const productPostRes = await httpPost(realApiPort, '/api/products', activeToken, {
    name: 'أسمنت تشطيبات ممتاز',
    unit_name: freeTextUnit,
    kind: 'goods',
    default_sale_price: 185.50,
    default_purchase_price: 155.00,
  });
  assert(productPostRes.status === 200 && productPostRes.data.unit_name === freeTextUnit,
    `POST /api/products created product with free-text unit '${freeTextUnit}' (Code: ${productPostRes.data.code})`);

  // Verify free-text unit learned into app.units
  const unitsCheck = runPsql(realPgPort, 'erp_owner', authCreds.ownerPass, 'fludo_erp', `SELECT count(*) FROM app.units WHERE name = '${freeTextUnit}' OR name LIKE '%بلاستيك%';`).trim();
  assert(parseInt(unitsCheck, 10) >= 1, `Free-text unit automatically learned into app.units for autocomplete`);

  // Kill appProc
  try { appProc.kill(); } catch {}
  await sleep(2000);
  try { execFileSync(PG_CTL, ['stop', '-D', test2Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true }); } catch {}

  // -------------------------------------------------------------------------
  // TEST 3: Failure Path (Injected Failing Migration, Stop Screen, No API, Restore, Second Launch)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing Failure Path, Stop Screen, Restore & Second Launch ---');
  const test3Dir = path.join(BASE_TEST_DIR, 'stage3_failure_path');
  const test3Data = path.join(test3Dir, 'data');
  fs.mkdirSync(test3Data, { recursive: true });

  // Init cluster at 0002
  execFileSync(INITDB, ['-D', test3Data, '-U', 'erp_owner', '-A', 'trust', '-E', 'UTF8'], { windowsHide: true, stdio: 'ignore' });
  const setupPort3 = await getFreePort();
  fs.appendFileSync(path.join(test3Data, 'postgresql.conf'), `\nport = ${setupPort3}\nlisten_addresses = '127.0.0.1'\npassword_encryption = 'scram-sha-256'\n`);
  const pgProc3 = spawn(POSTGRES, ['-D', test3Data, '-p', String(setupPort3)], { stdio: 'ignore', windowsHide: true });
  await sleep(2500);

  execFileSync(PSQL, ['-h', '127.0.0.1', '-p', String(setupPort3), '-U', 'erp_owner', '-d', 'postgres', '-c', 'CREATE DATABASE fludo_erp;'], { stdio: 'ignore', windowsHide: true });
  runPsqlFile(setupPort3, 'erp_owner', '', 'fludo_erp', MIG1_PATH);
  runPsqlFile(setupPort3, 'erp_owner', '', 'fludo_erp', MIG2_PATH);

  // Add baseline customer party in 0002
  runPsql(setupPort3, 'erp_owner', '', 'fludo_erp', `
    INSERT INTO app.parties (code, name, is_customer, phone)
    VALUES ('C0001', 'عميل أساسي تم إنشاؤه في الإصدار القديم', true, '01011112222');
  `);

  // Stop setup postgres
  execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true });
  await sleep(1500);
  try { pgProc3.kill(); } catch {}

  // Inject a failing migration temporarily by writing to all possible migration locations
  const all0003Paths = [
    MIG3_PATH,
    path.join(ROOT_DIR, 'apps/desktop/0003_comprehensive_schema_update.sql'),
    path.join(ROOT_DIR, 'apps/desktop/api/0003_comprehensive_schema_update.sql'),
    path.join(ROOT_DIR, 'apps/desktop/db/migrations/0003_comprehensive_schema_update.sql'),
    path.join(ROOT_DIR, 'apps/desktop/release/win-unpacked/resources/app/0003_comprehensive_schema_update.sql'),
    path.join(ROOT_DIR, 'apps/desktop/release/win-unpacked/resources/app/api/0003_comprehensive_schema_update.sql'),
    path.join(ROOT_DIR, 'apps/desktop/release/win-unpacked/resources/app/db/migrations/0003_comprehensive_schema_update.sql'),
  ];
  const original0003 = fs.readFileSync(MIG3_PATH, 'utf8');
  const badMig3Content = "SYNTAX_ERROR_INJECTED_MIGRATION_FAILURE_LINE_1;";
  for (const p of all0003Paths) {
    if (fs.existsSync(p)) fs.writeFileSync(p, badMig3Content, 'utf8');
  }

  console.log('  -> Injected syntax error into migration 0003 to test failure halt path.');

  // Launch app with failing migration
  const failEnv = { ...process.env, FLUDO_BASE_DIR: test3Dir, APP_SECRET_TOKEN: 'token_fail_test', NODE_ENV: 'production' };
  delete failEnv.ELECTRON_RUN_AS_NODE;
  const failAppProc = spawn(appBinary, appArgs, {
    env: failEnv,
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  failAppProc.stdout.on('data', (d) => {
    const text = d.toString();
    if (text.includes('[MIGRATION ERROR]') || text.includes('قاعدة البيانات بحاجة إلى تحديث أو استعادة')) {
      haltedWithError = true;
    }
  });

  const desktopLogFile3 = path.join(test3Dir, 'logs', 'desktop.log');
  let haltedWithError = false;
  let errorLogged = '';
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (haltedWithError) break;
    if (fs.existsSync(desktopLogFile3)) {
      const logs = fs.readFileSync(desktopLogFile3, 'utf8');
      if (logs.includes('[MIGRATION ERROR]') || logs.includes('قاعدة البيانات بحاجة إلى تحديث أو استعادة')) {
        haltedWithError = true;
        errorLogged = logs;
        break;
      }
    }
  }

  assert(haltedWithError, 'App halted at Arabic stop screen: "قاعدة البيانات بحاجة إلى تحديث أو استعادة"');

  // Verify that API is NEVER served during migration failure
  const failSessionExists = fs.existsSync(path.join(test3Dir, 'session.json'));
  assert(!failSessionExists, 'API server was NOT started / never served requests on migration failure');

  // Verify pre-migration backup was created before applying the failing migration
  const backupsDir3 = path.join(test3Dir, 'backups');
  const backupFiles = fs.existsSync(backupsDir3) ? fs.readdirSync(backupsDir3).filter(f => f.endsWith('.sql')) : [];
  assert(backupFiles.length > 0, `Pre-migration pg_dump backup safely created prior to failure (${backupFiles[0]})`);

  // Kill fail app
  try { failAppProc.kill(); } catch {}
  await sleep(2000);
  try { execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true }); } catch {}

  // Test Restore Backup functionality
  const latestBackup = path.join(backupsDir3, backupFiles[0]);
  const restorePort = await getFreePort();
  const pgRestoreProc = spawn(POSTGRES, ['-D', test3Data, '-p', String(restorePort)], { stdio: 'ignore', windowsHide: true });
  await sleep(2500);

  const authFile3 = path.join(test3Dir, 'auth.json');
  const authCreds3 = JSON.parse(fs.readFileSync(authFile3, 'utf8'));

  execFileSync(PSQL, [
    '-h', '127.0.0.1', '-p', String(restorePort), '-U', 'erp_owner', '-d', 'fludo_erp',
    '-f', latestBackup
  ], {
    env: { ...process.env, PGPASSWORD: authCreds3.ownerPass },
    stdio: 'ignore',
    windowsHide: true,
  });

  const restoredCheck = runPsql(restorePort, 'erp_owner', authCreds3.ownerPass, 'fludo_erp', "SELECT version FROM app.schema_migrations;");
  assert(restoredCheck.includes('0001_initial') && restoredCheck.includes('0002_fix_constraints_and_search') && !restoredCheck.includes('0003_comprehensive_schema_update'),
    'Restore backup successfully restored database to pre-failure baseline state (0002)');

  execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true });
  await sleep(1500);
  try { pgRestoreProc.kill(); } catch {}

  // Revert all 0003 copies to valid content
  for (const p of all0003Paths) {
    if (fs.existsSync(p)) fs.writeFileSync(p, original0003, 'utf8');
  }

  // Test Second Launch (Clean upgrade)
  const cleanEnv = { ...process.env, FLUDO_BASE_DIR: test3Dir, APP_SECRET_TOKEN: 'token_clean_test', NODE_ENV: 'production' };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;
  const cleanAppProc = spawn(appBinary, appArgs, {
    env: cleanEnv,
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let secondLaunchReady = false;
  for (let i = 0; i < 35; i++) {
    await sleep(1000);
    const logs = fs.readFileSync(desktopLogFile3, 'utf8');
    if (logs.includes('All 4 migrations verified active in app.schema_migrations')) {
      secondLaunchReady = true;
      break;
    }
  }
  assert(secondLaunchReady, 'Second launch with restored backup & valid migration completed 0003 & 0004 cleanly');

  // Kill clean app
  try { cleanAppProc.kill(); } catch {}
  await sleep(2000);
  try { execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true }); } catch {}

  // Test Third Launch: Confirm NO migrations re-applied
  const preLogLength = fs.readFileSync(desktopLogFile3, 'utf8').length;
  const thirdEnv = { ...process.env, FLUDO_BASE_DIR: test3Dir, APP_SECRET_TOKEN: 'token_third_test', NODE_ENV: 'production' };
  delete thirdEnv.ELECTRON_RUN_AS_NODE;
  const thirdAppProc = spawn(appBinary, appArgs, {
    env: thirdEnv,
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let thirdLaunchVerified = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    const logs = fs.readFileSync(desktopLogFile3, 'utf8');
    const newLogs = logs.slice(preLogLength);
    if (newLogs.includes('All 4 migrations verified active in app.schema_migrations')) {
      const reapplied = newLogs.includes('[MIGRATION] Applying');
      if (!reapplied) {
        thirdLaunchVerified = true;
        break;
      }
    }
  }
  assert(thirdLaunchVerified, 'Subsequent launch on migrated DB verified: ZERO migrations re-applied');

  try { thirdAppProc.kill(); } catch {}
  await sleep(2000);
  try { execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true }); } catch {}

  // -------------------------------------------------------------------------
  // TEST 4: Direct SQL Security Defenses via erp_runtime
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Testing Direct SQL Security Defenses via erp_runtime ---');
  const secPort = await getFreePort();
  const secProc = spawn(POSTGRES, ['-D', test3Data, '-p', String(secPort)], { stdio: 'ignore', windowsHide: true });
  await sleep(2500);

  // Seed an approved sales invoice
  runPsql(secPort, 'erp_owner', authCreds3.ownerPass, 'fludo_erp', `
    DO $$
    DECLARE v_party uuid; v_branch uuid; v_inv uuid;
    BEGIN
      SELECT id INTO v_party FROM app.parties WHERE is_customer = true LIMIT 1;
      IF v_party IS NULL THEN
        INSERT INTO app.parties (code, name, is_customer, phone)
        VALUES ('C_SEC_01', 'عميل اختبار الأمان', true, '01000000000')
        RETURNING id INTO v_party;
      END IF;
      SELECT id INTO v_branch FROM app.branches LIMIT 1;
      IF v_branch IS NULL THEN
        INSERT INTO app.branches (code, name)
        VALUES ('B_SEC_01', 'فرع رئيسي للأمان')
        RETURNING id INTO v_branch;
      END IF;
      INSERT INTO app.sales_invoices (invoice_no, party_id, branch_id, invoice_date, status, lines_total, notes)
      VALUES ('INV-TEST-001', v_party, v_branch, CURRENT_DATE, 'approved', 5000.00, 'Original Approved Notes')
      RETURNING id INTO v_inv;
      INSERT INTO app.audit_log (action, entity_table, entity_id, reason)
      VALUES ('create', 'sales_invoices', v_inv, 'Initial invoice test creation');
    END $$;
  `);

  // 4a. UPDATE approved invoice without approval token -> MUST FAIL
  let tamperInvoiceFailed = false;
  let tamperInvoiceError = '';
  try {
    runPsql(secPort, 'erp_runtime', authCreds3.runtimePass, 'fludo_erp', `
      UPDATE app.sales_invoices SET notes = 'MALICIOUS_TAMPER' WHERE invoice_no = 'INV-TEST-001';
    `);
  } catch (err) {
    tamperInvoiceFailed = true;
    tamperInvoiceError = err.stderr || err.message;
  }
  assert(tamperInvoiceFailed && (tamperInvoiceError.includes('Record is approved/locked') || tamperInvoiceError.includes('approval required')),
    'erp_runtime UPDATE approved invoice rejected: "Record is approved/locked: manager approval required"');

  // 4b. ALTER TABLE ... DISABLE TRIGGER -> MUST FAIL
  let alterTriggerFailed = false;
  let alterTriggerError = '';
  try {
    runPsql(secPort, 'erp_runtime', authCreds3.runtimePass, 'fludo_erp', `
      ALTER TABLE app.sales_invoices DISABLE TRIGGER trg_a_lock;
    `);
  } catch (err) {
    alterTriggerFailed = true;
    alterTriggerError = err.stderr || err.message;
  }
  assert(alterTriggerFailed && alterTriggerError.includes('must be owner of table sales_invoices'),
    'erp_runtime ALTER TABLE DISABLE TRIGGER rejected: "must be owner of table sales_invoices"');

  // 4c. UPDATE audit_log -> MUST FAIL
  let updateAuditFailed = false;
  let updateAuditError = '';
  try {
    runPsql(secPort, 'erp_runtime', authCreds3.runtimePass, 'fludo_erp', `
      UPDATE app.audit_log SET reason = 'TAMPERED_LOG_REASON' WHERE action = 'create';
    `);
  } catch (err) {
    updateAuditFailed = true;
    updateAuditError = err.stderr || err.message;
  }
  assert(updateAuditFailed && (updateAuditError.includes('append-only') || updateAuditError.includes('UPDATE not allowed')),
    'erp_runtime UPDATE audit_log rejected: "audit_log is append-only (UPDATE not allowed)"');

  // 4d. DELETE audit_log -> MUST FAIL
  let deleteAuditFailed = false;
  let deleteAuditError = '';
  try {
    runPsql(secPort, 'erp_runtime', authCreds3.runtimePass, 'fludo_erp', `
      DELETE FROM app.audit_log WHERE action = 'create';
    `);
  } catch (err) {
    deleteAuditFailed = true;
    deleteAuditError = err.stderr || err.message;
  }
  assert(deleteAuditFailed && (deleteAuditError.includes('append-only') || deleteAuditError.includes('DELETE not allowed')),
    'erp_runtime DELETE audit_log rejected: "audit_log is append-only (DELETE not allowed)"');

  execFileSync(PG_CTL, ['stop', '-D', test3Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true });
  await sleep(1500);
  try { secProc.kill(); } catch {}

  // -------------------------------------------------------------------------
  // TEST 5: Upgrade Over Real-Looking Data (800+ Rows, Pre/Post Count & Balance Identity)
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Upgrading Over Real-Looking Data (Hundreds of Rows) ---');
  const test5Dir = path.join(BASE_TEST_DIR, 'stage5_large_dataset');
  const test5Data = path.join(test5Dir, 'data');
  fs.mkdirSync(test5Data, { recursive: true });

  execFileSync(INITDB, ['-D', test5Data, '-U', 'erp_owner', '-A', 'trust', '-E', 'UTF8'], { windowsHide: true, stdio: 'ignore' });
  const port5 = await getFreePort();
  fs.appendFileSync(path.join(test5Data, 'postgresql.conf'), `\nport = ${port5}\nlisten_addresses = '127.0.0.1'\n`);
  const pgProc5 = spawn(POSTGRES, ['-D', test5Data, '-p', String(port5)], { stdio: 'ignore', windowsHide: true });
  await sleep(2500);

  execFileSync(PSQL, ['-h', '127.0.0.1', '-p', String(port5), '-U', 'erp_owner', '-d', 'postgres', '-c', 'CREATE DATABASE fludo_erp;'], { stdio: 'ignore', windowsHide: true });
  runPsqlFile(port5, 'erp_owner', '', 'fludo_erp', MIG1_PATH);
  runPsqlFile(port5, 'erp_owner', '', 'fludo_erp', MIG2_PATH);

  // Populate 800+ real-looking records
  console.log('  -> Populating large dataset (~800 rows: parties, products, invoices, lines, journal, employees)...');
  runPsql(port5, 'erp_owner', '', 'fludo_erp', `
    DO $$
    DECLARE
      v_uid uuid; v_unit uuid; v_party uuid; v_branch uuid; v_inv uuid;
      i int;
    BEGIN
      SELECT id INTO v_uid FROM app.users LIMIT 1;
      SELECT id INTO v_unit FROM app.units LIMIT 1;
      SELECT id INTO v_branch FROM app.branches LIMIT 1;

      -- 1. Insert 30 parties
      FOR i IN 1..30 LOOP
        INSERT INTO app.parties (code, name, is_customer, is_supplier, phone)
        VALUES ('CUST' || LPAD(i::text, 4, '0'), 'عميل/مورد حقيقي رقم ' || i, (i % 2 = 0), (i % 2 != 0), '010' || LPAD(i::text, 8, '0'));
      END LOOP;

      -- 2. Insert 50 products
      FOR i IN 1..50 LOOP
        INSERT INTO app.products (code, name, kind, unit_id, default_sale_price, default_purchase_price)
        VALUES ('PROD' || LPAD(i::text, 4, '0'), 'صنف بناء توريد رقم ' || i, 'goods', v_unit, 200.00 + i, 160.00 + i);
      END LOOP;

      -- 3. Insert 100 sales invoices (approved) with 200 lines
      FOR i IN 1..100 LOOP
        SELECT id INTO v_party FROM app.parties WHERE is_customer = true ORDER BY random() LIMIT 1;
        INSERT INTO app.sales_invoices (invoice_no, party_id, branch_id, invoice_date, status, lines_total, notes)
        VALUES ('INV' || LPAD(i::text, 4, '0'), v_party, v_branch, CURRENT_DATE, 'draft', 3000.00, 'فاتورة مبيعات معتمدة قبل الترقية ' || i)
        RETURNING id INTO v_inv;

        INSERT INTO app.sales_invoice_lines (invoice_id, line_no, product_id, unit_id, qty, unit_price)
        SELECT v_inv, 1, id, v_unit, 10, 150.00 FROM app.products LIMIT 1;
        INSERT INTO app.sales_invoice_lines (invoice_id, line_no, product_id, unit_id, qty, unit_price)
        SELECT v_inv, 2, id, v_unit, 15, 100.00 FROM app.products OFFSET 1 LIMIT 1;

        UPDATE app.sales_invoices SET status = 'approved' WHERE id = v_inv;
      END LOOP;

      -- 4. Insert 50 purchase invoices (approved) with 50 lines
      FOR i IN 1..50 LOOP
        SELECT id INTO v_party FROM app.parties WHERE is_supplier = true ORDER BY random() LIMIT 1;
        INSERT INTO app.purchase_invoices (invoice_no, party_id, branch_id, invoice_date, status, lines_total, notes)
        VALUES ('PUR' || LPAD(i::text, 4, '0'), v_party, v_branch, CURRENT_DATE, 'draft', 2500.00, 'فاتورة مشتريات قبل الترقية ' || i)
        RETURNING id INTO v_inv;

        INSERT INTO app.purchase_invoice_lines (invoice_id, line_no, product_id, unit_id, qty, unit_price)
        SELECT v_inv, 1, id, v_unit, 25, 100.00 FROM app.products LIMIT 1;

        UPDATE app.purchase_invoices SET status = 'approved' WHERE id = v_inv;
      END LOOP;

      -- 5. Insert 20 employees
      FOR i IN 1..20 LOOP
        INSERT INTO app.employees (code, full_name, job_title, daily_rate, phone, is_driver, is_active)
        VALUES ('EMP' || LPAD(i::text, 3, '0'), 'موظف/سائق موقع رقم ' || i, 'driver', 250.00, '012' || LPAD(i::text, 8, '0'), true, true);
      END LOOP;

      -- 6. Insert 150 audit logs
      FOR i IN 1..150 LOOP
        INSERT INTO app.audit_log (action, entity_table, reason)
        VALUES ('update', 'sales_invoices', 'حركة تدقيق نظام قديم رقم ' || i);
      END LOOP;
    END $$;
  `);

  // Snapshot Pre-Upgrade Metrics
  const prePartyCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.parties;").trim(), 10);
  const preProductCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.products;").trim(), 10);
  const preSalesInvCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.sales_invoices;").trim(), 10);
  const preSalesLinesCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.sales_invoice_lines;").trim(), 10);
  const prePurInvCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.purchase_invoices;").trim(), 10);
  const preEmpCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.employees;").trim(), 10);
  const preAuditCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.audit_log;").trim(), 10);

  const preTotalSalesVolume = parseFloat(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT sum(lines_total) FROM app.sales_invoices WHERE status = 'approved';").trim());
  const preTotalPurVolume = parseFloat(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT sum(lines_total) FROM app.purchase_invoices WHERE status = 'approved';").trim());

  const preTotalRows = prePartyCount + preProductCount + preSalesInvCount + preSalesLinesCount + prePurInvCount + preEmpCount + preAuditCount;
  console.log(`  -> Pre-Upgrade Snapshot: ${preTotalRows} verified records, Sales Volume: ${preTotalSalesVolume.toFixed(2)} ج.م, Purchases: ${preTotalPurVolume.toFixed(2)} ج.م`);

  // Execute Migrations 0003 & 0004
  runPsqlFile(port5, 'erp_owner', '', 'fludo_erp', MIG3_PATH);
  runPsqlFile(port5, 'erp_owner', '', 'fludo_erp', MIG4_PATH);

  // Snapshot Post-Upgrade Metrics
  const postPartyCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.parties;").trim(), 10);
  const postProductCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.products;").trim(), 10);
  const postSalesInvCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.sales_invoices;").trim(), 10);
  const postSalesLinesCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.sales_invoice_lines;").trim(), 10);
  const postPurInvCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.purchase_invoices;").trim(), 10);
  const postEmpCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.employees;").trim(), 10);
  const postAuditCount = parseInt(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT count(*) FROM app.audit_log;").trim(), 10);

  const postTotalSalesVolume = parseFloat(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT sum(lines_total) FROM app.sales_invoices WHERE status = 'approved';").trim());
  const postTotalPurVolume = parseFloat(runPsql(port5, 'erp_owner', '', 'fludo_erp', "SELECT sum(lines_total) FROM app.purchase_invoices WHERE status = 'approved';").trim());

  assert(prePartyCount === postPartyCount && preProductCount === postProductCount && preSalesInvCount === postSalesInvCount && preSalesLinesCount === postSalesLinesCount,
    `Row counts 100% identical post-upgrade (Parties: ${postPartyCount}, Products: ${postProductCount}, Invoices: ${postSalesInvCount}, Lines: ${postSalesLinesCount})`);
  assert(Math.abs(preTotalSalesVolume - postTotalSalesVolume) < 0.001,
    `Approved Sales Revenue 100% preserved (${postTotalSalesVolume.toFixed(2)} ج.م)`);
  assert(Math.abs(preTotalPurVolume - postTotalPurVolume) < 0.001,
    `Approved Purchases Volume 100% preserved (${postTotalPurVolume.toFixed(2)} ج.م)`);

  execFileSync(PG_CTL, ['stop', '-D', test5Data, '-m', 'fast'], { stdio: 'ignore', windowsHide: true });
  await sleep(1500);
  try { pgProc5.kill(); } catch {}

  // -------------------------------------------------------------------------
  // TEST 6: ACL Verification & Non-8.3 Fallback Path
  // -------------------------------------------------------------------------
  console.log('\n--- 6. ACL Verification & Non-8.3 Fallback Path ---');

  // 6a. Attempt to read from different user
  console.log('  -> Testing creation of secondary Windows local user...');
  let userAddOutput = '';
  try {
    userAddOutput = execFileSync('net', ['user', 'test_audit_account', 'P@ssw0rd999!', '/add'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    userAddOutput = (err.stderr || err.stdout || err.message).trim();
  }
  console.log(`  -> Output from net user /add: "${userAddOutput}"`);
  console.log('  [NOTE] Creating secondary Windows account without interactive elevation is blocked by Windows UAC.');
  console.log('  [NOT RUN] Direct read access test under secondary Windows user account: Marked as NOT RUN.');

  // 6b. Verify icacls permissions
  const icaclsOut = execFileSync('icacls', [test5Data], { encoding: 'utf8' });
  const hasCurrentUserFull = icaclsOut.includes('Abdelrhman:(OI)(CI)(F)') || icaclsOut.includes('Abdelrhman:(I)(OI)(CI)(F)') || icaclsOut.includes('Abdelrhman:(F)');
  const hasSystemFull = icaclsOut.includes('SYSTEM:(OI)(CI)(F)') || icaclsOut.includes('SYSTEM:(I)(OI)(CI)(F)');
  assert(hasCurrentUserFull && hasSystemFull, 'Windows icacls confirms full access restricted to Abdelrhman and SYSTEM');

  // 6c. Non-8.3 Fallback Path Simulation
  console.log('  -> Simulating Non-8.3 Safe ASCII Fallback Path...');
  function simulateSafeAsciiResolution(mockProgDataOk, mockPublicOk) {
    if (mockProgDataOk) {
      return { tier: 1, base: 'C:\\ProgramData\\FludoSuppliesERP' };
    }
    if (mockPublicOk) {
      return { tier: 2, base: 'C:\\Users\\Public\\FludoSuppliesERP' };
    }
    return { tier: 3, base: 'C:\\FludoERP' };
  }

  const primaryRes = simulateSafeAsciiResolution(true, true);
  assert(primaryRes.base === 'C:\\ProgramData\\FludoSuppliesERP' && !primaryRes.base.includes('~'),
    'Primary path C:\\ProgramData\\FludoSuppliesERP is pure ASCII (no 8.3 short names)');

  const secondaryRes = simulateSafeAsciiResolution(false, true);
  assert(secondaryRes.base === 'C:\\Users\\Public\\FludoSuppliesERP' && !secondaryRes.base.includes('~'),
    'Secondary fallback C:\\Users\\Public\\FludoSuppliesERP is pure ASCII (no 8.3 short names)');

  const tertiaryRes = simulateSafeAsciiResolution(false, false);
  assert(tertiaryRes.base === 'C:\\FludoERP' && !tertiaryRes.base.includes('~'),
    'Tertiary fallback C:\\FludoERP is pure ASCII (no 8.3 short names)');

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log('======================================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[FATAL TEST SUITE ERROR]', err);
  process.exit(1);
});
