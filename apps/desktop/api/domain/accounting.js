"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postJournalEntry = postJournalEntry;
exports.reverseJournalEntry = reverseJournalEntry;
async function postJournalEntry(client, params) {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const line of params.lines) {
        totalDebit += Math.round(line.debit * 100);
        totalCredit += Math.round(line.credit * 100);
    }
    if (totalDebit !== totalCredit) {
        throw new Error(`القيد غير متزن: إجمالي المدين (${(totalDebit / 100).toFixed(2)}) لا يساوي إجمالي الدائن (${(totalCredit / 100).toFixed(2)})`);
    }
    if (totalDebit === 0) {
        throw new Error('لا يمكن ترحيل قيد بقيمة صفر');
    }
    const accountCodes = [...new Set(params.lines.map((l) => l.accountCode))];
    const accRes = await client.query('SELECT id, code FROM app.accounts WHERE code = ANY($1)', [accountCodes]);
    const accountMap = new Map();
    for (const row of accRes.rows) {
        accountMap.set(row.code, row.id);
    }
    for (const code of accountCodes) {
        if (!accountMap.has(code)) {
            throw new Error(`الحساب المالي غير موجود للكود: ${code}`);
        }
    }
    const nextNumRes = await client.query("SELECT app.next_doc_number('journal_entry') AS num");
    const entryNumber = nextNumRes.rows[0].num;
    const entryRes = await client.query(`INSERT INTO app.journal_entries (
      entry_no, entry_date, source_type, source_id, description, status
    ) VALUES ($1, $2, $3, $4, $5, 'posted')
    RETURNING id`, [entryNumber, params.entryDate, params.sourceDocType, params.sourceDocId, params.narration]);
    const entryId = entryRes.rows[0].id;
    let lineNo = 1;
    for (const line of params.lines) {
        const accountId = accountMap.get(line.accountCode);
        await client.query(`INSERT INTO app.journal_lines (
        entry_id, line_no, account_id, party_id, debit, credit, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            entryId,
            lineNo++,
            accountId,
            line.partyId || null,
            line.debit,
            line.credit,
            line.description || params.narration,
        ]);
    }
    return entryId;
}
async function reverseJournalEntry(client, journalEntryId, reason) {
    const origRes = await client.query('SELECT * FROM app.journal_entries WHERE id = $1', [
        journalEntryId,
    ]);
    if (origRes.rows.length === 0) {
        throw new Error('القيد المراد عكسه غير موجود');
    }
    const orig = origRes.rows[0];
    const linesRes = await client.query(`SELECT l.*, a.code AS account_code 
     FROM app.journal_lines l
     JOIN app.accounts a ON a.id = l.account_id
     WHERE l.entry_id = $1
     ORDER BY l.line_no`, [journalEntryId]);
    const reverseLines = linesRes.rows.map((l) => ({
        accountCode: l.account_code,
        partyId: l.party_id,
        debit: parseFloat(l.credit),
        credit: parseFloat(l.debit),
        description: `عكس قيد: ${l.description || ''} (${reason})`,
    }));
    const reverseEntryId = await postJournalEntry(client, {
        entryDate: new Date().toISOString().split('T')[0],
        sourceDocType: `reverse_${orig.source_type}`,
        sourceDocId: orig.source_id,
        narration: `عكس القيد رقم ${orig.entry_no}: ${reason}`,
        lines: reverseLines,
    });
    await client.query('UPDATE app.journal_entries SET reversed_by_entry_id = $1 WHERE id = $2', [reverseEntryId, journalEntryId]);
    return reverseEntryId;
}
