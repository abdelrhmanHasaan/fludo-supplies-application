"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseExcelWorkbook = parseExcelWorkbook;
exports.commitImportedData = commitImportedData;
const exceljs_1 = __importDefault(require("exceljs"));
const accounting_js_1 = require("./accounting.js");
async function parseExcelWorkbook(buffer) {
    const workbook = new exceljs_1.default.Workbook();
    // @ts-ignore
    await workbook.xlsx.load(buffer);
    const preview = {
        customersFound: [],
        suppliersFound: [],
        productsFound: [],
        totals: {
            customerPurchases: 0,
            customerPaid: 0,
            supplierPurchases: 0,
            supplierPaid: 0,
        },
        warnings: [],
    };
    // 1. Settings Sheet (الاعدادات)
    const settingsSheet = workbook.getWorksheet('الاعدادات') || workbook.getWorksheet('الأعدادات') || workbook.getWorksheet('Settings');
    if (settingsSheet) {
        settingsSheet.eachRow((row, rowNumber) => {
            if (rowNumber >= 2) {
                const nameVal = row.getCell(2).value?.toString().trim(); // B: اسم الصنف
                const unitVal = row.getCell(3).value?.toString().trim(); // C: الوحده
                const codeVal = row.getCell(4).value?.toString().trim(); // D: الكود
                const priceVal = parseFloat(row.getCell(5).value?.toString() || '0'); // E: سعر اليوم
                if (nameVal && nameVal !== 'اسم الصنف') {
                    preview.productsFound.push({
                        code: codeVal,
                        name: nameVal,
                        unit: unitVal,
                        price: isNaN(priceVal) ? 0 : priceVal,
                    });
                }
            }
        });
    }
    // 2. Customers Sheet (حسابات العملاء)
    const custSheet = workbook.getWorksheet('حسابات العملاء') || workbook.getWorksheet('العملاء') || workbook.getWorksheet('Customers');
    if (custSheet) {
        custSheet.eachRow((row, rowNumber) => {
            const cellC = row.getCell(3).value?.toString().trim();
            const cellD = row.getCell(4).value?.toString().trim();
            if (cellC === 'اسم العميل' && cellD) {
                const name = cellD;
                const phone = row.getCell(6).value?.toString().trim() || undefined; // F: رقم الهاتف
                // Totals row is typically 3-5 rows below
                const totRow = custSheet.getRow(rowNumber + 5);
                const purchVal = parseFloat(totRow.getCell(3).value?.toString() || '0'); // C: اجمالي مشتريات
                const paidVal = parseFloat(totRow.getCell(4).value?.toString() || '0'); // D: خالص من العميل
                const purchases = isNaN(purchVal) ? 0 : purchVal;
                const paid = isNaN(paidVal) ? 0 : paidVal;
                const balance = purchases - paid;
                preview.customersFound.push({ name, phone, totalPurchases: purchases, totalPaid: paid, balance });
                preview.totals.customerPurchases += purchases;
                preview.totals.customerPaid += paid;
            }
        });
    }
    // 3. Suppliers Sheet (حسابات الموردين)
    const suppSheet = workbook.getWorksheet('حسابات الموردين') || workbook.getWorksheet('الموردين') || workbook.getWorksheet('Suppliers');
    if (suppSheet) {
        suppSheet.eachRow((row, rowNumber) => {
            const cellC = row.getCell(3).value?.toString().trim();
            const cellD = row.getCell(4).value?.toString().trim();
            if (cellC === 'اسم المورد' && cellD) {
                const name = cellD;
                const totRow = suppSheet.getRow(rowNumber + 5);
                const purchVal = parseFloat(totRow.getCell(3).value?.toString() || '0');
                const paidVal = parseFloat(totRow.getCell(4).value?.toString() || '0');
                const purchases = isNaN(purchVal) ? 0 : purchVal;
                const paid = isNaN(paidVal) ? 0 : paidVal;
                const balance = purchases - paid;
                preview.suppliersFound.push({ name, totalPurchases: purchases, totalPaid: paid, balance });
                preview.totals.supplierPurchases += purchases;
                preview.totals.supplierPaid += paid;
            }
        });
    }
    return preview;
}
async function commitImportedData(client, preview, importMode = 'opening_balances') {
    let customersCreated = 0;
    let suppliersCreated = 0;
    let productsCreated = 0;
    // 1. Commit Products
    for (const p of preview.productsFound) {
        let unitId = null;
        if (p.unit) {
            const uRes = await client.query('SELECT id FROM app.units WHERE name = $1', [p.unit]);
            if (uRes.rows.length > 0) {
                unitId = uRes.rows[0].id;
            }
            else {
                const newU = await client.query('INSERT INTO app.units (name) VALUES ($1) RETURNING id', [p.unit]);
                unitId = newU.rows[0].id;
            }
        }
        await client.query(`INSERT INTO app.products (code, name, kind, unit_id, default_sale_price, data_origin)
       VALUES ($1, $2, 'goods', $3, $4, 'excel_import')
       ON CONFLICT (tenant_id, code) DO UPDATE 
       SET name = EXCLUDED.name, default_sale_price = EXCLUDED.default_sale_price`, [p.code || `P${productsCreated + 1}`, p.name, unitId, p.price]);
        productsCreated++;
    }
    const today = new Date().toISOString().split('T')[0];
    // 2. Commit Customers & Opening Balances
    for (const c of preview.customersFound) {
        const pRes = await client.query(`INSERT INTO app.parties (name, phone, is_customer, is_supplier, data_origin)
       VALUES ($1, $2, true, false, 'excel_import')
       ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, app.parties.phone)
       RETURNING id`, [c.name, c.phone || null]);
        const partyId = pRes.rows[0].id;
        customersCreated++;
        // If customer has a non-zero balance, post an opening balance journal
        if (c.balance !== 0) {
            if (c.balance > 0) {
                // Customer owes us: Dr Receivable (1100) / Cr Opening Balance Equity (3900)
                await (0, accounting_js_1.postJournalEntry)(client, {
                    entryDate: today,
                    sourceDocType: 'opening_balance',
                    sourceDocId: partyId,
                    narration: `رصيد افتتاحي مرحل من إكسيل للعميل: ${c.name}`,
                    lines: [
                        {
                            accountCode: '1100',
                            partyId,
                            debit: c.balance,
                            credit: 0,
                            description: `رصيد مرحل ${c.name}`,
                        },
                        {
                            accountCode: '3900', // Opening Balance Equity (أرصدة افتتاحية)
                            debit: 0,
                            credit: c.balance,
                            description: `رصيد افتتاحي ${c.name}`,
                        },
                    ],
                });
            }
            else {
                // Customer has credit balance: Dr Opening Balance Equity (3900) / Cr Receivable (1100)
                const creditAmt = Math.abs(c.balance);
                await (0, accounting_js_1.postJournalEntry)(client, {
                    entryDate: today,
                    sourceDocType: 'opening_balance',
                    sourceDocId: partyId,
                    narration: `رصيد دائن (مقدم) مرحل من إكسيل للعميل: ${c.name}`,
                    lines: [
                        {
                            accountCode: '3900',
                            debit: creditAmt,
                            credit: 0,
                            description: `رصيد افتتاحي دائن ${c.name}`,
                        },
                        {
                            accountCode: '1100',
                            partyId,
                            debit: 0,
                            credit: creditAmt,
                            description: `رصيد مقدم مرحل ${c.name}`,
                        },
                    ],
                });
            }
        }
    }
    // 3. Commit Suppliers & Opening Balances
    for (const s of preview.suppliersFound) {
        const pRes = await client.query(`INSERT INTO app.parties (name, is_customer, is_supplier, data_origin)
       VALUES ($1, false, true, 'excel_import')
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_supplier = true
       RETURNING id`, [s.name]);
        const partyId = pRes.rows[0].id;
        suppliersCreated++;
        // Supplier balance: we owe them (c.balance > 0): Dr Opening Balance (3900) / Cr Payable (2100)
        if (s.balance !== 0) {
            if (s.balance > 0) {
                await (0, accounting_js_1.postJournalEntry)(client, {
                    entryDate: today,
                    sourceDocType: 'opening_balance',
                    sourceDocId: partyId,
                    narration: `رصيد افتتاحي مرحل من إكسيل للمورد: ${s.name}`,
                    lines: [
                        {
                            accountCode: '3900',
                            debit: s.balance,
                            credit: 0,
                            description: `رصيد افتتاحي مورد ${s.name}`,
                        },
                        {
                            accountCode: '2100', // Payable (الموردون)
                            partyId,
                            debit: 0,
                            credit: s.balance,
                            description: `مستحق مرحل للمورد ${s.name}`,
                        },
                    ],
                });
            }
        }
    }
    return { customersCreated, suppliersCreated, productsCreated };
}
