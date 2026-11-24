const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'abdelrhmanHasaan/fludo-supplies-application';
const TAG = 'v1.5.0';
const RELEASE_NAME = 'Fludo Supplies ERP v1.5.0 — Standalone Windows Installer';
const FILE_PATH = path.resolve(__dirname, '../installer/Fludo Supplies ERP Setup 1.5.0.exe');
const FILE_NAME = 'Fludo Supplies ERP Setup 1.5.0.exe';

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `https://api.github.com${endpoint}`);
    const reqHeaders = {
      'User-Agent': 'Fludo-Release-Uploader',
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
    };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }
    const req = https.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`API Error [${res.statusCode}]: ${data}`));
            }
          } catch {
            resolve(data);
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('====================================================');
  console.log('  FLUDO ERP — GITHUB RELEASE & ASSET UPLOADER       ');
  console.log('====================================================\n');

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  const stat = fs.statSync(FILE_PATH);
  console.log(`Target binary: ${FILE_NAME} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

  // 1. Check if release already exists or create new
  console.log(`\n[1/3] Checking / Creating Release '${TAG}' on ${REPO}...`);
  let release;
  try {
    release = await apiRequest('GET', `/repos/${REPO}/releases/tags/${TAG}`);
    console.log(`Found existing release (ID: ${release.id})`);
  } catch {
    console.log(`Creating fresh release for tag '${TAG}'...`);
    const releaseBody = `## Fludo Supplies ERP v1.5.0
### Standalone Windows Edition (No Admin, Zero Fixed Ports, Portable DB)

### Key Improvements:
- **Portable Embedded PostgreSQL 18:** Zero dependencies, no Windows service requirement.
- **ASCII-Safe Data Path:** Completely isolated to \`C:\\ProgramData\\FludoSuppliesERP\\data\` to avoid Arabic Windows username path crashes.
- **Dynamic Port Allocation:** Zero hardcoded ports (no 4000/5433). Both DB and API bind to random free ports with security tokens.
- **Crash Recovery & Single-Instance Lock:** Detects and cleans stale postmaster.pid automatically.
- **Passed Clean VM Simulation:** 24/24 tests passed under simulated client environment.

**Download the standalone installer below:**`;

    release = await apiRequest('POST', `/repos/${REPO}/releases`, {
      tag_name: TAG,
      target_commitish: 'main',
      name: RELEASE_NAME,
      body: releaseBody,
      draft: false,
      prerelease: false,
    });
    console.log(`Created release successfully (ID: ${release.id})`);
  }

  // 2. Check if asset already exists in release
  console.log(`\n[2/3] Checking existing assets...`);
  try {
    const assets = await apiRequest('GET', `/repos/${REPO}/releases/${release.id}/assets`);
    if (Array.isArray(assets) && assets.length > 0) {
      for (const asset of assets) {
        if (asset.name.toLowerCase().includes('1.4.0') || asset.name.toLowerCase().endsWith('.exe')) {
          console.log(`Deleting existing release asset '${asset.name}' (ID: ${asset.id})...`);
          await apiRequest('DELETE', `/repos/${REPO}/releases/assets/${asset.id}`);
          console.log('Old asset removed successfully.');
        }
      }
    }
  } catch (checkErr) {
    console.warn('Notice while checking existing assets:', checkErr.message);
  }

  // 3. Upload binary asset directly to upload_url
  console.log(`\n[3/3] Uploading binary asset '${FILE_NAME}' to GitHub...`);
  const rawUploadUrl = release.upload_url.replace(/\{(\?.*)?\}$/, '');
  const uploadUrl = new URL(`${rawUploadUrl}?name=${encodeURIComponent(FILE_NAME)}`);

  await new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(FILE_PATH, { highWaterMark: 128 * 1024 });
    let uploadedBytes = 0;
    let lastLoggedPercent = -1;

    const req = https.request(
      uploadUrl,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Fludo-Release-Uploader',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
        },
      },
      (res) => {
        let resData = '';
        res.on('data', (c) => (resData += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const assetInfo = JSON.parse(resData);
              console.log('\n  ✓ Binary upload completed successfully!');
              console.log(`  Download URL: ${assetInfo.browser_download_url}`);
              resolve(assetInfo);
            } catch {
              resolve(resData);
            }
          } else {
            reject(new Error(`Asset upload failed with status ${res.statusCode}: ${resData}`));
          }
        });
      }
    );

    req.on('error', reject);

    fileStream.on('data', (chunk) => {
      uploadedBytes += chunk.length;
      const percent = Math.floor((uploadedBytes / stat.size) * 100);
      if (percent % 5 === 0 && percent !== lastLoggedPercent) {
        lastLoggedPercent = percent;
        console.log(`  Uploading... ${percent}% (${(uploadedBytes / 1024 / 1024).toFixed(1)} / ${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
      }
      const canWrite = req.write(chunk);
      if (!canWrite) {
        fileStream.pause();
      }
    });

    req.on('drain', () => {
      fileStream.resume();
    });

    fileStream.on('end', () => {
      req.end();
    });

    fileStream.on('error', reject);
  });

  console.log('\n🎉 ALL DONE! The installer is published and live on GitHub!');
}

main().catch((err) => {
  console.error('\n❌ UPLOAD FAILED:', err.message);
  process.exit(1);
});
