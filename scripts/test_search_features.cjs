const { Client } = require('pg');
const client = new Client({
  host: '127.0.0.1',
  port: 5434,
  user: 'erp_owner',
  password: 'erp_password_local_123',
  database: 'fludo_erp'
});

async function main() {
  await client.connect();

  // Check pg_trgm
  const trgmRes = await client.query("SELECT * FROM pg_extension WHERE extname = 'pg_trgm'");
  console.log('pg_trgm installed:', trgmRes.rows.length > 0);

  // Check normalize_ar
  const normRes = await client.query("SELECT proname FROM pg_proc WHERE proname = 'normalize_ar'");
  console.log('normalize_ar exists:', normRes.rows.length > 0);

  if (normRes.rows.length > 0) {
    const testNorm = await client.query("SELECT app.normalize_ar('أنس إبراهيم 123 ٤٥٦') AS normalized");
    console.log('Test normalize_ar output:', testNorm.rows[0].normalized);
  }

  await client.end();
}
main().catch(console.error);
