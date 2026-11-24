import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import {
  createSalesInvoice,
  approveSalesInvoice,
  cancelSalesInvoice,
  createPurchaseInvoice,
} from '../domain/invoices.js';

export const invoicesRoutes: FastifyPluginAsync = async (fastify) => {
  // Comprehensive Invoices Registry (Sales, Purchases, Returns) with Search & Status Filters
  fastify.get('/registry', async (req, reply) => {
    const { doc_type, payment_status, start_date, end_date, search } = req.query as any;

    let sql = `
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
          p.phone AS party_phone,
          si.net_total::numeric(16,2),
          si.discount_amount::numeric(16,2),
          si.handling_fee::numeric(16,2),
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
          COALESCE(eq.name, '') AS vehicle_name,
          si.notes
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
          p.phone AS party_phone,
          pi.net_total::numeric(16,2),
          pi.discount_amount::numeric(16,2),
          0.00::numeric(16,2) AS handling_fee,
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
          '' AS vehicle_name,
          pi.notes
        FROM app.purchase_invoices pi
        JOIN app.parties p ON p.id = pi.party_id
        WHERE NOT pi.is_deleted
      ),
      computed AS (
        SELECT
          *,
          (net_total - paid_amount)::numeric(16,2) AS remaining_amount,
          CASE
            WHEN status = 'cancelled' THEN 'cancelled'
            WHEN paid_amount >= net_total AND net_total > 0 THEN 'paid'
            WHEN paid_amount > 0 THEN 'partial'
            ELSE 'unpaid'
          END AS computed_payment_status,
          TO_CHAR(invoice_date, 'YYYY-MM-DD') AS invoice_date_str,
          TO_CHAR(created_at, 'HH24:MI') AS invoice_time_str
        FROM all_invoices
      )
      SELECT * FROM computed WHERE 1=1
    `;

    const params: any[] = [];
    let pIdx = 1;

    if (doc_type && doc_type !== 'all') {
      if (doc_type === 'return') {
        sql += ` AND invoice_type = 'return'`;
      } else {
        sql += ` AND doc_kind = $${pIdx++}`;
        params.push(doc_type);
      }
    }

    if (payment_status && payment_status !== 'all') {
      sql += ` AND computed_payment_status = $${pIdx++}`;
      params.push(payment_status);
    }

    if (start_date && end_date) {
      sql += ` AND invoice_date BETWEEN $${pIdx++} AND $${pIdx++}`;
      params.push(start_date, end_date);
    }

    if (search && search.trim()) {
      sql += ` AND (invoice_no ILIKE $${pIdx} OR party_name ILIKE $${pIdx} OR party_phone ILIKE $${pIdx})`;
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    sql += ` ORDER BY invoice_date DESC, created_at DESC`;

    const res = await pool.query(sql, params);
    return res.rows.map((r) => ({
      ...r,
      net_total: parseFloat(r.net_total || '0'),
      discount_amount: parseFloat(r.discount_amount || '0'),
      handling_fee: parseFloat(r.handling_fee || '0'),
      paid_amount: parseFloat(r.paid_amount || '0'),
      remaining_amount: parseFloat(r.remaining_amount || '0'),
    }));
  });

  // List Sales Invoices
  fastify.get('/sales', async (req, reply) => {
    const { party_id, status, start_date, end_date } = req.query as any;

    let query = `
      SELECT 
        i.*,
        p.name AS party_name,
        p.phone AS party_phone,
        TO_CHAR(i.invoice_date, 'YYYY-MM-DD') AS invoice_date
      FROM app.sales_invoices i
      JOIN app.parties p ON p.id = i.party_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (party_id) {
      query += ` AND i.party_id = $${pIdx++}`;
      params.push(party_id);
    }
    if (status) {
      query += ` AND i.status = $${pIdx++}`;
      params.push(status);
    }
    if (start_date && end_date) {
      query += ` AND i.invoice_date BETWEEN $${pIdx++} AND $${pIdx++}`;
      params.push(start_date, end_date);
    }

    query += ` ORDER BY i.invoice_date DESC, i.created_at DESC`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      ...r,
      net_total: parseFloat(r.net_total || '0'),
      lines_total: parseFloat(r.lines_total || '0'),
      handling_fee: parseFloat(r.handling_fee || '0'),
      previous_balance_snapshot: parseFloat(r.previous_balance_snapshot || '0'),
      total_due:
        parseFloat(r.net_total || '0') + parseFloat(r.previous_balance_snapshot || '0'),
    }));
  });

  // Get Sales Invoice with Lines (For View / Printing)
  fastify.get('/sales/:id', async (req, reply) => {
    const { id } = req.params as any;

    const invRes = await pool.query(
      `SELECT i.*, p.name AS party_name, p.phone AS party_phone, p.address AS party_address,
              TO_CHAR(i.invoice_date, 'YYYY-MM-DD') AS invoice_date
       FROM app.sales_invoices i
       JOIN app.parties p ON p.id = i.party_id
       WHERE i.id = $1`,
      [id]
    );
    if (invRes.rows.length === 0) return reply.status(404).send({ error: 'الفاتورة غير موجودة' });

    const linesRes = await pool.query(
      `SELECT l.*, p.name AS product_name, p.code AS product_code, u.name AS unit_name
       FROM app.sales_invoice_lines l
       JOIN app.products p ON p.id = l.product_id
       LEFT JOIN app.units u ON u.id = p.unit_id
       WHERE l.invoice_id = $1
       ORDER BY l.line_no`,
      [id]
    );

    const inv = invRes.rows[0];
    const netTotal = parseFloat(inv.net_total || '0');
    const handlingFee = parseFloat(inv.handling_fee || '0');
    const prevBalance = parseFloat(inv.previous_balance_snapshot || '0');
    const totalDue = netTotal + prevBalance;

    const payRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM app.payment_allocations
       WHERE sales_invoice_id = $1`,
      [id]
    );
    const totalPaid = parseFloat(payRes.rows[0]?.total_paid || '0');

    return {
      invoice: {
        ...inv,
        net_total: netTotal,
        handling_fee: handlingFee,
        previous_balance_snapshot: prevBalance,
        total_due: totalDue,
        total_paid: totalPaid,
        remaining_due: totalDue - totalPaid,
      },
      lines: linesRes.rows.map((l) => ({
        ...l,
        qty: parseFloat(l.qty),
        unit_price: parseFloat(l.unit_price),
        line_total: parseFloat(l.line_total),
      })),
    };
  });

  // Create Sales Invoice (Draft or Immediate Approval)
  fastify.post('/sales', async (req, reply) => {
    const body = req.body as any;
    if (!body.partyId || !body.lines || body.lines.length === 0) {
      return reply.status(400).send({ error: 'يرجى تحديد العميل والبنود' });
    }

    const invoiceId = await withTransaction(async (client) => {
      const id = await createSalesInvoice(client, {
        partyId: body.partyId,
        invoiceDate: body.invoiceDate || new Date().toISOString().split('T')[0],
        handlingFee: body.handlingFee || 0,
        discountAmount: body.discountAmount || 0,
        amountPaidNow: body.amountPaidNow || 0,
        cashAccountId: body.cashAccountId,
        driverId: body.driverId,
        vehicleId: body.vehicleId,
        destination: body.destination,
        notes: body.notes,
        lines: body.lines,
      });

      if (body.autoApprove) {
        await approveSalesInvoice(
          client,
          id,
          body.userId || '00000000-0000-0000-0000-000000000001',
          body.amountPaidNow || 0,
          body.cashAccountId
        );
      }
      return id;
    });

    return { status: 'created', invoiceId };
  });

  // Approve Sales Invoice
  fastify.post('/sales/:id/approve', async (req, reply) => {
    const { id } = req.params as any;
    const { amountPaidNow, cashAccountId, userId } = req.body as any;

    await withTransaction(async (client) => {
      await approveSalesInvoice(
        client,
        id,
        userId || '00000000-0000-0000-0000-000000000001',
        amountPaidNow || 0,
        cashAccountId
      );
    });

    return { status: 'approved' };
  });

  // Cancel Sales Invoice
  fastify.post('/sales/:id/cancel', async (req, reply) => {
    const { id } = req.params as any;
    const { approvalId, reason, userId } = req.body as any;

    await withTransaction(
      async (client) => {
        await cancelSalesInvoice(client, id, approvalId, reason || 'إلغاء بناء على طلب المدير');
      },
      { userId, editApprovalId: approvalId }
    );

    return { status: 'cancelled' };
  });

  // List Purchase Invoices / Goods Receipts
  fastify.get('/purchase', async (req, reply) => {
    const res = await pool.query(
      `SELECT pi.*, p.name AS party_name, p.phone AS party_phone,
              TO_CHAR(pi.invoice_date, 'YYYY-MM-DD') AS invoice_date
       FROM app.purchase_invoices pi
       JOIN app.parties p ON p.id = pi.party_id
       ORDER BY pi.invoice_date DESC, pi.created_at DESC`
    );
    return res.rows.map((r) => ({
      ...r,
      net_total: parseFloat(r.net_total || '0'),
    }));
  });

  // Create Purchase Invoice / Goods Receipt Note
  fastify.post('/purchase', async (req, reply) => {
    const body = req.body as any;
    if (!body.partyId || !body.lines || body.lines.length === 0) {
      return reply.status(400).send({ error: 'يرجى تحديد المورد والبنود' });
    }

    const invoiceId = await withTransaction(async (client) => {
      return await createPurchaseInvoice(client, {
        partyId: body.partyId,
        invoiceDate: body.invoiceDate || new Date().toISOString().split('T')[0],
        notes: body.notes,
        lines: body.lines,
      });
    });

    return { status: 'created', invoiceId };
  });

  // Record Invoice Print Event (Plain vs with Carried Balance Snapshot)
  fastify.post('/print-log', async (req, reply) => {
    const { invoice_id, invoice_kind, mode, carried_balance_snapshot } = req.body as any;
    if (!invoice_id) {
      return reply.status(400).send({ error: 'معرف الفاتورة مطلوب' });
    }
    const res = await pool.query(
      `INSERT INTO app.invoice_prints (invoice_id, invoice_kind, mode, carried_balance_snapshot)
       VALUES ($1, COALESCE($2, 'sale'), COALESCE($3, 'plain'), COALESCE($4, 0))
       RETURNING *`,
      [invoice_id, invoice_kind || 'sale', mode || 'plain', carried_balance_snapshot || 0]
    );
    return { status: 'success', log: res.rows[0] };
  });
};
