import React, { useState } from 'react';
import { useCompany } from '../context/CompanyContext';
import { api } from '../api/client';
import { Building2, ShieldCheck, UserCheck, Key, CheckCircle, ArrowLeft, Sparkles } from 'lucide-react';

export const FirstRunWizard: React.FC = () => {
  const { company, showSetupModal, setShowSetupModal, refreshCompany } = useCompany();

  const [companyName, setCompanyName] = useState(company.name_ar || '');
  const [tagline, setTagline] = useState(company.tagline || 'تجارة مواد البناء والتوريدات العامة');
  const [address, setAddress] = useState(company.address || 'المركز الرئيسي — كرداسة');
  const [phones, setPhones] = useState(company.phones || '');
  const [adminFullName, setAdminFullName] = useState('مدير النظام');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [managerPin, setManagerPin] = useState('1234');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!showSetupModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('يرجى كتابة اسم الشركة أو المؤسسة');
      return;
    }
    if (managerPin.trim().length !== 4 || !/^\d{4}$/.test(managerPin.trim())) {
      setError('رمز موافقة المدير (PIN) يجب أن يتكون من 4 أرقام بالضبط');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.setupCompany({
        company_name: companyName.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        phones: phones.trim(),
        admin_full_name: adminFullName.trim(),
        admin_username: adminUsername.trim(),
        admin_password: adminPassword.trim() || undefined,
        manager_pin: managerPin.trim(),
      });

      await refreshCompany();
      setShowSetupModal(false);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white p-6 sm:p-8 relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/30 border border-blue-400/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black">معالج إعداد المنشأة والتشغيل الأولي</h2>
              <p className="text-xs sm:text-sm text-blue-200">تخصيص بيانات مؤسستك وحساب المدير لبدء العمل الميداني الفوري</p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
              {error}
            </div>
          )}

          {/* Section 1: Company Profile */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b pb-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-black text-slate-800">1. بيانات المنشأة والمؤسسة</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم الشركة / المنشأة <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="مثال: شركة الرضا للتوريدات"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">النشاط التجاري / الشعار</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="مثال: تجارة مواد البناء والتوريدات العامة"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المقر والعنوان</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: شارع عشماوي — كرداسة — الجيزة"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">أرقام الهواتف والتواصل</label>
                <input
                  type="text"
                  value={phones}
                  onChange={(e) => setPhones(e.target.value)}
                  placeholder="مثال: 01030343576 / 01008681338"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Admin & Manager Security */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 border-b pb-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-black text-slate-800">2. حساب مدير النظام ومفتاح الاعتماد (PIN)</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل لمدير النظام</label>
                <input
                  type="text"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="مثال: أحمد رضا أو مدير النظام"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم مستخدم الدخول</label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كلمة المرور الجديدة <span className="text-[10px] text-slate-400">(اتركها فارغة للإبقاء على admin123456)</span>
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="كلمة مرور قوية (اختياري)"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  رمز موافقة المدير (Manager PIN) <span className="text-rose-500">*</span>
                  <span className="text-[10px] text-slate-400 block font-normal">مطلوب لتأكيد التعديلات الحساسة وإلغاء الفواتير</span>
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="1234"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest text-center text-sm font-bold bg-amber-50/50 border-amber-200"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => setShowSetupModal(false)}
              className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 font-bold transition-colors"
            >
              تخطي واستخدام الإعدادات الافتراضية
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span>جاري الحفظ والتهيئة...</span>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد البيانات وبدء تشغيل النظام</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
