const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'erp_owner',
    password: 'erp_password_local_123',
    database: 'fludo_erp'
  });

  const res = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'app' AND table_type = 'BASE TABLE' 
    ORDER BY table_name
  `);

  console.log('=== BASELINE ROW COUNTS IN fludo_erp ===');
  for (const row of res.rows) {
    const c = await pool.query(`SELECT count(*) FROM app.${row.table_name}`);
    console.log(`${row.table_name.padEnd(28)}: ${c.rows[0].count}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
