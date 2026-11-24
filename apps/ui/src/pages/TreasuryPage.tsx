import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  Wallet,
  ArrowLeftRight,
  CheckSquare,
  X,
  Plus,
  Landmark,
  CreditCard,
  DollarSign,
  Calendar,
  AlertTriangle,
  FileText,
  Lock,
  Power,
  Trash2,
  RefreshCw,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
} from 'lucide-react';

export const TreasuryPage: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode: 'list' or 'detail'
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementDirection, setMovementDirection] = useState<'in' | 'out'>('in');

  // New Account Form
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'cash' | 'wallet' | 'bank' | 'other'>('cash');
  const [newOpeningBalance, setNewOpeningBalance] = useState<number>(0);
  const [newBankNumber, setNewBankNumber] = useState('');
  const [newBankName, setNewBankName] = useState('');

  // Transfer Form
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState('');

  // Count Form
  const [countAccountId, setCountAccountId] = useState('');
  const [countedAmount, setCountedAmount] = useState<number>(0);
  const [countNotes, setCountNotes] = useState('');

  // Movement Form (Manual Deposit / Withdrawal)
  const [movementAmount, setMovementAmount] = useState<number>(0);
  const [movementNote, setMovementNote] = useState('');
  const [movementDate, setMovementDate] = useState(new Date().toISOString().slice(0, 10));

  // Statement Data for Selected Account
  const [statementData, setStatementData] = useState<any | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementSearch, setStatementSearch] = useState('');
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

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
      // If currently viewing an account, refresh its object
      if (selectedAccount) {
        const updated = res.find((a: any) => a.id === selectedAccount.id);
        if (updated) setSelectedAccount(updated);
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
        bank_name: newBankName.trim() || undefined,
        bank_number: newBankNumber.trim() || undefined,
      });
      setShowAddModal(false);
      setNewName('');
      setNewKind('cash');
      setNewOpeningBalance(0);
      setNewBankName('');
      setNewBankNumber('');
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

  const handleDeleteAccount = async (acc: any) => {
    const ok = window.confirm(
      `هل أنت متأكد من حذف خزينة "${acc.name}" نهائياً من النظام؟\nلن تظهر في قائمة الخزائن مرة أخرى.`
    );
    if (!ok) return;

    try {
      await api.deleteCashAccount(acc.id);
      if (selectedAccount?.id === acc.id) {
        setViewMode('list');
        setSelectedAccount(null);
      }
      loadAccounts();
    } catch (err: any) {
      alert(err.message || 'فشل حذف الخزينة');
    }
  };

  const handleOpenAccountDetail = async (acc: any) => {
    setSelectedAccount(acc);
    setViewMode('detail');
    setStatementLoading(true);
    try {
      const res = await api.getCashAccountStatement(acc.id);
      setStatementData(res);
      // Auto expand the latest year & month
      if (res && res.timeline && res.timeline.length > 0) {
        const latest = res.timeline[res.timeline.length - 1];
        const date = new Date(latest.occurred_at);
        const y = String(date.getFullYear());
        const m = `${y}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        setExpandedYears({ [y]: true });
        setExpandedMonths({ [m]: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatementLoading(false);
    }
  };

  const reloadStatement = async (accId: string) => {
    setStatementLoading(true);
    try {
      const res = await api.getCashAccountStatement(accId);
      setStatementData(res);
      loadAccounts();
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
      if (selectedAccount) reloadStatement(selectedAccount.id);
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
      if (selectedAccount) reloadStatement(selectedAccount.id);
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الجرد');
    }
  };

  const handleRecordMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount || movementAmount <= 0) return;

    try {
      await api.recordCashMovement({
        cash_account_id: selectedAccount.id,
        direction: movementDirection,
        amount: movementAmount,
        note: movementNote.trim() || undefined,
        movement_date: movementDate,
      });
      setShowMovementModal(false);
      setMovementAmount(0);
      setMovementNote('');
      reloadStatement(selectedAccount.id);
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الحركة النقدية');
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

  const totalLiquidity = useMemo(() => {
    return accounts.reduce((acc, curr) => acc + (curr.is_active ? Number(curr.balance || 0) : 0), 0);
  }, [accounts]);

  const activeAccountsCount = useMemo(() => {
    return accounts.filter((a) => a.is_active).length;
  }, [accounts]);

  // Hierarchical grouping for selected account statement (Year -> Month -> Day)
  const hierarchicalTimeline = useMemo(() => {
    if (!statementData || !statementData.timeline) return [];

    let filtered = statementData.timeline;
    if (statementSearch.trim()) {
      const q = statementSearch.trim().toLowerCase();
      filtered = filtered.filter(
        (t: any) =>
          (t.title && t.title.toLowerCase().includes(q)) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.move_type && t.move_type.toLowerCase().includes(q))
      );
    }

    // Group by Year -> Month -> Day
    const yearsMap: Record<string, any> = {};

    filtered.forEach((tx: any) => {
      const date = new Date(tx.occurred_at);
      const y = String(date.getFullYear());
      const mNum = String(date.getMonth() + 1).padStart(2, '0');
      const mKey = `${y}-${mNum}`;
      const mName = date.toLocaleDateString('ar-EG', { month: 'long' });
      const dKey = date.toISOString().slice(0, 10);

      if (!yearsMap[y]) {
        yearsMap[y] = {
          year: y,
          totalIn: 0,
          totalOut: 0,
          months: {},
        };
      }
      yearsMap[y].totalIn += Number(tx.amount_in || 0);
      yearsMap[y].totalOut += Number(tx.amount_out || 0);

      if (!yearsMap[y].months[mKey]) {
        yearsMap[y].months[mKey] = {
          monthKey: mKey,
          monthName: mName,
          totalIn: 0,
          totalOut: 0,
          days: {},
        };
      }
      yearsMap[y].months[mKey].totalIn += Number(tx.amount_in || 0);
      yearsMap[y].months[mKey].totalOut += Number(tx.amount_out || 0);

      if (!yearsMap[y].months[mKey].days[dKey]) {
        yearsMap[y].months[mKey].days[dKey] = {
          dateStr: dKey,
          items: [],
        };
      }
      yearsMap[y].months[mKey].days[dKey].items.push(tx);
    });

    return Object.values(yearsMap).map((yObj: any) => ({
      ...yObj,
      months: Object.values(yObj.months).map((mObj: any) => ({
        ...mObj,
        days: Object.values(mObj.days),
      })),
    }));
  }, [statementData, statementSearch]);

  const toggleYear = (year: string) => {
    setExpandedYears((prev) => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const getMoveTypeBadge = (type: string) => {
    switch (type) {
      case 'sales_payment':
      case 'sales':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 font-medium">مبيعات/تحصيل</span>;
      case 'purchase_payment':
      case 'purchase':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-medium">مشتريات/سداد</span>;
      case 'expense':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-800 font-medium">مصروف مكان/معدات</span>;
      case 'employee_advance':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800 font-medium">سلفة موظف</span>;
      case 'transfer_in':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-100 text-cyan-800 font-medium">تحويل وارد</span>;
      case 'transfer_out':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-800 font-medium">تحويل صادر</span>;
      case 'manual_deposit':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">إيداع يدوي</span>;
      case 'manual_withdrawal':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800 font-medium">سحب يدوي</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800 font-medium">حركة نقدية</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* ===================== VIEW 1: ACCOUNTS LIST VIEW ===================== */}
      {viewMode === 'list' && (
        <>
          {/* Top Banner & KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">إجمالي السيولة الحالية</p>
                <h3 className="text-2xl font-bold text-gray-900">{formatMoney(totalLiquidity)}</h3>
                <p className="text-xs text-gray-400 mt-1">مجموع أرصدة جميع الخزائن والحسابات النشطة</p>
              </div>
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                <Wallet className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">عدد الحسابات النشطة</p>
                <h3 className="text-2xl font-bold text-gray-900">{activeAccountsCount} خزائن</h3>
                <p className="text-xs text-gray-400 mt-1">من إجمالي {accounts.length} حساب مسجل</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                <Landmark className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-center space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition"
                >
                  <Plus className="w-4 h-4" />
                  إضافة خزنة
                </button>
                <button
                  onClick={() => setShowTransferModal(true)}
                  disabled={accounts.length < 2}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold hover:bg-indigo-100 transition disabled:opacity-50"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  تحويل أموال
                </button>
              </div>
              <button
                onClick={() => setShowCountModal(true)}
                disabled={accounts.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-medium hover:bg-gray-100 transition disabled:opacity-50"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                جرد خزينة
              </button>
            </div>
          </div>

          {/* Accounts Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">سجل الخزائن والحسابات النقدية</h3>
                <p className="text-xs text-gray-500 mt-0.5">انقر على أي خزينة لفتح صفحتها المستقلة وكشف الحساب الهرمي</p>
              </div>
              <button
                onClick={loadAccounts}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition"
                title="تحديث البيانات"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-400">جاري تحميل الخزائن...</div>
            ) : accounts.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <Wallet className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">لا توجد أي خزائن أو حسابات مسجلة بعد</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition"
                >
                  + إضافة أول خزنة
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
                    <tr>
                      <th className="py-3 px-4">الخزنة</th>
                      <th className="py-3 px-4">رقم الخزنة / الحساب</th>
                      <th className="py-3 px-4">النوع</th>
                      <th className="py-3 px-4">ملاحظات / البنك</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4">الرصيد الحالي</th>
                      <th className="py-3 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map((acc) => {
                      const kind = getKindDetails(acc.kind);
                      const Icon = kind.icon;
                      const bal = Number(acc.balance || 0);

                      return (
                        <tr
                          key={acc.id}
                          className="hover:bg-gray-50/70 transition cursor-pointer"
                          onClick={() => handleOpenAccountDetail(acc)}
                        >
                          <td className="py-4 px-4 font-bold text-gray-900 flex items-center gap-3">
                            <div className={`p-2 rounded-xl border ${kind.color}`}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span>{acc.name}</span>
                          </td>
                          <td className="py-4 px-4 text-gray-600 font-mono text-xs">
                            {acc.bank_number || acc.id.slice(0, 8)}
                          </td>
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${kind.color}`}>
                              {kind.label}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-gray-500 text-xs">
                            {acc.bank_name || '—'}
                          </td>
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                acc.is_active
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-gray-100 text-gray-500 border border-gray-200'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${acc.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                              {acc.is_active ? 'نشط' : 'معطل'}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-bold text-base" dir="ltr">
                            <span className={bal >= 0 ? 'text-gray-900' : 'text-red-600'}>
                              {formatMoney(bal)}
                            </span>
                          </td>
                          <td className="py-4 px-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleOpenAccountDetail(acc)}
                                className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold transition"
                              >
                                عرض
                              </button>
                              <button
                                onClick={() => handleToggleActive(acc)}
                                className={`p-1.5 rounded-lg border transition ${
                                  acc.is_active
                                    ? 'border-gray-200 text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                                    : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={acc.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteAccount(acc)}
                                className="p-1.5 border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="حذف الخزينة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ===================== VIEW 2: SINGLE ACCOUNT PAGE (DETAILED) ===================== */}
      {viewMode === 'detail' && selectedAccount && (
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <button
              onClick={() => {
                setViewMode('list');
                setSelectedAccount(null);
                setStatementData(null);
              }}
              className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition text-sm font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              العودة لقائمة الخزائن
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setMovementDirection('in');
                  setShowMovementModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition"
              >
                <ArrowDownLeft className="w-4 h-4" />
                + تسجيل إيداع نقدي
              </button>
              <button
                onClick={() => {
                  setMovementDirection('out');
                  setShowMovementModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition"
              >
                <ArrowUpRight className="w-4 h-4" />
                - تسجيل سحب نقدي
              </button>
              <button
                onClick={() => reloadStatement(selectedAccount.id)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
                title="تحديث كشف الحساب"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Account Header Details Card */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl border ${getKindDetails(selectedAccount.kind).color}`}>
                  {React.createElement(getKindDetails(selectedAccount.kind).icon, { className: 'w-8 h-8' })}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-gray-900">{selectedAccount.name}</h2>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        selectedAccount.is_active
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${selectedAccount.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                      {selectedAccount.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    كود / رقم: <span className="font-mono text-gray-600">{selectedAccount.bank_number || selectedAccount.id.slice(0, 8)}</span>
                    {selectedAccount.bank_name && <span className="mr-3">| بنك: {selectedAccount.bank_name}</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* 3 Top Cards for Account: Liquidity, Total In, Total Out */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
              <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl">
                <p className="text-xs font-bold text-emerald-800 mb-1">السيولة الحالية (الرصيد)</p>
                <h4 className="text-2xl font-black text-emerald-700" dir="ltr">
                  {formatMoney(statementData?.current_balance ?? selectedAccount.balance)}
                </h4>
                <p className="text-[11px] text-emerald-600 mt-1">رصيد أول المدة: {formatMoney(selectedAccount.opening_balance)}</p>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                <p className="text-xs font-bold text-blue-800 mb-1">إجمالي الحركات الداخلة (إيداعات)</p>
                <h4 className="text-2xl font-black text-blue-700" dir="ltr">
                  {formatMoney(statementData?.total_in || 0)}
                </h4>
                <p className="text-[11px] text-blue-600 mt-1">مبيعات، تحصيلات، إيداعات يدوية وتحويلات</p>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl">
                <p className="text-xs font-bold text-rose-800 mb-1">إجمالي الحركات الخارجة (سحوبات)</p>
                <h4 className="text-2xl font-black text-rose-700" dir="ltr">
                  {formatMoney(statementData?.total_out || 0)}
                </h4>
                <p className="text-[11px] text-rose-600 mt-1">مشتريات، مصاريف، سلف وسحوبات يدوية</p>
              </div>
            </div>
          </div>

          {/* Hierarchical Statement Tree (سنة ← شهر ← يوم ← حركات) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">كشف الحساب وسجل العمليات</h3>
                <p className="text-xs text-gray-500 mt-0.5">شجرة العمليات مقسمة هرمياً حسب السنة والشهر واليوم</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="بحث في العمليات أو الوصف..."
                  value={statementSearch}
                  onChange={(e) => setStatementSearch(e.target.value)}
                  className="w-full pl-3 pr-9 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {statementLoading ? (
              <div className="py-12 text-center text-gray-400">جاري تحميل حركات كشف الحساب...</div>
            ) : hierarchicalTimeline.length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p>لا توجد حركات مسجلة لهذا الحساب</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hierarchicalTimeline.map((yGroup: any) => {
                  const isYExpanded = expandedYears[yGroup.year] !== false; // default true if not false
                  return (
                    <div key={yGroup.year} className="border border-gray-200 rounded-2xl overflow-hidden">
                      {/* Year Header */}
                      <button
                        onClick={() => toggleYear(yGroup.year)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100/80 transition text-right"
                      >
                        <div className="flex items-center gap-3">
                          {isYExpanded ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
                          <span className="font-black text-gray-900 text-base">سنة {yGroup.year}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-semibold">
                          <span className="text-emerald-700">وارد: {formatMoney(yGroup.totalIn)}</span>
                          <span className="text-red-700">صادر: {formatMoney(yGroup.totalOut)}</span>
                        </div>
                      </button>

                      {/* Months in Year */}
                      {isYExpanded && (
                        <div className="p-4 space-y-3 bg-white">
                          {yGroup.months.map((mGroup: any) => {
                            const isMExpanded = expandedMonths[mGroup.monthKey] !== false;
                            return (
                              <div key={mGroup.monthKey} className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/30">
                                {/* Month Header */}
                                <button
                                  onClick={() => toggleMonth(mGroup.monthKey)}
                                  className="w-full flex items-center justify-between p-3 bg-gray-100/50 hover:bg-gray-100 transition text-right"
                                >
                                  <div className="flex items-center gap-2">
                                    {isMExpanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                    <span className="font-bold text-gray-800 text-sm">{mGroup.monthName} ({mGroup.monthKey})</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs">
                                    <span className="text-emerald-600 font-semibold">+{formatMoney(mGroup.totalIn)}</span>
                                    <span className="text-rose-600 font-semibold">-{formatMoney(mGroup.totalOut)}</span>
                                  </div>
                                </button>

                                {/* Days in Month */}
                                {isMExpanded && (
                                  <div className="p-3 space-y-3">
                                    {mGroup.days.map((dGroup: any) => (
                                      <div key={dGroup.dateStr} className="space-y-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
                                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                          <span>يوم {new Date(dGroup.dateStr).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'numeric', day: 'numeric' })}</span>
                                        </div>

                                        {/* Transactions in Day */}
                                        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden bg-white">
                                          {dGroup.items.map((tx: any, idx: number) => {
                                            const inAmt = Number(tx.amount_in || 0);
                                            const outAmt = Number(tx.amount_out || 0);
                                            const timeStr = new Date(tx.occurred_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

                                            return (
                                              <div key={tx.document_id || idx} className="p-3 flex items-center justify-between hover:bg-gray-50 transition text-sm">
                                                <div className="flex items-center gap-3">
                                                  <span className="text-xs text-gray-400 font-mono">{timeStr}</span>
                                                  {getMoveTypeBadge(tx.move_type)}
                                                  <div>
                                                    <p className="font-bold text-gray-900 text-xs">{tx.title}</p>
                                                    {tx.description && <p className="text-[11px] text-gray-500 mt-0.5">{tx.description}</p>}
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-6 text-left" dir="ltr">
                                                  <div className="w-24 text-right">
                                                    {inAmt > 0 && <span className="font-bold text-emerald-600">+{formatMoney(inAmt)}</span>}
                                                    {outAmt > 0 && <span className="font-bold text-rose-600">-{formatMoney(outAmt)}</span>}
                                                  </div>
                                                  <div className="w-28 text-right border-r pr-3 border-gray-100">
                                                    <span className="text-xs font-mono text-gray-700">
                                                      {formatMoney(tx.running_balance)}
                                                    </span>
                                                    <p className="text-[10px] text-gray-400">الرصيد</p>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== MODAL 1: ADD CASH ACCOUNT ===================== */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              إضافة خزنة أو حساب جديد
            </h3>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">اسم الخزنة / الحساب *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الخزينة الرئيسية، فودافون كاش، بنك مصر"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">نوع الحساب</label>
                <select
                  value={newKind}
                  onChange={(e: any) => setNewKind(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="cash">خزينة نقدية (كاش في الدرج)</option>
                  <option value="wallet">محفظة إلكترونية (فودافون كاش، انستاباي...)</option>
                  <option value="bank">حساب بنكي</option>
                  <option value="other">حساب آخر</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">رقم الحساب / رقم المحفظة (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: 01012345678 أو رقم الآيبان"
                  value={newBankNumber}
                  onChange={(e) => setNewBankNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">اسم البنك / الجهة (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: البنك الأهلي المصري، فودافون"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">رصيد أول المدة (ج.م)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  حفظ الخزنة
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 2: MANUAL MOVEMENT (DEPOSIT / WITHDRAWAL) ===================== */}
      {showMovementModal && selectedAccount && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowMovementModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              {movementDirection === 'in' ? (
                <>
                  <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
                  تسجيل إيداع نقدي في الخزينة
                </>
              ) : (
                <>
                  <ArrowUpRight className="w-5 h-5 text-rose-600" />
                  تسجيل سحب نقدي من الخزينة
                </>
              )}
            </h3>
            <p className="text-xs text-gray-500 mb-4">الخزنة المستهدفة: {selectedAccount.name}</p>

            <form onSubmit={handleRecordMovement} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={movementAmount || ''}
                  onChange={(e) => setMovementAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">تاريخ الحركة</label>
                <input
                  type="date"
                  required
                  value={movementDate}
                  onChange={(e) => setMovementDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">البيان / ملاحظات الحركة *</label>
                <input
                  type="text"
                  required
                  placeholder={movementDirection === 'in' ? 'مثال: تغذية الخزينة من الشريك' : 'مثال: سحب نقدي للمصاريف الإدارية'}
                  value={movementNote}
                  onChange={(e) => setMovementNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className={`flex-1 py-2 px-4 text-white rounded-xl text-sm font-bold shadow-sm transition ${
                    movementDirection === 'in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {movementDirection === 'in' ? 'تأكيد الإيداع' : 'تأكيد السحب'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 3: TRANSFER BETWEEN ACCOUNTS ===================== */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowTransferModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-indigo-600" />
              تحويل أموال بين الخزائن
            </h3>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">من الخزينة (المُحوِّل منها)</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.is_active}>
                      {a.name} ({formatMoney(a.balance)}) {!a.is_active && '(معطل)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">إلى الخزينة (المُحوَّل إليها)</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id} disabled={!a.is_active || a.id === fromId}>
                      {a.name} ({formatMoney(a.balance)}) {!a.is_active && '(معطل)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">المبلغ المحول (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={transferAmount || ''}
                  onChange={(e) => setTransferAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ملاحظات / سبب التحويل</label>
                <input
                  type="text"
                  placeholder="مثال: تغذية الخزينة الفرعية"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  تأكيد التحويل
                </button>
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 4: CASH COUNT ===================== */}
      {showCountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowCountModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-gray-700" />
              جرد الخزينة الفعلي
            </h3>
            <form onSubmit={handleCashCount} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">الخزينة المراد جردها</label>
                <select
                  value={countAccountId}
                  onChange={(e) => setCountAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (الرصيد الدفتري: {formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">المبلغ الفعلي المعدود (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0"
                  value={countedAmount || ''}
                  onChange={(e) => setCountedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">ملاحظات الجرد</label>
                <input
                  type="text"
                  placeholder="مثال: جرد نهاية اليوم / جرد مفاجئ"
                  value={countNotes}
                  onChange={(e) => setCountNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  تسجيل الجرد
                </button>
                <button
                  type="button"
                  onClick={() => setShowCountModal(false)}
                  className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
