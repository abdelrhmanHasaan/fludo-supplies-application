import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { recordEquipmentExpense, getEquipmentSummary } from '../domain/equipment.js';

export const equipmentRoutes: FastifyPluginAsync = async (fastify) => {
  // List Equipment with Expenses Summary
  fastify.get('/', async (req, reply) => {
    const { start_date, end_date } = req.query as any;
    const summary = await getEquipmentSummary(pool as any, start_date, end_date);
    return summary.map((s) => ({
      ...s,
      total_expenses: parseFloat(s.total_expenses),
      expense_count: parseInt(s.expense_count, 10),
    }));
  });

  // Record Equipment Expense
  fastify.post('/expenses', async (req, reply) => {
    const body = req.body as any;
    if (!body.equipmentId || !body.amount || body.amount <= 0) {
      return reply.status(400).send({ error: 'يرجى تحديد المعدة والمبلغ' });
    }

    const expenseId = await withTransaction(async (client) => {
      return await recordEquipmentExpense(client, {
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
    const { equipment_id } = req.query as any;
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
    const params: any[] = [];
    if (equipment_id) {
      query += ' AND x.equipment_id = $1';
      params.push(equipment_id);
    }
    query += ' ORDER BY x.expense_date DESC, x.created_at DESC';

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      ...r,
      amount: parseFloat(r.amount),
    }));
  });
};

