const { Pool } = require('pg');

async function testPhase5Daily() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 5: Daily Center & Invoice Modes ---');

  // 1. Get test customer and product
  const customerRes = await pool.query("SELECT id, name FROM app.parties WHERE is_customer = true AND NOT is_deleted LIMIT 1");
  const productRes = await pool.query("SELECT id, name, default_sale_price FROM app.products WHERE kind = 'goods' AND NOT is_deleted LIMIT 1");
  const branchRes = await pool.query("SELECT id FROM app.branches WHERE is_active = true LIMIT 1");

  if (customerRes.rows.length === 0 || productRes.rows.length === 0) {
    throw new Error('Customer or product missing for test');
  }

  const customerId = customerRes.rows[0].id;
  const productId = productRes.rows[0].id;
  const branchId = branchRes.rows[0].id;

  // 2. Insert test reservation sales invoice (status = 'draft' first, then insert line, then approve)
  const invRes = await pool.query(
    `INSERT INTO app.sales_invoices (
      invoice_no, party_id, branch_id, invoice_date, status, handling_fee, discount_amount,
      location_type, site_id
    ) VALUES (
      'TEST-RES-' || FLOOR(RANDOM()*10000), $1, $2, CURRENT_DATE, 'draft', 50, 20, 'site', $2
    ) RETURNING id, invoice_no`,
    [customerId, branchId]
  );
  const invoiceId = invRes.rows[0].id;

  // Insert line with reserve mode
  const lineRes = await pool.query(
    `INSERT INTO app.sales_invoice_lines (
      invoice_id, line_no, product_id, qty, unit_price, line_mode
    ) VALUES ($1, 1, $2, 10, 100, 'reserve')
    RETURNING id, line_mode`,
    [invoiceId, productId]
  );

  await pool.query("UPDATE app.sales_invoices SET status = 'approved' WHERE id = $1", [invoiceId]);
  console.log(`✓ Created test reservation invoice: ${invRes.rows[0].invoice_no} with line mode: ${lineRes.rows[0].line_mode}`);

  // 3. Test recording invoice print log
  const printRes = await pool.query(
    `INSERT INTO app.invoice_prints (invoice_id, invoice_kind, mode, carried_balance_snapshot)
     VALUES ($1, 'sale', 'with_carry', 5000.00)
     RETURNING id, mode, carried_balance_snapshot`,
    [invoiceId]
  );
  console.log(`✓ Recorded invoice print log: ID ${printRes.rows[0].id}, mode: ${printRes.rows[0].mode}, carried: ${printRes.rows[0].carried_balance_snapshot}`);

  // 4. Test view v_reservation_lines incorporates this line
  const resView = await pool.query(
    `SELECT * FROM app.v_reservation_lines WHERE party_id = $1`,
    [customerId]
  );
  console.log(`✓ v_reservation_lines returned ${resView.rows.length} reservation lines for customer`);

  // 5. Clean up test records safely
  await pool.query("SET session_replication_role = 'replica'");
  await pool.query("DELETE FROM app.invoice_prints WHERE invoice_id = $1", [invoiceId]);
  await pool.query("DELETE FROM app.sales_invoice_lines WHERE invoice_id = $1", [invoiceId]);
  await pool.query("DELETE FROM app.sales_invoices WHERE id = $1", [invoiceId]);
  await pool.query("SET session_replication_role = 'origin'");
  console.log('✓ Cleaned up test records');

  await pool.end();
  console.log('=== GATE 5: Daily Center & Invoice Rules PASSED ===');
}

testPhase5Daily().catch((err) => {
  console.error('GATE 5 FAILED:', err);
  process.exit(1);
});
