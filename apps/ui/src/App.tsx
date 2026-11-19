import React, { useState, useEffect } from 'react';
import { api, getStoredToken, setStoredToken, clearStoredToken } from './api/client';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { Sidebar, SectionKey } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { ManagerPinModal } from './components/ManagerPinModal';
import { FirstRunWizard } from './components/FirstRunWizard';

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

const MainApp: React.FC = () => {
  const { company, logoLetter } = useCompany();
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [user, setUser] = useState<any | null>(null);
  const [currentSection, setCurrentSection] = useState<SectionKey>('dashboard');
  const [pinModalOpen, setPinModalOpen] = useState(false);

  // Login form state
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('admin123456');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (token) {
      loadCurrentUser();
    }
  }, [token]);

  // Keyboard shortcut: F2 for Daily Transaction Center
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setCurrentSection('daily');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadCurrentUser = async () => {
    try {
      const res = await api.me();
      setUser(res.user);
    } catch {
      handleLogout();
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.login({ username: loginUser, password: loginPass });
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } catch (err: any) {
      setLoginError(err.message || 'فشل تسجيل الدخول');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  };

  // If not logged in, render the clean login screen
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
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
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم</label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                className="w-full border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                required
              />
              <span className="block text-[11px] text-slate-400 mt-1">الحساب الافتراضي: admin / admin123456</span>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              {loginLoading ? 'جاري التحقق...' : 'تسجيل الدخول للنظام'}
            </button>
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

      {/* Manager PIN Modal */}
      <ManagerPinModal isOpen={pinModalOpen} onClose={() => setPinModalOpen(false)} />

      {/* First-Run Setup Wizard */}
      <FirstRunWizard />
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
