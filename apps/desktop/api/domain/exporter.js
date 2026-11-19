"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCustomersToExcel = exportCustomersToExcel;
exports.exportProductsToExcel = exportProductsToExcel;
exports.exportCustomerStatementToExcel = exportCustomerStatementToExcel;
exports.exportDatabaseToSql = exportDatabaseToSql;
exports.generateImportTemplateExcel = generateImportTemplateExcel;
const exceljs_1 = __importDefault(require("exceljs"));
async function exportCustomersToExcel(client) {
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet('العملاء', { views: [{ rightToLeft: true }] });
    sheet.columns = [
        { header: 'اسم العميل', key: 'name', width: 30 },
        { header: 'رقم الهاتف', key: 'phone', width: 18 },
        { header: 'العنوان', key: 'address', width: 25 },
        { header: 'الرصيد الحالي (ج.م)', key: 'balance', width: 22 },
        { header: 'تاريخ بداية التعامل', key: 'created_at', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Navy blue
    };
    const res = await client.query(`
    SELECT 
      p.name,
      COALESCE(p.phone, '') AS phone,
      COALESCE(p.address, '') AS address,
      COALESCE(SUM(l.debit - l.credit), 0) AS balance,
      TO_CHAR(p.created_at, 'YYYY-MM-DD') AS created_at
    FROM app.parties p
    LEFT JOIN app.journal_lines l ON l.party_id = p.id
    LEFT JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'receivable'
    WHERE p.is_customer AND NOT p.is_deleted
    GROUP BY p.id, p.name, p.phone, p.address, p.created_at
    ORDER BY p.name
  `);
    for (const row of res.rows) {
        sheet.addRow({
            name: row.name,
            phone: row.phone,
            address: row.address,
            balance: parseFloat(row.balance),
            created_at: row.created_at,
        });
    }
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
}
async function exportProductsToExcel(client) {
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet('المنتجات والأسعار', { views: [{ rightToLeft: true }] });
    sheet.columns = [
        { header: 'الكود', key: 'code', width: 12 },
        { header: 'اسم الصنف', key: 'name', width: 32 },
        { header: 'النوع', key: 'kind', width: 15 },
        { header: 'الوحدة', key: 'unit', width: 15 },
        { header: 'سعر البيع الافتراضي', key: 'price', width: 22 },
        { header: 'الرصيد الفعلي', key: 'stock', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF065F46' }, // Dark green
    };
    const res = await client.query(`
    SELECT 
      p.code,
      p.name,
      CASE WHEN p.kind = 'goods' THEN 'بضاعة' ELSE 'خدمة' END AS kind,
      COALESCE(u.name, '') AS unit,
      p.default_sale_price AS price,
      COALESCE(v.physical_stock, 0) AS stock
    FROM app.products p
    LEFT JOIN app.units u ON u.id = p.unit_id
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS physical_stock
      FROM app.stock_movements
      GROUP BY product_id
    ) v ON v.product_id = p.id
    WHERE NOT p.is_deleted
    ORDER BY p.code
  `);
    for (const row of res.rows) {
        sheet.addRow({
            code: row.code,
            name: row.name,
            kind: row.kind,
            unit: row.unit,
            price: parseFloat(row.price),
            stock: parseFloat(row.stock),
        });
    }
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
}
async function exportCustomerStatementToExcel(client, partyId, startDate, endDate) {
    const partyRes = await client.query('SELECT name, phone FROM app.parties WHERE id = $1', [partyId]);
    const partyName = partyRes.rows[0]?.name || 'العميل';
    const workbook = new exceljs_1.default.Workbook();
    const sheet = workbook.addWorksheet(`كشف حساب - ${partyName}`, { views: [{ rightToLeft: true }] });
    sheet.columns = [
        { header: 'التاريخ', key: 'date', width: 15 },
        { header: 'البيان', key: 'description', width: 35 },
        { header: 'رقم السند/الفاتورة', key: 'doc_num', width: 20 },
        { header: 'مدين (مشتريات)', key: 'debit', width: 18 },
        { header: 'دائن (مسدد)', key: 'credit', width: 18 },
        { header: 'الرصيد بعد الحركة', key: 'running_bal', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' },
    };
    let query = `
    SELECT 
      TO_CHAR(e.entry_date, 'YYYY-MM-DD') AS date,
      l.description,
      e.entry_number AS doc_num,
      l.debit,
      l.credit
    FROM app.journal_lines l
    JOIN app.journal_entries e ON e.id = l.journal_entry_id
    JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'receivable'
    WHERE l.party_id = $1
  `;
    const params = [partyId];
    if (startDate && endDate) {
        query += ' AND e.entry_date BETWEEN $2 AND $3';
        params.push(startDate, endDate);
    }
    query += ' ORDER BY e.entry_date ASC, l.line_no ASC';
    const res = await client.query(query, params);
    let running = 0;
    for (const row of res.rows) {
        const deb = parseFloat(row.debit);
        const cred = parseFloat(row.credit);
        running += deb - cred;
        sheet.addRow({
            date: row.date,
            description: row.description,
            doc_num: row.doc_num,
            debit: deb,
            credit: cred,
            running_bal: running,
        });
    }
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
}
async function exportDatabaseToSql(client) {
    const tables = [
        'parties',
        'party_ledger_sections',
        'units',
        'products',
        'branches',
        'cash_accounts',
        'orders',
        'order_lines',
        'sales_invoices',
        'sales_invoice_lines',
        'purchase_invoices',
        'purchase_invoice_lines',
        'payments',
        'payment_allocations',
        'stock_movements',
        'employees',
        'attendance',
        'employee_transactions',
        'equipment',
        'equipment_expenses',
        'expense_categories',
        'expenses',
        'journal_entries',
        'journal_lines',
    ];
    let sqlDump = `-- Fludo ERP Database Export Dump\n-- Generated: ${new Date().toISOString()}\n\nBEGIN;\n\n`;
    for (const tbl of tables) {
        const rowsRes = await client.query(`SELECT * FROM app.${tbl}`);
        if (rowsRes.rows.length === 0)
            continue;
        sqlDump += `-- Data for app.${tbl}\n`;
        for (const r of rowsRes.rows) {
            const cols = Object.keys(r);
            const vals = cols.map((c) => {
                const v = r[c];
                if (v === null || v === undefined)
                    return 'NULL';
                if (typeof v === 'number' || typeof v === 'boolean')
                    return v.toString();
                if (typeof v === 'object')
                    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
                return `'${v.toString().replace(/'/g, "''")}'`;
            });
            sqlDump += `INSERT INTO app.${tbl} (${cols.join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`;
        }
        sqlDump += '\n';
    }
    sqlDump += 'COMMIT;\n';
    return sqlDump;
}
async function generateImportTemplateExcel() {
    const workbook = new exceljs_1.default.Workbook();
    // 1. Sheet: العملاء
    const custSheet = workbook.addWorksheet('العملاء', { views: [{ rightToLeft: true }] });
    custSheet.columns = [
        { header: 'اسم العميل', key: 'name', width: 28 },
        { header: 'رقم الهاتف', key: 'phone', width: 18 },
        { header: 'العنوان', key: 'address', width: 24 },
        { header: 'الرصيد الافتتاحي (ج.م)', key: 'balance', width: 22 },
    ];
    custSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    custSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    custSheet.addRow({ name: 'شركة الأندلس للمقاولات', phone: '01012345678', address: 'الجيزة', balance: 45000 });
    custSheet.addRow({ name: 'مكتب الهندسية للتجارة', phone: '01123456789', address: 'كرداسة', balance: 12500 });
    // 2. Sheet: الموردين
    const suppSheet = workbook.addWorksheet('الموردين', { views: [{ rightToLeft: true }] });
    suppSheet.columns = [
        { header: 'اسم المورد', key: 'name', width: 28 },
        { header: 'رقم الهاتف', key: 'phone', width: 18 },
        { header: 'الرصيد المستحق للمورد (ج.م)', key: 'balance', width: 24 },
    ];
    suppSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    suppSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF581C87' } };
    suppSheet.addRow({ name: 'مصنع أسمنت حلوان', phone: '01234567890', balance: 80000 });
    suppSheet.addRow({ name: 'محجر الأمل للرمل والزلط', phone: '01098765432', balance: 35000 });
    // 3. Sheet: الأصناف والأسعار
    const prodSheet = workbook.addWorksheet('المنتجات والأسعار', { views: [{ rightToLeft: true }] });
    prodSheet.columns = [
        { header: 'كود الصنف', key: 'code', width: 15 },
        { header: 'اسم الصنف', key: 'name', width: 30 },
        { header: 'الوحدة', key: 'unit', width: 15 },
        { header: 'سعر البيع الافتراضي', key: 'price', width: 20 },
    ];
    prodSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    prodSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
    prodSheet.addRow({ code: 'P001', name: 'أسمنت بورتلاندي 42.5', unit: 'طن', price: 2850 });
    prodSheet.addRow({ code: 'P002', name: 'رمل أحمر مباني ممتاز', unit: 'متر مكعب', price: 160 });
    prodSheet.addRow({ code: 'P003', name: 'زلط سن 2 مخصوص', unit: 'متر مكعب', price: 290 });
    prodSheet.addRow({ code: 'P004', name: 'طوب أسمنتي مصمت 25×12×6', unit: 'ألف', price: 1750 });
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
}
