import type { PoolClient } from 'pg';
import { postJournalEntry } from './accounting.js';

export interface AttendanceRecord {
  employeeId: string;
  attendanceDate: string; // YYYY-MM-DD
  fraction: number; // 0, 0.5, 1.0, 1.5, 2.0
  advanceAmount?: number;
  notes?: string;
}

export interface PayrollSettlementParams {
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  bonuses?: number;
  deductions?: number;
  debtRepayment?: number;
  notes?: string;
}

export async function recordAttendance(
  client: PoolClient,
  records: AttendanceRecord[]
): Promise<void> {
  for (const rec of records) {
    // Upsert attendance
    await client.query(
      `INSERT INTO app.attendance (
        employee_id, attendance_date, fraction, notes
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (employee_id, attendance_date)
      DO UPDATE SET fraction = EXCLUDED.fraction, notes = EXCLUDED.notes`,
      [rec.employeeId, rec.attendanceDate, rec.fraction, rec.notes || null]
    );

    // If advance amount is given, record employee cash advance transaction
    if (rec.advanceAmount && rec.advanceAmount > 0) {
      await client.query(
        `INSERT INTO app.employee_transactions (
          employee_id, tx_date, tx_type, amount, notes
        ) VALUES ($1, $2, 'advance', $3, $4)`,
        [rec.employeeId, rec.attendanceDate, rec.advanceAmount, rec.notes || 'سلفة يومية']
      );

      // Post journal for cash advance: Dr Employee Advances (1150) / Cr Cash (1010)
      const empRes = await client.query('SELECT full_name AS name FROM app.employees WHERE id = $1', [
        rec.employeeId,
      ]);
      const empName = empRes.rows[0]?.name || '';

      await postJournalEntry(client, {
        entryDate: rec.attendanceDate,
        sourceDocType: 'employee_advance',
        sourceDocId: rec.employeeId,
        narration: `سلفة نقدية للموظف: ${empName}`,
        lines: [
          {
            accountCode: '1150', // Employee Advances (سلف الموظفين)
            debit: rec.advanceAmount,
            credit: 0,
            description: `سلفة ${empName}`,
          },
          {
            accountCode: '1010', // Cash (الصندوق)
            debit: 0,
            credit: rec.advanceAmount,
            description: `صرف سلفة ${empName}`,
          },
        ],
      });
    }
  }
}

export async function calculateEmployeePeriodStatement(
  client: PoolClient,
  employeeId: string,
  startDate: string,
  endDate: string
) {
  const empRes = await client.query('SELECT * FROM app.employees WHERE id = $1', [employeeId]);
  if (empRes.rows.length === 0) throw new Error('الموظف غير موجود');
  const emp = empRes.rows[0];

  const attRes = await client.query(
    `SELECT COALESCE(SUM(fraction), 0) AS total_days
     FROM app.attendance
     WHERE employee_id = $1 AND attendance_date BETWEEN $2 AND $3`,
    [employeeId, startDate, endDate]
  );
  const totalDays = parseFloat(attRes.rows[0]?.total_days || '0');
  const dailyRate = parseFloat(emp.daily_rate || '0');
  const totalEarned = totalDays * dailyRate;

  const txRes = await client.query(
    `SELECT tx_type, COALESCE(SUM(amount), 0) AS total
     FROM app.employee_transactions
     WHERE employee_id = $1 AND tx_date BETWEEN $2 AND $3
     GROUP BY tx_type`,
    [employeeId, startDate, endDate]
  );

  let advances = 0;
  let bonuses = 0;
  let deductions = 0;
  for (const row of txRes.rows) {
    const amt = parseFloat(row.total);
    if (row.tx_type === 'advance') advances += amt;
    else if (row.tx_type === 'bonus') bonuses += amt;
    else if (row.tx_type === 'deduction') deductions += amt;
  }

  const openingDebt = parseFloat(emp.opening_debt || '0');
  const netBeforeDebt = totalEarned + bonuses - deductions - advances;

  return {
    employeeId,
    name: emp.name,
    jobTitle: emp.job_title,
    dailyRate,
    totalDays,
    totalEarned,
    advances,
    bonuses,
    deductions,
    openingDebt,
    netPayable: netBeforeDebt,
  };
}

export async function settleEmployeePayroll(
  client: PoolClient,
  params: PayrollSettlementParams
): Promise<string> {
  const calc = await calculateEmployeePeriodStatement(
    client,
    params.employeeId,
    params.periodStart,
    params.periodEnd
  );

  const bonus = params.bonuses || 0;
  const ded = params.deductions || 0;
  const debtRepayment = params.debtRepayment || 0;

  const netPayable = calc.totalEarned + calc.bonuses + bonus - (calc.advances + calc.deductions + ded + debtRepayment);

  if (bonus > 0) {
    await client.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_date, tx_type, amount, notes)
       VALUES ($1, $2, 'bonus', $3, $4)`,
      [params.employeeId, params.periodEnd, bonus, 'مكافأة تسوية راتب']
    );
  }

  if (ded > 0) {
    await client.query(
      `INSERT INTO app.employee_transactions (employee_id, tx_date, tx_type, amount, notes)
       VALUES ($1, $2, 'deduction', $3, $4)`,
      [params.employeeId, params.periodEnd, ded, 'خصم تسوية راتب']
    );
  }

  if (debtRepayment > 0) {
    await client.query(
      `UPDATE app.employees 
       SET opening_debt = GREATEST(0, opening_debt - $1)
       WHERE id = $2`,
      [debtRepayment, params.employeeId]
    );
  }

  // Double entry posting:
  // Dr Wages Expense (5100): total earned + bonuses - deductions
  // Cr Cash (1010): netPayable
  const totalWagesExpense = calc.totalEarned + calc.bonuses + bonus - (calc.deductions + ded);

  const journalId = await postJournalEntry(client, {
    entryDate: params.periodEnd,
    sourceDocType: 'payroll_settlement',
    sourceDocId: params.employeeId,
    narration: `تسوية أجور الموظف: ${calc.name}`,
    lines: [
      {
        accountCode: '5100', // Wages Expense (أجور العاملين)
        debit: totalWagesExpense,
        credit: 0,
        description: `أجور ${calc.name} عن الفترة ${params.periodStart} إلى ${params.periodEnd}`,
      },
      {
        accountCode: '1010', // Cash (الصندوق)
        debit: 0,
        credit: totalWagesExpense,
        description: `صرف أجور ${calc.name}`,
      },
    ],
  });

  return journalId;
}
