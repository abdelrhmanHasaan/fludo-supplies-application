import type { PoolClient } from 'pg';
import ExcelJS from 'exceljs';
import { postJournalEntry } from './accounting.js';

export interface CustomerBlock {
  name: string;
  phone?: string;
  category?: string;
  startDate?: string;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
  reservedQty?: number;
  salesLines: Array<{
    lineNo: number;
    date?: string;
    productName: string;
    unitName?: string;
    qty: number;
    unitPrice: number;
    total: number;
    advancePaid?: number;
  }>;
  payments: Array<{
    date?: string;
    amount: number;
    notes?: string;
  }>;
}

export interface SupplierBlock {
  name: string;
  phone?: string;
  totalPurchases: number;
  totalPaid: number;
  balance: number;
  purchaseLines: Array<{
    lineNo: number;
    date?: string;
    productName: string;
    unitName?: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  payments: Array<{
    date?: string;
    amount: number;
    notes?: string;
  }>;
}

export interface ImportPreviewResult {
  customersFound: CustomerBlock[];
  suppliersFound: SupplierBlock[];
  productsFound: Array<{ code?: string; name: string; unit?: string; price: number }>;
  employeesFound: Array<{ name: string; jobTitle?: string; dailyRate: number; phone?: string }>;
  equipmentFound: Array<{ code?: string; name: string; plateNo?: string }>;
  totals: {
    customerPurchases: number;
    customerPaid: number;
    customerRemaining: number;
    supplierPurchases: number;
    supplierPaid: number;
    supplierRemaining: number;
    salesLinesCount: number;
    paymentsCount: number;
  };
  warnings: string[];
}

function parseCellNumber(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'object' && val.result !== undefined) {
    const num = parseFloat(val.result);
    return isNaN(num) ? 0 : num;
  }
  const clean = val.toString().replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function parseCellString(val: any): string {
  if (!val) return '';
  if (typeof val === 'object' && val.result !== undefined) {
    return val.result ? val.result.toString().trim() : '';
  }
  return val.toString().trim();
}

function parseCellDate(val: any): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = parseCellString(val);
  if (!str) return undefined;
  // Check if DD/MM/YYYY or YYYY-MM-DD
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (p2 > 1000) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
    }
  }
  return str.slice(0, 10);
}

export async function parseExcelWorkbook(buffer: Buffer): Promise<ImportPreviewResult> {
  const workbook = new ExcelJS.Workbook();
  // @ts-ignore
  await workbook.xlsx.load(buffer);

  const preview: ImportPreviewResult = {
    customersFound: [],
    suppliersFound: [],
    productsFound: [],
    employeesFound: [],
    equipmentFound: [],
    totals: {
      customerPurchases: 0,
      customerPaid: 0,
      customerRemaining: 0,
      supplierPurchases: 0,
      supplierPaid: 0,
      supplierRemaining: 0,
      salesLinesCount: 0,
      paymentsCount: 0,
    },
    warnings: [],
  };

  // 1. Settings Sheet (الاعدادات)
  const settingsSheet = workbook.getWorksheet('الاعدادات') || workbook.getWorksheet('الأعدادات') || workbook.getWorksheet('Settings');
  if (settingsSheet) {
    settingsSheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 2) {
        const prodName = parseCellString(row.getCell(2).value);
        const prodUnit = parseCellString(row.getCell(3).value);
        const prodCode = parseCellString(row.getCell(4).value);
        const prodPrice = parseCellNumber(row.getCell(5).value);
        if (prodName && prodName !== 'اسم الصنف' && !preview.productsFound.some((p) => p.name === prodName)) {
          preview.productsFound.push({
            code: prodCode || undefined,
            name: prodName,
            unit: prodUnit || undefined,
            price: prodPrice,
          });
        }

        // Employees in Settings (Col 8 = Name, 9 = Job, 10 = Rate)
        const empName = parseCellString(row.getCell(8).value);
        const empJob = parseCellString(row.getCell(9).value);
        const empRate = parseCellNumber(row.getCell(10).value);
        if (empName && empName !== 'اسم الموظف' && !preview.employeesFound.some((e) => e.name === empName)) {
          preview.employeesFound.push({
            name: empName,
            jobTitle: empJob || undefined,
            dailyRate: empRate,
          });
        }

        // Equipment in Settings (Col 14 = Name, 15 = Plate)
        const eqName = parseCellString(row.getCell(14).value);
        const eqPlate = parseCellString(row.getCell(15).value);
        if (eqName && eqName !== 'اسم المعدة' && !preview.equipmentFound.some((eq) => eq.name === eqName)) {
          preview.equipmentFound.push({
            name: eqName,
            plateNo: eqPlate || undefined,
          });
        }
      }
    });
  }

  // 2. Customers Sheet (حسابات العملاء)
  const custSheet = workbook.getWorksheet('حسابات العملاء') || workbook.getWorksheet('العملاء');
  if (custSheet) {
    const blockStarts: number[] = [];
    custSheet.eachRow((row, rowIdx) => {
      const cellC = parseCellString(row.getCell(3).value);
      if (cellC === 'اسم العميل') {
        blockStarts.push(rowIdx);
      }
    });

    for (let bIdx = 0; bIdx < blockStarts.length; bIdx++) {
      const startRow = blockStarts[bIdx];
      const endRow = bIdx + 1 < blockStarts.length ? blockStarts[bIdx + 1] - 1 : custSheet.rowCount;

      const headerRow = custSheet.getRow(startRow);
      const name = parseCellString(headerRow.getCell(4).value);
      if (!name || name === 'undefined') continue;

      const phone = parseCellString(headerRow.getCell(6).value) || undefined;
      const category = parseCellString(headerRow.getCell(8).value) || undefined;
      const startDate = parseCellDate(headerRow.getCell(12).value);

      const sumRow = custSheet.getRow(startRow + 5);
      const purchases = parseCellNumber(sumRow.getCell(3).value);
      const paid = parseCellNumber(sumRow.getCell(4).value);
      const remaining = parseCellNumber(sumRow.getCell(5).value);
      const reservedQty = parseCellNumber(sumRow.getCell(9).value);

      const salesLines: any[] = [];
      const payments: any[] = [];

      // Scan detailed rows (starts after table header at startRow + 7)
      for (let r = startRow + 7; r <= endRow; r++) {
        const row = custSheet.getRow(r);
        const lineNo = parseCellNumber(row.getCell(3).value);
        const dateStr = parseCellDate(row.getCell(6).value);
        const prod = parseCellString(row.getCell(7).value);
        const unit = parseCellString(row.getCell(8).value);
        const qty = parseCellNumber(row.getCell(10).value);
        const price = parseCellNumber(row.getCell(11).value);
        const advance = parseCellNumber(row.getCell(12).value);
        const payVal = parseCellNumber(row.getCell(13).value);

        if (prod && qty > 0) {
          salesLines.push({
            lineNo: lineNo || salesLines.length + 1,
            date: dateStr,
            productName: prod,
            unitName: unit || undefined,
            qty,
            unitPrice: price,
            total: qty * price,
            advancePaid: advance > 0 ? advance : undefined,
          });
          preview.totals.salesLinesCount++;
        }

        if (advance > 0) {
          payments.push({
            date: dateStr,
            amount: advance,
            notes: `دفعة مقدمة للعميل ${name}`,
          });
          preview.totals.paymentsCount++;
        }

        if (payVal > 0) {
          payments.push({
            date: dateStr,
            amount: payVal,
            notes: `سداد من العميل ${name}`,
          });
          preview.totals.paymentsCount++;
        }
      }

      preview.customersFound.push({
        name,
        phone,
        category,
        startDate,
        totalPurchases: purchases,
        totalPaid: paid,
        balance: remaining,
        reservedQty: reservedQty > 0 ? reservedQty : undefined,
        salesLines,
        payments,
      });

      preview.totals.customerPurchases += purchases;
      preview.totals.customerPaid += paid;
      preview.totals.customerRemaining += remaining;
    }
  }

  // 3. Suppliers Sheet (حسابات الموردين)
  const suppSheet = workbook.getWorksheet('حسابات الموردين') || workbook.getWorksheet('الموردين');
  if (suppSheet) {
    const blockStarts: number[] = [];
    suppSheet.eachRow((row, rowIdx) => {
      const cellC = parseCellString(row.getCell(3).value);
      if (cellC === 'اسم المورد') {
        blockStarts.push(rowIdx);
      }
    });

    for (let bIdx = 0; bIdx < blockStarts.length; bIdx++) {
      const startRow = blockStarts[bIdx];
      const endRow = bIdx + 1 < blockStarts.length ? blockStarts[bIdx + 1] - 1 : suppSheet.rowCount;

      const headerRow = suppSheet.getRow(startRow);
      const name = parseCellString(headerRow.getCell(4).value);
      if (!name || name === 'undefined') continue;

      const phone = parseCellString(headerRow.getCell(6).value) || undefined;

      const sumRow = suppSheet.getRow(startRow + 5);
      const purchases = parseCellNumber(sumRow.getCell(3).value);
      const paid = parseCellNumber(sumRow.getCell(4).value);
      const remaining = parseCellNumber(sumRow.getCell(5).value);

      const purchaseLines: any[] = [];
      const payments: any[] = [];

      for (let r = startRow + 7; r <= endRow; r++) {
        const row = suppSheet.getRow(r);
        const lineNo = parseCellNumber(row.getCell(3).value);
        const dateStr = parseCellDate(row.getCell(6).value);
        const prod = parseCellString(row.getCell(7).value);
        const unit = parseCellString(row.getCell(8).value);
        const qty = parseCellNumber(row.getCell(10).value);
        const price = parseCellNumber(row.getCell(11).value);
        const payVal = parseCellNumber(row.getCell(12).value);

        if (prod && qty > 0) {
          purchaseLines.push({
            lineNo: lineNo || purchaseLines.length + 1,
            date: dateStr,
            productName: prod,
            unitName: unit || undefined,
            qty,
            unitPrice: price,
            total: qty * price,
          });
        }

        if (payVal > 0) {
          payments.push({
            date: dateStr,
            amount: payVal,
            notes: `سداد للمورد ${name}`,
          });
        }
      }

      preview.suppliersFound.push({
        name,
        phone,
        totalPurchases: purchases,
        totalPaid: paid,
        balance: remaining,
        purchaseLines,
        payments,
      });

      preview.totals.supplierPurchases += purchases;
      preview.totals.supplierPaid += paid;
      preview.totals.supplierRemaining += remaining;
    }
  }

  return preview;
}

export async function commitImportedData(
  client: PoolClient,
  preview: ImportPreviewResult,
  mode: 'opening_balances' | 'full' = 'opening_balances'
) {
  let customersCreated = 0;
  let suppliersCreated = 0;
  let productsCreated = 0;
  let employeesCreated = 0;

  // 1. Products
  for (const p of preview.productsFound) {
    const code = p.code || (await client.query("SELECT app.next_doc_number('product') AS code")).rows[0].code;
    const res = await client.query(
      `INSERT INTO app.products (code, name, unit_name, default_sale_price)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, name) DO UPDATE
       SET unit_name = COALESCE(EXCLUDED.unit_name, app.products.unit_name),
           default_sale_price = COALESCE(EXCLUDED.default_sale_price, app.products.default_sale_price)
       RETURNING id`,
      [code, p.name, p.unit || 'وحدة', p.price || 0]
    );
    if (res.rows.length > 0) productsCreated++;
  }

  // 2. Employees
  for (const e of preview.employeesFound) {
    const code = (await client.query("SELECT app.next_doc_number('employee') AS code")).rows[0].code;
    const res = await client.query(
      `INSERT INTO app.employees (code, full_name, job_title, daily_rate, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, full_name) DO NOTHING
       RETURNING id`,
      [code, e.name, e.jobTitle || null, e.dailyRate || 0, e.phone || null]
    );
    if (res.rows.length > 0) employeesCreated++;
  }

  // 3. Customers
  for (const c of preview.customersFound) {
    const code = (await client.query("SELECT app.next_doc_number('customer') AS code")).rows[0].code;
    const partyRes = await client.query(
      `INSERT INTO app.parties (code, name, phone, is_customer, customer_balance)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (tenant_id, name) DO UPDATE
       SET is_customer = true,
           customer_balance = EXCLUDED.customer_balance
       RETURNING id`,
      [code, c.name, c.phone || null, c.balance]
    );

    const partyId = partyRes.rows[0]?.id;
    if (partyId) {
      customersCreated++;

      // Post opening balance journal entry if balance > 0
      if (c.balance !== 0) {
        await postJournalEntry(client, {
          entryDate: c.startDate || new Date().toISOString().slice(0, 10),
          sourceDocType: 'opening_balance',
          sourceDocId: partyId,
          narration: `رصيد افتتاحي مرحل من الإكسيل للعميل ${c.name}`,
          lines: [
            {
              accountCode: '1100', // Receivable
              partyId,
              debit: c.balance > 0 ? c.balance : 0,
              credit: c.balance < 0 ? Math.abs(c.balance) : 0,
              description: `رصيد افتتاحي للعميل ${c.name}`,
            },
            {
              accountCode: '3000', // Equity / Retained Earnings
              debit: c.balance < 0 ? Math.abs(c.balance) : 0,
              credit: c.balance > 0 ? c.balance : 0,
              description: `مقابل رصيد افتتاحي للعميل ${c.name}`,
            },
          ],
        });
      }
    }
  }

  // 4. Suppliers
  for (const s of preview.suppliersFound) {
    const code = (await client.query("SELECT app.next_doc_number('supplier') AS code")).rows[0].code;
    const partyRes = await client.query(
      `INSERT INTO app.parties (code, name, phone, is_supplier, supplier_balance)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (tenant_id, name) DO UPDATE
       SET is_supplier = true,
           supplier_balance = EXCLUDED.supplier_balance
       RETURNING id`,
      [code, s.name, s.phone || null, s.balance]
    );

    const partyId = partyRes.rows[0]?.id;
    if (partyId) {
      suppliersCreated++;

      // Post opening balance journal entry for supplier
      if (s.balance !== 0) {
        await postJournalEntry(client, {
          entryDate: new Date().toISOString().slice(0, 10),
          sourceDocType: 'opening_balance',
          sourceDocId: partyId,
          narration: `رصيد افتتاحي مرحل من الإكسيل للمورد ${s.name}`,
          lines: [
            {
              accountCode: '3000', // Equity
              debit: s.balance > 0 ? s.balance : 0,
              credit: s.balance < 0 ? Math.abs(s.balance) : 0,
              description: `مقابل رصيد افتتاحي للمورد ${s.name}`,
            },
            {
              accountCode: '2100', // Payable
              partyId,
              debit: s.balance < 0 ? Math.abs(s.balance) : 0,
              credit: s.balance > 0 ? s.balance : 0,
              description: `رصيد افتتاحي للمورد ${s.name}`,
            },
          ],
        });
      }
    }
  }

  return {
    customersCreated,
    suppliersCreated,
    productsCreated,
    employeesCreated,
  };
}
