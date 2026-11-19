import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Boxes, Plus, SlidersHorizontal, History, X, AlertTriangle } from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);

  // Adjustment form
  const [adjProductId, setAdjProductId] = useState('');
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjUnitCost, setAdjUnitCost] = useState<number>(0);
  const [adjReason, setAdjReason] = useState('');

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await api.getInventory();
      setInventory(res);
      if (res.length > 0) setAdjProductId(res[0].product_id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenHistory = async (productId?: string) => {
    setShowHistoryModal(true);
    try {
      const res = await api.getStockMovements(productId);
      setMovements(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || adjQty === 0) return;

    try {
      await api.recordAdjustment({
        productId: adjProductId,
        qty: adjQty,
        unitCost: adjUnitCost,
        reason: adjReason,
      });
      alert('تم تسجيل التسوية الجردية وتحديث رصيد المخزون بنجاح!');
      setShowAdjModal(false);
      setAdjQty(0);
      setAdjReason('');
      loadInventory();
    } catch (err: any) {
      alert(err.message || 'فشل تسجيل التسوية الجردية');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-600" />
            <span>أرصدة المخزون والحجوزات الحية</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            المتاح = المخزون الفعلي بالمخزن − البضاعة المحجوزة للعملاء
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleOpenHistory()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors border border-slate-300"
          >
            <History className="w-4 h-4 text-slate-500" />
            <span>سجل الحركات</span>
          </button>

          <button
            onClick={() => setShowAdjModal(true)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>تسوية جردية</span>
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold">
            <tr>
              <th className="p-4">كود</th>
              <th className="p-4">اسم الصنف</th>
              <th className="p-4">الوحدة</th>
              <th className="p-4 text-center">المخزون الفعلي</th>
              <th className="p-4 text-center">محجوز للعملاء</th>
              <th className="p-4 text-center">المتاح للبيع</th>
              <th className="p-4 text-center">بضاعة بالطريق</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  جاري تحميل بيانات المخزون...
                </td>
              </tr>
            ) : inventory.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  لا توجد أصناف في الدليل
                </td>
              </tr>
            ) : (
              inventory.map((item) => {
                const isShort = item.available_stock < 0;
                return (
                  <tr key={item.product_id} className="hover:bg-slate-50/70">
                    <td className="p-4 font-mono font-bold text-xs text-blue-700">{item.product_code}</td>
                    <td className="p-4 font-bold text-slate-800">{item.product_name}</td>
                    <td className="p-4 text-slate-500 text-xs">{item.unit_name || 'وحدة'}</td>
                    <td className="p-4 text-center font-bold text-slate-900">
                      {item.physical_stock.toLocaleString()}
                    </td>
                    <td className="p-4 text-center font-bold text-amber-700">
                      {item.reserved_qty > 0 ? item.reserved_qty.toLocaleString() : '0'}
                    </td>
                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-black ${
                          isShort
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : item.available_stock > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.available_stock.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-4 text-center font-bold text-purple-700">
                      {item.incoming_qty > 0 ? `+${item.incoming_qty.toLocaleString()}` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Adjustment Modal */}
      {showAdjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-800">تسوية جردية للمخزون</h3>
              <button onClick={() => setShowAdjModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الصنف المراد تسويته *</label>
                <select
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                  required
                >
                  {inventory.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_code} - {p.product_name} (الحالي: {p.physical_stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  كمية الفرق (+ للزيادة، - للعجز) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjQty || ''}
                  onChange={(e) => setAdjQty(parseFloat(e.target.value) || 0)}
                  placeholder="مثال: +10 أو -5"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-base font-bold text-center"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  سعر تكلفة الوحدة (للقيد المحاسبي)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjUnitCost || ''}
                  onChange={(e) => setAdjUnitCost(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm text-center"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سبب التسوية الجردية</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="جرد شهري، هالك، رطوبة..."
                  className="w-full border border-slate-300 rounded-lg p-2.5 text-sm"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="flex-1 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow"
                >
                  تأكيد التسوية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movements History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                <span>سجل حركات المخزون التفصيلي</span>
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">الصنف</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3">البيان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono">{m.created_at_fmt}</td>
                      <td className="p-3 font-bold">{m.product_name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="p-3 text-center font-bold">
                        <span className={m.quantity > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

