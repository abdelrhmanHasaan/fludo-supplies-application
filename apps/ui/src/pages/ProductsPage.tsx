import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Tag, Plus, FileSpreadsheet, Search, X, Trash2 } from 'lucide-react';
import { SmartDeleteModal } from '../components/SmartDeleteModal';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Form states
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'goods' | 'service'>('goods');
  const [unitId, setUnitId] = useState('');
  const [price, setPrice] = useState<number>(0);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [prods, unts] = await Promise.all([api.getProducts(), api.getUnits()]);
      setProducts(prods);
      setUnits(unts);
      if (unts.length > 0) setUnitId(unts[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    try {
      await api.saveProduct({
        code,
        name,
        kind,
        unit_id: unitId || null,
        default_sale_price: price,
      });
      setShowAddModal(false);
      setCode('');
      setName('');
      setPrice(0);
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'فشل حفظ الصنف');
    }
  };

  const filtered = products.filter(
    (p) =>
      p.product_name.toLowerCase().includes(search.toLowerCase()) ||
      p.product_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالكود أو اسم الصنف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pr-9 pl-4 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <a
            href="/api/data/export/products"
            download
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>تصدير إكسيل</span>
          </a>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">الكود</th>
              <th className="p-4">اسم الصنف</th>
              <th className="p-4">النوع</th>
              <th className="p-4">الوحدة</th>
              <th className="p-4 text-center">سعر اليوم الافتراضي (ج.م)</th>
              <th className="p-4 text-center">الرصيد الفعلي</th>
              <th className="p-4 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  جاري تحميل دليل الأصناف...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  لا توجد أصناف مطابقة للبحث
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.product_id} className="hover:bg-slate-50/70">
                  <td className="p-4 font-mono font-bold text-xs text-blue-700">{p.product_code}</td>
                  <td className="p-4 font-bold text-slate-800">{p.product_name}</td>
                  <td className="p-4 text-xs text-slate-500">
                    {p.kind === 'goods' ? 'بضاعة مخزنية' : 'خدمة تشغيل'}
                  </td>
                  <td className="p-4 text-xs font-medium text-slate-600">{p.unit_name || '—'}</td>
                  <td className="p-4 text-center font-black text-slate-900">
                    {p.default_sale_price > 0 ? `${p.default_sale_price.toLocaleString()} ج.م` : 'غير محدد'}
                  </td>
                  <td className="p-4 text-center font-bold text-slate-700">
                    {p.physical_stock.toLocaleString()}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="حذف الصنف (تحقق ثنائي)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">إضافة صنف / خدمة جديدة</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">كود الصنف *</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="مثال: C08 أو A06"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الصنف *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم الصنف أو الماركة..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">النوع</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  >
                    <option value="goods">بضاعة</option>
                    <option value="service">خدمة (نقل/لودر)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوحدة</label>
                  <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سعر البيع اليومي الافتراضي (ج.م)</label>
                <input
                  type="number"
                  step="any"
                  value={price || ''}
                  onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-base font-bold text-center"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Smart 2-Step Verification Delete Modal */}
      {deleteTarget && (
        <SmartDeleteModal
          isOpen={true}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null);
            loadProducts();
          }}
          entityType="product"
          entityId={deleteTarget.product_id}
          entityName={deleteTarget.product_name}
          entitySubtitle={`كود الصنف: ${deleteTarget.product_code}`}
        />
      )}
    </div>
  );
};

