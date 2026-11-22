import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';

export const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // Dashboard Overview: 8 Core Database-Computed Metrics
  fastify.get('/dashboard', async (req, reply) => {
    const metricsRes = await pool.query(`SELECT * FROM app.v_dashboard_metrics;`);
    const metrics = metricsRes.rows[0] || {};

    const cashBreakdown = await pool.query(`
      SELECT
        ca.id,
        ca.name,
        ca.kind,
        (
          ca.opening_balance +
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
          COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0)
        ) AS balance
      FROM app.cash_accounts ca
      WHERE ca.is_active = true AND NOT ca.is_deleted
      ORDER BY ca.name ASC;
    `);

    return {
      total_receivables: Number(metrics.total_receivables || 0),
      total_payables: Number(metrics.total_payables || 0),
      current_liquidity: Number(metrics.current_liquidity || 0),
      current_month_sales: Number(metrics.current_month_sales || 0),
      today_sales: Number(metrics.today_sales || 0),
      active_customers_count: Number(metrics.active_customers_count || 0),
      active_suppliers_count: Number(metrics.active_suppliers_count || 0),
      active_employees_count: Number(metrics.active_employees_count || 0),
      cash_accounts_breakdown: cashBreakdown.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        balance: Number(r.balance || 0),
      })),
    };
  });

  // Trial Balance (ميزان المراجعة)
  fastify.get('/trial-balance', async (req, reply) => {
    const res = await pool.query(`
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
    const { start_date, end_date } = req.query as any;

    let dateFilter = '';
    const params: any[] = [];
    if (start_date && end_date) {
      dateFilter = ' AND e.entry_date BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }

    const res = await pool.query(
      `
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
    `,
      params
    );

    let totalRevenues = 0;
    let totalExpenses = 0;
    const revenues: any[] = [];
    const expenses: any[] = [];

    for (const r of res.rows) {
      if (r.account_type === 'revenue') {
        const val = parseFloat(r.revenue_amount);
        totalRevenues += val;
        revenues.push({ code: r.code, name: r.name_ar, amount: val });
      } else {
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
    const res = await pool.query(`
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
