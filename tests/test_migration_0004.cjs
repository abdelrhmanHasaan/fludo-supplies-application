const { Pool } = require('pg');

async function testMigration0004() {
  console.log('====================================================');
  console.log('   TESTING MIGRATION 0004 & FIGJAM SCHEMA UPDATES   ');
  console.log('====================================================\n');

  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'erp_owner',
    password: 'erp_password_local_123',
    database: 'fludo_erp'
  });

  try {
    // 1. Check schema_migrations
    const mig = await pool.query("SELECT * FROM app.schema_migrations WHERE version = '0004_figjam_overhaul'");
    if (mig.rows.length === 0) throw new Error('Migration 0004 not found in schema_migrations');
    console.log('[PASS] Migration 0004 registered in schema_migrations');

    // 2. Check columns on sales_invoices and purchase_invoices
    const siCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'app' AND table_name = 'sales_invoices'
    `);
    const siColNames = siCols.rows.map(r => r.column_name);
    if (!siColNames.includes('location_type') || !siColNames.includes('site_id') || !siColNames.includes('place_party_id')) {
      throw new Error('Missing location columns on sales_invoices');
    }
    console.log('[PASS] sales_invoices has location_type, site_id, and place_party_id');

    // 3. Check line_mode on sales_invoice_lines
    const silCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'app' AND table_name = 'sales_invoice_lines'
    `);
    const silColNames = silCols.rows.map(r => r.column_name);
    if (!silColNames.includes('line_mode')) {
      throw new Error('Missing line_mode on sales_invoice_lines');
    }
    console.log('[PASS] sales_invoice_lines has line_mode');

    // 4. Check invoice_prints table
    const ipRes = await pool.query("SELECT count(*) FROM app.invoice_prints");
    console.log('[PASS] invoice_prints table exists, count:', ipRes.rows[0].count);

    // 5. Check cash_movements table
    const cmRes = await pool.query("SELECT count(*) FROM app.cash_movements");
    console.log('[PASS] cash_movements table exists, count:', cmRes.rows[0].count);

    // 6. Check v_party_alarms view
    const alarmRes = await pool.query("SELECT * FROM app.v_party_alarms LIMIT 5");
    console.log('[PASS] v_party_alarms view executes cleanly, count:', alarmRes.rows.length);

    // 7. Check v_reservation_lines view
    const resvRes = await pool.query("SELECT * FROM app.v_reservation_lines LIMIT 5");
    console.log('[PASS] v_reservation_lines view executes cleanly, count:', resvRes.rows.length);

    // 8. Check v_dashboard_metrics view
    const dashRes = await pool.query("SELECT * FROM app.v_dashboard_metrics");
    const m = dashRes.rows[0];
    const expectedKeys = [
      'total_receivables',
      'total_payables',
      'current_liquidity',
      'current_month_sales',
      'today_sales',
      'active_customers_count',
      'active_suppliers_count',
      'active_employees_count',
      'current_month_premises_expenses',
      'current_month_equipment_expenses'
    ];
    for (const k of expectedKeys) {
      if (!(k in m)) throw new Error(`Missing expected key ${k} in v_dashboard_metrics`);
    }
    console.log('[PASS] v_dashboard_metrics contains all 10 required database-computed financial metrics:');
    console.log(m);

    // 9. Check v_party_activity with activity_group
    const actRes = await pool.query("SELECT party_id, occurred_at, activity_group, description FROM app.v_party_activity LIMIT 5");
    console.log('[PASS] v_party_activity has activity_group, sample rows:', actRes.rows.length);

    console.log('\n====================================================');
    console.log('✅ ALL MIGRATION 0004 & SCHEMA CHECKS PASSED (GATE 1 OK)');
    console.log('====================================================');
  } finally {
    await pool.end();
  }
}

testMigration0004().catch(err => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
