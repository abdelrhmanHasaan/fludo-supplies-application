import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Navigation, Truck, Wallet, CheckCircle2, User } from 'lucide-react';

export const ShipmentsPage: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [driverName, setDriverName] = useState('');
  const [collectedAmount, setCollectedAmount] = useState<number>(0);

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      const res = await api.getSalesInvoices({ status: 'approved' });
      setInvoices(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSettle = (inv: any) => {
    setSelectedInvoice(inv);
    setCollectedAmount(inv.total_due || inv.net_total);
    setDriverName(inv.receiver_name || 'سائق النقل');
    setSettleModalOpen(true);
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || collectedAmount <= 0) return;

    try {
      await api.recordPayment({
        paymentType: 'driver_collection',
        partyId: selectedInvoice.party_id,
        paymentDate: new Date().toISOString().split('T')[0],
        amount: collectedAmount,
        paymentMethod: 'cash',
        driverName,
        allocations: [{ invoiceId: selectedInvoice.id, amount: collectedAmount }],
      });
      alert('تم توريد تحصيل السائق وإيداعه في الصندوق الرئيسي بنجاح!');
      setSettleModalOpen(false);
      loadShipments();
    } catch (err: any) {
      alert(err.message || 'فشل توريد التحصيل');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Navigation className="w-6 h-6 text-blue-600" />
            <span>حركة الشحنات وتوريد تحصيلات السائقين</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            متابعة البضاعة المنطلقة مع السائقين والمبالغ النقدية المحصلة على البوابة
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">رقم الفاتورة</th>
              <th className="p-4">تاريخ الخروج</th>
              <th className="p-4">العميل</th>
              <th className="p-4 text-center">إجمالي الحمولة (ج.م)</th>
              <th className="p-4 text-center">المطلوب تحصيله</th>
              <th className="p-4 text-center">تسوية التحصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  جاري تحميل الشحنات...
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا توجد شحنات معتمدة مسجلة اليوم
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-mono font-bold text-blue-700">{inv.invoice_no}</td>
                  <td className="p-4 font-mono text-xs">{inv.invoice_date}</td>
                  <td className="p-4 font-bold text-slate-800">{inv.party_name}</td>
                  <td className="p-4 text-center font-bold">{inv.net_total.toLocaleString()}</td>
                  <td className="p-4 text-center font-black text-rose-700">
                    {inv.total_due.toLocaleString()} ج.م
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleOpenSettle(inv)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs inline-flex items-center gap-1 border border-emerald-200"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>توريد كاش السائق</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Driver Settle Modal */}
      {settleModalOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <h3 className="font-bold text-base text-slate-800">
              توريد تحصيل سائق — فاتورة {selectedInvoice.invoice_no}
            </h3>

            <div className="p-3 bg-slate-50 rounded-lg text-xs space-y-1">
              <p>العميل: <strong>{selectedInvoice.party_name}</strong></p>
              <p>الإجمالي المطلوب: <strong>{selectedInvoice.total_due} ج.م</strong></p>
            </div>

            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم السائق *</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المحصل فعلياً (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  value={collectedAmount || ''}
                  onChange={(e) => setCollectedAmount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-emerald-800"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleModalOpen(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تأكيد التوريد للخزينة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

