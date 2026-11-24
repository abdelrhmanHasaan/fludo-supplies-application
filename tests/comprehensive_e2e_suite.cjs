const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5434', 10),
  user: process.env.PGUSER || 'erp_owner',
  password: process.env.PGPASSWORD || 'erp_password_local_123',
  database: 'fludo_erp',
});

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName}: ${details}`);
    failed++;
  }
}

async function runAllTests() {
  console.log('===============================================================');
  console.log('   FLUDO SUPPLIES ERP — COMPREHENSIVE E2E VERIFICATION SUITE   ');
  console.log('===============================================================\n');

  try {
    // -------------------------------------------------------------
    // SECTION 1: Database Schema & Migrations 0003 & 0004
    // -------------------------------------------------------------
    console.log('--- 1. Database Schema & Migrations 0003 & 0004 ---');
    
    // 1.1 Free-text unit_name column checks
    const prodUnitRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='products' AND column_name='unit_name';`
    );
    assert(prodUnitRes.rows.length === 1, 'products has unit_name free-text column');

    const salesLineUnitRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='sales_invoice_lines' AND column_name='unit_name';`
    );
    assert(salesLineUnitRes.rows.length === 1, 'sales_invoice_lines has unit_name free-text column');

    const purchLineUnitRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='purchase_invoice_lines' AND column_name='unit_name';`
    );
    assert(purchLineUnitRes.rows.length === 1, 'purchase_invoice_lines has unit_name free-text column');

    // 1.2 Discount columns check
    const discRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='sales_invoices' AND column_name='discount_amount';`
    );
    assert(discRes.rows.length === 1, 'sales_invoices has header discount_amount');

    // 1.3 Shipments transport columns check
    const shipRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='shipments' AND column_name IN ('destination', 'vehicle_id', 'driver_id');`
    );
    assert(shipRes.rows.length === 3, 'shipments table has destination, vehicle_id, and driver_id');

    // 1.4 Document sequences check
    const seqRes = await pool.query(
      `SELECT doc_type FROM app.document_sequences WHERE doc_type IN ('product', 'customer', 'supplier', 'employee');`
    );
    assert(seqRes.rows.length === 4, 'document_sequences has product, customer, supplier, and employee sequences');

    // 1.5 Cash accounts table & kinds check
    const cashAccTableRes = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='cash_accounts' AND column_name IN ('kind', 'is_active');`
    );
    assert(cashAccTableRes.rows.length === 2, 'cash_accounts has kind and is_active columns');

    // 1.6 FigJam 0004 Schema Checks: cash_movements, invoice_prints, branch/location columns
    const m4Tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='app' AND table_name IN ('cash_movements', 'invoice_prints', 'branches');`
    );
    assert(m4Tables.rows.length === 3, 'Migration 0004 tables exist (cash_movements, invoice_prints, branches)');

    const m4Columns = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name='sales_invoices' AND column_name IN ('location_type', 'site_id', 'place_party_id');`
    );
    assert(m4Columns.rows.length === 3, 'sales_invoices has location_type, site_id, and place_party_id');

    // 1.7 Unified Views check
    const viewsRes = await pool.query(
      `SELECT table_name FROM information_schema.views WHERE table_schema='app' AND table_name IN ('v_party_activity', 'v_party_summary', 'v_dashboard_metrics', 'v_product_availability', 'v_party_alarms', 'v_reservation_lines');`
    );
    assert(viewsRes.rows.length === 6, 'All 6 core views (party_activity, party_summary, dashboard_metrics, product_availability, party_alarms, reservation_lines) exist');

    // -------------------------------------------------------------
    // SECTION 2: Dashboard 10 Numbers Computation
    // -------------------------------------------------------------
    console.log('\n--- 2. Dashboard 10 Metrics Verification ---');
    const dashRes = await pool.query(`SELECT * FROM app.v_dashboard_metrics;`);
    assert(dashRes.rows.length === 1, 'v_dashboard_metrics returns exactly 1 summary row');
    const m = dashRes.rows[0];
    assert(
      m.total_receivables !== undefined &&
      m.total_payables !== undefined &&
      m.current_liquidity !== undefined &&
      m.current_month_sales !== undefined &&
      m.today_sales !== undefined &&
      m.current_month_premises_expenses !== undefined &&
      m.current_month_equipment_expenses !== undefined &&
      m.active_customers_count !== undefined &&
      m.active_suppliers_count !== undefined &&
      m.active_employees_count !== undefined,
      'Dashboard metrics contains strictly all 10 FigJam database-calculated financial fields',
      JSON.stringify(m)
    );

    // -------------------------------------------------------------
    // SECTION 3: Customer / Supplier Ledger & Movements
    // -------------------------------------------------------------
    console.log('\n--- 3. Customer / Supplier Ledger & Movements ---');
    const custInsert = await pool.query(
      `INSERT INTO app.parties (name, is_customer, is_supplier, phone) 
       VALUES ('عميل تجريبي للاختبار E2E', true, false, '01099999999')
       RETURNING id, code;`
    );
    const testCustId = custInsert.rows[0].id;
    assert(custInsert.rows[0].code.startsWith('C'), `Customer auto-code generated: ${custInsert.rows[0].code}`);

    // Query v_party_summary
    const custSumRes = await pool.query(
      `SELECT * FROM app.v_party_summary WHERE party_id = $1;`,
      [testCustId]
    );
    assert(custSumRes.rows.length === 1, 'v_party_summary resolves test customer');

    // Query v_party_activity
    const actRes = await pool.query(
      `SELECT * FROM app.v_party_activity WHERE party_id = $1;`,
      [testCustId]
    );
    assert(Array.isArray(actRes.rows), 'v_party_activity returns queryable array for party ledger');

    // Cleanup test customer
    await pool.query(`DELETE FROM app.parties WHERE id = $1;`, [testCustId]);

    // -------------------------------------------------------------
    // SECTION 4: Inventory 4 Dimensions & Auto-code
    // -------------------------------------------------------------
    console.log('\n--- 4. Inventory 4 Dimensions & Calculations ---');
    const autoCodeRes = await pool.query(`SELECT app.next_doc_number('product') as next_code;`);
    const nextPCode = autoCodeRes.rows[0].next_code;
    assert(/^P\d{4}$/.test(nextPCode), `Product auto-code format is P0001 (generated: ${nextPCode})`);

    const invSummaryRes = await pool.query(`SELECT * FROM app.v_product_availability LIMIT 5;`);
    assert(Array.isArray(invSummaryRes.rows), 'v_product_availability query executes successfully');
    if (invSummaryRes.rows.length > 0) {
      const invRow = invSummaryRes.rows[0];
      assert(
        invRow.qty_on_hand !== undefined &&
        invRow.qty_incoming !== undefined &&
        invRow.qty_reserved !== undefined &&
        invRow.qty_available !== undefined,
        'Inventory summary contains all 4 stock dimensions: on_hand, incoming, reserved, available'
      );
    }

    // -------------------------------------------------------------
    // SECTION 5: Treasury & Cash Accounts & Movements
    // -------------------------------------------------------------
    console.log('\n--- 5. Treasury Multi-kind Accounts & Movements ---');
    await pool.query(`DELETE FROM app.cash_movements WHERE cash_account_id IN (SELECT id FROM app.cash_accounts WHERE name = 'محفظة فودافون كاش E2E');`);
    await pool.query(`DELETE FROM app.cash_accounts WHERE name = 'محفظة فودافون كاش E2E';`);

    const accInsert = await pool.query(
      `INSERT INTO app.cash_accounts (name, kind, opening_balance, is_active)
       VALUES ('محفظة فودافون كاش E2E', 'wallet', 10000, true)
       RETURNING id, kind, is_active;`
    );
    const testAccId = accInsert.rows[0].id;
    assert(accInsert.rows[0].kind === 'wallet', 'Created cash account with kind=wallet');
    assert(accInsert.rows[0].is_active === true, 'Cash account active flag works');

    // Test deposit cash movement
    const depositRes = await pool.query(
      `INSERT INTO app.cash_movements (cash_account_id, direction, amount, movement_date, note)
       VALUES ($1, 'in', 5000, CURRENT_DATE, 'إيداع إضافي تجريبي')
       RETURNING id, amount;`,
      [testAccId]
    );
    assert(depositRes.rows.length === 1 && Number(depositRes.rows[0].amount) === 5000, 'Cash movement deposit inserted cleanly');

    // Test withdrawal cash movement
    const withdrawRes = await pool.query(
      `INSERT INTO app.cash_movements (cash_account_id, direction, amount, movement_date, note)
       VALUES ($1, 'out', 1500, CURRENT_DATE, 'سحب نقدي تجريبي')
       RETURNING id, amount;`,
      [testAccId]
    );
    assert(withdrawRes.rows.length === 1 && Number(withdrawRes.rows[0].amount) === 1500, 'Cash movement withdrawal inserted cleanly');

    // Toggle active flag
    await pool.query(`UPDATE app.cash_accounts SET is_active = false WHERE id = $1;`, [testAccId]);
    const accCheck = await pool.query(`SELECT is_active FROM app.cash_accounts WHERE id = $1;`, [testAccId]);
    assert(accCheck.rows[0].is_active === false, 'Cash account active flag can be disabled/toggled');

    // Cleanup cash movements and account
    await pool.query(`DELETE FROM app.cash_movements WHERE cash_account_id = $1;`, [testAccId]);
    await pool.query(`DELETE FROM app.cash_accounts WHERE id = $1;`, [testAccId]);

    // -------------------------------------------------------------
    // SECTION 6: Invoices & Registry
    // -------------------------------------------------------------
    console.log('\n--- 6. Invoices Registry & Calculations ---');
    const invRegQuery = `
      SELECT id, invoice_no, 'sale' as invoice_type, invoice_date, lines_total, discount_amount, net_total, status
      FROM app.sales_invoices
      UNION ALL
      SELECT id, invoice_no, 'purchase' as invoice_type, invoice_date, lines_total, discount_amount, net_total, status
      FROM app.purchase_invoices
      LIMIT 10;
    `;
    const invRegRes = await pool.query(invRegQuery);
    assert(Array.isArray(invRegRes.rows), 'Unified invoices registry query executes cleanly with net_total');

    // -------------------------------------------------------------
    // SECTION 7: Employees, Reason Constraint & Net Due Formula
    // -------------------------------------------------------------
    console.log('\n--- 7. Employee Net Wage & Reason Constraints ---');
    await pool.query(`DELETE FROM app.attendance WHERE employee_id IN (SELECT id FROM app.employees WHERE code LIKE 'E999%');`);
    await pool.query(`DELETE FROM app.employee_transactions WHERE employee_id IN (SELECT id FROM app.employees WHERE code LIKE 'E999%');`);
    await pool.query(`DELETE FROM app.employees WHERE code LIKE 'E999%';`);

    const empInsert = await pool.query(
      `INSERT INTO app.employees (code, full_name, daily_rate)
       VALUES ('E9997', 'موظف تجريبي E2E', 250)
       RETURNING id;`
    );
    const testEmpId = empInsert.rows[0].id;

    // Test Reason Constraint: must reject empty reason on deduction
    let reasonRejected = false;
    try {
      await pool.query(
        `INSERT INTO app.employee_transactions (employee_id, tx_type, amount, tx_date, reason)
         VALUES ($1, 'deduction', 200, '2026-11-15', '');`,
        [testEmpId]
      );
    } catch (err) {
      if (err.message.includes('chk_emp_tx_reason')) {
        reasonRejected = true;
      }
    }
    assert(reasonRejected, 'PostgreSQL constraint (chk_emp_tx_reason) strictly REJECTS deduction with empty reason');

    // Now insert valid transactions for Section 7 test:
    // 20 days @ 250 = 5000, advances = 2000, deduction = 200, bonus = 300 -> net = 3100
    for (let day = 1; day <= 20; day++) {
      const dStr = `2026-11-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO app.attendance (employee_id, work_date, status, day_fraction, daily_rate_snapshot)
         VALUES ($1, $2::date, 'present', 1.0, 250)
         ON CONFLICT (employee_id, work_date) DO NOTHING;`,
        [testEmpId, dStr]
      );
    }

    await pool.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_type, amount, tx_date, reason)
       VALUES ($1, 'advance', 2000, '2026-11-10', 'سلفة منتصف الشهر');`,
      [testEmpId]
    );
    await pool.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_type, amount, tx_date, reason)
       VALUES ($1, 'deduction', 200, '2026-11-12', 'خصم تأخير');`,
      [testEmpId]
    );
    await pool.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_type, amount, tx_date, reason)
       VALUES ($1, 'bonus', 300, '2026-11-18', 'مكافأة إنجاز إضافي');`,
      [testEmpId]
    );

    const netDueRes = await pool.query(
      `SELECT app.employee_net_due($1, '2026-11-01'::date, '2026-11-30'::date) as net_wage;`,
      [testEmpId]
    );
    const calculatedNet = Number(netDueRes.rows[0].net_wage);
    assert(
      calculatedNet === 3100,
      `app.employee_net_due formula verified: 20*250 - 2000 - 200 + 300 = 3100 (got ${calculatedNet})`
    );

    // Cleanup employee
    await pool.query(`DELETE FROM app.attendance WHERE employee_id = $1;`, [testEmpId]);
    await pool.query(`DELETE FROM app.employee_transactions WHERE employee_id = $1;`, [testEmpId]);
    await pool.query(`DELETE FROM app.employees WHERE id = $1;`, [testEmpId]);

    // -------------------------------------------------------------
    // SECTION 8: Arabic Search & Normalization
    // -------------------------------------------------------------
    console.log('\n--- 8. Arabic Search & Normalization ---');
    const normRes = await pool.query(`SELECT app.normalize_ar('إبراهيم أحمد أسامة ة') as normalized;`);
    const normalized = normRes.rows[0].normalized;
    assert(
      normalized === 'ابراهيم احمد اسامه ه',
      `app.normalize_ar correctly normalizes Arabic characters (got: ${normalized})`
    );

    // -------------------------------------------------------------
    // SECTION 9: Import & Export Verification
    // -------------------------------------------------------------
    console.log('\n--- 9. Data Import / Export (Yomia & Full Export) ---');
    const yomiaPath = path.resolve('c:/FludoCompany/Supllies ERP application/tests/media_1795109794092_37ae080c.xlsx');
    const fallbackPath = 'C:/Users/Abdelrhman/.gemini/antigravity/brain/11761ab4-9226-4e3d-b4e9-0410c9946ca1/.user_uploaded/media_1795109794092_37ae080c.xlsx';
    const filePath = fs.existsSync(yomiaPath) ? yomiaPath : fallbackPath;

    if (fs.existsSync(filePath)) {
      const { parseExcelWorkbook } = require('../services/api/dist/domain/importer.js');
      const buffer = fs.readFileSync(filePath);
      const parsed = await parseExcelWorkbook(buffer);

      assert(
        parsed.totals.customerPurchases === 3395835 &&
        parsed.totals.customerPaid === 3284590 &&
        parsed.totals.customerRemaining === 111245,
        `Customer Yomia exact match: Purchases=3,395,835, Paid=3,284,590, Remaining=111,245 (got ${parsed.totals.customerPurchases}, ${parsed.totals.customerPaid}, ${parsed.totals.customerRemaining})`
      );

      assert(
        parsed.totals.supplierPurchases === 1772044 &&
        parsed.totals.supplierPaid === 948070 &&
        parsed.totals.supplierRemaining === 823974,
        `Supplier Yomia exact match: Purchases=1,772,044, Paid=948,070, Remaining=823,974 (got ${parsed.totals.supplierPurchases}, ${parsed.totals.supplierPaid}, ${parsed.totals.supplierRemaining})`
      );
    } else {
      console.warn('  [WARN] User yomia file not found at expected path, skipping file parse assertion');
    }

    console.log('\n===============================================================');
    console.log(`E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Unexpected error during E2E test:', err);
    failed++;
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAllTests();
