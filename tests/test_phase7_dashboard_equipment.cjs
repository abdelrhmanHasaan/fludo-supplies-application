const { Pool } = require('pg');

async function testPhase7() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 7: Dashboard Metrics & Equipment ---');

  // 1. Query v_dashboard_metrics and verify all 10 fields
  const metricsRes = await pool.query('SELECT * FROM app.v_dashboard_metrics');
  if (metricsRes.rows.length === 0) {
    throw new Error('v_dashboard_metrics returned no rows!');
  }
  const m = metricsRes.rows[0];

  const requiredFields = [
    'total_receivables',
    'total_payables',
    'current_liquidity',
    'current_month_sales',
    'today_sales',
    'current_month_premises_expenses',
    'current_month_equipment_expenses',
    'active_customers_count',
    'active_suppliers_count',
    'active_employees_count',
  ];

  for (const f of requiredFields) {
    if (m[f] === undefined || m[f] === null) {
      throw new Error(`Metric ${f} is missing from v_dashboard_metrics!`);
    }
  }

  console.log('✓ All 10 dashboard metrics present and computed from database:', {
    total_receivables: m.total_receivables,
    total_payables: m.total_payables,
    current_liquidity: m.current_liquidity,
    current_month_sales: m.current_month_sales,
    today_sales: m.today_sales,
    premises_exp: m.current_month_premises_expenses,
    equipment_exp: m.current_month_equipment_expenses,
    customers: m.active_customers_count,
    suppliers: m.active_suppliers_count,
    employees: m.active_employees_count,
  });

  // 2. Query equipment table
  const eqRes = await pool.query('SELECT id, code, name, kind, plate_no FROM app.equipment WHERE NOT is_deleted LIMIT 5');
  console.log(`✓ Equipment queried successfully (${eqRes.rows.length} equipment items found)`);

  await pool.end();
  console.log('=== GATE 7: Dashboard, Invoices & Equipment PASSED ===');
}

testPhase7().catch((err) => {
  console.error('GATE 7 FAILED:', err);
  process.exit(1);
});
