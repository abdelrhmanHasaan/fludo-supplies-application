"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partiesRoutes = void 0;
const db_js_1 = require("../config/db.js");
const payments_js_1 = require("../domain/payments.js");
const partiesRoutes = async (fastify) => {
    // List Parties (Customers & Suppliers)
    fastify.get('/', async (req, reply) => {
        const { is_customer, is_supplier, search } = req.query;
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
            query += ` AND (p.name ILIKE $${pIdx} OR p.phone ILIKE $${pIdx})`;
            params.push(`%${search}%`);
            pIdx++;
        }
        query += ` GROUP BY p.id ORDER BY p.name`;
        const res = await db_js_1.pool.query(query, params);
        return res.rows.map((r) => ({
            ...r,
            customer_balance: parseFloat(r.customer_balance),
            supplier_balance: parseFloat(r.supplier_balance),
        }));
    });
    // Create Party
    fastify.post('/', async (req, reply) => {
        const { name, phone, address, is_customer, is_supplier, notes } = req.body;
        if (!name)
            return reply.status(400).send({ error: 'اسم الطرف مطلوب' });
        const res = await db_js_1.pool.query(`INSERT INTO app.parties (name, phone, address, is_customer, is_supplier, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`, [
            name,
            phone || null,
            address || null,
            is_customer ?? true,
            is_supplier ?? false,
            notes || null,
        ]);
        return res.rows[0];
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
