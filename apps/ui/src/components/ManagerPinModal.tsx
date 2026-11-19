import React, { useState } from 'react';
import { api } from '../api/client';
import { X, KeyRound, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface ManagerPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTable?: string;
  defaultId?: string;
  onApprovalGranted?: (approvalId: string) => void;
}

export const ManagerPinModal: React.FC<ManagerPinModalProps> = ({
  isOpen,
  onClose,
  defaultTable = 'sales_invoices',
  defaultId = '',
  onApprovalGranted,
}) => {
  const [targetTable, setTargetTable] = useState(defaultTable);
  const [targetId, setTargetId] = useState(defaultId);
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantedId, setGrantedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      setError('يرجى إدخال الرقم السري المكون من 4 أرقام');
      return;
    }
    if (!reason.trim()) {
      setError('سبب التعديل أو الإلغاء إلزامي للرقابة والتدقيق');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.verifyManagerPin(targetTable, targetId, reason, pin);
      setGrantedId(res.approvalId);
      if (onApprovalGranted) onApprovalGranted(res.approvalId);
    } catch (err: any) {
      setError(err.message || 'فشل التحقق من الرقم السري');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-amber-500 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-100" />
            <h3 className="font-bold text-base">إذن المدير العام (Manager Approval)</h3>
          </div>
          <button
            onClick={onClose}
            className="text-amber-100 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {grantedId ? (
            <div className="text-center py-4 space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <div>
                <h4 className="font-bold text-lg text-slate-800">تم منح الإذن بنجاح!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  الإذن صالح لمدة 5 دقائق فقط لهذا السجل المحدد، ومسجل في سجل التدقيق المشفر.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono text-slate-700 select-all">
                {grantedId}
              </div>
              <button
                onClick={onClose}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow"
              >
                متابعة العملية
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  السجلات المالية المعتمدة غير قابلة للتعديل أو الحذف المباشر. يتطلب فك القفل إدخال الرقم السري للمدير، مع تدوين السبب إجبارياً للتدقيق.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-semibold">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الجدول المستهدف</label>
                <select
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="sales_invoices">فاتورة مبيعات (sales_invoices)</option>
                  <option value="purchase_invoices">فاتورة مشتريات (purchase_invoices)</option>
                  <option value="payments">سند مالي (payments)</option>
                  <option value="journal_entries">قيد يومية (journal_entries)</option>
                  <option value="expenses">مصروفات (expenses)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">معرف السجل (Record ID)</label>
                <input
                  type="text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  placeholder="UUID الخاص بالسجل..."
                  className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب التعديل / الإلغاء (إلزامي للرقابة)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="اكتب سبب واضح للتعديل لمراجعته في سجل التدقيق..."
                  className="w-full text-sm border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none h-16 resize-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الرقم السري للمدير (4 أرقام)</label>
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center tracking-widest text-2xl font-bold border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
                <span className="block text-[11px] text-slate-400 text-center mt-1">الافتراضي للتجربة: 1234</span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {loading ? 'جاري التحقق...' : 'تأكيد ومنح الإذن'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

