const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('@electric-sql/pglite/contrib/pg_trgm');
const path = require('path');
const fs = require('fs');

class EmbeddedPgPool {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    if (!this.db) {
      this.db = new PGlite(this.dataDir, {
        extensions: { pg_trgm }
      });
      await this.db.waitReady;
    }
    return this.db;
  }

  async query(text, params) {
    await this.initPromise;
    const res = await this.db.query(text, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
      fields: res.fields,
    };
  }

  async exec(sql) {
    await this.initPromise;
    return await this.db.exec(sql);
  }

  async connect() {
    await this.initPromise;
    const self = this;
    return {
      query: (t, p) => self.query(t, p),
      release: () => {},
    };
  }
}

(async () => {
  try {
    const pool = new EmbeddedPgPool(path.resolve('tests/test_wrapper_db'));
    
    await pool.query('CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT);');
    const ins = await pool.query('INSERT INTO items (name) VALUES ($1) RETURNING *;', ['Test Item']);
    console.log('Inserted:', ins.rows, 'rowCount:', ins.rowCount);

    const sel = await pool.query('SELECT * FROM items;');
    console.log('Selected:', sel.rows);

    const client = await pool.connect();
    await client.query('UPDATE items SET name = $1 WHERE id = $2;', ['Updated Name', 1]);
    client.release();

    const after = await pool.query('SELECT * FROM items;');
    console.log('After update:', after.rows);

    console.log('✓ EmbeddedPgPool wrapper functions seamlessly!');
  } catch (err) {
    console.error('Error in wrapper test:', err);
  }
})();
