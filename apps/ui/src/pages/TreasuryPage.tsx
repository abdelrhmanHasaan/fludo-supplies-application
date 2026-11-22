import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import {
  Wallet,
  ArrowLeftRight,
  CheckSquare,
  X,
  Plus,
  Landmark,
  CreditCard,
  Building,
  DollarSign,
  Calendar,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Power,
  RefreshCw,
} from 'lucide-react';

export const TreasuryPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [showStatementModal, setShowStatementModal] = useState(false);

  // New Account State
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'cash' | 'wallet' | 'bank' | 'other'>('cash');
  const [newOpeningBalance, setNewOpeningBalance] = useState<number>(0);

  // Transfer State
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState('');

  // Count State
  const [countAccountId, setCountAccountId] = useState('');
  const [countedAmount, setCountedAmount] = useState<number>(0);
  const [countNotes, setCountNotes] = useState('');

  // Statement State
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [statementData, setStatementData] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await api.getCashAccounts();
      setAccounts(res || []);
      if (res && res.length >= 2) {
        setFromId(res[0].id);
        setToId(res[1].id);
      }
      if (res && res.length >= 1) {
        setCountAccountId(res[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await api.createCashAccount({
        name: newName.trim(),
        kind: newKind,
        opening_balance: newOpeningBalance,
      });
      setShowAddModal(false);
      setNewName('');
      setNewKind('cash');
      setNewOpeningBalance(0);
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة الحساب');
    }
  };

  const handleToggleActive = async (acc: any) => {
    const actionText = acc.is_active ? 'تعطيل' : 'تفعيل';
    if (!window.confirm(`هل أنت متأكد من ${actionText} هذا الحساب (${acc.name})؟`)) return;

    try {
      await api.toggleCashAccountActive(acc.id);
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل تغيير حالة الحساب');
    }
  };

  const handleOpenStatement = async (acc: any) => {
    setSelectedAccount(acc);
    setShowStatementModal(true);
    setStatementLoading(true);
    try {
      const res = await api.getCashAccountStatement(acc.id);
      setStatementData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setStatementLoading(false);
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
      alert('تم تحويل الأموال بنجاح وتحديث أرصدة الحسابين!');
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
        `تم تسجيل جرد الخزينة بنجاح!\nالرصيد الدفتري المسجل: ${res.count?.recorded_balance}\nالرصيد الفعلي المعدود: ${res.count?.actual_balance}\nالفارق: ${diff === 0 ? 'مطابق تماماً (0.00)' : diff > 0 ? `زيادة (+${diff})` : `عجز (${diff})`}`
      );
      setShowCountModal(false);
      setCountedAmount(0);
      setCountNotes('');
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الجرد');
    }
  };

  const formatMoney = (val: any) => {
    return Number(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  const getKindDetails = (kind: string) => {
    switch (kind) {
      case 'wallet':
        return { label: 'محفظة إلكترونية', icon: Wallet, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'bank':
        return { label: 'حساب بنكي', icon: Landmark, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'other':
        return { label: 'حساب آخر', icon: CreditCard, color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'cash':
      default:
        return { label: 'خزينة نقدية (كاش)', icon: DollarSign, color: 'bg-blue-50 text-blue-700 border-blue-200' };
    }
  };

  const totalLiquidity = accounts.reduce((acc, curr) => acc + (curr.is_active ? Number(curr.balance || 0) : 0), 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
            <Wallet className="w-7 h-7 text-blue-600" />
            <span>الخزينة والمحافظ والحسابات البنكية</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            إدارة حسابات السيولة النقدية، التحويلات، وكشوف الحساب التفصيلية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة حساب / خزينة</span>
          </button>

          {accounts.length >= 2 && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold active:scale-95 transition-all"
            >
              <ArrowLeftRight className="w-4 h-4 text-blue-600" />
              <span>تحويل بين الخزائن</span>
            </button>
          )}

          {accounts.length >= 1 && (
            <button
              onClick={() => setShowCountModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-bold active:scale-95 transition-all"
            >
              <CheckSquare className="w-4 h-4 text-amber-600" />
              <span>جرد فعلي</span>
            </button>
          )}
        </div>
      </div>

      {/* Total Liquidity Banner */}
      {accounts.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-blue-200 font-bold block">إجمالي السيولة الحالية المتاحة</span>
            <div className="text-3xl font-black tracking-tight">{formatMoney(totalLiquidity)}</div>
          </div>
          <div className="text-left text-xs text-blue-200/80 font-bold">
            عدد الحسابات النشطة: {accounts.filter((a) => a.is_active).length} من {accounts.length}
          </div>
        </div>
      )}

      {/* Accounts Grid or Empty State */}
      {loading ? (
        <div className="p-16 text-center text-slate-400 font-bold bg-white rounded-3xl border border-slate-200">
          جاري تحميل بيانات الخزائن والحسابات...
        </div>
      ) : accounts.length === 0 ? (
        /* Clean Empty State as required by Section 5 */
        <div className="p-16 text-center bg-white rounded-3xl border border-dashed border-slate-300 shadow-sm space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
            <Wallet className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-black text-slate-900">لا توجد خزائن أو حسابات مضافة حالياً</h3>
            <p className="text-sm text-slate-500 mt-2">
              يبدأ النظام بدون أي خزائن افتراضية. قم بإضافة خزينتك النقدية، محفظتك الإلكترونية، أو حسابك البنكي لتسجيل الحركات المالية عليها.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>إضافة أول حساب / خزينة</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((acc) => {
            const kindInfo = getKindDetails(acc.kind);
            const KindIcon = kindInfo.icon;
            return (
              <div
                key={acc.id}
                className={`bg-white rounded-3xl p-6 border transition-all duration-200 shadow-sm hover:shadow-md relative overflow-hidden flex flex-col justify-between ${
                  acc.is_active ? 'border-slate-200' : 'border-slate-200 bg-slate-50/70 opacity-60'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
                        <KindIcon className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-base">{acc.name}</h4>
                        <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold border mt-0.5 ${kindInfo.color}`}>
                          {kindInfo.label}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleActive(acc)}
                      className={`p-2 rounded-xl transition-colors ${
                        acc.is_active ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={acc.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="pt-2">
                    <span className="text-xs text-slate-400 font-bold block">الرصيد الفعلي الحالي</span>
                    <div className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                      {formatMoney(acc.balance)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100 font-bold">
                    <span>الرصيد الافتتاحي:</span>
                    <span>{formatMoney(acc.opening_balance)}</span>
                  </div>
                </div>

                <div className="pt-5 mt-4 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => handleOpenStatement(acc)}
                    className="flex-1 py-2 px-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>كشف الحساب</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: إضافة حساب / خزينة */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleCreateAccount}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <Wallet className="w-5 h-5 text-blue-600" />
                <span>إضافة حساب أو خزينة جديدة</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">نوع الحساب *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'cash', label: 'خزينة نقدية (كاش)' },
                    { key: 'wallet', label: 'محفظة إلكترونية' },
                    { key: 'bank', label: 'حساب بنكي' },
                    { key: 'other', label: 'أخرى' },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => setNewKind(t.key as any)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        newKind === t.key
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">اسم الحساب *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: الخزينة الرئيسية، محفظة فودافون كاش 010..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">رصيد افتتاحي (اختياري)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  الرصيد الافتتاحي هو المبلغ الموجود بالفعل داخل هذا الحساب قبل بدء العمل.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                حفظ الحساب
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: كشف حساب الخزينة */}
      {showStatementModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-3xl w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">
                  كشف حساب: {selectedAccount?.name}
                </h3>
                <p className="text-xs text-slate-400">
                  سجل المقبوضات والمدفوعات والتحويلات مع الرصيد اللحظي
                </p>
              </div>
              <button
                onClick={() => setShowStatementModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {statementLoading ? (
              <div className="p-12 text-center text-slate-400 font-bold">
                جاري استخراج كشف الحساب...
              </div>
            ) : statementData?.transactions?.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold">
                لا توجد حركات نقدية مسجلة على هذا الحساب
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {statementData?.transactions?.map((tx: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{tx.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{tx.description}</div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {new Date(tx.occurred_at).toLocaleDateString('ar-EG')}
                      </span>
                    </div>

                    <div className="text-left font-bold">
                      {tx.amount_in > 0 && (
                        <span className="text-emerald-700 block">+ {formatMoney(tx.amount_in)}</span>
                      )}
                      {tx.amount_out > 0 && (
                        <span className="text-rose-700 block">- {formatMoney(tx.amount_out)}</span>
                      )}
                      <span className="text-xs text-slate-400 block mt-0.5">
                        الرصيد: <strong>{formatMoney(tx.running_balance)}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-700">
                الرصيد النهائي: <strong className="text-blue-700 text-lg">{formatMoney(selectedAccount?.balance)}</strong>
              </span>
              <button
                onClick={() => setShowStatementModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: تحويل بين الخزائن */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleTransfer}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <span>تحويل أموال بين الخزائن والحسابات</span>
              </div>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">من حساب (المرسل) *</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500 bg-white"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (الرصيد: {formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">إلى حساب (المستلم) *</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500 bg-white"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (الرصيد: {formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">المبلغ المحول *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-black focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات التحويل</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="مثال: تغذية خزينة الموقع، إيداع مبيعات..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                تأكيد التحويل
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: جرد الخزينة الفعلي */}
      {showCountModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleCashCount}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <CheckSquare className="w-5 h-5 text-amber-600" />
                <span>جرد الخزينة الفعلي ومقارنة الرصيد</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCountModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">الخزينة المراد جردها *</label>
                <select
                  value={countAccountId}
                  onChange={(e) => setCountAccountId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500 bg-white"
                  required
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (الرصيد الدفتري المسجل: {formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">المبلغ الفعلي المعدود باليد *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={countedAmount}
                  onChange={(e) => setCountedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="المبلغ الموجود فعلياً بالدرج أو المحفظة"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-black focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">ملاحظات الجرد</label>
                <input
                  type="text"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  placeholder="مثال: جرد نهاية اليوم، استلام وردية..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCountModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-500/20 active:scale-95 transition-all"
              >
                تسجيل الجرد
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
