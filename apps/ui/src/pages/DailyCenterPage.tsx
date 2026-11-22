import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { NumericInput } from '../components/NumericInput';
import {
  ShoppingCart,
  ArrowDownLeft,
  Truck,
  ArrowUpRight,
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
} from 'lucide-react';

export const DailyCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sale' | 'customer_payment' | 'purchase' | 'supplier_payment' | 'expense'>('sale');
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states - Sales
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [handlingFee, setHandlingFee] = useState<number>(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [amountPaidNow, setAmountPaidNow] = useState<number>(0);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('');
  const [shipmentDestination, setShipmentDestination] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [saleNotes, setSaleNotes] = useState('');
  const [lines, setLines] = useState<Array<{ productId: string; qty: number; unitPrice: number; catalogPrice: number; unitName: string; discountAmount: number }>>([
    { productId: '', qty: 1, unitPrice: 0, catalogPrice: 0, unitName: 'طن', discountAmount: 0 },
  ]);

  // Form states - Payment
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNotes, setPaymentNotes] = useState('');

  // Form states - Expense
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');

  useEffect(() => {
    loadMasterData();
    // Restore draft invoice if saved
    try {
      const saved = localStorage.getItem('fludo_daily_sales_draft');
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.selectedPartyId) setSelectedPartyId(draft.selectedPartyId);
        if (draft.handlingFee !== undefined) setHandlingFee(draft.handlingFee);
        if (draft.invoiceDiscount !== undefined) setInvoiceDiscount(draft.invoiceDiscount);
        if (draft.amountPaidNow !== undefined) setAmountPaidNow(draft.amountPaidNow);
        if (draft.selectedCashAccountId) setSelectedCashAccountId(draft.selectedCashAccountId);
        if (draft.shipmentDestination) setShipmentDestination(draft.shipmentDestination);
        if (draft.driverName) setDriverName(draft.driverName);
        if (draft.lines && Array.isArray(draft.lines) && draft.lines.length > 0) setLines(draft.lines);
      }
    } catch {}
  }, []);

  // Auto-save draft on any changes
  useEffect(() => {
    try {
      if (lines.length > 0 && (selectedPartyId || lines[0].productId || amountPaidNow > 0 || handlingFee > 0)) {
        localStorage.setItem(
          'fludo_daily_sales_draft',
          JSON.stringify({ selectedPartyId, handlingFee, invoiceDiscount, amountPaidNow, selectedCashAccountId, shipmentDestination, driverName, lines })
        );
      }
    } catch {}
  }, [selectedPartyId, handlingFee, invoiceDiscount, amountPaidNow, selectedCashAccountId, shipmentDestination, driverName, lines]);

  const loadMasterData = async () => {
    try {
      const [pts, prods, cats, accounts, uList] = await Promise.all([
        api.getParties(),
        api.getProducts(),
        api.getExpenseCategories(),
        api.getCashAccounts(),
        api.getUnits().catch(() => []),
      ]);
      setParties(pts);
      setProducts(prods);
      setExpenseCategories(cats);
      setCashAccounts(accounts);
      setUnits(uList);
      if (cats.length > 0) setExpenseCategoryId(cats[0].id);
      if (accounts.length > 0 && !selectedCashAccountId) {
        setSelectedCashAccountId(accounts[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addLine = () => {
    setLines([...lines, { productId: '', qty: 1, unitPrice: 0, catalogPrice: 0, unitName: 'طن', discountAmount: 0 }]);
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
      updated[idx].unitName = prod?.unit_name || updated[idx].unitName || 'طن';
    } else if (field === 'qty') {
      updated[idx].qty = parseFloat(val) || 0;
    } else if (field === 'unitPrice') {
      updated[idx].unitPrice = parseFloat(val) || 0;
    } else if (field === 'unitName') {
      updated[idx].unitName = val;
    } else if (field === 'discountAmount') {
      updated[idx].discountAmount = Math.max(0, parseFloat(val) || 0);
    }
    setLines(updated);
  };

  const linesTotal = lines.reduce((acc, l) => acc + (l.qty * l.unitPrice - (l.discountAmount || 0)), 0);
  const grandTotal = Math.max(0, linesTotal + (handlingFee || 0) - (invoiceDiscount || 0));

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) return setErrorMsg('يرجى اختيار العميل');
    if (lines.length === 0 || !lines[0].productId) return setErrorMsg('يرجى إضافة صنف واحد على الأقل');

    if (amountPaidNow > 0) {
      if (cashAccounts.length === 0) {
        return setErrorMsg('يجب إضافة خزينة أو حساب أولاً لتسجيل دفعة مسددة نقداً');
      }
      if (!selectedCashAccountId) {
        return setErrorMsg('اختر الخزينة/المحفظة/الحساب للمبلغ المسدد نقداً');
      }
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.createSalesInvoice({
        partyId: selectedPartyId,
        invoiceDate,
        handlingFee,
        discountAmount: invoiceDiscount,
        amountPaidNow,
        cashAccountId: amountPaidNow > 0 ? selectedCashAccountId : undefined,
        destination: shipmentDestination.trim() || undefined,
        driverId: driverName.trim() ? undefined : undefined,
        notes: [
          saleNotes.trim(),
          driverName.trim() ? `السائق: ${driverName.trim()}` : '',
          vehiclePlate.trim() ? `رقم السيارة: ${vehiclePlate.trim()}` : '',
        ].filter(Boolean).join(' | ') || undefined,
        autoApprove: true,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitName: l.unitName,
          discountAmount: l.discountAmount || 0,
        })),
      });
      setSuccessMsg(`تم إنشاء واعتماد الفاتورة بنجاح رقم المعاملة: ${res.invoiceId}`);
      try {
        localStorage.removeItem('fludo_daily_sales_draft');
      } catch {}
      // Reset
      setLines([{ productId: '', qty: 1, unitPrice: 0, catalogPrice: 0, unitName: 'طن', discountAmount: 0 }]);
      setHandlingFee(0);
      setInvoiceDiscount(0);
      setAmountPaidNow(0);
      setShipmentDestination('');
      setDriverName('');
      setVehiclePlate('');
      setSaleNotes('');
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
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitName: l.unitName,
          discountAmount: l.discountAmount || 0,
        })),
      });
      setSuccessMsg(`تم تسجيل إذن استلام المورد بنجاح رقم: ${res.invoiceId}`);
      // Reset
      setLines([{ productId: '', qty: 1, unitPrice: 0, catalogPrice: 0, unitName: 'طن', discountAmount: 0 }]);
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

    if (cashAccounts.length === 0) {
      return setErrorMsg('يجب إضافة خزينة أو حساب أولاً لتسجيل السند المالي');
    }
    if (!selectedCashAccountId) {
      return setErrorMsg('اختر الخزينة/المحفظة/الحساب');
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.recordPayment({
        paymentType: activeTab === 'customer_payment' ? 'customer_receipt' : 'supplier_payment',
        partyId: selectedPartyId || undefined,
        cashAccountId: selectedCashAccountId,
        paymentDate: invoiceDate,
        amount: paymentAmount,
        method: 'cash',
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

    if (cashAccounts.length === 0) {
      return setErrorMsg('يجب إضافة خزينة أو حساب أولاً لتسجيل المصروف');
    }
    if (!selectedCashAccountId) {
      return setErrorMsg('اختر الخزينة/المحفظة/الحساب');
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.recordExpense({
        categoryId: expenseCategoryId,
        cashAccountId: selectedCashAccountId,
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
      {/* Unit Suggestions Datalist */}
      <datalist id="unit-suggestions">
        {units.map((u) => (
          <option key={u.id} value={u.name} />
        ))}
        <option value="طن" />
        <option value="م³" />
        <option value="شكاره" />
        <option value="الف طوبه" />
        <option value="القطعه" />
        <option value="ساعة" />
        <option value="يوم" />
      </datalist>

      {/* Cash Accounts Missing Warning Banner */}
      {cashAccounts.length === 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs sm:text-sm">
              <span className="font-bold">تنبيه إلزامي: </span>
              لا يوجد أي خزينة أو حساب مالي مسجل في النظام حتى الآن. يلزم إضافة خزينة واحدة على الأقل قبل تسجيل المعاملات النقدية.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('fludo_navigate_section', { detail: 'treasury' }));
            }}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors"
          >
            إضافة خزينة الآن
          </button>
        </div>
      )}

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
                        {p.code ? `[${p.code}] ` : ''}{p.name} {p.customer_balance > 0 ? `(عليه: ${p.customer_balance} ج.م)` : ''}
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

            {/* Shipment Transport Details */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الوجهة (راح فين)</label>
                <input
                  type="text"
                  value={shipmentDestination}
                  onChange={(e) => setShipmentDestination(e.target.value)}
                  placeholder="موقع العمل / العنوان / المدينة..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم السائق</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="السائق المسؤول..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم السيارة / المقطورة</label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  placeholder="رقم اللوحة أو وصف السيارة..."
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs"
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
                      <th className="p-3 w-28">الوحدة</th>
                      <th className="p-3 w-24">الكمية</th>
                      <th className="p-3 w-28">السعر (ج.م)</th>
                      <th className="p-3 w-24">خصم السطر</th>
                      <th className="p-3 w-28">الإجمالي</th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((line, idx) => {
                      const lineNet = Math.max(0, line.qty * line.unitPrice - (line.discountAmount || 0));
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2">
                            <select
                              value={line.productId}
                              onChange={(e) => updateLine(idx, 'productId', e.target.value)}
                              className="w-full border border-slate-300 rounded p-1.5 text-xs sm:text-sm"
                              required
                            >
                              <option value="">-- اختر الصنف --</option>
                              {products.map((p) => (
                                <option key={p.product_id} value={p.product_id}>
                                  {p.product_code} - {p.product_name} (سعر اليوم: {p.default_sale_price})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              list="unit-suggestions"
                              value={line.unitName}
                              onChange={(e) => updateLine(idx, 'unitName', e.target.value)}
                              className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold"
                              placeholder="طن / م³"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0.001"
                              value={line.qty}
                              onChange={(e) => updateLine(idx, 'qty', e.target.value)}
                              className="w-full border border-slate-300 rounded p-1.5 text-xs sm:text-sm text-center font-bold"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(idx, 'unitPrice', e.target.value)}
                              className={`w-full border rounded p-1.5 text-xs sm:text-sm text-center font-bold ${
                                line.unitPrice !== line.catalogPrice && line.catalogPrice > 0
                                  ? 'border-amber-400 bg-amber-50/40 text-amber-900'
                                  : 'border-slate-300'
                              }`}
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={line.discountAmount || ''}
                              onChange={(e) => updateLine(idx, 'discountAmount', e.target.value)}
                              placeholder="0"
                              className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold text-rose-600"
                            />
                          </td>
                          <td className="p-2 font-bold text-slate-800 text-center text-xs sm:text-sm">
                            {lineNet.toLocaleString()}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Summary & Cash Account */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مصاريف المشال والتحميل (ج.م)</label>
                <NumericInput
                  value={handlingFee}
                  onChange={setHandlingFee}
                  className="w-full border-slate-300 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">خصم إجمالي إضافي (ج.م)</label>
                <NumericInput
                  value={invoiceDiscount}
                  onChange={setInvoiceDiscount}
                  className="w-full border-slate-300 text-center font-bold text-rose-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسدد نقداً الآن (ج.م)</label>
                <NumericInput
                  value={amountPaidNow}
                  onChange={setAmountPaidNow}
                  className="w-full border-slate-300 text-center font-bold text-emerald-700"
                />
              </div>

              <div className="text-left flex flex-col justify-center">
                <span className="text-xs text-slate-500 font-semibold">إجمالي الفاتورة الصافي:</span>
                <span className="text-2xl font-black text-blue-700">{grandTotal.toLocaleString()} ج.م</span>
              </div>
            </div>

            {/* Mandatory Cash Account if paid now */}
            {amountPaidNow > 0 && (
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs shrink-0">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <span>الخزينة / المحفظة المستلمة *</span>
                </div>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full border border-blue-300 rounded-lg p-2 text-xs font-bold bg-white outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- اختر الخزينة أو الحساب المستلم --</option>
                  {cashAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.kind_label || acc.kind}) - رصيد: {Number(acc.current_balance || 0).toLocaleString()} ج.م
                    </option>
                  ))}
                </select>
              </div>
            )}

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
                      {p.code ? `[${p.code}] ` : ''}{p.name} {p.supplier_balance > 0 ? `(له: ${p.supplier_balance} ج.م)` : ''}
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
                      <th className="p-3 w-28">الوحدة</th>
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
                                {p.product_code} - {p.product_name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            list="unit-suggestions"
                            value={line.unitName}
                            onChange={(e) => updateLine(idx, 'unitName', e.target.value)}
                            className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold"
                            placeholder="طن / م³"
                          />
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
                <span className="text-2xl font-black text-purple-700">{linesTotal.toLocaleString()} ج.م</span>
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
                      {p.code ? `[${p.code}] ` : ''}{p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ السند (ج.م) *</label>
              <NumericInput
                value={paymentAmount}
                onChange={setPaymentAmount}
                className="w-full p-2.5 text-lg font-bold text-center border-slate-300"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>الخزينة / المحفظة / الحساب البنكي *</span>
              </label>
              <select
                value={selectedCashAccountId}
                onChange={(e) => setSelectedCashAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                required
              >
                <option value="">-- اختر الخزينة أو الحساب --</option>
                {cashAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.kind_label || acc.kind}) - رصيد: {Number(acc.current_balance || 0).toLocaleString()} ج.م
                  </option>
                ))}
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
              <NumericInput
                value={expenseAmount}
                onChange={setExpenseAmount}
                className="w-full p-2.5 text-lg font-bold text-center text-rose-700 border-slate-300"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-rose-600" />
                <span>الخزينة المنصرف منها *</span>
              </label>
              <select
                value={selectedCashAccountId}
                onChange={(e) => setSelectedCashAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500"
                required
              >
                <option value="">-- اختر الخزينة أو الحساب --</option>
                {cashAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.kind_label || acc.kind}) - رصيد: {Number(acc.current_balance || 0).toLocaleString()} ج.م
                  </option>
                ))}
              </select>
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
