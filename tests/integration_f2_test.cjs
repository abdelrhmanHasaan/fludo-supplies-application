const assert = require('node:assert');

const API_BASE = 'http://127.0.0.1:4000/api';

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('--- STARTING F2 TRANSACTION INTEGRATION TEST SUITE ---');

  // Step 0: Ensure we have a customer, supplier, product, cash account, and expense category
  console.log('\n[SETUP] Fetching prerequisite entities...');

  // Get or create customer
  const partiesRes = await request('/parties');
  assert(partiesRes.ok, 'Failed to fetch parties');
  let customer = partiesRes.data.find((p) => p.is_customer);
  if (!customer) {
    const newCust = await request('/parties', {
      method: 'POST',
      body: JSON.stringify({ name: 'عميل اختبار تجريبي', phone: '01011111111', is_customer: true, is_supplier: false }),
    });
    customer = newCust.data;
  }
  console.log(`✓ Customer: ${customer.name} (${customer.id})`);

  // Get or create supplier
  let supplier = partiesRes.data.find((p) => p.is_supplier);
  if (!supplier) {
    const newSupp = await request('/parties', {
      method: 'POST',
      body: JSON.stringify({ name: 'مورد اختبار تجريبي', phone: '01022222222', is_customer: false, is_supplier: true }),
    });
    supplier = newSupp.data;
  }
  console.log(`✓ Supplier: ${supplier.name} (${supplier.id})`);

  // Get products
  const prodsRes = await request('/products');
  assert(prodsRes.ok && prodsRes.data.length > 0, 'No products found');
  const product = prodsRes.data[0];
  console.log(`✓ Product: ${product.product_code} - ${product.product_name} (${product.product_id})`);

  // Get cash accounts
  const cashRes = await request('/treasury/accounts');
  assert(cashRes.ok && cashRes.data.length > 0, 'No cash accounts found');
  const cashAccount = cashRes.data[0];
  console.log(`✓ Cash Account: ${cashAccount.name_ar} (${cashAccount.id})`);

  // Get expense categories
  const expCatRes = await request('/expenses/categories');
  assert(expCatRes.ok && expCatRes.data.length > 0, 'No expense categories found');
  const expenseCat = expCatRes.data[0];
  console.log(`✓ Expense Category: ${expenseCat.name_ar} (${expenseCat.id})`);

  // ---------------------------------------------------------
  // TEST 1: Sales Invoice (فاتورة بيع تسليم مع مسدد نقداً)
  // ---------------------------------------------------------
  console.log('\n[TEST 1] Creating and approving Sales Invoice...');
  const salePayload = {
    partyId: customer.id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    handlingFee: 50,
    amountPaidNow: 200,
    autoApprove: true,
    lines: [
      {
        productId: product.product_id,
        qty: 2,
        unitPrice: 500,
      },
    ],
  };

  const saleRes = await request('/invoices/sales', {
    method: 'POST',
    body: JSON.stringify(salePayload),
  });

  assert(saleRes.ok, `Sales invoice failed: ${JSON.stringify(saleRes.data)}`);
  console.log(`✓ Sales Invoice created & approved! ID: ${saleRes.data.invoiceId}, Total: 1050 EGP`);

  // ---------------------------------------------------------
  // TEST 2: Customer Payment In (سند قبض من عميل)
  // ---------------------------------------------------------
  console.log('\n[TEST 2] Recording Customer Payment In...');
  const custPayPayload = {
    partyId: customer.id,
    paymentType: 'customer_receipt',
    amount: 300,
    paymentMethod: 'cash',
    referenceNo: `RC-${Date.now().toString().slice(-4)}`,
    notes: 'سند قبض تجريبي للاختبار الآلي',
  };

  const custPayRes = await request('/payments', {
    method: 'POST',
    body: JSON.stringify(custPayPayload),
  });

  assert(custPayRes.ok, `Customer payment failed: ${JSON.stringify(custPayRes.data)}`);
  console.log(`✓ Customer Payment recorded! ID: ${custPayRes.data.paymentId || custPayRes.data.id}`);

  // ---------------------------------------------------------
  // TEST 3: Purchase Receipt (إذن استلام مورد)
  // ---------------------------------------------------------
  console.log('\n[TEST 3] Creating Purchase Invoice (إذن استلام مورد)...');
  const purchasePayload = {
    partyId: supplier.id,
    invoiceDate: new Date().toISOString().slice(0, 10),
    notes: 'إذن استلام بضاعة تجريبي للاختبار الآلي',
    lines: [
      {
        productId: product.product_id,
        qty: 10,
        unitPrice: 400,
      },
    ],
  };

  const purchRes = await request('/invoices/purchase', {
    method: 'POST',
    body: JSON.stringify(purchasePayload),
  });

  assert(purchRes.ok, `Purchase invoice failed: ${JSON.stringify(purchRes.data)}`);
  console.log(`✓ Purchase Invoice created! ID: ${purchRes.data.invoiceId}`);

  // ---------------------------------------------------------
  // TEST 4: Supplier Payment Out (سند صرف لمورد)
  // ---------------------------------------------------------
  console.log('\n[TEST 4] Recording Supplier Payment Out...');
  const suppPayPayload = {
    partyId: supplier.id,
    paymentType: 'supplier_payment',
    amount: 1500,
    paymentMethod: 'cash',
    referenceNo: `PM-${Date.now().toString().slice(-4)}`,
    notes: 'سند صرف لمورد تجريبي للاختبار الآلي',
  };

  const suppPayRes = await request('/payments', {
    method: 'POST',
    body: JSON.stringify(suppPayPayload),
  });

  assert(suppPayRes.ok, `Supplier payment failed: ${JSON.stringify(suppPayRes.data)}`);
  console.log(`✓ Supplier Payment recorded! ID: ${suppPayRes.data.paymentId || suppPayRes.data.id}`);

  // ---------------------------------------------------------
  // TEST 5: General Expense (مصروف نثري/عام)
  // ---------------------------------------------------------
  console.log('\n[TEST 5] Recording General Expense...');
  const expPayload = {
    categoryId: expenseCat.id,
    expenseDate: new Date().toISOString().slice(0, 10),
    amount: 120,
    payee: 'مشتريات بوفيه وبنزين',
    description: 'مصروف نثري تجريبي للاختبار الآلي',
  };

  const expRes = await request('/expenses', {
    method: 'POST',
    body: JSON.stringify(expPayload),
  });

  assert(expRes.ok, `General expense failed: ${JSON.stringify(expRes.data)}`);
  console.log(`✓ General Expense recorded! ID: ${expRes.data.expenseId}`);

  // ---------------------------------------------------------
  // FINANCIAL AUDIT: Check Trial Balance Equilibrium
  // ---------------------------------------------------------
  console.log('\n[FINANCIAL AUDIT] Checking Trial Balance and General Ledger equilibrium...');
  const tbRes = await request('/reports/trial-balance');
  assert(tbRes.ok, 'Failed to fetch trial balance');
  const tb = tbRes.data;

  console.log(`Total Debit:  ${tb.totals.sumDebit}`);
  console.log(`Total Credit: ${tb.totals.sumCredit}`);
  console.log(`Difference:   ${tb.totals.difference}`);
  console.log(`Is Balanced:  ${tb.totals.isBalanced}`);

  assert.strictEqual(tb.totals.isBalanced, true, 'Trial balance must be balanced!');
  assert.strictEqual(tb.totals.difference, 0, 'Trial balance difference must be strictly 0.00!');

  console.log('\n======================================================');
  console.log('✅ ALL 5 TRANSACTION TYPES AND TRIAL BALANCE VERIFIED!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
