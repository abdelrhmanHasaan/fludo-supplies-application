import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Wallet, ArrowLeftRight, CheckSquare, X, DollarSign } from 'lucide-react';

export const TreasuryPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);

  // Transfer state
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState('');

  // Count state
  const [countAccountId, setCountAccountId] = useState('');
  const [countedAmount, setCountedAmount] = useState<number>(0);
  const [countNotes, setCountNotes] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.getCashAccounts();
      setAccounts(res);
      if (res.length >= 2) {
        setFromId(res[0].id);
        setToId(res[1].id);
      }
      if (res.length >= 1) {
        setCountAccountId(res[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId || transferAmount <= 0) return;
    if (fromId === toId) return alert('لا يمكن التحويل لنفس الحساب');

    try {
      await api.transferCash({
        fromAccountId: fromId,
        toAccountId: toId,
        amount: transferAmount,
        notes: transferNotes,
      });
      alert('تم تحويل الأموال وترحيل القيد المحاسبي بنجاح!');
      setShowTransferModal(false);
      setTransferAmount(0);
      setTransferNotes('');
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل التحويل');
    }
  };

  const handleCashCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countAccountId || countedAmount === undefined) return;

    try {
      const res = await api.recordCashCount({
        cashAccountId: countAccountId,
        countedAmount,
        notes: countNotes,
      });
      const diff = parseFloat(res.difference);
      alert(
        `تم تسجيل جرد الخزينة بنجاح!\nالرصيد الدفتري: ${res.recorded_balance}\nالرصيد الفعلي المعدود: ${res.counted_balance}\nالفارق: ${diff === 0 ? 'مطابق تماماً (0.00)' : diff > 0 ? `زيادة (+${diff})` : `عجز (${diff})`}`
      );
      setShowCountModal(false);
      setCountedAmount(0);
      setCountNotes('');
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الجرد');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-blue-600" />
            <span>الخزينة والبنوك وتسوية العهد</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إدارة الصناديق النقدية، الحسابات البنكية، وجرد الخزينة اليومي
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCountModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors shadow-sm"
          >
            <CheckSquare className="w-4 h-4 text-amber-600" />
            <span>جرد الخزينة الفعلي</span>
          </button>

          <button
            onClick={() => setShowTransferModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>تحويل بين الخزن/البنوك</span>
          </button>
        </div>
      </div>

      {/* Accounts Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-mono font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">
                  {acc.code} — {acc.kind === 'cashbox' ? 'صندوق نقدي' : 'حساب بنكي'}
                </span>
                <h3 className="text-lg font-bold text-slate-800 mt-2">{acc.name_ar}</h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-end justify-between">
              <div>
                <span className="text-xs text-slate-400 font-semibold block">الرصيد الدفتري الحالي:</span>
                <span className="text-2xl font-black text-slate-900">
                  {acc.balance.toLocaleString()} ج.م
                </span>
              </div>
              <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">
                متزن مع دفتر الأستاذ
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">تحويل أموال بين الحسابات</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">من حساب (المرسل) *</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar} (رصيده: {a.balance} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">إلى حساب (المستلم) *</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar} (رصيده: {a.balance} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">مبلغ التحويل (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={transferAmount || ''}
                  onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-base font-bold text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">البيان / سبب التحويل</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="إيداع حصيلة مبيعات بالبنك..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تأكيد التحويل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Count Modal */}
      {showCountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">جرد الخزينة الفعلي (مطابقة الدرج)</h3>
              <button onClick={() => setShowCountModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCashCount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحساب المجرود *</label>
                <select
                  value={countAccountId}
                  onChange={(e) => setCountAccountId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_ar} (الدفتري: {a.balance} ج.م)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ الفعلي في الدرج (المعدود) *</label>
                <input
                  type="number"
                  step="any"
                  value={countedAmount || ''}
                  onChange={(e) => setCountedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-lg font-bold text-center text-amber-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الجرد</label>
                <input
                  type="text"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  placeholder="جرد نهاية الوردية..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCountModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تسجيل نتيجة الجرد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

