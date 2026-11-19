import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { UserCheck, Plus, Calendar, DollarSign, X, CheckCircle2 } from 'lucide-react';

export const PayrollPage: React.FC = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);

  // New Employee
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [dailyRate, setDailyRate] = useState<number>(0);
  const [phone, setPhone] = useState('');
  const [openingDebt, setOpeningDebt] = useState<number>(0);

  // Quick Attendance Form
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attFraction, setAttFraction] = useState<number>(1);
  const [attAdvance, setAttAdvance] = useState<number>(0);
  const [attEmpId, setAttEmpId] = useState('');

  // Settlement Calculation
  const [settleStart, setSettleStart] = useState(
    new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [settleEnd, setSettleEnd] = useState(new Date().toISOString().split('T')[0]);
  const [settleData, setSettleData] = useState<any | null>(null);
  const [bonus, setBonus] = useState<number>(0);
  const [deduction, setDeduction] = useState<number>(0);
  const [debtRepay, setDebtRepay] = useState<number>(0);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.getEmployees();
      setEmployees(res);
      if (res.length > 0) setAttEmpId(res[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await api.createEmployee({
        name,
        job_title: jobTitle,
        daily_rate: dailyRate,
        phone,
        opening_debt: openingDebt,
      });
      setShowAddEmpModal(false);
      setName('');
      setJobTitle('');
      setDailyRate(0);
      setOpeningDebt(0);
      loadEmployees();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة الموظف');
    }
  };

  const handleRecordAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attEmpId) return;

    try {
      await api.recordAttendance([
        {
          employeeId: attEmpId,
          attendanceDate,
          fraction: attFraction,
          advanceAmount: attAdvance > 0 ? attAdvance : undefined,
        },
      ]);
      alert('تم تسجيل يومية الحضور والسلفة النقدية بنجاح!');
      setAttAdvance(0);
      loadEmployees();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل الحضور');
    }
  };

  const handleOpenSettle = async (emp: any) => {
    setSelectedEmp(emp);
    setShowSettleModal(true);
    try {
      const res = await api.getEmployeeStatement(emp.id, settleStart, settleEnd);
      setSettleData(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinalizeSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;

    try {
      await api.settlePayroll({
        employeeId: selectedEmp.id,
        periodStart: settleStart,
        periodEnd: settleEnd,
        bonuses: bonus,
        deductions: deduction,
        debtRepayment: debtRepay,
      });
      alert('تم صرف وتسوية راتب الموظف وترحيل القيد المحاسبي بنجاح!');
      setShowSettleModal(false);
      setBonus(0);
      setDeduction(0);
      setDebtRepay(0);
      loadEmployees();
    } catch (err: any) {
      alert(err.message || 'فشل تسوية الراتب');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-blue-600" />
            <span>الموظفين والرواتب الأسبوعية (الجمعة — الخميس)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            تسجيل اليومية، سلف العمال، وتسوية حسابات الموظفين وسداد الديون السابقة
          </p>
        </div>

        <button
          onClick={() => setShowAddEmpModal(true)}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة موظف جديد</span>
        </button>
      </div>

      {/* Quick Attendance Widget */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 rounded-2xl shadow-md border border-blue-900">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-400" />
          <span>تسجيل الحضور والسلفة اليومية السريعة</span>
        </h3>

        <form onSubmit={handleRecordAttendance} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-slate-900">
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1">الموظف *</label>
            <select
              value={attEmpId}
              onChange={(e) => setAttEmpId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
              required
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.daily_rate} ج.م/يوم)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1">تاريخ اليومية</label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1">نسبة الحضور</label>
            <select
              value={attFraction}
              onChange={(e) => setAttFraction(parseFloat(e.target.value))}
              className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold"
            >
              <option value="1">يوم كامل (1.0)</option>
              <option value="0.5">نصف يوم (0.5)</option>
              <option value="2">يومان / إضافي (2.0)</option>
              <option value="0">غياب (0.0)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1">سلفة نقدية اليوم (ج.م)</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0"
                value={attAdvance || ''}
                onChange={(e) => setAttAdvance(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full border border-slate-300 rounded-lg p-2 text-xs font-bold text-center"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg font-bold text-xs shrink-0 shadow"
              >
                تسجيل
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Employees Directory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">اسم الموظف</th>
              <th className="p-4">الوظيفة</th>
              <th className="p-4">رقم الهاتف</th>
              <th className="p-4 text-center">اليومية (ج.م)</th>
              <th className="p-4 text-center">الدين السابق (سلف)</th>
              <th className="p-4 text-center">تسوية الراتب</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  جاري تحميل الموظفين...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  لا يوجد موظفون مسجلون
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-bold text-slate-800">{emp.name}</td>
                  <td className="p-4 text-slate-600 text-xs">{emp.job_title || 'عامل'}</td>
                  <td className="p-4 text-slate-500 font-mono text-xs">{emp.phone || '—'}</td>
                  <td className="p-4 text-center font-bold text-slate-900">
                    {emp.daily_rate.toLocaleString()} ج.م
                  </td>
                  <td className="p-4 text-center">
                    {emp.opening_debt > 0 ? (
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {emp.opening_debt.toLocaleString()} ج.م
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleOpenSettle(emp)}
                      className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs"
                    >
                      تسوية وحساب
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Settle Payroll Modal */}
      {showSettleModal && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-800">
                  تسوية أجور: {selectedEmp.name}
                </h3>
                <p className="text-xs text-slate-500">اليومية: {selectedEmp.daily_rate} ج.م</p>
              </div>
              <button onClick={() => setShowSettleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span>أيام العمل المحسوبة:</span>
                <strong className="font-bold text-blue-800">{settleData?.totalDays || 0} يوم</strong>
              </div>
              <div className="flex justify-between">
                <span>إجمالي المستحق عن الأيام:</span>
                <strong>{settleData?.totalEarned?.toLocaleString() || 0} ج.م</strong>
              </div>
              <div className="flex justify-between text-rose-700">
                <span>إجمالي السلف المسحوبة:</span>
                <strong>- {settleData?.advances?.toLocaleString() || 0} ج.م</strong>
              </div>
              {selectedEmp.opening_debt > 0 && (
                <div className="flex justify-between text-amber-800">
                  <span>الدين السابق المتبقي:</span>
                  <strong>{selectedEmp.opening_debt.toLocaleString()} ج.م</strong>
                </div>
              )}
            </div>

            <form onSubmit={handleFinalizeSettle} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">مكافأة (+)</label>
                  <input
                    type="number"
                    value={bonus || ''}
                    onChange={(e) => setBonus(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">خصومات (-)</label>
                  <input
                    type="number"
                    value={deduction || ''}
                    onChange={(e) => setDeduction(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold text-rose-700"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">سداد من الدين</label>
                  <input
                    type="number"
                    value={debtRepay || ''}
                    onChange={(e) => setDebtRepay(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border border-slate-300 rounded p-1.5 text-xs text-center font-bold text-amber-700"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex justify-between items-center">
                <span className="text-xs font-bold text-blue-900">صافي المستحق للصرف نقداً:</span>
                <span className="text-xl font-black text-blue-900">
                  {(
                    (settleData?.totalEarned || 0) +
                    bonus -
                    ((settleData?.advances || 0) + deduction + debtRepay)
                  ).toLocaleString()}{' '}
                  ج.م
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  صرف الراتب وترحيل القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Employee Modal */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة موظف / عامل جديد</h3>
              <button onClick={() => setShowAddEmpModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المسمى الوظيفي</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="سائق لودر، غفير، عامل تشوين..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سعر اليومية (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  value={dailyRate || ''}
                  onChange={(e) => setDailyRate(parseFloat(e.target.value) || 0)}
                  placeholder="250"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-base font-bold text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الدين السابق / الرصيد الافتتاحي (ج.م)</label>
                <input
                  type="number"
                  step="any"
                  value={openingDebt || ''}
                  onChange={(e) => setOpeningDebt(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm text-center"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  حفظ الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

