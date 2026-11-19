"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordPayment = recordPayment;
exports.performPartyNetting = performPartyNetting;
const accounting_js_1 = require("./accounting.js");
async function recordPayment(client, params) {
    if (params.amount <= 0)
        throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
    const seq = params.paymentType === 'customer_receipt' ? 'payment_in' : 'payment_out';
    const nextNumRes = await client.query(`SELECT app.next_doc_number($1) AS num`, [seq]);
    const paymentNumber = nextNumRes.rows[0].num;
    const direction = params.paymentType === 'supplier_payment' ? 'out' : 'in';
    let cashAccountId = params.cashAccountId;
    if (!cashAccountId) {
        const cashRes = await client.query("SELECT id FROM app.cash_accounts WHERE is_active = true ORDER BY (kind = 'cashbox') DESC LIMIT 1");
        cashAccountId = cashRes.rows[0]?.id;
        if (!cashAccountId)
            throw new Error('لا توجد خزينة نشطة لتسجيل حركة النقدية');
    }
    // 1. Insert payment in draft state first to get paymentId UUID
    const payRes = await client.query(`INSERT INTO app.payments (
      payment_no, direction, party_id, cash_account_id, payment_date,
      amount, method, status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
    RETURNING id`, [
        paymentNumber,
        direction,
        params.partyId || null,
        cashAccountId,
        params.paymentDate,
        params.amount,
        params.paymentMethod,
        params.notes || null,
    ]);
    const paymentId = payRes.rows[0].id;
    // 2. Post Journal Entry with UUID sourceDocId
    let journalId;
    if (params.paymentType === 'customer_receipt') {
        journalId = await (0, accounting_js_1.postJournalEntry)(client, {
            entryDate: params.paymentDate,
            sourceDocType: 'payment',
            sourceDocId: paymentId,
            narration: `سند قبض ${paymentNumber} من عميل`,
            lines: [
                {
                    accountCode: '1010', // Cash (الصندوق)
                    debit: params.amount,
                    credit: 0,
                    description: `قبض نقدي سند ${paymentNumber}`,
                },
                {
                    accountCode: '1100', // Receivable (العملاء)
                    partyId: params.partyId,
                    debit: 0,
                    credit: params.amount,
                    description: `سند قبض ${paymentNumber}`,
                },
            ],
        });
    }
    else if (params.paymentType === 'supplier_payment') {
        journalId = await (0, accounting_js_1.postJournalEntry)(client, {
            entryDate: params.paymentDate,
            sourceDocType: 'payment',
            sourceDocId: paymentId,
            narration: `سند صرف ${paymentNumber} لمورد`,
            lines: [
                {
                    accountCode: '2100', // Payable (الموردون)
                    partyId: params.partyId,
                    debit: params.amount,
                    credit: 0,
                    description: `سداد مورد سند ${paymentNumber}`,
                },
                {
                    accountCode: '1010', // Cash (الصندوق)
                    debit: 0,
                    credit: params.amount,
                    description: `صرف نقدي سند ${paymentNumber}`,
                },
            ],
        });
    }
    else {
        journalId = await (0, accounting_js_1.postJournalEntry)(client, {
            entryDate: params.paymentDate,
            sourceDocType: 'payment',
            sourceDocId: paymentId,
            narration: `تحصيل سائق (${params.driverName || ''}) سند ${paymentNumber}`,
            lines: [
                {
                    accountCode: '1010',
                    debit: params.amount,
                    credit: 0,
                    description: `توريد تحصيل سائق ${paymentNumber}`,
                },
                {
                    accountCode: '1100',
                    partyId: params.partyId,
                    debit: 0,
                    credit: params.amount,
                    description: `تحصيل عن طريق سائق ${paymentNumber}`,
                },
            ],
        });
    }
    // 3. Insert allocations if any
    if (params.allocations && params.allocations.length > 0) {
        for (const alloc of params.allocations) {
            if (direction === 'in') {
                await client.query(`INSERT INTO app.payment_allocations (
            payment_id, sales_invoice_id, amount
          ) VALUES ($1, $2, $3)`, [paymentId, alloc.invoiceId, alloc.amount]);
            }
            else {
                await client.query(`INSERT INTO app.payment_allocations (
            payment_id, purchase_invoice_id, amount
          ) VALUES ($1, $2, $3)`, [paymentId, alloc.invoiceId, alloc.amount]);
            }
        }
    }
    // 4. Update payment to approved and link journal entry
    await client.query("UPDATE app.payments SET status = 'approved', journal_entry_id = $1, approved_at = now() WHERE id = $2", [journalId, paymentId]);
    return paymentId;
}
async function performPartyNetting(client, partyId, amount, notes) {
    const journalId = await (0, accounting_js_1.postJournalEntry)(client, {
        entryDate: new Date().toISOString().split('T')[0],
        sourceDocType: 'netting',
        sourceDocId: partyId,
        narration: `مقاصة حسابات عميل / مورد: ${notes || ''}`,
        lines: [
            {
                accountCode: '2100', // Dr Payable
                partyId: partyId,
                debit: amount,
                credit: 0,
                description: 'تسوية مقاصة مورد',
            },
            {
                accountCode: '1100', // Cr Receivable
                partyId: partyId,
                debit: 0,
                credit: amount,
                description: 'تسوية مقاصة عميل',
            },
        ],
    });
    return journalId;
}
