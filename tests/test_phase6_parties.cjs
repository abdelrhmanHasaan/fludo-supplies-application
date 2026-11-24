const { Pool } = require('pg');

async function testPhase6Parties() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 6: Customers & Suppliers ---');

  // 1. Query v_party_alarms
  const alarmsRes = await pool.query('SELECT * FROM app.v_party_alarms LIMIT 5');
  console.log(`✓ v_party_alarms queried successfully (${alarmsRes.rows.length} alarm rows found)`);

  // 2. Query v_reservation_lines
  const reservationsRes = await pool.query('SELECT * FROM app.v_reservation_lines LIMIT 5');
  console.log(`✓ v_reservation_lines queried successfully (${reservationsRes.rows.length} reservation rows found)`);

  // 3. Query v_party_summary
  const summaryRes = await pool.query('SELECT * FROM app.v_party_summary LIMIT 5');
  console.log(`✓ v_party_summary queried successfully (${summaryRes.rows.length} summary rows found)`);

  // 4. Test party auto-code generator query
  const customerCodeRes = await pool.query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM '^C([0-9]+)$')::integer), 0) + 1 AS next_num 
     FROM app.parties 
     WHERE code ~ '^C[0-9]+$'`
  );
  const nextCustomerCode = `C${String(customerCodeRes.rows[0].next_num).padStart(4, '0')}`;
  console.log(`✓ Generated next customer code: ${nextCustomerCode}`);

  const supplierCodeRes = await pool.query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM '^S([0-9]+)$')::integer), 0) + 1 AS next_num 
     FROM app.parties 
     WHERE code ~ '^S[0-9]+$'`
  );
  const nextSupplierCode = `S${String(supplierCodeRes.rows[0].next_num).padStart(4, '0')}`;
  console.log(`✓ Generated next supplier code: ${nextSupplierCode}`);

  await pool.end();
  console.log('=== GATE 6: Customers & Suppliers PASSED ===');
}

testPhase6Parties().catch((err) => {
  console.error('GATE 6 FAILED:', err);
  process.exit(1);
});
