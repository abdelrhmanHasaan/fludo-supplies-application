import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  Search,
  Plus,
  Truck,
  ArrowLeftRight,
  X,
  Trash2,
  FileSpreadsheet,
  AlertTriangle,
  Clock,
  DollarSign,
} from 'lucide-react';
import { SmartDeleteModal } from '../components/SmartDeleteModal';
import { PartyDetailsView } from '../components/PartyDetailsView';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNettingModal, setShowNettingModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // New Supplier Form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [settlementDays, setSettlementDays] = useState<number>(30);

  // Netting Form
  const [nettingAmount, setNettingAmount] = useState<number>(0);
  const [nettingNotes, setNettingNotes] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const [res, alarmRes] = await Promise.all([
        api.getParties({ is_supplier: true, search }),
        api.getPartyAlarms ? api.getPartyAlarms({ is_supplier: true }).catch(() => []) : Promise.resolve([]),
      ]);
      setSuppliers(res || []);
      setAlarms(alarmRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createParty({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        is_supplier: true,
        is_customer: false,
        settlement_due_days: settlementDays || 30,
      });
      setShowAddModal(false);
      setName('');
      setPhone('');
      setAddress('');
      setSettlementDays(30);
      loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة المورد');
    }
  };

  const handleNettingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || nettingAmount <= 0) return;

    try {
      await api.performNetting({
        partyId: selectedSupplier.id,
        amount: nettingAmount,
        notes: nettingNotes,
      });
      alert('تم إجراء المقاصة المحاسبية بنجاح وترحيل القيد المتزن!');
      setShowNettingModal(false);
      setNettingAmount(0);
      setNettingNotes('');
      loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'فشل إجراء المقاصة');
    }
  };

  const totalPayable = useMemo(() => {
    return suppliers.reduce((sum, s) => sum + Math.max(0, Number(s.supplier_balance || 0)), 0);
  }, [suppliers]);

  const formatMoney = (val: any) => {
    return Number(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  if (selectedSupplier && !showNettingModal) {
    return (
      <PartyDetailsView
        partyId={selectedSupplier.id}
        isCustomer={false}
        onBack={() => {
          setSelectedSupplier(null);
          loadSuppliers();
        }}
      />
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
      {/* Top Header & KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">إجمالي عدد الموردين</p>
            <h3 className="text-2xl font-black text-slate-900">{suppliers.length} مورد</h3>
            <p className="text-[11px] text-slate-400 mt-1">المسجلين بالنظام</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">إجمالي الفلوس اللي علينا (المستحقات)</p>
            <h3 className="text-2xl font-black text-amber-700" dir="ltr">{formatMoney(totalPayable)}</h3>
            <p className="text-[11px] text-slate-400 mt-1">مجموع مستحقات الموردين</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-center space-y-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            إضافة مورد جديد
          </button>
          <a
            href="/api/data/export/suppliers"
            download
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير إكسيل
          </a>
        </div>
      </div>

      {/* Alarm Box (صندوق إنذارات استحقاق الموردين) */}
      {alarms.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>إنذارات مواعيد سداد الموردين ({alarms.length} مورد حان موعد سداد مستحقاتهم)</span>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
              محسوب تلقائياً من الداتا بيز (v_party_alarms)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {alarms.map((a) => (
              <div
                key={a.party_id}
                onClick={() => {
                  const target = suppliers.find((s) => s.id === a.party_id);
                  if (target) setSelectedSupplier(target);
                }}
                className="bg-white p-3.5 rounded-xl border border-amber-200 hover:border-amber-400 cursor-pointer shadow-xs transition hover:shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-900 text-xs">{a.party_name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {a.countdown_days <= 0 ? 'حان موعد السداد' : `باقي ${a.countdown_days} أيام`}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2.5 text-xs">
                  <span className="text-slate-500">المبلغ المستحق له:</span>
                  <span className="font-black text-amber-700">{formatMoney(a.current_balance)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم المورد، الكود، أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500 shadow-sm"
          />
        </div>
      </div>

      {/* Supplier Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">كود المورد</th>
              <th className="p-4">اسم المورد</th>
              <th className="p-4">رقم الهاتف</th>
              <th className="p-4">العنوان والملاحظات</th>
              <th className="p-4 text-center">الرصيد المستحق</th>
              <th className="p-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  جاري تحميل الموردين...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا توجد حسابات موردين مطابقة للبحث
                </td>
              </tr>
            ) : (
              suppliers.map((s) => {
                const isPayable = s.supplier_balance > 0;
                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSupplier(s)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono font-bold text-slate-500 text-xs">{s.code || '—'}</td>
                    <td className="p-4 font-black text-slate-900 hover:text-amber-600 transition-colors">
                      {s.name}
                    </td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{s.phone || '—'}</td>
                    <td className="p-4 text-slate-500 text-xs">{s.address || s.notes || '—'}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          isPayable
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isPayable ? `له عندنا: ${formatMoney(s.supplier_balance)}` : 'خالص (0.00)'}
                      </span>
                    </td>
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedSupplier(s)}
                          className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold text-xs transition-colors"
                        >
                          عرض الحساب
                        </button>
                        <button
                          onClick={() => {
                            setSelectedSupplier(s);
                            setShowNettingModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors flex items-center gap-1"
                          title="إجراء مقاصة"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          مقاصة
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف المورد"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">إضافة مورد جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المورد *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم المحجر، المصنع، التاجر..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none font-mono focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فترة السداد الافتراضية (أيام)</label>
                <input
                  type="number"
                  min="1"
                  value={settlementDays}
                  onChange={(e) => setSettlementDays(parseInt(e.target.value, 10) || 30)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / ملاحظات</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="موقع المحجر أو المصنع..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-xl text-sm font-bold shadow-md"
                >
                  حفظ المورد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Netting Modal */}
      {showNettingModal && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">إجراء مقاصة حسابية</h3>
              <button onClick={() => setShowNettingModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleNettingSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">المورد المستهدف: <span className="font-bold text-slate-800">{selectedSupplier.name}</span></p>
                <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ المقاصة (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={nettingAmount || ''}
                  onChange={(e) => setNettingAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">بيان المقاصة / الملاحظات</label>
                <input
                  type="text"
                  value={nettingNotes}
                  onChange={(e) => setNettingNotes(e.target.value)}
                  placeholder="مثال: خصم مقابل توريد بضاعة متبادلة"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNettingModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 text-white hover:bg-amber-700 rounded-xl text-sm font-bold shadow-md"
                >
                  تأكيد المقاصة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart Delete Modal */}
      {deleteTarget && (
        <SmartDeleteModal
          isOpen={true}
          entityType="supplier"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadSuppliers();
          }}
        />
      )}
    </div>
  );
};
