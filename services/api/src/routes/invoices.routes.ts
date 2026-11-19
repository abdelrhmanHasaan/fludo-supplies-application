import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import {
  createSalesInvoice,
  approveSalesInvoice,
  cancelSalesInvoice,
  createPurchaseInvoice,
} from '../domain/invoices.js';

export const invoicesRoutes: FastifyPluginAsync = async (fastify) => {
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
        amountPaidNow: body.amountPaidNow || 0,
        notes: body.notes,
        lines: body.lines,
      });

      if (body.autoApprove) {
        await approveSalesInvoice(
          client,
          id,
          body.userId || '00000000-0000-0000-0000-000000000001',
          body.amountPaidNow || 0
        );
      }
      return id;
    });

    return { status: 'created', invoiceId };
  });

  // Approve Sales Invoice
  fastify.post('/sales/:id/approve', async (req, reply) => {
    const { id } = req.params as any;
    const { amountPaidNow, userId } = req.body as any;

    await withTransaction(async (client) => {
      await approveSalesInvoice(
        client,
        id,
        userId || '00000000-0000-0000-0000-000000000001',
        amountPaidNow || 0
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
};
