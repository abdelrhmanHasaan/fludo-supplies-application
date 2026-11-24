"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCustomersToExcel = exportCustomersToExcel;
exports.exportProductsToExcel = exportProductsToExcel;
exports.exportCustomerStatementToExcel = exportCustomerStatementToExcel;
exports.exportYomiaWorkbook = exportYomiaWorkbook;
exports.exportDatabaseToSql = exportDatabaseToSql;
exports.exportFullSqlBackup = exportFullSqlBackup;
exports.exportDatabaseToDataWorkbook = exportDatabaseToDataWorkbook;
exports.generateImportTemplateExcel = generateImportTemplateExcel;
const exceljs_1 = __importDefault(require("exceljs"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = __importDefault(require("node:crypto"));
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
      e.entry_no AS doc_num,
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
async function exportYomiaWorkbook(client, fixOldFormulas = true) {
    const candidatePaths = [
        node_path_1.default.resolve(process.cwd(), 'assets/templates/yomia_template.xlsx'),
        node_path_1.default.resolve(__dirname, '../../../assets/templates/yomia_template.xlsx'),
        node_path_1.default.resolve(__dirname, '../../assets/templates/yomia_template.xlsx'),
        node_path_1.default.resolve(__dirname, '../assets/templates/yomia_template.xlsx'),
        'C:/FludoCompany/Supllies ERP application/assets/templates/yomia_template.xlsx',
    ];
    const templatePath = candidatePaths.find((p) => node_fs_1.default.existsSync(p));
    if (!templatePath) {
        throw new Error('قالب ملف اليومية (yomia_template.xlsx) غير موجود في مجلد الأصول');
    }
    const workbook = new exceljs_1.default.Workbook();
    await workbook.xlsx.readFile(templatePath);
    // 1. Fetch live system totals from PostgreSQL
    const salesRes = await client.query("SELECT COALESCE(SUM(net_total), 0) AS total_sales FROM app.sales_invoices WHERE status = 'approved'");
    const totalSales = parseFloat(salesRes.rows[0]?.total_sales || '0');
    const cashRes = await client.query(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS total_cash
    FROM app.journal_lines l
    JOIN app.accounts a ON a.id = l.account_id
    WHERE a.system_role IN ('cash', 'bank')
  `);
    const totalCash = parseFloat(cashRes.rows[0]?.total_cash || '0');
    const recRes = await client.query(`
    SELECT COALESCE(SUM(l.debit - l.credit), 0) AS total_rec
    FROM app.journal_lines l
    JOIN app.accounts a ON a.id = l.account_id
    WHERE a.system_role = 'receivable'
  `);
    const totalReceivables = parseFloat(recRes.rows[0]?.total_rec || '0');
    const payRes = await client.query(`
    SELECT COALESCE(SUM(l.credit - l.debit), 0) AS total_pay
    FROM app.journal_lines l
    JOIN app.accounts a ON a.id = l.account_id
    WHERE a.system_role = 'payable'
  `);
    const totalPayables = parseFloat(payRes.rows[0]?.total_pay || '0');
    // 2. Update Sheet 2: "الاعدادات" (System Settings & Master Data)
    const settingsSheet = workbook.getWorksheet('الاعدادات');
    if (settingsSheet) {
        // Fill Products
        const prods = await client.query(`
      SELECT p.code, p.name, COALESCE(u.name, 'م³') AS unit, p.default_sale_price
      FROM app.products p
      LEFT JOIN app.units u ON u.id = p.unit_id
      WHERE NOT p.is_deleted
      ORDER BY p.code ASC
    `);
        let pRow = 9;
        for (const p of prods.rows) {
            const row = settingsSheet.getRow(pRow);
            row.getCell(2).value = p.name;
            row.getCell(3).value = p.unit;
            row.getCell(4).value = p.code;
            row.getCell(5).value = parseFloat(p.default_sale_price || '0');
            pRow++;
        }
        // Fill Employees
        const emps = await client.query(`
      SELECT code, full_name, job_title, phone, daily_rate
      FROM app.employees
      WHERE NOT is_deleted
      ORDER BY code ASC
    `);
        let eRow = 9;
        let sIdx = 1;
        for (const e of emps.rows) {
            const row = settingsSheet.getRow(eRow);
            row.getCell(7).value = sIdx++;
            row.getCell(8).value = e.full_name;
            row.getCell(9).value = e.job_title || 'موظف';
            row.getCell(10).value = e.phone || '';
            row.getCell(11).value = parseFloat(e.daily_rate || '0');
            eRow++;
        }
        // Fill Equipment
        const eqList = await client.query(`
      SELECT code, name, plate_no, vehicle_description
      FROM app.equipment
      WHERE NOT is_deleted
      ORDER BY code ASC
    `);
        let eqRow = 9;
        for (const eq of eqList.rows) {
            const row = settingsSheet.getRow(eqRow);
            row.getCell(17).value = eq.code;
            row.getCell(18).value = eq.name;
            row.getCell(19).value = eq.plate_no || '';
            row.getCell(20).value = eq.vehicle_description || '';
            eqRow++;
        }
    }
    // 3. Update Sheet 5: "كشف حساب"
    const compRes = await client.query(`SELECT name_ar, name_en, tagline, address, phones FROM app.company_profile LIMIT 1;`).catch(() => ({ rows: [] }));
    const comp = compRes.rows[0] || { name_ar: 'Fludo Supplies' };
    const statementSheet = workbook.getWorksheet('كشف حساب');
    if (statementSheet) {
        // Top banner
        statementSheet.getCell('B2').value = (comp.name_ar || 'F')[0];
        statementSheet.getCell('C2').value = comp.name_ar || 'Fludo Supplies';
        statementSheet.getCell('C3').value = `${comp.name_en || 'Fludo Supplies'}\n${comp.tagline || 'نظام إدارة التوريدات'}`;
        statementSheet.getCell('C4').value = comp.address || '';
        statementSheet.getCell('E3').value = comp.phones || '';
        statementSheet.getCell('G3').value = '';
        // Query primary customer balance or use 85350 sample
        const primaryCustRes = await client.query(`
      SELECT p.id, p.name, COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM app.parties p
      LEFT JOIN app.journal_lines l ON l.party_id = p.id
      LEFT JOIN app.accounts a ON a.id = l.account_id AND a.system_role = 'receivable'
      WHERE p.is_customer AND NOT p.is_deleted
      GROUP BY p.id, p.name
      ORDER BY balance DESC
      LIMIT 1
    `);
        const custName = primaryCustRes.rows[0]?.name || 'عبد الناصر صابر مسلم';
        const custBalance = parseFloat(primaryCustRes.rows[0]?.balance || '85350');
        statementSheet.getCell('F5').value = custName;
        const balanceCell = statementSheet.getCell('D6');
        balanceCell.value = custBalance;
        balanceCell.numFmt = '#,##0.00 "ج.م"';
        // Apply prominent red border around total amount (as seen in image 5)
        ['D6', 'E6', 'F6', 'G6', 'H6'].forEach((addr) => {
            statementSheet.getCell(addr).border = {
                top: { style: 'medium', color: { argb: 'FFDC2626' } },
                bottom: { style: 'medium', color: { argb: 'FFDC2626' } },
                left: { style: 'medium', color: { argb: 'FFDC2626' } },
                right: { style: 'medium', color: { argb: 'FFDC2626' } },
            };
            statementSheet.getCell(addr).font = { bold: true, size: 12, color: { argb: 'FFB91C1C' } };
        });
    }
    // 4. Update Sheet 1: "الرئيسيه" (Dashboard summaries)
    const homeSheet = workbook.getWorksheet('الرئيسيه');
    if (homeSheet) {
        homeSheet.getCell('B2').value = `${comp.name_ar || 'Fludo Supplies'} — نظام الإدارة المتكامل`;
        homeSheet.getCell('B4').value = 'إجمالي المبيعات المعتمدة:';
        homeSheet.getCell('C4').value = totalSales;
        homeSheet.getCell('C4').numFmt = '#,##0.00 "ج.م"';
        homeSheet.getCell('B5').value = 'إجمالي رصيد الخزينة والبنوك:';
        homeSheet.getCell('C5').value = totalCash;
        homeSheet.getCell('C5').numFmt = '#,##0.00 "ج.م"';
        homeSheet.getCell('B6').value = 'إجمالي مستحقات لدى العملاء:';
        homeSheet.getCell('C6').value = totalReceivables;
        homeSheet.getCell('C6').numFmt = '#,##0.00 "ج.م"';
        homeSheet.getCell('B7').value = 'إجمالي التزامات للموردين:';
        homeSheet.getCell('C7').value = totalPayables;
        homeSheet.getCell('C7').numFmt = '#,##0.00 "ج.م"';
    }
    // 5. Formula Sanitization & Real Formula Preservation across all sheets
    if (fixOldFormulas) {
        workbook.worksheets.forEach((ws) => {
            ws.eachRow((row) => {
                row.eachCell((cell) => {
                    if (typeof cell.value === 'object' && cell.value && 'formula' in cell.value) {
                        let formula = cell.value.formula;
                        if (typeof formula === 'string') {
                            // Fix arithmetic SUM expressions: SUM(A-B) -> (A-B), SUM(A*B) -> (A*B)
                            const fixed = formula
                                .replace(/SUM\(([^)]+)-([^)]+)\)/gi, '($1-$2)')
                                .replace(/SUM\(([^)]+)\*([^)]+)\)/gi, '($1*$2)');
                            if (fixed !== formula) {
                                cell.value = {
                                    formula: fixed,
                                    result: cell.value.result,
                                };
                            }
                        }
                    }
                });
            });
        });
    }
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
}
async function exportDatabaseToSql(client) {
    const tables = [
        'tenants',
        'branches',
        'roles',
        'users',
        'user_roles',
        'parties',
        'party_ledger_sections',
        'units',
        'products',
        'accounts',
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
    let sqlDump = `-- Fludo ERP Database Portable Data Dump\n-- Generated: ${new Date().toISOString()}\n-- Application: Fludo Supplies ERP v1.0.0\n\nBEGIN;\n\n`;
    for (const tbl of tables) {
        try {
            const rowsRes = await client.query(`SELECT * FROM app.${tbl} WHERE is_deleted = false OR is_deleted IS NULL`);
            if (rowsRes.rows.length === 0)
                continue;
            sqlDump += `-- Data for app.${tbl} (${rowsRes.rows.length} rows)\n`;
            for (const r of rowsRes.rows) {
                // Exclude passwords/pins unless needed
                if (tbl === 'users') {
                    delete r.password_hash;
                    delete r.manager_pin_hash;
                }
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
        catch {
            // Ignore tables that might not exist in a given version
        }
    }
    sqlDump += 'COMMIT;\n';
    return sqlDump;
}
async function exportFullSqlBackup() {
    const pgDumpCandidates = [
        node_path_1.default.resolve(__dirname, '../../../../apps/desktop/pgsql/bin/pg_dump.exe'),
        node_path_1.default.resolve(process.cwd(), 'apps/desktop/pgsql/bin/pg_dump.exe'),
        node_path_1.default.resolve(process.cwd(), 'pgsql/bin/pg_dump.exe'),
        'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    ];
    const pgDumpExe = pgDumpCandidates.find((p) => node_fs_1.default.existsSync(p));
    if (!pgDumpExe) {
        throw new Error('pg_dump.exe غير موجود في محرك PostgreSQL المحمول أو المثبت');
    }
    const port = process.env.PGPORT || '5434';
    const password = process.env.PGPASSWORD || 'erp_password_local_123';
    return new Promise((resolve, reject) => {
        const args = [
            '-h', '127.0.0.1',
            '-p', String(port),
            '-U', 'erp_owner',
            '-d', 'fludo_erp',
            '--format=p', // plain text SQL
            '--no-owner',
            '--no-privileges',
            '--encoding=UTF8',
        ];
        (0, node_child_process_1.execFile)(pgDumpExe, args, { maxBuffer: 100 * 1024 * 1024, env: { ...process.env, PGPASSWORD: password } }, (err, stdout, stderr) => {
            if (err) {
                return reject(new Error(`فشل تشغيل pg_dump: ${stderr || err.message}`));
            }
            const hash = node_crypto_1.default.createHash('sha256').update(stdout).digest('hex');
            const header = `-- ========================================================\n` +
                `-- Fludo Supplies ERP Full PostgreSQL Backup\n` +
                `-- Generated At: ${new Date().toISOString()}\n` +
                `-- Engine: PostgreSQL Portable Runtime\n` +
                `-- Database: fludo_erp\n` +
                `-- SHA-256 Checksum: ${hash}\n` +
                `-- ========================================================\n\n`;
            resolve(header + stdout);
        });
    });
}
// Export Full Excel "Data Workbook" (One sheet per table + _meta sheet)
async function exportDatabaseToDataWorkbook(client) {
    const workbook = new exceljs_1.default.Workbook();
    workbook.creator = 'Fludo Supplies ERP';
    workbook.created = new Date();
    const tables = [
        'company_profile',
        'branches',
        'units',
        'products',
        'parties',
        'cash_accounts',
        'sales_invoices',
        'sales_invoice_lines',
        'purchase_invoices',
        'purchase_invoice_lines',
        'payments',
        'payment_allocations',
        'expenses',
        'employees',
        'attendance',
        'employee_transactions',
        'equipment',
        'shipments',
        'cash_transfers',
        'journal_entries',
        'journal_lines',
    ];
    const metaRows = [];
    for (const tbl of tables) {
        try {
            const rowsRes = await client.query(`SELECT * FROM app.${tbl} WHERE is_deleted = false OR is_deleted IS NULL ORDER BY created_at ASC`);
            const sheet = workbook.addWorksheet(tbl, { views: [{ rightToLeft: true }] });
            const rows = rowsRes.rows;
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]).map((col) => ({
                    header: col,
                    key: col,
                    width: col.includes('id') || col.includes('name') ? 28 : 16,
                }));
                sheet.columns = columns;
                sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
                sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
                for (const row of rows) {
                    // Password protection
                    if (tbl === 'users') {
                        delete row.password_hash;
                        delete row.manager_pin_hash;
                    }
                    const sanitizedRow = {};
                    for (const k of Object.keys(row)) {
                        let val = row[k];
                        // Protect against CSV / Excel Formula Injection
                        if (typeof val === 'string' && /^[=+\-@]/.test(val)) {
                            val = `'${val}`;
                        }
                        if (val instanceof Date) {
                            val = val.toISOString();
                        }
                        sanitizedRow[k] = val;
                    }
                    sheet.addRow(sanitizedRow);
                }
            }
            const tableDataStr = JSON.stringify(rows);
            const tableHash = node_crypto_1.default.createHash('sha256').update(tableDataStr).digest('hex');
            metaRows.push({
                table_name: tbl,
                row_count: rows.length,
                table_hash: tableHash,
            });
        }
        catch {
            // Skip if table doesn't exist
        }
    }
    // Add _meta sheet
    const metaSheet = workbook.addWorksheet('_meta', { views: [{ rightToLeft: true }] });
    metaSheet.columns = [
        { header: 'اسم الجدول (Table Name)', key: 'table_name', width: 28 },
        { header: 'عدد السجلات (Row Count)', key: 'row_count', width: 20 },
        { header: 'بصمة التشفير (SHA-256 Hash)', key: 'table_hash', width: 45 },
    ];
    metaSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    metaSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    // Add metadata headers
    metaSheet.addRow({ table_name: '__SYSTEM__', row_count: 0, table_hash: 'Fludo Supplies ERP' });
    metaSheet.addRow({ table_name: '__SCHEMA_VERSION__', row_count: 4, table_hash: '0004_figjam_overhaul' });
    metaSheet.addRow({ table_name: '__EXPORTED_AT__', row_count: 0, table_hash: new Date().toISOString() });
    for (const mr of metaRows) {
        metaSheet.addRow(mr);
    }
    // @ts-ignore
    return await workbook.xlsx.writeBuffer();
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
