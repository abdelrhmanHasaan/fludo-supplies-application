"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsRoutes = void 0;
const db_js_1 = require("../config/db.js");
const payments_js_1 = require("../domain/payments.js");
const paymentsRoutes = async (fastify) => {
    // List Payments
    fastify.get('/', async (req, reply) => {
        const { direction, party_id } = req.query;
        let query = `
      SELECT 
        py.*,
        p.name AS party_name,
        p.phone AS party_phone,
        TO_CHAR(py.payment_date, 'YYYY-MM-DD') AS payment_date
      FROM app.payments py
      LEFT JOIN app.parties p ON p.id = py.party_id
      WHERE 1=1
    `;
        const params = [];
        let pIdx = 1;
        if (direction) {
            query += ` AND py.direction = $${pIdx++}`;
            params.push(direction);
        }
        if (party_id) {
            query += ` AND py.party_id = $${pIdx++}`;
            params.push(party_id);
        }
        query += ` ORDER BY py.payment_date DESC, py.created_at DESC`;
        const res = await db_js_1.pool.query(query, params);
        return res.rows.map((r) => ({
            ...r,
            amount: parseFloat(r.amount),
        }));
    });
    // Record Payment / Collection
    fastify.post('/', async (req, reply) => {
        const body = req.body;
        if (!body.amount || parseFloat(body.amount) <= 0) {
            return reply.status(400).send({ error: 'يرجى إدخال مبلغ صحيح' });
        }
        try {
            const paymentId = await (0, db_js_1.withTransaction)(async (client) => {
                const pType = body.paymentType || (body.direction === 'out' ? 'supplier_payment' : 'customer_receipt');
                return await (0, payments_js_1.recordPayment)(client, {
                    paymentType: pType,
                    partyId: body.partyId || body.party_id,
                    paymentDate: body.paymentDate || body.payment_date || new Date().toISOString().split('T')[0],
                    amount: parseFloat(body.amount),
                    paymentMethod: body.paymentMethod || 'cash',
                    cashAccountId: body.cashAccountId || body.cash_account_id,
                    driverName: body.driverName || body.driver_name,
                    notes: body.notes,
                    allocations: body.allocations,
                });
            });
            return { status: 'created', paymentId };
        }
        catch (err) {
            return reply.status(400).send({ error: err.message || 'فشل تسجيل المعاملة' });
        }
    });
};
exports.paymentsRoutes = paymentsRoutes;
