import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  TrendingUp,
  CreditCard,
  Wallet,
  Boxes,
  Calendar,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarCheck,
  Users,
  Truck,
  Tag,
  FileText,
  Navigation,
  Receipt,
  Wrench,
  UserCheck,
  BarChart3,
  Database,
  Settings,
  Sparkles,
  ArrowLeft,
  Clock,
  CheckCircle2,
  Building,
} from 'lucide-react';

export const DashboardPage: React.FC<{ onNavigate: (section: any) => void }> = ({ onNavigate }) => {
  const { company, logoLetter, setShowSetupModal } = useCompany();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error(err);
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

  const modulesList = [
    {
      id: 'daily',
      title: 'اليومية السريعة (F2)',
      description: 'تسجيل فوري لجميع حركات البيع والشراء والقبض والصرف في شاشة واحدة',
      icon: CalendarCheck,
      color: 'bg-blue-50 text-blue-700 border-blue-200 group-hover:border-blue-500',
      badge: 'F2 سريع',
    },
    {
      id: 'customers',
      title: 'العملاء وكشوف الحساب',
      description: 'دليل العملاء، كشوف الحساب الدقيقة، الأرصدة المدينة، والتقادم الزمني للديون',
      icon: Users,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:border-emerald-500',
      badge: 'ذمم مدينة',
    },
    {
      id: 'suppliers',
      title: 'الموردين والمشتريات',
      description: 'حسابات الموردين، أوامر التوريد، فواتير الشراء، وإجراءات التقاص المالي',
      icon: Truck,
      color: 'bg-purple-50 text-purple-700 border-purple-200 group-hover:border-purple-500',
      badge: 'ذمم دائنة',
    },
    {
      id: 'inventory',
      title: 'المخزون وحركة البضاعة',
      description: 'أرصدة المخزون الفعلي، المحجوز، والمتاح للبيع مع التسويات الجردية',
      icon: Boxes,
      color: 'bg-amber-50 text-amber-700 border-amber-200 group-hover:border-amber-500',
      badge: 'رصيد لحظي',
    },
    {
      id: 'products',
      title: 'المنتجات والأسعار',
      description: 'دليل الأصناف، وحدات القياس (طن/متر/شيكارة)، وتحديث أسعار البيع اليومية',
      icon: Tag,
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200 group-hover:border-indigo-500',
      badge: 'كتالوج الأصناف',
    },
    {
      id: 'invoices',
      title: 'الفواتير والطباعة',
      description: 'إصدار فواتير المبيعات والمشتريات مع ترحيل الرصيد السابق والطباعة الرسمية',
      icon: FileText,
      color: 'bg-cyan-50 text-cyan-700 border-cyan-200 group-hover:border-cyan-500',
      badge: 'فواتير معتمدة',
    },
    {
      id: 'shipments',
      title: 'الشحنات والسائقين',
      description: 'إدارة حركة الشاحنات، أذون الخروج، ومتابعة العهد النقدية للسائقين',
      icon: Navigation,
      color: 'bg-sky-50 text-sky-700 border-sky-200 group-hover:border-sky-500',
      badge: 'أسطول النقل',
    },
    {
      id: 'treasury',
      title: 'الخزينة والبنوك',
      description: 'أرصدة الخزائن الرئيسية والفرعية والحسابات البنكية ومحاضر الجرد الفعلي',
      icon: Wallet,
      color: 'bg-teal-50 text-teal-700 border-teal-200 group-hover:border-teal-500',
      badge: 'السيولة النقدية',
    },
    {
      id: 'expenses',
      title: 'المصروفات العامة',
      description: 'تسجيل ومتابعة بنود المصروفات الإدارية والتشغيلية والمكتبية',
      icon: Receipt,
      color: 'bg-rose-50 text-rose-700 border-rose-200 group-hover:border-rose-500',
      badge: 'المصروفات',
    },
    {
      id: 'equipment',
      title: 'الأصول والمعدات',
      description: 'متابعة تكاليف تشغيل وصيانة اللوادر والشاحنات والموازين (M01-M07)',
      icon: Wrench,
      color: 'bg-orange-50 text-orange-700 border-orange-200 group-hover:border-orange-500',
      badge: 'صيانة المعدات',
    },
    {
      id: 'payroll',
      title: 'الموظفين والرواتب',
      description: 'دورة الحضور الأسبوعية (جمعة-خميس)، السلف والخصومات وصافي الأجور',
      icon: UserCheck,
      color: 'bg-violet-50 text-violet-700 border-violet-200 group-hover:border-violet-500',
      badge: 'أجور العمالة',
    },
    {
      id: 'reports',
      title: 'التقارير المالية',
      description: 'ميزان المراجعة، قائمة الدخل، تقادم الديون، ومجمل الأرباح والخسائر',
      icon: BarChart3,
      color: 'bg-blue-50 text-blue-800 border-blue-200 group-hover:border-blue-600',
      badge: 'دفاتر الحسابات',
    },
    {
      id: 'dataport',
      title: 'استيراد وتصدير (Excel & SQL)',
      description: 'استيراد من شيتات إكسيل، تحميل النماذج الجاهزة، وأخذ نسخ احتياطية SQL',
      icon: Database,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200 group-hover:border-emerald-600',
      badge: 'ترحيل ونسخ',
    },
    {
      id: 'settings',
      title: 'الإعدادات والصلاحيات',
      description: 'إدارة المستخدمين، كود موافقة المدير (PIN)، وفحص سجل التدقيق الأمني',
      icon: Settings,
      color: 'bg-slate-100 text-slate-800 border-slate-300 group-hover:border-slate-600',
      badge: 'إدارة النظام',
    },
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-semibold text-slate-500">جاري تحميل لوحة التحكم والقائمة الرئيسية...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto select-none">
      {/* 1. Executive Welcome & Company Header */}
      <div className="bg-gradient-to-l from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-3xl shadow-lg shadow-blue-500/30 shrink-0">
              {logoLetter}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-black tracking-wide">
                  {company.name_ar || 'نظام إدارة التوريدات ERP'}
                </h1>
                <button
                  onClick={() => setShowSetupModal(true)}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-blue-200 text-[11px] rounded-lg font-bold border border-white/10 transition-colors"
                  title="تعديل بيانات المنشأة واسم المؤسسة"
                >
                  تعديل المنشأة
                </button>
              </div>
              <p className="text-blue-200 text-xs sm:text-sm mt-1 font-medium">
                {company.tagline || 'نظام إدارة مواد البناء والتوريدات العامة والمقاولات'} — {company.address || 'المركز الرئيسي'}
              </p>
              <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>اليوم: {currentDateArabic}</span>
              </div>
            </div>
          </div>

          {/* Quick Action Primary Buttons */}
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <button
              onClick={() => onNavigate('daily')}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-black shadow-md shadow-blue-500/30 transition-all flex items-center gap-2"
            >
              <CalendarCheck className="w-4 h-4" />
              <span>اليومية السريعة (F2)</span>
            </button>
            <button
              onClick={() => onNavigate('invoices')}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              <span>فاتورة بيع</span>
            </button>
            <button
              onClick={() => onNavigate('dataport')}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              <span>استيراد إكسيل</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Key Financial & Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Receivables */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">مستحقات لنا عند العملاء</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-3">{formatMoney(data?.totalReceivables)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium">إجمالي الأرصدة المدينة</span>
            <button onClick={() => onNavigate('customers')} className="text-blue-600 hover:underline font-bold">
              عرض العملاء ←
            </button>
          </div>
        </div>

        {/* Payables */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">مستحقات علينا للموردين</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-3">{formatMoney(data?.totalPayables)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium">إجمالي الأرصدة الدائنة</span>
            <button onClick={() => onNavigate('suppliers')} className="text-blue-600 hover:underline font-bold">
              عرض الموردين ←
            </button>
          </div>
        </div>

        {/* Cash Liquidity */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">السيولة النقدية الحالية</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-3">{formatMoney(data?.totalCash)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium">الخزينة الرئيسية والبنوك</span>
            <button onClick={() => onNavigate('treasury')} className="text-blue-600 hover:underline font-bold">
              عرض الخزينة ←
            </button>
          </div>
        </div>

        {/* Monthly Turnover */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">مبيعات الشهر الحالي</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-800 mt-3">{formatMoney(data?.salesMonth)}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-400 font-medium">مبيعات اليوم: {formatMoney(data?.salesToday)}</span>
            <button onClick={() => onNavigate('invoices')} className="text-blue-600 hover:underline font-bold">
              الفواتير ←
            </button>
          </div>
        </div>
      </div>

      {/* 3. The Complete Main Menu Grid (القائمة الرئيسية الشاملة لأقسام النظام) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span>القائمة الرئيسية — دليل أقسام النظام (14 قسماً)</span>
            </h2>
            <p className="text-xs text-slate-400">انقر على أي قسم للدخول الفوري ومباشرة العمل</p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            14 قسماً تشغيلياً نشطاً
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modulesList.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                onClick={() => onNavigate(mod.id)}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-transform group-hover:scale-110 ${mod.color}`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {mod.badge}
                    </span>
                  </div>

                  <h3 className="font-black text-sm text-slate-800 group-hover:text-blue-600 transition-colors mb-1">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-normal">{mod.description}</p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                  <span>فتح القسم</span>
                  <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
