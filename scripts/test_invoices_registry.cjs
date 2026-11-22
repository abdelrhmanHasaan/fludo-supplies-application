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

  const sql = `
    WITH all_invoices AS (
      SELECT
        si.id,
        si.invoice_no,
        'sale' AS doc_kind,
        si.invoice_type,
        si.invoice_date,
        si.created_at,
        p.id AS party_id,
        p.name AS party_name,
        si.net_total::numeric(16,2),
        si.discount_amount::numeric(16,2),
        si.status,
        COALESCE((
          SELECT string_agg(pr.name || ' (' || sil.qty || ' ' || COALESCE(sil.unit_name, '') || ')', '، ')
          FROM app.sales_invoice_lines sil
          JOIN app.products pr ON pr.id = sil.product_id
          WHERE sil.invoice_id = si.id
        ), '') AS items_summary,
        COALESCE((
          SELECT SUM(pa.amount)
          FROM app.payment_allocations pa
          WHERE pa.sales_invoice_id = si.id
        ), 0)::numeric(16,2) AS paid_amount,
        s.destination,
        COALESCE(e.full_name, '') AS driver_name,
        COALESCE(eq.name, '') AS vehicle_name
      FROM app.sales_invoices si
      JOIN app.parties p ON p.id = si.party_id
      LEFT JOIN app.shipments s ON s.invoice_id = si.id
      LEFT JOIN app.employees e ON e.id = s.driver_id
      LEFT JOIN app.equipment eq ON eq.id = s.vehicle_id
      WHERE NOT si.is_deleted

      UNION ALL

      SELECT
        pi.id,
        pi.invoice_no,
        'purchase' AS doc_kind,
        pi.invoice_type,
        pi.invoice_date,
        pi.created_at,
        p.id AS party_id,
        p.name AS party_name,
        pi.net_total::numeric(16,2),
        pi.discount_amount::numeric(16,2),
        pi.status,
        COALESCE((
          SELECT string_agg(pr.name || ' (' || pil.qty || ' ' || COALESCE(pil.unit_name, '') || ')', '، ')
          FROM app.purchase_invoice_lines pil
          JOIN app.products pr ON pr.id = pil.product_id
          WHERE pil.invoice_id = pi.id
        ), '') AS items_summary,
        COALESCE((
          SELECT SUM(pa.amount)
          FROM app.payment_allocations pa
          WHERE pa.purchase_invoice_id = pi.id
        ), 0)::numeric(16,2) AS paid_amount,
        NULL AS destination,
        '' AS driver_name,
        '' AS vehicle_name
      FROM app.purchase_invoices pi
      JOIN app.parties p ON p.id = pi.party_id
      WHERE NOT pi.is_deleted
    )
    SELECT
      *,
      (net_total - paid_amount)::numeric(16,2) AS remaining_amount,
      CASE
        WHEN status = 'cancelled' THEN 'cancelled'
        WHEN paid_amount >= net_total AND net_total > 0 THEN 'paid'
        WHEN paid_amount > 0 THEN 'partial'
        ELSE 'unpaid'
      END AS payment_status
    FROM all_invoices
    ORDER BY invoice_date DESC, created_at DESC
  `;

  const res = await client.query(sql);
  console.log('Total combined invoices count:', res.rows.length);
  res.rows.forEach(r => {
    console.log(`- ${r.invoice_no} (${r.doc_kind}) | ${r.party_name} | Net: ${r.net_total} | Status: ${r.payment_status}`);
  });

  await client.end();
}
main().catch(console.error);
