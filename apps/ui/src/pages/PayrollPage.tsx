import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  Users,
  Plus,
  Calendar,
  DollarSign,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Ban,
  Printer,
  Trash2,
  AlertTriangle,
  Wallet,
  FileText,
} from 'lucide-react';
import { ManagerPinModal } from '../components/ManagerPinModal';

export const PayrollPage: React.FC = () => {
  const { company } = useCompany();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);

  // Add Employee Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empDailyRate, setEmpDailyRate] = useState<number>(0);
  const [empPhone, setEmpPhone] = useState('');

  // Selected Employee Monthly Drawer
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1);
  const [monthData, setMonthData] = useState<any | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // New Transaction Form states
  const [txType, setTxType] = useState<'advance' | 'deduction' | 'bonus'>('advance');
  const [txAmount, setTxAmount] = useState<number>(0);
  const [txReason, setTxReason] = useState('');
  const [txCashAccountId, setTxCashAccountId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));

  // PIN Modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);

  // Print Slip
  const [showPrintSlip, setShowPrintSlip] = useState(false);

  useEffect(() => {
    loadEmployees();
    loadCashAccounts();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.getEmployees();
      setEmployees(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCashAccounts = async () => {
    try {
      const accounts = await api.getCashAccounts();
      setCashAccounts(accounts);
      if (accounts.length > 0) setTxCashAccountId(accounts[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenMonthDrawer = async (emp: any, y?: number, m?: number) => {
    setSelectedEmp(emp);
    const targetYear = y ?? currentYear;
    const targetMonth = m ?? currentMonth;
    setCurrentYear(targetYear);
    setCurrentMonth(targetMonth);
    setDrawerLoading(true);
    try {
      const data = await api.getEmployeeMonthSummary(emp.id, targetYear, targetMonth);
      setMonthData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handlePrevMonth = () => {
    let nextM = currentMonth - 1;
    let nextY = currentYear;
    if (nextM < 1) {
      nextM = 12;
      nextY -= 1;
    }
    if (selectedEmp) handleOpenMonthDrawer(selectedEmp, nextY, nextM);
  };

  const handleNextMonth = () => {
    let nextM = currentMonth + 1;
    let nextY = currentYear;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    if (selectedEmp) handleOpenMonthDrawer(selectedEmp, nextY, nextM);
  };

  const handleToggleAttendance = async (dateStr: string) => {
    if (!selectedEmp || !monthData) return;
    const currentRecord = monthData.attendanceMap[dateStr];
    let nextStatus = 'present';
    if (!currentRecord || currentRecord.status === 'absent') {
      nextStatus = 'present';
    } else if (currentRecord.status === 'present') {
      nextStatus = 'half';
    } else if (currentRecord.status === 'half') {
      nextStatus = 'leave';
    } else if (currentRecord.status === 'leave') {
      nextStatus = 'absent';
    }

    try {
      await api.recordEmployeeAttendanceDay(selectedEmp.id, {
        work_date: dateStr,
        status: nextStatus,
      });
      // Refresh summary
      const updated = await api.getEmployeeMonthSummary(selectedEmp.id, currentYear, currentMonth);
      setMonthData(updated);
    } catch (err: any) {
      alert(err.message || 'فشل تحديث الحضور');
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    if (txAmount <= 0) return alert('أدخل مبلغاً صحيحاً');
    if (!txReason.trim()) return alert('السبب إلزامي للخصم أو السلفة أو المكافأة');
    if (txType === 'advance' && !txCashAccountId) {
      return alert('اختر الخزينة/المحفظة/الحساب المنصرف منه السلفة');
    }

    try {
      await api.addEmployeeTransaction(selectedEmp.id, {
        tx_type: txType,
        tx_date: txDate,
        amount: txAmount,
        reason: txReason.trim(),
        cash_account_id: txType === 'advance' ? txCashAccountId : undefined,
        notes: txNotes.trim() || undefined,
      });
      // Reset form
      setTxAmount(0);
      setTxReason('');
      setTxNotes('');
      // Refresh month
      const updated = await api.getEmployeeMonthSummary(selectedEmp.id, currentYear, currentMonth);
      setMonthData(updated);
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الحركة');
    }
  };

  const handleDeleteTxPrompt = (txId: string) => {
    setDeleteTxId(txId);
    setShowPinModal(true);
  };

  const handleApprovalGranted = async (approvalId: string) => {
    setShowPinModal(false);
    if (!deleteTxId || !selectedEmp) return;
    try {
      await api.deleteEmployeeTransaction(deleteTxId, approvalId);
      const updated = await api.getEmployeeMonthSummary(selectedEmp.id, currentYear, currentMonth);
      setMonthData(updated);
      setDeleteTxId(null);
    } catch (err: any) {
      alert(err.message || 'فشل الحذف');
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) return;

    try {
      await api.createEmployee({
        name: empName.trim(),
        job_title: empJobTitle.trim() || undefined,
        daily_rate: empDailyRate,
        phone: empPhone.trim() || undefined,
      });
      setShowAddModal(false);
      setEmpName('');
      setEmpJobTitle('');
      setEmpDailyRate(0);
      setEmpPhone('');
      loadEmployees();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة الموظف');
    }
  };

  const monthName = new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('ar-EG', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            <span>إدارة الموظفين واليوميات والرواتب</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تقويم حضور تفاعلي، سلف ومكافآت وخصومات بأسباب إلزامية، وحساب آلي لصافي المستحق
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Employees Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-bold text-sm">جاري تحميل سجل الموظفين...</div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold text-sm">
            لا يوجد موظفون مسجلون حالياً. اضغط "إضافة موظف جديد" للبدء.
          </div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
              <tr>
                <th className="p-4 w-28">كود الموظف</th>
                <th className="p-4">الاسم الكامل</th>
                <th className="p-4">الوظيفة / التخصص</th>
                <th className="p-4">رقم الهاتف</th>
                <th className="p-4 text-center">قيمة اليومية (ج.م)</th>
                <th className="p-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr
                  key={emp.id}
                  onClick={() => handleOpenMonthDrawer(emp)}
                  className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <td className="p-4 font-mono font-bold text-blue-700">{emp.code || '—'}</td>
                  <td className="p-4 font-bold text-slate-800">{emp.name}</td>
                  <td className="p-4 text-slate-600">{emp.job_title || '—'}</td>
                  <td className="p-4 text-slate-600 font-mono text-xs">{emp.phone || '—'}</td>
                  <td className="p-4 text-center font-bold text-slate-900">
                    {emp.daily_rate.toLocaleString()} ج.م
                  </td>
                  <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenMonthDrawer(emp)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-xs transition-colors"
                    >
                      كشف الحساب الشهري
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <h3 className="font-bold text-sm">إضافة موظف جديد (كود تلقائي E000X)</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف الكامل *</label>
                <input
                  type="text"
                  required
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="مثال: أنس محمد إبراهيم"
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي / المهنة</label>
                <input
                  type="text"
                  value={empJobTitle}
                  onChange={(e) => setEmpJobTitle(e.target.value)}
                  placeholder="سائق لودر / عامل تشوين / محاسب..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">قيمة اليومية (ج.م) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min="0"
                    value={empDailyRate || ''}
                    onChange={(e) => setEmpDailyRate(parseFloat(e.target.value) || 0)}
                    placeholder="250"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-center outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="text"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    placeholder="010XXXXXXXX"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20"
                >
                  حفظ الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Selected Employee Monthly Drawer / Modal */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="sticky top-0 bg-slate-900 text-white p-4 px-6 flex items-center justify-between z-10 print:hidden">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-600 font-bold">{selectedEmp.code}</span>
                <span className="font-bold text-sm">{selectedEmp.name}</span>
                <span className="text-xs text-slate-400">({selectedEmp.job_title || 'موظف'} - اليومية: {selectedEmp.daily_rate} ج.م)</span>
              </div>

              {/* Month Navigator */}
              <div className="flex items-center gap-2 bg-slate-800 rounded-xl p-1">
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  title="الشهر التالي"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold px-2">{monthName}</span>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-slate-700 text-white rounded-lg transition-colors"
                  title="الشهر السابق"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintSlip(true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الكشف</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedEmp(null); setMonthData(null); }}
                  className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {drawerLoading || !monthData ? (
                <div className="py-16 text-center text-slate-500 font-bold text-sm">جاري تحميل بيانات الشهر...</div>
              ) : (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl">
                      <span className="text-[11px] font-bold text-blue-700 block mb-1">أيام الحضور</span>
                      <span className="text-xl font-black text-blue-900">{monthData.summary.totalDays} يوم</span>
                    </div>
                    <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                      <span className="text-[11px] font-bold text-emerald-700 block mb-1">المستحق باليومية</span>
                      <span className="text-xl font-black text-emerald-900">{monthData.summary.earnedAmount.toLocaleString()} ج.م</span>
                    </div>
                    <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl">
                      <span className="text-[11px] font-bold text-purple-700 block mb-1">المكافآت (+)</span>
                      <span className="text-xl font-black text-purple-900">{monthData.summary.totalBonuses.toLocaleString()} ج.م</span>
                    </div>
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl">
                      <span className="text-[11px] font-bold text-amber-700 block mb-1">السلفيات (-)</span>
                      <span className="text-xl font-black text-amber-900">{monthData.summary.totalAdvances.toLocaleString()} ج.م</span>
                    </div>
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-2xl col-span-2 sm:col-span-1">
                      <span className="text-[11px] font-bold text-rose-700 block mb-1">الخصومات (-)</span>
                      <span className="text-xl font-black text-rose-900">{monthData.summary.totalDeductions.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  {/* Net Payable Highlight Card */}
                  <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl flex items-center justify-between shadow-md">
                    <div>
                      <span className="text-xs text-indigo-200 font-bold">صافي الأجر المستحق للموظف عن شهر {monthName}:</span>
                      <div className="text-xs text-slate-400 mt-0.5">
                        [أيام {monthData.summary.totalDays} × {monthData.summary.dailyRate}] + مكافآت {monthData.summary.totalBonuses} − [سلف {monthData.summary.totalAdvances} + خصم {monthData.summary.totalDeductions}]
                      </div>
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                      {monthData.summary.netDue.toLocaleString()} ج.م
                    </div>
                  </div>

                  {/* Interactive Attendance Calendar Grid */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <h4 className="font-bold text-xs sm:text-sm text-slate-800">
                          تقويم حضور الشهر (اضغط على اليوم للتبديل السريع)
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] font-bold">
                        <span className="flex items-center gap-1 text-emerald-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> حاضر (1.0)
                        </span>
                        <span className="flex items-center gap-1 text-amber-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> نصف يوم (0.5)
                        </span>
                        <span className="flex items-center gap-1 text-rose-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> غياب (0.0)
                        </span>
                        <span className="flex items-center gap-1 text-blue-700">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span> إجازة (0.0)
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-16 gap-1.5 pt-1">
                      {Array.from({ length: monthData.daysInMonth }, (_, idx) => {
                        const dayNum = idx + 1;
                        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const record = monthData.attendanceMap[dateStr];
                        const status = record?.status || 'none';

                        let badgeBg = 'bg-white border-slate-200 text-slate-400';
                        if (status === 'present') badgeBg = 'bg-emerald-100 border-emerald-400 text-emerald-900 font-black';
                        else if (status === 'half') badgeBg = 'bg-amber-100 border-amber-400 text-amber-900 font-black';
                        else if (status === 'absent') badgeBg = 'bg-rose-100 border-rose-400 text-rose-900 font-black';
                        else if (status === 'leave') badgeBg = 'bg-blue-100 border-blue-400 text-blue-900 font-black';

                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => handleToggleAttendance(dateStr)}
                            className={`p-2 rounded-xl border text-center transition-all hover:scale-105 ${badgeBg}`}
                            title={`يوم ${dayNum}: ${status}`}
                          >
                            <span className="text-xs block font-bold">{dayNum}</span>
                            <span className="text-[10px] block font-mono">
                              {status === 'present' ? '1.0' : status === 'half' ? '0.5' : status === 'absent' ? 'غ' : status === 'leave' ? 'إ' : '—'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Transaction Box (Deductions, Advances, Bonuses) */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                    <h4 className="font-bold text-xs sm:text-sm text-slate-800">
                      تسجيل حركة مالية جديدة للموظف (السبب إلزامي لكافة العمليات)
                    </h4>
                    <form onSubmit={handleAddTransaction} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">نوع الحركة *</label>
                        <select
                          value={txType}
                          onChange={(e) => setTxType(e.target.value as any)}
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs font-bold outline-none"
                        >
                          <option value="advance">سلفة نقدية (-)</option>
                          <option value="deduction">خصم جزائي (-)</option>
                          <option value="bonus">مكافأة تشجيعية (+)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">المبلغ (ج.م) *</label>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          required
                          value={txAmount || ''}
                          onChange={(e) => setTxAmount(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs font-bold text-center outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">التاريخ</label>
                        <input
                          type="date"
                          value={txDate}
                          onChange={(e) => setTxDate(e.target.value)}
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs outline-none"
                        />
                      </div>

                      {txType === 'advance' ? (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">الخزينة المنصرف منها *</label>
                          <select
                            value={txCashAccountId}
                            onChange={(e) => setTxCashAccountId(e.target.value)}
                            className="w-full border border-slate-300 rounded-xl p-2 text-xs font-bold outline-none"
                            required
                          >
                            <option value="">-- اختر الخزينة --</option>
                            {cashAccounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="hidden md:block"></div>
                      )}

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">السبب الإلزامي *</label>
                        <input
                          type="text"
                          required
                          value={txReason}
                          onChange={(e) => setTxReason(e.target.value)}
                          placeholder="سبب الخصم أو السلفة أو المكافأة..."
                          className="w-full border border-slate-300 rounded-xl p-2 text-xs font-bold outline-none"
                        />
                      </div>

                      <div>
                        <button
                          type="submit"
                          className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
                        >
                          إضافة الحركة
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Transactions Lists (3 Columns) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Advances List */}
                    <div className="bg-amber-50/40 p-4 rounded-2xl border border-amber-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                        <span className="font-bold text-xs text-amber-900">سجل السلفيات ({monthData.advances.length})</span>
                        <span className="font-black text-xs text-amber-800">{monthData.summary.totalAdvances.toLocaleString()} ج.م</span>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {monthData.advances.length === 0 ? (
                          <div className="text-[11px] text-slate-400 text-center py-4">لا توجد سلفيات في هذا الشهر</div>
                        ) : (
                          monthData.advances.map((tx: any) => (
                            <div key={tx.id} className="p-2.5 bg-white rounded-xl border border-amber-100 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-bold text-slate-800">{tx.amount.toLocaleString()} ج.م</div>
                                <div className="text-[10px] text-slate-500">{tx.tx_date} • {tx.reason}</div>
                                {tx.cash_account_name && <div className="text-[10px] text-amber-700">خزينة: {tx.cash_account_name}</div>}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteTxPrompt(tx.id)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="حذف بإذن المدير"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Deductions List */}
                    <div className="bg-rose-50/40 p-4 rounded-2xl border border-rose-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                        <span className="font-bold text-xs text-rose-900">سجل الخصومات ({monthData.deductions.length})</span>
                        <span className="font-black text-xs text-rose-800">{monthData.summary.totalDeductions.toLocaleString()} ج.م</span>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {monthData.deductions.length === 0 ? (
                          <div className="text-[11px] text-slate-400 text-center py-4">لا توجد خصومات في هذا الشهر</div>
                        ) : (
                          monthData.deductions.map((tx: any) => (
                            <div key={tx.id} className="p-2.5 bg-white rounded-xl border border-rose-100 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-bold text-rose-700">{tx.amount.toLocaleString()} ج.م</div>
                                <div className="text-[10px] text-slate-500">{tx.tx_date} • السبب: {tx.reason}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteTxPrompt(tx.id)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="حذف بإذن المدير"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Bonuses List */}
                    <div className="bg-purple-50/40 p-4 rounded-2xl border border-purple-200 space-y-2">
                      <div className="flex items-center justify-between border-b border-purple-200 pb-2">
                        <span className="font-bold text-xs text-purple-900">سجل المكافآت ({monthData.bonuses.length})</span>
                        <span className="font-black text-xs text-purple-800">{monthData.summary.totalBonuses.toLocaleString()} ج.م</span>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {monthData.bonuses.length === 0 ? (
                          <div className="text-[11px] text-slate-400 text-center py-4">لا توجد مكافآت في هذا الشهر</div>
                        ) : (
                          monthData.bonuses.map((tx: any) => (
                            <div key={tx.id} className="p-2.5 bg-white rounded-xl border border-purple-100 flex items-center justify-between text-xs">
                              <div>
                                <div className="font-bold text-purple-700">+{tx.amount.toLocaleString()} ج.م</div>
                                <div className="text-[10px] text-slate-500">{tx.tx_date} • السبب: {tx.reason}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteTxPrompt(tx.id)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                                title="حذف بإذن المدير"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Monthly Slip Modal (Matching Legacy "حساب انس محمد" style) */}
      {showPrintSlip && selectedEmp && monthData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden p-8 space-y-6 animate-in fade-in zoom-in duration-150">
            {/* Top Action Bar */}
            <div className="flex items-center justify-between border-b pb-4 border-slate-200 print:hidden">
              <span className="font-bold text-sm text-slate-800">معاينة كشف حساب الراتب الشهري للطباعة</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة فورية</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintSlip(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Slip Paper Layout */}
            <div className="space-y-6 text-right">
              {/* Slip Header */}
              <div className="text-center border-b pb-4 border-slate-200">
                <h3 className="text-lg font-black text-slate-900">{company.name_ar}</h3>
                <h4 className="text-sm font-bold text-blue-700 mt-1">
                  كشف حساب راتب الموظف: {selectedEmp.name} ({selectedEmp.code})
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">عن شهر: {monthName}</p>
              </div>

              {/* Employee Summary Info */}
              <div className="grid grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 font-bold block">الوظيفة:</span>
                  <span className="font-bold text-slate-800">{selectedEmp.job_title || 'موظف'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">قيمة اليومية:</span>
                  <span className="font-black text-slate-800 font-mono">{selectedEmp.daily_rate} ج.م</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">إجمالي أيام العمل:</span>
                  <span className="font-black text-blue-700 font-mono">{monthData.summary.totalDays} يوم</span>
                </div>
              </div>

              {/* Detailed Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">البيان والتفاصيل</th>
                      <th className="p-3 text-center">الأيام / المعامل</th>
                      <th className="p-3 text-center">المستحق له (+)</th>
                      <th className="p-3 text-center">المستقطع منه (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-3 font-bold text-slate-800">أجر العمل الفعلي باليومية</td>
                      <td className="p-3 text-center font-mono">{monthData.summary.totalDays} يوم × {selectedEmp.daily_rate}</td>
                      <td className="p-3 text-center font-bold text-emerald-700">{monthData.summary.earnedAmount.toLocaleString()}</td>
                      <td className="p-3 text-center text-slate-400">—</td>
                    </tr>
                    {monthData.bonuses.map((b: any, idx: number) => (
                      <tr key={`b-${idx}`}>
                        <td className="p-3 text-slate-700">مكافأة: {b.reason} ({b.tx_date})</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                        <td className="p-3 text-center font-bold text-purple-700">+{b.amount.toLocaleString()}</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                      </tr>
                    ))}
                    {monthData.advances.map((a: any, idx: number) => (
                      <tr key={`a-${idx}`}>
                        <td className="p-3 text-slate-700">سلفة نقدية: {a.reason} ({a.tx_date})</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                        <td className="p-3 text-center font-bold text-amber-700">-{a.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    {monthData.deductions.map((d: any, idx: number) => (
                      <tr key={`d-${idx}`}>
                        <td className="p-3 text-slate-700">خصم جزائي: {d.reason} ({d.tx_date})</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                        <td className="p-3 text-center text-slate-400">—</td>
                        <td className="p-3 text-center font-bold text-rose-700">-{d.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-black border-t-2 border-slate-200">
                    <tr>
                      <td className="p-3" colSpan={2}>صافي المبلغ المستحق صرفه للموظف:</td>
                      <td className="p-3 text-center text-emerald-700 text-sm font-mono" colSpan={2}>
                        {monthData.summary.netDue.toLocaleString()} ج.م
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-8 flex justify-between items-center text-xs text-slate-500">
                <div>توقيع الموظف المستلم: ................................</div>
                <div>توقيع المدير المسؤول: ................................</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal for Transaction Deletion */}
      <ManagerPinModal
        isOpen={showPinModal}
        defaultTable="employee_transactions"
        defaultId={deleteTxId || ''}
        onApprovalGranted={handleApprovalGranted}
        onClose={() => { setShowPinModal(false); setDeleteTxId(null); }}
      />
    </div>
  );
};
