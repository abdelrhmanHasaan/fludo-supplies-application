const fs = require('fs');
const path = require('path');

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const rootDir = path.resolve(__dirname, '..');
const uiDist = path.join(rootDir, 'apps', 'ui', 'dist');
const uiTarget = path.join(rootDir, 'apps', 'desktop', 'ui');

const apiDist = path.join(rootDir, 'services', 'api', 'dist');
const apiTarget = path.join(rootDir, 'apps', 'desktop', 'api');

console.log('[PREPARE] Copying UI bundle to desktop package...');
if (fs.existsSync(uiDist)) {
  copyDirSync(uiDist, uiTarget);
  console.log('  ✓ UI copied successfully to:', uiTarget);
} else {
  console.error('  ✗ UI dist not found. Run npm run build:ui first.');
  process.exit(1);
}

console.log('[PREPARE] Copying API bundle to desktop package...');
if (fs.existsSync(apiDist)) {
  copyDirSync(apiDist, apiTarget);
  console.log('  ✓ API copied successfully to:', apiTarget);
} else {
  console.error('  ✗ API dist not found. Run npm run build:api first.');
  process.exit(1);
}

// Copy assets (yomia template)
const assetsSrc = path.join(rootDir, 'assets');
const assetsDest = path.join(rootDir, 'apps', 'desktop', 'assets');
if (fs.existsSync(assetsSrc)) {
  copyDirSync(assetsSrc, assetsDest);
  console.log('  ✓ Assets (templates) copied to:', assetsDest);
}

// Copy migrations
const migrationsSrc = path.join(rootDir, 'db', 'migrations');
const migrationsDest = path.join(rootDir, 'apps', 'desktop', 'db', 'migrations');
if (fs.existsSync(migrationsSrc)) {
  copyDirSync(migrationsSrc, migrationsDest);
  console.log('  ✓ Database migrations copied to desktop package.');
}

const sqlMigration = path.join(rootDir, 'db', 'migrations', '0001_initial.sql');
if (fs.existsSync(sqlMigration)) {
  fs.copyFileSync(sqlMigration, path.join(apiTarget, '0001_initial.sql'));
  fs.copyFileSync(sqlMigration, path.join(rootDir, 'apps', 'desktop', '0001_initial.sql'));
  console.log('  ✓ Initial SQL schema migration copied to desktop package.');
}

const sqlMigration2 = path.join(rootDir, 'db', 'migrations', '0002_fix_constraints_and_search.sql');
if (fs.existsSync(sqlMigration2)) {
  fs.copyFileSync(sqlMigration2, path.join(apiTarget, '0002_fix_constraints_and_search.sql'));
  fs.copyFileSync(sqlMigration2, path.join(rootDir, 'apps', 'desktop', '0002_fix_constraints_and_search.sql'));
  console.log('  ✓ 0002 SQL schema migration copied to desktop package.');
}

// Ensure PostgreSQL Portable Runtime is staged in apps/desktop/pgsql
const pgsqlDest = path.join(rootDir, 'apps', 'desktop', 'pgsql');
const pgsqlDestExe = path.join(pgsqlDest, 'bin', 'postgres.exe');
if (fs.existsSync(pgsqlDestExe)) {
  console.log('  ✓ Bundled PostgreSQL portable runtime already staged at:', pgsqlDest);
} else {
  console.log('[PREPARE] Staging PostgreSQL portable runtime...');
  const pgSourceCandidates = [
    'C:\\Program Files\\PostgreSQL\\18',
    'C:\\Program Files\\PostgreSQL\\17',
    'C:\\Program Files\\PostgreSQL\\16',
    'C:\\Program Files\\PostgreSQL\\15',
  ];
  const pgSource = pgSourceCandidates.find((s) => fs.existsSync(path.join(s, 'bin', 'postgres.exe')));
  if (pgSource) {
    console.log('  Copying PostgreSQL from:', pgSource);
    // 1. bin (exclude unnecessary GUI/wx tools)
    copyDirSync(path.join(pgSource, 'bin'), path.join(pgsqlDest, 'bin'));
    // 2. lib
    copyDirSync(path.join(pgSource, 'lib'), path.join(pgsqlDest, 'lib'));
    // 3. share
    copyDirSync(path.join(pgSource, 'share'), path.join(pgsqlDest, 'share'));
    console.log('  ✓ Bundled PostgreSQL portable runtime staged successfully.');
  } else {
    console.warn('  ⚠ No local PostgreSQL source installation found to bundle.');
  }
}

console.log('[PREPARE] Packaging staging completed successfully.');
