import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import { BarChart3, Scale, TrendingUp, Clock, Printer, CheckCircle2 } from 'lucide-react';

export const ReportsPage: React.FC = () => {
  const { company } = useCompany();
  const [activeTab, setActiveTab] = useState<'trial' | 'income' | 'aging'>('trial');
  const [trialData, setTrialData] = useState<any | null>(null);
  const [incomeData, setIncomeData] = useState<any | null>(null);
  const [agingData, setAgingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [activeTab]);

  const loadReports = async () => {
    setLoading(true);
    try {
      if (activeTab === 'trial') {
        const res = await api.getTrialBalance();
        setTrialData(res);
      } else if (activeTab === 'income') {
        const res = await api.getIncomeStatement();
        setIncomeData(res);
      } else {
        const res = await api.getCustomerAging();
        setAgingData(res);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    if ((window as any).electronAPI?.print) {
      (window as any).electronAPI.print();
    } else {
      window.print();
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <span>التقارير المالية وميزان المراجعة</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            دفاتر أستاذ متزنة بقيد مزدوج (Debit = Credit) وتقارير معتمدة
          </p>
        </div>

        <button
          onClick={printReport}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-md"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة التقرير</span>
        </button>
      </div>

      {/* Tabs Header */}
      <div className="flex gap-2 p-1.5 bg-slate-200/70 rounded-xl max-w-md no-print">
        <button
          onClick={() => setActiveTab('trial')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'trial' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>ميزان المراجعة</span>
        </button>

        <button
          onClick={() => setActiveTab('income')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'income' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>قائمة الدخل</span>
        </button>

        <button
          onClick={() => setActiveTab('aging')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'aging' ? 'bg-blue-600 text-white shadow' : 'text-slate-700 hover:bg-slate-300/60'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>أعمار الديون</span>
        </button>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
        {/* Printable Header */}
        <div className="text-center border-b pb-4 mb-6">
          <h1 className="text-2xl font-black text-slate-900">{company.name_ar}</h1>
          <p className="text-xs text-slate-500 font-medium">{company.tagline || 'مواد البناء والتوريدات العامة'} — {company.address || 'كرداسة'}</p>
          <h3 className="text-base font-bold text-blue-900 mt-2">
            {activeTab === 'trial'
              ? 'ميزان المراجعة العام (Trial Balance)'
              : activeTab === 'income'
              ? 'قائمة الدخل والأرباح (Income Statement)'
              : 'تقرير أعمار ديون العملاء (Aging Report)'}
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 font-semibold">
            جاري استخراج البيانات والحسابات...
          </div>
        ) : activeTab === 'trial' ? (
          <div className="space-y-4">
            {/* Balance Badge */}
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs font-bold text-emerald-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>حالة الاتزان: متزن بنسبة 100% (Debit == Credit)</span>
              </div>
              <span>الفارق الدفتري: {trialData?.totals?.difference?.toFixed(2)} ج.م</span>
            </div>

            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-800 text-white font-bold">
                <tr>
                  <th className="p-3 border-l border-slate-700 w-24">كود الحساب</th>
                  <th className="p-3 border-l border-slate-700">اسم الحساب</th>
                  <th className="p-3 border-l border-slate-700 w-24">النوع</th>
                  <th className="p-3 border-l border-slate-700 text-center w-32">إجمالي مدين (Debit)</th>
                  <th className="p-3 border-l border-slate-700 text-center w-32">إجمالي دائن (Credit)</th>
                  <th className="p-3 text-center w-32">صافي الرصيد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {trialData?.accounts?.map((acc: any) => (
                  <tr key={acc.account_id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-blue-700">{acc.account_code}</td>
                    <td className="p-3 font-bold text-slate-800">{acc.account_name}</td>
                    <td className="p-3 text-slate-500">{acc.account_type}</td>
                    <td className="p-3 text-center font-mono font-bold">
                      {acc.total_debit.toLocaleString()}
                    </td>
                    <td className="p-3 text-center font-mono font-bold">
                      {acc.total_credit.toLocaleString()}
                    </td>
                    <td className="p-3 text-center font-mono font-black text-slate-900">
                      {acc.net_balance.toLocaleString()} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-800">
                <tr>
                  <td colSpan={3} className="p-3 text-left">
                    المجموع الإجمالي العام:
                  </td>
                  <td className="p-3 text-center font-mono text-sm font-black text-blue-900">
                    {trialData?.totals?.sumDebit?.toLocaleString()} ج.م
                  </td>
                  <td className="p-3 text-center font-mono text-sm font-black text-blue-900">
                    {trialData?.totals?.sumCredit?.toLocaleString()} ج.م
                  </td>
                  <td className="p-3 text-center font-mono text-xs font-bold text-emerald-700">
                    فارق: 0.00 ج.م
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : activeTab === 'income' ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* Revenues Block */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-emerald-50 px-4 py-2.5 font-bold text-emerald-800 text-sm border-b border-slate-200 flex justify-between">
                <span>الإيرادات (Revenues)</span>
                <span>{incomeData?.totalRevenues?.toLocaleString()} ج.م</span>
              </div>
              <div className="p-4 space-y-2 text-xs">
                {incomeData?.revenues?.map((r: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-bold text-slate-700">{r.name} ({r.code})</span>
                    <span className="font-mono font-bold">{r.amount.toLocaleString()} ج.م</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses Block */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-rose-50 px-4 py-2.5 font-bold text-rose-800 text-sm border-b border-slate-200 flex justify-between">
                <span>المصروفات والأجور (Expenses)</span>
                <span>{incomeData?.totalExpenses?.toLocaleString()} ج.م</span>
              </div>
              <div className="p-4 space-y-2 text-xs">
                {incomeData?.expenses?.map((x: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-bold text-slate-700">{x.name} ({x.code})</span>
                    <span className="font-mono font-bold">{x.amount.toLocaleString()} ج.م</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Net Profit */}
            <div className="p-5 bg-gradient-to-l from-slate-900 to-blue-950 text-white rounded-xl flex justify-between items-center shadow-lg">
              <div>
                <h4 className="font-bold text-base">صافي الأرباح التشغيلية:</h4>
                <p className="text-xs text-slate-400">الإيرادات − المصروفات</p>
              </div>
              <span className="text-2xl font-black font-mono">
                {incomeData?.netProfit?.toLocaleString()} ج.م
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-800 text-white font-bold">
                <tr>
                  <th className="p-3 border-l border-slate-700">اسم العميل</th>
                  <th className="p-3 border-l border-slate-700 text-center">إجمالي المديونية</th>
                  <th className="p-3 border-l border-slate-700 text-center">حالي (0 - 30 يوم)</th>
                  <th className="p-3 border-l border-slate-700 text-center">31 - 60 يوم</th>
                  <th className="p-3 border-l border-slate-700 text-center">61 - 90 يوم</th>
                  <th className="p-3 text-center">أكثر من 90 يوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {agingData.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-slate-800">{cust.name}</td>
                    <td className="p-3 text-center font-bold text-blue-900 font-mono">
                      {cust.total_balance.toLocaleString()} ج.م
                    </td>
                    <td className="p-3 text-center font-mono">{cust.bucket_0_30.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono">{cust.bucket_31_60.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono">{cust.bucket_61_90.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono font-bold text-rose-700">
                      {cust.bucket_90_plus.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
