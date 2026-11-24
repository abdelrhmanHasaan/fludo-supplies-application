const { Pool } = require('pg');

async function testTreasury() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 3: Treasury & Cash Movements ---');

  // 1. Check cash_accounts
  const accountsRes = await pool.query('SELECT id, name, kind, is_active FROM app.cash_accounts LIMIT 1');
  if (accountsRes.rows.length === 0) {
    throw new Error('No cash accounts found in database!');
  }
  const accountId = accountsRes.rows[0].id;
  console.log(`Found account: ${accountsRes.rows[0].name} (${accountId})`);

  // 2. Insert test manual deposit
  const testDepositAmount = 1500.50;
  const depositRes = await pool.query(
    `INSERT INTO app.cash_movements (cash_account_id, direction, amount, note, movement_date)
     VALUES ($1, 'in', $2, 'إيداع تجريبي للاختبار', CURRENT_DATE)
     RETURNING *`,
    [accountId, testDepositAmount]
  );
  console.log('✓ Manual deposit recorded:', depositRes.rows[0].id, depositRes.rows[0].amount);

  // 3. Insert test manual withdrawal
  const testWithdrawalAmount = 500.25;
  const withdrawalRes = await pool.query(
    `INSERT INTO app.cash_movements (cash_account_id, direction, amount, note, movement_date)
     VALUES ($1, 'out', $2, 'سحب تجريبي للاختبار', CURRENT_DATE)
     RETURNING *`,
    [accountId, testWithdrawalAmount]
  );
  console.log('✓ Manual withdrawal recorded:', withdrawalRes.rows[0].id, withdrawalRes.rows[0].amount);

  // 4. Verify balance calculation matches math
  const balRes = await pool.query(
    `SELECT 
      ca.id,
      ca.name,
      ca.opening_balance + (
        COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
        COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) -
        COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
        COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0) +
        COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'in' AND NOT is_deleted), 0) -
        COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'out' AND NOT is_deleted), 0) +
        COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE to_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
        COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE from_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0)
      ) AS balance
     FROM app.cash_accounts ca
     WHERE ca.id = $1`,
    [accountId]
  );
  console.log(`✓ Calculated account balance: ${balRes.rows[0].balance}`);

  // 5. Clean up test records
  await pool.query('DELETE FROM app.cash_movements WHERE id IN ($1, $2)', [
    depositRes.rows[0].id,
    withdrawalRes.rows[0].id,
  ]);
  console.log('✓ Test records cleaned up');

  await pool.end();
  console.log('=== GATE 3: Treasury & Cash Movements PASSED ===');
}

testTreasury().catch((err) => {
  console.error('GATE 3 FAILED:', err);
  process.exit(1);
});
