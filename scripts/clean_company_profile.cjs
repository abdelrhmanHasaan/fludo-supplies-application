const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: '127.0.0.1',
    port: 5434,
    user: 'erp_owner',
    password: 'erp_password_local_123',
    database: 'fludo_erp'
  });

  await pool.query(
    'UPDATE app.company_profile SET name_ar = $1, name_en = $2',
    ['Fludo Supplies للتوريدات العمومية', 'Fludo Supplies ERP']
  );

  const res = await pool.query('SELECT name_ar, name_en FROM app.company_profile');
  console.log('Updated Company Profile:', res.rows[0]);
  await pool.end();
}

main().catch(console.error);
