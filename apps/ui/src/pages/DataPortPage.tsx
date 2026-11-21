import React, { useState, useRef } from 'react';
import { api, getStoredToken, getApiBase } from '../api/client';
import {
  Database,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  FileText,
  RefreshCw,
  Info,
  X,
  Play,
  Layers,
} from 'lucide-react';

export const DataPortPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sqlScript, setSqlScript] = useState('');
  const [sqlLoading, setSqlLoading] = useState(false);
  const [sqlResult, setSqlResult] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState<string | null>(null);
  const [fixFormulas, setFixFormulas] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportDownload = async (endpoint: string, filename: string) => {
    setDownloadLoading(endpoint);
    setErrorMessage(null);
    try {
      const token = getStoredToken();
      const res = await fetch(`${getApiBase()}/data/${endpoint}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'فشل تحميل الملف من الخادم');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMessage(`تم تحميل الملف بنجاح: ${filename}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل التصدير، يرجى المحاولة مرة أخرى');
    } finally {
      setDownloadLoading(null);
    }
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      setErrorMessage('يرجى اختيار ملف إكسيل بصيغة .xlsx أو .xls');
      return;
    }
    setFile(selectedFile);
    setPreview(null);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handlePreviewExcel = async () => {
    if (!file) {
      setErrorMessage('يرجى اختيار ملف أولاً');
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.previewExcelImport(formData);

      const totalItems =
        (res.customersFound?.length || 0) +
        (res.suppliersFound?.length || 0) +
        (res.productsFound?.length || 0);

      if (totalItems === 0) {
        setErrorMessage(
          'لم يتم العثور على جداول عملاء أو موردين أو أصناف في الملف. يمكنك استخدام "تحميل نموذج إكسيل جاهز" لتعبئة بياناتك بالشكل الصحيح.'
        );
      } else {
        setPreview(res);
        setSuccessMessage(`تم تحليل الملف بنجاح! تم العثور على ${totalItems} سجل جاهز للاستيراد.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل قراءة وتحليل ملف الإكسيل');
    } finally {
      setLoading(false);
    }
  };

  const handleCommitExcel = async () => {
    if (!preview) return;

    setCommitLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.commitExcelImport(preview, 'opening_balances');
      setSuccessMessage(res.message || 'تم استيراد كافة البيانات وترحيل الأرصدة الافتتاحية بنجاح!');
      setPreview(null);
      setFile(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء استيراد البيانات لقاعدة البيانات');
    } finally {
      setCommitLoading(false);
    }
  };

  const handleSqlImport = async () => {
    if (!sqlScript.trim()) {
      setErrorMessage('يرجى كتابة أو لصق كود SQL أولاً');
      return;
    }

    setSqlLoading(true);
    setErrorMessage(null);
    setSqlResult(null);
    try {
      const res = await api.importSql(sqlScript);
      setSqlResult(res.message || 'تم تنفيذ كود SQL بنجاح داخل المعاملة الآمنة');
      setSuccessMessage('تم تنفيذ كود SQL بنجاح!');
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تنفيذ كود SQL');
    } finally {
      setSqlLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 select-none">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Database className="w-6 h-6" />
            </div>
            <span>مركز استيراد وتصدير البيانات (Excel & SQL)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ترحيل فوري وسلس للبيانات من وإلى ملفات إكسيل وقواعد بيانات SQL مع المعاينة والتدقيق الكامل
          </p>
        </div>

        {/* Quick Sample Template Button */}
        <button
          onClick={() => handleExportDownload('template/excel', 'نموذج_استيراد_بيانات_مؤسسة.xlsx')}
          disabled={downloadLoading !== null}
          className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>تحميل نموذج إكسيل جاهز لتعبئة واستيراد البيانات</span>
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Excel Section (Left) & SQL Section (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Card 1: Excel Import / Export */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-800">استيراد وتصدير ملفات Excel (.xlsx)</h3>
                <span className="text-[11px] text-slate-400">يدعم ملفات يوميه.xlsx، النماذج القياسية، أو أي شيت مجدول</span>
              </div>
            </div>
          </div>

          {/* Export Operations */}
          <div className="space-y-3">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-700" />
                  <span className="text-xs font-black text-blue-900">
                    تصدير شيت اليومية الكامل (مطابق لملف يوميه.xlsx — 10 شيتات)
                  </span>
                </div>
                <span className="text-[10px] bg-blue-200/70 text-blue-900 font-bold px-2 py-0.5 rounded">
                  10 Worksheets
                </span>
              </div>
              <p className="text-[11px] text-blue-700/90 leading-relaxed">
                يولّد ملفاً مطابقاً 100% للشيت الأصلي (الرئيسية، الإعدادات، الفاتورة، إذن استلام، كشف الحساب بحد أحمر، حسابات العملاء 20 سطر، الموردين 44 سطر، الموظفين، والمعدات) مع الحفاظ التام على المعادلات الأصلية.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer font-bold">
                  <input
                    type="checkbox"
                    checked={fixFormulas}
                    onChange={(e) => setFixFormulas(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span>تصحيح أخطاء المعادلات القديمة تلقائياً</span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    handleExportDownload(
                      `export/yomia?fix_formulas=${fixFormulas}`,
                      'يوميه_Fludo_ERP.xlsx'
                    )
                  }
                  disabled={downloadLoading !== null}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {downloadLoading?.includes('export/yomia')
                      ? 'جاري توليد الشيت...'
                      : 'تحميل ملف اليومية الكامل (.xlsx)'}
                  </span>
                </button>
              </div>
            </div>

            <span className="text-xs font-black text-slate-700 block">تصديرات إضافية:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleExportDownload('export/customers', 'شيت_العملاء_والأرصدة.xlsx')}
                disabled={downloadLoading !== null}
                className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 rounded-xl text-xs font-bold flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>{downloadLoading === 'export/customers' ? 'جاري التصدير...' : 'شيت العملاء والأرصدة'}</span>
                </div>
                <span className="text-[10px] bg-emerald-200/60 px-2 py-0.5 rounded text-emerald-900">XLSX</span>
              </button>

              <button
                type="button"
                onClick={() => handleExportDownload('export/products', 'دليل_الأصناف_والأسعار.xlsx')}
                disabled={downloadLoading !== null}
                className="p-3 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300/80 rounded-xl text-xs font-bold flex items-center justify-between transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-teal-600" />
                  <span>{downloadLoading === 'export/products' ? 'جاري التصدير...' : 'دليل الأصناف والأسعار'}</span>
                </div>
                <span className="text-[10px] bg-teal-200/60 px-2 py-0.5 rounded text-teal-900">XLSX</span>
              </button>
            </div>
          </div>

          {/* Import Drag & Drop Zone */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">استيراد شيت بيانات (Excel):</span>
              <button
                type="button"
                onClick={() => handleExportDownload('template/excel', 'نموذج_استيراد_بيانات_مؤسسة.xlsx')}
                className="text-[11px] text-blue-600 hover:underline font-bold"
              >
                تحميل نموذج الشيت الجاهز
              </button>
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.99]'
                  : file
                  ? 'border-emerald-400 bg-emerald-50/40'
                  : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6" />
              </div>

              {file ? (
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-800">{file.name}</p>
                  <p className="text-[11px] text-slate-400">{(file.size / 1024).toFixed(1)} كيلوبايت — جاهز للفحص</p>
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    تم اختيار الملف بنجاح
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-700">اسحب وأفلت ملف الإكسيل هنا، أو انقر للاختيار</p>
                  <p className="text-[11px] text-slate-400">يدعم صيغ .xlsx و .xls (جداول العملاء والموردين والأصناف)</p>
                </div>
              )}
            </div>

            {/* Preview Action Button */}
            {file && !preview && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handlePreviewExcel}
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الفحص واستخراج الجداول...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>معاينة محتويات الملف والتحقق قبل الحفظ</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                  }}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
              </div>
            )}

            {/* Preview Result Box */}
            {preview && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4 animate-in fade-in">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-black text-xs text-slate-800">نتيجة فحص وتدقيق الشيت:</h4>
                  <span className="text-[11px] text-slate-500 font-bold">{file?.name}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-slate-400 block text-[10px] font-bold">العملاء</span>
                    <strong className="text-blue-700 text-base font-black">{preview.customersFound?.length || 0}</strong>
                    <span className="text-[10px] text-slate-400 block">عميل</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-slate-400 block text-[10px] font-bold">الموردين</span>
                    <strong className="text-purple-700 text-base font-black">{preview.suppliersFound?.length || 0}</strong>
                    <span className="text-[10px] text-slate-400 block">مورد</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-slate-400 block text-[10px] font-bold">الأصناف</span>
                    <strong className="text-emerald-700 text-base font-black">{preview.productsFound?.length || 0}</strong>
                    <span className="text-[10px] text-slate-400 block">صنف</span>
                  </div>
                </div>

                {/* Commit Button */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCommitExcel}
                    disabled={commitLoading}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {commitLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري الحفظ والترحيل للدفاتر...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تأكيد الاستيراد وترحيل الأرصدة الافتتاحية</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPreview(null);
                      setFile(null);
                    }}
                    className="px-4 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: SQL Export / Direct Import */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-800">تصدير واستيراد قواعد البيانات (.sql)</h3>
                <span className="text-[11px] text-slate-400">نسخ احتياطي كامل للبيانات وأوامر ترحيل PostgreSQL</span>
              </div>
            </div>
          </div>

          {/* Backup SQL Export */}
          <div className="space-y-3">
            <span className="text-xs font-black text-slate-700 block">خيارات تصدير قواعد البيانات (SQL):</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleExportDownload('export/sql/full-backup', 'fludo_erp_full_backup.sql')}
                disabled={downloadLoading !== null}
                className="inline-flex items-center justify-center gap-2 px-3 py-3 bg-indigo-50 text-indigo-900 border border-indigo-300 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <Database className="w-4 h-4 text-indigo-600" />
                <span>
                  {downloadLoading === 'export/sql/full-backup'
                    ? 'جاري عمل pg_dump...'
                    : 'نسخة كاملة (PostgreSQL pg_dump)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExportDownload('export/sql', 'fludo_erp_data.sql')}
                disabled={downloadLoading !== null}
                className="inline-flex items-center justify-center gap-2 px-3 py-3 bg-blue-50 text-blue-900 border border-blue-300 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>
                  {downloadLoading === 'export/sql'
                    ? 'جاري التصدير...'
                    : 'ملف البيانات المحمولة (INSERT INTO)'}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              النسخة الكاملة تستخدم pg_dump القياسي مع SHA-256 Checksum، بينما ملف البيانات المحمولة يحوي أوامر INSERT بترتيب الـ Foreign Keys.
            </p>
          </div>

          {/* Direct SQL Console */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">تنفيذ استعلام أو كود SQL مباشر:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setSqlScript('SELECT count(*) FROM app.parties;')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-mono"
                >
                  عد العملاء
                </button>
                <button
                  type="button"
                  onClick={() => setSqlScript('SELECT count(*) FROM app.products;')}
                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-mono"
                >
                  عد الأصناف
                </button>
              </div>
            </div>

            <textarea
              value={sqlScript}
              onChange={(e) => setSqlScript(e.target.value)}
              placeholder="اكتب كود SQL هنا (مثال: INSERT INTO ... أو استعلامات الترحيل والتحديث)..."
              className="w-full h-32 border border-slate-300 rounded-xl p-3 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500 bg-slate-900 text-emerald-400 leading-relaxed"
              dir="ltr"
            />

            {sqlResult && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-800">
                {sqlResult}
              </div>
            )}

            <button
              type="button"
              onClick={handleSqlImport}
              disabled={sqlLoading || !sqlScript.trim()}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sqlLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري تنفيذ الكود داخل المعاملة الآمنة...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-emerald-400" />
                  <span>تنفيذ كود SQL داخل معاملة آمنة (Transaction)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
