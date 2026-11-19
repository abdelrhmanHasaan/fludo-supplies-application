"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensesRoutes = void 0;
const db_js_1 = require("../config/db.js");
const accounting_js_1 = require("../domain/accounting.js");
const expensesRoutes = async (fastify) => {
    // List Categories
    fastify.get('/categories', async (req, reply) => {
        const checkRes = await db_js_1.pool.query('SELECT count(*) AS count FROM app.expense_categories WHERE is_deleted = false');
        if (parseInt(checkRes.rows[0].count, 10) === 0) {
            await db_js_1.pool.query(`
        INSERT INTO app.expense_categories (name) VALUES
          ('إيجارات'),
          ('كهرباء ومياه ومرافق'),
          ('ضيافة وبوفيه'),
          ('أدوات مكتبية ومطبوعات'),
          ('اتصالات وإنترنت'),
          ('صيانة مقر ومخازن'),
          ('مصروفات نثرية متنوعة')
        ON CONFLICT DO NOTHING
      `);
        }
        const res = await db_js_1.pool.query('SELECT id, name, name AS name_ar FROM app.expense_categories WHERE is_deleted = false ORDER BY name');
        return res.rows;
    });
    // List Expenses
    fastify.get('/', async (req, reply) => {
        const res = await db_js_1.pool.query(`
      SELECT 
        x.*,
        c.name AS category_name,
        TO_CHAR(x.expense_date, 'YYYY-MM-DD') AS expense_date
      FROM app.expenses x
      LEFT JOIN app.expense_categories c ON c.id = x.category_id
      WHERE x.is_deleted = false
      ORDER BY x.expense_date DESC, x.created_at DESC
    `);
        return res.rows.map((r) => ({
            ...r,
            amount: parseFloat(r.amount),
        }));
    });
    // Record Expense
    fastify.post('/', async (req, reply) => {
        const { categoryId, expenseDate, amount, paymentMethod, payee, description } = req.body;
        if (!amount || amount <= 0)
            return reply.status(400).send({ error: 'المبلغ مطلوب' });
        const expenseId = await (0, db_js_1.withTransaction)(async (client) => {
            const nextNumRes = await client.query("SELECT app.next_doc_number('expense') AS num");
            const expenseNumber = nextNumRes.rows[0].num;
            const res = await client.query(`INSERT INTO app.expenses (
          expense_number, category_id, expense_date, amount, payment_method, payee, description, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved')
        RETURNING id`, [
                expenseNumber,
                categoryId || null,
                expenseDate || new Date().toISOString().split('T')[0],
                amount,
                paymentMethod || 'cash',
                payee || null,
                description || null,
            ]);
            const id = res.rows[0].id;
            // Post Journal: Dr General Expense (5300) / Cr Cash (1010)
            const journalId = await (0, accounting_js_1.postJournalEntry)(client, {
                entryDate: expenseDate || new Date().toISOString().split('T')[0],
                sourceDocType: 'expense',
                sourceDocId: id,
                narration: `مصروف عام ${expenseNumber}: ${description || payee || ''}`,
                lines: [
                    {
                        accountCode: '5300', // General Expense (مصروفات إدارية وتشغيلية)
                        debit: amount,
                        credit: 0,
                        description: description || 'مصروف عام',
                    },
                    {
                        accountCode: '1010', // Cash (الصندوق)
                        debit: 0,
                        credit: amount,
                        description: 'صرف نقدي',
                    },
                ],
            });
            await client.query('UPDATE app.expenses SET journal_entry_id = $1 WHERE id = $2', [journalId, id]);
            return id;
        });
        return { status: 'created', expenseId };
    });
};
exports.expensesRoutes = expensesRoutes;
