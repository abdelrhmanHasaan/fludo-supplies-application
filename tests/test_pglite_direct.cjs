const { PGlite } = require('@electric-sql/pglite');

(async () => {
  try {
    console.log('Initializing PGlite in-process...');
    const db = new PGlite();
    
    await db.query('CREATE TABLE test (id SERIAL PRIMARY KEY, name TEXT, val INT);');
    await db.query('INSERT INTO test (name, val) VALUES ($1, $2);', ['hello', 42]);
    const res = await db.query('SELECT * FROM test;');
    console.log('Query result:', res.rows);
    console.log('SUCCESS: PGlite is 100% in-process WASM Postgres!');
  } catch (err) {
    console.error('PGlite error:', err);
  }
})();
