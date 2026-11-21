const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getShortPath(p) {
  try {
    const out = execSync(`cmd /c for %I in ("${p}") do @echo %~sI`, { encoding: 'utf8' }).trim();
    return out || p;
  } catch {
    return p;
  }
}

function resolveSafeAsciiPath(appName = 'FludoSuppliesERP') {
  // 1. Primary: C:\ProgramData\<appName>
  const progData = process.env.ProgramData || 'C:\\ProgramData';
  const candidate1 = path.join(progData, appName);
  try {
    fs.mkdirSync(candidate1, { recursive: true });
    const testFile = path.join(candidate1, 'test_perm.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return candidate1;
  } catch {}

  // 2. Secondary: Short 8.3 ASCII path of LOCALAPPDATA
  const localApp = process.env.LOCALAPPDATA || 'C:\\';
  const shortLocal = getShortPath(localApp);
  const candidate2 = path.join(shortLocal, appName);
  try {
    fs.mkdirSync(candidate2, { recursive: true });
    return candidate2;
  } catch {}

  // 3. Fallback: C:\<appName>
  const candidate3 = `C:\\${appName}`;
  fs.mkdirSync(candidate3, { recursive: true });
  return candidate3;
}

const safeBase = resolveSafeAsciiPath();
console.log('Safe base path:', safeBase);
console.log('Is pure ASCII?', /^[\x00-\x7F]*$/.test(safeBase));
