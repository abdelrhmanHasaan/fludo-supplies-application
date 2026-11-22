import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  TrendingUp,
  CreditCard,
  Wallet,
  Calendar,
  Users,
  Truck,
  UserCheck,
  ArrowUpRight,
  X,
  Building,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface CashAccountItem {
  id: string;
  name: string;
  kind: string;
  balance: number;
}

interface DashboardMetrics {
  total_receivables: number;
  total_payables: number;
  current_liquidity: number;
  current_month_sales: number;
  today_sales: number;
  active_customers_count: number;
  active_suppliers_count: number;
  active_employees_count: number;
  cash_accounts_breakdown: CashAccountItem[];
}

export const DashboardPage: React.FC<{ onNavigate: (section: any) => void }> = ({ onNavigate }) => {
  const { company, logoLetter } = useCompany();
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLiquidityModal, setShowLiquidityModal] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (val: number) => {
    return (val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  const currentDateArabic = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const getKindLabel = (kind: string) => {
    switch (kind) {
      case 'wallet': return 'محفظة إلكترونية';
      case 'bank': return 'حساب بنكي';
      case 'other': return 'حساب آخر';
      case 'cash':
      default: return 'خزينة نقدية';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-2xl font-black shadow-md shadow-blue-500/20">
            {logoLetter || 'F'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">
                {company?.name_ar || 'نظام Fludo Supplies لإدارة التوريدات'}
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <span>{company?.owner_name ? `المالك: ${company.owner_name}` : 'لوحة المؤشرات والرقابة المالية'}</span>
              <span>•</span>
              <span className="text-blue-600 font-medium">{currentDateArabic}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث المؤشرات
          </button>
        </div>
      </div>

      {/* Exactly 8 Core Business Numbers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. الفلوس اللي لينا */}
        <div
          onClick={() => onNavigate('customers')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-emerald-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">الفلوس اللي لينا</span>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ArrowUpRight className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : formatMoney(data?.total_receivables || 0)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>إجمالي مديونيات العملاء المدينة</span>
            <span className="text-emerald-600 font-bold group-hover:underline">عرض العملاء ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500 rounded-r-2xl" />
        </div>

        {/* 2. الفلوس اللي علينا */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-rose-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">الفلوس اللي علينا</span>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CreditCard className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : formatMoney(data?.total_payables || 0)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>إجمالي مستحقات الموردين الدائنة</span>
            <span className="text-rose-600 font-bold group-hover:underline">عرض الموردين ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-rose-500 rounded-r-2xl" />
        </div>

        {/* 3. السيولة النقدية الحالية */}
        <div
          onClick={() => setShowLiquidityModal(true)}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">السيولة النقدية الحالية</span>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight text-blue-700">
            {loading ? '...' : formatMoney(data?.current_liquidity || 0)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>مجموع أرصدة الخزائن والبنوك</span>
            <span className="text-blue-600 font-bold group-hover:underline">تفاصيل الخزائن ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500 rounded-r-2xl" />
        </div>

        {/* 4. مبيعات الشهر الحالي */}
        <div
          onClick={() => onNavigate('invoices')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-indigo-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">مبيعات الشهر الحالي</span>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : formatMoney(data?.current_month_sales || 0)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>صافي فواتير البيع المعتمدة</span>
            <span className="text-indigo-600 font-bold group-hover:underline">عرض الفواتير ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500 rounded-r-2xl" />
        </div>

        {/* 5. مبيعات اليوم */}
        <div
          onClick={() => onNavigate('invoices')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-amber-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">مبيعات اليوم</span>
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight text-amber-600">
            {loading ? '...' : formatMoney(data?.today_sales || 0)}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>فواتير اليوم الصافية</span>
            <span className="text-amber-600 font-bold group-hover:underline">عرض التفاصيل ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500 rounded-r-2xl" />
        </div>

        {/* 6. عدد العملاء */}
        <div
          onClick={() => onNavigate('customers')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-teal-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">عدد العملاء</span>
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : (data?.active_customers_count || 0).toLocaleString('ar-EG')}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>العملاء النشطين في الدليل</span>
            <span className="text-teal-600 font-bold group-hover:underline">دليل العملاء ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-teal-500 rounded-r-2xl" />
        </div>

        {/* 7. عدد الموردين */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-purple-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">عدد الموردين</span>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : (data?.active_suppliers_count || 0).toLocaleString('ar-EG')}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>الموردين النشطين في الدليل</span>
            <span className="text-purple-600 font-bold group-hover:underline">دليل الموردين ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-purple-500 rounded-r-2xl" />
        </div>

        {/* 8. عدد الموظفين */}
        <div
          onClick={() => onNavigate('payroll')}
          className="group bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:border-cyan-500 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-600">عدد الموظفين</span>
            <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserCheck className="w-6 h-6" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {loading ? '...' : (data?.active_employees_count || 0).toLocaleString('ar-EG')}
          </div>
          <p className="text-xs text-slate-400 mt-2 flex items-center justify-between">
            <span>الموظفين والعمال النشطين</span>
            <span className="text-cyan-600 font-bold group-hover:underline">سجل الموظفين ←</span>
          </p>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-cyan-500 rounded-r-2xl" />
        </div>
      </div>

      {/* Liquidity Breakdown Modal */}
      {showLiquidityModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">تفصيل السيولة النقدية</h3>
                  <p className="text-xs text-slate-400">أرصدة الخزائن والمحافظ والحسابات البنكية</p>
                </div>
              </div>
              <button
                onClick={() => setShowLiquidityModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto">
              {(!data?.cash_accounts_breakdown || data.cash_accounts_breakdown.length === 0) ? (
                <div className="p-8 text-center text-slate-400">
                  لا توجد حسابات أو خزائن مضافة حالياً
                </div>
              ) : (
                data.cash_accounts_breakdown.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{acc.name}</div>
                      <span className="text-xs text-slate-400">{getKindLabel(acc.kind)}</span>
                    </div>
                    <div className="text-left font-black text-slate-900">
                      {formatMoney(acc.balance)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 block">إجمالي السيولة</span>
                <span className="text-xl font-black text-blue-700">
                  {formatMoney(data?.current_liquidity || 0)}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowLiquidityModal(false);
                  onNavigate('treasury');
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                <span>إدارة الخزائن</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
