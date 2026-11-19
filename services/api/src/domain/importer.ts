import type { PoolClient } from 'pg';
import ExcelJS from 'exceljs';
import { postJournalEntry } from './accounting.js';

export interface ImportPreviewResult {
  customersFound: Array<{ name: string; phone?: string; totalPurchases: number; totalPaid: number; balance: number }>;
  suppliersFound: Array<{ name: string; totalPurchases: number; totalPaid: number; balance: number }>;
  productsFound: Array<{ code?: string; name: string; unit?: string; price: number }>;
  totals: {
    customerPurchases: number;
    customerPaid: number;
    supplierPurchases: number;
    supplierPaid: number;
  };
  warnings: string[];
}

export async function parseExcelWorkbook(buffer: Buffer): Promise<ImportPreviewResult> {
  const workbook = new ExcelJS.Workbook();
  // @ts-ignore
  await workbook.xlsx.load(buffer);

  const preview: ImportPreviewResult = {
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

  // Helper: Try to parse sheet by column headers
  const parseTableByHeaders = (sheet: ExcelJS.Worksheet) => {
    let headerRowIdx = -1;
    const colMap: Record<string, number> = {};

    sheet.eachRow((row, rowIdx) => {
      if (headerRowIdx !== -1) return;
      row.eachCell((cell, colIdx) => {
        const val = cell.value?.toString().trim().toLowerCase() || '';
        if (
          val.includes('اسم العميل') ||
          val.includes('اسم الصنف') ||
          val.includes('اسم المورد') ||
          val === 'العميل' ||
          val === 'الصنف' ||
          val === 'المورد' ||
          val === 'customer' ||
          val === 'product' ||
          val === 'supplier'
        ) {
          headerRowIdx = rowIdx;
        }
      });
      if (headerRowIdx === rowIdx) {
        row.eachCell((cell, colIdx) => {
          const val = cell.value?.toString().trim().toLowerCase() || '';
          if (val.includes('اسم العميل') || val === 'العميل' || val.includes('customer')) colMap['customer_name'] = colIdx;
          if (val.includes('اسم المورد') || val === 'المورد' || val.includes('supplier')) colMap['supplier_name'] = colIdx;
          if (val.includes('اسم الصنف') || val === 'الصنف' || val.includes('المنتج') || val.includes('product')) colMap['product_name'] = colIdx;
          if (val.includes('كود') || val.includes('code')) colMap['code'] = colIdx;
          if (val.includes('هاتف') || val.includes('تليفون') || val.includes('موبايل') || val.includes('phone')) colMap['phone'] = colIdx;
          if (val.includes('وحد') || val.includes('unit')) colMap['unit'] = colIdx;
          if (val.includes('سعر') || val.includes('price')) colMap['price'] = colIdx;
          if (val.includes('رصيد') || val.includes('balance')) colMap['balance'] = colIdx;
        });
      }
    });

    if (headerRowIdx === -1) return false;

    let foundAny = false;
    sheet.eachRow((row, rowIdx) => {
      if (rowIdx <= headerRowIdx) return;

      // Check for Customer
      if (colMap['customer_name']) {
        const name = row.getCell(colMap['customer_name']).value?.toString().trim();
        if (name && name !== 'اسم العميل' && name !== 'العميل') {
          const phone = colMap['phone'] ? row.getCell(colMap['phone']).value?.toString().trim() : undefined;
          const balVal = colMap['balance'] ? parseFloat(row.getCell(colMap['balance']).value?.toString() || '0') : 0;
          const balance = isNaN(balVal) ? 0 : balVal;
          if (!preview.customersFound.some((c) => c.name === name)) {
            preview.customersFound.push({ name, phone, totalPurchases: balance > 0 ? balance : 0, totalPaid: balance < 0 ? Math.abs(balance) : 0, balance });
            foundAny = true;
          }
        }
      }

      // Check for Supplier
      if (colMap['supplier_name']) {
        const name = row.getCell(colMap['supplier_name']).value?.toString().trim();
        if (name && name !== 'اسم المورد' && name !== 'المورد') {
          const balVal = colMap['balance'] ? parseFloat(row.getCell(colMap['balance']).value?.toString() || '0') : 0;
          const balance = isNaN(balVal) ? 0 : balVal;
          if (!preview.suppliersFound.some((s) => s.name === name)) {
            preview.suppliersFound.push({ name, totalPurchases: balance, totalPaid: 0, balance });
            foundAny = true;
          }
        }
      }

      // Check for Product
      if (colMap['product_name']) {
        const name = row.getCell(colMap['product_name']).value?.toString().trim();
        if (name && name !== 'اسم الصنف' && name !== 'الصنف') {
          const code = colMap['code'] ? row.getCell(colMap['code']).value?.toString().trim() : undefined;
          const unit = colMap['unit'] ? row.getCell(colMap['unit']).value?.toString().trim() : undefined;
          const priceVal = colMap['price'] ? parseFloat(row.getCell(colMap['price']).value?.toString() || '0') : 0;
          if (!preview.productsFound.some((p) => p.name === name)) {
            preview.productsFound.push({ code, name, unit, price: isNaN(priceVal) ? 0 : priceVal });
            foundAny = true;
          }
        }
      }
    });

    return foundAny;
  };

  // Try parsing each worksheet by standard headers first
  workbook.eachSheet((sheet) => {
    parseTableByHeaders(sheet);
  });

  // If table headers were not found, fallback to the legacy multi-cell daily workbook layout
  if (preview.productsFound.length === 0) {
    const settingsSheet = workbook.getWorksheet('الاعدادات') || workbook.getWorksheet('الأعدادات') || workbook.getWorksheet('Settings');
    if (settingsSheet) {
      settingsSheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 2) {
          const nameVal = row.getCell(2).value?.toString().trim();
          const unitVal = row.getCell(3).value?.toString().trim();
          const codeVal = row.getCell(4).value?.toString().trim();
          const priceVal = parseFloat(row.getCell(5).value?.toString() || '0');
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
  }

  if (preview.customersFound.length === 0) {
    const custSheet = workbook.getWorksheet('حسابات العملاء') || workbook.getWorksheet('العملاء') || workbook.getWorksheet('Customers');
    if (custSheet) {
      custSheet.eachRow((row, rowNumber) => {
        const cellC = row.getCell(3).value?.toString().trim();
        const cellD = row.getCell(4).value?.toString().trim();
        if (cellC === 'اسم العميل' && cellD) {
          const name = cellD;
          const phone = row.getCell(6).value?.toString().trim() || undefined;
          const totRow = custSheet.getRow(rowNumber + 5);
          const purchVal = parseFloat(totRow.getCell(3).value?.toString() || '0');
          const paidVal = parseFloat(totRow.getCell(4).value?.toString() || '0');
          const purchases = isNaN(purchVal) ? 0 : purchVal;
          const paid = isNaN(paidVal) ? 0 : paidVal;
          const balance = purchases - paid;
          preview.customersFound.push({ name, phone, totalPurchases: purchases, totalPaid: paid, balance });
          preview.totals.customerPurchases += purchases;
          preview.totals.customerPaid += paid;
        }
      });
    }
  }

  if (preview.suppliersFound.length === 0) {
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
  }

  return preview;
}

export async function commitImportedData(
  client: PoolClient,
  preview: ImportPreviewResult,
  importMode: 'opening_balances' | 'full' = 'opening_balances'
) {
  let customersCreated = 0;
  let suppliersCreated = 0;
  let productsCreated = 0;

  // 1. Commit Products
  for (const p of preview.productsFound) {
    let unitId: string | null = null;
    if (p.unit) {
      const uRes = await client.query('SELECT id FROM app.units WHERE name = $1', [p.unit]);
      if (uRes.rows.length > 0) {
        unitId = uRes.rows[0].id;
      } else {
        const newU = await client.query('INSERT INTO app.units (name) VALUES ($1) RETURNING id', [p.unit]);
        unitId = newU.rows[0].id;
      }
    }

    await client.query(
      `INSERT INTO app.products (code, name, kind, unit_id, default_sale_price, data_origin)
       VALUES ($1, $2, 'goods', $3, $4, 'excel_import')
       ON CONFLICT (tenant_id, code) DO UPDATE 
       SET name = EXCLUDED.name, default_sale_price = EXCLUDED.default_sale_price`,
      [p.code || `P${productsCreated + 1}`, p.name, unitId, p.price]
    );
    productsCreated++;
  }

  const today = new Date().toISOString().split('T')[0];

  // 2. Commit Customers & Opening Balances
  for (const c of preview.customersFound) {
    const pRes = await client.query(
      `INSERT INTO app.parties (name, phone, is_customer, is_supplier, data_origin)
       VALUES ($1, $2, true, false, 'excel_import')
       ON CONFLICT (tenant_id, name) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, app.parties.phone)
       RETURNING id`,
      [c.name, c.phone || null]
    );
    const partyId = pRes.rows[0].id;
    customersCreated++;

    // If customer has a non-zero balance, post an opening balance journal
    if (c.balance !== 0) {
      if (c.balance > 0) {
        // Customer owes us: Dr Receivable (1100) / Cr Opening Balance Equity (3900)
        await postJournalEntry(client, {
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
      } else {
        // Customer has credit balance: Dr Opening Balance Equity (3900) / Cr Receivable (1100)
        const creditAmt = Math.abs(c.balance);
        await postJournalEntry(client, {
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
    const pRes = await client.query(
      `INSERT INTO app.parties (name, is_customer, is_supplier, data_origin)
       VALUES ($1, false, true, 'excel_import')
       ON CONFLICT (tenant_id, name) DO UPDATE SET is_supplier = true
       RETURNING id`,
      [s.name]
    );
    const partyId = pRes.rows[0].id;
    suppliersCreated++;

    // Supplier balance: we owe them (c.balance > 0): Dr Opening Balance (3900) / Cr Payable (2100)
    if (s.balance !== 0) {
      if (s.balance > 0) {
        await postJournalEntry(client, {
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

