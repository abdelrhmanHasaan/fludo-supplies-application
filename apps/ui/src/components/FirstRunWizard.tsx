import React, { useState } from 'react';
import { api, setStoredToken } from '../api/client';
import { Building2, ShieldCheck, CheckCircle, Sparkles, Lock, KeyRound, User, X } from 'lucide-react';

interface FirstRunWizardProps {
  isOpen: boolean;
  onSuccess: (token: string, user: any) => void;
  onClose?: () => void;
}

export const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ isOpen, onSuccess, onClose }) => {
  const [companyName, setCompanyName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [password, setPassword] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Calculate password strength
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: 'أدخل كلمة المرور', color: 'bg-slate-200' };
    let score = 0;
    if (pass.length >= 12) score += 1;
    if (/[A-Z]/.test(pass) || /[a-z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (pass.length < 12) {
      return { score: 1, label: 'قصيرة جداً (أقل من 12 حرف)', color: 'bg-rose-500' };
    }
    if (score <= 2) return { score: 2, label: 'مقبولة', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'جيدة', color: 'bg-blue-500' };
    return { score: 4, label: 'قوية وممتازة', color: 'bg-emerald-500' };
  };

  const strength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      return setError('يرجى كتابة اسم الشركة أو المؤسسة');
    }
    if (!adminFullName.trim()) {
      return setError('يرجى كتابة اسم المسؤول أو المدير');
    }
    if (password.length < 12) {
      return setError('كلمة المرور يجب ألا تقل عن 12 حرفاً وفقاً لمعايير الأمان');
    }
    if (!/^\d{4}$/.test(managerPin.trim())) {
      return setError('رمز موافقة المدير (PIN) يجب أن يتكون من 4 أرقام بالضبط');
    }

    setLoading(true);
    try {
      const res = await api.setupAdmin({
        companyName: companyName.trim(),
        ownerName: ownerName.trim() || adminFullName.trim(),
        adminFullName: adminFullName.trim(),
        username: 'admin',
        password,
        managerPin: managerPin.trim(),
      });

      setStoredToken(res.token);
      onSuccess(res.token, res.user);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ الإعدادات والتهيئة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 text-white p-7 text-center space-y-2 relative">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 left-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="إغلاق والعودة لشاشة الدخول"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <div className="w-12 h-12 rounded-2xl bg-blue-600/40 border border-blue-400/30 flex items-center justify-center mx-auto shadow-lg">
            <Sparkles className="w-6 h-6 text-amber-300" />
          </div>
          <h2 className="text-xl font-black">إعداد وتشغيل النظام لأول مرة</h2>
          <p className="text-xs text-blue-200 max-w-md mx-auto">
            مرحباً بك! لتأمين بياناتك، يرجى تحديد بيانات المنشأة وإنشاء حساب المدير الرئيسي.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-7 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          {/* Company Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>اسم المكان / المنشأة *</span>
            </label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="مثال: شركة النصر للتوريدات"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
            />
          </div>

          {/* Owner Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-4 h-4 text-indigo-600" />
              <span>اسم المالك</span>
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="مثال: أحمد عبد الله"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
            />
          </div>

          {/* Admin Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="w-4 h-4 text-slate-500" />
              <span>اسم المسؤول / مدير النظام *</span>
            </label>
            <input
              type="text"
              required
              value={adminFullName}
              onChange={(e) => setAdminFullName(e.target.value)}
              placeholder="مثال: محمد رضا"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Password with strength meter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-slate-500" />
                <span>كلمة مرور المدير (12 حرف على الأقل) *</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500">{strength.label}</span>
            </label>
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة مرور قوية لا تقل عن 12 حرف"
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
            />
            {/* Password strength bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${strength.color}`}
                style={{ width: `${(strength.score / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Manager PIN */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>رمز موافقة المدير السري (Manager PIN) *</span>
              </span>
              <span className="text-[10px] text-amber-600 font-bold">4 أرقام سرية للمدير فقط</span>
            </label>
            <input
              type="password"
              maxLength={4}
              required
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full px-3.5 py-2.5 text-center text-lg font-bold tracking-widest border border-amber-300 bg-amber-50/50 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              مطلوب لتأكيد العمليات الحساسة، تعديل السجلات المعتمدة، وإلغاء الفواتير.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span>جاري تشفير البيانات وتأسيس النظام...</span>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>إنهاء الإعداد وبدء تشغيل النظام</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
