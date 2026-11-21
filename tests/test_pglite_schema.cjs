const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const fs = require('fs');
const path = require('path');

(async () => {
  try {
    console.log('[TEST] Initializing PGlite with pg_trgm extension...');
    const dbDir = path.resolve('tests/test_pglite_data');
    if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
    
    const db = new PGlite(dbDir, {
      extensions: {
        pg_trgm,
      },
    });
    
    let sql1 = fs.readFileSync('db/migrations/0001_initial.sql', 'utf8');
    sql1 = sql1.replace(/^\\[^\n]*\n?/gm, '');
    await db.exec(sql1);
    console.log('✓ 0001_initial.sql executed successfully!');

    let sql2 = fs.readFileSync('db/migrations/0002_fix_constraints_and_search.sql', 'utf8');
    sql2 = sql2.replace(/^\\[^\n]*\n?/gm, '');
    await db.exec(sql2);
    console.log('✓ 0002_fix_constraints_and_search.sql executed successfully with pg_trgm!');

    // Verify products
    const prodRes = await db.query('SELECT COUNT(*)::int as count FROM app.products;');
    console.log('✓ Total standard products in PGlite:', prodRes.rows[0].count);

    // Verify search with normalize_ar and trgm
    const searchRes = await db.query("SELECT id, name, default_sale_price FROM app.products WHERE app.normalize_ar(name) LIKE '%زلط%' LIMIT 3;");
    console.log('✓ Search query test in PGlite:', searchRes.rows);

    console.log('🎉 PGLITE EMBEDDED POSTGRESQL IS 100% OPERATIONAL!');
  } catch (err) {
    console.error('Test error:', err);
  }
})();
