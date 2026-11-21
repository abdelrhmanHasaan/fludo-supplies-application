const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    const r = await db.query("SELECT set_config('app.user_id', $1, true);", ['test-user-123']);
    console.log('set_config result:', r.rows);
  } catch (e) {
    console.error('set_config error:', e.message);
  }
})();
