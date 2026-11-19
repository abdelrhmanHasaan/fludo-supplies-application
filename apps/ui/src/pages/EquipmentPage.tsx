import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Wrench, Plus, Fuel, History, X } from 'lucide-react';

export const EquipmentPage: React.FC = () => {
  const [equipment, setEquipment] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Form
  const [equipmentId, setEquipmentId] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [expenseType, setExpenseType] = useState('fuel');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    setLoading(true);
    try {
      const res = await api.getEquipment();
      setEquipment(res);
      if (res.length > 0) setEquipmentId(res[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async (eqId?: string) => {
    setShowHistoryModal(true);
    try {
      const res = await api.getEquipmentExpenses(eqId);
      setExpenses(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId || !amount || amount <= 0) return;

    try {
      await api.recordEquipmentExpense({
        equipmentId,
        expenseDate,
        amount,
        expenseType,
        description,
      });
      alert('تم تسجيل مصروف المعدة وترحيل القيد المحاسبي بنجاح!');
      setShowAddModal(false);
      setAmount(0);
      setDescription('');
      loadEquipment();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل المصروف');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-amber-600" />
            <span>حسابات ومصاريف المعدات والسيارات</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            متابعة دقيقة لمصاريف السولار والزيوت والصيانة والسائقين لكل لودر وسيارة
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleOpenHistory()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-300"
          >
            <History className="w-4 h-4 text-slate-500" />
            <span>سجل المصاريف</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل مصروف معدة</span>
          </button>
        </div>
      </div>

      {/* Equipment Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {equipment.map((eq) => (
          <div key={eq.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                  {eq.code}
                </span>
                <span className="text-xs text-slate-500">{eq.vehicle_type || 'معدة ثقيلة'}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-3">{eq.name}</h3>
              <p className="text-xs text-slate-500 mt-1">رقم اللوحة: {eq.plate_number || 'بدون لوحة'}</p>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-end justify-between">
              <div>
                <span className="text-xs text-slate-400 font-semibold block">إجمالي المصاريف:</span>
                <span className="text-xl font-black text-slate-900">
                  {eq.total_expenses.toLocaleString()} ج.م
                </span>
              </div>
              <button
                onClick={() => handleOpenHistory(eq.id)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                التفاصيل ←
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">تسجيل مصروف معدة / سيارة</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المعدة / السيارة *</label>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {equipment.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.code} - {eq.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع المصروف *</label>
                <select
                  value={expenseType}
                  onChange={(e) => setExpenseType(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                >
                  <option value="fuel">سولار / وقود</option>
                  <option value="oil">زيوت وفلاتر</option>
                  <option value="maintenance">صيانة وقطع غيار</option>
                  <option value="driver">يومية سائق / مساعد</option>
                  <option value="wash">غسيل وتشحيم</option>
                  <option value="other">مصروفات أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ المصروف</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-amber-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان / تفاصيل الصيانة</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تغيير زيت هيدروليك، تموين 100 لتر..."
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
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تسجيل المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                <span>سجل مصاريف المعدات والسيارات</span>
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">المعدة</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3 text-center">المبلغ</th>
                    <th className="p-3">البيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((x) => (
                    <tr key={x.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono">{x.expense_date}</td>
                      <td className="p-3 font-bold">{x.equipment_name}</td>
                      <td className="p-3">{x.expense_type}</td>
                      <td className="p-3 text-center font-bold text-amber-900">
                        {x.amount.toLocaleString()} ج.م
                      </td>
                      <td className="p-3 text-slate-500">{x.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

