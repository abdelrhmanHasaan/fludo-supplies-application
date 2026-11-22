import React from 'react';
import { useCompany } from '../context/CompanyContext';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Truck,
  Boxes,
  Tag,
  FileText,
  Navigation,
  Wallet,
  Receipt,
  Wrench,
  UserCheck,
  BarChart3,
  Settings,
  Database,
} from 'lucide-react';

export type SectionKey =
  | 'dashboard'
  | 'daily'
  | 'customers'
  | 'suppliers'
  | 'inventory'
  | 'invoices'
  | 'shipments'
  | 'treasury'
  | 'expenses'
  | 'equipment'
  | 'payroll'
  | 'reports'
  | 'settings'
  | 'dataport';

interface SidebarProps {
  currentSection: SectionKey;
  onSelectSection: (section: SectionKey) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentSection, onSelectSection }) => {
  const { company, logoLetter, setShowSetupModal } = useCompany();

  const menuItems: Array<{ key: SectionKey; label: string; icon: any }> = [
    { key: 'dashboard', label: 'الرئيسية (لوحة التحكم)', icon: LayoutDashboard },
    { key: 'daily', label: 'اليومية (سريع F2)', icon: CalendarCheck },
    { key: 'customers', label: 'العملاء وكشوف الحساب', icon: Users },
    { key: 'suppliers', label: 'الموردين والمشتريات', icon: Truck },
    { key: 'inventory', label: 'المخزون وحركة البضاعة', icon: Boxes },
    { key: 'invoices', label: 'الفواتير والطباعة', icon: FileText },
    { key: 'shipments', label: 'الشحنات والسائقين', icon: Navigation },
    { key: 'treasury', label: 'الخزينة والبنوك', icon: Wallet },
    { key: 'expenses', label: 'المصروفات العامة', icon: Receipt },
    { key: 'equipment', label: 'الأصول والمعدات', icon: Wrench },
    { key: 'payroll', label: 'الموظفين والرواتب', icon: UserCheck },
    { key: 'reports', label: 'التقارير المالية', icon: BarChart3 },
    { key: 'dataport', label: 'استيراد وتصدير (إكسيل/SQL)', icon: Database },
    { key: 'settings', label: 'الإعدادات والصلاحيات', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-l border-slate-800 shadow-xl select-none">
      {/* Brand Header */}
      <div
        onClick={() => setShowSetupModal(true)}
        className="p-5 border-b border-slate-800 flex items-center gap-3 cursor-pointer hover:bg-slate-800/60 transition-colors group"
        title="انقر لتعديل بيانات المنشأة واسم المؤسسة"
      >
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/25 shrink-0 group-hover:scale-105 transition-transform">
          {logoLetter}
        </div>
        <div className="overflow-hidden">
          <h1 className="text-white font-bold text-sm tracking-wide leading-tight truncate">
            {company.name_ar || 'نظام التوريدات ERP'}
          </h1>
          <p className="text-[11px] text-blue-400 font-medium truncate mt-0.5">
            {company.tagline || company.address || 'نظام الإدارة المتكامل'}
          </p>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.key;
          return (
            <button
              key={item.key}
              data-section={item.key}
              onClick={() => onSelectSection(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800 text-xs text-slate-400 flex flex-col gap-1 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <span>حالة التشغيل:</span>
          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            محلي 100% (أوفلاين)
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>قاعدة البيانات:</span>
          <span>PostgreSQL 18 (محرك محلي مستقل)</span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
          <span>نسخة التطبيق:</span>
          <span className="font-mono text-slate-400">v1.4.0 (مستقر)</span>
        </div>
      </div>
    </aside>
  );
};
