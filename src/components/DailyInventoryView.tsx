import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CashDayCloseRecord, CashEntry, Contact, MarketSettings, Transaction } from '../types';
import {
  formatCurrency,
  tafqeet,
  formatArabicDayOnly,
  formatGregorianDate,
  formatGregorianTime,
  calculateNewCustody,
  calculateInventoryDrawerBalance,
  calculateDrawerCash,
  getCarriedOverBalance,
  calculateDayClosingStats,
  isSameCalendarDay,
  getTodayLocalYMD,
  isTransactionResold,
  getTransactionBuyerDebt,
} from '../utils/calculations';
import {
  exportDrilldownToExcel,
  exportDrilldownToPdfA4,
  exportDailyClosingToExcel,
  exportDailyClosingToPdfA4,
  exportMonthlyInventoryToExcel,
  exportMonthlyClosingToPdfA4,
} from '../utils/inventoryExport';
import {
  ClipboardCheck,
  Printer,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wallet,
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  TrendingUp,
  FileText,
  Calendar,
  Save,
  Check,
  CalendarDays,
  X,
  FileSpreadsheet,
  Layers,
  ChevronLeft,
  ChevronRight,
  Info,
  Pencil,
  Download,
  RotateCcw,
  Loader2,
} from 'lucide-react';

interface DailyInventoryViewProps {
  cashEntries: CashEntry[];
  cashClosings: CashDayCloseRecord[];
  transactions: Transaction[];
  settings: MarketSettings;
  contacts?: Contact[];
  onSaveClosing: (
    closingData: Partial<CashDayCloseRecord> & {
      openingBalance: number;
      totalDeposits: number;
      totalExpenses: number;
      totalWithdrawals: number;
      systemCalculatedBalance: number;
      actualCountedCash: number;
      difference: number;
    }
  ) => void;
  onAddCashEntry?: (entryData: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => void;
  onNavigateToCashBox?: () => void;
}

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

export const DailyInventoryView: React.FC<DailyInventoryViewProps> = ({
  cashEntries,
  cashClosings,
  transactions,
  settings,
  contacts = [],
  onSaveClosing,
  onAddCashEntry,
  onNavigateToCashBox,
}) => {
  // Navigation & View mode
  const [inventoryTab, setInventoryTab] = useState<'daily' | 'monthly'>('daily');

  // Find latest active date across cashEntries and transactions
  const latestDataDate = useMemo(() => {
    let latestTs = 0;
    let latestDate = '';
    cashEntries.forEach((e) => {
      const ts = e.timestamp || (e.dateStr ? new Date(e.dateStr).getTime() : 0);
      if (ts > latestTs) {
        latestTs = ts;
        latestDate = e.dateStr || '';
      }
    });
    transactions.forEach((t) => {
      const ts = t.timestamp || (t.dateStr ? new Date(t.dateStr).getTime() : 0);
      if (ts > latestTs) {
        latestTs = ts;
        latestDate = t.dateStr || '';
      }
    });
    if (latestDate && latestDate.includes('/')) {
      const parts = latestDate.split('/');
      if (parts.length === 3) {
        latestDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }
    return latestDate;
  }, [cashEntries, transactions]);

  // Daily Mode States
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const today = getTodayLocalYMD();
    const seenKey = `haraj_daily_inventory_seen_${today}`;
    let alreadyShownToday = false;
    try {
      alreadyShownToday = localStorage.getItem(seenKey) === 'true' || sessionStorage.getItem(seenKey) === 'true';
    } catch (e) {}

    // إذا وُجدت حركات باليوم الجديد أو عُرض محضر الأمس لمرة واحدة مسبقاً: نعتمد اليوم الجديد فوراً
    const hasTodayData =
      cashEntries.some((e) => isSameCalendarDay(e.dateStr || e.timestamp, new Date())) ||
      transactions.some((t) => isSameCalendarDay(t.dateStr || t.timestamp, new Date()));

    if (hasTodayData || alreadyShownToday) {
      return today;
    }

    // أول دخول باليوم الجديد بدون حركات: البحث عن آخر يوم به بيانات لعرضه لمرة واحدة فقط
    let latestTs = 0;
    let latestStr = '';
    for (const e of cashEntries) {
      const ts = e.timestamp || (e.dateStr ? new Date(e.dateStr).getTime() : 0);
      if (ts > latestTs) { latestTs = ts; latestStr = e.dateStr || ''; }
    }
    for (const t of transactions) {
      const ts = t.timestamp || (t.dateStr ? new Date(t.dateStr).getTime() : 0);
      if (ts > latestTs) { latestTs = ts; latestStr = t.dateStr || ''; }
    }
    if (latestStr && latestStr.includes('/')) {
      const parts = latestStr.split('/');
      if (parts.length === 3) {
        latestStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
    }

    // إذا وُجد يوم سابق مختلف عن اليوم الحالي: نعرضه لمرة واحدة فقط ونسجل أنه عُرض اليوم
    if (latestStr && latestStr !== today) {
      try {
        localStorage.setItem(seenKey, 'true');
        sessionStorage.setItem(seenKey, 'true');
      } catch (e) {}
      return latestStr;
    }

    return today;
  });
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [closingNotes, setClosingNotes] = useState('');
  const [inventoryClockDate, setInventoryClockDate] = useState(() => getTodayLocalYMD());

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      const today = getTodayLocalYMD();
      setInventoryClockDate((previous) => (previous === today ? previous : today));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [inventoryOfficer, setInventoryOfficer] = useState('أمين الصندوق');
  const [supervisorName, setSupervisorName] = useState('مشرف الجمعية والحراج');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClosingForPrint, setSelectedClosingForPrint] = useState<CashDayCloseRecord | null>(null);

  // Reconcile Modal States (معاينة واعتماد الجرد الآلي وإدخال الكاش الفعلي)
  const [reconcileModalRecord, setReconcileModalRecord] = useState<CashDayCloseRecord | null>(null);
  const [reconcileActualCounted, setReconcileActualCounted] = useState<number | ''>('');
  const [reconcileOfficer, setReconcileOfficer] = useState('أمين الصندوق');
  const [reconcileSupervisor, setReconcileSupervisor] = useState('مشرف الجمعية والحراج');
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [isSubmittingReconcile, setIsSubmittingReconcile] = useState(false);

  // Monthly Mode States
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [showMonthlyPrintModal, setShowMonthlyPrintModal] = useState(false);

  // Drilldown Details Modal State (تفاصيل المقبوضات / صرف الصيادين / المصروفات عند النقر على الرقم)
  const [drilldownModal, setDrilldownModal] = useState<{
    type: 'receipts' | 'seller_payouts' | 'expenses';
    dateStr: string;
    dayName: string;
    displayedTotal: number;
  } | null>(null);
  const [isExportingDrilldownPdf, setIsExportingDrilldownPdf] = useState(false);
  const [isExportingClosingPdf, setIsExportingClosingPdf] = useState(false);
  const [isExportingMonthlyPdf, setIsExportingMonthlyPdf] = useState(false);

  // Format of target dates
  const todayGregorian = formatGregorianDate(new Date());
  const isViewingToday = isSameCalendarDay(selectedDateStr, new Date());

  // Existing closing for selected date if already saved
  const activeDateClosing = useMemo(() => {
    return cashClosings.find((c) =>
      isSameCalendarDay(c.dateStr || c.timestamp, selectedDateStr)
    );
  }, [cashClosings, selectedDateStr]);

  // عند تغيير التاريخ المحدد: استرجاع الكاش الفعلي والملاحظات إن وُجد إقفال سابق لهذا التاريخ
  React.useEffect(() => {
    if (activeDateClosing) {
      if (typeof activeDateClosing.actualCountedCash === 'number') {
        setCountedCash(activeDateClosing.actualCountedCash);
      }
      if (activeDateClosing.notes) {
        setClosingNotes(activeDateClosing.notes);
      }
      if (activeDateClosing.officerName) {
        setInventoryOfficer(activeDateClosing.officerName);
      }
      if (activeDateClosing.supervisorName) {
        setSupervisorName(activeDateClosing.supervisorName);
      }
    } else {
      setCountedCash('');
      setClosingNotes('');
    }
  }, [selectedDateStr, activeDateClosing]);

  // -------------------------------------------------------------
  // DAILY FINANCIAL CALCULATIONS (نطاق يوم محدد بدقة من 00:00 إلى 23:59)
  // -------------------------------------------------------------
  const dailyStats = useMemo(() => {
    const dayEntries = cashEntries.filter((e) =>
      isSameCalendarDay(e.dateStr || e.timestamp, selectedDateStr)
    );

    const carriedOverBalance = 0;

    // 2. عزل العهدة الجديدة (New Custody): المبالغ المضافة للصندوق اليوم كعهدة صباحية فقط
    const entriesCustody = dayEntries.reduce((sum, e) => {
      if (e.type === 'opening') {
        return sum + e.amount;
      }
      return sum;
    }, 0);

    const buyerAdvanceDeposits = dayEntries.reduce((sum, e) => {
      if (e.type === 'buyer_advance_deposit' && e.category !== 'إيداع فائض مقاصة بيعات') {
        return sum + e.amount;
      }
      return sum;
    }, 0);

    const savedNewCustody = activeDateClosing?.newCustodyAmount;
    const newCustody = calculateNewCustody(entriesCustody, savedNewCustody, isViewingToday);

    const additionalDeposits = dayEntries.reduce((sum, entry) => {
      if (
        entry.type === 'deposit' &&
        entry.repaymentMethod !== 'exchange' &&
        entry.category !== 'إيداع فائض مقاصة بيعات' &&
        entry.category !== 'فائض بيع شروة' &&
        entry.category !== 'عمولة بيع شروة'
      ) {
        return sum + entry.amount;
      }
      return sum;
    }, 0);

    // رصيد السيولة المعتمد اليوم يجمع العهدة الصباحية والإيداعات الإضافية بشكل منفصل
    const totalAvailableLiquidity = newCustody + additionalDeposits;

    let buyerDebtRepayments = 0;
    let buyerDebtExchangeRepayments = 0;
    let sellerExchangePayouts = 0;
    let sellerAdvanceRepayments = 0;
    let generalExpenses = 0;
    let officeExpenses = 0;
    let exchangeExpenses = 0;
    let withdrawals = 0;
    let surplusRefunds = 0;
    let manualSellerPayouts = 0;
    let sellerAdvances = 0;
    const countedSellerPayoutTrxIds = new Set<string>();
    const countedBuyerRepaymentsByTrxId = new Map<string, number>();

    dayEntries.forEach((e) => {
      if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
        const isExchange =
          e.category === 'سداد دين عبر الصرافة' ||
          e.repaymentMethod === 'exchange' ||
          e.payoutMethod === 'exchange' ||
          (e.description && e.description.includes('عبر الصرافة'));
        const isOffset = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';

        if (isExchange) {
          buyerDebtExchangeRepayments += e.amount;
        } else if (!isOffset) {
          buyerDebtRepayments += e.amount;
          const txId = e.transactionId || e.referenceId;
          if (txId) {
            countedBuyerRepaymentsByTrxId.set(txId, (countedBuyerRepaymentsByTrxId.get(txId) || 0) + e.amount);
          }
        }
      } else if (e.type === 'seller_advance_repayment') {
        if (e.category !== 'تسوية ومقاصة سلفة صياد') {
          sellerAdvanceRepayments += e.amount;
        }
      } else if (e.type === 'expense') {
        if (e.payoutMethod === 'exchange') exchangeExpenses += e.amount;
        const isOffice =
          (e.category && (
            e.category.includes('مكتب') ||
            e.category.includes('نثريات') ||
            e.category.includes('ضيافة') ||
            e.category.includes('إفطار') ||
            e.category.includes('غداء') ||
            e.category.includes('قرطاسية')
          )) ||
          (e.description && (
            e.description.includes('مكتب') ||
            e.description.includes('نثريات') ||
            e.description.includes('إفطار') ||
            e.description.includes('غداء')
          ));
        if (isOffice) {
          officeExpenses += e.amount;
        } else {
          generalExpenses += e.amount;
        }
      } else if (e.type === 'withdrawal') {
        withdrawals += e.amount;
      } else if (e.type === 'buyer_advance_refund') {
        withdrawals += e.amount;
        surplusRefunds += e.amount;
      } else if (e.type === 'seller_payout') {
        const isExchange =
          e.category === 'تسليم مستحقات عبر الصرافة' ||
          e.payoutMethod === 'exchange' ||
          (e.description && e.description.includes('عبر الصرافة'));

        if (e.transactionId) countedSellerPayoutTrxIds.add(e.transactionId);
        if (e.referenceId) countedSellerPayoutTrxIds.add(e.referenceId);
        if (e.description) {
          const match = e.description.match(/TRX-\d{4}-\d{4}/);
          if (match) countedSellerPayoutTrxIds.add(match[0]);
        }

        if (isExchange) {
          sellerExchangePayouts += e.amount;
        } else {
          manualSellerPayouts += e.amount;
        }
      } else if (e.type === 'seller_advance') {
        sellerAdvances += e.amount;
      }
    });

    // Transactions strictly belonging to selected calendar day
    const dayTransactions = transactions.filter((t) =>
      isSameCalendarDay(t.dateStr || t.timestamp, selectedDateStr)
    );

    let harajCashSales = 0;
    let posSellerCashPaid = 0;
    let associationProfit = 0;

    dayTransactions.forEach((t) => {
      // إذا كانت الشروة قد أعيد بيعها لشخص آخر، نستثني مبيعاتها تفادياً لتكرار الكاش
      const wasResold = isTransactionResold(t);
      if (wasResold) {
        const isSellerExchange =
          t.sellerPayoutMethod === 'exchange' ||
          (t.notes && t.notes.includes('عبر الصرافة')) ||
          Boolean(t.sellerExchangeName);

        const hasManualPayout = countedSellerPayoutTrxIds.has(t.id);
        const paidToSeller =
          hasManualPayout || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isSellerExchange
            ? 0
            : t.paidAtPosAmount !== undefined
            ? t.paidAtPosAmount
            : t.sellerPaidAmount !== undefined
            ? t.sellerPaidAmount
            : 0;
        posSellerCashPaid += paidToSeller;
        return;
      }

      associationProfit += t.harajProfit || 0;

      const isSellerExchange =
        t.sellerPayoutMethod === 'exchange' ||
        (t.notes && t.notes.includes('عبر الصرافة')) ||
        Boolean(t.sellerExchangeName);

      if (isSellerExchange && !countedSellerPayoutTrxIds.has(t.id)) {
        const amt = typeof t.paidAtPosAmount === 'number'
          ? t.paidAtPosAmount
          : typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : t.sellerPaidStatus === 'paid'
          ? t.netToSeller
          : 0;
        if (amt > 0) {
          sellerExchangePayouts += amt;
        }
      }

      const hasManualPayout = countedSellerPayoutTrxIds.has(t.id);
      const paidToSeller =
        hasManualPayout || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isSellerExchange
          ? 0
          : t.paidAtPosAmount !== undefined
          ? t.paidAtPosAmount
          : t.sellerPaidAmount !== undefined
          ? t.sellerPaidAmount
          : 0;

      let cashFromBuyer = 0;
      if (t.settlementType === 'direct_cash') {
        cashFromBuyer = t.harajProfit || 0;
      } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
        cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
      } else if (t.settlementType === 'association_cash') {
        cashFromBuyer = t.totalFromBuyer || 0;
      } else if (t.settlementType === 'partial_cash') {
        cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number'
          ? t.paidAtPosBuyerAmount
          : typeof t.buyerPaidAmount === 'number' && t.paymentStatus === 'pending'
          ? t.buyerPaidAmount
          : 0;
      } else if (typeof t.paidAtPosBuyerAmount === 'number') {
        cashFromBuyer = t.paidAtPosBuyerAmount;
      }

      if (t.isResale && cashFromBuyer > 0) {
        const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
        const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
        cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
      }

      const linkedRepaid = countedBuyerRepaymentsByTrxId.get(t.id) || 0;
      const targetPaid = typeof t.buyerPaidAmount === 'number' ? t.buyerPaidAmount : (t.settlementType === 'association_cash' ? (t.totalFromBuyer || 0) : (t.paidAtPosBuyerAmount || 0));
      const maxPosAllowed = Math.max(0, targetPaid - linkedRepaid);
      cashFromBuyer = Math.min(cashFromBuyer, maxPosAllowed);

      harajCashSales += cashFromBuyer;
      posSellerCashPaid += paidToSeller;
    });

    const totalExpenses = generalExpenses + officeExpenses;
    const totalFishermanPayouts = posSellerCashPaid + manualSellerPayouts + sellerAdvances;
    const totalBuyerReceipts = harajCashSales + buyerDebtRepayments + sellerAdvanceRepayments + buyerAdvanceDeposits;
    const totalCashOut = totalFishermanPayouts + totalExpenses - exchangeExpenses + withdrawals;

    // الرصيد الفعلي المتوقع بنهاية اليوم = إجمالي السيولة المتاحة + المقبوضات النقدية - المدفوعات
    const detailedExpectedDrawerCash = totalAvailableLiquidity + totalBuyerReceipts - totalCashOut;
    const expectedDrawerCash = calculateInventoryDrawerBalance(
      detailedExpectedDrawerCash,
      cashEntries,
      transactions,
      cashClosings,
      selectedDateStr,
      isViewingToday,
      Boolean(settings.separateProfitsFromDrawerCash)
    );

    return {
      carriedOverBalance,
      newCustody,
      additionalDeposits,
      buyerAdvanceDeposits,
      totalAvailableLiquidity,
      opening: newCustody,
      deposits: additionalDeposits,
      buyerDebtRepayments,
      buyerDebtExchangeRepayments,
      sellerExchangePayouts,
      sellerAdvanceRepayments,
      harajCashSales,
      totalBuyerReceipts,
      totalFishermanPayouts,
      posSellerCashPaid,
      manualSellerPayouts,
      sellerAdvances,
      expenses: totalExpenses,
      exchangeExpenses,
      generalExpenses,
      officeExpenses,
      associationProfit,
      surplusRefunds,
      withdrawals,
      expectedDrawerCash,
      totalCashIn: totalAvailableLiquidity + totalBuyerReceipts,
      totalCashOut,
      todayDealsCount: dayTransactions.length,
    };
  }, [cashEntries, transactions, selectedDateStr, cashClosings, activeDateClosing]);

  const displayedDailyStats = dailyStats;

  const diff = countedCash === '' ? 0 : Number(countedCash) - dailyStats.expectedDrawerCash;

  // -------------------------------------------------------------
  // ACTIONS: SAVE CLOSING RECORD
  // -------------------------------------------------------------
  const handleSaveInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    const actual = countedCash === '' ? dailyStats.expectedDrawerCash : Number(countedCash);
    const calculatedDiff = actual - dailyStats.expectedDrawerCash;

    onSaveClosing({
      id: activeDateClosing?.id,
      dateStr: selectedDateStr,
      timeStr: activeDateClosing?.timeStr || formatGregorianTime(new Date()),
      openingBalance: dailyStats.totalAvailableLiquidity,
      carriedOverBalance: dailyStats.carriedOverBalance,
      newCustodyAmount: dailyStats.newCustody,
      totalDeposits: dailyStats.additionalDeposits,
      buyerDebtRepayments: dailyStats.buyerDebtRepayments,
      buyerDebtExchangeRepayments: dailyStats.buyerDebtExchangeRepayments,
      sellerExchangePayouts: dailyStats.sellerExchangePayouts,
      harajCashSales: dailyStats.harajCashSales,
      harajSellerPayouts: dailyStats.totalFishermanPayouts,
      totalExpenses: dailyStats.expenses,
      exchangeExpenses: dailyStats.exchangeExpenses,
      officeExpenses: dailyStats.officeExpenses,
      associationProfits: dailyStats.associationProfit,
      totalWithdrawals: dailyStats.withdrawals,
      systemCalculatedBalance: dailyStats.expectedDrawerCash,
      actualCountedCash: actual,
      difference: calculatedDiff,
      notes: closingNotes.trim()
        ? `${closingNotes.trim()} (أمين الصندوق: ${inventoryOfficer} | المشرف: ${supervisorName})`
        : `تم الجرد اليومي واعتماد النقدية (أمين الصندوق: ${inventoryOfficer} | المشرف: ${supervisorName})`,
    });

    setSuccessMsg(
      activeDateClosing
        ? 'تم تحديث جرد اليوم بنجاح في السجل المعتمد!'
        : 'تم حفظ واعتماد جرد اليوم بنجاح في السجل الدائم!'
    );
    setTimeout(() => {
      setSuccessMsg(null);
      setIsSaving(false);
    }, 3500);
  };

  // -------------------------------------------------------------
  // ACTIONS: RECONCILE / AUDIT AUTO-CLOSED INVENTORY RECORD
  // -------------------------------------------------------------
  const handleOpenReconcileModal = (record: CashDayCloseRecord) => {
    setReconcileModalRecord(record);
    const initialCounted =
      record.reconciliationStatus === 'pending' && record.actualCountedCash === 0
        ? ''
        : record.actualCountedCash;
    setReconcileActualCounted(initialCounted);
    setReconcileOfficer('أمين الصندوق');
    setReconcileSupervisor('مشرف الجمعية والحراج');
    setReconcileNotes(
      record.notes && !record.notes.includes('إقفال آلي') ? record.notes : ''
    );
  };

  const handleConfirmReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileModalRecord || isSubmittingReconcile) return;
    setIsSubmittingReconcile(true);

    const actual =
      reconcileActualCounted === ''
        ? reconcileModalRecord.systemCalculatedBalance
        : Number(reconcileActualCounted);
    const calculatedDiff = actual - reconcileModalRecord.systemCalculatedBalance;

    const baseNotes =
      reconcileNotes.trim() || 'تمت معاينة الكاش الفعلي المعدود ومطابقته واعتماده بنجاح';
    const notesSuffix = ` (معاينة واعتماد: ${reconcileOfficer.trim() || 'أمين الصندوق'} | المشرف: ${reconcileSupervisor.trim() || 'مشرف الجمعية والحراج'})`;
    const finalNotes = `${baseNotes}${notesSuffix}`;

    onSaveClosing({
      ...reconcileModalRecord,
      dateStr: reconcileModalRecord.dateStr,
      timeStr: reconcileModalRecord.timeStr,
      actualCountedCash: actual,
      difference: calculatedDiff,
      reconciliationStatus: 'reconciled',
      reconciledAt: Date.now(),
      reconciledBy: reconcileOfficer.trim() || 'أمين الصندوق',
      notes: finalNotes,
    });

    setSuccessMsg(`تمت مطابقة واعتماد جرد يوم ${reconcileModalRecord.dateStr} بنجاح!`);
    setTimeout(() => {
      setSuccessMsg(null);
    }, 3500);

    setIsSubmittingReconcile(false);
    setReconcileModalRecord(null);
  };

  // -------------------------------------------------------------
  // MONTHLY FINANCIAL CALCULATIONS (الجرد الشهري والمطابقة العامة)
  // -------------------------------------------------------------
  const monthlyStats = useMemo(() => {
    // Days count in selected month
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

    const isRecordInSelectedMonth = (dateInput?: Date | number | string) => {
      if (!dateInput) return false;
      const d = new Date(
        typeof dateInput === 'string' ? dateInput.replace(/-/g, '/') : dateInput
      );
      if (isNaN(d.getTime())) return false;
      return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
    };

    const monthEntries = cashEntries.filter((e) =>
      isRecordInSelectedMonth(e.dateStr || e.timestamp)
    );
    const monthTransactions = transactions.filter((t) =>
      isRecordInSelectedMonth(t.dateStr || t.timestamp)
    );
    const monthClosings = cashClosings.filter((c) =>
      isRecordInSelectedMonth(c.dateStr || c.timestamp)
    );

    // Sort closings of the month chronologically
    const sortedClosings = [...monthClosings].sort((a, b) => {
      const aDate = new Date((a.dateStr || '').replace(/-/g, '/')).getTime() || a.timestamp || 0;
      const bDate = new Date((b.dateStr || '').replace(/-/g, '/')).getTime() || b.timestamp || 0;
      return aDate - bDate;
    });

    // 1. كاش الدرج (النقد الفعلي بالخزينة/الدرج لآخر يوم به حركة أو إقفال في الشهر):
    const latestClosing = sortedClosings[sortedClosings.length - 1];
    let endingActualCash = latestClosing
      ? latestClosing.reconciliationStatus === 'pending'
        ? (latestClosing.systemCalculatedBalance || 0)
        : (latestClosing.actualCountedCash ?? latestClosing.systemCalculatedBalance ?? 0)
      : 0;

    const carriedForwardLiquidity = 0;

    let monthGeneralExpenses = 0;
    let monthOfficeExpenses = 0;
    let monthExchangeExpenses = 0;
    let monthWithdrawals = 0;
    let monthFishermanPayouts = 0;
    let monthBuyerDebtRepayments = 0;
    let monthHarajCashSales = 0;
    let monthHarajProfit = 0;
    let monthDifference = 0;

    monthClosings.forEach((c) => {
      monthDifference += c.difference || 0;
    });

    const countedMonthSellerPayoutTrxIds = new Set<string>();
    const countedMonthResaleDepositTrxIds = new Set<string>();

    monthEntries.forEach((e) => {
      if (e.type === 'deposit') {
        if (e.category === 'فائض بيع شروة' || e.category === 'عمولة بيع شروة') {
          if (e.transactionId) countedMonthResaleDepositTrxIds.add(e.transactionId);
          if (e.referenceId) countedMonthResaleDepositTrxIds.add(e.referenceId);
        }
      } else if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
        const isOffset = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';
        const isExchange = e.payoutMethod === 'exchange' || e.repaymentMethod === 'exchange';
        if (!isOffset && !isExchange) {
          monthBuyerDebtRepayments += e.amount;
        }
      } else if (e.type === 'seller_advance_repayment') {
        if (e.category !== 'تسوية ومقاصة سلفة صياد') {
          monthBuyerDebtRepayments += e.amount;
        }
      } else if (e.type === 'expense') {
        if (e.payoutMethod === 'exchange') monthExchangeExpenses += e.amount;
        const isOffice =
          (e.category && (
            e.category.includes('مكتب') ||
            e.category.includes('نثريات') ||
            e.category.includes('ضيافة') ||
            e.category.includes('إفطار') ||
            e.category.includes('غداء')
          )) ||
          (e.description && (
            e.description.includes('مكتب') ||
            e.description.includes('نثريات') ||
            e.description.includes('إفطار') ||
            e.description.includes('غداء')
          ));
        if (isOffice) {
          monthOfficeExpenses += e.amount;
        } else {
          monthGeneralExpenses += e.amount;
        }
      } else if (e.type === 'withdrawal' || e.type === 'buyer_advance_refund') {
        monthWithdrawals += e.amount;
      } else if (e.type === 'seller_payout') {
        if (e.transactionId) countedMonthSellerPayoutTrxIds.add(e.transactionId);
        if (e.referenceId) countedMonthSellerPayoutTrxIds.add(e.referenceId);
        if (e.description) {
          const match = e.description.match(/TRX-\d{4}-\d{4}/);
          if (match) countedMonthSellerPayoutTrxIds.add(match[0]);
        }
        const isExchange =
          e.payoutMethod === 'exchange' ||
          e.category === 'تسليم مستحقات عبر الصرافة' ||
          (e.description && e.description.includes('عبر الصرافة'));
        if (!isExchange) {
          monthFishermanPayouts += e.amount;
        }
      } else if (e.type === 'seller_advance') {
        monthFishermanPayouts += e.amount;
      }
    });

    monthTransactions.forEach((t) => {
      if (isTransactionResold(t)) {
        const isExchange =
          t.sellerPayoutMethod === 'exchange' ||
          (t.notes && t.notes.includes('عبر الصرافة')) ||
          Boolean(t.sellerExchangeName);
        const hasManualPayout = countedMonthSellerPayoutTrxIds.has(t.id);
        const paidToSeller =
          hasManualPayout || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isExchange
            ? 0
            : typeof t.paidAtPosAmount === 'number'
            ? t.paidAtPosAmount
            : typeof t.sellerPaidAmount === 'number'
            ? t.sellerPaidAmount
            : 0;
        monthFishermanPayouts += paidToSeller;
        return;
      }

      monthHarajProfit += t.harajProfit || 0;

      let cashFromBuyer = 0;
      if (t.settlementType === 'direct_cash') {
        cashFromBuyer = t.harajProfit || 0;
      } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
        cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
      } else if (t.settlementType === 'association_cash') {
        cashFromBuyer = t.totalFromBuyer || 0;
      } else if (t.settlementType === 'partial_cash') {
        cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number'
          ? t.paidAtPosBuyerAmount
          : typeof t.buyerPaidAmount === 'number' && t.paymentStatus === 'pending'
          ? t.buyerPaidAmount
          : 0;
      } else if (typeof t.paidAtPosBuyerAmount === 'number') {
        cashFromBuyer = t.paidAtPosBuyerAmount;
      }

      if (t.isResale && cashFromBuyer > 0 && countedMonthResaleDepositTrxIds.has(t.id)) {
        const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
        const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
        cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
      }
      monthHarajCashSales += cashFromBuyer;

      const isExchange =
        t.sellerPayoutMethod === 'exchange' ||
        (t.notes && t.notes.includes('عبر الصرافة')) ||
        Boolean(t.sellerExchangeName);
      const hasManualPayout = countedMonthSellerPayoutTrxIds.has(t.id);
      const paidToSeller =
        hasManualPayout || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isExchange
          ? 0
          : typeof t.paidAtPosAmount === 'number'
          ? t.paidAtPosAmount
          : typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : 0;
      monthFishermanPayouts += paidToSeller;
    });

    // Outstanding Debts at Month-End
    let outstandingBuyerDebt = 0;
    transactions.forEach((t) => {
      const debt = getTransactionBuyerDebt(t);
      outstandingBuyerDebt += debt;
    });

    // 2. إجمالي العُهد الجديدة المضافة (Total New Custody):
    // مجموع مبالغ العُهد الجديدة المسلمة من الجمعية فقط طوال أيام الشهر (دون احتساب أي رصيد مرحل)
    let totalNewCustody = 0;

    // Daily rows breakdown for all days of the selected month
    const dailyBreakdownRows = [];
    let runningCarriedOver = carriedForwardLiquidity;

    const todayObj = new Date();
    const todayStartTs = new Date(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate(), 0, 0, 0).getTime();

    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = new Date(selectedYear, selectedMonth - 1, day, 12, 0, 0);
      const dayStartTs = new Date(selectedYear, selectedMonth - 1, day, 0, 0, 0).getTime();
      const isFutureDay = dayStartTs > todayStartTs;
      const dayIso = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayFormatted = `${selectedYear}/${selectedMonth}/${day}`;
      const dayName = formatArabicDayOnly(dayFormatted, dayDate.getTime());

      const closing = monthClosings.find((c) =>
        isSameCalendarDay(c.dateStr || c.timestamp, dayFormatted)
      );

      const dayTrxs = monthTransactions.filter((t) =>
        isSameCalendarDay(t.dateStr || t.timestamp, dayFormatted)
      );
      const dayEntries = monthEntries.filter((e) =>
        isSameCalendarDay(e.dateStr || e.timestamp, dayFormatted)
      );

      const hasActivity = Boolean(closing) || dayTrxs.length > 0 || dayEntries.length > 0;
      const isInactive = !hasActivity && !closing;
      const isFutureEmpty = isFutureDay && !closing;

      let dayCarriedOver = 0;
      if (closing?.carriedOverBalance !== undefined) {
        dayCarriedOver = closing.carriedOverBalance;
      } else if (!isInactive) {
        if (day === 1) {
          dayCarriedOver = carriedForwardLiquidity;
        } else {
          // نبحث عن آخر إقفال سابق في نفس الشهر
          const priorClosingsInMonth = monthClosings
            .filter((c) => {
              const cD = new Date((c.dateStr || '').replace(/-/g, '/'));
              const cTs = isNaN(cD.getTime())
                ? (c.timestamp || 0)
                : new Date(cD.getFullYear(), cD.getMonth(), cD.getDate(), 0, 0, 0).getTime();
              return cTs < dayStartTs;
            })
            .sort((a, b) => {
              const aTs = new Date((a.dateStr || '').replace(/-/g, '/')).getTime() || a.timestamp || 0;
              const bTs = new Date((b.dateStr || '').replace(/-/g, '/')).getTime() || b.timestamp || 0;
              return bTs - aTs;
            });

          const lastClosingInMonth = priorClosingsInMonth[0];
          if (lastClosingInMonth) {
            dayCarriedOver =
              lastClosingInMonth.reconciliationStatus === 'pending'
                ? (lastClosingInMonth.systemCalculatedBalance ?? 0)
                : (lastClosingInMonth.actualCountedCash ?? lastClosingInMonth.systemCalculatedBalance ?? 0);
          } else {
            dayCarriedOver = 0;
          }
        }
      }

      let dayNewCustody = 0;
      if (!isInactive) {
        const entriesCustody = dayEntries.reduce((sum, e) => {
          if (e.type === 'opening') {
            return sum + e.amount;
          }
          return sum;
        }, 0);

        if (closing?.newCustodyAmount !== undefined) {
          dayNewCustody = closing.newCustodyAmount;
        } else if (closing?.openingBalance !== undefined && closing?.carriedOverBalance !== undefined && closing.openingBalance >= closing.carriedOverBalance) {
          dayNewCustody = closing.openingBalance - closing.carriedOverBalance;
        } else if (entriesCustody > 0) {
          if (dayCarriedOver > 0 && entriesCustody > dayCarriedOver) {
            dayNewCustody = entriesCustody - dayCarriedOver;
          } else {
            dayNewCustody = entriesCustody;
          }
        } else if (closing?.totalDeposits !== undefined && !closing.carriedOverBalance) {
          dayNewCustody = closing.totalDeposits;
        } else {
          dayNewCustody = entriesCustody;
        }
      }

      totalNewCustody += dayNewCustody;

      let dayHarajSales = 0;
      let daySellerPaid = 0;
      const dayCountedSellerPayoutTrxIds = new Set<string>();
      const dayCountedResaleDepositTrxIds = new Set<string>();
      const dayCountedBuyerRepaymentsByTrxId = new Map<string, number>();

      if (!isInactive) {
        dayEntries.forEach((e) => {
          if (e.type === 'deposit') {
            if (e.category === 'فائض بيع شروة' || e.category === 'عمولة بيع شروة') {
              if (e.transactionId) dayCountedResaleDepositTrxIds.add(e.transactionId);
              if (e.referenceId) dayCountedResaleDepositTrxIds.add(e.referenceId);
            }
          } else if (e.type === 'seller_payout') {
            if (e.transactionId) dayCountedSellerPayoutTrxIds.add(e.transactionId);
            if (e.referenceId) dayCountedSellerPayoutTrxIds.add(e.referenceId);
            if (e.description) {
              const match = e.description.match(/TRX-\d{4}-\d{4}/);
              if (match) dayCountedSellerPayoutTrxIds.add(match[0]);
            }
          }
        });

        dayTrxs.forEach((t) => {
          if (isTransactionResold(t)) {
            const isEx =
              t.sellerPayoutMethod === 'exchange' ||
              (t.notes && t.notes.includes('عبر الصرافة')) ||
              Boolean(t.sellerExchangeName);
            const hasManual = dayCountedSellerPayoutTrxIds.has(t.id);
            const pSeller =
              hasManual || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isEx
                ? 0
                : typeof t.paidAtPosAmount === 'number'
                ? t.paidAtPosAmount
                : typeof t.sellerPaidAmount === 'number'
                ? t.sellerPaidAmount
                : 0;
            daySellerPaid += pSeller;
            return;
          }

          let cashBuyer = 0;
          if (t.settlementType === 'direct_cash') cashBuyer = t.harajProfit || 0;
          else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
            cashBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
          } else if (t.settlementType === 'association_cash') cashBuyer = t.totalFromBuyer || 0;
          else if (t.settlementType === 'partial_cash') {
            cashBuyer = typeof t.paidAtPosBuyerAmount === 'number'
              ? t.paidAtPosBuyerAmount
              : typeof t.buyerPaidAmount === 'number' && t.paymentStatus === 'pending'
              ? t.buyerPaidAmount
              : 0;
          } else if (typeof t.paidAtPosBuyerAmount === 'number') {
            cashBuyer = t.paidAtPosBuyerAmount;
          }

          if (t.isResale && cashBuyer > 0 && dayCountedResaleDepositTrxIds.has(t.id)) {
            const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
            const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
            cashBuyer = Math.max(0, cashBuyer - surplus - commission);
          }
          const linkedRepaidDay = dayCountedBuyerRepaymentsByTrxId.get(t.id) || 0;
          const targetPaidDay = typeof t.buyerPaidAmount === 'number' ? t.buyerPaidAmount : (t.settlementType === 'association_cash' ? (t.totalFromBuyer || 0) : (t.paidAtPosBuyerAmount || 0));
          const maxPosDay = Math.max(0, targetPaidDay - linkedRepaidDay);
          cashBuyer = Math.min(cashBuyer, maxPosDay);
          dayHarajSales += cashBuyer;

          const isEx =
            t.sellerPayoutMethod === 'exchange' ||
            (t.notes && t.notes.includes('عبر الصرافة')) ||
            Boolean(t.sellerExchangeName);
          const hasManual = dayCountedSellerPayoutTrxIds.has(t.id);
          const pSeller =
            hasManual || t.settlementType === 'direct_cash' || t.sellerPaidStatus === 'unpaid' || isEx
              ? 0
              : typeof t.paidAtPosAmount === 'number'
              ? t.paidAtPosAmount
              : typeof t.sellerPaidAmount === 'number'
              ? t.sellerPaidAmount
              : 0;
          daySellerPaid += pSeller;
        });
      }

      let dayBuyerDebtRepay = 0;
      let dayExpenses = 0;
      let dayExchangeExpenses = 0;
      let dayWithdrawals = 0;
      if (!isInactive) {
        dayEntries.forEach((e) => {
          if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
            const isOffset = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';
            const isEx = e.payoutMethod === 'exchange' || e.repaymentMethod === 'exchange';
            if (!isOffset && !isEx) dayBuyerDebtRepay += e.amount;
          } else if (e.type === 'seller_advance_repayment' && e.category !== 'تسوية ومقاصة سلفة صياد') {
            dayBuyerDebtRepay += e.amount;
          } else if ((e.type === 'buyer_advance_deposit' || (e.type === 'deposit' && e.repaymentMethod !== 'exchange' && e.category !== 'إيداع فائض مقاصة بيعات' && e.category !== 'فائض بيع شروة' && e.category !== 'عمولة بيع شروة')) && e.category !== 'إيداع فائض مقاصة بيعات') {
            dayBuyerDebtRepay += e.amount;
          } else if (e.type === 'expense') {
            dayExpenses += e.amount;
            if (e.payoutMethod === 'exchange') dayExchangeExpenses += e.amount;
          } else if (e.type === 'withdrawal' || e.type === 'buyer_advance_refund') {
            dayWithdrawals += e.amount;
          } else if (e.type === 'seller_payout') {
            const isEx =
              e.payoutMethod === 'exchange' ||
              e.category === 'تسليم مستحقات عبر الصرافة' ||
              (e.description && e.description.includes('عبر الصرافة'));
            if (!isEx) daySellerPaid += e.amount;
          } else if (e.type === 'seller_advance') {
            daySellerPaid += e.amount;
          }
        });
      }

      const dayProfit = isInactive ? 0 : dayTrxs.reduce((sum, t) => sum + (t.harajProfit || 0), 0);
      const isReconciledClosing = Boolean(closing && closing.reconciliationStatus === 'reconciled' && !closing.isAutoClosed);
      const dayBuyerReceipts = isInactive
        ? 0
        : (dayHarajSales + dayBuyerDebtRepay);
      const dayTotalSellerPayouts = isInactive ? 0 : (isReconciledClosing ? (closing?.harajSellerPayouts ?? daySellerPaid) : daySellerPaid);
      dayExchangeExpenses = isInactive ? 0 : (isReconciledClosing ? (closing?.exchangeExpenses ?? dayExchangeExpenses) : dayExchangeExpenses);
      const dayTotalExpenses = isInactive ? 0 : (isReconciledClosing ? (closing?.totalExpenses ?? dayExpenses) : dayExpenses);
      const dayAvailableLiquidity = isInactive ? 0 : dayCarriedOver + dayNewCustody;

      const isCurrentDay = isSameCalendarDay(dayFormatted, todayObj);
      const dayDrawerBalance = isCurrentDay
        ? calculateDrawerCash(cashEntries, transactions, true, dayCarriedOver, Boolean(settings.separateProfitsFromDrawerCash)).currentDrawerBalance
        : Math.max(0, dayAvailableLiquidity + dayBuyerReceipts - dayTotalSellerPayouts - dayTotalExpenses + dayExchangeExpenses - dayWithdrawals);

      const calculatedDrawer = isInactive
        ? 0
        : (isReconciledClosing ? (closing?.systemCalculatedBalance ?? dayDrawerBalance) : dayDrawerBalance);

      if (closing) {
        runningCarriedOver = isReconciledClosing
          ? (closing.actualCountedCash ?? closing.systemCalculatedBalance ?? dayDrawerBalance)
          : dayDrawerBalance;
      } else if (!isInactive) {
        runningCarriedOver = dayDrawerBalance;
      }

      dailyBreakdownRows.push({
        dayNumber: day,
        dateStr: dayFormatted,
        isoStr: dayIso,
        dayName,
        closing,
        dealsCount: dayTrxs.length,
        dayProfit,
        isClosed: Boolean(closing),
        hasActivity,
        isInactive,
        isFuture: isFutureEmpty,
        carriedOverBalance: isInactive ? 0 : dayCarriedOver,
        newCustody: dayNewCustody,
        totalAvailableLiquidity: dayAvailableLiquidity,
        receipts: dayBuyerReceipts,
        sellerPayouts: dayTotalSellerPayouts,
        expenses: dayTotalExpenses,
        withdrawals: dayWithdrawals,
        calculatedDrawer,
        actualCounted: isReconciledClosing ? closing.actualCountedCash : null,
        diff: isReconciledClosing ? closing.difference : null,
      });
    }

    // تحديد كاش الدرج الفعلي (النقد الفعلي بالدرج/الخزينة لآخر يوم به نشاط أو إقفال بالشهر)
    const activeDays = dailyBreakdownRows.filter((r) => r.isClosed || (r.hasActivity && !r.isFuture));
    const lastActiveDay = activeDays[activeDays.length - 1];
    if (lastActiveDay) {
      const isLastDayToday = isSameCalendarDay(lastActiveDay.dateStr || lastActiveDay.isoStr, todayObj);
      if (isLastDayToday) {
        const carriedOverForToday = getCarriedOverBalance(cashClosings);
        endingActualCash = calculateDrawerCash(
          cashEntries,
          transactions,
          true,
          carriedOverForToday,
          Boolean(settings.separateProfitsFromDrawerCash)
        ).currentDrawerBalance;
      } else if (lastActiveDay.closing && !lastActiveDay.closing.isAutoClosed && lastActiveDay.closing.reconciliationStatus === 'reconciled') {
        endingActualCash =
          lastActiveDay.closing.actualCountedCash ?? lastActiveDay.closing.systemCalculatedBalance ?? lastActiveDay.calculatedDrawer ?? 0;
      } else if (lastActiveDay.calculatedDrawer !== undefined) {
        endingActualCash = lastActiveDay.calculatedDrawer;
      }
    }

    // 4. إجمالي مدفوعات الشهر (Total Cash Out):
    const totalCashOut = monthFishermanPayouts + monthGeneralExpenses + monthOfficeExpenses - monthExchangeExpenses + monthWithdrawals;

    // 5. إجمالي مقبوضات الشهر (Total Cash In):
    const totalBuyerReceipts = monthHarajCashSales + monthBuyerDebtRepayments;

    return {
      daysInMonth,
      endingActualCash,
      totalNewCustody,
      carriedForwardLiquidity,
      totalCashOut,
      totalCashIn: totalBuyerReceipts,
      totalBuyerReceipts,
      monthHarajProfit,
      outstandingBuyerDebt,
      monthGeneralExpenses,
      monthOfficeExpenses,
      totalExpenses: monthGeneralExpenses + monthOfficeExpenses,
      netHarajProfit: monthHarajProfit - (monthGeneralExpenses + monthOfficeExpenses),
      monthFishermanPayouts,
      monthWithdrawals,
      monthDifference,
      initialOpening: carriedForwardLiquidity,
      closedDaysCount: monthClosings.length,
      dealsCount: monthTransactions.length,
      dailyBreakdownRows,
    };
  }, [cashEntries, transactions, cashClosings, selectedMonth, selectedYear]);

  // Helper functions to calculate exact custody & receipts for any day across archive & modal
  const getDayCustodyTotal = (rec: CashDayCloseRecord) => {
    const dayEntries = cashEntries.filter((e) =>
      isSameCalendarDay(e.dateStr || e.timestamp, rec.dateStr)
    );
    const openingEntries = dayEntries
      .filter((e) => e.type === 'opening')
      .reduce((sum, e) => sum + e.amount, 0);
    if (openingEntries > 0) return openingEntries;
    if (rec.newCustodyAmount !== undefined && rec.newCustodyAmount > 0) return rec.newCustodyAmount;
    return rec.openingBalance;
  };

  const getDayWithdrawalsTotal = (rec: CashDayCloseRecord) => {
    const dayEntries = cashEntries.filter((e) =>
      isSameCalendarDay(e.dateStr || e.timestamp, rec.dateStr)
    );
    const withdrawalsFromEntries = dayEntries
      .filter((e) => e.type === 'withdrawal' || e.type === 'buyer_advance_refund')
      .reduce((sum, e) => sum + e.amount, 0);
    if (withdrawalsFromEntries > 0) return withdrawalsFromEntries;
    return rec.totalWithdrawals || 0;
  };

  const getDayReceiptsTotal = (dateStr: string) => {
    const dayEntries = cashEntries.filter((e) =>
      isSameCalendarDay(e.dateStr || e.timestamp, dateStr)
    );
    const dayTransactions = transactions.filter((t) =>
      isSameCalendarDay(t.dateStr || t.timestamp, dateStr)
    );

    const dayBuyerRepaymentsByTrx = new Map<string, number>();
    dayEntries.forEach((e) => {
      if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
        const txId = e.transactionId || e.referenceId;
        if (txId) dayBuyerRepaymentsByTrx.set(txId, (dayBuyerRepaymentsByTrx.get(txId) || 0) + e.amount);
      }
    });

    let posReceiptsTotal = 0;
    dayTransactions.forEach((t) => {
      if (isTransactionResold(t)) return;
      let cashFromBuyer = 0;
      if (t.settlementType === 'direct_cash') {
        cashFromBuyer = t.harajProfit || 0;
      } else if (t.settlementType === 'association_cash') {
        cashFromBuyer = t.totalFromBuyer || 0;
      } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
        cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
      } else if (typeof t.paidAtPosBuyerAmount === 'number' && t.paidAtPosBuyerAmount > 0) {
        cashFromBuyer = t.paidAtPosBuyerAmount;
      } else if (typeof t.buyerPaidAmount === 'number' && t.buyerPaidAmount > 0) {
        cashFromBuyer = t.buyerPaidAmount;
      } else if (t.paymentStatus === 'paid') {
        cashFromBuyer = t.totalFromBuyer || 0;
      }

      if (t.isResale && cashFromBuyer > 0) {
        const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
        const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
        cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
      }
      const linkedRepaidTotal = dayBuyerRepaymentsByTrx.get(t.id) || 0;
      const targetPaidReceipts = typeof t.buyerPaidAmount === 'number' ? t.buyerPaidAmount : (t.settlementType === 'association_cash' ? (t.totalFromBuyer || 0) : (t.paidAtPosBuyerAmount || 0));
      const maxPosAllowedReceipts = Math.max(0, targetPaidReceipts - linkedRepaidTotal);
      cashFromBuyer = Math.min(cashFromBuyer, maxPosAllowedReceipts);
      posReceiptsTotal += cashFromBuyer;
    });

    const debtRepaymentsTotal = dayEntries
      .filter((e) => e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment')
      .reduce((sum, e) => sum + e.amount, 0);

    const depositsTotal = dayEntries
      .filter((e) => (e.type === 'deposit' || e.type === 'buyer_advance_deposit') && e.category !== 'إيداع فائض مقاصة بيعات')
      .reduce((sum, e) => sum + e.amount, 0);

    return posReceiptsTotal + debtRepaymentsTotal + depositsTotal;
  };

  // -------------------------------------------------------------
  // DRILLDOWN BREAKDOWN COMPUTATION FOR SELECTED DAY & TYPE
  // -------------------------------------------------------------
  const drilldownData = useMemo(() => {
    if (!drilldownModal) return null;
    const targetDate = drilldownModal.dateStr;

    const dayEntries = cashEntries.filter((e) =>
      isSameCalendarDay(e.dateStr || e.timestamp, targetDate)
    );
    const dayTransactions = transactions.filter((t) =>
      isSameCalendarDay(t.dateStr || t.timestamp, targetDate)
    );

    if (drilldownModal.type === 'receipts') {
      // 1. Direct Haraj Cash Sales collected from Buyers
      const posReceipts: {
        id: string;
        source: string;
        party: string;
        ref: string;
        description: string;
        method: string;
        time: string;
        amount: number;
      }[] = [];

      dayTransactions.forEach((t) => {
        if (isTransactionResold(t)) return;
        let cashFromBuyer = 0;
        if (t.settlementType === 'direct_cash') {
          cashFromBuyer = t.harajProfit || 0;
        } else if (t.settlementType === 'association_cash') {
          cashFromBuyer = t.totalFromBuyer || 0;
        } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
          cashFromBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
        } else if (typeof t.paidAtPosBuyerAmount === 'number' && t.paidAtPosBuyerAmount > 0) {
          cashFromBuyer = t.paidAtPosBuyerAmount;
        } else if (typeof t.buyerPaidAmount === 'number' && t.buyerPaidAmount > 0) {
          cashFromBuyer = t.buyerPaidAmount;
        } else if (t.paymentStatus === 'paid') {
          cashFromBuyer = t.totalFromBuyer || 0;
        }

        if (t.isResale && cashFromBuyer > 0) {
          const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
          const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
          cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
        }

        if (cashFromBuyer > 0) {
          const itemsDesc = t.items.map((i) => `${i.fishName} (${i.quantity} ${i.unit})`).join('، ');
          posReceipts.push({
            id: t.id,
            source: 'مبيعات حراج نقدية',
            party: t.buyerName || 'مشتري حراج',
            ref: t.id,
            description: itemsDesc || 'فاتورة بيع حراج نقدية',
            method: 'نقداً عند البيع',
            time: t.timeStr || '',
            amount: cashFromBuyer,
          });
        }
      });

      // 2. Buyer debt repayments
      const debtRepayments = dayEntries
        .filter((e) => e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment')
        .map((e) => ({
          id: e.id,
          source: 'سداد دين مشتري',
          party: e.contactName || 'مشتري',
          ref: e.referenceId || e.transactionId || 'سند سداد',
          description: e.description || e.category,
          method:
            e.repaymentMethod === 'exchange' || e.category === 'سداد دين عبر الصرافة'
              ? 'عبر الصرافة'
              : 'نقداً بالصندوق',
          time: e.timeStr || '',
          amount: e.amount,
        }));

      // 3. Cash deposits & buyer advance deposits
      const deposits = dayEntries
        .filter((e) => (e.type === 'deposit' || e.type === 'buyer_advance_deposit') && e.category !== 'إيداع فائض مقاصة بيعات')
        .map((e) => ({
          id: e.id,
          source: e.type === 'buyer_advance_deposit' ? 'إيداع رصيد قدمة مشتري' : 'إيداع وتغذية صندوق',
          party: e.contactName || 'الصندوق',
          ref: e.referenceId || 'سند إيداع',
          description: e.description || e.category,
          method: 'نقداً بالصندوق',
          time: e.timeStr || '',
          amount: e.amount,
        }));

      const allItems = [...posReceipts, ...debtRepayments, ...deposits];
      const total = allItems.reduce((sum, item) => sum + item.amount, 0);

      return {
        title: 'تفاصيل المقبوضات النقدية والإيداعات',
        items: allItems,
        total,
      };
    } else if (drilldownModal.type === 'seller_payouts') {
      // 1. Paid to Fishermen from transactions
      const countedDrilldownTrxIds = new Set<string>();
      dayEntries.forEach((e) => {
        if (e.type === 'seller_payout') {
          if (e.transactionId) countedDrilldownTrxIds.add(e.transactionId);
          if (e.referenceId) countedDrilldownTrxIds.add(e.referenceId);
          if (e.description) {
            const match = e.description.match(/TRX-\d{4}-\d{4}/);
            if (match) countedDrilldownTrxIds.add(match[0]);
          }
        }
      });

      const posPayouts: {
        id: string;
        sellerName: string;
        ref: string;
        details: string;
        payoutMethod: string;
        status: string;
        netDue: number;
        paidAmount: number;
        time: string;
      }[] = [];

      dayTransactions.forEach((t) => {
        if (countedDrilldownTrxIds.has(t.id)) return;

        const isSellerExchange =
          t.sellerPayoutMethod === 'exchange' ||
          (t.notes && t.notes.includes('عبر الصرافة')) ||
          Boolean(t.sellerExchangeName);

        const paidToSeller =
          t.settlementType === 'direct_cash' || isSellerExchange
            ? 0
            : t.sellerPaidStatus === 'unpaid'
            ? 0
            : typeof t.paidAtPosAmount === 'number'
            ? t.paidAtPosAmount
            : typeof t.sellerPaidAmount === 'number'
            ? t.sellerPaidAmount
            : t.sellerPaidStatus === 'paid' || (!t.sellerPaidStatus && t.paymentStatus === 'paid')
            ? t.netToSeller
            : 0;

        if (paidToSeller > 0) {
          const itemsDesc = t.items.map((i) => `${i.fishName} (${i.quantity} ${i.unit})`).join('، ');
          posPayouts.push({
            id: t.id,
            sellerName: t.sellerName || 'صياد غير محدد',
            ref: t.id,
            details: itemsDesc || 'صافي مبيعات شروة الحراج',
            payoutMethod: 'نقداً من الدرج (عند البيع)',
            status: t.sellerPaidStatus === 'paid' ? 'مسلم بالكامل ✓' : 'دفعة نقدية مسلّمة',
            netDue: t.netToSeller || paidToSeller,
            paidAmount: paidToSeller,
            time: t.timeStr || '',
          });
        }
      });

      // 2. Manual cash entry seller payouts
      const manualPayouts = dayEntries
        .filter((e) => e.type === 'seller_payout')
        .map((e) => {
          const isExchange =
            e.category === 'تسليم مستحقات عبر الصرافة' ||
            e.payoutMethod === 'exchange' ||
            (e.description && e.description.includes('عبر الصرافة'));
          return {
            id: e.id,
            sellerName: e.contactName || 'صياد',
            ref: e.referenceId || e.transactionId || 'سند صرف',
            details: e.description || e.category,
            payoutMethod: isExchange ? 'عبر الصرافة' : 'نقداً من الدرج (سند صرف)',
            status: 'سند تسليم مستحقات',
            netDue: e.amount,
            paidAmount: e.amount,
            time: e.timeStr || '',
          };
        });

      // 3. Seller Advances
      const advances = dayEntries
        .filter((e) => e.type === 'seller_advance')
        .map((e) => ({
          id: e.id,
          sellerName: e.contactName || 'صياد',
          ref: e.referenceId || 'سند سلفة',
          details: e.description || 'سلفة نقدية ممنوحة للصياد',
          payoutMethod: 'نقداً من الدرج',
          status: 'سلفة صياد',
          netDue: e.amount,
          paidAmount: e.amount,
          time: e.timeStr || '',
        }));

      const allItems = [...posPayouts, ...manualPayouts, ...advances];
      const total = allItems.reduce((sum, item) => sum + item.paidAmount, 0);

      return {
        title: 'تفاصيل صافي مستحقات الصيادين المسلّمة',
        items: allItems,
        total,
      };
    } else {
      // Expenses
      const expensesList = dayEntries
        .filter((e) => e.type === 'expense')
        .map((e) => ({
          id: e.id,
          category: e.category || 'مصروف عام',
          description: e.description || 'مصروف تشغيلي',
          performedBy: e.performedBy || 'أمين الصندوق',
          time: e.timeStr || '',
          amount: e.amount,
        }));

      const total = expensesList.reduce((sum, item) => sum + item.amount, 0);

      return {
        title: 'تفاصيل المصروفات والنثريات التشغيلية',
        items: expensesList,
        total,
      };
    }
  }, [drilldownModal, cashEntries, transactions]);

  return (
    <div className="space-y-6">

      {/* ------------------------------------------------------------- */}
      {/* DAILY DRILLDOWN BREAKDOWN MODAL (تفاصيل المقبوضات / صرف الصيادين / المصروفات) */}
      {/* ------------------------------------------------------------- */}
      {drilldownModal && drilldownData && typeof document !== 'undefined' && createPortal(
        <div id="daily-drilldown-print-modal" className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="bg-white rounded-none max-w-4xl w-full p-6 sm:p-7 shadow-xl border border-slate-100 flex flex-col max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:max-w-none print:p-0 printable-inventory-area">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-300 no-print">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-none ${
                    drilldownModal.type === 'receipts'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : drilldownModal.type === 'seller_payouts'
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                >
                  {drilldownModal.type === 'receipts' ? (
                    <ArrowDownLeft className="w-6 h-6" />
                  ) : drilldownModal.type === 'seller_payouts' ? (
                    <Coins className="w-6 h-6" />
                  ) : (
                    <ArrowUpRight className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-950 text-base sm:text-lg">
                    {drilldownData.title}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{drilldownModal.dayName}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportDrilldownToExcel(drilldownData, drilldownModal.type, drilldownModal.dayName, settings)}
                  className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs"
                  title="تصدير هذا الكشف إلى ملف Excel منظم واحترافي"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير Excel منظم</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingDrilldownPdf}
                  onClick={async () => {
                    if (!drilldownData || !drilldownModal) return;
                    setIsExportingDrilldownPdf(true);
                    try {
                      await exportDrilldownToPdfA4(drilldownData, drilldownModal.type, drilldownModal.dayName, settings);
                    } catch (err) {
                      console.error('Failed to export drilldown PDF:', err);
                      alert('حدث خطأ أثناء تصدير ملف PDF، يمكنك استخدام زر الطباعة');
                    } finally {
                      setIsExportingDrilldownPdf(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                  title="تحميل وتصدير هذا الكشف كملف PDF رسمي بحجم A4"
                >
                  {isExportingDrilldownPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isExportingDrilldownPdf ? 'جاري التحميل...' : 'تحميل'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="طباعة هذا الكشف"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrilldownModal(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Header & Logo (Only visible when printing) */}
            <div className="hidden print:block text-center pb-3 mb-3 border-b-2 border-slate-900 space-y-1">
              <img src="/logo.png" alt="شعار الحراج" className="h-28 w-auto object-contain mx-auto mb-1" />
              <h2 className="text-base font-black text-slate-950">{settings.marketName}</h2>
              <p className="text-slate-700 text-xs font-medium">{settings.subTitle}</p>
              <div className="inline-block px-4 py-1 rounded-none bg-slate-100 text-slate-950 font-black text-xs mt-1 border border-slate-400">
                {drilldownData.title} - {drilldownModal.dayName}
              </div>
            </div>

            {/* Summary KPI Banner */}
            <div className="mt-4 mb-4 p-3.5 rounded-none border flex flex-wrap items-center justify-between gap-4 bg-slate-50 border-slate-300 print:bg-white print:border-slate-800 print:py-2 print:my-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-slate-500 shrink-0 no-print" />
                <span className="text-xs font-bold text-slate-700 print:text-black">
                  {drilldownModal.type === 'receipts'
                    ? 'إجمالي المبالغ المقبوضة التي دخلت الصندوق لليوم المحدد:'
                    : drilldownModal.type === 'seller_payouts'
                    ? 'إجمالي صافي مستحقات الصيادين المسلّمة نقداً لليوم المحدد:'
                    : 'إجمالي المصروفات والنثريات المنصرفة لليوم المحدد:'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 print:text-black font-medium">
                  {drilldownData.items.length} {drilldownModal.type === 'seller_payouts' ? 'صياد / حركة' : 'عملية'}
                </span>
                <span
                  className={`text-lg font-black font-mono px-3 py-1 rounded-none print:text-black print:border print:border-black print:bg-white ${
                    drilldownModal.type === 'receipts'
                      ? 'bg-blue-50 text-blue-900 border border-blue-300'
                      : drilldownModal.type === 'seller_payouts'
                      ? 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}
                >
                  {drilldownModal.type === 'receipts' ? '+' : '-'}
                  {formatCurrency(drilldownData.total, '')}
                </span>
              </div>
            </div>

            {/* Details Table - Strict percentage column widths prevents clipping on paper */}
            <div className="overflow-x-auto border border-slate-300 rounded-none print:border-slate-800 print:rounded-none">
              <table className="w-full text-right text-xs table-fixed">
                <colgroup>
                  {drilldownModal.type === 'receipts' ? (
                    <>
                      <col className="w-[6%]" />
                      <col className="w-[18%]" />
                      <col className="w-[20%]" />
                      <col className="w-[14%]" />
                      <col className="w-[22%]" />
                      <col className="w-[8%]" />
                      <col className="w-[12%]" />
                    </>
                  ) : drilldownModal.type === 'seller_payouts' ? (
                    <>
                      <col className="w-[5%]" />
                      <col className="w-[18%]" />
                      <col className="w-[12%]" />
                      <col className="w-[21%]" />
                      <col className="w-[21%]" />
                      <col className="w-[8%]" />
                      <col className="w-[15%]" />
                    </>
                  ) : (
                    <>
                      <col className="w-[6%]" />
                      <col className="w-[20%]" />
                      <col className="w-[38%]" />
                      <col className="w-[16%]" />
                      <col className="w-[8%]" />
                      <col className="w-[12%]" />
                    </>
                  )}
                </colgroup>
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 print:bg-slate-200 print:text-black print:border-black">
                  {drilldownModal.type === 'receipts' ? (
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5">نوع المقبوضات</th>
                      <th className="p-2.5">الجهة / المشتري</th>
                      <th className="p-2.5 text-center">رقم السند</th>
                      <th className="p-2.5">البيان والشرح</th>
                      <th className="p-2.5 text-center">الوقت</th>
                      <th className="p-2.5 text-center text-blue-800 print:text-black font-black">المبلغ</th>
                    </tr>
                  ) : drilldownModal.type === 'seller_payouts' ? (
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5">اسم الصياد / البائع</th>
                      <th className="p-2.5 text-center">رقم الفاتورة</th>
                      <th className="p-2.5">تفاصيل الصيد والشروة</th>
                      <th className="p-2.5 text-center">طريقة الصرف</th>
                      <th className="p-2.5 text-center">الوقت</th>
                      <th className="p-2.5 text-center text-indigo-800 print:text-black font-black">المبلغ المسلّم</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="p-2.5 text-center">#</th>
                      <th className="p-2.5">تصنيف المصروف</th>
                      <th className="p-2.5">البيان والشرح التفصيلي</th>
                      <th className="p-2.5 text-center">المسؤول عن الصرف</th>
                      <th className="p-2.5 text-center">الوقت</th>
                      <th className="p-2.5 text-center text-rose-800 print:text-black font-black">المبلغ المنصرف</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-slate-800">
                  {drilldownData.items.length === 0 ? (
                    <tr>
                      <td colSpan={drilldownModal.type === 'expenses' ? 6 : 7} className="p-8 text-center text-slate-400 font-bold">
                        لا توجد حركات مسجلة في هذا اليوم ضمن هذا البند.
                      </td>
                    </tr>
                  ) : drilldownModal.type === 'receipts' ? (
                    (drilldownData.items as {
                      id: string;
                      source: string;
                      party: string;
                      ref: string;
                      description: string;
                      method: string;
                      time: string;
                      amount: number;
                    }[]).map((item, idx) => (
                      <tr key={item.id + idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2 text-center text-slate-400 print:text-black font-mono text-xs">{idx + 1}</td>
                        <td className="p-2 font-bold text-slate-900 print:text-black">
                          <span className="px-1.5 py-0.5 rounded-none bg-blue-50 text-blue-800 border border-blue-300 print:border-slate-800 print:bg-transparent print:text-black text-[11px]">
                            {item.source}
                          </span>
                        </td>
                        <td className="p-2 font-black text-slate-900 print:text-black break-words">{item.party}</td>
                        <td className="p-2 text-center font-mono text-slate-600 print:text-black text-[11px] whitespace-nowrap">
                          {item.ref}
                        </td>
                        <td className="p-2 text-slate-600 print:text-black break-words">{item.description}</td>
                        <td className="p-2 text-center font-mono text-slate-400 print:text-black text-[11px] whitespace-nowrap">
                          {item.time || '—'}
                        </td>
                        <td className="p-2 text-center font-mono font-black text-blue-700 print:text-black whitespace-nowrap bg-blue-50/30 print:bg-transparent">
                          +{formatCurrency(item.amount, '')}
                        </td>
                      </tr>
                    ))
                  ) : drilldownModal.type === 'seller_payouts' ? (
                    (drilldownData.items as {
                      id: string;
                      sellerName: string;
                      ref: string;
                      details: string;
                      payoutMethod: string;
                      status: string;
                      netDue: number;
                      paidAmount: number;
                      time: string;
                    }[]).map((item, idx) => (
                      <tr key={item.id + idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2 text-center text-slate-400 print:text-black font-mono text-xs">{idx + 1}</td>
                        <td className="p-2 font-black text-slate-900 print:text-black break-words">
                          {item.sellerName}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-600 print:text-black text-[11px] whitespace-nowrap">
                          {item.ref}
                        </td>
                        <td className="p-2 text-slate-600 print:text-black break-words text-[11px]">{item.details}</td>
                        <td className="p-2 text-center print:text-black">
                          <div className="text-[11px] font-bold text-slate-800 print:text-black">
                            {item.status}
                          </div>
                          <div className="text-[10px] text-slate-500 print:text-slate-600 font-normal mt-0.5">
                            ({item.payoutMethod})
                          </div>
                        </td>
                        <td className="p-2 text-center font-mono text-slate-400 print:text-black text-[11px] whitespace-nowrap">
                          {item.time || '—'}
                        </td>
                        <td className="p-2 text-center font-mono font-black text-indigo-700 print:text-black whitespace-nowrap bg-indigo-50/30 print:bg-transparent">
                          -{formatCurrency(item.paidAmount, '')}
                        </td>
                      </tr>
                    ))
                  ) : (
                    (drilldownData.items as {
                      id: string;
                      category: string;
                      description: string;
                      performedBy: string;
                      time: string;
                      amount: number;
                    }[]).map((item, idx) => (
                      <tr key={item.id + idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2 text-center text-slate-400 print:text-black font-mono text-xs">{idx + 1}</td>
                        <td className="p-2 font-bold text-slate-900 print:text-black">
                          <span className="px-1.5 py-0.5 rounded-none bg-rose-50 text-rose-800 border border-rose-200 print:border-slate-800 print:bg-transparent print:text-black text-[11px]">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-2 text-slate-600 print:text-black break-words">{item.description}</td>
                        <td className="p-2 text-center text-slate-700 print:text-black font-bold break-words text-[11px]">
                          {item.performedBy}
                        </td>
                        <td className="p-2 text-center font-mono text-slate-400 print:text-black text-[11px] whitespace-nowrap">
                          {item.time || '—'}
                        </td>
                        <td className="p-2 text-center font-mono font-black text-rose-700 print:text-black whitespace-nowrap bg-rose-50/30 print:bg-transparent">
                          -{formatCurrency(item.amount, '')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {drilldownData.items.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300 print:border-slate-800 font-bold">
                    <tr>
                      <td colSpan={drilldownModal.type === 'expenses' ? 5 : 6} className="p-2.5 text-slate-900 print:text-black font-black">
                        الإجمالي الكلي:
                      </td>
                      <td
                        className={`p-2.5 text-center font-mono font-black text-xs sm:text-sm whitespace-nowrap print:text-black print:bg-transparent ${
                          drilldownModal.type === 'receipts'
                            ? 'text-blue-900 bg-blue-100/50'
                            : drilldownModal.type === 'seller_payouts'
                            ? 'text-indigo-900 bg-indigo-100/50'
                            : 'text-rose-900 bg-rose-100/50'
                        }`}
                      >
                        {drilldownModal.type === 'receipts' ? '+' : '-'}
                        {formatCurrency(drilldownData.total, '')}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-100 no-print">
              <button
                type="button"
                onClick={() => setDrilldownModal(null)}
                className="px-5 py-2.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-colors"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ------------------------------------------------------------- */}
      {/* RECONCILE / AUDIT MODAL (معاينة وإدخال الكاش الفعلي المعدود) */}
      {/* ------------------------------------------------------------- */}
      {reconcileModalRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-none max-w-3xl sm:max-w-4xl w-full p-5 sm:p-6 shadow-xl border border-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-300 shrink-0">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2.5 rounded-none ${
                    reconcileModalRecord.reconciliationStatus === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base sm:text-lg">
                    {reconcileModalRecord.reconciliationStatus === 'pending'
                      ? 'معاينة وإدخال الكاش الفعلي المعدود'
                      : 'تعديل ومعاينة الكاش الفعلي المسجل'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    جرد {formatArabicDayOnly(reconcileModalRecord.dateStr, reconcileModalRecord.timestamp)} ({reconcileModalRecord.dateStr})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReconcileModalRecord(null)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmReconcile} className="mt-4 flex flex-col flex-1 min-h-0">
              {/* Scrollable 2-Column Body */}
              <div className="overflow-y-auto pr-1 flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* Right Column: Financial Breakdown & System Notice */}
                  <div className="space-y-3">
                    {/* Pending Notice if Auto-Closed */}
                    {reconcileModalRecord.reconciliationStatus === 'pending' && (
                      <div className="p-3 bg-amber-50 rounded-none border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5 shadow-2xs">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-black block text-amber-950">إقفال آلي بواسطة النظام (لم تتم المعاينة بعد):</span>
                          <p className="text-amber-800 font-normal leading-relaxed mt-0.5 text-[11px]">
                            قام النظام بأرشفة العمليات الحسابية تلقائياً لانتهاء اليوم دون إقفال يدوي. قم بعد نقدية الدرج وأدخل المبلغ الفعلي للمطابقة واعتماد الجرد بدقة.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Financial Summary of Target Day */}
                    <div className="bg-slate-50 rounded-none p-3.5 border border-slate-300/80 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-blue-700 font-sans">
                        <span>+ العهدة الجديدة المضافة (اليوم):</span>
                        <span className="font-mono font-bold">
                          +{formatCurrency(reconcileModalRecord.newCustodyAmount ?? 0, '')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-blue-800 bg-blue-50/70 p-1.5 rounded-none font-bold font-sans">
                        <span>+ الإيداعات الإضافية:</span>
                        <span className="font-mono font-black">
                          +{formatCurrency(reconcileModalRecord.totalDeposits ?? 0, '')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-teal-700 font-sans">
                        <span>+ مقبوضات الحراج وسداد الديون:</span>
                        <span className="font-mono font-bold">
                          +{formatCurrency(
                            (reconcileModalRecord.harajCashSales || 0) + (reconcileModalRecord.buyerDebtRepayments || 0),
                            settings.currency
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-indigo-700 font-sans">
                        <span>- تسليم مستحقات الصيادين:</span>
                        <span className="font-mono font-bold">
                          -{formatCurrency(reconcileModalRecord.harajSellerPayouts || 0, '')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-rose-700 font-sans">
                        <span>- المصروفات والنثريات:</span>
                        <span className="font-mono font-bold">
                          -{formatCurrency(reconcileModalRecord.totalExpenses || 0, '')}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-300 flex justify-between items-center font-black text-slate-900 text-sm font-sans">
                        <span>الرصيد الدفتري المتوقع بالدرج:</span>
                        <span className="font-mono text-emerald-800 text-base font-black">
                          {formatCurrency(reconcileModalRecord.systemCalculatedBalance, '')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Left Column: Counted Input, Difference Badge, Officers, Notes */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-black text-slate-900">
                          الرصيد الفعلي المعدود بالدرج ({settings.currency}):
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setReconcileActualCounted(reconcileModalRecord.systemCalculatedBalance)
                          }
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                        >
                          مطابق للمتوقع ({formatCurrency(reconcileModalRecord.systemCalculatedBalance, '')})
                        </button>
                      </div>
                      <input
                        type="number"
                        autoFocus
                        required
                        min="0"
                        step="any"
                        value={reconcileActualCounted}
                        onChange={(e) =>
                          setReconcileActualCounted(e.target.value === '' ? '' : parseFloat(e.target.value))
                        }
                        placeholder="أدخل المبلغ الفعلي المعدود يدوياً بالريال"
                        className="w-full px-4 py-2.5 rounded-none border-2 border-emerald-500/50 bg-white text-base font-black font-mono text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-500/20 shadow-xs"
                      />
                    </div>

                    {/* Live Difference Badge */}
                    {reconcileActualCounted !== '' && (
                      <div
                        className={`p-2.5 rounded-none border text-xs flex items-center justify-between font-bold ${
                          Number(reconcileActualCounted) === reconcileModalRecord.systemCalculatedBalance
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            : Number(reconcileActualCounted) > reconcileModalRecord.systemCalculatedBalance
                            ? 'bg-blue-50 border-blue-300 text-blue-900'
                            : 'bg-rose-50 border-rose-300 text-rose-900'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {Number(reconcileActualCounted) === reconcileModalRecord.systemCalculatedBalance ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          )}
                          <span className="text-[11px]">
                            {Number(reconcileActualCounted) === reconcileModalRecord.systemCalculatedBalance
                              ? 'الرصيد الفعلي مطابق تماماً للرصيد الدفتري (0)'
                              : Number(reconcileActualCounted) > reconcileModalRecord.systemCalculatedBalance
                              ? 'يوجد فائض في الدرج'
                              : 'يوجد عجز في الدرج'}
                          </span>
                        </div>
                        <span className="font-mono font-black text-sm">
                          {Number(reconcileActualCounted) === reconcileModalRecord.systemCalculatedBalance
                            ? '✓ مطابق'
                            : Number(reconcileActualCounted) > reconcileModalRecord.systemCalculatedBalance
                            ? `+${formatCurrency(
                                Number(reconcileActualCounted) - reconcileModalRecord.systemCalculatedBalance,
                                settings.currency
                              )}`
                            : `-${formatCurrency(
                                Math.abs(Number(reconcileActualCounted) - reconcileModalRecord.systemCalculatedBalance),
                                settings.currency
                              )}`}
                        </span>
                      </div>
                    )}

                    {/* Personnel Names */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          أمين الصندوق (القائم بالمعاينة):
                        </label>
                        <input
                          type="text"
                          required
                          value={reconcileOfficer}
                          onChange={(e) => setReconcileOfficer(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          المشرف المالي المعتمد:
                        </label>
                        <input
                          type="text"
                          required
                          value={reconcileSupervisor}
                          onChange={(e) => setReconcileSupervisor(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        ملاحظات المعاينة والجرد:
                      </label>
                      <textarea
                        rows={2}
                        value={reconcileNotes}
                        onChange={(e) => setReconcileNotes(e.target.value)}
                        placeholder="ملاحظات توضيحية عن النقدية أو أسباب الفارق إن وجد..."
                        className="w-full px-2.5 py-1.5 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500/30 resize-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Fixed & Visible Footer */}
              <div className="flex items-center justify-end gap-3 pt-3.5 mt-3 border-t border-slate-300 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setReconcileModalRecord(null)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReconcile}
                  className="px-6 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs shadow-emerald-600/20 cursor-pointer disabled:opacity-50 transition-all active:scale-95"
                >
                  <Check className="w-4 h-4" />
                  <span>اعتماد ومطابقة الجرد نهائياً</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRINTABLE DAILY CLOSING REPORT OVERLAY */}
      {/* ------------------------------------------------------------- */}
      {selectedClosingForPrint && typeof document !== 'undefined' && createPortal(
        <div id="daily-inventory-print-modal" className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="bg-white rounded-none max-w-4xl w-full p-6 sm:p-8 shadow-xl border border-slate-300 flex flex-col max-h-[95vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:max-w-none print:p-0 printable-statement-area font-['Cairo',system-ui,sans-serif]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-300 no-print">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>محضر الجرد اليومي الرسمي</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportDailyClosingToExcel(selectedClosingForPrint, settings)}
                  className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  title="تصدير محضر الجرد اليومي إلى ملف Excel منظم واحترافي"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير Excel منظم</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingClosingPdf}
                  onClick={async () => {
                    if (!selectedClosingForPrint) return;
                    setIsExportingClosingPdf(true);
                    try {
                      await exportDailyClosingToPdfA4(selectedClosingForPrint, settings);
                    } catch (err) {
                      console.error('Failed to export closing PDF:', err);
                      alert('حدث خطأ أثناء تصدير ملف PDF، يمكنك استخدام زر الطباعة');
                    } finally {
                      setIsExportingClosingPdf(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                  title="تحميل وتصدير محضر الجرد اليومي كملف PDF رسمي بحجم A4"
                >
                  {isExportingClosingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isExportingClosingPdf ? 'جاري التحميل...' : 'تحميل'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-none bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer hover:bg-blue-700"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClosingForPrint(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Report Voucher Layout */}
            <div className="py-2 space-y-4 text-xs font-sans print:py-0 print:space-y-3">
              {/* Header 3-columns */}
              <div className="border-b-2 border-slate-900 pb-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  {/* Right: Arabic Info */}
                  <div className="text-right leading-tight min-w-0">
                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                      {settings.marketName || 'سوق عين بامعبد المركزي'}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-1 whitespace-nowrap">
                      {(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                      {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}{settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}
                    </p>
                  </div>

                  {/* Center: Fixed Size Logo */}
                  <div className="text-center flex flex-col items-center justify-center px-2">
                    <img
                      src="/logo.png"
                      alt="شعار السوق"
                      className="w-[115px] h-[115px] min-w-[115px] min-h-[115px] max-w-[115px] max-h-[115px] object-contain block mx-auto drop-shadow-xs print:w-[115px] print:h-[115px]"
                      style={{ width: '115px', height: '115px' }}
                    />
                    <div className="mt-1 text-sm sm:text-base font-black text-slate-900 text-center tracking-tight whitespace-nowrap">
                      محضر جرد وإقفال اليوم
                    </div>
                  </div>

                  {/* Left: Meta Box */}
                  <div className="text-left font-mono text-xs" dir="ltr">
                    <div className="inline-block text-center min-w-[165px] p-2 bg-slate-50 border-2 border-slate-900 rounded-none">
                      <span className="text-[11px] font-extrabold text-blue-700 block text-right font-sans mb-0.5" dir="rtl">
                        سند إقفال الصندوق اليومي
                      </span>
                      <span className="text-sm font-black text-slate-900 font-mono block">
                        CLS-{(selectedClosingForPrint.dateStr || '').replace(/-/g, '')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1.5 font-mono text-left space-y-0.5" dir="rtl">
                      <div>تاريخ الجرد: <b className="text-slate-900">{selectedClosingForPrint.dateStr}</b></div>
                      <div>وقت الإقفال: <b className="text-slate-900">{selectedClosingForPrint.timeStr || ''}</b></div>
                      <div>أمين الصندوق: <b className="text-slate-900">{selectedClosingForPrint.closedBy || 'أمين الصندوق'}</b></div>
                    </div>
                  </div>
                </div>
              </div>

              {selectedClosingForPrint.reconciliationStatus === 'pending' && (
                <div className="p-2.5 bg-amber-50 rounded-none border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 no-print">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>⚠️ مسودة إقفال آلي بواسطة النظام — لم يتم المعاينة والجرد الفعلي للنقدية بعد</span>
                </div>
              )}

              {/* Table of Daily Financial Movement */}
              <div className="overflow-x-auto border border-slate-300 rounded-none">
                <table className="w-full text-right text-xs">
                  <thead className="text-white font-bold" style={{ backgroundColor: '#0369a1' }}>
                    <tr style={{ backgroundColor: '#0369a1' }}>
                      <th className="py-2.5 px-3 font-black text-white" style={{ backgroundColor: '#0369a1' }}>بيان الحركة المالية بالصندوق</th>
                      <th className="py-2.5 px-3 text-center w-52 font-black text-white" style={{ backgroundColor: '#0369a1' }}>المبلغ ({settings.currency})</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr className="bg-white">
                      <td className="py-2 px-3 font-bold text-slate-800">العهدة الجديدة المضافة اليوم</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-slate-800">
                        {formatCurrency(selectedClosingForPrint.newCustodyAmount ?? 0, '')}
                      </td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-blue-700">+ إجمالي الإيداعات والتغذية النقدية</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-blue-700">
                        +{formatCurrency(selectedClosingForPrint.totalDeposits ?? 0, '')}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="py-2 px-3 font-bold text-emerald-700">+ تحصيلات ديون المشترين نقداً بالصندوق</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-emerald-700">
                        +{formatCurrency(selectedClosingForPrint.buyerDebtRepayments || 0, '')}
                      </td>
                    </tr>
                    {selectedClosingForPrint.harajCashSales !== undefined && selectedClosingForPrint.harajCashSales > 0 && (
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-3 font-bold text-teal-700">+ مبيعات الحراج النقدية المقبوضة (كاش فوري)</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-teal-700">
                          +{formatCurrency(selectedClosingForPrint.harajCashSales, '')}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-white">
                      <td className="py-2 px-3 font-bold text-indigo-700">- صافي مستحقات الصيادين المصروفة نقداً من الدرج</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-indigo-700">
                        -{formatCurrency(selectedClosingForPrint.harajSellerPayouts || 0, '')}
                      </td>
                    </tr>
                    <tr className="bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-rose-700">- إجمالي المصروفات والنثريات المنصرفة</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-rose-700">
                        -{formatCurrency(selectedClosingForPrint.totalExpenses, '')}
                      </td>
                    </tr>
                    {selectedClosingForPrint.associationProfits !== undefined && selectedClosingForPrint.associationProfits > 0 && (
                      <tr className="bg-white">
                        <td className="py-2 px-3 font-bold text-blue-900">• عمولات حراج اليوم 5% (للمعلومية فقط)</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-blue-900">
                          {formatCurrency(selectedClosingForPrint.associationProfits, '')}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-slate-50/70">
                      <td className="py-2 px-3 font-bold text-amber-700">- إجمالي السحوبات والتوريدات من الصندوق</td>
                      <td className="py-2 px-3 text-center font-mono font-black text-amber-700">
                        -{formatCurrency(selectedClosingForPrint.totalWithdrawals, '')}
                      </td>
                    </tr>
                  </tbody>
                  <tfoot className="border-t-2 border-slate-900 font-black">
                    <tr className="bg-slate-100">
                      <td className="py-2.5 px-3 text-slate-900 font-black">الرصيد المحسوب بالنظام (المتوقع بالدرج):</td>
                      <td className="py-2.5 px-3 text-center font-mono text-emerald-800 text-sm font-black bg-emerald-50">
                        {formatCurrency(selectedClosingForPrint.systemCalculatedBalance, '')}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="py-2.5 px-3 text-slate-900 font-black">الكاش الفعلي في الدرج (المعدود يدوياً):</td>
                      <td className="py-2.5 px-3 text-center font-mono text-blue-900 text-sm font-black bg-blue-50">
                        {selectedClosingForPrint.reconciliationStatus === 'pending'
                          ? 'بانتظار المعاينة'
                          : formatCurrency(selectedClosingForPrint.actualCountedCash, '')}
                      </td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-900 font-black">نتيجة المطابقة والفارق:</td>
                      <td className={`py-2.5 px-3 text-center font-mono font-black ${
                        selectedClosingForPrint.reconciliationStatus === 'pending'
                          ? 'text-amber-700'
                          : selectedClosingForPrint.difference === 0
                          ? 'text-emerald-700'
                          : selectedClosingForPrint.difference > 0
                          ? 'text-blue-700'
                          : 'text-rose-700'
                      }`}>
                        {selectedClosingForPrint.reconciliationStatus === 'pending'
                          ? 'لم يتم المعاينة بعد'
                          : selectedClosingForPrint.difference === 0
                          ? 'مطابق تماماً بدون أي فارق (0)'
                          : selectedClosingForPrint.difference > 0
                          ? `فائض: +${formatCurrency(selectedClosingForPrint.difference, '')}`
                          : `عجز: -${formatCurrency(Math.abs(selectedClosingForPrint.difference), '')}`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {selectedClosingForPrint.notes && (
                <div className="p-3 bg-slate-50 rounded-none border border-slate-300 text-xs">
                  <span className="font-bold text-slate-700 block mb-0.5">ملاحظات المحضر:</span>
                  <p className="text-slate-600 font-medium">{selectedClosingForPrint.notes}</p>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-300 rounded-none p-2.5 text-center">
                <div className="text-[11px] font-bold text-slate-500">الرصيد الفعلي المعتمد بالصندوق كتابةً:</div>
                <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5">
                  {selectedClosingForPrint.reconciliationStatus === 'pending'
                    ? 'بانتظار إتمام العد الفعلي'
                    : `فقط وقدره: ${tafqeet(selectedClosingForPrint.actualCountedCash, '').replace(/^فقط\s*/, '')}`}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs">
                <div>
                  <span className="text-slate-800 font-bold block mb-7">أمين الصندوق (المُسلّم):</span>
                  <div className="border-b border-dashed border-slate-400 mx-3"></div>
                </div>
                <div>
                  <span className="text-slate-800 font-bold block mb-7">المراجع المالي (المُدقق):</span>
                  <div className="border-b border-dashed border-slate-400 mx-3"></div>
                </div>
                <div>
                  <span className="text-slate-800 font-bold block mb-7">إدارة الحراج والاعتماد:</span>
                  <div className="border-b border-dashed border-slate-400 mx-3"></div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ------------------------------------------------------------- */}
      {/* PRINTABLE MONTHLY REPORT OVERLAY (محضر الجرد الشهري الرسمي للطباعة) */}
      {/* ------------------------------------------------------------- */}
      {showMonthlyPrintModal && typeof document !== 'undefined' && createPortal(
        <div id="monthly-inventory-print-modal" className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:bg-white print:fixed print:inset-0">
          <div className="bg-white rounded-none max-w-4xl w-full p-6 sm:p-8 shadow-xl border border-slate-100 flex flex-col max-h-[95vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:rounded-none print:w-full print:max-w-none print:p-0 printable-statement-area">
            <div className="flex items-center justify-between pb-4 border-b border-slate-300 no-print">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                <span>محضر الجرد والمطابقة الشهرية الرسمي</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportMonthlyInventoryToExcel(monthlyStats.dailyBreakdownRows, selectedYear, selectedMonth, settings)}
                  className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  title="تصدير كشف وسجل الشهر بالكامل إلى ملف Excel منظم واحترافي"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>تصدير Excel منظم</span>
                </button>
                <button
                  type="button"
                  disabled={isExportingMonthlyPdf}
                  onClick={async () => {
                    setIsExportingMonthlyPdf(true);
                    try {
                      await exportMonthlyClosingToPdfA4(
                        {
                          ...monthlyStats,
                          selectedYear,
                          selectedMonth,
                          monthBuyerDebtRepayments: 0,
                          monthHarajCashSales: 0,
                        },
                        settings
                      );
                    } catch (err) {
                      console.error('Failed to export monthly closing PDF:', err);
                      alert('حدث خطأ أثناء تصدير ملف PDF، يمكنك استخدام زر الطباعة');
                    } finally {
                      setIsExportingMonthlyPdf(false);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                  title="تحميل محضر إقفال الشهر بصيغة PDF رسمية مقاس A4"
                >
                  {isExportingMonthlyPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>{isExportingMonthlyPdf ? 'جاري التحميل...' : 'تحميل'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-none bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer hover:bg-indigo-700"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMonthlyPrintModal(false)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Document Content */}
            <div className="py-2 space-y-4 text-xs font-sans print:py-0 print:space-y-3">
              {/* Official 3-Column Header */}
              <div className="border-b-2 border-slate-900 pb-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  {/* Right Column: Market Details */}
                  <div className="text-right leading-tight min-w-0">
                    <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                      {settings.marketName || 'سوق عين بامعبد المركزي'}
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-1 whitespace-nowrap">
                      {(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                      {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}
                      {settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}
                    </p>
                  </div>

                  {/* Center Column: Dead-Centered Logo (115px) & Document Title */}
                  <div className="text-center flex flex-col items-center justify-center px-2">
                    <img
                      src="/logo.png"
                      alt="شعار السوق"
                      className="w-[115px] h-[115px] min-w-[115px] min-h-[115px] max-w-[115px] max-h-[115px] object-contain block mx-auto drop-shadow-xs print:w-[115px] print:h-[115px]"
                      style={{ width: '115px', height: '115px' }}
                    />
                    <div className="mt-1 text-sm sm:text-base font-black text-slate-900 text-center tracking-tight whitespace-nowrap">
                      محضر إقفال وجرد الحسابات الشهري
                    </div>
                  </div>

                  {/* Left Column: Metadata Box */}
                  <div className="text-left font-mono text-xs" dir="ltr">
                    <div className="inline-block text-center min-w-[165px] p-2 bg-slate-50 border-2 border-slate-900 rounded-none">
                      <span className="text-[11px] font-extrabold text-blue-700 block text-right font-sans mb-0.5" dir="rtl">
                        سند إقفال الحسابات الشهري
                      </span>
                      <span className="text-sm font-black text-slate-900 font-mono block">
                        MCLS-{selectedYear}{String(selectedMonth).padStart(2, '0')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1.5 font-mono text-left space-y-0.5" dir="rtl">
                      <div>
                        الشهر المحاسبي:{' '}
                        <b className="text-slate-900">
                          شهر {ARABIC_MONTHS[selectedMonth - 1]} {selectedYear}
                        </b>
                      </div>
                      <div>
                        تاريخ الاستخراج:{' '}
                        <b className="text-slate-900">
                          {todayGregorian} ({formatGregorianTime(new Date())})
                        </b>
                      </div>
                      <div>
                        حالة الأيام:{' '}
                        <b className="text-slate-900">
                          {monthlyStats.closedDaysCount} من {monthlyStats.daysInMonth} يوم مقفل
                        </b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* First Table: حركة السيولة والنقدية بالصندوق */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-1.5 h-3.5 bg-blue-600 rounded-xs"></div>
                  <h4 className="font-black text-slate-900 text-xs">
                    أولاً: حركة السيولة والنقدية بالصندوق (Cash & Liquidity Movement):
                  </h4>
                </div>
                <div className="overflow-x-auto border border-slate-300 rounded-none">
                  <table className="w-full text-right text-xs">
                    <thead className="text-white font-bold" style={{ backgroundColor: '#0284c7' }}>
                      <tr style={{ backgroundColor: '#0284c7' }}>
                        <th className="py-2.5 px-2 text-center w-10 font-black text-white" style={{ backgroundColor: '#0284c7' }}>م</th>
                        <th className="py-2.5 px-3 font-black text-white" style={{ backgroundColor: '#0284c7' }}>بيان الحركة المالية والسيولة بالصندوق</th>
                        <th className="py-2.5 px-3 font-black text-white" style={{ backgroundColor: '#0284c7' }}>التفاصيل والملاحظات المحاسبية</th>
                        <th className="py-2.5 px-3 text-center w-52 font-black text-white" style={{ backgroundColor: '#0284c7' }}>المبلغ ({settings.currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-2 text-center font-bold text-blue-500 font-mono">1</td>
                        <td className="py-2 px-3 font-bold text-blue-700">+ إجمالي العُهد الجديدة المضافة</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">مجموع عهد الجمعية المضافة خلال الشهر دون تكرار</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-blue-700">
                          +{formatCurrency(monthlyStats.totalNewCustody, '')}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-2 text-center font-bold text-emerald-500 font-mono">2</td>
                        <td className="py-2 px-3 font-bold text-emerald-700">+ إجمالي مقبوضات الشهر (Cash In)</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">النقد المحصل بالصندوق (تحصيلات ديون المشترين ومبيعات الحراج)</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-emerald-700">
                          +{formatCurrency(monthlyStats.totalCashIn, '')}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-2 text-center font-bold text-indigo-500 font-mono">3</td>
                        <td className="py-2 px-3 font-bold text-indigo-700">- صافي مستحقات الصيادين المصروفة نقداً</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">المبالغ النقدية المصروفة لمستحقات الصيادين من الدرج</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-indigo-700">
                          -{formatCurrency(monthlyStats.monthFishermanPayouts, '')}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-2 text-center font-bold text-rose-500 font-mono">4</td>
                        <td className="py-2 px-3 font-bold text-rose-700">- إجمالي المصروفات التشغيلية والنثريات</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">مصروفات ونثريات وتغذية وضيافة المكتب المعتمدة</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-rose-700">
                          -{formatCurrency(monthlyStats.totalExpenses, '')}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-2 text-center font-bold text-amber-500 font-mono">5</td>
                        <td className="py-2 px-3 font-bold text-amber-700">- إجمالي السحوبات والتوريدات من الصندوق</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">سحب نقدية أو توريد للمصرف / البنك</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-amber-700">
                          -{formatCurrency(monthlyStats.monthWithdrawals, '')}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="border-t-2 border-sky-600 font-black">
                      <tr className="bg-slate-100">
                        <td colSpan={3} className="py-2.5 px-3 text-slate-950 font-black">
                          الرصيد الفعلي المعتمد بنهاية الشهر (كاش الدرج والخزينة المتبقي):
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-800 text-sm font-black bg-emerald-50">
                          {formatCurrency(monthlyStats.endingActualCash, '')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Second Table: مؤشرات الأداء والعمولات والذمم المعلقة */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-1.5 h-3.5 bg-emerald-600 rounded-xs"></div>
                  <h4 className="font-black text-slate-900 text-xs">
                    ثانياً: مؤشرات الأداء والعمولات والذمم المعلقة (Financial Performance & Inflows):
                  </h4>
                </div>
                <div className="overflow-x-auto border border-slate-300 rounded-none">
                  <table className="w-full text-right text-xs">
                    <thead className="text-white font-bold" style={{ backgroundColor: '#059669' }}>
                      <tr style={{ backgroundColor: '#059669' }}>
                        <th className="py-2.5 px-2 text-center w-10 font-black text-white" style={{ backgroundColor: '#059669' }}>م</th>
                        <th className="py-2.5 px-3 font-black text-white" style={{ backgroundColor: '#059669' }}>المؤشر المالي والعمولات</th>
                        <th className="py-2.5 px-3 font-black text-white" style={{ backgroundColor: '#059669' }}>البيان والتوضيح المحاسبي</th>
                        <th className="py-2.5 px-3 text-center w-52 font-black text-white" style={{ backgroundColor: '#059669' }}>القيمة ({settings.currency})</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      <tr className="bg-white">
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono">1</td>
                        <td className="py-2 px-3 font-bold text-blue-900">أرباح وعمولات الجمعية (5%)</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">إجمالي عمولات الحراج المستقطعة بنسبة 5% لصالح الجمعية</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-blue-900">
                          {formatCurrency(monthlyStats.monthHarajProfit, '')}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono">2</td>
                        <td className={`py-2 px-3 font-bold ${monthlyStats.netHarajProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          صافي ربح الحراج للشهر
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">إيراد العمولات مطروحاً منه المصروفات التشغيلية والنثريات</td>
                        <td className={`py-2 px-3 text-center font-mono font-black ${monthlyStats.netHarajProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {monthlyStats.netHarajProfit > 0 ? '+' : ''}
                          {formatCurrency(monthlyStats.netHarajProfit, '')}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono">3</td>
                        <td className="py-2 px-3 font-bold text-amber-900">ديون المشترين المعلقة بنهاية الشهر</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">المتبقي بذمم المشترين بنهاية الشهر وغير محصلة بعد</td>
                        <td className="py-2 px-3 text-center font-mono font-black text-amber-950">
                          {formatCurrency(monthlyStats.outstandingBuyerDebt, '')}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/70">
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono">4</td>
                        <td className="py-2 px-3 font-bold text-slate-800">صافي الفروقات التراكمية للإغلاقات</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">
                          {monthlyStats.monthDifference === 0
                            ? 'مطابقة تامة لكافة الإغلاقات اليومية'
                            : monthlyStats.monthDifference > 0
                            ? 'فائض نقدي تراكمي'
                            : 'عجز نقدي تراكمي'}
                        </td>
                        <td className={`py-2 px-3 text-center font-mono font-black ${
                          monthlyStats.monthDifference === 0
                            ? 'text-emerald-700'
                            : monthlyStats.monthDifference > 0
                            ? 'text-blue-700'
                            : 'text-rose-700'
                        }`}>
                          {monthlyStats.monthDifference === 0
                            ? 'مطابقة تامة (0)'
                            : monthlyStats.monthDifference > 0
                            ? `فائض: +${formatCurrency(monthlyStats.monthDifference, '')}`
                            : `عجز: -${formatCurrency(Math.abs(monthlyStats.monthDifference), '')}`}
                        </td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2 px-2 text-center font-bold text-slate-500 font-mono">5</td>
                        <td className="py-2 px-3 font-bold text-slate-900">حالة الأيام المعتمدة خلال الشهر</td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">عدد الأيام التي تم مطابقتها وإقفالها محاسبياً</td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                          {monthlyStats.closedDaysCount} من {monthlyStats.daysInMonth} يوم ({Math.round((monthlyStats.closedDaysCount / (monthlyStats.daysInMonth || 1)) * 100)}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tafqeet Box */}
              <div className="bg-slate-50 border border-slate-300 rounded-none p-2.5 text-center">
                <div className="text-[11px] font-bold text-slate-500">الرصيد الفعلي المعتمد بالصندوق بنهاية الشهر كتابةً:</div>
                <div className="text-xs sm:text-sm font-black text-slate-900 mt-0.5">
                  فقط وقدره: {tafqeet(monthlyStats.endingActualCash, '').replace(/^فقط\s*/, '')}
                </div>
              </div>

              {/* Monthly Closing Sign-off Matrix (4 columns) */}
              <div className="pt-4 border-t border-slate-300 grid grid-cols-4 gap-4 text-center text-xs">
                <div>
                  <span className="text-slate-800 font-bold block mb-7">أمين الصندوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-2"></div>
                </div>
                <div>
                  <span className="text-slate-800 font-bold block mb-7">محاسب الجمعية:</span>
                  <div className="border-b border-dashed border-slate-400 mx-2"></div>
                </div>
                <div>
                  <span className="text-slate-800 font-bold block mb-7">مشرف الحراج:</span>
                  <div className="border-b border-dashed border-slate-400 mx-2"></div>
                </div>
                <div>
                  <span className="text-slate-800 font-bold block mb-7">رئيس مجلس الإدارة:</span>
                  <div className="border-b border-dashed border-slate-400 mx-2"></div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ------------------------------------------------------------- */}
      {/* MAIN SCREEN CONTENT */}
      {/* ------------------------------------------------------------- */}
      <div className="no-print space-y-6">
        {/* Top Header Card with Tabs Switcher */}
        <div className="bg-white border border-slate-300 rounded-none p-5 sm:p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-none bg-gradient-to-br from-emerald-600 to-teal-800 text-white flex items-center justify-center shadow-xs shadow-emerald-700/20">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  الجرد المحاسبي وإقفال الصندوق
                </h2>
                <span className="px-2.5 py-0.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black">
                  {inventoryTab === 'daily' ? `اليوم: ${formatArabicDayOnly(selectedDateStr)}` : `شهر ${ARABIC_MONTHS[selectedMonth - 1]}`}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                ضبط حركة الصندوق النقدية على مدار اليوم والشهر، المطابقة الدقيقة مع الكاش الفعلي، والتوثيق المحاسبي
              </p>
            </div>
          </div>

          {/* Tab Switcher: Daily vs Monthly */}
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-none border border-slate-300">
            <button
              type="button"
              onClick={() => setInventoryTab('daily')}
              className={`px-4 py-2 rounded-none text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                inventoryTab === 'daily'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>الجرد اليومي</span>
            </button>
            <button
              type="button"
              onClick={() => setInventoryTab('monthly')}
              className={`px-4 py-2 rounded-none text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                inventoryTab === 'monthly'
                  ? 'bg-white text-indigo-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              <span>الجرد الشهري الشامل</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-4 rounded-none bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-xs flex items-center gap-2 shadow-xs animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 1: DAILY INVENTORY (الجرد اليومي) */}
        {/* ------------------------------------------------------------- */}
        {inventoryTab === 'daily' && (
          <div className="space-y-6">

            {/* Date Navigator Bar */}
            <div className="bg-white border border-slate-300 rounded-none p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700">تاريخ الجرد المحدد:</span>
                <input
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => setSelectedDateStr(e.target.value)}
                  className="px-3 py-1.5 rounded-none bg-slate-50 border border-slate-300 font-mono font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500/30 outline-none"
                />
                {!isViewingToday && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateStr(getTodayLocalYMD())}
                    className="px-2.5 py-1.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer transition-colors"
                  >
                    العودة لتاريخ اليوم
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-slate-500">
                  حركات اليوم محصورة بدقة من <strong className="font-mono text-slate-700">00:00:00</strong> إلى <strong className="font-mono text-slate-700">23:59:59</strong>
                </span>
              </div>
            </div>

            {/* Smart Information Banner when viewing a restored/previous day */}
            {!isViewingToday && (
              <div className="bg-amber-50/90 border border-amber-200/90 rounded-none p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs">
                <div className="flex items-center gap-2 text-amber-950 font-bold">
                  <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    أنت تعرض محضر جرد ومطابقة يوم: <strong className="text-amber-900">{formatArabicDayOnly(selectedDateStr)} ({formatGregorianDate(new Date(selectedDateStr))})</strong>
                    <span className="text-[11px] text-amber-700 font-normal mr-2 inline-block">
                      (يُعرض لمرة واحدة في بداية اليوم للمطابقة)
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayLocalYMD();
                    try {
                      localStorage.setItem(`haraj_daily_inventory_seen_${today}`, 'true');
                      sessionStorage.setItem(`haraj_daily_inventory_seen_${today}`, 'true');
                    } catch (e) {}
                    setSelectedDateStr(today);
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-none text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <span>اعتماد والانتقال لليوم الجديد ({todayGregorian})</span>
                </button>
              </div>
            )}

            {/* Smart Banner if today is selected and has no entries while previous restored data exists */}
            {isViewingToday && dailyStats.todayDealsCount === 0 && latestDataDate && latestDataDate !== selectedDateStr && (
              <div className="bg-blue-50/90 border border-blue-300 rounded-none p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs">
                <div className="flex items-center gap-2 text-blue-950 font-bold">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    تاريخ اليوم ({todayGregorian}) لا توجد به عمليات بعد. أحدث جرد مسجل ومستعاد بالنظام بتاريخ ({latestDataDate}).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDateStr(latestDataDate)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  عرض جرد أحدث تاريخ مسجل ({latestDataDate})
                </button>
              </div>
            )}

            {/* 2-Column Section: Left is Calculation & Reconciliation Form, Right is KPI Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Calculation & Reconciliation Card (Col 7) */}
              <div className="lg:col-span-7 bg-white rounded-none border border-slate-300 p-5 sm:p-6 shadow-xs space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <span className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-emerald-600" />
                    <span>معادلة الجرد اليومي المعتمدة بالنظام:</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {displayedDailyStats.todayDealsCount} شروات اليوم
                  </span>
                </div>

                {/* Banner when screen is zeroed/cleared for a new cycle */}
                {/* Financial Calculation Breakdown Table */}
                <div className="bg-slate-50/80 border border-slate-300 rounded-none p-4 space-y-3 text-xs">
                  {/* 2. New Custody Injected Today */}
                  <div className="flex justify-between items-center text-blue-700 font-bold py-1 border-t border-slate-300/60">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>العهدة الجديدة:</span>
                    </span>
                    <span className="font-mono text-sm font-black">
                      +{formatCurrency(displayedDailyStats.newCustody, '')}
                    </span>
                  </div>

                  {/* 3. Additional Deposits */}
                  <div className="flex justify-between items-center text-emerald-950 bg-emerald-50/80 border border-emerald-300/80 p-2 rounded-none font-black py-1.5">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>الإيداعات الإضافية:</span>
                    </span>
                    <span className="font-mono text-sm text-emerald-900">
                      +{formatCurrency(displayedDailyStats.additionalDeposits, '')}
                    </span>
                  </div>

                  {/* 3. Buyer Debt Collections */}
                  <div className="flex justify-between items-center text-emerald-700 font-bold py-1 border-t border-slate-300/60">
                    <span className="flex items-center gap-1.5">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      <span>تحصيلات ديون المشترين:</span>
                    </span>
                    <span className="font-mono text-sm">
                      +{formatCurrency(displayedDailyStats.buyerDebtRepayments, '')}
                    </span>
                  </div>

                  {/* Haraj Cash Sales */}
                  {displayedDailyStats.harajCashSales > 0 && (
                    <div className="flex justify-between items-center text-teal-700 font-bold py-1 border-t border-slate-300/60">
                      <span className="flex items-center gap-1.5">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>+ مبيعات الحراج النقدية المقبوضة:</span>
                      </span>
                      <span className="font-mono text-sm">
                        +{formatCurrency(displayedDailyStats.harajCashSales, '')}
                      </span>
                    </div>
                  )}

                  {/* 4. Net Fisherman Payouts Outflow */}
                  <div className="flex justify-between items-center text-indigo-800 font-bold py-1 border-t border-slate-300/60">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>صافي مستحقات الصيادين المصروفة:</span>
                    </span>
                    <span className="font-mono text-sm">
                      -{formatCurrency(displayedDailyStats.totalFishermanPayouts, '')}
                    </span>
                  </div>

                  {/* 4.1 Exchange Repayments Details */}
                  {displayedDailyStats.buyerDebtExchangeRepayments > 0 && (
                    <div className="flex justify-between items-center text-teal-900 bg-teal-50/90 border border-teal-200 p-2.5 rounded-none font-bold py-1.5">
                      <span className="flex items-center gap-1.5">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-teal-700" />
                        <span className="font-black">تسديد ديون مشترين عبر الصرافة:</span>
                      </span>
                      <span className="font-mono text-sm font-black text-teal-900">
                        {formatCurrency(displayedDailyStats.buyerDebtExchangeRepayments, '')}
                      </span>
                    </div>
                  )}

                  {/* 4.2 Exchange Payouts Details */}
                  {displayedDailyStats.sellerExchangePayouts > 0 && (
                    <div className="flex justify-between items-center text-purple-900 bg-purple-50/90 border border-purple-200 p-2.5 rounded-none font-bold py-1.5">
                      <span className="flex items-center gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-purple-700" />
                        <span className="font-black">تسلم مستحقات صيادين عبر الصرافة:</span>
                      </span>
                      <span className="font-mono text-sm font-black text-purple-900">
                        {formatCurrency(displayedDailyStats.sellerExchangePayouts, '')}
                      </span>
                    </div>
                  )}

                  {/* 5. General Expenses Outflow */}
                  <div className="flex justify-between items-center text-rose-700 font-bold py-1 border-t border-slate-300/60">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>إجمالي المصروفات والنثريات:</span>
                    </span>
                    <span className="font-mono text-sm">
                      -{formatCurrency(displayedDailyStats.expenses, '')}
                    </span>
                  </div>

                  {/* Office Expenses Detail */}
                  {displayedDailyStats.officeExpenses > 0 && (
                    <div className="flex justify-between items-center text-orange-800 bg-orange-50/90 border border-orange-200 p-2 rounded-none font-bold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        <span>منها نثريات ومصروفات المكتب:</span>
                      </span>
                      <span className="font-mono text-sm font-black text-orange-900">
                        {formatCurrency(displayedDailyStats.officeExpenses, '')}
                      </span>
                    </div>
                  )}

                  {/* 6. Withdrawals Outflow */}
                  <div className="flex justify-between items-center text-amber-800 font-bold py-1 border-t border-slate-300/60">
                    <span className="flex items-center gap-1.5">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      <span>إجمالي السحوبات والتوريدات:</span>
                    </span>
                    <span className="font-mono text-sm">
                      -{formatCurrency(displayedDailyStats.withdrawals, '')}
                    </span>
                  </div>

                  {/* 7. Expected Drawer Cash Balance */}
                  <div className="pt-3 border-t-2 border-slate-300 flex justify-between items-center font-black text-slate-900 text-sm sm:text-base">
                    <span className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-emerald-700" />
                      <span>الرصيد المحسوب بالنظام (المتوقع في الدرج):</span>
                    </span>
                    <span className="font-mono text-lg text-emerald-700">
                      {formatCurrency(displayedDailyStats.expectedDrawerCash, '')}
                    </span>
                  </div>

                  {/* 8. Informational 5% Haraj Profit Badge (Separated from drawer math) */}
                  <div className="mt-2 p-2.5 rounded-none bg-blue-50 border border-blue-300 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-blue-900 font-bold">
                      <Info className="w-4 h-4 text-blue-600" />
                      <span>عمولات حراج اليوم 5% (للمعلومية والإحصاء فقط - لا تؤثر على رصيد الكاش):</span>
                    </span>
                    <span className="font-mono font-black text-blue-900">
                      {formatCurrency(displayedDailyStats.associationProfit, '')}
                    </span>
                  </div>
                </div>

                {/* Reconciliation Form */}
                <form onSubmit={handleSaveInventory} className="space-y-4 pt-2 border-t border-slate-100">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      الكاش الفعلي في الدرج (بعد الجرد والعد اليدوي) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        required
                        value={countedCash}
                        onChange={(e) =>
                          setCountedCash(e.target.value === '' ? '' : Number(e.target.value))
                        }
                        placeholder="أدخل المبلغ الفعلي بعد عد النقدية في الدرج..."
                        className="w-full px-4 py-3 rounded-none bg-slate-50 border border-slate-300 font-mono font-black text-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                      />
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        {settings.currency}
                      </span>
                    </div>
                    {typeof countedCash === 'number' && countedCash > 0 && (
                      <div className="mt-2 p-2 rounded-none bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between">
                        <span className="text-slate-500 font-medium">المبلغ المعدود كتابة:</span>
                        <span className="text-emerald-800">{tafqeet(countedCash, '')}</span>
                      </div>
                    )}
                  </div>

                  {/* Instant Difference Alert */}
                  {countedCash !== '' && (
                    <div
                      className={`p-4 rounded-none border flex items-center justify-between text-xs font-bold shadow-2xs ${
                        diff === 0
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : diff > 0
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-rose-50 border-rose-300 text-rose-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {diff === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-rose-600" />
                        )}
                        <div>
                          <span className="block text-sm font-black">
                            {diff === 0
                              ? 'مطابقة تامة! الرصيد الفعلي يطابق النظام بنسبة 100%'
                              : diff > 0
                              ? 'يوجد فائض في الدرج بمقدار:'
                              : 'يوجد عجز في الدرج بمقدار:'}
                          </span>
                          <span className="text-[11px] opacity-80 font-normal">
                            {diff === 0
                              ? 'لا يوجد أي نقص أو زيادة في نقدية اليومية'
                              : diff > 0
                              ? 'النقدية الفعلية في الدرج تزيد عن الحسابات المسجلة'
                              : 'النقدية الفعلية في الدرج أقل من الحسابات المسجلة'}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-black text-base">
                        {formatCurrency(Math.abs(diff), '')}
                      </span>
                    </div>
                  )}

                  {/* Responsible Personnel */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        أمين الصندوق المسؤول:
                      </label>
                      <input
                        type="text"
                        value={inventoryOfficer}
                        onChange={(e) => setInventoryOfficer(e.target.value)}
                        className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        المشرف المعتمد:
                      </label>
                      <input
                        type="text"
                        value={supervisorName}
                        onChange={(e) => setSupervisorName(e.target.value)}
                        className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات محضر الجرد:</label>
                    <textarea
                      rows={2}
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      placeholder="ملاحظات توضيحية عن نقدية اليوم أو فروقات أو توريدات..."
                      className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>

                  {activeDateClosing && activeDateClosing.reconciliationStatus === 'pending' ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-none flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 font-bold shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                          <span className="block font-black text-amber-950 text-xs">
                            إقفال آلي بواسطة النظام لليوم المنتهي ({activeDateClosing.dateStr})
                          </span>
                          <span className="text-[11px] text-amber-800 font-normal">
                            لم يتم معاينة الكاش الفعلي بعد. يمكنك إدخال المبلغ الفعلي واعتماد الجرد مباشرة.
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenReconcileModal(activeDateClosing)}
                        className="px-3.5 py-2 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>معاينة وإدخال الكاش الفعلي الآن</span>
                      </button>
                    </div>
                  ) : activeDateClosing ? (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-none flex items-center justify-between text-xs text-emerald-900 font-bold">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          تم اعتماد وحفظ جرد هذا التاريخ مسبقاً (بتاريخ {activeDateClosing.dateStr} الساعة {activeDateClosing.timeStr})
                        </span>
                      </div>
                      <span className="text-[11px] bg-emerald-600 text-white px-2.5 py-0.5 rounded font-black">
                        محفوظ بالسجل ✓
                      </span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-6 py-3 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-xs shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {activeDateClosing ? 'تحديث جرد اليوم في السجل' : 'اعتماد وحفظ الجرد اليومي في السجل'}
                      </span>
                    </button>
                  </div>
                </form>
              </div>

              {/* KPI Summary Cards & Tips (Col 5) */}
              <div className="lg:col-span-5 space-y-4">
                {/* Drawer Cash Live KPI */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-none p-6 shadow-xs shadow-emerald-950/20 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-emerald-100 flex items-center gap-2">
                      <Wallet className="w-4 h-4" />
                      <span>المتوقع في الصندوق حالياً</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-none bg-white/20 text-white text-[11px] font-black border border-white/20">
                      مباشر
                    </span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-black font-mono mt-2">
                    {formatCurrency(dailyStats.expectedDrawerCash, '')}
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-2 gap-2 text-xs text-emerald-100">
                    <div>
                      <span className="block opacity-75">
                        {settings.showSurplusInCashCards === false
                          ? 'إجمالي الوارد اليوم (بدون العهدة):'
                          : 'إجمالي الوارد اليوم:'}
                      </span>
                      <span className="font-mono font-bold text-white">
                        +{formatCurrency(
                          settings.showSurplusInCashCards === false
                            ? Math.max(0, dailyStats.totalCashIn - dailyStats.opening)
                            : dailyStats.totalCashIn,
                          settings.currency
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="block opacity-75">إجمالي المنصرف اليوم:</span>
                      <span className="font-mono font-bold text-white">
                        -{formatCurrency(
                          settings.showSurplusInCashCards === false
                            ? Math.max(0, dailyStats.totalCashOut - dailyStats.surplusRefunds)
                            : dailyStats.totalCashOut,
                          settings.currency
                        )}
                      </span>
                    </div>
                  </div>
                  {settings.showSurplusInCashCards !== false && dailyStats.surplusRefunds > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-purple-100">
                      <span>منها استرداد فائض الشروات:</span>
                      <span className="font-mono font-black text-white">-{formatCurrency(dailyStats.surplusRefunds, '')}</span>
                    </div>
                  )}
                </div>

                {/* Association Profits Card (5%) */}
                <div className="bg-white border border-blue-300 rounded-none p-5 shadow-xs bg-gradient-to-b from-blue-50/40 to-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      <span>صافي عمولات حراج اليوم (5%)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-none bg-blue-100 text-blue-800 text-[10px] font-black">
                      للمعلومية فقط
                    </span>
                  </div>
                  <div className="text-2xl font-black font-mono text-blue-900">
                    {formatCurrency(dailyStats.associationProfit, '')}
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    تشمل 2% عمولة المشترين + 3% استقطاع البائعين من حراج هذا اليوم دون خلط بأيام سابقة
                  </p>
                </div>

                {/* Inventory Tips Box */}
                <div className="bg-white border border-slate-300 rounded-none p-5 shadow-xs space-y-3">
                  <h4 className="font-black text-xs text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>إرشادات الجرد وإقفال اليومية:</span>
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>حركات الصندوق اليومية مفصولة بدقة من 00:00:00 إلى 23:59:59 لليوم المحدد.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>الرصيد الفعلي المعدود في الدرج يتم ترحيله تلقائياً كعهدة افتتاحية لليوم التالي.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>يمكنك دائماً مراجعة التقارير الشهرية الشاملة والمطابقة العامة من التبويب بالأعلى.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Historical Saved Closings Log (أرشيف سجلات الجرد المحفوظة) */}
            <div className="bg-white border border-slate-300 rounded-none p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>سجل ومحاضر الجرد اليومي المحفوظة (أرشيف الجرد)</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    كافة عمليات الجرد التاريخية المحفوظة مع تفاصيل المبالغ والفروقات وإمكانية الطباعة
                  </p>
                </div>
                <span className="px-3 py-1 rounded-none bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                  {cashClosings.length} محاضر محفوظة
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-300 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">اليوم والتاريخ</th>
                      <th className="p-3 text-center">العهدة</th>
                      <th className="p-3 text-center text-teal-700 bg-teal-50/60 font-black">صافي العهدة المستهلكة</th>
                      <th className="p-3 text-center text-blue-700">الإيداعات والتحصيل</th>
                      <th className="p-3 text-center text-indigo-700">صرف الصيادين</th>
                      <th className="p-3 text-center text-rose-700">المصروفات</th>
                      <th className="p-3 text-center text-blue-900 bg-blue-50/80 font-black">أرباح الجمعية</th>
                      <th className="p-3 text-center">المتوقع بالنظام</th>
                      <th className="p-3 text-center text-emerald-800 font-black">الفعلي المعدود</th>
                      <th className="p-3 text-center">الفارق</th>
                      <th className="p-3 text-center">المحضر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashClosings.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400 font-bold">
                          لم يتم حفظ أي محاضر جرد يومي بعد. سيتم أرشفة المحاضر هنا فور اعتماد أول جرد.
                        </td>
                      </tr>
                    ) : (
                      cashClosings.map((rec) => {
                        const dayLabel = formatArabicDayOnly(rec.dateStr, rec.timestamp);
                        const isBalanced = rec.difference === 0;
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                              <span className="block text-xs">{dayLabel}</span>
                              <span className="text-[10px] text-slate-400 font-mono font-normal">
                                {rec.dateStr} {rec.timeStr || ''}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-800 whitespace-nowrap">
                              {formatCurrency(getDayCustodyTotal(rec), '')}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-teal-800 bg-teal-50/40 whitespace-nowrap">
                              {(() => {
                                const custody = getDayCustodyTotal(rec);
                                const withdrawals = getDayWithdrawalsTotal(rec);
                                const netConsumed = Math.max(0, custody - withdrawals);
                                return formatCurrency(netConsumed, '');
                              })()}
                            </td>
                            <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                              {(() => {
                                const receiptsTotal = getDayReceiptsTotal(rec.dateStr);
                                return (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDrilldownModal({
                                        type: 'receipts',
                                        dateStr: rec.dateStr,
                                        dayName: `${dayLabel} (${rec.dateStr})`,
                                        displayedTotal: receiptsTotal,
                                      })
                                    }
                                    className="px-2 py-1 rounded-none text-blue-700 hover:text-blue-900 hover:bg-blue-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                    title="انقر لعرض تفاصيل المقبوضات"
                                  >
                                    <span>
                                      +{formatCurrency(receiptsTotal, settings.currency)}
                                    </span>
                                  </button>
                                );
                              })()}
                            </td>
                            <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrilldownModal({
                                    type: 'seller_payouts',
                                    dateStr: rec.dateStr,
                                    dayName: `${dayLabel} (${rec.dateStr})`,
                                    displayedTotal: rec.harajSellerPayouts || 0,
                                  })
                                }
                                className="px-2 py-1 rounded-none text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                title="انقر لعرض تفاصيل صرف الصيادين"
                              >
                                <span>
                                  -{formatCurrency(rec.harajSellerPayouts || 0, '')}
                                </span>
                              </button>
                            </td>
                            <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  setDrilldownModal({
                                    type: 'expenses',
                                    dateStr: rec.dateStr,
                                    dayName: `${dayLabel} (${rec.dateStr})`,
                                    displayedTotal: rec.totalExpenses || 0,
                                  })
                                }
                                className="px-2 py-1 rounded-none text-rose-700 hover:text-rose-900 hover:bg-rose-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                title="انقر لعرض تفاصيل المصروفات"
                              >
                                <span>
                                  -{formatCurrency(rec.totalExpenses || 0, '')}
                                </span>
                              </button>
                            </td>
                            <td className="p-3 text-center font-mono font-black text-blue-900 bg-blue-50/60 whitespace-nowrap">
                              {formatCurrency(rec.associationProfits || 0, '')}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-slate-900 whitespace-nowrap">
                              {formatCurrency(rec.systemCalculatedBalance, '')}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-emerald-800 bg-emerald-50/60 whitespace-nowrap">
                              {rec.reconciliationStatus === 'pending' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-none border border-amber-300">
                                  <Clock className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>بانتظار المعاينة</span>
                                </span>
                              ) : (
                                formatCurrency(rec.actualCountedCash, '')
                              )}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              {rec.reconciliationStatus === 'pending' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                  <span>لم يتم المعاينة</span>
                                </span>
                              ) : isBalanced ? (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  مطابق ✓
                                </span>
                              ) : rec.difference > 0 ? (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 font-mono">
                                  فائض: +{formatCurrency(rec.difference, '')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 font-mono">
                                  عجز: -{formatCurrency(Math.abs(rec.difference), '')}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenReconcileModal(rec)}
                                  className={`px-2.5 py-1.5 rounded-none border text-xs font-bold flex items-center gap-1 cursor-pointer transition-all ${
                                    rec.reconciliationStatus === 'pending'
                                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-300'
                                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                                  }`}
                                  title={
                                    rec.reconciliationStatus === 'pending'
                                      ? 'إدخال الكاش الفعلي المعدود واعتماد الجرد'
                                      : 'تعديل / معاينة الكاش الفعلي'
                                  }
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  {rec.reconciliationStatus === 'pending' ? (
                                    <span className="text-[11px] font-black">معاينة</span>
                                  ) : null}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedClosingForPrint(rec)}
                                  className="px-2.5 py-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="عرض وطباعة محضر الجرد"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  <span>المحضر</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW 2: MONTHLY INVENTORY (الجرد الشهري والمطابقة العامة) */}
        {/* ------------------------------------------------------------- */}
        {inventoryTab === 'monthly' && (
          <div className="space-y-6">
            {/* Monthly Selector & Actions Bar */}
            <div className="bg-white border border-slate-300 rounded-none p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">اختر الشهر:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="px-3.5 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none cursor-pointer"
                  >
                    {ARABIC_MONTHS.map((name, index) => (
                      <option key={index + 1} value={index + 1}>
                        {name} ({index + 1})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">السنة:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="px-3.5 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/30 outline-none cursor-pointer font-mono"
                  >
                    {[selectedYear - 1, selectedYear, selectedYear + 1].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowMonthlyPrintModal(true)}
                  className="px-4 py-2.5 rounded-none bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs shadow-indigo-600/20 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة محضر الإقفال الشهري الرسمي</span>
                </button>
              </div>
            </div>

            {/* Monthly KPI Overview Grid - Row 1: حركة السيولة والنقدية (4 بطاقات) */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span>حركة السيولة والنقدية بالصندوق (Cash & Liquidity Flow):</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">
                    مفصولة بدقة لمنع ازدواجية الحساب
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Cash Drawer Balance (كاش الدرج) */}
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-800 text-white rounded-none p-5 shadow-xs shadow-emerald-950/20 space-y-2 border border-emerald-500/30">
                    <div className="flex items-center justify-between text-xs text-emerald-100 font-black">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-emerald-200" />
                        <span>كاش الدرج</span>
                      </span>
                      <ShieldCheck className="w-4 h-4 text-emerald-200" />
                    </div>
                    <div className="text-2xl font-black font-mono">
                      {formatCurrency(monthlyStats.endingActualCash, '')}
                    </div>
                    <p className="text-[11px] text-emerald-100/80 font-medium">
                      النقد الفعلي المتوفر بالدرج والخزينة (الرصيد الفعلي للصندوق)
                    </p>
                  </div>

                  {/* Card 2: Total New Custody (إجمالي العُهد الجديدة المضافة) */}
                  <div className="bg-white border-2 border-blue-300 rounded-none p-5 shadow-xs space-y-2 bg-gradient-to-b from-blue-50/40 to-white">
                    <div className="flex items-center justify-between text-xs text-blue-700 font-black">
                      <span>إجمالي العُهد الجديدة المضافة</span>
                      <ArrowDownLeft className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-blue-900">
                      +{formatCurrency(monthlyStats.totalNewCustody, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      مجموع عُهد الجمعية المسلمة طوال أيام الشهر دون تكرار
                    </p>
                  </div>

                  {/* Card 3: Net Haraj Profit (صافي ربح الحراج للشهر) */}
                  <div
                    className={`bg-white border-2 rounded-none p-5 shadow-xs space-y-2 transition-all ${
                      monthlyStats.netHarajProfit >= 0
                        ? 'border-emerald-200 bg-gradient-to-b from-emerald-50/40 to-white'
                        : 'border-rose-200 bg-gradient-to-b from-rose-50/40 to-white'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between text-xs font-black ${
                        monthlyStats.netHarajProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      <span>صافي ربح الحراج للشهر</span>
                      <TrendingUp
                        className={`w-4 h-4 ${
                          monthlyStats.netHarajProfit >= 0 ? 'text-emerald-600' : 'text-rose-600 rotate-180'
                        }`}
                      />
                    </div>
                    <div
                      className={`text-2xl font-black font-mono ${
                        monthlyStats.netHarajProfit >= 0 ? 'text-emerald-950' : 'text-rose-950'
                      }`}
                    >
                      {monthlyStats.netHarajProfit > 0 ? '+' : ''}
                      {formatCurrency(monthlyStats.netHarajProfit, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      إجمالي عمولات الحراج (5%) ناقص إجمالي المصروفات
                    </p>
                  </div>

                  {/* Card 4: Total Cash Out (إجمالي مدفوعات الشهر) */}
                  <div className="bg-white border-2 border-rose-200 rounded-none p-5 shadow-xs space-y-2 bg-gradient-to-b from-rose-50/40 to-white">
                    <div className="flex items-center justify-between text-xs text-rose-700 font-black">
                      <span>إجمالي مدفوعات الشهر</span>
                      <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-rose-900">
                      -{formatCurrency(monthlyStats.totalCashOut, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      صافي مستحقات الصيادين المدفوعة + إجمالي المصروفات
                    </p>
                  </div>
                </div>
              </div>

              {/* Row 2: المؤشرات والأداء المالي (3 بطاقات) */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                    <span>المؤشرات والأداء المالي والإيرادات (Financial Indicators):</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Card 1: Total Cash In (إجمالي مقبوضات الشهر) */}
                  <div className="bg-white border-2 border-teal-200 rounded-none p-5 shadow-xs space-y-2 bg-gradient-to-b from-teal-50/30 to-white">
                    <div className="flex items-center justify-between text-xs text-teal-800 font-black">
                      <span>إجمالي مقبوضات الشهر (Cash In)</span>
                      <Coins className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-teal-900">
                      +{formatCurrency(monthlyStats.totalCashIn, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      إجمالي النقد المحصل فعلياً من المشترين (دون الآجل)
                    </p>
                  </div>

                  {/* Card 2: Commission Revenue (أرباح وعمولات الجمعية - 5%) */}
                  <div className="bg-white border-2 border-indigo-200 rounded-none p-5 shadow-xs space-y-2 bg-gradient-to-b from-indigo-50/30 to-white">
                    <div className="flex items-center justify-between text-xs text-indigo-800 font-black">
                      <span>أرباح وعمولات الجمعية (5%)</span>
                      <TrendingUp className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-indigo-950">
                      {formatCurrency(monthlyStats.monthHarajProfit, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      إجمالي نسبة الاستقطاع المكتسبة من كافة مبيعات الشهر
                    </p>
                  </div>

                  {/* Card 3: Outstanding Receivables (ديون المشترين المعلقة) */}
                  <div className="bg-white border-2 border-amber-200 rounded-none p-5 shadow-xs space-y-2 bg-gradient-to-b from-amber-50/30 to-white">
                    <div className="flex items-center justify-between text-xs text-amber-900 font-black">
                      <span>ديون المشترين المعلقة</span>
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-amber-950">
                      {formatCurrency(monthlyStats.outstandingBuyerDebt, '')}
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium">
                      إجمالي المبالغ المستحقة على المشترين ولم تُسدد بعد
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Breakdown Table for the Month */}
            <div className="bg-white border border-slate-300 rounded-none p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-indigo-600" />
                    <span>جدول مطابقة وإقفال كل يوم من أيام شهر {ARABIC_MONTHS[selectedMonth - 1]} {selectedYear}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    متابعة يومية دقيقة لحالات الإقفال، الفروقات، ورصيد الدرج اليومي
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportMonthlyInventoryToExcel(monthlyStats.dailyBreakdownRows, selectedYear, selectedMonth, settings)}
                    className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                    title="تصدير جدول مطابقة الشهر بالكامل إلى ملف Excel منظم واحترافي"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>تصدير كشف الشهر إلى Excel</span>
                  </button>
                  <span className="px-3 py-1.5 rounded-none bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                    {monthlyStats.closedDaysCount} من {monthlyStats.daysInMonth} أيام معتمدة
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-300 text-slate-600 font-bold">
                    <tr>
                      <th className="p-3">اليوم والتاريخ</th>
                      <th className="p-3 text-center text-blue-700">العهدة الجديدة المضافة</th>
                      <th className="p-3 text-center text-teal-700 bg-teal-50/60 font-black">صافي العهدة المستهلكة</th>
                      <th className="p-3 text-center text-blue-700">المقبوضات</th>
                      <th className="p-3 text-center text-indigo-700">صرف الصيادين</th>
                      <th className="p-3 text-center text-rose-700">المصروفات</th>
                      <th className="p-3 text-center text-blue-900 font-black">أرباح الحراج (5%)</th>
                      <th className="p-3 text-center text-emerald-800 font-black">الفعلي المعدود</th>
                      <th className="p-3 text-center">الفارق</th>
                      <th className="p-3 text-center">حالة الجرد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyStats.dailyBreakdownRows.map((row) => {
                      const c = row.closing;
                      const isFuture = row.isFuture;
                      const isInactive = row.isInactive;
                      return (
                        <tr
                          key={row.dayNumber}
                          className={`transition-colors ${
                            row.isClosed
                              ? 'hover:bg-slate-50/80'
                              : isInactive
                              ? 'bg-slate-50/20 opacity-50'
                              : isFuture
                              ? 'bg-slate-50/20 opacity-55'
                              : 'bg-slate-50/30 opacity-75'
                          }`}
                        >
                          <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                            <span className="block text-xs">
                              {row.dayName} (يوم {row.dayNumber})
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono font-normal">
                              {row.dateStr}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                            {isInactive || isFuture ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : row.newCustody > 0 ? (
                              <span className="text-blue-700 font-black">
                                +{formatCurrency(row.newCustody, '')}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-teal-800 bg-teal-50/40 whitespace-nowrap">
                            {isInactive || isFuture ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : (() => {
                              const netConsumed = Math.max(0, (row.newCustody || 0) - (row.withdrawals || 0));
                              return netConsumed > 0 ? (
                                <span className="text-teal-800 font-black">
                                  {formatCurrency(netConsumed, '')}
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                            {isFuture ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setDrilldownModal({
                                    type: 'receipts',
                                    dateStr: row.dateStr,
                                    dayName: `${row.dayName} (يوم ${row.dayNumber} - ${row.dateStr})`,
                                    displayedTotal: row.receipts,
                                  })
                                }
                                className="px-2 py-1 rounded-none text-blue-700 hover:text-blue-900 hover:bg-blue-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                title="انقر لعرض تفاصيل المقبوضات"
                              >
                                <span>
                                  {row.receipts > 0
                                    ? `+${formatCurrency(row.receipts, '')}`
                                    : c
                                    ? '0'
                                    : '—'}
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                            {isFuture ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setDrilldownModal({
                                    type: 'seller_payouts',
                                    dateStr: row.dateStr,
                                    dayName: `${row.dayName} (يوم ${row.dayNumber} - ${row.dateStr})`,
                                    displayedTotal: row.sellerPayouts,
                                  })
                                }
                                className="px-2 py-1 rounded-none text-indigo-700 hover:text-indigo-900 hover:bg-indigo-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                title="انقر لعرض تفاصيل صرف الصيادين"
                              >
                                <span>
                                  {row.sellerPayouts > 0
                                    ? `-${formatCurrency(row.sellerPayouts, '')}`
                                    : c
                                    ? '0'
                                    : '—'}
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                            {isFuture ? (
                              <span className="text-slate-400 font-normal">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setDrilldownModal({
                                    type: 'expenses',
                                    dateStr: row.dateStr,
                                    dayName: `${row.dayName} (يوم ${row.dayNumber} - ${row.dateStr})`,
                                    displayedTotal: row.expenses,
                                  })
                                }
                                className="px-2 py-1 rounded-none text-rose-700 hover:text-rose-900 hover:bg-rose-100/70 active:scale-95 transition-all cursor-pointer font-bold inline-flex items-center gap-1 group"
                                title="انقر لعرض تفاصيل المصروفات"
                              >
                                <span>
                                  {row.expenses > 0
                                    ? `-${formatCurrency(row.expenses, '')}`
                                    : c
                                    ? '0'
                                    : '—'}
                                </span>
                              </button>
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-blue-900 whitespace-nowrap">
                            {isInactive || isFuture ? (
                              <span className="text-slate-400 font-normal font-sans">—</span>
                            ) : (
                              formatCurrency(c?.associationProfits ?? row.dayProfit, '')
                            )}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-emerald-800 whitespace-nowrap">
                            {c ? (
                              c.reconciliationStatus === 'pending' ? (
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded border border-amber-300">
                                  بانتظار المعاينة
                                </span>
                              ) : (
                                formatCurrency(c.actualCountedCash, '')
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {c ? (
                              c.reconciliationStatus === 'pending' ? (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  لم يتم المعاينة
                                </span>
                              ) : c.difference === 0 ? (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  مطابق ✓
                                </span>
                              ) : c.difference > 0 ? (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-blue-100 text-blue-800 font-mono">
                                  +{formatCurrency(c.difference, '')}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-rose-100 text-rose-800 font-mono">
                                  -{formatCurrency(Math.abs(c.difference), '')}
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400 font-normal">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {c ? (
                              c.reconciliationStatus === 'pending' ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReconcileModal(c)}
                                  className="px-2 py-1 rounded-none bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1 mx-auto cursor-pointer transition-colors shadow-2xs"
                                  title="معاينة وإدخال الكاش الفعلي المعدود"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>معاينة</span>
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                                  معتمد ✓
                                </span>
                              )
                            ) : (
                              <span className="px-2.5 py-1 rounded-none bg-slate-100 text-slate-500 text-[11px] font-bold">
                                {isInactive || isFuture ? '—' : 'لم يُعتمد'}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-black text-slate-900">
                    <tr>
                      <td className="p-3 font-black text-slate-900 whitespace-nowrap">
                        إجمالي الشهر ({monthlyStats.closedDaysCount} يوم معتمد)
                      </td>
                      <td className="p-3 text-center font-mono font-black text-blue-900 whitespace-nowrap bg-blue-100/50" title="إجمالي العهد الجديدة المضافة طوال الشهر">
                        +{formatCurrency(monthlyStats.totalNewCustody, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-teal-900 whitespace-nowrap bg-teal-100/60" title="صافي العهد المستهلكة طوال الشهر">
                        +{formatCurrency(Math.max(0, (monthlyStats.totalNewCustody || 0) - (monthlyStats.totalWithdrawals || 0)), '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-blue-900 whitespace-nowrap bg-blue-50/50">
                        +{formatCurrency(monthlyStats.totalCashIn, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-indigo-900 whitespace-nowrap bg-indigo-50/50">
                        -{formatCurrency(monthlyStats.monthFishermanPayouts, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-rose-900 whitespace-nowrap bg-rose-50/50">
                        -{formatCurrency(monthlyStats.totalExpenses, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-blue-950 whitespace-nowrap bg-blue-100/40">
                        {formatCurrency(monthlyStats.monthHarajProfit, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-emerald-900 whitespace-nowrap bg-emerald-100/50" title="كاش الدرج (الرصيد الفعلي بالخزينة)">
                        {formatCurrency(monthlyStats.endingActualCash, '')}
                      </td>
                      <td className="p-3 text-center font-mono font-bold whitespace-nowrap">
                        {monthlyStats.monthDifference === 0 ? (
                          <span className="text-emerald-700">0</span>
                        ) : monthlyStats.monthDifference > 0 ? (
                          <span className="text-blue-700">+{formatCurrency(monthlyStats.monthDifference, '')}</span>
                        ) : (
                          <span className="text-rose-700">-{formatCurrency(Math.abs(monthlyStats.monthDifference), '')}</span>
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-500 font-bold whitespace-nowrap">
                        {monthlyStats.closedDaysCount} / {monthlyStats.daysInMonth}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
