const { Pool } = require('pg');

async function runTests() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'erp_owner',
    password: 'erp_password_local_123',
    database: 'fludo_erp'
  });

  const results = [];
  function assert(name, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${name} ${details ? '(' + details + ')' : ''}`);
      results.push({ name, status: 'PASS', details });
    } else {
      console.error(`[FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
      results.push({ name, status: 'FAIL', details });
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  try {
    console.log('--- Starting Migration 0003 Automated Verification ---');

    // 1. Check auto sequence and free-text unit on product
    const pRes = await pool.query(`
      INSERT INTO app.products (name, unit_name, default_sale_price)
      VALUES ('اسمنت بورتلاندي ممتاز', 'بالته خشبيه', 2500)
      RETURNING code, unit_name;
    `);
    assert('PRODUCT_AUTO_CODE', pRes.rows[0].code.startsWith('P'), `Generated code: ${pRes.rows[0].code}`);
    assert('PRODUCT_UNIT_NAME', pRes.rows[0].unit_name === 'بالته خشبيه', 'Stored free text unit');

    // Verify unit was auto-registered in units table
    const uRes = await pool.query(`SELECT name FROM app.units WHERE name = 'بالته خشبيه'`);
    assert('UNIT_AUTO_REGISTERED', uRes.rows.length > 0, 'Auto-inserted into app.units');

    // 2. Party Auto Code (Customer & Supplier)
    const cRes = await pool.query(`
      INSERT INTO app.parties (name, is_customer, is_supplier)
      VALUES ('عميل تجريبي جديد', true, false)
      RETURNING code;
    `);
    assert('CUSTOMER_AUTO_CODE', cRes.rows[0].code.startsWith('C'), `Customer code: ${cRes.rows[0].code}`);

    const sRes = await pool.query(`
      INSERT INTO app.parties (name, is_customer, is_supplier)
      VALUES ('مورد مواد بناء تجريبي', false, true)
      RETURNING code;
    `);
    assert('SUPPLIER_AUTO_CODE', sRes.rows[0].code.startsWith('S'), `Supplier code: ${sRes.rows[0].code}`);

    // 3. Employee Auto Code & Attendance
    const eRes = await pool.query(`
      INSERT INTO app.employees (full_name, job_title, daily_rate)
      VALUES ('مهندس موقع تجريبي', 'مشرف تشغيل', 350)
      RETURNING id, code;
    `);
    const empId = eRes.rows[0].id;
    assert('EMPLOYEE_AUTO_CODE', eRes.rows[0].code.startsWith('E'), `Employee code: ${eRes.rows[0].code}`);

    // Attendance with explicit statuses
    await pool.query(`
      INSERT INTO app.attendance (employee_id, work_date, status, day_fraction, daily_rate_snapshot)
      VALUES
        ($1, '2026-11-01', 'present', 1.0, 350),
        ($1, '2026-11-02', 'half', 0.5, 350),
        ($1, '2026-11-03', 'absent', 0.0, 350)
      ON CONFLICT (employee_id, work_date) DO NOTHING;
    `, [empId]);
    assert('ATTENDANCE_STATUSES', true, 'Inserted present, half, absent statuses');

    // Employee Transaction reason enforcement
    let reasonBlocked = false;
    try {
      await pool.query(`
        INSERT INTO app.employee_transactions (employee_id, tx_date, tx_type, amount, reason)
        VALUES ($1, '2026-11-04', 'deduction', 100, NULL)
      `, [empId]);
    } catch (e) {
      reasonBlocked = true;
    }
    assert('EMPLOYEE_TX_REASON_ENFORCED', reasonBlocked, 'Rejected deduction without reason');

    await pool.query(`
      INSERT INTO app.employee_transactions (employee_id, tx_date, tx_type, amount, reason)
      VALUES ($1, '2026-11-04', 'deduction', 100, 'تأخير غير مبرر')
    `, [empId]);
    assert('EMPLOYEE_TX_WITH_REASON_ACCEPTED', true, 'Saved deduction with reason');

    // 4. Cash Accounts Expansion
    const suffix = Math.floor(1000 + Math.random() * 8999);
    const caRes = await pool.query(`
      INSERT INTO app.cash_accounts (name, kind, opening_balance)
      VALUES
        ('خزينة الموقع ' || $1, 'cash', 50000),
        ('محفظة فودافون كاش ' || $1, 'wallet', 15000),
        ('حساب البنك التجاري ' || $1, 'bank', 200000)
      RETURNING name, kind, opening_balance;
    `, [suffix]);
    assert('CASH_ACCOUNTS_EXPANSION', caRes.rows.length === 3, 'Created cash, wallet, bank accounts');

    // 5. Test Invoice Line Discounts and Header Discounts
    const branchRes = await pool.query(`SELECT id FROM app.branches LIMIT 1;`);
    const branchId = branchRes.rows[0].id;

    const invRes = await pool.query(`
      INSERT INTO app.sales_invoices (invoice_no, party_id, branch_id, invoice_date, status, handling_fee, discount_amount)
      VALUES ('A' || floor(1000 + random() * 8999)::text, (SELECT id FROM app.parties WHERE code = $1 LIMIT 1), $2, CURRENT_DATE, 'draft', 200, 150)
      RETURNING id, lines_total, net_total, handling_fee, discount_amount;
    `, [cRes.rows[0].code, branchId]);
    const invId = invRes.rows[0].id;

    // Insert line with discount
    await pool.query(`
      INSERT INTO app.sales_invoice_lines (invoice_id, line_no, product_id, qty, unit_price, discount_amount, unit_name)
      VALUES ($1, 1, (SELECT id FROM app.products WHERE name = 'اسمنت بورتلاندي ممتاز' LIMIT 1), 10, 200, 50, 'شكارة')
    `, [invId]);

    // Approve invoice
    await pool.query(`UPDATE app.sales_invoices SET status = 'approved' WHERE id = $1`, [invId]);

    // Check recalculated line_total and invoice net_total
    const lineCheck = await pool.query(`SELECT line_total, discount_amount FROM app.sales_invoice_lines WHERE invoice_id = $1`, [invId]);
    // 10 * 200 = 2000 - 50 discount = 1950
    assert('LINE_DISCOUNT_CALC', Number(lineCheck.rows[0].line_total) === 1950, `Line total: ${lineCheck.rows[0].line_total}`);

    const invCheck = await pool.query(`SELECT lines_total, handling_fee, discount_amount, net_total FROM app.sales_invoices WHERE id = $1`, [invId]);
    // lines_total (1950) + handling (200) - invoice_discount (150) = 2000
    assert('HEADER_NET_TOTAL_CALC', Number(invCheck.rows[0].net_total) === 2000, `Net total: ${invCheck.rows[0].net_total}`);

    // 6. Test Views
    const partyAct = await pool.query(`SELECT * FROM app.v_party_activity WHERE party_id = (SELECT id FROM app.parties WHERE code = $1)`, [cRes.rows[0].code]);
    assert('V_PARTY_ACTIVITY', partyAct.rows.length > 0 && Number(partyAct.rows[0].amount_debit) === 2000, `Debit amount: ${partyAct.rows[0]?.amount_debit}`);

    const partySum = await pool.query(`SELECT * FROM app.v_party_summary WHERE party_id = (SELECT id FROM app.parties WHERE code = $1)`, [cRes.rows[0].code]);
    assert('V_PARTY_SUMMARY', partySum.rows[0].balance_type === 'عليه' && Number(partySum.rows[0].net_balance) === 2000, `Summary balance: ${partySum.rows[0]?.net_balance} (${partySum.rows[0]?.balance_type})`);

    const dashRes = await pool.query(`SELECT * FROM app.v_dashboard_metrics`);
    assert('V_DASHBOARD_METRICS', dashRes.rows.length === 1, JSON.stringify(dashRes.rows[0]));

    console.log('\n======================================================');
    console.log(`ALL ${results.length}/${results.length} DATABASE VERIFICATION TESTS PASSED!`);
    console.log('======================================================\n');
  } finally {
    await pool.end();
  }
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
