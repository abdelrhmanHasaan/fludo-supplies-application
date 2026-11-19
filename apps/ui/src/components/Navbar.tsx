import React from 'react';
import { Search, KeyRound, RefreshCw } from 'lucide-react';

interface NavbarProps {
  currentSectionTitle: string;
  onOpenPinModal: () => void;
  onOpenSearch?: () => void;
  onRefresh: () => void;
  user?: any;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentSectionTitle,
  onOpenPinModal,
  onOpenSearch,
  onRefresh,
  user,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm sticky top-0 z-20">
      {/* Title & Shortcut Hint */}
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800">{currentSectionTitle}</h2>
        <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
          <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 font-mono text-[10px] shadow-sm">F2</kbd>
          اليومية السريعة
        </span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Global Search Button */}
        <button
          onClick={onOpenSearch}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200/80 border border-slate-200 transition-colors shadow-sm"
          title="بحث شامل في النظام (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">بحث شامل</span>
          <kbd className="px-1.5 py-0.5 bg-white text-slate-500 rounded border border-slate-300 text-[10px] font-mono">
            Ctrl+K
          </kbd>
        </button>

        {/* Manager PIN Button */}
        <button
          onClick={onOpenPinModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors shadow-sm"
          title="منح صلاحية مؤقتة لتعديل أو إلغاء سجل معتمد"
        >
          <KeyRound className="w-4 h-4 text-amber-600" />
          <span>إذن المدير (PIN)</span>
        </button>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          title="تحديث البيانات"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* User Badge */}
        <div className="flex items-center gap-2 pl-2 border-r border-slate-200">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
            {user?.username ? user.username.substring(0, 2).toUpperCase() : 'AD'}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-800 leading-tight">
              {user?.fullName || 'مدير النظام'}
            </p>
            <p className="text-[11px] text-slate-500 font-medium leading-none">
              {user?.role === 'admin' ? 'مدير عام (كامل الصلاحيات)' : 'محاسب'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};
