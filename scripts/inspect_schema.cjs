const fs = require('fs');

const s1 = fs.readFileSync('db/migrations/0001_initial.sql', 'utf8');
const s2 = fs.readFileSync('db/migrations/0002_fix_constraints_and_search.sql', 'utf8');

function getTableDef(sql, tableName) {
  const reg = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${tableName.replace('.', '\\.')}\\s*\\(([\\s\\S]*?)\\);`, 'i');
  const m = sql.match(reg);
  return m ? m[0] : null;
}

const targets = [
  'app.products',
  'app.units',
  'app.sales_invoices',
  'app.sales_invoice_lines',
  'app.purchase_invoices',
  'app.purchase_invoice_lines',
  'app.shipments',
  'app.cash_accounts',
  'app.document_sequences',
  'app.attendance',
  'app.employee_transactions',
  'app.parties'
];

for (const t of targets) {
  console.log(`\n================== ${t} ==================`);
  const def = getTableDef(s1, t);
  if (def) {
    console.log(def);
  } else {
    console.log('Not found with standard regex');
  }
}

console.log('\n================== 0002 Content ==================');
console.log(s2);
