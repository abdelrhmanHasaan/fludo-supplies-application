import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Receipt, Plus, Search, X } from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [categoryId, setCategoryId] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState<number>(0);
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const [exps, cats] = await Promise.all([api.getExpenses(), api.getExpenseCategories()]);
      setExpenses(exps);
      setCategories(cats);
      if (cats.length > 0) setCategoryId(cats[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return;

    try {
      await api.recordExpense({
        categoryId,
        expenseDate,
        amount,
        payee,
        description,
      });
      setShowAddModal(false);
      setAmount(0);
      setPayee('');
      setDescription('');
      loadExpenses();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل المصروف');
    }
  };

  const totalExpenses = expenses.reduce((acc, x) => acc + x.amount, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-rose-600" />
            <span>سجل المصروفات الإدارية والتشغيلية</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إجمالي المصروفات المسجلة: <strong className="text-rose-700">{totalExpenses.toLocaleString()} ج.م</strong>
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>تسجيل مصروف جديد</span>
        </button>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">رقم الإذن</th>
              <th className="p-4">التاريخ</th>
              <th className="p-4">الباب / التصنيف</th>
              <th className="p-4">المستلم / الجهة</th>
              <th className="p-4">البيان</th>
              <th className="p-4 text-center">المبلغ المنصرف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  جاري تحميل المصروفات...
                </td>
              </tr>
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا توجد مصروفات مسجلة
                </td>
              </tr>
            ) : (
              expenses.map((x) => (
                <tr key={x.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-mono font-bold text-xs text-blue-700">{x.expense_number}</td>
                  <td className="p-4 font-mono text-xs">{x.expense_date}</td>
                  <td className="p-4 font-bold text-slate-800">{x.category_name || 'عام'}</td>
                  <td className="p-4 text-slate-600 text-xs">{x.payee || '—'}</td>
                  <td className="p-4 text-slate-500 text-xs">{x.description || '—'}</td>
                  <td className="p-4 text-center font-black text-rose-700">
                    {x.amount.toLocaleString()} ج.م
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">صرف مصروف إداري أو تشغيلي</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">باب المصروف *</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الصرف</label>
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
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-rose-700"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المستلم / الجهة المنصرف إليها</label>
                <input
                  type="text"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="اسم الشخص أو المؤسسة..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان والشرح</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="تفاصيل إضافية..."
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
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  صرف المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

