import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'fludo_erp',
  user: 'erp_owner',
});

async function main() {
  const r1 = await pool.query(`SELECT app.normalize_ar('أَنَسْ') AS norm`);
  console.log('Normalized "أَنَسْ":', r1.rows[0].norm);

  const r2 = await pool.query(`
    SELECT name, search_text 
    FROM app.parties 
    WHERE search_text ILIKE ('%' || app.normalize_ar('أنس') || '%')
  `);
  console.log('Parties matching "أنس":', r2.rows);

  await pool.end();
}

main().catch(console.error);
