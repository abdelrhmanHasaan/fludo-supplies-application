import React, { useState, useEffect, useRef } from 'react';
import { api, getStoredToken, setStoredToken, clearStoredToken } from './api/client';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { Sidebar, SectionKey } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { ManagerPinModal } from './components/ManagerPinModal';
import { FirstRunWizard } from './components/FirstRunWizard';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { Lock, ArrowRight, ShieldAlert, AlertCircle, RefreshCw, FolderOpen, Download, Terminal } from 'lucide-react';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { DailyCenterPage } from './pages/DailyCenterPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { InventoryPage } from './pages/InventoryPage';
import { ProductsPage } from './pages/ProductsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { ShipmentsPage } from './pages/ShipmentsPage';
import { TreasuryPage } from './pages/TreasuryPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { PayrollPage } from './pages/PayrollPage';
import { ReportsPage } from './pages/ReportsPage';
import { DataPortPage } from './pages/DataPortPage';
import { SettingsPage } from './pages/SettingsPage';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

const MainApp: React.FC = () => {
  const { company, logoLetter } = useCompany();
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<any | null>(null);
  const [currentSection, setCurrentSection] = useState<SectionKey>('dashboard');
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryAttempt, setRetryAttempt] = useState(1);
  const [startupStep, setStartupStep] = useState<string>('جاري تجهيز محرك البيانات الآمن وبدء تشغيل النظام...');
  const [startupErrorDetails, setStartupErrorDetails] = useState<{ step?: string; error?: string; logsPath?: string } | null>(null);
  const [diagExportMsg, setDiagExportMsg] = useState<string | null>(null);

  // Login form state (strictly clean single password input)
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Lock screen state
  const [isLocked, setIsLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  // 1. Initial Setup Status Check with Auto-Retry Loop
  const checkStatus = async () => {
    setCheckingSetup(true);
    setConnectionError(null);
    setStartupErrorDetails(null);
    setDiagExportMsg(null);
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      attempts++;
      setRetryAttempt(attempts);
      try {
        const res = await api.getAuthStatus();
        if (!res.initialized) {
          setShowSetupWizard(true);
        }
        setCheckingSetup(false);
        return;
      } catch (err: any) {
        console.warn(`[App] Connection attempt ${attempts}/${maxAttempts} notice:`, err);
        if (attempts >= maxAttempts) {
          setConnectionError(
            'تعذر الاتصال بخادم النظام وقاعدة البيانات المحلية. يرجى مراجعة سجلات النظام أو إعادة المحاولة.'
          );
          setCheckingSetup(false);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const eApi = (window as any).electronAPI;
      if (eApi.onStartupProgress) {
        eApi.onStartupProgress((data: any) => {
          if (data?.message) setStartupStep(data.message);
        });
      }
      if (eApi.onStartupError) {
        eApi.onStartupError((err: any) => {
          setStartupErrorDetails(err);
          setConnectionError(err.error || err.message || 'تعذر استكمال تشغيل النظام');
          setCheckingSetup(false);
        });
      }
    }
    checkStatus();
  }, []);

  // 2. Load current user if token exists
  useEffect(() => {
    if (token) {
      loadCurrentUser();
    }
  }, [token]);

  const loadCurrentUser = async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      handleLogout();
    }
  };

  // 3. Global Shortcuts: F2 for Daily, Ctrl+K for Search, Escape to Close Modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCurrentSection('daily');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 4. Idle Inactivity Lock (15 Minutes)
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!token || isLocked) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT_MS) {
        setIsLocked(true);
      }
    }, 30000); // Check every 30s

    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('click', updateActivity);

    return () => {
      clearInterval(interval);
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('click', updateActivity);
    };
  }, [token, isLocked]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.login({ password: loginPass });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
      setIsLocked(false);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network')) {
        setLoginError('تعذر الاتصال بخادم النظام ومحرك قاعدة البيانات المحلية. يرجى التأكد من تشغيل البرنامج أو الضغط على إعادة المحاولة.');
      } else {
        setLoginError(msg || 'كلمة المرور غير صحيحة');
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockLoading(true);
    setUnlockError(null);
    try {
      await api.login({ username: user.username, password: unlockPassword });
      setIsLocked(false);
      setUnlockPassword('');
      lastActivityRef.current = Date.now();
    } catch (err: any) {
      setUnlockError(err.message || 'كلمة المرور غير صحيحة');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setIsLocked(false);
  };

  const handleSetupSuccess = (newToken: string, newUser: any) => {
    setShowSetupWizard(false);
    setToken(newToken);
    setUser(newUser);
  };

  // If checking initial server connectivity
  if (checkingSetup) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-3xl mx-auto shadow-lg shadow-blue-500/30">
            {logoLetter}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-800">{company.name_ar || 'نظام التوريدات ERP'}</h2>
            <p className="text-xs text-slate-500">جاري فحص وتجهيز النظام المحلي وقاعدة البيانات...</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-bold text-blue-600">
              {startupStep} (محاولة {retryAttempt} من 20)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // If connection or startup error
  if (connectionError && !token) {
    const handleRetry = () => {
      if ((window as any).electronAPI?.retryStartup) {
        (window as any).electronAPI.retryStartup();
      }
      checkStatus();
    };

    const handleOpenLogs = () => {
      if ((window as any).electronAPI?.openLogsFolder) {
        (window as any).electronAPI.openLogsFolder();
      }
    };

    const handleExportDiag = async () => {
      if ((window as any).electronAPI?.exportDiagnostics) {
        const res = await (window as any).electronAPI.exportDiagnostics();
        if (res?.path) {
          setDiagExportMsg(`تم تصدير حزمة التشخيص إلى: ${res.path}`);
        }
      }
    };

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 p-8 text-center space-y-5 animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-md">
            <AlertCircle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-black text-slate-800">حالة تشغيل خادم ومحرك النظام</h2>
            {startupErrorDetails?.step && (
              <div className="inline-block px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold">
                الخطوة: {startupErrorDetails.step}
              </div>
            )}
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium text-right leading-relaxed font-mono select-all">
              {connectionError}
            </div>
            <p className="text-[11px] text-slate-500 leading-normal pt-1">
              مسار سجلات النظام الآمن: <code className="font-mono text-[10px] text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{startupErrorDetails?.logsPath || 'C:\\ProgramData\\FludoSuppliesERP\\logs'}</code>
            </p>
          </div>

          {diagExportMsg && (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
              {diagExportMsg}
            </div>
          )}

          <div className="space-y-2 pt-2">
            <button
              onClick={handleRetry}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة المحاولة الآن</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleOpenLogs}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <FolderOpen className="w-4 h-4 text-slate-600" />
                <span>فتح مجلد السجلات</span>
              </button>

              <button
                type="button"
                onClick={handleExportDiag}
                className="py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>تصدير التشخيص</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If first-run setup wizard is active
  if (showSetupWizard) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <FirstRunWizard
          isOpen={true}
          onSuccess={handleSetupSuccess}
          onClose={() => setShowSetupWizard(false)}
        />
      </div>
    );
  }

  // If not logged in, render clean login screen
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
          <div className="bg-gradient-to-r from-blue-900 to-indigo-950 p-8 text-center text-white space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-blue-500/30">
              {logoLetter}
            </div>
            <h1 className="text-2xl font-black">{company.name_ar || 'نظام التوريدات ERP'}</h1>
            <p className="text-xs text-blue-200 font-medium">
              {company.tagline || 'نظام إدارة مواد البناء والتوريدات العامة (Fludo ERP)'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-center">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-blue-600" />
                  <span>كلمة المرور أو رمز PIN للدخول</span>
                </span>
                <span className="text-[10px] text-slate-400">حساب الإدارة والتشغيل</span>
              </label>
              <input
                type="password"
                autoFocus
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="أدخل كلمة المرور أو رمز PIN للدخول"
                className="w-full border border-slate-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm font-mono text-center tracking-wider text-base"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loginLoading ? 'جاري التحقق...' : 'تسجيل الدخول للنظام'}
            </button>

            <div className="pt-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={() => setShowSetupWizard(true)}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold hover:underline"
              >
                إعداد وتعيين كلمة المرور للمرة الأولى (Setup Wizard)
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const getSectionTitle = () => {
    switch (currentSection) {
      case 'dashboard':
        return 'الرئيسية (لوحة التحكم المركزية)';
      case 'daily':
        return 'اليومية السريعة (F2)';
      case 'customers':
        return 'العملاء وكشوف الحساب';
      case 'suppliers':
        return 'الموردين والمشتريات';
      case 'inventory':
        return 'المخزون وحركة البضاعة';
      case 'products':
        return 'المنتجات والأسعار';
      case 'invoices':
        return 'الفواتير والطباعة';
      case 'shipments':
        return 'الشحنات والسائقين';
      case 'treasury':
        return 'الخزينة والبنوك';
      case 'expenses':
        return 'المصروفات العامة';
      case 'equipment':
        return 'الأصول والمعدات';
      case 'payroll':
        return 'الموظفين والرواتب';
      case 'reports':
        return 'التقارير المالية وميزان المراجعة';
      case 'dataport':
        return 'استيراد وتصدير (Excel & SQL)';
      case 'settings':
        return 'الإعدادات والصلاحيات وسجل التدقيق';
      default:
        return company.name_ar || 'نظام التوريدات ERP';
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-800">
      {/* Sidebar */}
      <Sidebar currentSection={currentSection} onSelectSection={setCurrentSection} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Navbar */}
        <Navbar
          currentSectionTitle={getSectionTitle()}
          onOpenPinModal={() => setPinModalOpen(true)}
          onOpenSearch={() => setSearchModalOpen(true)}
          onRefresh={() => window.location.reload()}
          user={user}
        />

        {/* Dynamic Route Pages */}
        <main className="flex-1 overflow-y-auto">
          {currentSection === 'dashboard' && <DashboardPage onNavigate={setCurrentSection} />}
          {currentSection === 'daily' && <DailyCenterPage />}
          {currentSection === 'customers' && <CustomersPage />}
          {currentSection === 'suppliers' && <SuppliersPage />}
          {currentSection === 'inventory' && <InventoryPage />}
          {currentSection === 'products' && <ProductsPage />}
          {currentSection === 'invoices' && <InvoicesPage />}
          {currentSection === 'shipments' && <ShipmentsPage />}
          {currentSection === 'treasury' && <TreasuryPage />}
          {currentSection === 'expenses' && <ExpensesPage />}
          {currentSection === 'equipment' && <EquipmentPage />}
          {currentSection === 'payroll' && <PayrollPage />}
          {currentSection === 'reports' && <ReportsPage />}
          {currentSection === 'dataport' && <DataPortPage />}
          {currentSection === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Global Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={setCurrentSection}
      />

      {/* Manager PIN Modal */}
      <ManagerPinModal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} />

      {/* 15-Minute Idle Lock Screen Overlay */}
      {isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-8 text-center space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-md">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800">قفل الشاشة لتوقف النشاط</h3>
              <p className="text-xs text-slate-500 mt-1">
                تم قفل النظام تلقائياً بعد 15 دقيقة خمول لحماية البيانات. مسوداتك محفوظة بأمان.
              </p>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="text-xs font-bold text-slate-700">{user?.fullName || user?.username}</span>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              {unlockError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  {unlockError}
                </div>
              )}
              <input
                type="password"
                required
                autoFocus
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="أدخل كلمة المرور لإلغاء القفل"
                className="w-full border border-slate-300 rounded-xl p-2.5 text-xs text-center font-bold focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="submit"
                disabled={unlockLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {unlockLoading ? 'جاري التحقق...' : 'إلغاء القفل والمتابعة'}
              </button>
            </form>

            <button
              onClick={handleLogout}
              className="text-[11px] text-slate-400 hover:text-rose-600 font-bold transition-colors"
            >
              تسجيل الخروج والانتقال لحساب آخر
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <CompanyProvider>
      <MainApp />
    </CompanyProvider>
  );
};
