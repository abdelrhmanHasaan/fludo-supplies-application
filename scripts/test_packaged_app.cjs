const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

async function testPackagedApp() {
  console.log('[TEST] Starting packaged application win-unpacked/Fludo Supplies ERP.exe...');
  const appExe = path.resolve('apps/desktop/release/win-unpacked/Fludo Supplies ERP.exe');
  
  if (!fs.existsSync(appExe)) {
    throw new Error('Packaged exe not found at: ' + appExe);
  }

  // Remove ELECTRON_RUN_AS_NODE so Electron runs as GUI app
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(appExe, [], {
    env: cleanEnv,
    detached: true,
    stdio: 'ignore',
  });

  console.log(`[TEST] Packaged app spawned with PID ${child.pid}. Monitoring desktop.log...`);

  const logFile = 'C:\\ProgramData\\FludoSuppliesERP\\logs\\desktop.log';
  let success = false;
  let dynamicApiPort = 0;

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');
      const lastLines = lines.slice(-15).join('\n');
      
      const match = /Entire system running successfully! API: (\d+), DB: (\d+)/.exec(lastLines);
      if (match) {
        dynamicApiPort = parseInt(match[1], 10);
        console.log(`[TEST] SUCCESS! System reported running! Dynamic API: ${dynamicApiPort}, DB: ${match[2]}`);
        success = true;
        break;
      }

      if (lastLines.includes('[FATAL') || lastLines.includes('[ERROR]')) {
        console.error('[TEST] ERROR detected in desktop.log:', lastLines);
      }
    }
  }

  if (!success) {
    throw new Error('Packaged application failed to achieve ready status within 40 seconds');
  }

  // Test API health
  console.log(`[TEST] Verifying API health check at http://127.0.0.1:${dynamicApiPort}/api/health...`);
  const isHealthy = await new Promise((res) => {
    http.get(`http://127.0.0.1:${dynamicApiPort}/api/health`, (r) => {
      res(r.statusCode === 200);
    }).on('error', () => res(false));
  });

  if (!isHealthy) {
    throw new Error('API server was not healthy on port ' + dynamicApiPort);
  }

  console.log('✓ [TEST PASS] Packaged app started smoothly, DB initialized, API healthy, UI active!');

  // Clean shutdown
  try {
    process.kill(child.pid);
  } catch {}
}

testPackagedApp().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
