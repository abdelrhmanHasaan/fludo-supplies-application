const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

async function testRestore() {
  console.log('--- TESTING SQL RESTORE & TRANSACTION SAFETY ---');

  // Test portable sql import
  const portableSql = `
    -- Test insert with transaction
    INSERT INTO app.parties (name, phone, is_customer, is_supplier)
    VALUES ('عميل اختبار استعادة SQL', '01099998888', true, false)
    ON CONFLICT DO NOTHING;
  `;

  const res = await fetch('http://127.0.0.1:4000/api/data/import/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqlScript: portableSql }),
  });

  assert(res.ok, 'SQL Import failed');
  const body = await res.json();
  console.log('✓ SQL executed successfully:', body.message);

  // Test dangerous DROP block
  const badRes = await fetch('http://127.0.0.1:4000/api/data/import/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sqlScript: 'DROP DATABASE fludo_erp;' }),
  });
  assert.strictEqual(badRes.status, 403, 'Dangerous drop database must be rejected with 403');
  console.log('✓ Dangerous DROP statement blocked with 403!');

  console.log('\n✅ SQL RESTORE & SAFETY CHECK PASSED!\n');
}

testRestore().catch((err) => {
  console.error('❌ RESTORE TEST FAILED:', err);
  process.exit(1);
});
