import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useCompany } from '../context/CompanyContext';
import { Settings, ShieldCheck, KeyRound, History, RefreshCw, AlertCircle, Building2, Edit } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { company, logoLetter, setShowSetupModal } = useCompany();
  const [logs, setLogs] = useState<any[]>([]);
  const [auditStatus, setAuditStatus] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [l, v] = await Promise.all([api.getAuditLogs(), api.verifyAuditChain()]);
      setLogs(l);
      setAuditStatus(v);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
          إدارة بيانات الشركة، حسابات المستخدمين، وحماية السجلات المالية بسلسلة تشفيرية SHA-256
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
            <p className="text-xs text-slate-400 mt-0.5">{company.address} {company.phones ? `— هاتف: ${company.phones}` : ''}</p>
          </div>
        </div>

        <button
          onClick={() => setShowSetupModal(true)}
          className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0"
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
    </div>
  );
};

