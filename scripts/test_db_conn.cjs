const { Pool } = require('pg');

async function testConn() {
  const ports = [5432, 5433];
  for (const port of ports) {
    console.log(`Testing port ${port}...`);
    try {
      const pool = new Pool({
        host: '127.0.0.1',
        port,
        user: 'postgres',
        password: 'password', // or erp_owner
        database: 'postgres',
        connectionTimeoutMillis: 2000,
      });
      const res = await pool.query('SELECT version();');
      console.log(`Connected to port ${port} as postgres:`, res.rows[0]);
      await pool.end();
    } catch (e1) {
      console.log(`Failed port ${port} as postgres/password:`, e1.message);
      try {
        const pool2 = new Pool({
          host: '127.0.0.1',
          port,
          user: 'erp_owner',
          password: 'erp_password_local_123',
          database: 'fludo_erp',
          connectionTimeoutMillis: 2000,
        });
        const res2 = await pool2.query('SELECT version();');
        console.log(`Connected to port ${port} as erp_owner/fludo_erp:`, res2.rows[0]);
        await pool2.end();
      } catch (e2) {
        console.log(`Failed port ${port} as erp_owner/fludo_erp:`, e2.message);
      }
    }
  }
}

testConn();
