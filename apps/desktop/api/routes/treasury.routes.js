"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.treasuryRoutes = void 0;
const db_js_1 = require("../config/db.js");
const treasuryRoutes = async (fastify) => {
    // 1. List Cash & Bank Accounts (Starts empty, no forced seeding)
    fastify.get('/accounts', async (req, reply) => {
        const res = await db_js_1.pool.query(`
      SELECT 
        ca.id,
        ca.name,
        ca.name AS name_ar,
        ca.kind,
        ca.opening_balance,
        ca.is_active,
        (
          ca.opening_balance +
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0) +
          COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'in' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'out' AND NOT is_deleted), 0) +
          COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE to_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE from_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0)
        ) AS balance
      FROM app.cash_accounts ca
      WHERE NOT ca.is_deleted
      ORDER BY ca.created_at ASC
    `);
        return res.rows.map((r) => ({
            ...r,
            opening_balance: parseFloat(r.opening_balance || '0'),
            balance: parseFloat(r.balance || '0'),
        }));
    });
    // 2. Create Cash / Wallet / Bank Account
    fastify.post('/accounts', async (req, reply) => {
        const { name, kind, opening_balance } = req.body;
        if (!name || !name.trim()) {
            return reply.status(400).send({ error: 'اسم الحساب أو الخزينة مطلوب' });
        }
        const validKinds = ['cash', 'wallet', 'bank', 'other'];
        const accKind = validKinds.includes(kind) ? kind : 'cash';
        const openBal = parseFloat(opening_balance || '0');
        try {
            const res = await db_js_1.pool.query(`INSERT INTO app.cash_accounts (name, kind, opening_balance, is_active)
         VALUES (trim($1), $2, $3, true)
         RETURNING *`, [name, accKind, openBal]);
            return res.rows[0];
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    // 3. Toggle Account Active / Inactive
    fastify.put('/accounts/:id/toggle-active', async (req, reply) => {
        const { id } = req.params;
        const res = await db_js_1.pool.query(`UPDATE app.cash_accounts
       SET is_active = NOT is_active, updated_at = now()
       WHERE id = $1 AND NOT is_deleted
       RETURNING *`, [id]);
        if (res.rows.length === 0)
            return reply.status(404).send({ error: 'الحساب غير موجود' });
        return res.rows[0];
    });
    // 3.5 Delete Cash / Bank Account (Soft Delete)
    fastify.delete('/accounts/:id', async (req, reply) => {
        const { id } = req.params;
        try {
            const accRes = await db_js_1.pool.query(`SELECT id, name FROM app.cash_accounts WHERE id = $1 AND NOT is_deleted`, [id]);
            if (accRes.rows.length === 0) {
                return reply.status(404).send({ error: 'الحساب أو الخزينة غير موجودة أو تم حذفها مسبقاً' });
            }
            await db_js_1.pool.query(`UPDATE app.cash_accounts
         SET is_deleted = true, is_active = false, deleted_at = now(), updated_at = now()
         WHERE id = $1`, [id]);
            return { success: true, message: `تم حذف حساب/خزينة "${accRes.rows[0].name}" بنجاح` };
        }
        catch (err) {
            return reply.status(500).send({ error: err.message || 'فشل حذف الخزينة' });
        }
    });
    // 4. Detailed Account Statement
    fastify.get('/accounts/:id/statement', async (req, reply) => {
        const { id } = req.params;
        const accRes = await db_js_1.pool.query(`SELECT * FROM app.cash_accounts WHERE id = $1 AND NOT is_deleted`, [id]);
        if (accRes.rows.length === 0)
            return reply.status(404).send({ error: 'الحساب غير موجود' });
        const account = accRes.rows[0];
        const movesRes = await db_js_1.pool.query(`WITH all_moves AS (
        -- Inbound Payments (سندات قبض)
        SELECT 
          p.payment_date::timestamp with time zone AS occurred_at,
          'سند قبض ' || p.payment_no AS title,
          'تحصيل من: ' || pt.name AS description,
          p.amount AS amount_in,
          0 AS amount_out,
          p.id AS document_id,
          'payment_in' AS move_type
        FROM app.payments p
        JOIN app.parties pt ON pt.id = p.party_id
        WHERE p.cash_account_id = $1 AND p.direction = 'in' AND p.status = 'approved' AND NOT p.is_deleted

        UNION ALL

        -- Outbound Payments (سندات صرف)
        SELECT 
          p.payment_date::timestamp with time zone AS occurred_at,
          'سند صرف ' || p.payment_no AS title,
          'سداد إلى: ' || pt.name AS description,
          0 AS amount_in,
          p.amount AS amount_out,
          p.id AS document_id,
          'payment_out' AS move_type
        FROM app.payments p
        JOIN app.parties pt ON pt.id = p.party_id
        WHERE p.cash_account_id = $1 AND p.direction = 'out' AND p.status = 'approved' AND NOT p.is_deleted

        UNION ALL

        -- Expenses (مصروفات)
        SELECT 
          e.expense_date::timestamp with time zone AS occurred_at,
          'مصروف ' || e.expense_no AS title,
          c.name_ar || COALESCE(' - ' || e.notes, '') AS description,
          0 AS amount_in,
          e.amount AS amount_out,
          e.id AS document_id,
          'expense' AS move_type
        FROM app.expenses e
        JOIN app.expense_categories c ON c.id = e.category_id
        WHERE e.cash_account_id = $1 AND e.status = 'approved' AND NOT e.is_deleted

        UNION ALL

        -- Employee Advances (سلفيات)
        SELECT 
          et.tx_date::timestamp with time zone AS occurred_at,
          'سلفة موظف' AS title,
          emp.full_name || COALESCE(' - ' || et.reason, '') AS description,
          0 AS amount_in,
          et.amount AS amount_out,
          et.id AS document_id,
          'employee_advance' AS move_type
        FROM app.employee_transactions et
        JOIN app.employees emp ON emp.id = et.employee_id
        WHERE et.cash_account_id = $1 AND et.tx_type = 'advance' AND NOT et.is_deleted

        UNION ALL

        -- Transfers In
        SELECT 
          t.transfer_date::timestamp with time zone AS occurred_at,
          'تحويل وارد ' || t.transfer_no AS title,
          'تحويل من: ' || from_acc.name || COALESCE(' - ' || t.notes, '') AS description,
          t.amount AS amount_in,
          0 AS amount_out,
          t.id AS document_id,
          'transfer_in' AS move_type
        FROM app.cash_transfers t
        JOIN app.cash_accounts from_acc ON from_acc.id = t.from_account_id
        WHERE t.to_account_id = $1 AND t.status = 'approved' AND NOT t.is_deleted

        UNION ALL

        -- Transfers Out
        SELECT 
          t.transfer_date::timestamp with time zone AS occurred_at,
          'تحويل صادر ' || t.transfer_no AS title,
          'تحويل إلى: ' || to_acc.name || COALESCE(' - ' || t.notes, '') AS description,
          0 AS amount_in,
          t.amount AS amount_out,
          t.id AS document_id,
          'transfer_out' AS move_type
        FROM app.cash_transfers t
        JOIN app.cash_accounts to_acc ON to_acc.id = t.to_account_id
        WHERE t.from_account_id = $1 AND t.status = 'approved' AND NOT t.is_deleted

        UNION ALL

        -- Manual Movements (إيداع / سحب يدوي)
        SELECT 
          cm.movement_date::timestamp with time zone AS occurred_at,
          (CASE WHEN cm.direction = 'in' THEN 'إيداع نقدي' ELSE 'سحب نقدي' END) AS title,
          COALESCE(cm.note, CASE WHEN cm.direction = 'in' THEN 'إيداع في الخزينة' ELSE 'سحب من الخزينة' END) AS description,
          CASE WHEN cm.direction = 'in' THEN cm.amount ELSE 0 END AS amount_in,
          CASE WHEN cm.direction = 'out' THEN cm.amount ELSE 0 END AS amount_out,
          cm.id AS document_id,
          CASE WHEN cm.direction = 'in' THEN 'manual_deposit' ELSE 'manual_withdrawal' END AS move_type
        FROM app.cash_movements cm
        WHERE cm.cash_account_id = $1 AND NOT cm.is_deleted
      )
      SELECT *,
        $2 + SUM(amount_in - amount_out) OVER (ORDER BY occurred_at ASC, document_id ASC) AS running_balance
      FROM all_moves
      ORDER BY occurred_at DESC, document_id DESC`, [id, parseFloat(account.opening_balance || '0')]);
        return {
            account: {
                ...account,
                opening_balance: parseFloat(account.opening_balance || '0'),
            },
            transactions: movesRes.rows.map((r) => ({
                ...r,
                amount_in: parseFloat(r.amount_in),
                amount_out: parseFloat(r.amount_out),
                running_balance: parseFloat(r.running_balance),
            })),
        };
    });
    // 4.5 Record Manual Deposit or Withdrawal (Cash Movement)
    fastify.post('/movements', async (req, reply) => {
        const { cash_account_id, direction, amount, note, movement_date } = req.body;
        if (!cash_account_id || !direction || !amount || parseFloat(amount) <= 0) {
            return reply.status(400).send({ error: 'الخزينة، الاتجاه (إيداع/سحب)، والمبلغ مطلوبين وقيمتهم صالحة' });
        }
        if (!['in', 'out'].includes(direction)) {
            return reply.status(400).send({ error: 'اتجاه الحركة غير صالح (يجب أن يكون in أو out)' });
        }
        const res = await db_js_1.pool.query(`INSERT INTO app.cash_movements (cash_account_id, direction, amount, note, movement_date)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE))
       RETURNING *`, [cash_account_id, direction, parseFloat(amount), note?.trim() || null, movement_date || null]);
        return {
            status: 'success',
            movement: res.rows[0],
            message: direction === 'in' ? 'تم تسجيل الإيداع في الخزينة بنجاح' : 'تم تسجيل السحب من الخزينة بنجاح',
        };
    });
    // 5. Transfer between Cash / Bank / Wallets
    fastify.post('/transfer', async (req, reply) => {
        const { fromAccountId, toAccountId, amount, notes } = req.body;
        if (!fromAccountId || !toAccountId || !amount || parseFloat(amount) <= 0) {
            return reply.status(400).send({ error: 'يرجى تحديد الحسابات ومبلغ التحويل بشكل صحيح' });
        }
        if (fromAccountId === toAccountId) {
            return reply.status(400).send({ error: 'لا يمكن التحويل لنفس الحساب' });
        }
        try {
            const transferId = await (0, db_js_1.withTransaction)(async (client) => {
                const nextNumRes = await client.query("SELECT app.next_doc_number('cash_transfer') AS num");
                const tNo = nextNumRes.rows[0].num;
                const res = await client.query(`INSERT INTO app.cash_transfers (
            transfer_no, transfer_date, from_account_id, to_account_id, amount, notes, status
          ) VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, 'approved')
          RETURNING id`, [tNo, fromAccountId, toAccountId, parseFloat(amount), notes || null]);
                return res.rows[0].id;
            });
            return { status: 'success', transferId };
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    // 6. Physical Cash Count Reconciliation (جرد الخزينة)
    fastify.post('/count', async (req, reply) => {
        const { cashAccountId, countedAmount, notes } = req.body;
        if (!cashAccountId || countedAmount === undefined) {
            return reply.status(400).send({ error: 'يرجى تحديد الحساب والمبلغ المجرود' });
        }
        try {
            // Get current recorded balance
            const balRes = await db_js_1.pool.query(`SELECT (
          ca.opening_balance +
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0) +
          COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'in' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'out' AND NOT is_deleted), 0) +
          COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE to_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE from_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0)
        ) AS recorded_balance
        FROM app.cash_accounts ca
        WHERE ca.id = $1`, [cashAccountId]);
            const recorded = parseFloat(balRes.rows[0]?.recorded_balance || '0');
            const actual = parseFloat(countedAmount);
            const diff = actual - recorded;
            const countRes = await db_js_1.pool.query(`INSERT INTO app.cash_counts (
          cash_account_id, counted_at, recorded_balance, actual_balance, difference, notes
        ) VALUES ($1, now(), $2, $3, $4, $5)
        RETURNING *`, [cashAccountId, recorded, actual, diff, notes || null]);
            return {
                status: 'success',
                count: countRes.rows[0],
                difference: diff,
                isBalanced: Math.abs(diff) < 0.01,
            };
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
exports.treasuryRoutes = treasuryRoutes;
