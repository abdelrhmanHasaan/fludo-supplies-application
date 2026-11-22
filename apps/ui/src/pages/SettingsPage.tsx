import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import {
  Settings,
  ShieldCheck,
  KeyRound,
  History,
  RefreshCw,
  AlertCircle,
  Building2,
  Edit,
  X,
  CheckCircle2,
  Lock,
  User,
  Trash2,
  AlertTriangle,
  Server,
  Cloud,
  CloudOff,
  UploadCloud,
  Globe,
  Database,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { company, logoLetter, refreshCompany } = useCompany();
  const [logs, setLogs] = useState<any[]>([]);
  const [auditStatus, setAuditStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  // Edit Company & Manager Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editNameAr, setEditNameAr] = useState(company.name_ar || '');
  const [editNameEn, setEditNameEn] = useState(company.name_en || '');
  const [editTagline, setEditTagline] = useState(company.tagline || '');
  const [editAddress, setEditAddress] = useState(company.address || '');
  const [editPhones, setEditPhones] = useState(company.phones || '');
  const [editAdminName, setEditAdminName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPin, setEditPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Reset Movements Modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPin, setResetPin] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Cloud Database Sync State
  const [syncStatus, setSyncStatus] = useState<any | null>(null);
  const [syncUrl, setSyncUrl] = useState('');
  const [syncToken, setSyncToken] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [testingSync, setTestingSync] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [enqueuingAll, setEnqueuingAll] = useState(false);
  const [savingSync, setSavingSync] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [l, v, authSt, syncSt] = await Promise.all([
        api.getAuditLogs(),
        api.verifyAuditChain(),
        api.getAuthStatus() as any,
        api.getSyncStatus().catch(() => null),
      ]);
      setLogs(l);
      setAuditStatus(v);
      if (authSt?.adminName) {
        setEditAdminName(authSt.adminName);
      }
      if (syncSt) {
        setSyncStatus(syncSt);
        setSyncUrl(syncSt.serverUrl || '');
        setSyncEnabled(syncSt.enabled);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSyncConfig = async () => {
    setSavingSync(true);
    setSyncMessage(null);
    try {
      const res = await api.saveSyncConfig({
        serverUrl: syncUrl,
        enabled: syncEnabled,
        tenantToken: syncToken,
      });
      setSyncMessage({ type: 'success', text: res.message });
      const updated = await api.getSyncStatus();
      setSyncStatus(updated);
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'فشل حفظ إعدادات المزامنة' });
    } finally {
      setSavingSync(false);
    }
  };

  const handleTestSync = async () => {
    if (!syncUrl.trim()) {
      setSyncMessage({ type: 'error', text: 'يرجى إدخال رابط السيرفر السحابي أولاً' });
      return;
    }
    setTestingSync(true);
    setSyncMessage(null);
    try {
      const res = await api.testSyncConnection(syncUrl);
      setSyncMessage({ type: 'success', text: res.message });
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'فشل الاتصال بالسيرفر السحابي' });
    } finally {
      setTestingSync(false);
    }
  };

  const handleTriggerSync = async () => {
    setSyncingNow(true);
    setSyncMessage(null);
    try {
      const res = await api.triggerSync();
      setSyncMessage({ type: 'success', text: res.message });
      const updated = await api.getSyncStatus();
      setSyncStatus(updated);
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء المزامنة' });
    } finally {
      setSyncingNow(false);
    }
  };

  const handleEnqueueAll = async () => {
    setEnqueuingAll(true);
    setSyncMessage(null);
    try {
      const res = await api.enqueueAllForSync();
      setSyncMessage({ type: 'success', text: res.message });
      const updated = await api.getSyncStatus();
      setSyncStatus(updated);
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'فشل إدراج السجلات' });
    } finally {
      setEnqueuingAll(false);
    }
  };

  const handleOpenEdit = () => {
    setEditNameAr(company.name_ar || '');
    setEditNameEn(company.name_en || '');
    setEditTagline(company.tagline || '');
    setEditAddress(company.address || '');
    setEditPhones(company.phones || '');
    setEditPassword('');
    setEditPin('');
    setCurrentPin('');
    setEditError(null);
    setEditSuccess(null);
    setShowEditModal(true);
  };

  const handleSaveCompanyAndManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editNameAr.trim()) {
      setEditError('اسم المنشأة بالعربي مطلوب');
      return;
    }

    if (editPassword && editPassword.length < 12) {
      setEditError('كلمة المرور الجديدة يجب ألا تقل عن 12 حرفاً');
      return;
    }

    if (editPin && !/^\d{4}$/.test(editPin.trim())) {
      setEditError('رمز PIN الجديد يجب أن يتكون من 4 أرقام');
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updateCompanyAndManager({
        name_ar: editNameAr.trim(),
        name_en: editNameEn.trim(),
        tagline: editTagline.trim(),
        address: editAddress.trim(),
        phones: editPhones.trim(),
        admin_full_name: editAdminName.trim(),
        new_password: editPassword.trim() || undefined,
        new_pin: editPin.trim() || undefined,
        current_pin: currentPin.trim() || undefined,
      });

      await refreshCompany();
      setEditSuccess('تم حفظ وتحديث بيانات المنشأة وحساب المدير بنجاح!');
      setTimeout(() => {
        setShowEditModal(false);
      }, 1200);
    } catch (err: any) {
      setEditError(err.message || 'فشل حفظ التعديلات');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPin || resetPin.length !== 4) {
      setResetError('يرجى إدخال رمز موافقة المدير (4 أرقام)');
      return;
    }

    setResetting(true);
    setResetError(null);
    try {
      const res = await api.resetOperationalData(resetPin.trim());
      setResetSuccess(res.message || 'تم تفريغ النظام وتصفير الحركات بنجاح مع الحفاظ على الأصناف والمخزون!');
      setTimeout(() => {
        setShowResetModal(false);
        setResetPin('');
        loadSettings();
      }, 1500);
    } catch (err: any) {
      setResetError(err.message || 'فشل تصفير النظام، تأكد من صحة رمز PIN');
    } finally {
      setResetting(false);
    }
  };

  const handleVerifyNow = async () => {
    setVerifying(true);
    try {
      const v = await api.verifyAuditChain();
      setAuditStatus(v);
      alert(v.message);
    } catch (err: any) {
      alert(err.message || 'فشل فحص سلامة سجل التدقيق');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-6 h-6 text-blue-600" />
          <span>إعدادات المنشأة، الأمان، وسجل التدقيق المشفر</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          إدارة وتعديل بيانات المنشأة، حساب المدير، وحماية السجلات المالية بسلسلة تشفيرية SHA-256
        </p>
      </div>

      {/* Company Profile Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center shadow-md">
            {logoLetter}
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">{company.name_ar}</h3>
            <p className="text-xs text-slate-500 font-medium">{company.tagline || 'مواد البناء والتوريدات العامة'}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {company.address} {company.phones ? `— هاتف: ${company.phones}` : ''}
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenEdit}
          className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 shadow-sm"
        >
          <Edit className="w-4 h-4" />
          <span>تعديل بيانات المنشأة والمدير</span>
        </button>
      </div>

      {/* Security & Integrity Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800">
                فحص النزاهة التشفيرية (Audit Hash Chain)
              </h3>
              <p className="text-xs text-slate-500">
                سلسلة الهاش المشفرة تضمن اكتشاف أي تعديل مباشر لقاعدة البيانات فورياً
              </p>
            </div>
          </div>

          <button
            onClick={handleVerifyNow}
            disabled={verifying}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
            <span>فحص السلسلة الآن</span>
          </button>
        </div>

        {auditStatus && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-emerald-900 block">حالة السلسلة التشفيرية:</span>
              <span className="text-emerald-700 font-medium">{auditStatus.message}</span>
            </div>
            <div className="text-left font-mono font-bold text-emerald-900">
              {auditStatus.totalRecordsVerified} سجل مفحوص
            </div>
          </div>
        )}
      </div>

      {/* Cloud Database Sync Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-800">
                  المزامنة والربط السحابي (Cloud Database Sync)
                </h3>
                {syncStatus?.enabled && syncStatus?.serverUrl ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    مفعل وجاهز للربط السحابي
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                    وضع العمل المحلي (Local Offline Engine)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                ربط النسخ المحلية بالسيرفر المركزي لمزامنة الفواتير واليومية والمخزن تلقائياً بين كافة الأجهزة والفروع
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleTriggerSync}
              disabled={syncingNow || !syncStatus?.serverUrl}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <UploadCloud className={`w-4 h-4 ${syncingNow ? 'animate-bounce' : ''}`} />
              <span>{syncingNow ? 'جاري المزامنة...' : 'مزامنة الآن'}</span>
            </button>
            <button
              onClick={handleEnqueueAll}
              disabled={enqueuingAll}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
              title="تجهيز وإدراج كافة الأصناف والعملاء والموردين في طابور الرفع السحابي"
            >
              <Database className="w-4 h-4" />
              <span>تجهيز السجلات</span>
            </button>
          </div>
        </div>

        {/* Sync message feedback */}
        {syncMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              syncMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
            }`}
          >
            {syncMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{syncMessage.text}</span>
          </div>
        )}

        {/* Sync Configuration Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رابط السيرفر السحابي (Cloud API URL)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={syncUrl}
                onChange={(e) => setSyncUrl(e.target.value)}
                placeholder="https://api.fludo-erp.com أو IP السيرفر"
                dir="ltr"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs text-left font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleTestSync}
                disabled={testingSync || !syncUrl}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Globe className={`w-3.5 h-3.5 ${testingSync ? 'animate-spin' : ''}`} />
                <span>فحص الاتصال</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              أدخل رابط الـ Cloud API عند رفع السيرفر المركزي لمزامنة هذه النسخة.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مفتاح الأمان السحابي / رمز العميل (Sync Security Token)
            </label>
            <input
              type="password"
              value={syncToken}
              onChange={(e) => setSyncToken(e.target.value)}
              placeholder="••••••••••••••••••••••••"
              dir="ltr"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-left font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              معرّف هذه المنشأة: <code className="font-mono text-[10px] text-slate-600">{syncStatus?.tenantId || 'جاري التحميل...'}</code>
            </p>
          </div>
        </div>

        {/* Sync Controls & Metrics */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(e) => setSyncEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <span className="text-xs font-bold text-slate-700">
              تفعيل المزامنة التلقائية الدورية في الخلفية
            </span>
          </label>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="bg-slate-100 px-2.5 py-1 rounded-lg">
              السجلات المعلقة للرفع: <strong className="text-blue-700">{syncStatus?.pendingCount || 0}</strong>
            </span>
            {syncStatus?.lastSuccessAt && (
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg">
                آخر مزامنة: {new Date(syncStatus.lastSuccessAt).toLocaleDateString('ar-EG')} {new Date(syncStatus.lastSuccessAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={handleSaveSyncConfig}
              disabled={savingSync}
              className="px-4 py-1.5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow transition-colors disabled:opacity-50"
            >
              {savingSync ? 'جاري الحفظ...' : 'حفظ إعدادات الربط'}
            </button>
          </div>
        </div>
      </div>

      {/* Maintenance & Clean Reset Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-800">
              تصفير وتفريغ الحركات التشغيلية (Clean Reset)
            </h3>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              يقوم بتصفير كافة فواتير المبيعات والمشتريات وحركات اليومية ومسح العملاء والموردين التجريبيين لبدء العمل الفعلي، مع <strong>الحفاظ الكامل على كافة الأصناف والمستودع ووحدات القياس وحساب المدير</strong>.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setResetPin('');
            setResetError(null);
            setResetSuccess(null);
            setShowResetModal(true);
          }}
          className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
          <span>تصفير وتفريغ الحركات (بإذن المدير)</span>
        </button>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            <span>سجل الرقابة والتدقيق (Audit Trail)</span>
          </h3>
          <span className="text-xs text-slate-400">آخر 100 عملية مسجلة</span>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
              <tr>
                <th className="p-3 w-16 text-center">التسلسل</th>
                <th className="p-3">التاريخ والوقت</th>
                <th className="p-3">المستخدم</th>
                <th className="p-3">النوع / الجدول</th>
                <th className="p-3">العملية</th>
                <th className="p-3">السبب المسجل</th>
                <th className="p-3 font-mono text-[10px]">SHA-256 Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    جاري تحميل سجل التدقيق...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    لا توجد عمليات مسجلة في سجل التدقيق حتى الآن
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="p-3 text-center font-mono font-bold text-slate-500">#{log.seq}</td>
                    <td className="p-3 font-mono text-slate-600">{log.occurred_at}</td>
                    <td className="p-3 font-bold text-slate-800">{log.full_name || log.username || 'النظام'}</td>
                    <td className="p-3 font-mono text-blue-800">{log.entity_table}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{log.reason || 'عملية عادية'}</td>
                    <td className="p-3 font-mono text-[10px] text-slate-400 max-w-[120px] truncate" title={log.row_hash}>
                      {log.row_hash ? log.row_hash.substring(0, 16) + '...' : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Company & Manager Details Modal */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-600 text-white shadow-md">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">تعديل بيانات المنشأة والمدير</h3>
                  <p className="text-xs text-blue-200">تحديث الهوية التجارية، العناوين، وكلمة سر المدير</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveCompanyAndManager} className="p-6 overflow-y-auto space-y-5">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-center">
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editSuccess}</span>
                </div>
              )}

              {/* Section 1: Company Profile */}
              <div className="space-y-3">
                <span className="text-xs font-black text-blue-900 border-r-2 border-blue-600 pr-2 block">
                  1. بيانات المنشأة والهوية التجارية
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">اسم المنشأة بالعربي *</label>
                    <input
                      type="text"
                      value={editNameAr}
                      onChange={(e) => setEditNameAr(e.target.value)}
                      placeholder="اسم المؤسسة / الشركة"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">الاسم بالإنجليزي</label>
                    <input
                      type="text"
                      value={editNameEn}
                      onChange={(e) => setEditNameEn(e.target.value)}
                      placeholder="Company Name"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">النشاط / الشعار اللفظي</label>
                  <input
                    type="text"
                    value={editTagline}
                    onChange={(e) => setEditTagline(e.target.value)}
                    placeholder="مواد البناء والتوريدات العامة"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">العنوان / المقر</label>
                    <input
                      type="text"
                      value={editAddress}
                      onChange={(e) => setEditAddress(e.target.value)}
                      placeholder="شارع عشماوي، كرداسة، الجيزة"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">أرقام الهواتف</label>
                    <input
                      type="text"
                      value={editPhones}
                      onChange={(e) => setEditPhones(e.target.value)}
                      placeholder="01030343576 / 01008681338"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Manager Profile & Security */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-black text-blue-900 border-r-2 border-blue-600 pr-2 block">
                  2. بيانات المدير العام والأمان
                </span>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المسؤول / المدير الكامل</label>
                  <input
                    type="text"
                    value={editAdminName}
                    onChange={(e) => setEditAdminName(e.target.value)}
                    placeholder="محمد رضا"
                    className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      كلمة مرور جديدة (اختياري)
                    </label>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="اتركها فارغة للإبقاء على الحالية"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">12 حرفاً على الأقل في حال التغيير</span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      رمز موافقة المدير الجديد PIN (4 أرقام)
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      className="w-full border border-slate-300 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center tracking-widest"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">اتركه فارغاً للإبقاء على الرمز الحالي</span>
                  </div>
                </div>

                {(editPassword || editPin) && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      تأكيد رمز PIN الحالي للمدير:
                    </label>
                    <input
                      type="password"
                      maxLength={4}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="أدخل الرمز الحالي لتأكيد التغيير"
                      className="w-full border border-amber-300 rounded-xl p-2 text-xs outline-none font-mono text-center tracking-widest bg-white"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clean Reset Confirmation Modal */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResetModal(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="font-bold text-sm">تأكيد تصفير الحركات وتفريغ النظام</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="p-1 rounded-lg text-rose-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReset} className="p-6 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                <p className="font-bold">تحذير أمني:</p>
                <p>
                  سيتم تفريغ كافة حركات الفواتير والمدفوعات والمصروفات والعملاء والموردين. <strong>الأصناف والمخزون وحساب المدير ستبقى محفوظة بالكامل</strong>.
                </p>
              </div>

              {resetError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold text-center">
                  {resetError}
                </div>
              )}
              {resetSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold text-center">
                  {resetSuccess}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 text-center">
                  أدخل رمز موافقة المدير (4 أرقام) للتأكيد
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={resetPin}
                  onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono border-2 border-slate-300 rounded-xl p-2.5 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none transition-all shadow-inner bg-slate-50"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={resetting || resetPin.length !== 4}
                  className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{resetting ? 'جاري التصفير...' : 'تأكيد التصفير والتفريغ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
