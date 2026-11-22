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
  const res1 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'attendance'");
  console.log('Attendance columns:', res1.rows.map(r => r.column_name));
  const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'employee_transactions'");
  console.log('Employee transactions columns:', res2.rows.map(r => r.column_name));
  await client.end();
}
main().catch(console.error);
