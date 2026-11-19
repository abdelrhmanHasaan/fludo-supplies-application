import type { PoolClient } from 'pg';
import { postJournalEntry } from './accounting.js';

export interface PaymentAllocationItem {
  invoiceId: string;
  amount: number;
}

export interface RecordPaymentParams {
  paymentType: 'customer_receipt' | 'supplier_payment' | 'driver_collection';
  partyId?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'cheque';
  cashAccountId?: string;
  driverName?: string;
  notes?: string;
  allocations?: PaymentAllocationItem[];
}

export async function recordPayment(
  client: PoolClient,
  params: RecordPaymentParams
): Promise<string> {
  if (params.amount <= 0) throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');

  const seq = params.paymentType === 'customer_receipt' ? 'payment_in' : 'payment_out';
  const nextNumRes = await client.query(`SELECT app.next_doc_number($1) AS num`, [seq]);
  const paymentNumber = nextNumRes.rows[0].num;

  const direction = params.paymentType === 'supplier_payment' ? 'out' : 'in';

  let journalId: string;
  if (params.paymentType === 'customer_receipt') {
    journalId = await postJournalEntry(client, {
      entryDate: params.paymentDate,
      sourceDocType: 'payment',
      sourceDocId: paymentNumber,
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
  } else if (params.paymentType === 'supplier_payment') {
    journalId = await postJournalEntry(client, {
      entryDate: params.paymentDate,
      sourceDocType: 'payment',
      sourceDocId: paymentNumber,
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
  } else {
    journalId = await postJournalEntry(client, {
      entryDate: params.paymentDate,
      sourceDocType: 'payment',
      sourceDocId: paymentNumber,
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

  const payRes = await client.query(
    `INSERT INTO app.payments (
      payment_no, direction, party_id, payment_date,
      amount, method, status, journal_entry_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8)
    RETURNING id`,
    [
      paymentNumber,
      direction,
      params.partyId || null,
      params.paymentDate,
      params.amount,
      params.paymentMethod,
      journalId,
      params.notes || null,
    ]
  );
  const paymentId = payRes.rows[0].id;

  if (params.allocations && params.allocations.length > 0) {
    for (const alloc of params.allocations) {
      if (direction === 'in') {
        await client.query(
          `INSERT INTO app.payment_allocations (
            payment_id, sales_invoice_id, amount
          ) VALUES ($1, $2, $3)`,
          [paymentId, alloc.invoiceId, alloc.amount]
        );
      } else {
        await client.query(
          `INSERT INTO app.payment_allocations (
            payment_id, purchase_invoice_id, amount
          ) VALUES ($1, $2, $3)`,
          [paymentId, alloc.invoiceId, alloc.amount]
        );
      }
    }
  }

  return paymentId;
}

export async function performPartyNetting(
  client: PoolClient,
  partyId: string,
  amount: number,
  notes?: string
): Promise<string> {
  const journalId = await postJournalEntry(client, {
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
