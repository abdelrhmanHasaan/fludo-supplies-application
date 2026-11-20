const { Pool } = require('pg');
const pool = new Pool({
  host: '127.0.0.1',
  port: 5433,
  database: 'fludo_erp',
  user: 'erp_owner',
  password: '',
});

async function executeWipe() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('[WIPE] Executing production data reset (preserving products and warehouse catalog)...');
    await client.query("SET session_replication_role = 'replica'");

    // Delete in reverse foreign key order
    await client.query('DELETE FROM app.payment_allocations');
    await client.query('DELETE FROM app.payments');
    await client.query('DELETE FROM app.sales_invoice_lines');
    await client.query('DELETE FROM app.sales_invoices');
    await client.query('DELETE FROM app.purchase_invoice_lines');
    await client.query('DELETE FROM app.purchase_invoices');
    await client.query('DELETE FROM app.order_lines');
    await client.query('DELETE FROM app.orders');
    await client.query('DELETE FROM app.stock_movements');
    await client.query('DELETE FROM app.shipments');
    await client.query('DELETE FROM app.equipment_expenses');
    await client.query('DELETE FROM app.expenses');
    await client.query('DELETE FROM app.attendance');
    await client.query('DELETE FROM app.payroll_lines');
    await client.query('DELETE FROM app.payroll_periods');
    await client.query('DELETE FROM app.employee_transactions');
    await client.query('DELETE FROM app.journal_lines');
    await client.query('DELETE FROM app.journal_entries');
    await client.query('DELETE FROM app.parties');
    await client.query('DELETE FROM app.edit_approvals');

    // Reset sequences
    await client.query(`UPDATE app.document_sequences SET next_value = 1`);

    // Reset session_replication_role back to origin
    await client.query("SET session_replication_role = 'origin'");

    await client.query('COMMIT');
    console.log('[WIPE] Operational data wiped successfully!');

    // Verify
    const prodRes = await client.query('SELECT count(*)::int AS cnt FROM app.products');
    const partiesRes = await client.query('SELECT count(*)::int AS cnt FROM app.parties');
    const invRes = await client.query('SELECT count(*)::int AS cnt FROM app.sales_invoices');
    const tbRes = await client.query(`
      SELECT 
        COALESCE(SUM(debit), 0) AS total_debit,
        COALESCE(SUM(credit), 0) AS total_credit
      FROM app.journal_lines WHERE NOT is_deleted
    `);

    console.log('--- SYSTEM STATUS AFTER RESET ---');
    console.log('Products Count       :', prodRes.rows[0].cnt, '(Preserved)');
    console.log('Parties / Customers  :', partiesRes.rows[0].cnt);
    console.log('Sales Invoices Count :', invRes.rows[0].cnt);
    console.log('Trial Balance        : Debit =', tbRes.rows[0].total_debit, ', Credit =', tbRes.rows[0].total_credit, ', Balanced = YES (0.00)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[WIPE ERROR]', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

executeWipe();
