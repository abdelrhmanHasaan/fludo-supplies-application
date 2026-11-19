"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ordersRoutes = void 0;
const db_js_1 = require("../config/db.js");
const orders_js_1 = require("../domain/orders.js");
const ordersRoutes = async (fastify) => {
    // List Orders / Bookings
    fastify.get('/', async (req, reply) => {
        const { order_type, party_id, status } = req.query;
        let query = `
      SELECT 
        o.*,
        p.name AS party_name,
        p.phone AS party_phone,
        TO_CHAR(o.order_date, 'YYYY-MM-DD') AS order_date,
        COALESCE(SUM(ol.qty_ordered), 0) AS total_qty,
        COALESCE(SUM(ol.line_total), 0) AS total_amount
      FROM app.orders o
      JOIN app.parties p ON p.id = o.party_id
      LEFT JOIN app.order_lines ol ON ol.order_id = o.id
      WHERE 1=1
    `;
        const params = [];
        let pIdx = 1;
        if (order_type) {
            query += ` AND o.order_type = $${pIdx++}`;
            params.push(order_type);
        }
        if (party_id) {
            query += ` AND o.party_id = $${pIdx++}`;
            params.push(party_id);
        }
        if (status) {
            query += ` AND o.status = $${pIdx++}`;
            params.push(status);
        }
        query += ` GROUP BY o.id, p.name, p.phone ORDER BY o.order_date DESC, o.created_at DESC`;
        const res = await db_js_1.pool.query(query, params);
        return res.rows.map((r) => ({
            ...r,
            total_amount: parseFloat(r.total_amount),
            total_qty: parseFloat(r.total_qty),
        }));
    });
    // Get Order Details with Lines
    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params;
        const orderRes = await db_js_1.pool.query(`SELECT o.*, p.name AS party_name, p.phone AS party_phone
       FROM app.orders o
       JOIN app.parties p ON p.id = o.party_id
       WHERE o.id = $1`, [id]);
        if (orderRes.rows.length === 0)
            return reply.status(404).send({ error: 'الطلب / الحجز غير موجود' });
        const linesRes = await db_js_1.pool.query(`SELECT ol.*, p.name AS product_name, p.code AS product_code, u.name AS unit_name
       FROM app.order_lines ol
       JOIN app.products p ON p.id = ol.product_id
       LEFT JOIN app.units u ON u.id = p.unit_id
       WHERE ol.order_id = $1
       ORDER BY ol.line_no`, [id]);
        return {
            order: orderRes.rows[0],
            lines: linesRes.rows.map((l) => ({
                ...l,
                qty_ordered: parseFloat(l.qty_ordered),
                unit_price: parseFloat(l.unit_price),
                line_total: parseFloat(l.line_total),
            })),
        };
    });
    // Create Order / Booking
    fastify.post('/', async (req, reply) => {
        const body = req.body;
        if (!body.partyId || !body.lines || body.lines.length === 0) {
            return reply.status(400).send({ error: 'يرجى تحديد العميل والأصناف المحجوزة' });
        }
        const orderId = await (0, db_js_1.withTransaction)(async (client) => {
            return await (0, orders_js_1.createOrder)(client, {
                orderType: body.orderType || 'sales',
                partyId: body.partyId,
                orderDate: body.orderDate || new Date().toISOString().split('T')[0],
                priceGuaranteedUntil: body.priceGuaranteedUntil,
                notes: body.notes,
                lines: body.lines,
            });
        });
        return { status: 'created', orderId };
    });
};
exports.ordersRoutes = ordersRoutes;
