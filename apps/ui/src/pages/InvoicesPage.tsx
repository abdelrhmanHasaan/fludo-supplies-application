import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  FileText,
  Printer,
  Search,
  X,
  ChevronDown,
  ChevronLeft,
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  DollarSign,
  Ban,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { ManagerPinModal } from '../components/ManagerPinModal';

export const InvoicesPage: React.FC = () => {
  const { company, logoLetter } = useCompany();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'purchase' | 'return'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Year/Month Collapse state
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});

  // Cancellation & PIN
  const [showPinModal, setShowPinModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState('');

  useEffect(() => {
    loadInvoices();
  }, [filterType, filterStatus, startDate, endDate]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getInvoicesRegistry({
        doc_type: filterType !== 'all' ? filterType : undefined,
        payment_status: filterStatus !== 'all' ? filterStatus : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        search: searchQuery.trim() || undefined,
      });
      setInvoices(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadInvoices();
  };

  const handleOpenInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setModalLoading(true);
    try {
      if (inv.doc_kind === 'purchase') {
        setInvoiceDetails({
          invoice: {
            ...inv,
            previous_balance_snapshot: 0,
            total_due: inv.net_total,
            total_paid: inv.paid_amount,
            remaining_due: inv.remaining_amount,
          },
          lines: [],
        });
      } else {
        const res = await api.getSalesInvoice(inv.id);
        setInvoiceDetails(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const printInvoice = () => {
    if ((window as any).electronAPI?.print) {
      (window as any).electronAPI.print();
    } else {
      window.print();
    }
  };

  const handleTriggerCancel = (invId: string) => {
    setCancelTargetId(invId);
    setShowPinModal(true);
  };

  const handleApprovalGranted = async (approvalId: string) => {
    setShowPinModal(false);
    try {
      await api.cancelSalesInvoice(cancelTargetId, approvalId, 'إلغاء بناء على إذن المدير العام');
      alert('تم إلغاء الفاتورة وعكس القيود والمخزون بنجاح!');
      setSelectedInvoice(null);
      loadInvoices();
    } catch (err: any) {
      alert(err.message || 'فشل إلغاء الفاتورة');
    }
  };

  // Group invoices by Year -> Month
  const currentMonthKey = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const groupedData = useMemo(() => {
    const yearsMap: Record<string, { year: string; totalNet: number; count: number; months: Record<string, { month: string; monthLabel: string; invoices: any[]; totalNet: number; totalPaid: number; totalRemaining: number }> }> = {};

    for (const inv of invoices) {
      const dateStr = inv.invoice_date_str || (inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : '2026-01-01');
      const year = dateStr.slice(0, 4);
      const monthKey = dateStr.slice(0, 7);

      if (!yearsMap[year]) {
        yearsMap[year] = { year, totalNet: 0, count: 0, months: {} };
      }
      yearsMap[year].totalNet += inv.net_total;
      yearsMap[year].count += 1;

      if (!yearsMap[year].months[monthKey]) {
        const d = new Date(`${monthKey}-01`);
        const monthLabel = isNaN(d.getTime()) ? monthKey : d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        yearsMap[year].months[monthKey] = {
          month: monthKey,
          monthLabel,
          invoices: [],
          totalNet: 0,
          totalPaid: 0,
          totalRemaining: 0,
        };
      }

      const mObj = yearsMap[year].months[monthKey];
      mObj.invoices.push(inv);
      mObj.totalNet += inv.net_total;
      mObj.totalPaid += inv.paid_amount;
      mObj.totalRemaining += inv.remaining_amount;
    }

    const sortedYears = Object.keys(yearsMap).sort((a, b) => b.localeCompare(a));
    return sortedYears.map((y) => {
      const yearObj = yearsMap[y];
      const sortedMonths = Object.keys(yearObj.months)
        .sort((a, b) => b.localeCompare(a))
        .map((m) => yearObj.months[m]);
      return {
        ...yearObj,
        monthsList: sortedMonths,
      };
    });
  }, [invoices]);

  const toggleYear = (year: string) => {
    setCollapsedYears((prev) => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonth = (monthKey: string) => {
    setCollapsedMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>مسددة</span>
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>مسددة جزئياً</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
            <Ban className="w-3 h-3 text-slate-500" />
            <span>ملغاة</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
            <AlertCircle className="w-3 h-3 text-rose-600" />
            <span>غير مسددة</span>
          </span>
        );
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>سجل الفواتير وعروض الطباعة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            سجل شامل لفواتير المبيعات، المشتريات، والمرتجعات مجمعة حسب السنة والشهر
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3.5 py-1.5 bg-blue-50 text-blue-800 rounded-xl text-xs font-bold border border-blue-200">
            إجمالي الفواتير المسجلة: {invoices.length}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الفاتورة (A#### / B####) أو اسم الطرف..."
              className="w-full pr-9 pl-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            />
          </div>

          {/* Doc Kind Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="border border-slate-300 rounded-xl py-2 px-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="all">كل الأنواع</option>
              <option value="sale">فواتير مبيعات</option>
              <option value="purchase">فواتير مشتريات</option>
              <option value="return">مرتجعات</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="text-xs">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="border border-slate-300 rounded-xl py-2 px-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            >
              <option value="all">كل حالات السداد</option>
              <option value="paid">مسددة بالكامل</option>
              <option value="partial">مسددة جزئياً</option>
              <option value="unpaid">غير مسددة</option>
              <option value="cancelled">ملغاة</option>
            </select>
          </div>

          {/* Dates */}
          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-slate-300 rounded-xl py-1.5 px-2.5 text-xs outline-none"
              title="من تاريخ"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-slate-300 rounded-xl py-1.5 px-2.5 text-xs outline-none"
              title="إلى تاريخ"
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            تصفية
          </button>
        </form>
      </div>

      {/* Invoices Grouped List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 font-bold text-sm">جاري تحميل سجل الفواتير...</div>
      ) : groupedData.length === 0 ? (
        <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 font-bold">
          لا توجد فواتير مطابقة لمعايير البحث
        </div>
      ) : (
        <div className="space-y-4">
          {groupedData.map((yGroup) => {
            const isYearCollapsed = !!collapsedYears[yGroup.year];
            return (
              <div key={yGroup.year} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {/* Year Header */}
                <button
                  type="button"
                  onClick={() => toggleYear(yGroup.year)}
                  className="w-full flex items-center justify-between p-4 bg-slate-900 text-white font-black hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">سنة {yGroup.year}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/20 text-blue-200 font-bold">
                      {yGroup.count} فاتورة
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-emerald-400">
                      إجمالي: {yGroup.totalNet.toLocaleString()} ج.م
                    </span>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isYearCollapsed ? '-rotate-90' : ''}`} />
                  </div>
                </button>

                {/* Months inside Year */}
                {!isYearCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {yGroup.monthsList.map((mGroup) => {
                      const isMonthCollapsed = collapsedMonths[mGroup.month] ?? (mGroup.month !== currentMonthKey);
                      return (
                        <div key={mGroup.month} className="bg-white">
                          {/* Month Header */}
                          <button
                            type="button"
                            onClick={() => toggleMonth(mGroup.month)}
                            className="w-full flex items-center justify-between px-5 py-3 bg-slate-100/80 hover:bg-slate-200/70 text-slate-800 font-bold text-xs transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-blue-600" />
                              <span className="text-sm">{mGroup.monthLabel}</span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                {mGroup.invoices.length} فاتورة
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-bold">
                              <span>الصافي: <strong className="text-blue-700">{mGroup.totalNet.toLocaleString()}</strong> ج.م</span>
                              <span>المسدد: <strong className="text-emerald-700">{mGroup.totalPaid.toLocaleString()}</strong> ج.م</span>
                              <span>المتبقي: <strong className="text-rose-700">{mGroup.totalRemaining.toLocaleString()}</strong> ج.م</span>
                              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isMonthCollapsed ? '-rotate-90' : ''}`} />
                            </div>
                          </button>

                          {/* Invoices Table inside Month */}
                          {!isMonthCollapsed && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                  <tr>
                                    <th className="p-3">رقم الفاتورة</th>
                                    <th className="p-3">التاريخ / الوقت</th>
                                    <th className="p-3">الطرف</th>
                                    <th className="p-3">الأصناف</th>
                                    <th className="p-3 text-center">الخصم</th>
                                    <th className="p-3 text-center">الصافي</th>
                                    <th className="p-3 text-center">المدفوع</th>
                                    <th className="p-3 text-center">المتبقي</th>
                                    <th className="p-3 text-center">الحالة</th>
                                    <th className="p-3">النقل / السائق</th>
                                    <th className="p-3 text-center">إجراءات</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {mGroup.invoices.map((inv) => (
                                    <tr key={inv.id} className="hover:bg-blue-50/40 transition-colors">
                                      <td className="p-3 font-mono font-bold text-slate-800">
                                        <div className="flex items-center gap-1.5">
                                          {inv.doc_kind === 'sale' ? (
                                            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                                          ) : (
                                            <ArrowDownLeft className="w-3.5 h-3.5 text-purple-600" />
                                          )}
                                          <span>{inv.invoice_no}</span>
                                        </div>
                                      </td>
                                      <td className="p-3 text-slate-600">
                                        <div>{inv.invoice_date_str}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{inv.invoice_time_str}</div>
                                      </td>
                                      <td className="p-3 font-bold text-slate-800">
                                        <div>{inv.party_name}</div>
                                        {inv.party_phone && <div className="text-[10px] text-slate-400 font-mono">{inv.party_phone}</div>}
                                      </td>
                                      <td className="p-3 text-slate-600 max-w-xs truncate" title={inv.items_summary}>
                                        {inv.items_summary || '—'}
                                      </td>
                                      <td className="p-3 text-center font-bold text-rose-600">
                                        {inv.discount_amount > 0 ? `${inv.discount_amount.toLocaleString()}` : '—'}
                                      </td>
                                      <td className="p-3 text-center font-black text-slate-900">
                                        {inv.net_total.toLocaleString()}
                                      </td>
                                      <td className="p-3 text-center font-bold text-emerald-700">
                                        {inv.paid_amount.toLocaleString()}
                                      </td>
                                      <td className="p-3 text-center font-bold text-rose-700">
                                        {inv.remaining_amount.toLocaleString()}
                                      </td>
                                      <td className="p-3 text-center">
                                        {renderStatusBadge(inv.computed_payment_status || inv.status)}
                                      </td>
                                      <td className="p-3 text-[11px] text-slate-600">
                                        {inv.destination || inv.driver_name ? (
                                          <div>
                                            {inv.destination && <div>الوجهة: {inv.destination}</div>}
                                            {inv.driver_name && <div>السائق: {inv.driver_name}</div>}
                                          </div>
                                        ) : (
                                          <span className="text-slate-400">—</span>
                                        )}
                                      </td>
                                      <td className="p-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenInvoice(inv)}
                                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors"
                                          >
                                            عرض وطباعة
                                          </button>
                                          {inv.doc_kind === 'sale' && inv.status !== 'cancelled' && (
                                            <button
                                              type="button"
                                              onClick={() => handleTriggerCancel(inv.id)}
                                              className="p-1 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors"
                                              title="إلغاء الفاتورة (بإذن المدير)"
                                            >
                                              <Ban className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Invoice Details and Print Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            {/* Modal Controls Header */}
            <div className="sticky top-0 bg-slate-900 text-white p-4 px-6 flex items-center justify-between z-10 print:hidden">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">
                  فاتورة {selectedInvoice.doc_kind === 'sale' ? 'مبيعات' : 'مشتريات'} رقم: {selectedInvoice.invoice_no}
                </span>
                {renderStatusBadge(selectedInvoice.computed_payment_status || selectedInvoice.status)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printInvoice}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الفاتورة</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedInvoice(null); setInvoiceDetails(null); }}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content Body */}
            <div className="p-8 print:p-0 space-y-6 text-right">
              {modalLoading ? (
                <div className="py-16 text-center text-slate-500 font-bold">جاري تحميل تفاصيل الفاتورة...</div>
              ) : (
                <>
                  {/* Company & Invoice Top Branding */}
                  <div className="flex items-start justify-between border-b pb-6 border-slate-200">
                    <div>
                      <div className="text-xl font-black text-slate-900">{company.name_ar}</div>
                      {company.owner_name && (
                        <div className="text-xs text-slate-500 font-bold mt-0.5">المالك: {company.owner_name}</div>
                      )}
                      <div className="text-xs text-slate-600 mt-1">{company.tagline || 'تجارة وتوريد مواد البناء والتشييد'}</div>
                      <div className="text-xs text-slate-500 mt-1">{company.address || 'العنوان الرئيسي'} - {company.phones}</div>
                    </div>

                    <div className="text-left space-y-1">
                      <div className="text-2xl font-black text-blue-700 font-mono">{selectedInvoice.invoice_no}</div>
                      <div className="text-xs text-slate-500">التاريخ: {selectedInvoice.invoice_date_str}</div>
                      <div className="text-xs text-slate-500">الوقت: {selectedInvoice.invoice_time_str}</div>
                    </div>
                  </div>

                  {/* Customer / Supplier Info Card */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold mb-1">اسم الطرف:</span>
                      <span className="font-black text-slate-800 text-sm">{selectedInvoice.party_name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold mb-1">رقم الهاتف:</span>
                      <span className="font-bold text-slate-700 font-mono">{selectedInvoice.party_phone || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold mb-1">الوجهة / موقع التسليم:</span>
                      <span className="font-bold text-slate-700">{selectedInvoice.destination || 'استلام ساحة التوريد'}</span>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div className="border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3 w-12 text-center">م</th>
                          <th className="p-3">بيان الصنف</th>
                          <th className="p-3 w-24 text-center">الوحدة</th>
                          <th className="p-3 w-24 text-center">الكمية</th>
                          <th className="p-3 w-28 text-center">السعر</th>
                          <th className="p-3 w-24 text-center">الخصم</th>
                          <th className="p-3 w-28 text-center">الإجمالي الصافي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {invoiceDetails?.lines && invoiceDetails.lines.length > 0 ? (
                          invoiceDetails.lines.map((l: any, i: number) => {
                            const lineDiscount = parseFloat(l.discount_amount || '0');
                            const netLine = Math.max(0, l.qty * l.unit_price - lineDiscount);
                            return (
                              <tr key={l.id || i}>
                                <td className="p-3 text-center font-bold text-slate-400">{i + 1}</td>
                                <td className="p-3 font-bold text-slate-800">{l.product_name || l.notes}</td>
                                <td className="p-3 text-center text-slate-600">{l.unit_name || 'وحدة'}</td>
                                <td className="p-3 text-center font-bold">{l.qty}</td>
                                <td className="p-3 text-center">{l.unit_price.toLocaleString()}</td>
                                <td className="p-3 text-center text-rose-600">{lineDiscount > 0 ? lineDiscount.toLocaleString() : '—'}</td>
                                <td className="p-3 text-center font-bold text-slate-900">{netLine.toLocaleString()}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-slate-500 font-bold">
                              {selectedInvoice.items_summary || 'تفاصيل الأصناف'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Totals Calculation Box */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-bold text-center">
                    <div>
                      <span className="text-slate-500 block mb-1">الخصومات:</span>
                      <span className="text-sm font-black text-rose-600">
                        {selectedInvoice.discount_amount.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">صافي الفاتورة:</span>
                      <span className="text-sm font-black text-slate-900">
                        {selectedInvoice.net_total.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">المسدد:</span>
                      <span className="text-sm font-black text-emerald-700">
                        {selectedInvoice.paid_amount.toLocaleString()} ج.م
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-1">المتبقي:</span>
                      <span className="text-sm font-black text-rose-700">
                        {selectedInvoice.remaining_amount.toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>

                  {/* Shipment / Transport Notice */}
                  {(selectedInvoice.driver_name || selectedInvoice.vehicle_name) && (
                    <div className="text-xs text-slate-600 bg-blue-50/60 p-3 rounded-xl border border-blue-100 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>بيانات النقل: السائق {selectedInvoice.driver_name || '—'} | السيارة: {selectedInvoice.vehicle_name || '—'}</span>
                    </div>
                  )}

                  {/* Signature Footer */}
                  <div className="pt-8 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
                    <div>توقيع المستلم: ................................</div>
                    <div>الختم وتوقيع الإدارة: ................................</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manager PIN Modal for Cancellation */}
      <ManagerPinModal
        isOpen={showPinModal}
        defaultTable="sales_invoices"
        defaultId={cancelTargetId}
        onApprovalGranted={handleApprovalGranted}
        onClose={() => setShowPinModal(false)}
      />
    </div>
  );
};
