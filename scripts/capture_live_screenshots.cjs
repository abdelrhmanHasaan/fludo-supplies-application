const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'fludo-supplies-erp-local-secret-key-32-chars-min';
const token = jwt.sign(
  {
    userId: '3395eaef-5197-47c2-9850-6563983eed93',
    username: 'admin',
    role: 'admin',
  },
  JWT_SECRET,
  { expiresIn: '12h' }
);

const ARTIFACT_DIR = path.resolve('C:/Users/Abdelrhman/.gemini/antigravity/brain/11761ab4-9226-4e3d-b4e9-0410c9946ca1');
const UI_DIR = path.resolve('c:/FludoCompany/Supllies ERP application/apps/desktop/ui');

// Start API server as child process
console.log('[1/4] Starting API server on port 4005...');
const apiProc = spawn('node', ['services/api/dist/index.js'], {
  env: {
    ...process.env,
    PORT: '4005',
    PGPORT: '5434',
    PGUSER: 'erp_owner',
    PGPASSWORD: 'erp_password_local_123',
  },
  stdio: 'ignore',
});

// Create static HTTP server for UI
console.log('[2/4] Starting static UI server on port 3005...');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0].split('#')[0];
  let filePath = path.join(UI_DIR, urlPath === '/' ? 'index.html' : urlPath);

  if (!fs.existsSync(filePath)) {
    filePath = path.join(UI_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let content = fs.readFileSync(filePath, 'utf8');
    const injection = `
      <script>
        window.__API_BASE__ = 'http://127.0.0.1:4005/api';
        localStorage.setItem('fludo_token', ${JSON.stringify(token)});
        localStorage.setItem('fludo_user', JSON.stringify({
          id: '3395eaef-5197-47c2-9850-6563983eed93',
          username: 'admin',
          fullName: 'المدير العام',
          role: 'admin'
        }));
      </script>
    `;
    content = content.replace('</head>', `${injection}</head>`);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } else {
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(3005, '127.0.0.1', async () => {
  console.log('[3/4] UI server running at http://127.0.0.1:3005');

  // Wait 3 seconds for API to initialize
  await new Promise((r) => setTimeout(r, 3000));

  const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

  const routes = [
    { name: '01_dashboard_overview.png', hash: '#dashboard' },
    { name: '02_customer_shipments_ledger.png', hash: '#customers' },
    { name: '03_inventory_4_dimensions.png', hash: '#inventory' },
    { name: '04_invoices_registry.png', hash: '#invoices' },
    { name: '05_treasury_cash_accounts.png', hash: '#treasury' },
    { name: '06_employees_and_payroll.png', hash: '#payroll' },
    { name: '07_dataport_staging_review.png', hash: '#dataport' },
  ];

  console.log('[4/4] Capturing screenshots using headless browser...');
  for (const r of routes) {
    const outPath = path.join(ARTIFACT_DIR, r.name);
    const targetUrl = `http://127.0.0.1:3005/${r.hash}`;
    console.log(`  Capturing ${r.name} from ${targetUrl}...`);

    try {
      execSync(
        `"${browserPath}" --headless --disable-gpu --hide-scrollbars --window-size=1440,920 --screenshot="${outPath}" "${targetUrl}"`,
        { stdio: 'ignore', timeout: 15000 }
      );
      if (fs.existsSync(outPath)) {
        const sz = fs.statSync(outPath).size;
        console.log(`  ✓ Saved ${r.name} (${(sz / 1024).toFixed(1)} KB)`);
      }
    } catch (err) {
      console.error(`  ✗ Failed to capture ${r.name}:`, err.message);
    }
  }

  // Cleanup
  console.log('Finished capturing screenshots! Shutting down servers...');
  server.close();
  apiProc.kill();
  process.exit(0);
});
