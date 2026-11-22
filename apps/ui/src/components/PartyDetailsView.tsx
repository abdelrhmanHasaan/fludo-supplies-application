import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Printer,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  User,
  Wallet,
  X,
  Tag,
  AlertCircle,
  Plus,
} from 'lucide-react';

interface PartyDetailsProps {
  partyId: string;
  isCustomer: boolean;
  onBack: () => void;
  onOpenInvoice?: (invoiceId: string) => void;
}

export const PartyDetailsView: React.FC<PartyDetailsProps> = ({
  partyId,
  isCustomer,
  onBack,
  onOpenInvoice,
}) => {
  const [summary, setSummary] = useState<any>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Collapsible year/month state
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  // New transaction modal
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [txAmount, setTxAmount] = useState<number | ''>('');
  const [txCashAccountId, setTxCashAccountId] = useState('');
  const [txDate, setTxDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [txDriver, setTxDriver] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  // PIN edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [partyId]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [sumRes, shipRes, actRes, caRes] = await Promise.all([
        api.getPartySummary(partyId),
        api.getPartyShipments(partyId),
        api.getPartyActivity(partyId),
        api.getCashAccounts ? api.getCashAccounts() : Promise.resolve([]),
      ]);
      setSummary(sumRes);
      setShipments(shipRes || []);
      setActivities(actRes || []);
      setCashAccounts(caRes || []);

      if (caRes && caRes.length > 0) {
        setTxCashAccountId((prev) => prev || caRes.find((c: any) => c.is_active)?.id || caRes[0].id);
      }

      if (sumRes) {
        setEditName(sumRes.party_name || '');
        setEditPhone(sumRes.party_phone || '');
      }

      // Initialize default open states: current year & current month open
      const currentYear = new Date().getFullYear().toString();
      const currentMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      setOpenYears({ [currentYear]: true });
      setOpenMonths({ [currentMonth]: true });
    } catch (err) {
      console.error('Failed to load party details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxError('');
    const amt = Number(txAmount);
    if (!amt || amt <= 0) {
      setTxError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }
    if (!txCashAccountId) {
      setTxError('يرجى اختيار الخزينة أو الحساب النقدي');
      return;
    }

    setTxLoading(true);
    try {
      await api.recordPayment({
        paymentType: isCustomer ? 'customer_receipt' : 'supplier_payment',
        direction: isCustomer ? 'in' : 'out',
        partyId,
        paymentDate: txDate,
        amount: amt,
        paymentMethod: 'cash',
        cashAccountId: txCashAccountId,
        driverName: txDriver || undefined,
        notes: txNotes || undefined,
      });

      setShowAddTxModal(false);
      setTxAmount('');
      setTxNotes('');
      setTxDriver('');
      loadAllData();
    } catch (err: any) {
      setTxError(err.message || 'فشل تسجيل المعاملة');
    } finally {
      setTxLoading(false);
    }
  };

  const formatMoney = (val: any) => {
    const num = Number(val || 0);
    return num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  const cashAccountMap = useMemo(() => {
    const map = new Map<string, string>();
    cashAccounts.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [cashAccounts]);

  // Group activities into Year -> Month -> Day -> Activities
  const groupedTree = useMemo(() => {
    const tree: Record<
      string,
      {
        year: string;
        totalDebit: number;
        totalCredit: number;
        months: Record<
          string,
          {
            month: string;
            monthName: string;
            totalDebit: number;
            totalCredit: number;
            days: Record<
              string,
              {
                day: string;
                dateString: string;
                items: any[];
              }
            >;
          }
        >;
      }
    > = {};

    activities.forEach((act) => {
      const d = new Date(act.occurred_at);
      const year = d.getFullYear().toString();
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const monthKey = `${year}-${monthNum}`;
      const dayKey = d.toISOString().split('T')[0];

      if (!tree[year]) {
        tree[year] = { year, totalDebit: 0, totalCredit: 0, months: {} };
      }
      tree[year].totalDebit += Number(act.amount_debit || 0);
      tree[year].totalCredit += Number(act.amount_credit || 0);

      if (!tree[year].months[monthKey]) {
        const monthName = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
        tree[year].months[monthKey] = {
          month: monthKey,
          monthName,
          totalDebit: 0,
          totalCredit: 0,
          days: {},
        };
      }
      tree[year].months[monthKey].totalDebit += Number(act.amount_debit || 0);
      tree[year].months[monthKey].totalCredit += Number(act.amount_credit || 0);

      if (!tree[year].months[monthKey].days[dayKey]) {
        tree[year].months[monthKey].days[dayKey] = {
          day: dayKey,
          dateString: d.toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }),
          items: [],
        };
      }
      tree[year].months[monthKey].days[dayKey].items.push(act);
    });

    return tree;
  }, [activities]);

  // Shipments totals
  const shipmentTotals = useMemo(() => {
    let trips = shipments.length;
    let totalQty = 0;
    let totalGross = 0;
    let totalDiscount = 0;
    let totalNet = 0;

    shipments.forEach((s) => {
      totalGross += Number(s.lines_total || 0);
      totalDiscount += Number(s.discount_amount || 0);
      totalNet += Number(s.net_total || 0);
      if (Array.isArray(s.items)) {
        s.items.forEach((it: any) => {
          totalQty += Number(it.qty || 0);
        });
      }
    });

    return { trips, totalQty, totalGross, totalDiscount, totalNet };
  }, [shipments]);

  const toggleYear = (year: string) => {
    setOpenYears((prev) => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleMonth = (monthKey: string) => {
    setOpenMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const handleSaveEditWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editName.trim()) {
      setEditError('الاسم إلزامي');
      return;
    }
    if (!managerPin) {
      setEditError('يرجى إدخال الرقم السري للمدير (PIN)');
      return;
    }

    setEditLoading(true);
    try {
      // 1. Verify PIN and grant approval
      await api.verifyPin({
        targetTable: 'parties',
        targetId: partyId,
        reason: editReason || 'تعديل بيانات الطرف من صفحة الحساب',
        managerPin,
      });

      // 2. Perform Update
      await api.updateParty(partyId, {
        name: editName,
        phone: editPhone,
        category: editCategory,
      });

      setShowEditModal(false);
      setManagerPin('');
      setEditReason('');
      loadAllData();
    } catch (err: any) {
      setEditError(err.message || 'فشل التحقق من الرقم السري أو تعديل البيانات');
    } finally {
      setEditLoading(false);
    }
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case 'sale':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700">فاتورة بيع</span>;
      case 'sale_return':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">مرتجع مبيعات</span>;
      case 'purchase':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700">فاتورة شراء</span>;
      case 'purchase_return':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700">مرتجع مشتريات</span>;
      case 'payment_in':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700">سند قبض</span>;
      case 'payment_out':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700">سند صرف</span>;
      case 'reservation':
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">حجز بضاعة</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">{type}</span>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn" dir="rtl">
      {/* Top Navigation & Profile Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all active:scale-95"
            title="رجوع للقائمة"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900">{summary?.party_name || '...'}</h1>
              <span className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {summary?.party_code || 'بدون كود'}
              </span>
              <span
                className={`px-3 py-1 rounded-xl text-xs font-black ${
                  summary?.balance_type === 'عليه'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : summary?.balance_type === 'له'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {summary?.balance_type === 'خالص' ? 'الحساب خالص' : `الرصيد: ${summary?.balance_type} (${formatMoney(Math.abs(summary?.net_balance || 0))})`}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-4">
              {summary?.party_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-4 h-4 text-slate-400" />
                  {summary.party_phone}
                </span>
              )}
              <span>{isCustomer ? 'عميل معتمد' : 'مورد مواد بناء'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddTxModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>{isCustomer ? 'إضافة تحصيل / دفعة' : 'إضافة سداد / دفعة'}</span>
          </button>
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 text-sm font-bold transition-all active:scale-95"
          >
            <Lock className="w-4 h-4 text-amber-600" />
            تعديل البيانات (PIN)
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            طباعة كشف الحساب
          </button>
        </div>
      </div>

      {/* A) Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: إجمالي المشتريات */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">
              {isCustomer ? 'إجمالي مشترياته' : 'إجمالي ما اشتريناه منه'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {loading ? '...' : formatMoney(summary?.total_purchases)}
          </div>
          <div className="text-xs text-slate-400 mt-2">صافي الفواتير المعتمدة بعد الخصومات</div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-blue-500 rounded-r-2xl" />
        </div>

        {/* Card 2: إجمالي السدادات */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">
              {isCustomer ? 'إجمالي السدادات (سدد لنا)' : 'إجمالي ما سددناه له'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 text-emerald-700">
            {loading ? '...' : formatMoney(summary?.total_payments)}
          </div>
          <div className="text-xs text-slate-400 mt-2">مجموع السندات والتحصيلات النقدية</div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500 rounded-r-2xl" />
        </div>

        {/* Card 3: البضاعة المحجوزة غير المسلّمة */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-500">البضاعة المحجوزة غير المسلّمة</span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Tag className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 text-indigo-600">
            {loading ? '...' : (Number(summary?.reserved_undelivered || 0)).toLocaleString('ar-EG')} وحدة
          </div>
          <div className="text-xs text-slate-400 mt-2">من واقع طلبات الحجز المفتوحة</div>
          <div className="absolute top-0 right-0 w-1.5 h-full bg-indigo-500 rounded-r-2xl" />
        </div>

        {/* Card 4: عليه و له */}
        <div
          className={`rounded-2xl p-6 border shadow-sm relative overflow-hidden ${
            summary?.balance_type === 'عليه'
              ? 'bg-emerald-50/50 border-emerald-200'
              : summary?.balance_type === 'له'
              ? 'bg-rose-50/50 border-rose-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-slate-700">
              {summary?.balance_type === 'عليه' ? 'المبلغ المستحق (عليه لنا)' : summary?.balance_type === 'له' ? 'المبلغ المستحق (له عندنا)' : 'الرصيد الحالي'}
            </span>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                summary?.balance_type === 'عليه'
                  ? 'bg-emerald-100 text-emerald-700'
                  : summary?.balance_type === 'له'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {summary?.balance_type === 'عليه' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
          </div>
          <div
            className={`text-2xl font-black ${
              summary?.balance_type === 'عليه'
                ? 'text-emerald-700'
                : summary?.balance_type === 'له'
                ? 'text-rose-700'
                : 'text-slate-800'
            }`}
          >
            {loading ? '...' : formatMoney(Math.abs(summary?.net_balance || 0))}
          </div>
          <div className="text-xs font-bold mt-2 text-slate-500">
            {summary?.balance_type === 'خالص' ? 'لا توجد مديونية حالية' : `حالة الحساب: ${summary?.balance_type}`}
          </div>
          <div
            className={`absolute top-0 right-0 w-1.5 h-full rounded-r-2xl ${
              summary?.balance_type === 'عليه' ? 'bg-emerald-500' : summary?.balance_type === 'له' ? 'bg-rose-500' : 'bg-slate-400'
            }`}
          />
        </div>
      </div>

      {/* B) حركات العربات (الشحنات) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">حركات العربات والشحنات</h2>
              <p className="text-xs text-slate-400">سجل النقل والخروج الميداني المرتبط بالفواتير</p>
            </div>
          </div>

          {/* Top Shipment Totals Banner */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700">
            <div>
              الرحلات: <span className="text-blue-600 font-black">{shipmentTotals.trips}</span>
            </div>
            <div>•</div>
            <div>
              إجمالي الكميات: <span className="text-slate-900 font-black">{shipmentTotals.totalQty}</span>
            </div>
            <div>•</div>
            <div>
              القيمة: <span className="text-slate-900 font-black">{formatMoney(shipmentTotals.totalGross)}</span>
            </div>
            <div>•</div>
            <div>
              الخصومات: <span className="text-rose-600 font-black">{formatMoney(shipmentTotals.totalDiscount)}</span>
            </div>
            <div>•</div>
            <div>
              الصافي: <span className="text-emerald-700 font-black">{formatMoney(shipmentTotals.totalNet)}</span>
            </div>
          </div>
        </div>

        {shipments.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            لا توجد شحنات أو حركات نقل مسجلة لهذا الطرف
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3">رقم الشحنة</th>
                  <th className="p-3">التاريخ والساعة</th>
                  <th className="p-3">الوجهة (راح فين)</th>
                  <th className="p-3">السائق / السيارة</th>
                  <th className="p-3">الأصناف والكميات</th>
                  <th className="p-3">القيمة</th>
                  <th className="p-3">الخصم</th>
                  <th className="p-3">الصافي</th>
                  <th className="p-3">الفاتورة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-bold text-slate-800">{s.shipment_no}</td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {s.departed_at
                        ? new Date(s.departed_at).toLocaleString('ar-EG', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '-'}
                    </td>
                    <td className="p-3 font-semibold text-slate-800">{s.destination || 'الموقع الرئيسي'}</td>
                    <td className="p-3 text-slate-600">
                      <div>{s.driver_name || 'بدون سائق'}</div>
                      <span className="text-xs text-slate-400">{s.vehicle_name ? `${s.vehicle_name} (${s.plate_no || ''})` : ''}</span>
                    </td>
                    <td className="p-3 text-xs text-slate-700 max-w-xs">
                      {Array.isArray(s.items) &&
                        s.items.map((it: any, idx: number) => (
                          <div key={idx} className="truncate">
                            • {it.product_name}: {it.qty} {it.unit_name || ''}
                          </div>
                        ))}
                    </td>
                    <td className="p-3 text-slate-800 font-semibold">{formatMoney(s.lines_total)}</td>
                    <td className="p-3 text-rose-600 font-semibold">{formatMoney(s.discount_amount)}</td>
                    <td className="p-3 text-emerald-700 font-black">{formatMoney(s.net_total)}</td>
                    <td className="p-3">
                      <button
                        onClick={() => onOpenInvoice && onOpenInvoice(s.invoice_id)}
                        className="text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        {s.invoice_no}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* C) سجل المعاملات الكامل: هرم قابل للطي (سنة ← شهر ← يوم ← معاملات) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">سجل المعاملات والنشاط المحاسبي</h2>
              <p className="text-xs text-slate-400">
                تسلسل هرمي زمني: سنة ← شهر (مقفول بإجمالياته) ← يوم ← المعاملات التفصيلية
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddTxModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل معاملة في هذا السجل</span>
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-semibold">
            لا توجد معاملات مسجلة لهذا الطرف بعد
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedTree)
              .sort((a, b) => Number(b) - Number(a))
              .map((yearKey) => {
                const yearData = groupedTree[yearKey];
                const isYearOpen = !!openYears[yearKey];

                return (
                  <div key={yearKey} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    {/* Year Level Header */}
                    <div
                      onClick={() => toggleYear(yearKey)}
                      className="bg-slate-100/80 hover:bg-slate-200/70 p-4 flex items-center justify-between cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3 font-black text-base text-slate-800">
                        <ChevronDown className={`w-5 h-5 transition-transform ${isYearOpen ? 'rotate-180' : ''}`} />
                        <span>سنة {yearKey}</span>
                      </div>
                      <div className="flex items-center gap-6 text-xs font-bold text-slate-600">
                        <span>إجمالي مدين: <strong className="text-emerald-700">{formatMoney(yearData.totalDebit)}</strong></span>
                        <span>إجمالي دائن: <strong className="text-rose-700">{formatMoney(yearData.totalCredit)}</strong></span>
                        <span>الصافي: <strong className="text-blue-800">{formatMoney(yearData.totalDebit - yearData.totalCredit)}</strong></span>
                      </div>
                    </div>

                    {/* Months under Year */}
                    {isYearOpen && (
                      <div className="p-4 space-y-4 bg-slate-50/50">
                        {Object.keys(yearData.months)
                          .sort((a, b) => b.localeCompare(a))
                          .map((monthKey) => {
                            const monthData = yearData.months[monthKey];
                            const isMonthOpen = !!openMonths[monthKey];

                            return (
                              <div
                                key={monthKey}
                                className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-sm"
                              >
                                {/* Month Level Header */}
                                <div
                                  onClick={() => toggleMonth(monthKey)}
                                  className="p-3.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between cursor-pointer transition-colors border-b border-slate-100"
                                >
                                  <div className="flex items-center gap-2 font-bold text-slate-800">
                                    <ChevronDown className={`w-4 h-4 transition-transform ${isMonthOpen ? 'rotate-180' : ''}`} />
                                    <span>{monthData.monthName}</span>
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                      {isMonthOpen ? 'مفتوح للتفاصيل' : 'مطوي (ملخص فقط)'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs font-bold">
                                    <span>مشتريات/فواتير: <strong className="text-slate-800">{formatMoney(monthData.totalDebit)}</strong></span>
                                    <span>سدادات: <strong className="text-emerald-700">{formatMoney(monthData.totalCredit)}</strong></span>
                                    <span>صافي الشهر: <strong className="text-blue-700">{formatMoney(monthData.totalDebit - monthData.totalCredit)}</strong></span>
                                  </div>
                                </div>

                                {/* Days & Transactions */}
                                {isMonthOpen && (
                                  <div className="p-4 space-y-4 divide-y divide-slate-100">
                                    {Object.keys(monthData.days)
                                      .sort((a, b) => b.localeCompare(a))
                                      .map((dayKey) => {
                                        const dayData = monthData.days[dayKey];

                                        return (
                                          <div key={dayKey} className="pt-3 first:pt-0 space-y-2">
                                            <div className="text-xs font-bold text-slate-400 flex items-center gap-2">
                                              <Clock className="w-3.5 h-3.5" />
                                              <span>{dayData.dateString}</span>
                                            </div>

                                            {/* Transaction Rows for the Day */}
                                            <div className="space-y-2">
                                              {dayData.items.map((it: any) => (
                                                <div
                                                  key={it.document_id + it.activity_type}
                                                  className="p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-sm transition-colors"
                                                >
                                                  <div className="flex flex-wrap items-center gap-2.5">
                                                    {getActivityBadge(it.activity_type)}
                                                    <span className="font-bold text-slate-800 font-mono text-xs">
                                                      {it.document_no}
                                                    </span>
                                                    {it.document_id && it.activity_type.includes('sale') && onOpenInvoice && (
                                                      <button
                                                        onClick={() => onOpenInvoice(it.document_id)}
                                                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold hover:underline flex items-center gap-1"
                                                        title="عرض تفاصيل الفاتورة"
                                                      >
                                                        <FileText className="w-3 h-3" />
                                                        <span>عرض</span>
                                                      </button>
                                                    )}
                                                    <span className="text-slate-700 text-xs font-medium">
                                                      {it.description}
                                                    </span>
                                                    {it.cash_account_id && (
                                                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100 font-bold flex items-center gap-1">
                                                        <Wallet className="w-3 h-3" />
                                                        <span>{cashAccountMap.get(it.cash_account_id) || 'خزينة نقدية'}</span>
                                                      </span>
                                                    )}
                                                    {it.occurred_at && (
                                                      <span className="text-[10px] text-slate-400 font-mono">
                                                        {new Date(it.occurred_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                                      </span>
                                                    )}
                                                  </div>

                                                  <div className="flex items-center gap-5 text-left shrink-0">
                                                    {Number(it.amount_debit || 0) > 0 && (
                                                      <div className="text-emerald-700 font-black text-sm">
                                                        + {formatMoney(it.amount_debit)}
                                                      </div>
                                                    )}
                                                    {Number(it.amount_credit || 0) > 0 && (
                                                      <div className="text-rose-700 font-black text-sm">
                                                        - {formatMoney(it.amount_credit)}
                                                      </div>
                                                    )}
                                                    <div className="text-xs text-slate-500 font-bold">
                                                      الرصيد: <strong className="text-slate-900 font-black">{formatMoney(it.running_balance)}</strong>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Edit Party PIN Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleSaveEditWithPin}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">إذن تعديل بيانات الطرف (PIN)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">اسم الطرف</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سبب التعديل</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="مثال: تصحيح خطأ إملائي أو تحديث رقم التليفون"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-2">
                <label className="text-xs font-black text-amber-900 block">
                  الرقم السري للمدير (PIN) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="أدخل 4 أو 6 أرقام"
                  className="w-full px-3 py-2 rounded-xl border border-amber-300 text-center text-lg font-black tracking-widest focus:outline-none focus:border-amber-500 bg-white"
                  required
                />
                <p className="text-[11px] text-amber-700">
                  أي تعديل على البيانات الأساسية بعد حفظها يتطلب إذن المدير لمنع التلاعب.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={editLoading}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                {editLoading ? 'جاري التحقق...' : 'تأكيد التعديل'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Modal: إضافة معاملة / دفعة جديدة */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in">
          <form
            onSubmit={handleSaveTransaction}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-800">
                    {isCustomer ? 'تسجيل دفعة / تحصيل من العميل' : 'تسجيل دفعة / سداد للمورد'}
                  </h3>
                  <span className="text-xs text-slate-400">
                    الطرف: <strong>{summary?.party_name}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {txError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{txError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المبلغ المطلوب تسجيله (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-black text-base text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">تاريخ المعاملة *</label>
                  <input
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الخزينة أو الحساب النقدي المستلم/المنصرف منه *</label>
                {cashAccounts.length === 0 ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold">
                    لا توجد خزائن أو حسابات نقدية مسجلة. يرجى إضافة خزينة أولاً من شاشة الخزينة.
                  </div>
                ) : (
                  <select
                    value={txCashAccountId}
                    onChange={(e) => setTxCashAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="" disabled>اختر الخزينة / الحساب...</option>
                    {cashAccounts.map((ca: any) => (
                      <option key={ca.id} value={ca.id} disabled={!ca.is_active}>
                        {ca.name} {ca.kind ? `(${ca.kind})` : ''} — الرصيد: {Number(ca.balance || 0).toLocaleString()} ج.م {!ca.is_active ? ' (معطلة)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">السائق أو المندوب المستلم (اختياري)</label>
                <input
                  type="text"
                  value={txDriver}
                  onChange={(e) => setTxDriver(e.target.value)}
                  placeholder="مثال: أحمد عبد الله (سائق سيارة 4521)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">البيان / ملاحظات المعاملة</label>
                <textarea
                  rows={2}
                  value={txNotes}
                  onChange={(e) => setTxNotes(e.target.value)}
                  placeholder="اكتب أي تفاصيل إضافية عن الدفعة أو الشيك أو طريقة السداد..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={txLoading || cashAccounts.length === 0}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-500/25 active:scale-95 transition-all disabled:opacity-50"
              >
                {txLoading ? 'جاري الحفظ والترحيل...' : isCustomer ? 'تأكيد وحفظ سند القبض' : 'تأكيد وحفظ سند الصرف'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
