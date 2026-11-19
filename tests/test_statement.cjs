const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: 'postgresql://erp_owner:erp_secure_password_2026@127.0.0.1:5433/fludo_erp' });
  await c.connect();
  const res = await c.query(`
    SELECT 
      e.id AS journal_entry_id,
      TO_CHAR(e.entry_date, 'YYYY-MM-DD') AS entry_date,
      e.entry_no AS entry_number,
      e.source_type AS source_doc_type,
      l.description,
      l.debit,
      l.credit
    FROM app.journal_lines l
    JOIN app.journal_entries e ON e.id = l.entry_id
    JOIN app.accounts a ON a.id = l.account_id
    WHERE l.party_id = 'e1611444-5c0c-4895-9754-4518b2a205f5' AND (a.system_role = 'receivable' OR a.system_role = 'payable')
    ORDER BY e.entry_date ASC, e.created_at ASC, l.line_no ASC
  `);
  console.log('Statement rows count:', res.rows.length);
  if (res.rows.length > 0) {
    console.log('Sample row:', res.rows[0]);
  }
  await c.end();
}

main().catch(console.error);
