import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import {
  Boxes,
  Plus,
  SlidersHorizontal,
  History,
  X,
  AlertTriangle,
  Lock,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Edit2,
  Calendar,
  User,
  Truck,
  CheckCircle2,
  Tag,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const [inventory, setInventory] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showReservedModal, setShowReservedModal] = useState(false);
  const [showIncomingModal, setShowIncomingModal] = useState(false);

  // Selected Item details
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [reservedList, setReservedList] = useState<any[]>([]);
  const [incomingList, setIncomingList] = useState<any[]>([]);

  // Add Product form state
  const [newName, setNewName] = useState('');
  const [newUnitName, setNewUnitName] = useState('');
  const [newSalePrice, setNewSalePrice] = useState<number>(0);
  const [newPurchasePrice, setNewPurchasePrice] = useState<number>(0);
  const [newMinStock, setNewMinStock] = useState<number>(0);

  // Edit Product form state (PIN Protected)
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editUnitName, setEditUnitName] = useState('');
  const [editSalePrice, setEditSalePrice] = useState<number>(0);
  const [editPurchasePrice, setEditPurchasePrice] = useState<number>(0);
  const [editMinStock, setEditMinStock] = useState<number>(0);
  const [editPin, setEditPin] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Adjustment form state (PIN Protected)
  const [adjProductId, setAdjProductId] = useState('');
  const [adjQty, setAdjQty] = useState<number>(0);
  const [adjUnitCost, setAdjUnitCost] = useState<number>(0);
  const [adjReason, setAdjReason] = useState('');
  const [adjPin, setAdjPin] = useState('');
  const [adjError, setAdjError] = useState('');
  const [adjLoading, setAdjLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invRes, unitsRes] = await Promise.all([
        api.getInventory(),
        api.getUnits().catch(() => []),
      ]);
      setInventory(invRes || []);
      setUnits(unitsRes || []);
      if (invRes && invRes.length > 0) {
        setAdjProductId(invRes[0].product_id);
      }
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = useMemo(() => {
    if (!search.trim()) return inventory;
    const s = search.toLowerCase().trim();
    return inventory.filter(
      (item) =>
        item.product_name?.toLowerCase().includes(s) ||
        item.product_code?.toLowerCase().includes(s) ||
        item.unit_name?.toLowerCase().includes(s)
    );
  }, [inventory, search]);

  const handleOpenHistory = async (product: any) => {
    setSelectedProduct(product);
    setShowHistoryModal(true);
    try {
      const res = await api.getStockMovements(product.product_id);
      setMovements(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenReserved = async (product: any) => {
    setSelectedProduct(product);
    setShowReservedModal(true);
    try {
      const res = await api.getReservedBreakdown(product.product_id);
      setReservedList(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenIncoming = async (product: any) => {
    setSelectedProduct(product);
    setShowIncomingModal(true);
    try {
      const res = await api.getIncomingBreakdown(product.product_id);
      setIncomingList(res || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEdit = (product: any) => {
    setSelectedProduct(product);
    setEditId(product.product_id);
    setEditName(product.product_name || '');
    setEditUnitName(product.unit_name || '');
    setEditSalePrice(Number(product.default_sale_price || 0));
    setEditPurchasePrice(Number(product.default_purchase_price || 0));
    setEditMinStock(Number(product.min_stock || 0));
    setEditPin('');
    setEditReason('');
    setEditError('');
    setShowEditModal(true);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await api.saveProduct({
        name: newName.trim(),
        unit_name: newUnitName.trim() || null,
        default_sale_price: newSalePrice,
        default_purchase_price: newPurchasePrice,
        min_stock: newMinStock,
        kind: 'goods',
      });
      setShowAddModal(false);
      setNewName('');
      setNewUnitName('');
      setNewSalePrice(0);
      setNewPurchasePrice(0);
      setNewMinStock(0);
      loadData();
    } catch (err: any) {
      alert(err.message || 'فشل إضافة الصنف');
    }
  };

  const handleUpdateProductWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    if (!editPin) {
      setEditError('يرجى إدخال الرقم السري للمدير (PIN)');
      return;
    }

    setEditLoading(true);
    try {
      // 1. Verify PIN approval
      await api.verifyPin({
        targetTable: 'products',
        targetId: editId,
        reason: editReason || 'تعديل بيانات الصنف من المخزون',
        managerPin: editPin,
      });

      // 2. Perform Update
      await api.updateProduct(editId, {
        name: editName,
        unit_name: editUnitName,
        default_sale_price: editSalePrice,
        default_purchase_price: editPurchasePrice,
        min_stock: editMinStock,
      });

      setShowEditModal(false);
      loadData();
    } catch (err: any) {
      setEditError(err.message || 'فشل التحقق من الرقم السري أو تعديل الصنف');
    } finally {
      setEditLoading(false);
    }
  };

  const handleAdjustmentSubmitWithPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError('');
    if (!adjProductId || adjQty === 0) {
      setAdjError('يرجى تحديد الصنف وكمية التسوية');
      return;
    }
    if (!adjPin) {
      setAdjError('تسوية المخزون تتطلب إذن المدير (PIN)');
      return;
    }

    setAdjLoading(true);
    try {
      // Verify PIN
      await api.verifyPin({
        targetTable: 'stock_adjustments',
        targetId: adjProductId,
        reason: adjReason || 'تسوية جردية للمخزون',
        managerPin: adjPin,
      });

      await api.recordAdjustment({
        productId: adjProductId,
        qty: adjQty,
        unitCost: adjUnitCost,
        reason: adjReason,
      });

      setShowAdjModal(false);
      setAdjQty(0);
      setAdjReason('');
      setAdjPin('');
      loadData();
    } catch (err: any) {
      setAdjError(err.message || 'فشل تسجيل التسوية الجردية');
    } finally {
      setAdjLoading(false);
    }
  };

  const formatMoney = (val: any) => {
    return Number(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn" dir="rtl">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Boxes className="w-7 h-7 text-blue-600" />
            <span>إدارة المخزون والأصناف</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            4 أبعاد لحظية: الكمية بالمخزن · لنا عند المورد · المحجوز للعملاء · المتاح للبيع
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="بحث باسم الصنف أو الكود أو الوحدة..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500 shadow-sm font-semibold"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف</span>
          </button>

          <button
            onClick={() => {
              setAdjError('');
              setAdjPin('');
              setShowAdjModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-bold active:scale-95 transition-all"
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-600" />
            <span>تسوية جردية (PIN)</span>
          </button>
        </div>
      </div>

      {/* 4-Dimension Inventory Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-black">
              <tr>
                <th className="p-4">كود الصنف</th>
                <th className="p-4">اسم الصنف</th>
                <th className="p-4">الوحدة</th>
                <th className="p-4 text-center text-slate-800">عندنا في المخزن</th>
                <th className="p-4 text-center text-blue-700">لنا عند المورد (مطلوب)</th>
                <th className="p-4 text-center text-indigo-700">المحجوز للعملاء</th>
                <th className="p-4 text-center text-emerald-700">المتاح للبيع</th>
                <th className="p-4 text-center">سعر البيع الافتراضي</th>
                <th className="p-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                    جاري تحميل المخزون...
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                    لا توجد أصناف مطابقة
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.product_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-500">{item.product_code}</td>
                    <td
                      onClick={() => handleOpenHistory(item)}
                      className="p-4 font-black text-slate-900 cursor-pointer hover:text-blue-600 hover:underline transition-colors"
                      title="انقر لعرض حركة الصنف (دخول/خروج)"
                    >
                      {item.product_name}
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                        {item.unit_name || 'قطعة'}
                      </span>
                    </td>

                    {/* 1. عندنا في المخزن */}
                    <td className="p-4 text-center font-black text-base text-slate-900">
                      {item.physical_stock.toLocaleString('ar-EG')}
                    </td>

                    {/* 2. لنا عند المورد (Clickable breakdown) */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleOpenIncoming(item)}
                        className={`font-black text-base px-2.5 py-1 rounded-xl transition-all ${
                          item.incoming_qty > 0
                            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer'
                            : 'text-slate-400'
                        }`}
                        title="انقر لتفصيل الكميات المطلوبة من الموردين"
                      >
                        {item.incoming_qty.toLocaleString('ar-EG')}
                      </button>
                    </td>

                    {/* 3. المحجوز للعملاء (Clickable breakdown) */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleOpenReserved(item)}
                        className={`font-black text-base px-2.5 py-1 rounded-xl transition-all ${
                          item.reserved_qty > 0
                            ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 cursor-pointer'
                            : 'text-slate-400'
                        }`}
                        title="انقر لتفصيل الكميات المحجوزة للعملاء"
                      >
                        {item.reserved_qty.toLocaleString('ar-EG')}
                      </button>
                    </td>

                    {/* 4. المتاح للبيع = عندنا - المحجوز */}
                    <td className="p-4 text-center">
                      <span
                        className={`inline-block px-3 py-1 rounded-xl text-base font-black ${
                          item.available_stock <= 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.available_stock.toLocaleString('ar-EG')}
                      </span>
                    </td>

                    <td className="p-4 text-center font-bold text-slate-800">
                      {formatMoney(item.default_sale_price)}
                    </td>

                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenHistory(item)}
                          className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
                          title="سجل حركة الصنف"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-2 rounded-xl text-amber-600 hover:bg-amber-50 transition-colors"
                          title="تعديل الصنف بـ PIN"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: إضافة صنف جديد (الكود تلقائي، الوحدة نص حر مع اقتراحات) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleCreateProduct}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-lg">
                <Boxes className="w-6 h-6 text-blue-600" />
                <span>إضافة صنف جديد بالمخزون</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">اسم الصنف *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: رمل أبيض سوهاج، أسمنت مقاوم..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Free-text Unit with Datalist Suggestions */}
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  الوحدة (نص حر، يقبل أي وحدة جديدة) *
                </label>
                <input
                  type="text"
                  list="units-suggestions"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="اكتب الوحدة: طن، م³، شكارة، الف طوبة، بالته، متر..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
                <datalist id="units-suggestions">
                  {units.map((u) => (
                    <option key={u.id} value={u.name} />
                  ))}
                  <option value="م³" />
                  <option value="طن" />
                  <option value="شكاره" />
                  <option value="الف طوبه" />
                  <option value="القطعه" />
                  <option value="نقلة" />
                  <option value="ساعة" />
                </datalist>
                <p className="text-[11px] text-slate-400 mt-1">
                  الكود يتم توليده تلقائياً (مثل P0001) ولا حاجة لكتابته.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سعر البيع الافتراضي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newSalePrice}
                  onChange={(e) => setNewSalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سعر الشراء الافتراضي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newPurchasePrice}
                  onChange={(e) => setNewPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">حد المخزون الأدنى للإنذار</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={newMinStock}
                  onChange={(e) => setNewMinStock(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                حفظ الصنف
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: تعديل صنف موجود بـ PIN */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleUpdateProductWithPin}
            className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <Lock className="w-5 h-5 text-amber-600" />
                <span>إذن تعديل بيانات الصنف (PIN المدير)</span>
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
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">اسم الصنف</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">الوحدة</label>
                <input
                  type="text"
                  value={editUnitName}
                  onChange={(e) => setEditUnitName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سعر البيع الافتراضي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editSalePrice}
                  onChange={(e) => setEditSalePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سعر الشراء الافتراضي</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPurchasePrice}
                  onChange={(e) => setEditPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-600 block mb-1">سبب التعديل</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="مثال: تصحيح سعر الكتالوج أو تعديل الوحدة"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                <label className="text-xs font-black text-amber-900 block">
                  الرقم السري للمدير (PIN) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value)}
                  placeholder="أدخل 4 أو 6 أرقام"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-center text-lg font-black tracking-widest focus:outline-none focus:border-amber-500 bg-white"
                  required
                />
                <p className="text-[11px] text-amber-700 font-semibold">
                  تعديل الصنف بعد حفظه يتطلب موافقة المدير ويسجل في سجل المراجعة (Audit Log).
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={editLoading}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                {editLoading ? 'جاري التحقق...' : 'تأكيد التعديل'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: تفصيل المحجوز للعملاء (Click on Reserved) */}
      {showReservedModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">
                  تفصيل الحجوزات: {selectedProduct?.product_name}
                </h3>
                <p className="text-xs text-slate-400">العملاء والكميات المحجوزة وتواريخ الطلب</p>
              </div>
              <button
                onClick={() => setShowReservedModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reservedList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold">
                لا توجد حجوزات معلقة لهذا الصنف
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {reservedList.map((resItem) => (
                  <div
                    key={resItem.order_id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{resItem.customer_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>طلب: {resItem.order_no}</span>
                        <span>•</span>
                        <span>{resItem.order_date}</span>
                        {resItem.customer_phone && <span>• {resItem.customer_phone}</span>}
                      </div>
                    </div>
                    <div className="text-left font-black text-base text-indigo-700">
                      {resItem.qty_reserved} {selectedProduct?.unit_name || 'وحدة'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowReservedModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: تفصيل لنا عند المورد (Click on Incoming) */}
      {showIncomingModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-xl w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">
                  تفصيل البضاعة المطلوبة من الموردين: {selectedProduct?.product_name}
                </h3>
                <p className="text-xs text-slate-400">الموردين وأوامر الشراء المفتوحة والكميات المتبقية</p>
              </div>
              <button
                onClick={() => setShowIncomingModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {incomingList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold">
                لا توجد طلبيات شراء مفتوحة لهذا الصنف
              </div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {incomingList.map((incItem) => (
                  <div
                    key={incItem.order_id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{incItem.supplier_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>أمر شراء: {incItem.order_no}</span>
                        <span>•</span>
                        <span>{incItem.order_date}</span>
                        {incItem.supplier_phone && <span>• {incItem.supplier_phone}</span>}
                      </div>
                    </div>
                    <div className="text-left font-black text-base text-blue-700">
                      {incItem.qty_incoming} {selectedProduct?.unit_name || 'وحدة'}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowIncomingModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: سجل حركة الصنف (Click on Item Name) */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-black text-slate-900 text-lg">
                  سجل حركة الصنف: {selectedProduct?.product_name}
                </h3>
                <p className="text-xs text-slate-400">حركات الإضافة والصرف والتسويات مرتبة زمنياً</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {movements.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold">
                لا توجد حركات مخزنية مسجلة لهذا الصنف
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {movements.map((m) => {
                  const isAddition = Number(m.qty) > 0;
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                            isAddition ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {isAddition ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">{m.notes || m.movement_type}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{m.created_at_fmt}</div>
                        </div>
                      </div>
                      <div className="text-left font-black text-base">
                        <span className={isAddition ? 'text-emerald-700' : 'text-rose-700'}>
                          {isAddition ? `+${m.qty}` : m.qty} {selectedProduct?.unit_name || ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: تسوية جردية بـ PIN */}
      {showAdjModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleAdjustmentSubmitWithPin}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-black text-slate-900 text-base">
                <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                <span>تسوية جردية (تتطلب PIN المدير)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {adjError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{adjError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">الصنف المراد تسويته *</label>
                <select
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500 bg-white"
                  required
                >
                  {inventory.map((inv) => (
                    <option key={inv.product_id} value={inv.product_id}>
                      {inv.product_code} — {inv.product_name} (رصيده الحالي: {inv.physical_stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">
                  كمية الفرق (+ للزيادة، − للعجز) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjQty}
                  onChange={(e) => setAdjQty(parseFloat(e.target.value) || 0)}
                  placeholder="مثال: +10 أو -5"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-black focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سعر التكلفة للوحدة (اختياري)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjUnitCost}
                  onChange={(e) => setAdjUnitCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">سبب التسوية الجردية</label>
                <input
                  type="text"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="مثال: جرد دوري، هالك نقل، فروق وزن..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                <label className="text-xs font-black text-amber-900 block">
                  الرقم السري للمدير (PIN) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={adjPin}
                  onChange={(e) => setAdjPin(e.target.value)}
                  placeholder="أدخل 4 أو 6 أرقام"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-center text-lg font-black tracking-widest focus:outline-none focus:border-amber-500 bg-white"
                  required
                />
                <p className="text-[11px] text-amber-700 font-semibold">
                  التسويات الجردية تؤثر على الأرباح والخسائر وتتطلب إذن المدير.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAdjModal(false)}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-sm"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={adjLoading}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 active:scale-95 transition-all"
              >
                {adjLoading ? 'جاري التحقق...' : 'تأكيد التسوية'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
