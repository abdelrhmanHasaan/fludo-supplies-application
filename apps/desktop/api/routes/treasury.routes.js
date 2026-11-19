"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.treasuryRoutes = void 0;
const db_js_1 = require("../config/db.js");
const accounting_js_1 = require("../domain/accounting.js");
const treasuryRoutes = async (fastify) => {
    // List Cash & Bank Accounts
    fastify.get('/accounts', async (req, reply) => {
        // Ensure default cashbox and bank exist
        const checkRes = await db_js_1.pool.query('SELECT count(*) AS count FROM app.cash_accounts WHERE NOT is_deleted');
        if (parseInt(checkRes.rows[0].count, 10) === 0) {
            const cashAcc = await db_js_1.pool.query("SELECT id FROM app.accounts WHERE code = '1010'");
            const bankAcc = await db_js_1.pool.query("SELECT id FROM app.accounts WHERE code = '1020'");
            if (cashAcc.rows.length > 0) {
                await db_js_1.pool.query("INSERT INTO app.cash_accounts (name, kind, account_id) VALUES ('الخزينة الرئيسية', 'cashbox', $1) ON CONFLICT DO NOTHING", [cashAcc.rows[0].id]);
            }
            if (bankAcc.rows.length > 0) {
                await db_js_1.pool.query("INSERT INTO app.cash_accounts (name, kind, account_id) VALUES ('الحساب البنكي الرئيسي', 'bank', $1) ON CONFLICT DO NOTHING", [bankAcc.rows[0].id]);
            }
        }
        const res = await db_js_1.pool.query(`
      SELECT 
        ca.id,
        ca.name,
        ca.name AS name_ar,
        ca.kind,
        ca.account_id,
        a.code AS gl_code,
        a.name_ar AS gl_name,
        COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM app.cash_accounts ca
      JOIN app.accounts a ON a.id = ca.account_id
      LEFT JOIN app.journal_lines l ON l.account_id = a.id
      WHERE NOT ca.is_deleted
      GROUP BY ca.id, ca.name, ca.kind, ca.account_id, a.code, a.name_ar
      ORDER BY ca.name
    `);
        return res.rows.map((r) => ({
            ...r,
            balance: parseFloat(r.balance),
        }));
    });
    // Transfer between Cash / Bank
    fastify.post('/transfer', async (req, reply) => {
        const { fromAccountId, toAccountId, amount, notes } = req.body;
        if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
            return reply.status(400).send({ error: 'يرجى تحديد الحسابات ومبلغ التحويل بشكل صحيح' });
        }
        const journalId = await (0, db_js_1.withTransaction)(async (client) => {
            const fromRes = await client.query('SELECT ca.*, a.code FROM app.cash_accounts ca JOIN app.accounts a ON a.id = ca.gl_account_id WHERE ca.id = $1', [fromAccountId]);
            const toRes = await client.query('SELECT ca.*, a.code FROM app.cash_accounts ca JOIN app.accounts a ON a.id = ca.gl_account_id WHERE ca.id = $1', [toAccountId]);
            const fromAcc = fromRes.rows[0];
            const toAcc = toRes.rows[0];
            return await (0, accounting_js_1.postJournalEntry)(client, {
                entryDate: new Date().toISOString().split('T')[0],
                sourceDocType: 'cash_transfer',
                sourceDocId: fromAccountId,
                narration: `تحويل أموال من ${fromAcc.name_ar} إلى ${toAcc.name_ar}: ${notes || ''}`,
                lines: [
                    {
                        accountCode: toAcc.code, // Debit recipient account
                        debit: amount,
                        credit: 0,
                        description: `تحويل وارد من ${fromAcc.name_ar}`,
                    },
                    {
                        accountCode: fromAcc.code, // Credit sender account
                        debit: 0,
                        credit: amount,
                        description: `تحويل صادر إلى ${toAcc.name_ar}`,
                    },
                ],
            });
        });
        return { status: 'success', journalId };
    });
    // Physical Cash Count Reconciliation (جرد الخزينة)
    fastify.post('/count', async (req, reply) => {
        const { cashAccountId, countedAmount, notes } = req.body;
        if (!cashAccountId || countedAmount === undefined) {
            return reply.status(400).send({ error: 'يرجى تحديد الحساب والمبلغ المجرود' });
        }
        const res = await (0, db_js_1.withTransaction)(async (client) => {
            const accRes = await client.query(`SELECT ca.*, COALESCE(SUM(l.debit - l.credit), 0) AS recorded_balance
         FROM app.cash_accounts ca
         JOIN app.accounts a ON a.id = ca.gl_account_id
         LEFT JOIN app.journal_lines l ON l.account_id = a.id
         WHERE ca.id = $1
         GROUP BY ca.id`, [cashAccountId]);
            const recorded = parseFloat(accRes.rows[0]?.recorded_balance || '0');
            const difference = parseFloat(countedAmount) - recorded;
            const countRes = await client.query(`INSERT INTO app.cash_counts (
          cash_account_id, count_date, recorded_balance, counted_balance, difference, notes
        ) VALUES ($1, now()::date, $2, $3, $4, $5)
        RETURNING *`, [cashAccountId, recorded, countedAmount, difference, notes || null]);
            return countRes.rows[0];
        });
        return res;
    });
};
exports.treasuryRoutes = treasuryRoutes;
