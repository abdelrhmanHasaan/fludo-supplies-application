import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  ShoppingCart,
  ArrowDownLeft,
  Truck,
  ArrowUpRight,
  Receipt,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
} from 'lucide-react';

export const DailyCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sale' | 'customer_payment' | 'purchase' | 'supplier_payment' | 'expense'>('sale');
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states - Sales
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [handlingFee, setHandlingFee] = useState<number>(0);
  const [amountPaidNow, setAmountPaidNow] = useState<number>(0);
  const [lines, setLines] = useState<Array<{ productId: string; qty: number; unitPrice: number; catalogPrice: number }>>([
    { productId: '', qty: 1, unitPrice: 0, catalogPrice: 0 },
  ]);

  // Form states - Payment
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Form states - Expense
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    try {
      const [pts, prods, cats] = await Promise.all([
        api.getParties(),
        api.getProducts(),
        api.getExpenseCategories(),
      ]);
      setParties(pts);
      setProducts(prods);
      setExpenseCategories(cats);
      if (cats.length > 0) setExpenseCategoryId(cats[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  const addLine = () => {
    setLines([...lines, { productId: '', qty: 1, unitPrice: 0, catalogPrice: 0 }]);
  };

  const removeLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: string, val: any) => {
    const updated = [...lines];
    if (field === 'productId') {
      const prod = products.find((p) => p.product_id === val);
      updated[idx].productId = val;
      updated[idx].unitPrice = prod?.default_sale_price || 0;
      updated[idx].catalogPrice = prod?.default_sale_price || 0;
    } else if (field === 'qty') {
      updated[idx].qty = parseFloat(val) || 0;
    } else if (field === 'unitPrice') {
      updated[idx].unitPrice = parseFloat(val) || 0;
    }
    setLines(updated);
  };

  const subtotal = lines.reduce((acc, l) => acc + l.qty * l.unitPrice, 0);
  const grandTotal = subtotal + (handlingFee || 0);

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) return setErrorMsg('يرجى اختيار العميل');
    if (lines.length === 0 || !lines[0].productId) return setErrorMsg('يرجى إضافة صنف واحد على الأقل');

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.createSalesInvoice({
        partyId: selectedPartyId,
        invoiceDate,
        handlingFee,
        amountPaidNow,
        autoApprove: true,
        lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
      });
      setSuccessMsg(`تم إنشاء واعتماد الفاتورة بنجاح رقم المعاملة: ${res.invoiceId}`);
      // Reset
      setLines([{ productId: '', qty: 1, unitPrice: 0, catalogPrice: 0 }]);
      setHandlingFee(0);
      setAmountPaidNow(0);
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) return setErrorMsg('يرجى اختيار المورد');
    if (lines.length === 0 || !lines[0].productId) return setErrorMsg('يرجى إضافة صنف واحد على الأقل');

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.createPurchaseInvoice({
        partyId: selectedPartyId,
        invoiceDate,
        notes: paymentNotes || 'إذن استلام توريد',
        lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
      });
      setSuccessMsg(`تم تسجيل إذن استلام المورد بنجاح رقم: ${res.invoiceId}`);
      // Reset
      setLines([{ productId: '', qty: 1, unitPrice: 0, catalogPrice: 0 }]);
      setPaymentNotes('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل إذن الاستلام');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentAmount || paymentAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ صحيح');

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.recordPayment({
        paymentType: activeTab === 'customer_payment' ? 'customer_receipt' : 'supplier_payment',
        partyId: selectedPartyId || undefined,
        paymentDate: invoiceDate,
        amount: paymentAmount,
        paymentMethod,
        notes: paymentNotes,
      });
      setSuccessMsg('تم تسجيل وترحيل السند المالي بنجاح!');
      setPaymentAmount(0);
      setPaymentNotes('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل السند');
    } finally {
      setLoading(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseAmount || expenseAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ المصروف');

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.recordExpense({
        categoryId: expenseCategoryId,
        expenseDate: invoiceDate,
        amount: expenseAmount,
        payee: expensePayee,
        description: expenseDesc,
      });
      setSuccessMsg('تم تسجيل المصروف وترحيل القيد المحاسبي بنجاح!');
      setExpenseAmount(0);
      setExpenseDesc('');
      setExpensePayee('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل المصروف');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Tabs Header */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-200/70 rounded-xl">
        <button
          onClick={() => { setActiveTab('sale'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'sale'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>فاتورة بيع (تسليم)</span>
        </button>

        <button
          onClick={() => { setActiveTab('customer_payment'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'customer_payment'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>سند قبض من عميل</span>
        </button>

        <button
          onClick={() => { setActiveTab('purchase'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'purchase'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>إذن استلام مورد</span>
        </button>

        <button
          onClick={() => { setActiveTab('supplier_payment'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'supplier_payment'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>سند صرف لمورد</span>
        </button>

        <button
          onClick={() => { setActiveTab('expense'); setErrorMsg(null); setSuccessMsg(null); }}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${
            activeTab === 'expense'
              ? 'bg-rose-600 text-white shadow-md'
              : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>مصروف نثري/عام</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-300 text-rose-800 rounded-xl text-sm font-bold">
          {errorMsg}
        </div>
      )}

      {/* Form Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        {activeTab === 'sale' && (
          <form onSubmit={handleSaleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل *</label>
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                >
                  <option value="">-- اختر العميل --</option>
                  {parties
                    .filter((p) => p.is_customer)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.customer_balance > 0 ? `(عليه: ${p.customer_balance} ج.م)` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الفاتورة</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            {/* Item Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-800">أصناف الفاتورة</h3>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة صنف</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">الصنف</th>
                      <th className="p-3 w-28">الكمية</th>
                      <th className="p-3 w-32">السعر (ج.م)</th>
                      <th className="p-3 w-32">الإجمالي</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <select
                            value={line.productId}
                            onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-sm"
                            required
                          >
                            <option value="">-- اختر الصنف --</option>
                            {products.map((p) => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.product_code} - {p.product_name} ({p.unit_name || 'وحدة'}) - سعر اليوم: {p.default_sale_price}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            value={line.qty}
                            onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-sm text-center font-bold"
                            required
                          >
                          </input>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                            className={`w-full border rounded p-1.5 text-sm text-center font-bold ${
                              line.unitPrice !== line.catalogPrice && line.catalogPrice > 0
                                ? 'border-amber-400 bg-amber-50/40 text-amber-900'
                                : 'border-slate-300'
                            }`}
                            required
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-800 text-center">
                          {(line.qty * line.unitPrice).toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مصاريف المشال والتحميل (ج.م)</label>
                <input
                  type="number"
                  value={handlingFee}
                  onChange={(e) => setHandlingFee(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسدد نقداً الآن (ج.م)</label>
                <input
                  type="number"
                  value={amountPaidNow}
                  onChange={(e) => setAmountPaidNow(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm text-center font-bold text-emerald-700"
                />
              </div>

              <div className="text-left flex flex-col justify-center">
                <span className="text-xs text-slate-500 font-semibold">إجمالي الفاتورة الصافي:</span>
                <span className="text-2xl font-black text-blue-700">{grandTotal.toLocaleString()} ج.م</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50"
              >
                {loading ? 'جاري الاعتماد...' : 'حفظ واعتماد الفاتورة (Ctrl+Enter)'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'purchase' && (
          <form onSubmit={handlePurchaseSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المورد *</label>
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                >
                  <option value="">-- اختر المورد --</option>
                  {parties
                    .filter((p) => p.is_supplier)
                    .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.supplier_balance > 0 ? `(له: ${p.supplier_balance} ج.م)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الاستلام والتوريد</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>

            {/* Purchase Item Lines */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-800">الأصناف الموردة للمخزن</h3>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة صنف مورد</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-right">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">الصنف</th>
                      <th className="p-3 w-28">الكمية</th>
                      <th className="p-3 w-32">سعر الشراء (ج.م)</th>
                      <th className="p-3 w-32">الإجمالي</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2">
                          <select
                            value={line.productId}
                            onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-sm"
                            required
                          >
                            <option value="">-- اختر الصنف --</option>
                            {products.map((p) => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.product_code} - {p.product_name} ({p.unit_name || 'وحدة'})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={line.qty || ''}
                            onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-sm text-center font-bold"
                            placeholder="1"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={line.unitPrice || ''}
                            onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-sm text-center font-bold"
                            placeholder="0.00"
                            required
                          />
                        </td>
                        <td className="p-2 font-bold text-slate-800 text-center">
                          {(line.qty * line.unitPrice).toLocaleString()}
                        </td>
                        <td className="p-2 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-rose-500 hover:text-rose-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notes and Total */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / رقم بوليصة الشحن</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="رقم إذن التسليم أو سيارة التوريد..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm"
                />
              </div>

              <div className="text-left flex flex-col justify-center">
                <span className="text-xs text-slate-500 font-semibold">إجمالي إذن التوريد:</span>
                <span className="text-2xl font-black text-purple-700">{subtotal.toLocaleString()} ج.م</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50"
              >
                {loading ? 'جاري الحفظ...' : 'حفظ إذن استلام المورد وتحديث المخزون'}
              </button>
            </div>
          </form>
        )}

        {(activeTab === 'customer_payment' || activeTab === 'supplier_payment') && (
          <form onSubmit={handlePaymentSubmit} className="space-y-4 max-w-lg mx-auto">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {activeTab === 'customer_payment' ? 'العميل المسدد *' : 'المورد المستحق *'}
              </label>
              <select
                value={selectedPartyId}
                onChange={(e) => setSelectedPartyId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none"
                required
              >
                <option value="">-- اختر الطرف --</option>
                {parties
                  .filter((p) => (activeTab === 'customer_payment' ? p.is_customer : p.is_supplier))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ السند (ج.م) *</label>
              <input
                type="number"
                step="any"
                min="1"
                value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة السداد</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              >
                <option value="cash">نقداً (الصندوق الرئيسي)</option>
                <option value="bank_transfer">تحويل بنكي</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات / بيان السند</label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="تحت الحساب، أو دفعة من الفاتورة..."
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-colors ${
                activeTab === 'customer_payment' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {loading ? 'جاري التسجيل...' : 'حفظ وترحيل السند المالي'}
            </button>
          </form>
        )}

        {activeTab === 'expense' && (
          <form onSubmit={handleExpenseSubmit} className="space-y-4 max-w-lg mx-auto">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تصنيف المصروف *</label>
              <select
                value={expenseCategoryId}
                onChange={(e) => setExpenseCategoryId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                required
              >
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_ar}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ المصروف (ج.م) *</label>
              <input
                type="number"
                step="any"
                min="1"
                value={expenseAmount || ''}
                onChange={(e) => setExpenseAmount(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-rose-700"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الجهة المنصرف إليها (المستلم)</label>
              <input
                type="text"
                value={expensePayee}
                onChange={(e) => setExpensePayee(e.target.value)}
                placeholder="اسم المستلم أو الشركة..."
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">البيان والتفاصيل</label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="صيانة، إكراميات، بوفيه..."
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-md transition-colors"
            >
              {loading ? 'جاري التسجيل...' : 'صرف وترحيل المصروف'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
