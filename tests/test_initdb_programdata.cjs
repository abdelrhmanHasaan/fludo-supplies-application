const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dataDir = 'C:\\ProgramData\\FludoSuppliesERP\\data';
const initdbExe = path.resolve('apps/desktop/pgsql/bin/initdb.exe');
const shareDir = path.resolve('apps/desktop/pgsql/share');

console.log('[TEST] Checking clean initdb on C:\\ProgramData\\FludoSuppliesERP\\data...');
if (fs.existsSync(dataDir)) {
  fs.rmSync(dataDir, { recursive: true, force: true });
}
fs.mkdirSync(dataDir, { recursive: true });

try {
  const out = execFileSync(initdbExe, [
    '-D', dataDir,
    '-U', 'erp_owner',
    '-A', 'trust',
    '-E', 'UTF8',
    '-L', shareDir
  ], { encoding: 'utf8' });
  console.log('✓ initdb succeeded on ProgramData ASCII path!');
  console.log('PG_VERSION exists:', fs.existsSync(path.join(dataDir, 'PG_VERSION')));
} catch (err) {
  console.error('initdb failed:', err.message);
}
