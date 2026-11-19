"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportsRoutes = void 0;
const db_js_1 = require("../config/db.js");
const reportsRoutes = async (fastify) => {
    // Dashboard Overview
    fastify.get('/dashboard', async (req, reply) => {
        // 1. Receivables (Customer balances > 0)
        const recRes = await db_js_1.pool.query(`
      SELECT COALESCE(SUM(balance), 0) AS total_receivables
      FROM (
        SELECT SUM(l.debit - l.credit) AS balance
        FROM app.parties p
        JOIN app.journal_lines l ON l.party_id = p.id
        JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'receivable'
        WHERE p.is_customer AND NOT p.is_deleted
        GROUP BY p.id
        HAVING SUM(l.debit - l.credit) > 0
      ) sub
    `);
        // 2. Payables (Supplier balances > 0)
        const payRes = await db_js_1.pool.query(`
      SELECT COALESCE(SUM(balance), 0) AS total_payables
      FROM (
        SELECT SUM(l.credit - l.debit) AS balance
        FROM app.parties p
        JOIN app.journal_lines l ON l.party_id = p.id
        JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'payable'
        WHERE p.is_supplier AND NOT p.is_deleted
        GROUP BY p.id
        HAVING SUM(l.credit - l.debit) > 0
      ) sub
    `);
        // 3. Cash on hand
        const cashRes = await db_js_1.pool.query(`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS total_cash
      FROM app.accounts a
      JOIN app.journal_lines l ON l.account_id = a.id
      WHERE a.system_role IN ('cash', 'bank')
    `);
        // 4. Sales today and this month
        const todaySales = await db_js_1.pool.query(`
      SELECT COALESCE(SUM(net_total), 0) AS total
      FROM app.sales_invoices
      WHERE invoice_date = CURRENT_DATE AND status = 'approved'
    `);
        const monthSales = await db_js_1.pool.query(`
      SELECT COALESCE(SUM(net_total), 0) AS total
      FROM app.sales_invoices
      WHERE date_trunc('month', invoice_date) = date_trunc('month', CURRENT_DATE) AND status = 'approved'
    `);
        // 5. Pending Booked Orders (الحجوزات المعلقة)
        const bookRes = await db_js_1.pool.query(`
      SELECT 
        COUNT(DISTINCT o.id) AS pending_orders_count,
        COALESCE(SUM(ol.qty_ordered), 0) AS remaining_qty
      FROM app.orders o
      JOIN app.order_lines ol ON ol.order_id = o.id
      WHERE o.status = 'confirmed' AND o.order_type = 'sales'
    `);
        return {
            totalReceivables: parseFloat(recRes.rows[0]?.total_receivables || '0'),
            totalPayables: parseFloat(payRes.rows[0]?.total_payables || '0'),
            totalCash: parseFloat(cashRes.rows[0]?.total_cash || '0'),
            salesToday: parseFloat(todaySales.rows[0]?.total || '0'),
            salesMonth: parseFloat(monthSales.rows[0]?.total || '0'),
            pendingBookingsCount: parseInt(bookRes.rows[0]?.pending_orders_count || '0', 10),
            pendingBookedQty: parseFloat(bookRes.rows[0]?.remaining_qty || '0'),
        };
    });
    // Trial Balance (ميزان المراجعة)
    fastify.get('/trial-balance', async (req, reply) => {
        const res = await db_js_1.pool.query(`
      SELECT 
        a.id AS account_id,
        a.code AS account_code,
        a.name_ar AS account_name,
        a.account_type,
        COALESCE(SUM(l.debit), 0) AS total_debit,
        COALESCE(SUM(l.credit), 0) AS total_credit,
        COALESCE(SUM(l.debit - l.credit), 0) AS net_balance
      FROM app.accounts a
      LEFT JOIN app.journal_lines l ON l.account_id = a.id
      GROUP BY a.id, a.code, a.name_ar, a.account_type
      ORDER BY a.code
    `);
        let sumDebit = 0;
        let sumCredit = 0;
        const rows = res.rows.map((r) => {
            const d = parseFloat(r.total_debit);
            const c = parseFloat(r.total_credit);
            sumDebit += d;
            sumCredit += c;
            return {
                ...r,
                total_debit: d,
                total_credit: c,
                net_balance: parseFloat(r.net_balance),
            };
        });
        const difference = Math.abs(sumDebit - sumCredit);
        return {
            accounts: rows,
            totals: {
                sumDebit,
                sumCredit,
                difference: Math.round(difference * 100) / 100,
                isBalanced: difference < 0.005,
            },
        };
    });
    // Income Statement (قائمة الدخل)
    fastify.get('/income-statement', async (req, reply) => {
        const { start_date, end_date } = req.query;
        let dateFilter = '';
        const params = [];
        if (start_date && end_date) {
            dateFilter = ' AND e.entry_date BETWEEN $1 AND $2';
            params.push(start_date, end_date);
        }
        const res = await db_js_1.pool.query(`
      SELECT 
        a.code,
        a.name_ar,
        a.account_type,
        a.system_role,
        COALESCE(SUM(l.credit - l.debit), 0) AS revenue_amount,
        COALESCE(SUM(l.debit - l.credit), 0) AS expense_amount
      FROM app.accounts a
      JOIN app.journal_lines l ON l.account_id = a.id
      JOIN app.journal_entries e ON e.id = l.journal_entry_id
      WHERE a.account_type IN ('revenue', 'expense') ${dateFilter}
      GROUP BY a.id, a.code, a.name_ar, a.account_type, a.system_role
      ORDER BY a.code
    `, params);
        let totalRevenues = 0;
        let totalExpenses = 0;
        const revenues = [];
        const expenses = [];
        for (const r of res.rows) {
            if (r.account_type === 'revenue') {
                const val = parseFloat(r.revenue_amount);
                totalRevenues += val;
                revenues.push({ code: r.code, name: r.name_ar, amount: val });
            }
            else {
                const val = parseFloat(r.expense_amount);
                totalExpenses += val;
                expenses.push({ code: r.code, name: r.name_ar, amount: val });
            }
        }
        return {
            revenues,
            expenses,
            totalRevenues,
            totalExpenses,
            netProfit: totalRevenues - totalExpenses,
        };
    });
    // Customer Aging Report (أعمار الديون)
    fastify.get('/customer-aging', async (req, reply) => {
        const res = await db_js_1.pool.query(`
      SELECT 
        p.id,
        p.name,
        p.phone,
        COALESCE(SUM(l.debit - l.credit), 0) AS total_balance,
        COALESCE(SUM(CASE WHEN e.entry_date >= CURRENT_DATE - 30 THEN (l.debit - l.credit) ELSE 0 END), 0) AS bucket_0_30,
        COALESCE(SUM(CASE WHEN e.entry_date < CURRENT_DATE - 30 AND e.entry_date >= CURRENT_DATE - 60 THEN (l.debit - l.credit) ELSE 0 END), 0) AS bucket_31_60,
        COALESCE(SUM(CASE WHEN e.entry_date < CURRENT_DATE - 60 AND e.entry_date >= CURRENT_DATE - 90 THEN (l.debit - l.credit) ELSE 0 END), 0) AS bucket_61_90,
        COALESCE(SUM(CASE WHEN e.entry_date < CURRENT_DATE - 90 THEN (l.debit - l.credit) ELSE 0 END), 0) AS bucket_90_plus
      FROM app.parties p
      JOIN app.journal_lines l ON l.party_id = p.id
      JOIN app.journal_entries e ON e.id = l.journal_entry_id
      JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'receivable'
      WHERE p.is_customer AND NOT p.is_deleted
      GROUP BY p.id, p.name, p.phone
      HAVING SUM(l.debit - l.credit) > 0
      ORDER BY total_balance DESC
    `);
        return res.rows.map((r) => ({
            ...r,
            total_balance: parseFloat(r.total_balance),
            bucket_0_30: parseFloat(r.bucket_0_30),
            bucket_31_60: parseFloat(r.bucket_31_60),
            bucket_61_90: parseFloat(r.bucket_61_90),
            bucket_90_plus: parseFloat(r.bucket_90_plus),
        }));
    });
};
exports.reportsRoutes = reportsRoutes;
