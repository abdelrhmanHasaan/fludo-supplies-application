import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Users,
  AlertTriangle,
  Phone,
  Trash2,
  Clock,
  DollarSign,
  X,
} from 'lucide-react';
import { SmartDeleteModal } from '../components/SmartDeleteModal';
import { PartyDetailsView } from '../components/PartyDetailsView';

export const CustomersPage: React.FC = () => {
  const { company } = useCompany();
  const [customers, setCustomers] = useState<any[]>([]);
  const [alarms, setAlarms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  // New Customer Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newSettlementDays, setNewSettlementDays] = useState<number>(30);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const [res, alarmRes] = await Promise.all([
        api.getParties({ is_customer: true, search }),
        api.getPartyAlarms ? api.getPartyAlarms({ is_customer: true }).catch(() => []) : Promise.resolve([]),
      ]);
      setCustomers(res || []);
      setAlarms(alarmRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await api.createParty({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        address: newAddress.trim() || undefined,
        is_customer: true,
        settlement_due_days: newSettlementDays || 30,
      });
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setNewSettlementDays(30);
      loadCustomers();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة العميل');
    }
  };

  const totalReceivable = useMemo(() => {
    return customers.reduce((sum, c) => sum + Math.max(0, Number(c.customer_balance || 0)), 0);
  }, [customers]);

  const formatMoney = (val: any) => {
    return Number(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  if (selectedCustomer) {
    return (
      <PartyDetailsView
        partyId={selectedCustomer.id}
        isCustomer={true}
        onBack={() => {
          setSelectedCustomer(null);
          loadCustomers();
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
            <p className="text-xs font-bold text-slate-500 mb-1">إجمالي عدد العملاء</p>
            <h3 className="text-2xl font-black text-slate-900">{customers.length} عميل</h3>
            <p className="text-[11px] text-slate-400 mt-1">المسجلين بالنظام</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">إجمالي الفلوس اللي لينا (الديون)</p>
            <h3 className="text-2xl font-black text-rose-700" dir="ltr">{formatMoney(totalReceivable)}</h3>
            <p className="text-[11px] text-slate-400 mt-1">مجموع أرصدة العملاء المدينة</p>
          </div>
          <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-center space-y-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            إضافة عميل جديد
          </button>
          <a
            href="/api/data/export/customers"
            download
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            تصدير إكسيل
          </a>
        </div>
      </div>

      {/* Alarm Box (صندوق إنذارات استحقاق السداد) */}
      {alarms.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-black text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>إنذارات مواعيد السداد والتحصيل ({alarms.length} عميل حان موعد سدادهم)</span>
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
                  const target = customers.find((c) => c.id === a.party_id);
                  if (target) setSelectedCustomer(target);
                }}
                className="bg-white p-3.5 rounded-xl border border-amber-200 hover:border-amber-400 cursor-pointer shadow-xs transition hover:shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-900 text-xs">{a.party_name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {a.countdown_days <= 0 ? 'انتهت الفترة' : `باقي ${a.countdown_days} أيام`}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2.5 text-xs">
                  <span className="text-slate-500">المبلغ المطلوب:</span>
                  <span className="font-black text-rose-700">{formatMoney(a.current_balance)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Controls: Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم العميل، الكود، أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">كود العميل</th>
              <th className="p-4">اسم العميل</th>
              <th className="p-4">رقم الهاتف</th>
              <th className="p-4">العنوان والملاحظات</th>
              <th className="p-4 text-center">الرصيد الحالي</th>
              <th className="p-4 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  جاري تحميل العملاء...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا توجد حسابات عملاء مطابقة للبحث
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const isDebt = c.customer_balance > 0;
                const isCredit = c.customer_balance < 0;
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCustomer(c)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-mono font-bold text-slate-500 text-xs">{c.code || '—'}</td>
                    <td className="p-4 font-black text-slate-900 hover:text-blue-600 transition-colors">
                      {c.name}
                    </td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{c.phone || '—'}</td>
                    <td className="p-4 text-slate-500 text-xs">{c.address || c.notes || '—'}</td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                          isDebt
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : isCredit
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isDebt
                          ? `عليه: ${formatMoney(c.customer_balance)}`
                          : isCredit
                          ? `له رصيد: ${formatMoney(Math.abs(c.customer_balance))}`
                          : 'خالص (0.00)'}
                      </span>
                    </td>
                    <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedCustomer(c)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition-colors"
                        >
                          عرض الحساب
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف العميل"
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

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">إضافة عميل جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="الاسم الكامل أو اسم الورشة/المقاول..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="010XXXXXXXX"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">فترة السداد الافتراضية (أيام)</label>
                <input
                  type="number"
                  min="1"
                  value={newSettlementDays}
                  onChange={(e) => setNewSettlementDays(parseInt(e.target.value, 10) || 30)}
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / ملاحظات</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="العنوان أو موقع العمل..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="flex-1 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-sm font-bold shadow-md"
                >
                  حفظ العميل
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
          entityType="customer"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadCustomers();
          }}
        />
      )}
    </div>
  );
};
