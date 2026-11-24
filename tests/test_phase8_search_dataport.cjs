const { Pool } = require('pg');

async function testPhase8() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 8: Search Normalization & DataPort ---');

  // 1. Test Arabic normalization function app.normalize_ar
  const normRes = await pool.query(`SELECT app.normalize_ar('إسمنت بورتلاندي ممتاز ٥٠كجم') AS norm`);
  console.log(`✓ Arabic normalization output: "${normRes.rows[0].norm}"`);

  // 2. Test searching products with normalization
  const searchProdRes = await pool.query(
    `SELECT id, code, name 
     FROM app.products 
     WHERE is_deleted = false 
       AND (name ILIKE '%اسمنت%' OR search_text ILIKE ('%' || app.normalize_ar('اسمنت') || '%'))
     LIMIT 5`
  );
  console.log(`✓ Product search with normalized term matched ${searchProdRes.rows.length} products`);

  // 3. Test searching parties with code prefix
  const searchPartyRes = await pool.query(
    `SELECT id, code, name 
     FROM app.parties 
     WHERE is_deleted = false 
       AND (code ILIKE 'C%' OR search_text ILIKE ('%' || app.normalize_ar('شركة') || '%'))
     LIMIT 5`
  );
  console.log(`✓ Party search matched ${searchPartyRes.rows.length} parties`);

  // 4. Test DataPort SQL export query (testing table metadata)
  const tablesRes = await pool.query(
    `SELECT table_name 
     FROM information_schema.tables 
     WHERE table_schema = 'app' AND table_type = 'BASE TABLE'`
  );
  console.log(`✓ DataPort can read ${tablesRes.rows.length} base tables in app schema`);

  await pool.end();
  console.log('=== GATE 8: Search & DataPort PASSED ===');
}

testPhase8().catch((err) => {
  console.error('GATE 8 FAILED:', err);
  process.exit(1);
});
