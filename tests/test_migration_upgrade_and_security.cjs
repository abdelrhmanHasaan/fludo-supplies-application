const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { Pool } = require('pg');

// Ensure UTF-8 client encoding for PostgreSQL CLI tools on Windows
process.env.PGCLIENTENCODING = 'UTF8';

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

function resolvePostgresBinaries() {
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\18\\bin',
    'C:\\Program Files\\PostgreSQL\\17\\bin',
    'C:\\Program Files\\PostgreSQL\\16\\bin',
    path.resolve(__dirname, '../apps/desktop/pgsql/bin'),
  ];
  const binDir = candidates.find((b) => fs.existsSync(path.join(b, 'postgres.exe')));
  if (!binDir) throw new Error('PostgreSQL binaries not found.');
  return {
    binDir,
    postgresExe: path.join(binDir, 'postgres.exe'),
    initdbExe: path.join(binDir, 'initdb.exe'),
    createdbExe: path.join(binDir, 'createdb.exe'),
    psqlExe: path.join(binDir, 'psql.exe'),
    pgDumpExe: path.join(binDir, 'pg_dump.exe'),
    pgIsReadyExe: path.join(binDir, 'pg_isready.exe'),
    pgCtlExe: path.join(binDir, 'pg_ctl.exe'),
    shareDir: path.join(path.dirname(binDir), 'share'),
  };
}

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function runUpgradeTest() {
  console.log('======================================================================');
  console.log('  FLUDO SUPPLIES ERP — UPGRADE, SCRAM AUTH & DML ROLE TEST (v1.6.0)   ');
  console.log('======================================================================\n');

  const pgBinaries = resolvePostgresBinaries();
  const testBaseDir = 'C:\\ProgramData\\FludoSuppliesERP\\test_upgrade_suite';
  const testDataDir = path.join(testBaseDir, 'data');
  const testLogsDir = path.join(testBaseDir, 'logs');
  const testBackupsDir = path.join(testBaseDir, 'backups');

  // Clean prior test artifacts
  try {
    if (fs.existsSync(path.join(testDataDir, 'postmaster.pid'))) {
      try {
        execFileSync(pgBinaries.pgCtlExe, ['stop', '-D', testDataDir, '-m', 'immediate'], { stdio: 'ignore' });
      } catch {}
    }
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  } catch {}

  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(testLogsDir, { recursive: true });
  fs.mkdirSync(testBackupsDir, { recursive: true });

  const testPort = await getFreePort();
  console.log(`[TEST SETUP] Dynamic Test Port: ${testPort}`);
  console.log(`[TEST SETUP] Test Data Directory: ${testDataDir}`);

  // 1. ACL Test on Test Directory
  console.log('\n--- 1. Testing Windows ACL Enforcement ---');
  try {
    const currentUsername = process.env.USERNAME || 'SYSTEM';
    execFileSync('icacls', [
      testDataDir,
      '/inheritance:r',
      '/grant:r', `${currentUsername}:(OI)(CI)F`,
      '/grant:r', 'SYSTEM:(OI)(CI)F',
      '/grant:r', 'Administrators:(OI)(CI)F'
    ], { stdio: 'ignore' });
    assert(true, 'Windows icacls ACL applied without errors');
  } catch (e) {
    assert(false, 'Windows icacls ACL application failed', e.message);
  }

  // 2. Initialize cluster up to Migration 0002 only
  console.log('\n--- 2. Initializing Cluster at Migration 0002 Baseline ---');
  const initArgs = ['-D', testDataDir, '-U', 'erp_owner', '-A', 'trust', '-E', 'UTF8'];
  if (fs.existsSync(pgBinaries.shareDir)) initArgs.push('-L', pgBinaries.shareDir);
  execFileSync(pgBinaries.initdbExe, initArgs, { stdio: 'ignore' });

  // Write initial postgresql.conf
  const confPath = path.join(testDataDir, 'postgresql.conf');
  fs.writeFileSync(confPath, `port = ${testPort}\nlisten_addresses = '127.0.0.1'\nshared_buffers = 32MB\npassword_encryption = 'scram-sha-256'\n`);

  // Start temporary postgres process
  const pgLogFd = fs.openSync(path.join(testLogsDir, 'postgres.log'), 'a');
  let pgProc = spawn(pgBinaries.postgresExe, ['-D', testDataDir, '-p', String(testPort)], {
    detached: false,
    stdio: ['ignore', pgLogFd, pgLogFd],
  });

  // Wait for pg_isready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      execFileSync(pgBinaries.pgIsReadyExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner'], { stdio: 'ignore' });
      ready = true;
      break;
    } catch {}
  }
  assert(ready, 'PostgreSQL started and accepted connections');

  // Create fludo_erp database
  execFileSync(pgBinaries.createdbExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', 'fludo_erp'], { stdio: 'ignore' });

  // Apply Migration 0001
  const mig1Path = path.resolve(__dirname, '../db/migrations/0001_initial.sql');
  try {
    execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-f', mig1Path], { stdio: 'pipe' });
  } catch (err) {
    console.error('MIG1 ERROR:', err.stderr ? err.stderr.toString() : err.message);
  }

  // Apply Migration 0002
  const mig2Path = path.resolve(__dirname, '../db/migrations/0002_fix_constraints_and_search.sql');
  try {
    execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-f', mig2Path], { stdio: 'pipe' });
  } catch (err) {
    console.error('MIG2 ERROR:', err.stderr ? err.stderr.toString() : err.message);
  }

  // Ensure app.schema_migrations has 0001 and 0002
  const initMigTableSql = `
    CREATE SCHEMA IF NOT EXISTS app;
    CREATE TABLE IF NOT EXISTS app.schema_migrations (
      version text PRIMARY KEY,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO app.schema_migrations (version, checksum) VALUES
      ('0001_initial', md5('0001_initial')),
      ('0002_fix_constraints_and_search', md5('0002_fix_constraints_and_search'))
    ON CONFLICT (version) DO NOTHING;
  `;
  execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-c', initMigTableSql], { stdio: 'ignore' });

  // Insert seed customer and product to verify pre-upgrade data preservation
  const seedSql = `
    INSERT INTO app.parties (name, is_customer, is_supplier, phone)
    VALUES ('عميل موجود قبل الترقية', true, false, '01011112222');
    INSERT INTO app.products (name, code, unit_id, default_sale_price)
    VALUES ('صنف قديم قبل الترقية', 'P0001', (SELECT id FROM app.units LIMIT 1), 120);
  `;
  try {
    execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-c', seedSql], { stdio: 'pipe' });
  } catch (err) {
    console.error('PSQL SEED ERROR:', err.stderr ? err.stderr.toString() : err.message);
    throw err;
  }

  const baselineVersions = execFileSync(
    pgBinaries.psqlExe,
    ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-t', '-A', '-c', 'SELECT version FROM app.schema_migrations ORDER BY version;'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim().split('\n').map((s) => s.trim());

  assert(
    baselineVersions.length === 2 && baselineVersions.includes('0001_initial') && baselineVersions.includes('0002_fix_constraints_and_search'),
    `Database successfully initialized at Migration 0002 baseline (Found: ${baselineVersions.join(', ')})`
  );

  // 3. Execute the Upgrade & Security Hardening Pipeline
  console.log('\n--- 3. Running Upgrade Pipeline (SCRAM Auth + Pre-migration pg_dump + Migrations 0003 & 0004) ---');
  
  // Dynamic SCRAM credentials
  const ownerPass = 'SecOwner_' + crypto.randomBytes(16).toString('hex');
  const runtimePass = 'SecRuntime_' + crypto.randomBytes(16).toString('hex');

  // Configure Roles in DB
  const roleSetupSql = `
    ALTER ROLE erp_owner WITH PASSWORD '${ownerPass}';
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_runtime') THEN
        CREATE ROLE erp_runtime WITH LOGIN PASSWORD '${runtimePass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      ELSE
        ALTER ROLE erp_runtime WITH PASSWORD '${runtimePass}';
      END IF;
    END
    $$;
  `;
  execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'postgres', '-c', roleSetupSql], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Rewrite pg_hba.conf to enforce scram-sha-256 strictly (no trust)
  const hbaPath = path.join(testDataDir, 'pg_hba.conf');
  fs.writeFileSync(hbaPath, `# TYPE DATABASE USER ADDRESS METHOD\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n`);
  execFileSync(pgBinaries.pgCtlExe, ['reload', '-D', testDataDir], { stdio: ['ignore', 'ignore', 'pipe'] });
  assert(true, 'pg_hba.conf reloaded with strict SCRAM-SHA-256 enforcement');

  // Test that unauthenticated/invalid connection is now REJECTED
  let authRejected = false;
  try {
    execFileSync(pgBinaries.psqlExe, ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-c', 'SELECT 1;'], {
      env: { ...process.env, PGPASSWORD: 'invalid_password_test', PGCONNECT_TIMEOUT: '2' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const msg = (err.stderr ? err.stderr.toString() : '') + err.message;
    if (msg.includes('password authentication failed') || msg.includes('SCRAM')) {
      authRejected = true;
    }
  }
  assert(authRejected, 'Invalid / Unauthenticated password strictly REJECTED by SCRAM-SHA-256');

  // Run Pending Migrations with Pre-Migration Backups
  const REQUIRED_SCHEMA_VERSION = 4;
  const pendingMigrations = [
    { version: '0003_comprehensive_schema_update', file: '0003_comprehensive_schema_update.sql' },
    { version: '0004_figjam_overhaul', file: '0004_figjam_overhaul.sql' },
  ];

  for (const mig of pendingMigrations) {
    // 3.1 Pre-migration pg_dump backup
    const backupFile = path.join(testBackupsDir, `pre_migration_${mig.version}_${Date.now()}.sql`);
    execFileSync(pgBinaries.pgDumpExe, [
      '-h', '127.0.0.1',
      '-p', String(testPort),
      '-U', 'erp_owner',
      '-d', 'fludo_erp',
      '-f', backupFile,
      '--clean', '--if-exists'
    ], {
      env: { ...process.env, PGPASSWORD: ownerPass },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const backupExists = fs.existsSync(backupFile);
    const backupSize = backupExists ? fs.statSync(backupFile).size : 0;
    assert(backupExists && backupSize > 1000, `Pre-migration pg_dump backup generated for ${mig.version} (${backupSize} bytes)`);

    // 3.2 Apply migration
    const migSqlPath = path.resolve(__dirname, `../db/migrations/${mig.file}`);
    execFileSync(pgBinaries.psqlExe, [
      '-h', '127.0.0.1',
      '-p', String(testPort),
      '-U', 'erp_owner',
      '-d', 'fludo_erp',
      '-f', migSqlPath
    ], {
      env: { ...process.env, PGPASSWORD: ownerPass },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 3.3 Record in schema_migrations
    execFileSync(pgBinaries.psqlExe, [
      '-h', '127.0.0.1',
      '-p', String(testPort),
      '-U', 'erp_owner',
      '-d', 'fludo_erp',
      '-c', `INSERT INTO app.schema_migrations (version, checksum) VALUES ('${mig.version}', md5('${mig.version}')) ON CONFLICT (version) DO NOTHING;`
    ], {
      env: { ...process.env, PGPASSWORD: ownerPass },
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  // Grant DML-only privileges to erp_runtime
  const grantDmlSql = `
    GRANT CONNECT ON DATABASE fludo_erp TO erp_runtime;
    GRANT USAGE ON SCHEMA app TO erp_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO erp_runtime;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO erp_runtime;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO erp_runtime;
    REVOKE CREATE ON SCHEMA app FROM erp_runtime;
    REVOKE CREATE ON SCHEMA public FROM erp_runtime;
  `;
  execFileSync(pgBinaries.psqlExe, [
    '-h', '127.0.0.1',
    '-p', String(testPort),
    '-U', 'erp_owner',
    '-d', 'fludo_erp',
    '-c', grantDmlSql
  ], {
    env: { ...process.env, PGPASSWORD: ownerPass },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Verify REQUIRED_SCHEMA_VERSION in DB
  const upgradedCount = parseInt(execFileSync(
    pgBinaries.psqlExe,
    ['-h', '127.0.0.1', '-p', String(testPort), '-U', 'erp_owner', '-d', 'fludo_erp', '-t', '-A', '-c', "SELECT count(*) FROM app.schema_migrations;"],
    { env: { ...process.env, PGPASSWORD: ownerPass }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim(), 10);

  assert(upgradedCount === REQUIRED_SCHEMA_VERSION, `REQUIRED_SCHEMA_VERSION verified (Expected: ${REQUIRED_SCHEMA_VERSION}, Got: ${upgradedCount})`);

  // 4. Test DML-only Role Restrictions on erp_runtime
  console.log('\n--- 4. Testing erp_runtime Role Restrictions (DML Only) ---');
  const runtimePool = new Pool({
    host: '127.0.0.1',
    port: testPort,
    database: 'fludo_erp',
    user: 'erp_runtime',
    password: runtimePass,
  });

  // 4.1 Verify DDL execution FAILS for erp_runtime
  let ddlBlocked = false;
  try {
    await runtimePool.query('CREATE TABLE app.should_fail_ddl (id int);');
  } catch (err) {
    if (err.message.includes('permission denied for schema app')) {
      ddlBlocked = true;
    }
  }
  assert(ddlBlocked, 'erp_runtime CANNOT execute DDL (CREATE TABLE blocked with permission denied)');

  // 4.2 Verify DROP TABLE FAILS for erp_runtime
  let dropBlocked = false;
  try {
    await runtimePool.query('DROP TABLE app.products;');
  } catch (err) {
    if (err.message.includes('must be owner of table products') || err.message.includes('permission denied')) {
      dropBlocked = true;
    }
  }
  assert(dropBlocked, 'erp_runtime CANNOT DROP existing tables (blocked by PostgreSQL ownership)');

  // 5. Test Required Functional Operations as erp_runtime
  console.log('\n--- 5. Performing Required Operations via erp_runtime (Treasury 20000 & Free-text Unit Product) ---');

  // 5.1 Add treasury with opening balance 20000
  const treasuryRes = await runtimePool.query(`
    INSERT INTO app.cash_accounts (name, kind, opening_balance, is_active)
    VALUES ('خزينة ترقية تجريبية 20000', 'cash', 20000.00, true)
    RETURNING id, name, kind, opening_balance;
  `);
  assert(
    treasuryRes.rows.length === 1 && Number(treasuryRes.rows[0].opening_balance) === 20000,
    `Added treasury account as erp_runtime with opening balance 20000 (ID: ${treasuryRes.rows[0].id})`
  );

  // 5.2 Add product with free-text unit
  const freeTextUnit = 'شكاير بلاستيك منسوج 50كجم';
  const productRes = await runtimePool.query(`
    INSERT INTO app.products (name, code, unit_name, default_sale_price, default_purchase_price)
    VALUES ('صنف اختبار الترقية بالوحدة الحرة', 'P0008', $1, 350.00, 300.00)
    RETURNING id, name, code, unit_name, default_sale_price;
  `, [freeTextUnit]);
  assert(
    productRes.rows.length === 1 && productRes.rows[0].unit_name === freeTextUnit,
    `Added product as erp_runtime with free-text unit '${freeTextUnit}' (Code: ${productRes.rows[0].code})`
  );

  // 5.3 Verify that free-text unit was learned by app.units
  const unitLearnedRes = await runtimePool.query(`
    SELECT name FROM app.units WHERE name = $1;
  `, [freeTextUnit]);
  assert(
    unitLearnedRes.rows.length === 1,
    `Free-text unit '${freeTextUnit}' automatically registered in app.units for autocomplete`
  );

  // 5.4 Verify prior seed data remained completely intact after 0003 & 0004
  const oldCustRes = await runtimePool.query(`SELECT name, phone FROM app.parties WHERE phone = '01011112222';`);
  assert(oldCustRes.rows.length === 1, 'Pre-upgrade customer data preserved 100% across migrations');

  // 5.5 Verify Dashboard Metrics view via erp_runtime
  const dashRes = await runtimePool.query(`SELECT * FROM app.v_dashboard_metrics;`);
  assert(dashRes.rows.length === 1, 'v_dashboard_metrics executes cleanly under erp_runtime');

  // 6. Test Await pg_ctl stop on Quit
  console.log('\n--- 6. Testing Graceful Shutdown (await pg_ctl stop -m fast) ---');
  await runtimePool.end();

  execFileSync(pgBinaries.pgCtlExe, ['stop', '-D', testDataDir, '-m', 'fast'], { stdio: 'ignore' });
  const pidFileExists = fs.existsSync(path.join(testDataDir, 'postmaster.pid'));
  assert(!pidFileExists, 'PostgreSQL cluster stopped gracefully and postmaster.pid cleared');

  console.log('\n======================================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================\n');

  // Cleanup test folder
  try {
    fs.rmSync(testBaseDir, { recursive: true, force: true });
  } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

runUpgradeTest().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
