"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payrollRoutes = void 0;
const db_js_1 = require("../config/db.js");
const payroll_js_1 = require("../domain/payroll.js");
const payrollRoutes = async (fastify) => {
    // List Employees
    fastify.get('/employees', async (req, reply) => {
        const res = await db_js_1.pool.query(`SELECT e.*, 
              e.full_name AS name,
              COALESCE(e.daily_rate, 0) AS daily_rate,
              0.00 AS opening_debt
       FROM app.employees e
       WHERE NOT e.is_deleted
       ORDER BY e.full_name`);
        return res.rows.map((r) => ({
            ...r,
            daily_rate: parseFloat(r.daily_rate),
            opening_debt: parseFloat(r.opening_debt),
        }));
    });
    // Create Employee
    fastify.post('/employees', async (req, reply) => {
        const { name, job_title, daily_rate, phone } = req.body;
        if (!name)
            return reply.status(400).send({ error: 'اسم الموظف مطلوب' });
        const res = await db_js_1.pool.query(`INSERT INTO app.employees (full_name, job_title, daily_rate, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING *, full_name AS name`, [name, job_title || null, daily_rate || 0, phone || null]);
        return res.rows[0];
    });
    // Record Daily / Weekly Attendance
    fastify.post('/attendance', async (req, reply) => {
        const { records } = req.body;
        if (!records || !Array.isArray(records) || records.length === 0) {
            return reply.status(400).send({ error: 'يرجى تقديم سجلات الحضور' });
        }
        await (0, db_js_1.withTransaction)(async (client) => {
            await (0, payroll_js_1.recordAttendance)(client, records);
        });
        return { status: 'recorded' };
    });
    // Get Employee Statement for Period
    fastify.get('/statement/:employeeId', async (req, reply) => {
        const { employeeId } = req.params;
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) {
            return reply.status(400).send({ error: 'يرجى تحديد تاريخ البداية والنهاية' });
        }
        const statement = await (0, payroll_js_1.calculateEmployeePeriodStatement)(db_js_1.pool, employeeId, start_date, end_date);
        return statement;
    });
    // Settle Payroll
    fastify.post('/settle', async (req, reply) => {
        const body = req.body;
        if (!body.employeeId || !body.periodStart || !body.periodEnd) {
            return reply.status(400).send({ error: 'يرجى تحديد الموظف والفترة' });
        }
        const journalId = await (0, db_js_1.withTransaction)(async (client) => {
            return await (0, payroll_js_1.settleEmployeePayroll)(client, {
                employeeId: body.employeeId,
                periodStart: body.periodStart,
                periodEnd: body.periodEnd,
                bonuses: body.bonuses,
                deductions: body.deductions,
                debtRepayment: body.debtRepayment,
                notes: body.notes,
            });
        });
        return { status: 'settled', journalId };
    });
};
exports.payrollRoutes = payrollRoutes;
