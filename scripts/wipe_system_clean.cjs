const { Client } = require('pg');

async function wipeSystem() {
  const client = new Client({
    host: '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5434', 10),
    user: process.env.PGUSER || 'erp_owner',
    password: process.env.PGPASSWORD || 'erp_password_local_123',
    database: 'fludo_erp',
  });

  await client.connect();
  console.log('--- Wiping system data while preserving products & equipment ---');

  try {
    await client.query('BEGIN');
    await client.query("SET session_replication_role = 'replica';");

    // 1. Check current counts before wipe
    const preGoods = await client.query('SELECT count(*) FROM app.products');
    const preEquip = await client.query('SELECT count(*) FROM app.equipment');
    const preParties = await client.query('SELECT count(*) FROM app.parties');
    const preInvoices = await client.query('SELECT count(*) FROM app.sales_invoices');
    console.log(`Before wipe: Products: ${preGoods.rows[0].count}, Equipment: ${preEquip.rows[0].count}, Parties: ${preParties.rows[0].count}, Sales Invoices: ${preInvoices.rows[0].count}`);

    // 2. Truncate / delete transactional tables in order
    await client.query('DELETE FROM app.payment_allocations;');
    await client.query('DELETE FROM app.payments;');
    await client.query('DELETE FROM app.sales_invoice_lines;');
    await client.query('DELETE FROM app.shipments;');
    await client.query('DELETE FROM app.sales_invoices;');
    await client.query('DELETE FROM app.purchase_invoice_lines;');
    await client.query('DELETE FROM app.purchase_invoices;');
    await client.query('DELETE FROM app.order_lines;');
    await client.query('DELETE FROM app.orders;');
    await client.query('DELETE FROM app.expenses;');
    await client.query('DELETE FROM app.cash_transfers;');
    await client.query('DELETE FROM app.cash_counts;');
    await client.query('DELETE FROM app.cash_accounts;');
    await client.query('DELETE FROM app.attendance;');
    await client.query('DELETE FROM app.employee_transactions;');
    await client.query('DELETE FROM app.employees;');
    await client.query('DELETE FROM app.journal_lines;');
    await client.query('DELETE FROM app.journal_entries;');
    await client.query('DELETE FROM app.audit_log;');
    await client.query('DELETE FROM app.parties;');

    // 3. Reset document sequences so numbering starts fresh from 1
    await client.query(`
      UPDATE app.document_sequences 
      SET next_value = 1 
      WHERE doc_type IN (
        'customer', 'supplier', 'employee', 'sale', 'purchase', 'return_sale', 'return_purchase',
        'payment_in', 'payment_out', 'cash_transfer', 'order_sale', 'order_purchase'
      );
    `);

    await client.query("SET session_replication_role = 'origin';");
    await client.query('COMMIT');
    console.log('✓ Database transaction committed successfully!');

    // 4. Verify after wipe
    const postGoods = await client.query('SELECT count(*) FROM app.products');
    const postEquip = await client.query('SELECT count(*) FROM app.equipment');
    const postParties = await client.query('SELECT count(*) FROM app.parties');
    const postInvoices = await client.query('SELECT count(*) FROM app.sales_invoices');
    const postPayments = await client.query('SELECT count(*) FROM app.payments');
    const postCash = await client.query('SELECT count(*) FROM app.cash_accounts');

    console.log(`\nAfter wipe:`);
    console.log(`  - Products (البضائع المحفوظة): ${postGoods.rows[0].count}`);
    console.log(`  - Equipment (العربات والمعدات المحفوظة): ${postEquip.rows[0].count}`);
    console.log(`  - Parties (العملاء والموردين): ${postParties.rows[0].count} (صفر - تم التفريغ)`);
    console.log(`  - Invoices (الفواتير): ${postInvoices.rows[0].count} (صفر - تم التفريغ)`);
    console.log(`  - Payments (السندات والمدفوعات): ${postPayments.rows[0].count} (صفر - تم التفريغ)`);
    console.log(`  - Cash Accounts (الخزائن): ${postCash.rows[0].count} (صفر - تبدأ نظيفة)`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Wipe failed, rolled back:', err);
    throw err;
  } finally {
    await client.end();
  }
}

wipeSystem().catch((e) => {
  console.error(e);
  process.exit(1);
});
