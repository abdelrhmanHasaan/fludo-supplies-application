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
  Building,
  RefreshCw,
  Wrench,
  DollarSign,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  X,
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
  current_month_premises_expenses: number;
  current_month_equipment_expenses: number;
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
      case 'wallet':
        return 'محفظة إلكترونية';
      case 'bank':
        return 'حساب بنكي';
      case 'other':
        return 'حساب آخر';
      case 'cash':
      default:
        return 'خزينة نقدية';
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center text-2xl font-black shadow-md shadow-emerald-500/20">
            {logoLetter || 'F'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-800">
                {company?.name_ar || 'Fludo Supplies ERP'}
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
              <span>{company?.owner_name ? `المالك: ${company.owner_name}` : 'لوحة المؤشرات والرقابة المالية'}</span>
              <span>•</span>
              <span className="text-emerald-700 font-medium">{currentDateArabic}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboard}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 text-emerald-800 hover:bg-emerald-50 text-sm font-semibold transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث المؤشرات
          </button>
        </div>
      </div>

      {/* Exactly 10 Green Dashboard Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* 1. الفلوس اللي لينا */}
        <div
          onClick={() => onNavigate('customers')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">الفلوس اللي لينا</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.total_receivables || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>مستحقات على العملاء</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500 rounded-r-2xl" />
        </div>

        {/* 2. الفلوس اللي علينا */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">الفلوس اللي علينا</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.total_payables || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>مستحقات للموردين</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-teal-500 rounded-r-2xl" />
        </div>

        {/* 3. إجمالي السيولة الحالية */}
        <div
          onClick={() => setShowLiquidityModal(true)}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">إجمالي السيولة الحالية</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.current_liquidity || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>الخزائن والحسابات</span>
            <span className="text-[10px] font-bold bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">تفاصيل</span>
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-600 rounded-r-2xl" />
        </div>

        {/* 4. مبيعات الشهر الحالي */}
        <div
          onClick={() => onNavigate('invoices')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">مبيعات الشهر الحالي</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.current_month_sales || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>من أول الشهر حتى اليوم</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-green-500 rounded-r-2xl" />
        </div>

        {/* 5. مبيعات اليوم */}
        <div
          onClick={() => onNavigate('invoices')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">مبيعات اليوم</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.today_sales || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>حركات اليوم المعتمدة</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-400 rounded-r-2xl" />
        </div>

        {/* 6. مصاريف المكان لهذا الشهر */}
        <div
          onClick={() => onNavigate('daily')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">مصاريف المكان للشهر</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.current_month_premises_expenses || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>إيجارات ونثريات المقر</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-teal-600 rounded-r-2xl" />
        </div>

        {/* 7. مصاريف المعدات لهذا الشهر */}
        <div
          onClick={() => onNavigate('equipment')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">مصاريف المعدات للشهر</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-800 tracking-tight" dir="ltr">
            {loading ? '...' : formatMoney(data?.current_month_equipment_expenses || 0)}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>وقود وصيانة سيارات ومعدات</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500 rounded-r-2xl" />
        </div>

        {/* 8. عدد العملاء */}
        <div
          onClick={() => onNavigate('customers')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">عدد العملاء</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-800 tracking-tight">
            {loading ? '...' : data?.active_customers_count || 0}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>عميل مسجل ونشط</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-green-600 rounded-r-2xl" />
        </div>

        {/* 9. عدد الموردين */}
        <div
          onClick={() => onNavigate('suppliers')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">عدد الموردين</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-800 tracking-tight">
            {loading ? '...' : data?.active_suppliers_count || 0}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>مورد ومحجر مسجل</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-teal-500 rounded-r-2xl" />
        </div>

        {/* 10. عدد الموظفين */}
        <div
          onClick={() => onNavigate('payroll')}
          className="group bg-gradient-to-br from-white to-emerald-50/40 rounded-2xl p-5 border border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all duration-200 cursor-pointer relative overflow-hidden active:scale-[0.99]"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-900">عدد الموظفين</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-800 tracking-tight">
            {loading ? '...' : data?.active_employees_count || 0}
          </div>
          <div className="text-[11px] text-emerald-600/80 mt-1.5 flex items-center justify-between">
            <span>موظف على قوة العمل</span>
            <ArrowUpRight className="w-3.5 h-3.5 opacity-60" />
          </div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-600 rounded-r-2xl" />
        </div>
      </div>

      {/* Liquidity Breakdown Modal */}
      {showLiquidityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full border border-emerald-200 p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-lg text-slate-900">تفصيل السيولة النقدية بالخزائن</h3>
                <p className="text-xs text-slate-400">بيان أرصدة الخزائن والحسابات النشطة الآن</p>
              </div>
              <button
                onClick={() => setShowLiquidityModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-emerald-800 font-bold">إجمالي السيولة الحالية</div>
                  <div className="text-xl font-black text-emerald-900" dir="ltr">
                    {formatMoney(data?.current_liquidity || 0)}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowLiquidityModal(false);
                  onNavigate('treasury');
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition"
              >
                إدارة الخزينة
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {data?.cash_accounts_breakdown && data.cash_accounts_breakdown.length > 0 ? (
                data.cash_accounts_breakdown.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 hover:bg-slate-50 transition"
                  >
                    <div>
                      <div className="font-bold text-sm text-slate-800">{acc.name}</div>
                      <span className="text-[11px] font-semibold text-slate-400">{getKindLabel(acc.kind)}</span>
                    </div>
                    <div className="text-left font-black text-sm text-slate-900" dir="ltr">
                      {formatMoney(acc.balance)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400 text-sm font-semibold">
                  لا توجد حسابات أو خزائن نشطة
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowLiquidityModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
