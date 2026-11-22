const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'erp_owner',
  password: 'erp_password_local_123',
  database: 'fludo_erp'
});

async function main() {
  await client.connect();

  await client.query('BEGIN');
  const empRes = await client.query(
    "INSERT INTO app.employees (code, full_name, daily_rate) VALUES ('E9998', 'اختبار موظف', 200) RETURNING id"
  );
  const empId = empRes.rows[0].id;

  // Try inserting deduction without reason
  let threw = false;
  try {
    await client.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_date, tx_type, amount, reason)
       VALUES ($1, '2026-11-01', 'deduction', 50, '')`,
      [empId]
    );
  } catch (err) {
    threw = true;
    console.log('Successfully rejected deduction without reason:', err.message);
  }

  if (!threw) {
    throw new Error('FAILED: Deduction without reason should have been rejected!');
  }

  await client.query('ROLLBACK');
  await client.end();
}
main().catch(console.error);
