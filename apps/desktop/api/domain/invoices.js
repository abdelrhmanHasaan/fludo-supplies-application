"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSalesInvoice = createSalesInvoice;
exports.approveSalesInvoice = approveSalesInvoice;
exports.cancelSalesInvoice = cancelSalesInvoice;
exports.createPurchaseInvoice = createPurchaseInvoice;
const accounting_js_1 = require("./accounting.js");
const inventory_js_1 = require("./inventory.js");
async function createSalesInvoice(client, params) {
    const nextNumRes = await client.query("SELECT app.next_doc_number('sales_invoice') AS num");
    const invoiceNumber = nextNumRes.rows[0].num;
    // 1. Calculate previous balance snapshot
    const balRes = await client.query(`SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
     FROM app.journal_lines l
     JOIN app.accounts a ON a.id = l.account_id
     WHERE a.system_role = 'receivable' AND l.party_id = $1`, [params.partyId]);
    const previousBalance = parseFloat(balRes.rows[0]?.balance || '0');
    // Fetch active branch
    const branchRes = await client.query("SELECT id FROM app.branches WHERE code = 'MAIN' OR is_active = true LIMIT 1");
    const branchId = branchRes.rows[0]?.id;
    if (!branchId)
        throw new Error('لا يوجد فرع نشط لربط الفاتورة به');
    // 2. Insert invoice header
    const handlingFee = params.handlingFee || 0;
    const discountAmount = params.discountAmount || 0;
    const invRes = await client.query(`INSERT INTO app.sales_invoices (
      invoice_no, party_id, branch_id, invoice_date, status,
      handling_fee, discount_amount, previous_balance_snapshot,
      notes
    ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8)
    RETURNING id`, [
        invoiceNumber,
        params.partyId,
        branchId,
        params.invoiceDate,
        handlingFee,
        discountAmount,
        previousBalance,
        params.notes || null,
    ]);
    const invoiceId = invRes.rows[0].id;
    // 3. Insert lines
    let lineNo = 1;
    for (const line of params.lines) {
        const prodRes = await client.query('SELECT default_sale_price, unit_id, unit_name FROM app.products WHERE id = $1', [line.productId]);
        const catalogPrice = prodRes.rows[0]?.default_sale_price || line.unitPrice;
        const unitId = prodRes.rows[0]?.unit_id || null;
        const unitName = (line.unitName || prodRes.rows[0]?.unit_name || '').trim() || null;
        const lineDiscount = line.discountAmount || 0;
        await client.query(`INSERT INTO app.sales_invoice_lines (
        invoice_id, line_no, product_id, unit_id, unit_name, qty, unit_price,
        discount_amount, catalog_price_snapshot, order_line_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
            invoiceId,
            lineNo++,
            line.productId,
            unitId,
            unitName,
            line.qty,
            line.unitPrice,
            lineDiscount,
            catalogPrice,
            line.orderLineId || null,
            line.notes || null,
        ]);
    }
    // 4. Create shipment if transport details provided
    if (params.destination || params.driverId || params.vehicleId) {
        const nextShipmentNum = await client.query("SELECT app.next_doc_number('shipment') AS num");
        await client.query(`INSERT INTO app.shipments (
        shipment_no, status, invoice_id, driver_id, vehicle_id, destination, departed_at, notes
      ) VALUES ($1, 'delivered', $2, $3, $4, $5, NOW(), $6)`, [
            nextShipmentNum.rows[0]?.num || `SH-${Date.now()}`,
            invoiceId,
            params.driverId || null,
            params.vehicleId || null,
            params.destination || null,
            params.notes || null,
        ]);
    }
    return invoiceId;
}
async function approveSalesInvoice(client, invoiceId, approvedBy, amountPaidNow = 0, cashAccountId) {
    const invRes = await client.query('SELECT * FROM app.sales_invoices WHERE id = $1', [invoiceId]);
    if (invRes.rows.length === 0)
        throw new Error('الفاتورة غير موجودة');
    const inv = invRes.rows[0];
    if (inv.status !== 'draft')
        throw new Error(`لا يمكن اعتماد فاتورة بحالة: ${inv.status}`);
    const linesRes = await client.query(`SELECT l.*, p.kind, p.name AS product_name 
     FROM app.sales_invoice_lines l
     JOIN app.products p ON p.id = l.product_id
     WHERE l.invoice_id = $1`, [invoiceId]);
    // 1. Stock movements for physical goods
    for (const line of linesRes.rows) {
        if (line.kind === 'goods') {
            await (0, inventory_js_1.recordStockMovement)(client, {
                productId: line.product_id,
                movementType: 'sale_issue',
                quantity: -parseFloat(line.qty),
                sourceType: 'sales_invoice',
                sourceId: invoiceId,
                notes: `مبيعات فاتورة ${inv.invoice_no}`,
            });
        }
    }
    // 2. Journal Entry
    const netTotal = parseFloat(inv.net_total);
    const handlingFee = parseFloat(inv.handling_fee || '0');
    const salesRevenue = netTotal - handlingFee;
    const journalLines = [
        {
            accountCode: '1100', // Receivable (العملاء)
            partyId: inv.party_id,
            debit: netTotal,
            credit: 0,
            description: `فاتورة مبيعات ${inv.invoice_no}`,
        },
        {
            accountCode: '4000', // Sales Revenue (إيرادات المبيعات)
            debit: 0,
            credit: salesRevenue,
            description: `مبيعات فاتورة ${inv.invoice_no}`,
        },
    ];
    if (handlingFee > 0) {
        journalLines.push({
            accountCode: '4200', // Handling Revenue (إيراد المشال)
            debit: 0,
            credit: handlingFee,
            description: `إيراد مشال فاتورة ${inv.invoice_no}`,
        });
    }
    const journalEntryId = await (0, accounting_js_1.postJournalEntry)(client, {
        entryDate: inv.invoice_date,
        sourceDocType: 'sales_invoice',
        sourceDocId: invoiceId,
        narration: `فاتورة مبيعات رقم ${inv.invoice_no}`,
        lines: journalLines,
    });
    // 3. Mark invoice as approved
    let validApprovedBy = null;
    if (approvedBy) {
        const userCheck = await client.query('SELECT id FROM app.users WHERE id = $1', [approvedBy]);
        if (userCheck.rows.length > 0) {
            validApprovedBy = approvedBy;
        }
    }
    await client.query(`UPDATE app.sales_invoices 
     SET status = 'approved',
         journal_entry_id = $1,
         approved_at = now(),
         approved_by = $2
     WHERE id = $3`, [journalEntryId, validApprovedBy, invoiceId]);
    // 4. Handle immediate cash payment if provided
    if (amountPaidNow > 0) {
        const nextPayRes = await client.query("SELECT app.next_doc_number('payment_in') AS num");
        const payNumber = nextPayRes.rows[0].num;
        const payJournalId = await (0, accounting_js_1.postJournalEntry)(client, {
            entryDate: inv.invoice_date,
            sourceDocType: 'payment',
            sourceDocId: invoiceId,
            narration: `سداد نقدي عند استلام فاتورة ${inv.invoice_no}`,
            lines: [
                {
                    accountCode: '1010', // Cash (الصندوق)
                    debit: amountPaidNow,
                    credit: 0,
                    description: `سداد نقدي فاتورة ${inv.invoice_no}`,
                },
                {
                    accountCode: '1100', // Receivable (العملاء)
                    partyId: inv.party_id,
                    debit: 0,
                    credit: amountPaidNow,
                    description: `سداد نقدي فاتورة ${inv.invoice_no}`,
                },
            ],
        });
        // Verify cash account
        let resolvedCashAccountId = cashAccountId;
        if (!resolvedCashAccountId) {
            const cashAccRes = await client.query("SELECT id FROM app.cash_accounts WHERE is_active = true ORDER BY (kind = 'cash') DESC, created_at ASC LIMIT 1");
            resolvedCashAccountId = cashAccRes.rows[0]?.id || null;
        }
        if (!resolvedCashAccountId) {
            throw new Error('اختر الخزينة/المحفظة/الحساب للمبلغ المسدد نقداً');
        }
        const payRes = await client.query(`INSERT INTO app.payments (
        payment_no, direction, party_id, cash_account_id, payment_date,
        amount, method, status, journal_entry_id, notes
      ) VALUES ($1, 'in', $2, $3, $4, $5, 'cash', 'draft', $6, $7)
      RETURNING id`, [
            payNumber,
            inv.party_id,
            resolvedCashAccountId,
            inv.invoice_date,
            amountPaidNow,
            payJournalId,
            `سداد مع فاتورة ${inv.invoice_no}`,
        ]);
        const paymentId = payRes.rows[0].id;
        await client.query(`INSERT INTO app.payment_allocations (
        payment_id, sales_invoice_id, amount
      ) VALUES ($1, $2, $3)`, [paymentId, invoiceId, amountPaidNow]);
        await client.query(`UPDATE app.payments 
       SET status = 'approved', approved_at = now(), approved_by = $1 
       WHERE id = $2`, [validApprovedBy, paymentId]);
    }
}
async function cancelSalesInvoice(client, invoiceId, approvalId, reason) {
    const invRes = await client.query('SELECT * FROM app.sales_invoices WHERE id = $1', [invoiceId]);
    if (invRes.rows.length === 0)
        throw new Error('الفاتورة غير موجودة');
    const inv = invRes.rows[0];
    if (inv.status === 'cancelled')
        throw new Error('الفاتورة ملغاة بالفعل');
    if (inv.status === 'approved' && inv.journal_entry_id) {
        await (0, accounting_js_1.reverseJournalEntry)(client, inv.journal_entry_id, `إلغاء فاتورة ${inv.invoice_no}: ${reason}`);
        const linesRes = await client.query(`SELECT l.*, p.kind FROM app.sales_invoice_lines l
       JOIN app.products p ON p.id = l.product_id
       WHERE l.invoice_id = $1`, [invoiceId]);
        for (const line of linesRes.rows) {
            if (line.kind === 'goods') {
                await (0, inventory_js_1.recordStockMovement)(client, {
                    productId: line.product_id,
                    movementType: 'adjustment',
                    quantity: parseFloat(line.qty),
                    sourceType: 'sales_invoice_cancellation',
                    sourceId: invoiceId,
                    notes: `إعادة مخزون لإلغاء فاتورة ${inv.invoice_no}`,
                });
            }
        }
    }
    await client.query("UPDATE app.sales_invoices SET status = 'cancelled', cancel_reason = $1 WHERE id = $2", [reason, invoiceId]);
}
async function createPurchaseInvoice(client, params) {
    const nextNumRes = await client.query("SELECT app.next_doc_number('purchase_invoice') AS num");
    const invoiceNumber = nextNumRes.rows[0].num;
    const branchRes = await client.query("SELECT id FROM app.branches WHERE code = 'MAIN' OR is_active = true LIMIT 1");
    const branchId = branchRes.rows[0]?.id;
    if (!branchId)
        throw new Error('لا يوجد فرع نشط لربط إذن الاستلام به');
    const invRes = await client.query(`INSERT INTO app.purchase_invoices (
      invoice_no, party_id, branch_id, invoice_date, status, notes
    ) VALUES ($1, $2, $3, $4, 'draft', $5)
    RETURNING id`, [invoiceNumber, params.partyId, branchId, params.invoiceDate, params.notes || null]);
    const invoiceId = invRes.rows[0].id;
    let lineNo = 1;
    let totalAmount = 0;
    for (const line of params.lines) {
        const prodRes = await client.query('SELECT default_sale_price, unit_id FROM app.products WHERE id = $1', [line.productId]);
        const unitId = prodRes.rows[0]?.unit_id || null;
        const lineTotal = Math.round(line.qty * line.unitPrice * 100) / 100;
        totalAmount += lineTotal;
        await client.query(`INSERT INTO app.purchase_invoice_lines (
        invoice_id, line_no, product_id, unit_id, qty, unit_price, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [invoiceId, lineNo++, line.productId, unitId, line.qty, line.unitPrice, line.notes || null]);
        await (0, inventory_js_1.recordStockMovement)(client, {
            productId: line.productId,
            movementType: 'purchase_receipt',
            quantity: line.qty,
            unitCost: line.unitPrice,
            sourceType: 'purchase_invoice',
            sourceId: invoiceId,
            notes: `إذن استلام مورد ${invoiceNumber}`,
        });
    }
    const journalId = await (0, accounting_js_1.postJournalEntry)(client, {
        entryDate: params.invoiceDate,
        sourceDocType: 'purchase_invoice',
        sourceDocId: invoiceId,
        narration: `فاتورة شراء / إذن استلام ${invoiceNumber}`,
        lines: [
            {
                accountCode: '1200', // Inventory (المخزون)
                debit: totalAmount,
                credit: 0,
                description: `توريد بضاعة إذن استلام ${invoiceNumber}`,
            },
            {
                accountCode: '2100', // Payable (الموردون)
                partyId: params.partyId,
                debit: 0,
                credit: totalAmount,
                description: `استحقاق مورد إذن استلام ${invoiceNumber}`,
            },
        ],
    });
    await client.query("UPDATE app.purchase_invoices SET status = 'approved', journal_entry_id = $1, approved_at = now() WHERE id = $2", [journalId, invoiceId]);
    return invoiceId;
}
