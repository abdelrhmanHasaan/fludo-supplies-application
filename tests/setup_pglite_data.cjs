const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const targetDir = path.resolve('data/pglite_db');
    console.log('[MIGRATE] Setting up PGlite database in:', targetDir);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const db = new PGlite(targetDir, {
      extensions: { pg_trgm }
    });
    await db.waitReady;

    console.log('[MIGRATE] Applying 0001_initial.sql...');
    let sql1 = fs.readFileSync('db/migrations/0001_initial.sql', 'utf8');
    sql1 = sql1.replace(/^\\[^\n]*\n?/gm, '');
    await db.exec(sql1);
    console.log('✓ 0001 applied.');

    console.log('[MIGRATE] Applying 0002_fix_constraints_and_search.sql...');
    let sql2 = fs.readFileSync('db/migrations/0002_fix_constraints_and_search.sql', 'utf8');
    sql2 = sql2.replace(/^\\[^\n]*\n?/gm, '');
    await db.exec(sql2);
    console.log('✓ 0002 applied.');

    const prd = await db.query('SELECT COUNT(*)::int as count FROM app.products;');
    console.log('✓ Verified products count:', prd.rows[0].count);

    const usr = await db.query('SELECT COUNT(*)::int as count FROM app.users;');
    console.log('✓ Verified users count:', usr.rows[0].count);

    console.log('🎉 PGLITE DATABASE PREPARED SUCCESSFULLY IN data/pglite_db!');
  } catch (err) {
    console.error('Migration error:', err);
  }
})();
