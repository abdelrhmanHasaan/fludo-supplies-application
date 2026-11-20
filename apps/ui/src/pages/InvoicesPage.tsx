import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import { FileText, Printer, Search, X, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import { ManagerPinModal } from '../components/ManagerPinModal';
import { SmartDeleteModal } from '../components/SmartDeleteModal';

export const InvoicesPage: React.FC = () => {
  const { company, logoLetter } = useCompany();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Cancellation & PIN
  const [showPinModal, setShowPinModal] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState('');

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.getSalesInvoices();
      setInvoices(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInvoice = async (inv: any) => {
    setSelectedInvoice(inv);
    setModalLoading(true);
    try {
      const res = await api.getSalesInvoice(inv.id);
      setInvoiceDetails(res);
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>سجل فواتير المبيعات ونماذج الطباعة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تسلسل رقمي غير قابل للتكرار (A####) مع خانة الرصيد السابق التراكمي
          </p>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">رقم الفاتورة</th>
              <th className="p-4">التاريخ</th>
              <th className="p-4">العميل</th>
              <th className="p-4 text-center">إجمالي البضاعة</th>
              <th className="p-4 text-center">المشال</th>
              <th className="p-4 text-center">الرصيد السابق</th>
              <th className="p-4 text-center">الإجمالي المستحق</th>
              <th className="p-4 text-center">الحالة</th>
              <th className="p-4 text-center">عرض / طباعة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  جاري تحميل الفواتير...
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400">
                  لا توجد فواتير مسجلة حتى الآن
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-mono font-bold text-blue-700">{inv.invoice_no}</td>
                  <td className="p-4 font-mono text-xs">{inv.invoice_date}</td>
                  <td className="p-4 font-bold text-slate-800">{inv.party_name}</td>
                  <td className="p-4 text-center font-bold">{inv.lines_total.toLocaleString()}</td>
                  <td className="p-4 text-center text-xs text-slate-500">
                    {inv.handling_fee > 0 ? `${inv.handling_fee.toLocaleString()}` : '0'}
                  </td>
                  <td className="p-4 text-center font-bold text-slate-600">
                    {inv.previous_balance_snapshot.toLocaleString()}
                  </td>
                  <td className="p-4 text-center font-black text-blue-900">
                    {inv.total_due.toLocaleString()} ج.م
                  </td>
                  <td className="p-4 text-center">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        inv.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : inv.status === 'cancelled'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {inv.status === 'approved' ? 'معتمدة' : inv.status === 'cancelled' ? 'ملغاة' : 'مسودة'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenInvoice(inv)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>معاينة وطباعة</span>
                      </button>
                      <button
                        onClick={() => setDeleteTarget(inv)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="حذف الفاتورة (تحقق ثنائي)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Invoice Modal (Exact Al-Reda Letterhead Styling) */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Top Toolbar (no-print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-lg">فاتورة رقم: {selectedInvoice.invoice_no}</h3>
                <p className="text-xs text-slate-400">العميل: {selectedInvoice.party_name}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedInvoice.status === 'approved' && (
                  <button
                    onClick={() => handleTriggerCancel(selectedInvoice.id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>إلغاء الفاتورة (بإذن المدير)</span>
                  </button>
                )}
                <button
                  onClick={printInvoice}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الفاتورة (A4/A5)</span>
                </button>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 overflow-y-auto flex-1 bg-white space-y-6 print:p-0">
              {/* Official Letterhead */}
              <div className="border-4 border-double border-slate-800 p-6 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                  <div className="text-right">
                    <h1 className="text-3xl font-black text-slate-900 tracking-wide">{company.name_ar}</h1>
                    <p className="text-sm font-bold text-slate-700">{company.tagline || 'مواد البناء والتوريدات العامة'}</p>
                    <p className="text-xs text-slate-600 mt-1">{company.address || 'المركز الرئيسي'}</p>
                  </div>
                  <div className="w-16 h-16 rounded-2xl border-2 border-slate-800 flex items-center justify-center font-black text-2xl text-slate-800 bg-slate-50">
                    {logoLetter}
                  </div>
                  <div className="text-left text-xs font-semibold text-slate-700 space-y-0.5 max-w-[200px] truncate">
                    {company.phones ? (
                      <p className="font-mono text-[11px] whitespace-pre-line">{company.phones}</p>
                    ) : (
                      <p>مبيعات وتوريدات</p>
                    )}
                  </div>
                </div>

                {/* Invoice Meta */}
                <div className="grid grid-cols-2 gap-4 text-xs font-bold bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div>
                    <span className="text-slate-500 ml-2">المطلوب من السيد /</span>
                    <span className="text-slate-900 text-sm font-black">{selectedInvoice.party_name}</span>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-slate-500 ml-2">رقم الفاتورة:</span>
                    <span className="text-blue-900 text-base font-black">{selectedInvoice.invoice_no}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 ml-2">العنوان / الموقع:</span>
                    <span className="text-slate-800">{selectedInvoice.party_address || 'كرداسة'}</span>
                  </div>
                  <div className="text-left font-mono">
                    <span className="text-slate-500 ml-2">التاريخ:</span>
                    <span className="text-slate-800">{selectedInvoice.invoice_date}</span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-right border-collapse">
                    <thead className="bg-slate-800 text-white font-bold">
                      <tr>
                        <th className="p-2 border-l border-slate-700 w-10 text-center">م</th>
                        <th className="p-2 border-l border-slate-700">الصنف</th>
                        <th className="p-2 border-l border-slate-700 w-20 text-center">الوحدة</th>
                        <th className="p-2 border-l border-slate-700 w-20 text-center">الكود</th>
                        <th className="p-2 border-l border-slate-700 w-24 text-center">الكمية</th>
                        <th className="p-2 border-l border-slate-700 w-28 text-center">سعر الوحدة</th>
                        <th className="p-2 text-center w-32">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {invoiceDetails?.lines?.map((line: any, idx: number) => (
                        <tr key={line.id} className="font-semibold">
                          <td className="p-2 border-l border-slate-200 text-center font-mono">{idx + 1}</td>
                          <td className="p-2 border-l border-slate-200 font-bold">{line.product_name}</td>
                          <td className="p-2 border-l border-slate-200 text-center">{line.unit_name || 'وحدة'}</td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono text-[11px] text-blue-800">
                            {line.product_code}
                          </td>
                          <td className="p-2 border-l border-slate-200 text-center font-bold font-mono">
                            {line.qty}
                          </td>
                          <td className="p-2 border-l border-slate-200 text-center font-mono">
                            {line.unit_price.toLocaleString()}
                          </td>
                          <td className="p-2 text-center font-black font-mono">
                            {line.line_total.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Carried Balance & Financial Summary Grid (Workbook §1.2 replica) */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="border border-slate-300 p-3 rounded-lg text-xs space-y-2 bg-slate-50/50">
                    <p className="font-bold text-slate-700">ملاحظات الفاتورة والتسليم:</p>
                    <p className="text-slate-600 min-h-[40px] text-[11px]">
                      {selectedInvoice.notes || 'البضاعة خرجت بحالة جيدة بحوزة السائق.'}
                    </p>
                  </div>

                  <div className="border-2 border-slate-800 rounded-lg overflow-hidden text-xs">
                    <div className="flex justify-between p-2 border-b border-slate-300 bg-slate-50 font-bold">
                      <span>إجمالي بضاعة اليوم:</span>
                      <span className="font-mono text-sm">{invoiceDetails?.invoice?.net_total?.toLocaleString()} ج.م</span>
                    </div>
                    {invoiceDetails?.invoice?.handling_fee > 0 && (
                      <div className="flex justify-between p-2 border-b border-slate-300 bg-slate-50 font-bold">
                        <span>المشال والتحميل:</span>
                        <span className="font-mono">{invoiceDetails?.invoice?.handling_fee?.toLocaleString()} ج.م</span>
                      </div>
                    )}
                    <div className="flex justify-between p-2 border-b border-slate-300 bg-amber-50/50 font-bold text-amber-900">
                      <span>الرصيد السابق المسجل:</span>
                      <span className="font-mono">{invoiceDetails?.invoice?.previous_balance_snapshot?.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between p-2.5 bg-blue-900 text-white font-black text-sm">
                      <span>الإجمالي المستحق:</span>
                      <span className="font-mono text-base">{invoiceDetails?.invoice?.total_due?.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between p-2 border-t border-slate-300 font-bold text-emerald-800">
                      <span>المسدد نقداً اليوم:</span>
                      <span className="font-mono">{invoiceDetails?.invoice?.total_paid?.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex justify-between p-2 border-t-2 border-slate-800 bg-slate-100 font-black text-slate-900">
                      <span>الباقي على العميل:</span>
                      <span className="font-mono text-sm">{invoiceDetails?.invoice?.remaining_due?.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>

                {/* Signatures & Stamp */}
                <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-300 text-center text-xs font-bold text-slate-800">
                  <div>
                    <p className="mb-8">توقيع المستلم</p>
                    <p className="border-t border-dashed border-slate-400 pt-1">.......................</p>
                  </div>
                  <div>
                    <p className="mb-8">المحاسب</p>
                    <p className="border-t border-dashed border-slate-400 pt-1">أنس بطاوي</p>
                  </div>
                  <div>
                    <p className="mb-8 font-bold">ختم واعتماد الشركة</p>
                    <p className="border-t border-dashed border-slate-400 pt-1 font-bold">{company.name_ar}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal for Cancellation */}
      <ManagerPinModal
        isOpen={showPinModal}
        onClose={() => setShowPinModal(false)}
        defaultTable="sales_invoices"
        defaultId={cancelTargetId}
        onApprovalGranted={handleApprovalGranted}
      />

      {/* Smart 2-Step Verification Delete Modal */}
      {deleteTarget && (
        <SmartDeleteModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadInvoices();
          }}
          entityType="invoice"
          entityId={deleteTarget.id}
          entityName={`فاتورة مبيعات: ${deleteTarget.invoice_no}`}
          entitySubtitle={`العميل: ${deleteTarget.party_name || '—'} — المبلغ: ${deleteTarget.total_due.toLocaleString()} ج.م`}
        />
      )}
    </div>
  );
};
