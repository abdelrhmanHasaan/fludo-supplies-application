import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  Search,
  Plus,
  FileSpreadsheet,
  Printer,
  X,
  CreditCard,
  UserCheck,
  Phone,
  MapPin,
  Trash2,
} from 'lucide-react';
import { SmartDeleteModal } from '../components/SmartDeleteModal';

export const CustomersPage: React.FC = () => {
  const { company } = useCompany();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [statement, setStatement] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // New Customer Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  useEffect(() => {
    loadCustomers();
  }, [search]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await api.getParties({ is_customer: true, search });
      setCustomers(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStatement = async (cust: any) => {
    setSelectedCustomer(cust);
    setStatementLoading(true);
    try {
      const res = await api.getPartyStatement(cust.id);
      setStatement(res);
    } catch (err) {
      console.error(err);
    } finally {
      setStatementLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await api.createParty({
        name: newName,
        phone: newPhone,
        address: newAddress,
        is_customer: true,
      });
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      loadCustomers();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة العميل');
    }
  };

  const printStatement = () => {
    if ((window as any).electronAPI?.print) {
      (window as any).electronAPI.print();
    } else {
      window.print();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <a
            href="/api/data/export/customers"
            download
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسيل</span>
          </a>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عميل جديد</span>
          </button>
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">اسم العميل</th>
              <th className="p-4">رقم الهاتف</th>
              <th className="p-4">العنوان</th>
              <th className="p-4 text-center">الرصيد الحالي</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  جاري تحميل العملاء...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  لا توجد حسابات عملاء مطابقة للبحث
                </td>
              </tr>
            ) : (
              customers.map((c) => {
                const isDebt = c.customer_balance > 0;
                const isCredit = c.customer_balance < 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-bold text-slate-800">{c.name}</td>
                    <td className="p-4 text-slate-600 font-mono text-xs">{c.phone || '—'}</td>
                    <td className="p-4 text-slate-500 text-xs">{c.address || '—'}</td>
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
                          ? `عليه: ${c.customer_balance.toLocaleString()} ج.م`
                          : isCredit
                          ? `له رصيد: ${Math.abs(c.customer_balance).toLocaleString()} ج.م`
                          : 'خالص (0.00)'}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenStatement(c)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs transition-colors"
                        >
                          كشف حساب
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="حذف العميل (تحقق ثنائي)"
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

      {/* Statement Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
              <div>
                <h3 className="font-bold text-lg">كشف حساب العميل: {selectedCustomer.name}</h3>
                <p className="text-xs text-slate-300 font-mono">هاتف: {selectedCustomer.phone || 'غير مسجل'}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/data/export/statement/${selectedCustomer.id}`}
                  download
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>تصدير إكسيل</span>
                </a>
                <button
                  onClick={printStatement}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة</span>
                </button>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Statement Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Letterhead for print */}
              <div className="text-center border-b pb-4 border-slate-200">
                <h2 className="text-2xl font-black text-slate-900">{company.name_ar}</h2>
                <p className="text-xs text-slate-500 font-medium">{company.tagline || 'تجارة مواد البناء والتوريدات العامة'} — {company.address || 'كرداسة'}</p>
                <p className="text-sm font-bold text-blue-900 mt-2">
                  كشف حساب العميل: {selectedCustomer.name}
                </p>
              </div>

              {statementLoading ? (
                <div className="p-12 text-center text-slate-400 font-semibold">
                  جاري استخراج حركات الحساب...
                </div>
              ) : statement?.transactions?.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-semibold">
                  لا توجد حركات مسجلة على هذا الحساب حتى الآن.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">رقم السند/الفاتورة</th>
                        <th className="p-2.5">البيان</th>
                        <th className="p-2.5 text-center">مدين (مشتريات)</th>
                        <th className="p-2.5 text-center">دائن (سداد)</th>
                        <th className="p-2.5 text-center">الرصيد بعد الحركة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statement?.transactions?.map((t: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono">{t.entry_date}</td>
                          <td className="p-2.5 font-bold">{t.entry_number}</td>
                          <td className="p-2.5">{t.description}</td>
                          <td className="p-2.5 text-center font-bold text-slate-800">
                            {t.debit > 0 ? t.debit.toLocaleString() : '—'}
                          </td>
                          <td className="p-2.5 text-center font-bold text-emerald-700">
                            {t.credit > 0 ? t.credit.toLocaleString() : '—'}
                          </td>
                          <td className="p-2.5 text-center font-black text-slate-900">
                            {t.running_balance.toLocaleString()} ج.م
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 border-t border-slate-200 font-bold">
                      <tr>
                        <td colSpan={5} className="p-3 text-left">
                          الرصيد النهائي المستحق:
                        </td>
                        <td className="p-3 text-center text-sm font-black text-blue-800">
                          {statement?.runningBalance?.toLocaleString()} ج.م
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة عميل جديد</h3>
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
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none"
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
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / المنطقة</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="كرداسة، الجيزة..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  حفظ العميل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart 2-Step Verification Delete Modal */}
      {deleteTarget && (
        <SmartDeleteModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadCustomers();
          }}
          entityType="customer"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          entitySubtitle={deleteTarget.phone ? `هاتف: ${deleteTarget.phone}` : undefined}
        />
      )}
    </div>
  );
};
