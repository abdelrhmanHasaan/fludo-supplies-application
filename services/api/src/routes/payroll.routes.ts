import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';

export const payrollRoutes: FastifyPluginAsync = async (fastify) => {
  // List Employees
  fastify.get('/employees', async (req, reply) => {
    const res = await pool.query(
      `SELECT e.id,
              e.code,
              e.full_name AS name,
              e.job_title,
              COALESCE(e.daily_rate, 0)::numeric(16,2) AS daily_rate,
              e.phone,
              e.is_active,
              e.created_at
       FROM app.employees e
       WHERE NOT e.is_deleted
       ORDER BY e.code ASC, e.full_name ASC`
    );
    return res.rows.map((r) => ({
      ...r,
      daily_rate: parseFloat(r.daily_rate || '0'),
    }));
  });

  // Create Employee with Auto Code
  fastify.post('/employees', async (req, reply) => {
    const { name, job_title, daily_rate, phone } = req.body as any;
    if (!name || !name.trim()) {
      return reply.status(400).send({ error: 'اسم الموظف مطلوب' });
    }

    const nextCodeRes = await pool.query("SELECT app.next_doc_number('employee') AS code");
    const empCode = nextCodeRes.rows[0]?.code || 'E0001';

    const res = await pool.query(
      `INSERT INTO app.employees (code, full_name, job_title, daily_rate, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, full_name AS name, job_title, daily_rate, phone, is_active`,
      [empCode, name.trim(), job_title?.trim() || null, daily_rate || 0, phone?.trim() || null]
    );

    return res.rows[0];
  });

  // Get Employee Monthly Statement & Attendance Drawer Data
  fastify.get('/employees/:id/month-summary', async (req, reply) => {
    const { id } = req.params as any;
    const { year, month } = req.query as any;

    const y = parseInt(year || new Date().getFullYear(), 10);
    const m = parseInt(month || (new Date().getMonth() + 1), 10);

    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // 1. Employee info
    const empRes = await pool.query(
      'SELECT id, code, full_name AS name, job_title, daily_rate, phone FROM app.employees WHERE id = $1',
      [id]
    );
    if (empRes.rows.length === 0) {
      return reply.status(404).send({ error: 'الموظف غير موجود' });
    }
    const emp = empRes.rows[0];
    const dailyRate = parseFloat(emp.daily_rate || '0');

    // 2. Attendance in month
    const attRes = await pool.query(
      `SELECT TO_CHAR(work_date, 'YYYY-MM-DD') AS work_date,
              status,
              day_fraction::numeric(4,2) AS day_fraction,
              notes
       FROM app.attendance
       WHERE employee_id = $1 AND work_date BETWEEN $2 AND $3 AND NOT is_deleted
       ORDER BY work_date ASC`,
      [id, startDate, endDate]
    );

    const attendanceMap: Record<string, any> = {};
    let totalDays = 0;
    for (const r of attRes.rows) {
      attendanceMap[r.work_date] = {
        status: r.status,
        fraction: parseFloat(r.day_fraction),
        notes: r.notes,
      };
      totalDays += parseFloat(r.day_fraction);
    }

    // 3. Transactions in month
    const txRes = await pool.query(
      `SELECT t.id,
              TO_CHAR(t.tx_date, 'YYYY-MM-DD') AS tx_date,
              t.tx_type,
              t.amount::numeric(16,2) AS amount,
              t.reason,
              t.notes,
              t.cash_account_id,
              ca.name AS cash_account_name
       FROM app.employee_transactions t
       LEFT JOIN app.cash_accounts ca ON ca.id = t.cash_account_id
       WHERE t.employee_id = $1 AND t.tx_date BETWEEN $2 AND $3 AND NOT t.is_deleted
       ORDER BY t.tx_date ASC, t.created_at ASC`,
      [id, startDate, endDate]
    );

    const deductions: any[] = [];
    const advances: any[] = [];
    const bonuses: any[] = [];

    let totalDeductions = 0;
    let totalAdvances = 0;
    let totalBonuses = 0;

    for (const tx of txRes.rows) {
      const amt = parseFloat(tx.amount || '0');
      const item = { ...tx, amount: amt };
      if (tx.tx_type === 'deduction') {
        deductions.push(item);
        totalDeductions += amt;
      } else if (tx.tx_type === 'advance') {
        advances.push(item);
        totalAdvances += amt;
      } else if (tx.tx_type === 'bonus') {
        bonuses.push(item);
        totalBonuses += amt;
      }
    }

    // 4. Net Due directly from DB function
    const netRes = await pool.query(
      'SELECT app.employee_net_due($1, $2::date, $3::date) AS net_due',
      [id, startDate, endDate]
    );
    const netDue = parseFloat(netRes.rows[0]?.net_due || '0');

    return {
      employee: {
        ...emp,
        daily_rate: dailyRate,
      },
      year: y,
      month: m,
      startDate,
      endDate,
      daysInMonth: lastDay,
      attendanceMap,
      deductions,
      advances,
      bonuses,
      summary: {
        totalDays,
        dailyRate,
        earnedAmount: totalDays * dailyRate,
        totalBonuses,
        totalDeductions,
        totalAdvances,
        netDue,
      },
    };
  });

  // Upsert Attendance for Single Day
  fastify.post('/employees/:id/attendance-day', async (req, reply) => {
    const { id } = req.params as any;
    const { work_date, status, notes } = req.body as any;

    if (!work_date || !status) {
      return reply.status(400).send({ error: 'التاريخ وحالة الحضور مطلوبان' });
    }

    let fraction = 1.0;
    if (status === 'half') fraction = 0.5;
    else if (status === 'absent' || status === 'leave') fraction = 0.0;

    const empRes = await pool.query('SELECT daily_rate FROM app.employees WHERE id = $1', [id]);
    const dailyRate = parseFloat(empRes.rows[0]?.daily_rate || '0');

    await pool.query(
      `INSERT INTO app.attendance (
        employee_id, work_date, status, day_fraction, daily_rate_snapshot, notes, updated_at
      ) VALUES ($1, $2::date, $3, $4, $5, $6, NOW())
      ON CONFLICT (tenant_id, employee_id, work_date)
      DO UPDATE SET status = EXCLUDED.status,
                    day_fraction = EXCLUDED.day_fraction,
                    daily_rate_snapshot = EXCLUDED.daily_rate_snapshot,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()`,
      [id, work_date, status, fraction, dailyRate, notes || null]
    );

    return { status: 'saved', work_date, newStatus: status, fraction };
  });

  // Add Employee Transaction (Deduction, Advance, Bonus)
  fastify.post('/employees/:id/transaction', async (req, reply) => {
    const { id } = req.params as any;
    const { tx_type, tx_date, amount, reason, cash_account_id, notes } = req.body as any;

    if (!tx_type || !['advance', 'deduction', 'bonus'].includes(tx_type)) {
      return reply.status(400).send({ error: 'نوع العملية غير صحيح' });
    }

    const numAmount = parseFloat(amount || '0');
    if (numAmount <= 0) {
      return reply.status(400).send({ error: 'يرجى إدخال مبلغ صحيح أكبر من صفر' });
    }

    if (!reason || !reason.trim()) {
      return reply.status(400).send({ error: 'السبب إلزامي لتسجيل العملية' });
    }

    if (tx_type === 'advance' && !cash_account_id) {
      return reply.status(400).send({ error: 'اختر الخزينة/المحفظة/الحساب المنصرف منه السلفة' });
    }

    const res = await withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO app.employee_transactions (
          employee_id, tx_date, tx_type, amount, reason, cash_account_id, notes
        ) VALUES ($1, $2::date, $3, $4, $5, $6, $7)
        RETURNING *`,
        [id, tx_date || new Date().toISOString().slice(0, 10), tx_type, numAmount, reason.trim(), cash_account_id || null, notes || null]
      );

      return insRes.rows[0];
    });

    return { status: 'created', transaction: res };
  });

  // Delete Transaction with PIN Approval
  fastify.delete('/employees/transactions/:txId', async (req, reply) => {
    const { txId } = req.params as any;
    const { approvalId } = req.body as any;

    if (!approvalId) {
      return reply.status(403).send({ error: 'موافقة المدير مطلوبة لتعديل أو حذف حركة الموظف' });
    }

    await pool.query('UPDATE app.employee_transactions SET is_deleted = true, deleted_at = NOW() WHERE id = $1', [txId]);
    return { status: 'deleted' };
  });
};
