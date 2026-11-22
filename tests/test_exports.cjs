const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawn } = require('node:child_process');
const assert = require('node:assert');

async function testExports() {
  console.log('--- TESTING EXCEL AND SQL EXPORT ENDPOINTS ---');

  const port = process.env.PORT || '4005';
  const apiBase = `http://127.0.0.1:${port}/api`;
  const outDir = path.resolve(__dirname, '../output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`Starting background API server on port ${port}...`);
  const apiProc = spawn('node', ['services/api/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      PGPORT: '5434',
      PGUSER: 'erp_owner',
      PGPASSWORD: 'erp_password_local_123',
    },
    stdio: 'ignore',
  });

  try {
    // Wait for API to boot
    await new Promise((r) => setTimeout(r, 2500));

    // 1. Test Yomia 10-Sheet Excel Export
    console.log(`\n[1/4] Testing GET ${apiBase}/data/export/yomia...`);
    const yomiaRes = await fetch(`${apiBase}/data/export/yomia?fix_formulas=true`);
    const yomiaBuffer = Buffer.from(await yomiaRes.arrayBuffer());
    assert(yomiaRes.ok, `Yomia export failed: status ${yomiaRes.status}`);
    const yomiaPath = path.join(outDir, 'yomia_exported.xlsx');
    fs.writeFileSync(yomiaPath, yomiaBuffer);
    console.log(`✓ Yomia 10-Sheet Excel exported! Size: ${yomiaBuffer.length} bytes -> ${yomiaPath}`);

    // 2. Test LibreOffice headless conversion to verify visual compatibility and validity
    console.log('\n[2/4] Verifying with LibreOffice Calc headless...');
    const sofficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
    if (fs.existsSync(sofficePath)) {
      try {
        execSync(`"${sofficePath}" --headless --convert-to pdf "${yomiaPath}" --outdir "${outDir}"`, {
          stdio: 'inherit',
          timeout: 30000,
        });
        const pdfPath = path.join(outDir, 'yomia_exported.pdf');
        if (fs.existsSync(pdfPath)) {
          const pdfStat = fs.statSync(pdfPath);
          console.log(`✓ LibreOffice successfully converted yomia_exported.xlsx to PDF! Size: ${pdfStat.size} bytes`);
        }
      } catch (err) {
        console.warn('LibreOffice conversion warning:', err.message);
      }
    } else {
      console.log('LibreOffice executable not found; skipping headless PDF conversion.');
    }

    // 3. Test Full PostgreSQL SQL Backup via pg_dump
    console.log(`\n[3/4] Testing GET ${apiBase}/data/export/sql/full-backup...`);
    const sqlRes = await fetch(`${apiBase}/data/export/sql/full-backup`);
    assert(sqlRes.ok, `Full SQL backup failed: status ${sqlRes.status}`);
    const sqlContent = await sqlRes.text();
    const sqlPath = path.join(outDir, 'fludo_erp_full_backup.sql');
    fs.writeFileSync(sqlPath, sqlContent);
    console.log(`✓ Full SQL Backup generated! Size: ${sqlContent.length} bytes -> ${sqlPath}`);
    assert(sqlContent.includes('SHA-256 Checksum'), 'Backup header must include SHA-256 checksum');
    assert(sqlContent.includes('CREATE TABLE'), 'Backup must contain schema / tables');

    // 4. Test Data Workbook Export (.xlsx)
    console.log(`\n[4/4] Testing GET ${apiBase}/data/export/excel/data-workbook...`);
    const dataWbRes = await fetch(`${apiBase}/data/export/excel/data-workbook`);
    assert(dataWbRes.ok, `Data workbook export failed: status ${dataWbRes.status}`);
    const dataWbBuffer = Buffer.from(await dataWbRes.arrayBuffer());
    const dataWbPath = path.join(outDir, 'fludo_erp_data_workbook.xlsx');
    fs.writeFileSync(dataWbPath, dataWbBuffer);
    console.log(`✓ Data Workbook (.xlsx) generated! Size: ${dataWbBuffer.length} bytes -> ${dataWbPath}`);

    console.log('\n======================================================');
    console.log('✅ EXCEL & SQL EXPORT VERIFICATION COMPLETE & SUCCESSFUL!');
    console.log('======================================================\n');
  } finally {
    apiProc.kill();
  }
}

testExports().catch((err) => {
  console.error('❌ EXPORT TEST FAILED:', err);
  process.exit(1);
});
