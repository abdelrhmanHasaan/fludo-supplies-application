"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordEquipmentExpense = recordEquipmentExpense;
exports.getEquipmentSummary = getEquipmentSummary;
const accounting_js_1 = require("./accounting.js");
async function recordEquipmentExpense(client, params) {
    const eqRes = await client.query('SELECT code, name FROM app.equipment WHERE id = $1', [
        params.equipmentId,
    ]);
    if (eqRes.rows.length === 0)
        throw new Error('المعدة / السيارة غير موجودة');
    const eq = eqRes.rows[0];
    const res = await client.query(`INSERT INTO app.equipment_expenses (
      equipment_id, expense_date, amount, expense_type, description
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id`, [params.equipmentId, params.expenseDate, params.amount, params.expenseType, params.description || null]);
    const expenseId = res.rows[0].id;
    // Post journal entry: Dr Equipment Expenses (5200) / Cr Cash (1010)
    await (0, accounting_js_1.postJournalEntry)(client, {
        entryDate: params.expenseDate,
        sourceDocType: 'equipment_expense',
        sourceDocId: expenseId,
        narration: `مصروف معدة (${eq.code} - ${eq.name}): ${params.description || params.expenseType}`,
        lines: [
            {
                accountCode: '5200', // Equipment Expenses (مصروفات المعدات والسيارات)
                debit: params.amount,
                credit: 0,
                description: `مصروف ${eq.name}`,
            },
            {
                accountCode: '1010', // Cash (الصندوق)
                debit: 0,
                credit: params.amount,
                description: `صرف مصروف معدة ${eq.name}`,
            },
        ],
    });
    return expenseId;
}
async function getEquipmentSummary(client, startDate, endDate) {
    let query = `
    SELECT 
      e.id,
      e.code,
      e.name,
      e.kind AS vehicle_type,
      e.plate_no AS plate_number,
      COALESCE(SUM(x.amount), 0) AS total_expenses,
      COUNT(x.id) AS expense_count
    FROM app.equipment e
    LEFT JOIN app.equipment_expenses x ON x.equipment_id = e.id AND NOT x.is_deleted
  `;
    const params = [];
    if (startDate && endDate) {
        query += ` AND x.expense_date BETWEEN $1 AND $2`;
        params.push(startDate, endDate);
    }
    query += ` WHERE NOT e.is_deleted GROUP BY e.id, e.code, e.name, e.kind, e.plate_no ORDER BY e.code`;
    const res = await client.query(query, params);
    return res.rows;
}
