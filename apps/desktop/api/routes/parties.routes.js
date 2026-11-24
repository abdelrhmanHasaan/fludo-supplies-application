"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partiesRoutes = void 0;
const db_js_1 = require("../config/db.js");
const payments_js_1 = require("../domain/payments.js");
const partiesRoutes = async (fastify) => {
    // Alarms Endpoint (Countdown Expired & Balance Outstanding)
    fastify.get('/alarms', async (req, reply) => {
        const { is_customer, is_supplier } = req.query;
        let q = 'SELECT * FROM app.v_party_alarms WHERE 1=1';
        const params = [];
        if (is_customer !== undefined) {
            params.push(is_customer === 'true');
            q += ` AND is_customer = $${params.length}`;
        }
        if (is_supplier !== undefined) {
            params.push(is_supplier === 'true');
            q += ` AND is_supplier = $${params.length}`;
        }
        q += ' ORDER BY countdown_days ASC, party_name ASC';
        const res = await db_js_1.pool.query(q, params);
        return res.rows;
    });
    // List Parties (Customers & Suppliers) using unified v_party_summary
    fastify.get('/', async (req, reply) => {
        const { is_customer, is_supplier, search } = req.query;
        let query = `
      SELECT 
        p.id,
        COALESCE(p.code, s.party_code, '') AS code,
        p.name,
        p.phone,
        p.address,
        p.is_customer,
        p.is_supplier,
        p.notes,
        p.settlement_due_date,
        (p.settlement_due_date - CURRENT_DATE)::integer AS countdown_days,
        COALESCE(s.net_balance, 0)::numeric(16,2) AS net_balance,
        COALESCE(s.balance_type, 'خالص') AS balance_type,
        COALESCE(s.total_purchases, 0)::numeric(16,2) AS total_purchases,
        COALESCE(s.total_payments, 0)::numeric(16,2) AS total_payments,
        COALESCE(s.reserved_undelivered, 0)::numeric(16,3) AS reserved_undelivered,
        -- Backward-compatibility aliases
        COALESCE(s.net_balance, 0)::numeric(16,2) AS customer_balance,
        COALESCE(s.net_balance, 0)::numeric(16,2) AS supplier_balance,
        TO_CHAR(p.created_at, 'YYYY-MM-DD') AS created_at
      FROM app.parties p
      LEFT JOIN app.v_party_summary s ON s.party_id = p.id
      WHERE NOT p.is_deleted
    `;
        const params = [];
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
            query += ` AND (p.name ILIKE $${pIdx} OR p.phone ILIKE $${pIdx} OR p.code ILIKE $${pIdx})`;
            params.push(`%${search}%`);
            pIdx++;
        }
        query += ` ORDER BY p.created_at DESC, p.name ASC`;
        const res = await db_js_1.pool.query(query, params);
        return res.rows.map((r) => ({
            ...r,
            net_balance: parseFloat(r.net_balance),
            customer_balance: parseFloat(r.customer_balance),
            supplier_balance: parseFloat(r.supplier_balance),
            total_purchases: parseFloat(r.total_purchases),
            total_payments: parseFloat(r.total_payments),
            reserved_undelivered: parseFloat(r.reserved_undelivered),
        }));
    });
    // Create Party
    fastify.post('/', async (req, reply) => {
        const { name, phone, address, is_customer, is_supplier, notes, settlement_due_date } = req.body;
        if (!name || !name.trim())
            return reply.status(400).send({ error: 'اسم الطرف مطلوب' });
        const res = await db_js_1.pool.query(`INSERT INTO app.parties (name, phone, address, is_customer, is_supplier, notes, settlement_due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, [
            name.trim(),
            phone?.trim() || null,
            address?.trim() || null,
            is_customer ?? true,
            is_supplier ?? false,
            notes?.trim() || null,
            settlement_due_date || null,
        ]);
        return res.rows[0];
    });
    // Party Activity Ledger (from v_party_activity)
    fastify.get('/:id/activity', async (req, reply) => {
        const { id } = req.params;
        const res = await db_js_1.pool.query(`SELECT * FROM app.v_party_activity WHERE party_id = $1 ORDER BY occurred_at DESC, document_id DESC`, [id]);
        return res.rows;
    });
    // Party Summary Cards (from v_party_summary)
    fastify.get('/:id/summary', async (req, reply) => {
        const { id } = req.params;
        const res = await db_js_1.pool.query(`SELECT * FROM app.v_party_summary WHERE party_id = $1`, [id]);
        if (res.rows.length === 0)
            return reply.status(404).send({ error: 'الطرف غير موجود' });
        return res.rows[0];
    });
    // Party Shipments Movement (Trucks / Transport)
    fastify.get('/:id/shipments', async (req, reply) => {
        const { id } = req.params;
        const res = await db_js_1.pool.query(`SELECT
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
      ORDER BY sh.departed_at DESC NULLS LAST, sh.created_at DESC`, [id]);
        return res.rows;
    });
    // Party Reservations Progress (from v_reservation_lines)
    fastify.get('/:id/reservations', async (req, reply) => {
        const { id } = req.params;
        const res = await db_js_1.pool.query(`SELECT * FROM app.v_reservation_lines WHERE party_id = $1 ORDER BY created_at DESC`, [id]);
        return res.rows;
    });
    // Update Party (PIN protected)
    fastify.put('/:id', async (req, reply) => {
        const { id } = req.params;
        const { name, phone, category, relationship_start, credit_limit, supplies_text, notes, is_active } = req.body;
        try {
            const res = await db_js_1.pool.query(`UPDATE app.parties
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
         RETURNING *`, [name, phone, category, relationship_start, credit_limit, supplies_text, notes, is_active, id]);
            if (res.rows.length === 0)
                return reply.status(404).send({ error: 'الطرف غير موجود' });
            return res.rows[0];
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    // Party Statement Timeline
    fastify.get('/:id/statement', async (req, reply) => {
        const { id } = req.params;
        const { start_date, end_date } = req.query;
        const partyRes = await db_js_1.pool.query('SELECT * FROM app.parties WHERE id = $1', [id]);
        if (partyRes.rows.length === 0)
            return reply.status(404).send({ error: 'الطرف غير موجود' });
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
        const params = [id];
        if (start_date && end_date) {
            query += ` AND e.entry_date BETWEEN $2 AND $3`;
            params.push(start_date, end_date);
        }
        query += ` ORDER BY e.entry_date ASC, e.created_at ASC, l.line_no ASC`;
        const res = await db_js_1.pool.query(query, params);
        let runningBalance = 0;
        const rows = res.rows.map((r) => {
            const deb = parseFloat(r.debit);
            const cred = parseFloat(r.credit);
            if (party.is_customer) {
                runningBalance += deb - cred;
            }
            else {
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
        const { partyId, amount, notes } = req.body;
        if (!partyId || !amount || amount <= 0) {
            return reply.status(400).send({ error: 'يرجى تحديد الطرف وقيمة المقاصة بشكل صحيح' });
        }
        const journalId = await (0, db_js_1.withTransaction)(async (client) => {
            return await (0, payments_js_1.performPartyNetting)(client, partyId, amount, notes);
        });
        return { status: 'success', journalId };
    });
};
exports.partiesRoutes = partiesRoutes;
