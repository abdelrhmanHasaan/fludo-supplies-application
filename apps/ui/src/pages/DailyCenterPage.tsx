import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { NumericInput } from '../components/NumericInput';
import {
  Users,
  Truck,
  Building,
  Plus,
  Trash2,
  Copy,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  Calendar,
  MapPin,
  FileText,
  DollarSign,
  UserCheck,
  CreditCard,
  Wrench,
  Search,
  X,
} from 'lucide-react';

export const DailyCenterPage: React.FC = () => {
  // Main Tabs: customers | suppliers | premises
  const [primaryTab, setPrimaryTab] = useState<'customers' | 'suppliers' | 'premises'>('customers');

  // Customer sub-mode: 'invoice' | 'direct_receipt'
  const [customerSubMode, setCustomerSubMode] = useState<'invoice' | 'direct_receipt'>('invoice');

  // Supplier sub-mode: 'invoice' | 'direct_payment'
  const [supplierSubMode, setSupplierSubMode] = useState<'invoice' | 'direct_payment'>('invoice');

  // Premises sub-tab: 'employees' | 'equipment' | 'general'
  const [premisesSubTab, setPremisesSubTab] = useState<'employees' | 'equipment' | 'general'>('employees');

  // Master Data
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cashAccounts, setCashAccounts] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Common Form States
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState('');

  // Customer / Supplier Invoice State
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [locationType, setLocationType] = useState<'branch' | 'party'>('branch');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [handlingFee, setHandlingFee] = useState<number>(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [amountPaidNow, setAmountPaidNow] = useState<number>(0);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');

  // Invoice Lines
  const [lines, setLines] = useState<
    Array<{
      productId: string;
      qty: number;
      unitPrice: number;
      catalogPrice: number;
      unitName: string;
      discountAmount: number;
      lineMode: 'on_account' | 'reserve';
      notes?: string;
    }>
  >([
    {
      productId: '',
      qty: 1,
      unitPrice: 0,
      catalogPrice: 0,
      unitName: 'طن',
      discountAmount: 0,
      lineMode: 'on_account',
    },
  ]);

  // Direct Cash Voucher State (Customer Receipt / Supplier Payment)
  const [voucherAmount, setVoucherAmount] = useState<number>(0);
  const [voucherNotes, setVoucherNotes] = useState('');

  // Premises: Employee Transaction State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeTxType, setEmployeeTxType] = useState<'advance' | 'bonus' | 'deduction'>('advance');
  const [employeeTxAmount, setEmployeeTxAmount] = useState<number>(0);
  const [employeeTxReason, setEmployeeTxReason] = useState('');

  // Premises: Equipment Expense State
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('');
  const [equipmentExpenseType, setEquipmentExpenseType] = useState('fuel');
  const [equipmentAmount, setEquipmentAmount] = useState<number>(0);
  const [equipmentOdometer, setEquipmentOdometer] = useState<number>(0);
  const [equipmentNotes, setEquipmentNotes] = useState('');

  // Premises: General Expense State
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [generalExpenseAmount, setGeneralExpenseAmount] = useState<number>(0);
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');

  // Print Receipt Modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printData, setPrintData] = useState<any | null>(null);

  // Quick Add Party Modal
  const [showAddPartyModal, setShowAddPartyModal] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyPhone, setNewPartyPhone] = useState('');
  const [newPartyNotes, setNewPartyNotes] = useState('');
  const [newPartySettlementDays, setNewPartySettlementDays] = useState<number>(30);

  useEffect(() => {
    loadMasterData();
  }, []);

  // Global Keyboard Shortcuts (Ctrl+Enter to submit, F2 to reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleResetForm();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleSubmitCurrent();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const loadMasterData = async () => {
    try {
      const [pts, prods, accounts, brs, uList, emps, eqList, cats] = await Promise.all([
        api.getParties(),
        api.getProducts(),
        api.getCashAccounts(),
        api.getBranches().catch(() => []),
        api.getUnits().catch(() => []),
        api.getEmployees().catch(() => []),
        api.getEquipment().catch(() => []),
        api.getExpenseCategories().catch(() => []),
      ]);

      setParties(pts || []);
      setProducts(prods || []);
      setCashAccounts((accounts || []).filter((a: any) => a.is_active));
      const activeBrs = (brs || []).filter((b: any) => b.is_active);
      setBranches(activeBrs);
      if (activeBrs.length > 0) setSelectedSiteId(activeBrs[0].id);
      setUnits(uList || []);
      setEmployees(emps || []);
      if (emps && emps.length > 0) setSelectedEmployeeId(emps[0].id);
      setEquipmentList(eqList || []);
      if (eqList && eqList.length > 0) setSelectedEquipmentId(eqList[0].id);
      setExpenseCategories(cats || []);
      if (cats && cats.length > 0) setExpenseCategoryId(cats[0].id);
      if (accounts && accounts.length > 0) setSelectedCashAccountId(accounts[0].id);
    } catch (err) {
      console.error('Failed to load master data:', err);
    }
  };

  const customersList = useMemo(() => {
    return parties.filter((p) => p.is_customer);
  }, [parties]);

  const suppliersList = useMemo(() => {
    return parties.filter((p) => p.is_supplier);
  }, [parties]);

  const selectedParty = useMemo(() => {
    return parties.find((p) => p.id === selectedPartyId) || null;
  }, [parties, selectedPartyId]);

  // Line Items Calculation
  const linesSubtotal = useMemo(() => {
    return lines.reduce((acc, l) => {
      const gross = Number(l.qty || 0) * Number(l.unitPrice || 0);
      const disc = Number(l.discountAmount || 0);
      return acc + Math.max(0, gross - disc);
    }, 0);
  }, [lines]);

  const netInvoiceTotal = useMemo(() => {
    const total = linesSubtotal + Number(handlingFee || 0) - Number(invoiceDiscount || 0);
    return Math.max(0, total);
  }, [linesSubtotal, handlingFee, invoiceDiscount]);

  const handleResetForm = () => {
    setSelectedPartyId('');
    setLines([
      {
        productId: '',
        qty: 1,
        unitPrice: 0,
        catalogPrice: 0,
        unitName: 'طن',
        discountAmount: 0,
        lineMode: 'on_account',
      },
    ]);
    setHandlingFee(0);
    setInvoiceDiscount(0);
    setAmountPaidNow(0);
    setInvoiceNotes('');
    setDestinationAddress('');
    setDriverName('');
    setVehiclePlate('');
    setVoucherAmount(0);
    setVoucherNotes('');
    setEmployeeTxAmount(0);
    setEmployeeTxReason('');
    setEquipmentAmount(0);
    setEquipmentNotes('');
    setGeneralExpenseAmount(0);
    setExpenseDesc('');
    setExpensePayee('');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleDuplicateLine = (index: number) => {
    const target = lines[index];
    const newLines = [...lines];
    newLines.splice(index + 1, 0, { ...target });
    setLines(newLines);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      setLines([
        {
          productId: '',
          qty: 1,
          unitPrice: 0,
          catalogPrice: 0,
          unitName: 'طن',
          discountAmount: 0,
          lineMode: 'on_account',
        },
      ]);
      return;
    }
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleProductSelect = (index: number, productId: string) => {
    const prod = products.find((p) => p.product_id === productId || p.id === productId);
    const newLines = [...lines];
    if (prod) {
      const defaultPrice =
        primaryTab === 'customers'
          ? Number(prod.default_sale_price || 0)
          : Number(prod.default_purchase_price || 0);
      newLines[index] = {
        ...newLines[index],
        productId: prod.product_id || prod.id,
        unitPrice: defaultPrice,
        catalogPrice: defaultPrice,
        unitName: prod.unit_name || 'طن',
      };
    } else {
      newLines[index].productId = '';
    }
    setLines(newLines);
  };

  // Submit Handler Router
  const handleSubmitCurrent = () => {
    if (primaryTab === 'customers') {
      if (customerSubMode === 'invoice') handleCustomerInvoiceSubmit('plain');
      else handleDirectVoucherSubmit('in');
    } else if (primaryTab === 'suppliers') {
      if (supplierSubMode === 'invoice') handleSupplierInvoiceSubmit('plain');
      else handleDirectVoucherSubmit('out');
    } else {
      if (premisesSubTab === 'employees') handleEmployeeTxSubmit();
      else if (premisesSubTab === 'equipment') handleEquipmentExpenseSubmit();
      else handleGeneralExpenseSubmit();
    }
  };

  // 1. Submit Customer Sales Invoice
  const handleCustomerInvoiceSubmit = async (printMode: 'none' | 'plain' | 'with_carry') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedPartyId) return setErrorMsg('يرجى تحديد العميل أولاً');
    if (lines.length === 0 || !lines[0].productId) return setErrorMsg('يرجى إضافة صنف واحد على الأقل في الفاتورة');
    if (amountPaidNow > 0 && !selectedCashAccountId) {
      return setErrorMsg('يرجى اختيار الخزينة المستلمة للمبلغ المدفوع');
    }

    setLoading(true);
    try {
      const payload: any = {
        partyId: selectedPartyId,
        invoiceDate: txDate,
        handlingFee,
        discountAmount: invoiceDiscount,
        amountPaidNow,
        cashAccountId: amountPaidNow > 0 ? selectedCashAccountId : undefined,
        locationType,
        siteId: locationType === 'branch' ? selectedSiteId : undefined,
        destination: locationType === 'party' ? destinationAddress : undefined,
        notes: [
          invoiceNotes.trim(),
          driverName.trim() ? `السائق: ${driverName.trim()}` : '',
          vehiclePlate.trim() ? `السيارة: ${vehiclePlate.trim()}` : '',
        ]
          .filter(Boolean)
          .join(' | ') || undefined,
        autoApprove: true,
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitName: l.unitName,
          discountAmount: l.discountAmount || 0,
          lineMode: l.lineMode,
          notes: l.notes,
        })),
      };

      const res = await api.createSalesInvoice(payload);
      const invoiceId = res.invoiceId;

      setSuccessMsg(`تم حفظ واعتماد الفاتورة بنجاح رقم: ${invoiceId}`);

      // Handle Print Logging & Modal
      if (printMode !== 'none') {
        let carryBal = 0;
        if (printMode === 'with_carry') {
          const sumRes = await api.getPartySummary(selectedPartyId).catch(() => null);
          carryBal = Number(sumRes?.balance || sumRes?.current_balance || 0);
        }

        await api.recordInvoicePrint({
          invoice_id: invoiceId,
          invoice_kind: 'sale',
          mode: printMode,
          carried_balance_snapshot: carryBal,
        });

        // Open print preview
        setPrintData({
          title: 'فاتورة مبيعات / إذن تسليم',
          invoiceId,
          date: txDate,
          partyName: selectedParty?.name,
          partyPhone: selectedParty?.phone,
          lines: lines.map((l) => {
            const p = products.find((prod) => (prod.product_id || prod.id) === l.productId);
            return {
              productName: p?.product_name || p?.name || 'صنف',
              unitName: l.unitName,
              qty: l.qty,
              unitPrice: l.unitPrice,
              discount: l.discountAmount,
              total: Math.max(0, l.qty * l.unitPrice - (l.discountAmount || 0)),
              mode: l.lineMode === 'reserve' ? 'حجز بضاعة' : 'استلام فوري',
            };
          }),
          linesSubtotal,
          handlingFee,
          discount: invoiceDiscount,
          netTotal: netInvoiceTotal,
          paid: amountPaidNow,
          remaining: Math.max(0, netInvoiceTotal - amountPaidNow),
          carryBal: printMode === 'with_carry' ? carryBal : undefined,
          totalOutstanding: printMode === 'with_carry' ? carryBal + Math.max(0, netInvoiceTotal - amountPaidNow) : undefined,
        });
        setShowPrintModal(true);
      }

      // Reset
      handleResetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل حفظ الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  // 2. Submit Supplier Purchase Invoice
  const handleSupplierInvoiceSubmit = async (printMode: 'none' | 'plain') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedPartyId) return setErrorMsg('يرجى تحديد المورد أولاً');
    if (lines.length === 0 || !lines[0].productId) return setErrorMsg('يرجى إضافة صنف واحد على الأقل');
    if (amountPaidNow > 0 && !selectedCashAccountId) {
      return setErrorMsg('يرجى اختيار الخزينة المنصرف منها المبلغ المدفوع');
    }

    setLoading(true);
    try {
      const payload: any = {
        partyId: selectedPartyId,
        invoiceDate: txDate,
        handlingFee,
        discountAmount: invoiceDiscount,
        amountPaidNow,
        cashAccountId: amountPaidNow > 0 ? selectedCashAccountId : undefined,
        locationType: 'branch',
        siteId: selectedSiteId,
        notes: invoiceNotes.trim() || 'فاتورة شراء / إذن توريد',
        lines: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          unitName: l.unitName,
          discountAmount: l.discountAmount || 0,
          lineMode: l.lineMode,
          notes: l.notes,
        })),
      };

      const res = await api.createPurchaseInvoice(payload);
      setSuccessMsg(`تم تسجيل إذن استلام المورد بنجاح رقم: ${res.invoiceId}`);

      if (printMode === 'plain') {
        await api.recordInvoicePrint({
          invoice_id: res.invoiceId,
          invoice_kind: 'purchase',
          mode: 'plain',
        });
        setPrintData({
          title: 'إذن توريد / فاتورة شراء',
          invoiceId: res.invoiceId,
          date: txDate,
          partyName: selectedParty?.name,
          partyPhone: selectedParty?.phone,
          lines: lines.map((l) => {
            const p = products.find((prod) => (prod.product_id || prod.id) === l.productId);
            return {
              productName: p?.product_name || p?.name || 'صنف',
              unitName: l.unitName,
              qty: l.qty,
              unitPrice: l.unitPrice,
              discount: l.discountAmount,
              total: Math.max(0, l.qty * l.unitPrice - (l.discountAmount || 0)),
              mode: l.lineMode === 'reserve' ? 'تحت الطلب' : 'استلام بالمخزن',
            };
          }),
          linesSubtotal,
          handlingFee,
          discount: invoiceDiscount,
          netTotal: netInvoiceTotal,
          paid: amountPaidNow,
          remaining: Math.max(0, netInvoiceTotal - amountPaidNow),
        });
        setShowPrintModal(true);
      }

      handleResetForm();
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل إذن الاستلام');
    } finally {
      setLoading(false);
    }
  };

  // 3. Submit Direct Voucher (Receipt from Customer or Payment to Supplier)
  const handleDirectVoucherSubmit = async (direction: 'in' | 'out') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedPartyId) {
      return setErrorMsg(direction === 'in' ? 'يرجى اختيار العميل' : 'يرجى اختيار المورد');
    }
    if (voucherAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ السند النقدي');
    if (!selectedCashAccountId) return setErrorMsg('يرجى تحديد الخزينة');

    setLoading(true);
    try {
      await api.recordPayment({
        paymentType: direction === 'in' ? 'customer_receipt' : 'supplier_payment',
        partyId: selectedPartyId,
        cashAccountId: selectedCashAccountId,
        paymentDate: txDate,
        amount: voucherAmount,
        method: 'cash',
        notes: voucherNotes.trim() || (direction === 'in' ? 'تحصيل نقدي من عميل' : 'سداد نقدي لمورد'),
      });

      setSuccessMsg(direction === 'in' ? 'تم تسجيل التحصيل النقدي بنجاح!' : 'تم تسجيل سداد المورد بنجاح!');
      setVoucherAmount(0);
      setVoucherNotes('');
      setSelectedPartyId('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل السند المالي');
    } finally {
      setLoading(false);
    }
  };

  // 4. Submit Employee Advance / Bonus
  const handleEmployeeTxSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedEmployeeId) return setErrorMsg('يرجى اختيار الموظف');
    if (employeeTxAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ صالح');
    if (!selectedCashAccountId) return setErrorMsg('يرجى اختيار الخزينة المنصرف منها المبلغ');

    setLoading(true);
    try {
      await api.addEmployeeTransaction(selectedEmployeeId, {
        tx_type: employeeTxType,
        amount: employeeTxAmount,
        cash_account_id: selectedCashAccountId,
        notes: employeeTxReason.trim() || 'سلفة / مستحق موظف',
        tx_date: txDate,
      });

      setSuccessMsg('تم تسجيل حركة الموظف وصرف المبلغ بنجاح!');
      setEmployeeTxAmount(0);
      setEmployeeTxReason('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل حركة الموظف');
    } finally {
      setLoading(false);
    }
  };

  // 5. Submit Equipment Expense
  const handleEquipmentExpenseSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedEquipmentId) return setErrorMsg('يرجى اختيار المعدة / العربية');
    if (equipmentAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ المصروف');
    if (!selectedCashAccountId) return setErrorMsg('يرجى اختيار الخزينة المنصرف منها المبلغ');

    setLoading(true);
    try {
      await api.recordEquipmentExpense({
        equipmentId: selectedEquipmentId,
        expenseType: equipmentExpenseType,
        amount: equipmentAmount,
        odometer: equipmentOdometer || undefined,
        cashAccountId: selectedCashAccountId,
        expenseDate: txDate,
        notes: equipmentNotes.trim() || undefined,
      });

      setSuccessMsg('تم تسجيل مصروف المعدة وترحيله بنجاح!');
      setEquipmentAmount(0);
      setEquipmentOdometer(0);
      setEquipmentNotes('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل مصروف المعدة');
    } finally {
      setLoading(false);
    }
  };

  // 6. Submit General Premises Expense
  const handleGeneralExpenseSubmit = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (generalExpenseAmount <= 0) return setErrorMsg('يرجى إدخال مبلغ المصروف');
    if (!selectedCashAccountId) return setErrorMsg('يرجى اختيار الخزينة');

    setLoading(true);
    try {
      await api.recordExpense({
        categoryId: expenseCategoryId || undefined,
        cashAccountId: selectedCashAccountId,
        expenseDate: txDate,
        amount: generalExpenseAmount,
        payee: expensePayee.trim() || undefined,
        description: expenseDesc.trim() || 'مصروف نثري للمكان',
      });

      setSuccessMsg('تم تسجيل المصروف وترحيل القيد بنجاح!');
      setGeneralExpenseAmount(0);
      setExpenseDesc('');
      setExpensePayee('');
    } catch (err: any) {
      setErrorMsg(err.message || 'فشل تسجيل المصروف');
    } finally {
      setLoading(false);
    }
  };

  // Quick Add Party (Customer / Supplier)
  const handleCreateQuickParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartyName.trim()) return;

    try {
      const isCustomer = primaryTab === 'customers';
      const res = await api.createParty({
        name: newPartyName.trim(),
        phone: newPartyPhone.trim() || undefined,
        notes: newPartyNotes.trim() || undefined,
        is_customer: isCustomer,
        is_supplier: !isCustomer,
        settlement_due_days: newPartySettlementDays || 30,
      });

      const updated = await api.getParties();
      setParties(updated);
      setSelectedPartyId(res.id);
      setShowAddPartyModal(false);
      setNewPartyName('');
      setNewPartyPhone('');
      setNewPartyNotes('');
    } catch (err: any) {
      alert(err.message || 'فشل إضافة الجهة');
    }
  };

  const formatMoney = (val: any) => {
    return Number(val || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      {/* Top Main Navigation Tabs (3 Primary Tabs) */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm gap-2">
        <button
          onClick={() => {
            setPrimaryTab('customers');
            handleResetForm();
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition ${
            primaryTab === 'customers'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Users className="w-5 h-5" />
          <span>يومية عملاء (حجز / بيع / تحصيل)</span>
        </button>

        <button
          onClick={() => {
            setPrimaryTab('suppliers');
            handleResetForm();
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition ${
            primaryTab === 'suppliers'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Truck className="w-5 h-5" />
          <span>يومية موردين (شراء / سداد)</span>
        </button>

        <button
          onClick={() => {
            setPrimaryTab('premises');
            handleResetForm();
          }}
          className={`flex-1 py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition ${
            primaryTab === 'premises'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <Building className="w-5 h-5" />
          <span>يومية مكان (موظفين / معدات / مصاريف)</span>
        </button>
      </div>

      {/* Keyboard Shortcuts Hint Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>اختصار الحفظ: <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-700 font-mono font-bold">Ctrl + Enter</kbd></span>
          <span>معاملة جديدة: <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-gray-700 font-mono font-bold">F2</kbd></span>
        </div>
        <span className="text-[11px] text-gray-400">إدخال الأرقام ينظف الأصفار البادئة تلقائياً</span>
      </div>

      {/* Messages */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================= TAB 1: CUSTOMERS ======================= */}
      {primaryTab === 'customers' && (
        <div className="space-y-6">
          {/* Sub-mode selector */}
          <div className="flex gap-3">
            <button
              onClick={() => setCustomerSubMode('invoice')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                customerSubMode === 'invoice'
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              حجز أو بيع بضاعة للعميل
            </button>
            <button
              onClick={() => setCustomerSubMode('direct_receipt')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                customerSubMode === 'direct_receipt'
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              تحصيل نقدي مباشر بدون بضاعة
            </button>
          </div>

          {customerSubMode === 'invoice' ? (
            /* Sales / Reservation Invoice */
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
              {/* Header: Customer, Date, Location */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">العميل *</label>
                    <button
                      type="button"
                      onClick={() => setShowAddPartyModal(true)}
                      className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3 h-3" />
                      عميل جديد
                    </button>
                  </div>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- اختر العميل --</option>
                    {customersList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedParty && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      كود العميل: {selectedParty.code} | الهاتف: {selectedParty.phone || '—'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">تاريخ المعاملة</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">مكان التسليم</label>
                  <div className="flex gap-2">
                    <select
                      value={locationType}
                      onChange={(e: any) => setLocationType(e.target.value)}
                      className="w-1/2 px-2.5 py-2 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="branch">أحد مقرات النشاط</option>
                      <option value="party">مكان العميل</option>
                    </select>
                    {locationType === 'branch' ? (
                      <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className="w-1/2 px-2.5 py-2 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-500"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="العنوان أو موقع العميل"
                        value={destinationAddress}
                        onChange={(e) => setDestinationAddress(e.target.value)}
                        className="w-1/2 px-2.5 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Items Lines Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-black text-gray-900 text-sm">بنود البضاعة</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setLines([
                        ...lines,
                        {
                          productId: '',
                          qty: 1,
                          unitPrice: 0,
                          catalogPrice: 0,
                          unitName: 'طن',
                          discountAmount: 0,
                          lineMode: 'on_account',
                        },
                      ])
                    }
                    className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold hover:bg-blue-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    سطر جديد
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                      <tr>
                        <th className="p-3 w-48">الصنف</th>
                        <th className="p-3 w-28">الوحدة</th>
                        <th className="p-3 w-36">طريقة التعامل</th>
                        <th className="p-3 w-24 text-center">الكمية</th>
                        <th className="p-3 w-28 text-center">السعر</th>
                        <th className="p-3 w-24 text-center">خصم البند</th>
                        <th className="p-3 w-28 text-center">الإجمالي</th>
                        <th className="p-3 w-20 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((line, idx) => {
                        const lineTotal = Math.max(0, line.qty * line.unitPrice - (line.discountAmount || 0));
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="p-2">
                              <select
                                value={line.productId}
                                onChange={(e) => handleProductSelect(idx, e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">-- اختر الصنف --</option>
                                {products.map((p) => (
                                  <option key={p.product_id || p.id} value={p.product_id || p.id}>
                                    {p.product_name || p.name} ({p.unit_name || 'قطعة'})
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                list="units-list"
                                type="text"
                                value={line.unitName}
                                onChange={(e) => {
                                  const n = [...lines];
                                  n[idx].unitName = e.target.value;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            <td className="p-2">
                              <select
                                value={line.lineMode}
                                onChange={(e: any) => {
                                  const n = [...lines];
                                  n[idx].lineMode = e.target.value;
                                  setLines(n);
                                }}
                                className={`w-full px-2 py-1.5 border rounded-lg text-xs font-bold ${
                                  line.lineMode === 'reserve'
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                                    : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                }`}
                              >
                                <option value="on_account">استلام فوري (على الحساب)</option>
                                <option value="reserve">حجز بضاعة للعميل</option>
                              </select>
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.qty}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].qty = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.unitPrice}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].unitPrice = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.discountAmount}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].discountAmount = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            <td className="p-2 text-center font-black text-xs text-gray-900" dir="ltr">
                              {formatMoney(lineTotal)}
                            </td>

                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateLine(idx)}
                                  className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  title="تكرار السطر"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="حذف السطر"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Calculations & Completion */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">المشال / التعتيق (+)</label>
                      <NumericInput
                        value={handlingFee}
                        onChange={setHandlingFee}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">خصم الفاتورة (-)</label>
                      <NumericInput
                        value={invoiceDiscount}
                        onChange={setInvoiceDiscount}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ المدفوع الآن</label>
                      <NumericInput
                        value={amountPaidNow}
                        onChange={setAmountPaidNow}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-emerald-700 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">
                        الخزينة المستلمة {amountPaidNow > 0 && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={selectedCashAccountId}
                        onChange={(e) => setSelectedCashAccountId(e.target.value)}
                        disabled={amountPaidNow <= 0}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold disabled:bg-gray-100 focus:ring-2 focus:ring-blue-500"
                      >
                        {cashAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({formatMoney(a.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات / بيانات النقل</label>
                    <input
                      type="text"
                      placeholder="اسم السائق، رقم العربية، شروط الدفع..."
                      value={invoiceNotes}
                      onChange={(e) => setInvoiceNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>إجمالي بنود البضاعة:</span>
                      <span className="font-bold">{formatMoney(linesSubtotal)}</span>
                    </div>
                    {handlingFee > 0 && (
                      <div className="flex justify-between text-xs text-emerald-700">
                        <span>المشال والتعتيق:</span>
                        <span className="font-bold">+{formatMoney(handlingFee)}</span>
                      </div>
                    )}
                    {invoiceDiscount > 0 && (
                      <div className="flex justify-between text-xs text-rose-700">
                        <span>الخصم:</span>
                        <span className="font-bold">-{formatMoney(invoiceDiscount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-200 pt-2">
                      <span>صافي الفاتورة:</span>
                      <span className="text-blue-700">{formatMoney(netInvoiceTotal)}</span>
                    </div>
                    {amountPaidNow > 0 && (
                      <div className="flex justify-between text-xs text-emerald-700 font-bold">
                        <span>المدفوع نقداً:</span>
                        <span>{formatMoney(amountPaidNow)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>المتبقي على حساب العميل:</span>
                      <span className="font-bold">{formatMoney(Math.max(0, netInvoiceTotal - amountPaidNow))}</span>
                    </div>
                  </div>

                  {/* 3 Completion Buttons */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleCustomerInvoiceSubmit('none')}
                      className="w-full py-2.5 px-4 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      تم من غير طباعة (حفظ فقط)
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleCustomerInvoiceSubmit('plain')}
                        className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        طباعة المعاملة
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleCustomerInvoiceSubmit('with_carry')}
                        className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        طباعة مع ترحيل القديم
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Direct Customer Receipt */
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                تحصيل نقدي من عميل (سند قبض)
              </h4>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">العميل *</label>
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- اختر العميل --</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ المحصل (ج.م) *</label>
                <NumericInput
                  value={voucherAmount}
                  onChange={setVoucherAmount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-black text-emerald-700 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المستلمة *</label>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">البيان / ملاحظات التحصيل</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة تحت الحساب / سداد فاتورة سابقة"
                  value={voucherNotes}
                  onChange={(e) => setVoucherNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleDirectVoucherSubmit('in')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition shadow-sm"
              >
                تأكيد التحصيل وترحيل السند
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: SUPPLIERS ======================= */}
      {primaryTab === 'suppliers' && (
        <div className="space-y-6">
          {/* Sub-mode selector */}
          <div className="flex gap-3">
            <button
              onClick={() => setSupplierSubMode('invoice')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                supplierSubMode === 'invoice'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              شراء بضاعة من مورد (إذن توريد)
            </button>
            <button
              onClick={() => setSupplierSubMode('direct_payment')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                supplierSubMode === 'direct_payment'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              سداد نقدي مباشر لمورد بدون بضاعة
            </button>
          </div>

          {supplierSubMode === 'invoice' ? (
            /* Purchase Invoice / Receipt Note */
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-6">
              {/* Header */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-100">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">المورد *</label>
                    <button
                      type="button"
                      onClick={() => setShowAddPartyModal(true)}
                      className="text-[11px] text-amber-600 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Plus className="w-3 h-3" />
                      مورد جديد
                    </button>
                  </div>
                  <select
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">-- اختر المورد --</option>
                    {suppliersList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.phone ? `(${s.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">تاريخ المعاملة</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">مكان الاستلام بالمخزن</label>
                  <select
                    value={selectedSiteId}
                    onChange={(e) => setSelectedSiteId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-black text-gray-900 text-sm">البضاعة المشتراة</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setLines([
                        ...lines,
                        {
                          productId: '',
                          qty: 1,
                          unitPrice: 0,
                          catalogPrice: 0,
                          unitName: 'طن',
                          discountAmount: 0,
                          lineMode: 'on_account',
                        },
                      ])
                    }
                    className="flex items-center gap-1 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    سطر جديد
                  </button>
                </div>

                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                      <tr>
                        <th className="p-3 w-48">الصنف</th>
                        <th className="p-3 w-28">الوحدة</th>
                        <th className="p-3 w-36">حالة الاستلام</th>
                        <th className="p-3 w-24 text-center">الكمية</th>
                        <th className="p-3 w-28 text-center">سعر الشراء</th>
                        <th className="p-3 w-24 text-center">خصم البند</th>
                        <th className="p-3 w-28 text-center">الإجمالي</th>
                        <th className="p-3 w-20 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((line, idx) => {
                        const lineTotal = Math.max(0, line.qty * line.unitPrice - (line.discountAmount || 0));
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="p-2">
                              <select
                                value={line.productId}
                                onChange={(e) => handleProductSelect(idx, e.target.value)}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500"
                              >
                                <option value="">-- اختر الصنف --</option>
                                {products.map((p) => (
                                  <option key={p.product_id || p.id} value={p.product_id || p.id}>
                                    {p.product_name || p.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            <td className="p-2">
                              <input
                                list="units-list"
                                type="text"
                                value={line.unitName}
                                onChange={(e) => {
                                  const n = [...lines];
                                  n[idx].unitName = e.target.value;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            <td className="p-2">
                              <select
                                value={line.lineMode}
                                onChange={(e: any) => {
                                  const n = [...lines];
                                  n[idx].lineMode = e.target.value;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-bold"
                              >
                                <option value="on_account">استلام فوري بالمخزن</option>
                                <option value="reserve">بضاعة عند المورد (تحت الطلب)</option>
                              </select>
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.qty}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].qty = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.unitPrice}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].unitPrice = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            <td className="p-2 text-center">
                              <NumericInput
                                value={line.discountAmount}
                                onChange={(val) => {
                                  const n = [...lines];
                                  n[idx].discountAmount = val;
                                  setLines(n);
                                }}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-center font-bold focus:ring-1 focus:ring-amber-500"
                              />
                            </td>

                            <td className="p-2 text-center font-black text-xs text-gray-900" dir="ltr">
                              {formatMoney(lineTotal)}
                            </td>

                            <td className="p-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateLine(idx)}
                                  className="p-1 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                                  title="تكرار السطر"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveLine(idx)}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="حذف السطر"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Calculations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">المشال / إكرامية التعتيق (+)</label>
                      <NumericInput
                        value={handlingFee}
                        onChange={setHandlingFee}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">خصم من المورد (-)</label>
                      <NumericInput
                        value={invoiceDiscount}
                        onChange={setInvoiceDiscount}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ المدفوع للمورد</label>
                      <NumericInput
                        value={amountPaidNow}
                        onChange={setAmountPaidNow}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-bold text-amber-700 focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المنصرف منها</label>
                      <select
                        value={selectedCashAccountId}
                        onChange={(e) => setSelectedCashAccountId(e.target.value)}
                        disabled={amountPaidNow <= 0}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold disabled:bg-gray-100 focus:ring-2 focus:ring-amber-500"
                      >
                        {cashAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({formatMoney(a.balance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>إجمالي بنود البضاعة:</span>
                      <span className="font-bold">{formatMoney(linesSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-200 pt-2">
                      <span>صافي استحقاق المورد:</span>
                      <span className="text-amber-700">{formatMoney(netInvoiceTotal)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleSupplierInvoiceSubmit('none')}
                      className="flex-1 py-2.5 px-3 bg-gray-900 hover:bg-black text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      حفظ بدون طباعة
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleSupplierInvoiceSubmit('plain')}
                      className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      حفظ وطباعة
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Direct Supplier Payment */
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-600" />
                سداد نقدي لمورد (سند صرف)
              </h4>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المورد *</label>
                <select
                  value={selectedPartyId}
                  onChange={(e) => setSelectedPartyId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- اختر المورد --</option>
                  {suppliersList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ المدفوع (ج.م) *</label>
                <NumericInput
                  value={voucherAmount}
                  onChange={setVoucherAmount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-black text-amber-700 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المنصرف منها *</label>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-amber-500"
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">البيان / ملاحظات السداد</label>
                <input
                  type="text"
                  placeholder="مثال: دفعة تحت الحساب لسداد فاتورة سابقة"
                  value={voucherNotes}
                  onChange={(e) => setVoucherNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => handleDirectVoucherSubmit('out')}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition shadow-sm"
              >
                تأكيد الصرف وترحيل السند
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 3: PREMISES (EMPLOYEES / EQUIPMENT / GENERAL) ======================= */}
      {primaryTab === 'premises' && (
        <div className="space-y-6">
          {/* Sub-tabs selector */}
          <div className="flex gap-3">
            <button
              onClick={() => setPremisesSubTab('employees')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                premisesSubTab === 'employees'
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              1. يومية موظفين (سلف ورواتب)
            </button>
            <button
              onClick={() => setPremisesSubTab('equipment')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                premisesSubTab === 'equipment'
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              2. يومية معدات وسيارات
            </button>
            <button
              onClick={() => setPremisesSubTab('general')}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                premisesSubTab === 'general'
                  ? 'bg-purple-50 border-purple-300 text-purple-800'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              3. مصاريف نثرية للمكان
            </button>
          </div>

          {/* Section 1: Employees */}
          {premisesSubTab === 'employees' && (
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-purple-600" />
                تسجيل سلفة أو استحقاق موظف
              </h4>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الموظف *</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.job_title || 'موظف'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">نوع الحركة</label>
                <select
                  value={employeeTxType}
                  onChange={(e: any) => setEmployeeTxType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  <option value="advance">سلفة نقدية (تخصم من الراتب)</option>
                  <option value="bonus">مكافأة أو حافز إضافي</option>
                  <option value="deduction">خصم أو جزاء</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ (ج.م) *</label>
                <NumericInput
                  value={employeeTxAmount}
                  onChange={setEmployeeTxAmount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-black text-purple-700 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المنصرف منها *</label>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">السبب / البيان *</label>
                <input
                  type="text"
                  placeholder="مثال: سلفة أسبوعية / سلفة مصاريف علاج"
                  value={employeeTxReason}
                  onChange={(e) => setEmployeeTxReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleEmployeeTxSubmit}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition shadow-sm"
              >
                تأكيد صرف السلفة / الحركة
              </button>
            </div>
          )}

          {/* Section 2: Equipment */}
          {premisesSubTab === 'equipment' && (
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Wrench className="w-5 h-5 text-purple-600" />
                تسجيل مصروف معدة أو سيارة
              </h4>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المعدة / السيارة *</label>
                <select
                  value={selectedEquipmentId}
                  onChange={(e) => setSelectedEquipmentId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">-- اختر المعدة أو السيارة --</option>
                  {equipmentList.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name} {eq.plate_number ? `(${eq.plate_number})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">نوع المصروف</label>
                <select
                  value={equipmentExpenseType}
                  onChange={(e) => setEquipmentExpenseType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  <option value="fuel">سولار / بنزين (وقود)</option>
                  <option value="maintenance">صيانة وقطع غيار</option>
                  <option value="wash">غسيل وتشحيم</option>
                  <option value="driver_tip">إكرامية ونثرية السائق</option>
                  <option value="other">مصروف آخر</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ (ج.م) *</label>
                <NumericInput
                  value={equipmentAmount}
                  onChange={setEquipmentAmount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-black text-purple-700 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">قراءة العداد الحالية (اختياري)</label>
                <NumericInput
                  value={equipmentOdometer}
                  onChange={setEquipmentOdometer}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المنصرف منها *</label>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات وبيان المصروف</label>
                <input
                  type="text"
                  placeholder="مثال: تغيير زيت وفلاتر / تزويد 50 لتر سولار"
                  value={equipmentNotes}
                  onChange={(e) => setEquipmentNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleEquipmentExpenseSubmit}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition shadow-sm"
              >
                تأكيد صرف مصروف المعدة
              </button>
            </div>
          )}

          {/* Section 3: General Premises Expenses */}
          {premisesSubTab === 'general' && (
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-lg mx-auto space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-purple-600" />
                تسجيل مصروف نثري للمكان والمقر
              </h4>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">بند المصروف</label>
                <select
                  value={expenseCategoryId}
                  onChange={(e) => setExpenseCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name_ar || c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المبلغ (ج.م) *</label>
                <NumericInput
                  value={generalExpenseAmount}
                  onChange={setGeneralExpenseAmount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-black text-purple-700 focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">المستلم / اسم الجهة</label>
                <input
                  type="text"
                  placeholder="مثال: شركة الكهرباء / صاحب العقار / البوفيه"
                  value={expensePayee}
                  onChange={(e) => setExpensePayee(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الخزينة المنصرف منها *</label>
                <select
                  value={selectedCashAccountId}
                  onChange={(e) => setSelectedCashAccountId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-purple-500"
                >
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatMoney(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">البيان والتفاصيل *</label>
                <input
                  type="text"
                  placeholder="مثال: فاتورة كهرباء شهر نوفمبر / ضيافة وبوفيه"
                  value={expenseDesc}
                  onChange={(e) => setExpenseDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={handleGeneralExpenseSubmit}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold transition shadow-sm"
              >
                تأكيد تسجيل المصروف
              </button>
            </div>
          )}
        </div>
      )}

      {/* Datalist for free-text units */}
      <datalist id="units-list">
        {units.map((u: any) => (
          <option key={u.id || u.name} value={u.name} />
        ))}
        <option value="م³" />
        <option value="طن" />
        <option value="شكاره" />
        <option value="الف طوبه" />
        <option value="القطعه" />
        <option value="نقلة" />
        <option value="ساعة" />
      </datalist>

      {/* ======================= MODAL: QUICK ADD PARTY ======================= */}
      {showAddPartyModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in duration-200">
            <button
              onClick={() => setShowAddPartyModal(false)}
              className="absolute left-4 top-4 text-gray-400 hover:text-gray-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              {primaryTab === 'customers' ? 'إضافة عميل جديد سريعاً' : 'إضافة مورد جديد سريعاً'}
            </h3>
            <form onSubmit={handleCreateQuickParty} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">الاسم *</label>
                <input
                  type="text"
                  required
                  placeholder="اسم الشخص أو الشركة"
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">رقم الهاتف</label>
                <input
                  type="text"
                  placeholder="01xxxxxxxxx"
                  value={newPartyPhone}
                  onChange={(e) => setNewPartyPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">فترة السداد الافتراضية (أيام)</label>
                <input
                  type="number"
                  min="1"
                  value={newPartySettlementDays}
                  onChange={(e) => setNewPartySettlementDays(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">ملاحظات / العنوان</label>
                <input
                  type="text"
                  placeholder="ملاحظات أو عنوان العميل"
                  value={newPartyNotes}
                  onChange={(e) => setNewPartyNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition"
                >
                  حفظ واختيار تلقائي
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPartyModal(false)}
                  className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: PRINT PREVIEW ======================= */}
      {showPrintModal && printData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-black text-gray-900 text-base">{printData.title}</h3>
                <p className="text-xs text-gray-400">Fludo Supplies ERP · رقم: {printData.invoiceId?.slice(0, 8)}</p>
              </div>
              <button onClick={() => setShowPrintModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
              <div className="flex justify-between">
                <span className="text-gray-500">الجهة / العميل:</span>
                <span className="font-bold text-gray-900">{printData.partyName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">التاريخ:</span>
                <span className="font-mono">{printData.date}</span>
              </div>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-2">الصنف</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2 text-center">السعر</th>
                    <th className="p-2 text-center">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {printData.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2">
                        <span className="font-bold text-gray-900">{l.productName}</span>
                        <span className="text-[10px] text-gray-400 block">{l.mode}</span>
                      </td>
                      <td className="p-2 text-center">{l.qty} {l.unitName}</td>
                      <td className="p-2 text-center">{formatMoney(l.unitPrice)}</td>
                      <td className="p-2 text-center font-bold">{formatMoney(l.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 text-xs border-t pt-3">
              <div className="flex justify-between text-gray-600">
                <span>إجمالي البنود:</span>
                <span className="font-bold">{formatMoney(printData.linesSubtotal)}</span>
              </div>
              {printData.handlingFee > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>المشال:</span>
                  <span className="font-bold">+{formatMoney(printData.handlingFee)}</span>
                </div>
              )}
              {printData.discount > 0 && (
                <div className="flex justify-between text-rose-700">
                  <span>الخصم:</span>
                  <span className="font-bold">-{formatMoney(printData.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-gray-900 border-t pt-1">
                <span>صافي الفاتورة:</span>
                <span className="text-blue-700">{formatMoney(printData.netTotal)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>المدفوع:</span>
                <span className="font-bold text-emerald-700">{formatMoney(printData.paid)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>المتبقي من الفاتورة:</span>
                <span className="font-bold">{formatMoney(printData.remaining)}</span>
              </div>

              {printData.carryBal !== undefined && (
                <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-200 mt-2 space-y-1 text-xs">
                  <div className="flex justify-between text-indigo-900">
                    <span>رصيد سابق مرحل:</span>
                    <span className="font-bold">{formatMoney(printData.carryBal)}</span>
                  </div>
                  <div className="flex justify-between text-indigo-950 font-black text-sm border-t border-indigo-200 pt-1">
                    <span>إجمالي الحساب المستحق:</span>
                    <span>{formatMoney(printData.totalOutstanding)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"
              >
                <Printer className="w-4 h-4" />
                طباعة الفاتورة الآن
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="py-2 px-4 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold transition"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
