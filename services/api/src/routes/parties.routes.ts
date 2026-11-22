import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { performPartyNetting } from '../domain/payments.js';

export const partiesRoutes: FastifyPluginAsync = async (fastify) => {
  // List Parties (Customers & Suppliers)
  fastify.get('/', async (req, reply) => {
    const { is_customer, is_supplier, search } = req.query as any;

    let query = `
      SELECT 
        p.id,
        p.name,
        p.phone,
        p.address,
        p.is_customer,
        p.is_supplier,
        p.notes,
        COALESCE(SUM(CASE WHEN a.system_role = 'receivable' THEN (l.debit - l.credit) ELSE 0 END), 0) AS customer_balance,
        COALESCE(SUM(CASE WHEN a.system_role = 'payable' THEN (l.credit - l.debit) ELSE 0 END), 0) AS supplier_balance,
        TO_CHAR(p.created_at, 'YYYY-MM-DD') AS created_at
      FROM app.parties p
      LEFT JOIN app.journal_lines l ON l.party_id = p.id
      LEFT JOIN app.accounts a ON a.id = l.account_id
      WHERE NOT p.is_deleted
    `;

    const params: any[] = [];
    let pIdx = 1;

    if (is_customer !== undefined) {
      query += ` AND p.is_customer = $${pIdx++}`;
      params.push(is_customer === 'true');
    }
    if (is_supplier !== undefined) {
      query += ` AND p.is_supplier = $${pIdx++}`;
      params.push(is_supplier === 'true');
    }
    if (search) {
      query += ` AND (p.name ILIKE $${pIdx} OR p.phone ILIKE $${pIdx})`;
      params.push(`%${search}%`);
      pIdx++;
    }

    query += ` GROUP BY p.id ORDER BY p.name`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      ...r,
      customer_balance: parseFloat(r.customer_balance),
      supplier_balance: parseFloat(r.supplier_balance),
    }));
  });

  // Create Party
  fastify.post('/', async (req, reply) => {
    const { name, phone, address, is_customer, is_supplier, notes } = req.body as any;
    if (!name) return reply.status(400).send({ error: 'اسم الطرف مطلوب' });

    const res = await pool.query(
      `INSERT INTO app.parties (name, phone, address, is_customer, is_supplier, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        name,
        phone || null,
        address || null,
        is_customer ?? true,
        is_supplier ?? false,
        notes || null,
      ]
    );

    return res.rows[0];
  });

  // Party Activity Ledger (from v_party_activity)
  fastify.get('/:id/activity', async (req, reply) => {
    const { id } = req.params as any;
    const res = await pool.query(
      `SELECT * FROM app.v_party_activity WHERE party_id = $1 ORDER BY occurred_at DESC, document_id DESC`,
      [id]
    );
    return res.rows;
  });

  // Party Summary Cards (from v_party_summary)
  fastify.get('/:id/summary', async (req, reply) => {
    const { id } = req.params as any;
    const res = await pool.query(
      `SELECT * FROM app.v_party_summary WHERE party_id = $1`,
      [id]
    );
    if (res.rows.length === 0) return reply.status(404).send({ error: 'الطرف غير موجود' });
    return res.rows[0];
  });

  // Party Shipments Movement (Trucks / Transport)
  fastify.get('/:id/shipments', async (req, reply) => {
    const { id } = req.params as any;
    const res = await pool.query(
      `SELECT
        sh.id,
        sh.shipment_no,
        sh.departed_at,
        sh.destination,
        sh.status,
        si.id AS invoice_id,
        si.invoice_no,
        si.lines_total,
        si.discount_amount,
        si.net_total,
        e.full_name AS driver_name,
        eq.name AS vehicle_name,
        eq.plate_no,
        (
          SELECT json_agg(json_build_object(
            'product_name', p.name,
            'qty', sil.qty,
            'unit_name', sil.unit_name,
            'unit_price', sil.unit_price,
            'discount_amount', sil.discount_amount,
            'line_total', sil.line_total
          ))
          FROM app.sales_invoice_lines sil
          JOIN app.products p ON p.id = sil.product_id
          WHERE sil.invoice_id = si.id AND NOT sil.is_deleted
        ) AS items
      FROM app.shipments sh
      JOIN app.sales_invoices si ON si.id = sh.invoice_id
      LEFT JOIN app.employees e ON e.id = sh.driver_id
      LEFT JOIN app.equipment eq ON eq.id = sh.vehicle_id
      WHERE si.party_id = $1 AND NOT sh.is_deleted AND NOT si.is_deleted
      ORDER BY sh.departed_at DESC NULLS LAST, sh.created_at DESC`,
      [id]
    );
    return res.rows;
  });

  // Update Party (PIN protected)
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { name, phone, category, relationship_start, credit_limit, supplies_text, notes, is_active } = req.body as any;

    try {
      const res = await pool.query(
        `UPDATE app.parties
         SET name = COALESCE($1, name),
             phone = $2,
             category = $3,
             relationship_start = $4,
             credit_limit = $5,
             supplies_text = $6,
             notes = $7,
             is_active = COALESCE($8, is_active),
             updated_at = now()
         WHERE id = $9
         RETURNING *`,
        [name, phone, category, relationship_start, credit_limit, supplies_text, notes, is_active, id]
      );
      if (res.rows.length === 0) return reply.status(404).send({ error: 'الطرف غير موجود' });
      return res.rows[0];
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Party Statement Timeline
  fastify.get('/:id/statement', async (req, reply) => {
    const { id } = req.params as any;
    const { start_date, end_date } = req.query as any;

    const partyRes = await pool.query('SELECT * FROM app.parties WHERE id = $1', [id]);
    if (partyRes.rows.length === 0) return reply.status(404).send({ error: 'الطرف غير موجود' });
    const party = partyRes.rows[0];

    let query = `
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
      WHERE l.party_id = $1 AND (a.system_role = 'receivable' OR a.system_role = 'payable')
    `;
    const params: any[] = [id];

    if (start_date && end_date) {
      query += ` AND e.entry_date BETWEEN $2 AND $3`;
      params.push(start_date, end_date);
    }

    query += ` ORDER BY e.entry_date ASC, e.created_at ASC, l.line_no ASC`;

    const res = await pool.query(query, params);

    let runningBalance = 0;
    const rows = res.rows.map((r) => {
      const deb = parseFloat(r.debit);
      const cred = parseFloat(r.credit);
      if (party.is_customer) {
        runningBalance += deb - cred;
      } else {
        runningBalance += cred - deb;
      }
      return {
        ...r,
        debit: deb,
        credit: cred,
        running_balance: runningBalance,
      };
    });

    return {
      party,
      runningBalance,
      transactions: rows,
    };
  });

  // Perform Netting (مقاصة)
  fastify.post('/netting', async (req, reply) => {
    const { partyId, amount, notes } = req.body as any;
    if (!partyId || !amount || amount <= 0) {
      return reply.status(400).send({ error: 'يرجى تحديد الطرف وقيمة المقاصة بشكل صحيح' });
    }

    const journalId = await withTransaction(async (client) => {
      return await performPartyNetting(client, partyId, amount, notes);
    });

    return { status: 'success', journalId };
  });
};

