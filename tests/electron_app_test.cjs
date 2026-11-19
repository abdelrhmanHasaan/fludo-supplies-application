const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ELECTRON_EXE = path.resolve(__dirname, '../apps/desktop/release/win-unpacked/Fludo Supplies ERP.exe');
const SCREENSHOT_PATH = path.join(__dirname, 'screenshots_deep', 'electron_packaged_app.png');

function checkCdpReady(port = 9222) {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

async function testElectronApp() {
  console.log('====================================================');
  console.log('   TESTING PACKAGED ELECTRON WINDOWS APP (.EXE)    ');
  console.log('====================================================');
  console.log('Target Exe:', ELECTRON_EXE);
  console.log('Exists:', fs.existsSync(ELECTRON_EXE));

  if (!fs.existsSync(ELECTRON_EXE)) {
    throw new Error('Packaged exe does not exist!');
  }

  // Clean environment without ELECTRON_RUN_AS_NODE
  const cleanEnv = { ...process.env };
  delete cleanEnv.ELECTRON_RUN_AS_NODE;

  console.log('Spawning Electron process with remote debugging port 9222...');
  const appProc = spawn(ELECTRON_EXE, ['--remote-debugging-port=9222'], {
    env: cleanEnv,
    stdio: 'pipe',
  });

  appProc.stdout.on('data', (d) => console.log(' [ELECTRON STDOUT]', d.toString().trim()));
  appProc.stderr.on('data', (d) => console.log(' [ELECTRON STDERR]', d.toString().trim()));

  // Wait for CDP endpoint to become ready
  console.log('Waiting for CDP on port 9222...');
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkCdpReady(9222)) {
      ready = true;
      break;
    }
  }

  if (!ready) {
    appProc.kill();
    throw new Error('Electron did not open debugging port 9222 in time');
  }

  console.log('Connecting Puppeteer to Electron via CDP...');
  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9222',
    defaultViewport: { width: 1400, height: 900 },
  });

  try {
    const pages = await browser.pages();
    console.log(`Found ${pages.length} page(s) in Electron`);
    const page = pages.length > 0 ? pages[0] : (await browser.pages())[0];

    page.on('console', (msg) => {
      console.log(' [ELECTRON PAGE CONSOLE]', msg.type(), msg.text());
    });

    page.on('pageerror', (err) => {
      console.error(' [ELECTRON PAGE ERROR]', err.message);
    });

    console.log('Waiting for UI content inside Electron window...');
    await page.waitForFunction(
      () => document.body && document.body.innerText.trim().length > 10,
      { timeout: 15000 }
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n--- ELECTRON APP WINDOW CONTENT PREVIEW ---');
    console.log(bodyText.slice(0, 300).replace(/\n+/g, ' '));
    console.log('-------------------------------------------\n');

    await page.screenshot({ path: SCREENSHOT_PATH });
    console.log('Screenshot saved to:', SCREENSHOT_PATH);

    if (bodyText.includes('الرضا') || bodyText.includes('تسجيل الدخول') || bodyText.includes('لوحة التحكم')) {
      console.log('🎉 SUCCESS: Electron packaged app rendered the UI perfectly!');
    } else {
      throw new Error(`Unexpected page content: ${bodyText.slice(0, 200)}`);
    }
  } finally {
    await browser.disconnect();
    appProc.kill();
  }
}

testElectronApp().catch((err) => {
  console.error('FATAL ELECTRON APP TEST ERROR:', err);
  process.exit(1);
});
