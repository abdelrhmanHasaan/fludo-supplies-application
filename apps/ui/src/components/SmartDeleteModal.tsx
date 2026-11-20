import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ShieldCheck, KeyRound, X, Trash2, ArrowRight } from 'lucide-react';
import { api } from '../api/client';

export type DeleteEntityType = 'customer' | 'supplier' | 'product' | 'invoice' | 'expense' | 'equipment';

export interface SmartDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  entityType: DeleteEntityType;
  entityId: string;
  entityName: string;
  entitySubtitle?: string;
}

export const SmartDeleteModal: React.FC<SmartDeleteModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  entityType,
  entityId,
  entityName,
  entitySubtitle,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPin('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => pinInputRef.current?.focus(), 80);
    }
  }, [step]);

  // Global ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getEntityLabel = () => {
    switch (entityType) {
      case 'customer':
        return 'حساب عميل';
      case 'supplier':
        return 'حساب مورد';
      case 'product':
        return 'صنف من المستودع';
      case 'invoice':
        return 'فاتورة مبيعات';
      case 'expense':
        return 'سند مصروف';
      case 'equipment':
        return 'معدة / أصل';
      default:
        return 'سجل';
    }
  };

  const handleConfirmStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length !== 4) {
      setError('يرجى إدخال رمز PIN المكون من 4 أرقام');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.smartDelete(entityType, entityId, pin);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل حذف السجل، تأكد من صحة رمز PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">حذف ذكي بتحقق ثنائي (2-Step Verification)</h3>
              <p className="text-[10px] text-slate-400">
                {step === 1 ? 'الخطوة 1 من 2: تأكيد الرغبة والمراجعة' : 'الخطوة 2 من 2: التحقق برمز موافقة المدير'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Step 1: Warning and Details */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-800 space-y-1">
                <p className="font-bold">تنبيه أمني هام:</p>
                <p className="leading-relaxed">
                  أنت على وشك حذف <strong>{getEntityLabel()}</strong>. سيتم إزالته من القوائم والحسابات النشطة مع الحفاظ الكامل على سلامة سجلات التدقيق والميزان المالي.
                </p>
              </div>
            </div>

            {/* Target Item Details Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {getEntityLabel()} المستهدف
              </span>
              <h4 className="text-base font-black text-slate-900">{entityName}</h4>
              {entitySubtitle && <p className="text-xs text-slate-500 font-mono">{entitySubtitle}</p>}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                إلغاء والتراجع
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
              >
                <span>متابعة للتحقق (الخطوة 2)</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        )}

        {/* Body Step 2: Manager PIN */}
        {step === 2 && (
          <form onSubmit={handleConfirmStep2} className="p-6 space-y-5">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <KeyRound className="w-6 h-6 text-amber-600 shrink-0" />
              <div className="text-xs text-amber-900 space-y-0.5">
                <p className="font-bold">مطلوب رمز موافقة المدير (4 أرقام):</p>
                <p className="text-[11px] text-amber-700">لتأكيد العملية، يرجى إدخال رمز PIN السري للمدير العام.</p>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 text-center">
                أدخل رمز PIN المكون من 4 أرقام
              </label>
              <input
                ref={pinInputRef}
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center text-2xl tracking-[0.5em] font-mono border-2 border-slate-300 rounded-xl p-3 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none transition-all shadow-inner bg-slate-50"
                required
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ← رجوع
              </button>
              <button
                type="submit"
                disabled={loading || pin.length !== 4}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{loading ? 'جاري التحقق والحذف...' : 'تأكيد الحذف النهائي الآن'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
