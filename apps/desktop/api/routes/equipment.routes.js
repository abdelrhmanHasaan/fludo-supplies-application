"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.equipmentRoutes = void 0;
const db_js_1 = require("../config/db.js");
const equipment_js_1 = require("../domain/equipment.js");
const equipmentRoutes = async (fastify) => {
    // List Equipment with Expenses Summary
    fastify.get('/', async (req, reply) => {
        const { start_date, end_date } = req.query;
        const summary = await (0, equipment_js_1.getEquipmentSummary)(db_js_1.pool, start_date, end_date);
        return summary.map((s) => ({
            ...s,
            total_expenses: parseFloat(s.total_expenses),
            expense_count: parseInt(s.expense_count, 10),
        }));
    });
    // Record Equipment Expense
    fastify.post('/expenses', async (req, reply) => {
        const body = req.body;
        if (!body.equipmentId || !body.amount || body.amount <= 0) {
            return reply.status(400).send({ error: 'يرجى تحديد المعدة والمبلغ' });
        }
        const expenseId = await (0, db_js_1.withTransaction)(async (client) => {
            return await (0, equipment_js_1.recordEquipmentExpense)(client, {
                equipmentId: body.equipmentId,
                expenseDate: body.expenseDate || new Date().toISOString().split('T')[0],
                amount: body.amount,
                expenseType: body.expenseType || 'fuel',
                description: body.description,
            });
        });
        return { status: 'created', expenseId };
    });
    // List Expense History
    fastify.get('/expenses', async (req, reply) => {
        const { equipment_id } = req.query;
        let query = `
      SELECT 
        x.*,
        e.name AS equipment_name,
        e.code AS equipment_code,
        TO_CHAR(x.expense_date, 'YYYY-MM-DD') AS expense_date
      FROM app.equipment_expenses x
      JOIN app.equipment e ON e.id = x.equipment_id
      WHERE NOT x.is_deleted
    `;
        const params = [];
        if (equipment_id) {
            query += ' AND x.equipment_id = $1';
            params.push(equipment_id);
        }
        query += ' ORDER BY x.expense_date DESC, x.created_at DESC';
        const res = await db_js_1.pool.query(query, params);
        return res.rows.map((r) => ({
            ...r,
            amount: parseFloat(r.amount),
        }));
    });
};
exports.equipmentRoutes = equipmentRoutes;
