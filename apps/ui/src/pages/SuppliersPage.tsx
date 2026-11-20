import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Search, Plus, Truck, ArrowLeftRight, X, Trash2 } from 'lucide-react';
import { SmartDeleteModal } from '../components/SmartDeleteModal';

export const SuppliersPage: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showNettingModal, setShowNettingModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // New Supplier
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // Netting
  const [nettingAmount, setNettingAmount] = useState<number>(0);
  const [nettingNotes, setNettingNotes] = useState('');

  useEffect(() => {
    loadSuppliers();
  }, [search]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await api.getParties({ is_supplier: true, search });
      setSuppliers(res);
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
      await api.createParty({ name, phone, address, is_supplier: true, is_customer: false });
      setShowAddModal(false);
      setName('');
      setPhone('');
      setAddress('');
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

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث في الموردين..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
          />
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة مورد جديد</span>
        </button>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">اسم المورد</th>
              <th className="p-4">رقم الهاتف</th>
              <th className="p-4">العنوان</th>
              <th className="p-4 text-center">مستحق للمورد (علينا)</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  جاري تحميل الموردين...
                </td>
              </tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  لا توجد حسابات موردين
                </td>
              </tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>{s.name}</span>
                    {s.is_customer && (
                      <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                        عميل ومورد معاً
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-slate-600 font-mono text-xs">{s.phone || '—'}</td>
                  <td className="p-4 text-slate-500 text-xs">{s.address || '—'}</td>
                  <td className="p-4 text-center">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {s.supplier_balance > 0
                        ? `مستحق له: ${s.supplier_balance.toLocaleString()} ج.م`
                        : 'خالص (0.00)'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {s.is_customer && (
                        <button
                          onClick={() => {
                            setSelectedSupplier(s);
                            setShowNettingModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 font-bold text-xs inline-flex items-center gap-1 border border-amber-200"
                          title="تسوية مقاصة بين حساب المشتريات والمبيعات"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          <span>إجراء مقاصة</span>
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="حذف المورد (تحقق ثنائي)"
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

      {/* Add Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة مورد جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المورد / المحجر / المصنع *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / الموقع</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
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
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow"
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
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">
                تسوية مقاصة: {selectedSupplier.name}
              </h3>
              <button onClick={() => setShowNettingModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-1">
              <p>رصيده كعميل (مدين لنا): <strong>{selectedSupplier.customer_balance} ج.م</strong></p>
              <p>رصيده كمورد (دائن علينا): <strong>{selectedSupplier.supplier_balance} ج.م</strong></p>
              <p className="text-[11px] text-slate-500 mt-1">
                تطبيق المقاصة يخصم المبلغ من حساب العملاء وحساب الموردين في قيد يومية متزن آلياً.
              </p>
            </div>

            <form onSubmit={handleNettingSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ المقاصة (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={nettingAmount || ''}
                  onChange={(e) => setNettingAmount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-amber-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">بيان المقاصة</label>
                <input
                  type="text"
                  value={nettingNotes}
                  onChange={(e) => setNettingNotes(e.target.value)}
                  placeholder="تسوية مشتريات أسمنت مقابل مبيعات سن..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNettingModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تأكيد المقاصة
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
            loadSuppliers();
          }}
          entityType="supplier"
          entityId={deleteTarget.id}
          entityName={deleteTarget.name}
          entitySubtitle={deleteTarget.phone ? `هاتف: ${deleteTarget.phone}` : undefined}
        />
      )}
    </div>
  );
};

