import { MarketSettings, CashEntry, Transaction, CashDayCloseRecord } from '../types';
import { isExactContactMatch } from './contactMatching';

export interface FinancialCalculationResult {
  grossAmount: number;
  buyerTaxRate: number;
  buyerTaxAmount: number;
  totalFromBuyer: number;
  sellerTaxRate: number;
  sellerTaxAmount: number;
  netToSeller: number;
  harajProfit: number;
}

export interface DrawerCashBreakdown {
  opening: number;
  deposits: number;
  buyerDebtRepayments: number;
  sellerAdvanceRepayments: number;
  expenses: number;
  exchangeExpenses: number;
  withdrawals: number;
  sellerPayouts: number;
  sellerAdvances: number;
  posCashIn: number;
  posCashOut: number;
  currentDrawerBalance: number;
  rawDrawerBalance?: number;
  separatedProfits?: number;
  associationProfit?: number;
  associationDeferredDebt: number;
  carriedOverBalance?: number;
  totalCashIn?: number;
  totalCashOut?: number;
}

/**
 * استخراج السيولة النقدية المرحّلة من اليوم السابق استناداً لسجلات الإقفال اليومي
 */
export function getCarriedOverBalance(
  _cashClosings: CashDayCloseRecord[] = [],
  _targetDate: Date | string | number = new Date()
): number {
  return 0;
}

export function calculateNewCustody(
  entriesCustody: number,
  savedNewCustody: number | undefined,
  isCurrentDay: boolean
): number {
  if (!isCurrentDay && savedNewCustody !== undefined) {
    return Math.max(0, savedNewCustody);
  }
  if (entriesCustody > 0) {
    return entriesCustody;
  }
  return Math.max(0, savedNewCustody || 0);
}

/**
 * التحقق مما إذا كانت الشروة قد تمت تسويتها وإعادة بيعها لمشتري آخر
 */
export function isTransactionResold(t: Transaction): boolean {
  return Boolean(
    t.wasResold ||
    Boolean(t.resoldToTransactionId) ||
    Boolean(t.resoldToBuyerName) ||
    (t.notes && (
      t.notes.includes('تمت تسوية الشروة آلياً لإعادة بيعها') ||
      t.notes.includes('تمت إعادة بيعها لمشتري آخر') ||
      t.notes.includes('تمت إعادة بيع الشروة لمشتري آخر')
    ))
  );
}

export function calculateDrawerCash(
  cashEntries: CashEntry[],
  transactions: Transaction[],
  todayOnly = true,
  carriedOverBalance = 0,
  separateProfits = false
): DrawerCashBreakdown {
  const targetDate = new Date();

  const relevantTrxs = todayOnly
    ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, targetDate))
    : transactions;

  let posCashIn = 0;
  let posCashOut = 0;
  let associationProfit = 0;
  let associationDeferredDebt = 0;

  // Track any transactions that already have explicit seller_payout CashEntries to prevent double-counting
  const countedSellerPayoutTrxIds = new Set<string>();
  const countedResaleDepositTrxIds = new Set<string>();
  const countedBuyerRepaymentsByTrxId = new Map<string, number>();
  cashEntries.forEach((e) => {
    if (e.type === 'seller_payout') {
      if (e.transactionId) countedSellerPayoutTrxIds.add(e.transactionId);
      if (e.referenceId) countedSellerPayoutTrxIds.add(e.referenceId);
      if (e.description) {
        const match = e.description.match(/TRX-\d{4}-\d{4}/);
        if (match) countedSellerPayoutTrxIds.add(match[0]);
      }
    }
    if (e.type === 'deposit' && (e.category === 'فائض بيع شروة' || e.category === 'عمولة بيع شروة')) {
      if (e.transactionId) countedResaleDepositTrxIds.add(e.transactionId);
      if (e.referenceId) countedResaleDepositTrxIds.add(e.referenceId);
    }
    if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
      const isEx = e.category === 'سداد دين عبر الصرافة' || e.repaymentMethod === 'exchange' || e.payoutMethod === 'exchange';
      const isOff = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';
      if (!isEx && !isOff) {
        const txId = e.transactionId || e.referenceId;
        if (txId) {
          countedBuyerRepaymentsByTrxId.set(txId, (countedBuyerRepaymentsByTrxId.get(txId) || 0) + e.amount);
        }
      }
    }
  });

  relevantTrxs.forEach((t) => {
    // إذا كانت الفاتورة تمت إعادة بيعها لمشتري آخر، لا تتكرر متحصلاتها في الدرج بل تُحتسب الفاتورة البديلة النشطة
    if (isTransactionResold(t)) {
      const hasManualPayout = countedSellerPayoutTrxIds.has(t.id);
      const paidToSeller = hasManualPayout
        ? 0
        : t.settlementType === 'direct_cash'
        ? 0
        : t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
        ? 0
        : typeof t.paidAtPosAmount === 'number'
        ? t.paidAtPosAmount
        : typeof t.sellerPaidAmount === 'number'
        ? t.sellerPaidAmount
        : 0;
      posCashOut += paidToSeller;
      return;
    }

    associationProfit += t.harajProfit || 0;
    // Only cash disbursed directly at POS is counted here.
    // Subsequent cash payouts to fishermen are tracked via seller_payout CashEntries.
    // For credit sales (association_credit), fisherman net is recorded as an account balance and does NOT drain cash at POS.
    const hasManualPayout = countedSellerPayoutTrxIds.has(t.id);
    const paidToSeller = hasManualPayout
      ? 0
      : t.settlementType === 'direct_cash'
      ? 0
      : t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
      ? 0
      : typeof t.paidAtPosAmount === 'number'
      ? t.paidAtPosAmount
      : typeof t.sellerPaidAmount === 'number'
      ? t.sellerPaidAmount
      : 0;

    let cashFromBuyer = 0;
    if (t.settlementType === 'direct_cash') {
      cashFromBuyer = t.harajProfit || 0;
    } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
      // For credit sales (association_credit), no buyer cash was collected at POS.
      // Subsequent buyer debt repayments bring cash into the drawer via buyer_debt_repayment CashEntries.
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

    // إذا كانت العملية إعادة بيع شروة وبها فائض مالي أو عمولة مودعة كحركات إيداع في الصندوق، نخصمها من متحصلات البيع تفادياً للتكرار
    if (t.isResale && cashFromBuyer > 0 && countedResaleDepositTrxIds.has(t.id)) {
      const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
      const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
      cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
    }

    // سقف المبيعات النقدية للفاتورة لمنع تكرار احتساب المبالغ المسددة عبر سندات سداد دين
    const linkedRepayments = countedBuyerRepaymentsByTrxId.get(t.id) || 0;
    const totalTargetPaid = typeof t.buyerPaidAmount === 'number' ? t.buyerPaidAmount : (t.settlementType === 'association_cash' ? (t.totalFromBuyer || 0) : (t.paidAtPosBuyerAmount || 0));
    const maxPosAllowed = Math.max(0, totalTargetPaid - linkedRepayments);
    cashFromBuyer = Math.min(cashFromBuyer, maxPosAllowed);

    posCashIn += cashFromBuyer;
    posCashOut += paidToSeller;

    if (t.settlementType !== 'direct_cash' && !t.isResale) {
      const netDue = t.netToSeller || 0;
      const actualPaid =
        t.sellerPaidStatus === 'paid'
          ? netDue
          : t.sellerPaidStatus === 'unpaid'
          ? 0
          : typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : typeof t.paidAtPosAmount === 'number'
          ? t.paidAtPosAmount
          : 0;
      const rem = Math.max(0, netDue - actualPaid);
      associationDeferredDebt += rem;
    }
  });

  const relevantEntries = todayOnly
    ? cashEntries.filter((e) => isSameCalendarDay(e.dateStr || e.timestamp, targetDate))
    : cashEntries;

  let opening = 0;
  let deposits = 0;
  let buyerDebtRepayments = 0;
  let sellerAdvanceRepayments = 0;
  let expenses = 0;
  let exchangeExpenses = 0;
  let withdrawals = 0;
  let sellerPayouts = 0;
  let sellerAdvances = 0;

  relevantEntries.forEach((e) => {
    if (e.type === 'opening') opening += e.amount;
    else if ((e.type === 'deposit' && e.repaymentMethod !== 'exchange') || (e.type === 'buyer_advance_deposit' && e.category !== 'إيداع فائض مقاصة بيعات')) {
      deposits += e.amount;
    }
    else if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
      if (
        e.category !== 'سداد دين عبر الصرافة' &&
        e.category !== 'مقاصة بيعات مع شروات' &&
        e.payoutMethod !== 'exchange' &&
        e.repaymentMethod !== 'exchange' &&
        e.repaymentMethod !== 'offset'
      ) {
        buyerDebtRepayments += e.amount;
      }
    }
    else if (e.type === 'seller_advance_repayment') {
      // Non-cash settlement offset ("تسوية ومقاصة سلفة صياد") was already accounted for because less cash left the drawer
      // Only actual direct cash repayment brings physical cash into the drawer
      if (e.category !== 'تسوية ومقاصة سلفة صياد') {
        sellerAdvanceRepayments += e.amount;
      }
    }
    else if (e.type === 'expense') {
      expenses += e.amount;
      if (e.payoutMethod === 'exchange') exchangeExpenses += e.amount;
    }
    else if (e.type === 'withdrawal' || e.type === 'buyer_advance_refund' || e.type === 'buyer_advance') withdrawals += e.amount;
    else if (e.type === 'seller_payout') {
      if (e.category !== 'تسليم مستحقات عبر الصرافة' && e.payoutMethod !== 'exchange') {
        sellerPayouts += e.amount;
      }
    }
    else if (e.type === 'seller_advance') sellerAdvances += e.amount;
  });

  const effectiveCarriedOver = 0;
  const totalCashIn = effectiveCarriedOver + opening + deposits + buyerDebtRepayments + sellerAdvanceRepayments + posCashIn;
  // Outflow: expenses + withdrawals + seller payouts + seller advances + POS cash paid to fishermen
  const totalCashOut = expenses - exchangeExpenses + withdrawals + sellerPayouts + sellerAdvances + posCashOut;
  const rawDrawerBalance = Math.max(0, totalCashIn - totalCashOut);
  const separatedProfits = separateProfits ? associationProfit : 0;
  const currentDrawerBalance = Math.max(0, rawDrawerBalance - separatedProfits);

  return {
    opening,
    deposits,
    buyerDebtRepayments,
    sellerAdvanceRepayments,
    expenses,
    exchangeExpenses,
    withdrawals,
    sellerPayouts,
    sellerAdvances,
    posCashIn,
    posCashOut,
    rawDrawerBalance,
    separatedProfits,
    associationProfit,
    currentDrawerBalance,
    associationDeferredDebt,
    carriedOverBalance: effectiveCarriedOver,
    totalCashIn,
    totalCashOut,
  };
}

export function calculateInventoryDrawerBalance(
  detailedDayBalance: number,
  cashEntries: CashEntry[],
  transactions: Transaction[],
  cashClosings: CashDayCloseRecord[],
  targetDate: Date | string | number,
  isCurrentDay: boolean,
  separateProfits = false
): number {
  if (!isCurrentDay) return detailedDayBalance;

  const carriedOver = getCarriedOverBalance(cashClosings, targetDate);
  return calculateDrawerCash(cashEntries, transactions, true, carriedOver, separateProfits).currentDrawerBalance;
}

export interface DayClosingStats {
  openingBalance: number;
  carriedOverBalance?: number;
  newCustodyAmount?: number;
  totalDeposits: number;
  totalExpenses: number;
  exchangeExpenses: number;
  officeExpenses: number;
  totalWithdrawals: number;
  harajCashSales: number;
  harajSellerPayouts: number;
  buyerDebtRepayments: number;
  buyerDebtExchangeRepayments: number;
  sellerExchangePayouts: number;
  sellerAdvanceRepayments: number;
  associationProfits: number;
  systemCalculatedBalance: number;
  rawCalculatedBalance?: number;
  separatedProfits?: number;
  transactionsCount: number;
}

/**
 * دالة حساب الإجماليات المالية الدفترية الدقيقة ليوم محدد لغايات الجرد والإقفال اليومي
 */
export function calculateDayClosingStats(
  targetDate: string | Date | number,
  cashEntries: CashEntry[],
  transactions: Transaction[],
  cashClosingsOrCarriedOver?: CashDayCloseRecord[] | number,
  separateProfits = false
): DayClosingStats {
  const dayEntries = cashEntries.filter((e) =>
    isSameCalendarDay(e.dateStr || e.timestamp, targetDate)
  );

  let openingBalance = 0;
  let totalDeposits = 0;
  let buyerDebtRepayments = 0;
  let buyerDebtExchangeRepayments = 0;
  let sellerExchangePayouts = 0;
  let sellerAdvanceRepayments = 0;
  let generalExpenses = 0;
  let officeExpenses = 0;
  let exchangeExpenses = 0;
  let totalWithdrawals = 0;
  let manualSellerPayouts = 0;
  let sellerAdvances = 0;
  const countedSellerPayoutTrxIds = new Set<string>();
  const countedResaleDepositTrxIds = new Set<string>();
  const countedBuyerRepaymentsByTrxId = new Map<string, number>();

  dayEntries.forEach((e) => {
    if (e.type === 'opening') {
      openingBalance += e.amount;
    } else if ((e.type === 'deposit' && e.repaymentMethod !== 'exchange') || (e.type === 'buyer_advance_deposit' && e.category !== 'إيداع فائض مقاصة بيعات')) {
      totalDeposits += e.amount;
      if (e.category === 'فائض بيع شروة' || e.category === 'عمولة بيع شروة') {
        if (e.transactionId) countedResaleDepositTrxIds.add(e.transactionId);
        if (e.referenceId) countedResaleDepositTrxIds.add(e.referenceId);
      }
    } else if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
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
    } else if (e.type === 'withdrawal' || e.type === 'buyer_advance_refund') {
      totalWithdrawals += e.amount;
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

  const dayTransactions = transactions.filter((t) =>
    isSameCalendarDay(t.dateStr || t.timestamp, targetDate)
  );

  let harajCashSales = 0;
  let posSellerCashPaid = 0;
  let associationProfits = 0;

  dayTransactions.forEach((t) => {
    // إذا كانت الشروة قد أعيد بيعها لشخص آخر، نستثني مبيعاتها حتى لا تتكرر
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

    associationProfits += t.harajProfit || 0;

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

    if (t.isResale && cashFromBuyer > 0 && countedResaleDepositTrxIds.has(t.id)) {
      const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
      const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
      cashFromBuyer = Math.max(0, cashFromBuyer - surplus - commission);
    }

    // سقف المبيعات النقدية للفاتورة لمنع تكرار احتساب المبالغ المسددة عبر سندات سداد دين
    const linkedRepayments = countedBuyerRepaymentsByTrxId.get(t.id) || 0;
    const totalTargetPaid = typeof t.buyerPaidAmount === 'number' ? t.buyerPaidAmount : (t.settlementType === 'association_cash' ? (t.totalFromBuyer || 0) : (t.paidAtPosBuyerAmount || 0));
    const maxPosAllowed = Math.max(0, totalTargetPaid - linkedRepayments);
    cashFromBuyer = Math.min(cashFromBuyer, maxPosAllowed);

    harajCashSales += cashFromBuyer;
    posSellerCashPaid += paidToSeller;
  });

  const carriedOver = 0;

  const totalExpenses = generalExpenses + officeExpenses;
  const harajSellerPayouts = posSellerCashPaid + manualSellerPayouts + sellerAdvances;
  const rawOpening = openingBalance;
  let netOpeningCustody = rawOpening;
  if (carriedOver > 0 && rawOpening > carriedOver) {
    netOpeningCustody = rawOpening - carriedOver;
  }
  const newCustodyAmount = netOpeningCustody + totalDeposits;
  const totalCashIn = carriedOver + openingBalance + totalDeposits + buyerDebtRepayments + sellerAdvanceRepayments + harajCashSales;
  const totalCashOut = harajSellerPayouts + totalExpenses - exchangeExpenses + totalWithdrawals;
  const rawCalculatedBalance = totalCashIn - totalCashOut;
  const separatedProfits = separateProfits ? associationProfits : 0;
  const systemCalculatedBalance = rawCalculatedBalance - separatedProfits;

  return {
    openingBalance,
    carriedOverBalance: carriedOver,
    newCustodyAmount,
    totalDeposits,
    totalExpenses,
    exchangeExpenses,
    officeExpenses,
    totalWithdrawals,
    harajCashSales,
    harajSellerPayouts,
    buyerDebtRepayments,
    buyerDebtExchangeRepayments,
    sellerExchangePayouts,
    sellerAdvanceRepayments,
    associationProfits,
    systemCalculatedBalance,
    rawCalculatedBalance,
    separatedProfits,
    transactionsCount: dayTransactions.length,
  };
}

export interface BuyerAdvanceStats {
  totalDeposited: number;
  totalUsedInPOS: number;
  totalUsedForDebt: number;
  totalRefunded: number;
  currentAdvanceBalance: number;
}

/**
 * Calculates current available advance/wallet balance for a buyer
 */
export function calculateBuyerAdvanceBalance(
  buyerId: string | undefined,
  buyerName: string | undefined,
  cashEntries: CashEntry[] = [],
  transactions: Transaction[] = []
): BuyerAdvanceStats {
  const normId = (buyerId || '').trim().toLowerCase();
  const normName = normalizeArabic(buyerName || '');

  if (!normId && !normName) {
    return {
      totalDeposited: 0,
      totalUsedInPOS: 0,
      totalUsedForDebt: 0,
      totalRefunded: 0,
      currentAdvanceBalance: 0,
    };
  }

  const isMatch = (cId?: string, cName?: string) => isExactContactMatch(cId, cName, buyerId, buyerName);

  let totalDeposited = 0;
  let totalRefunded = 0;
  let totalUsedForDebt = 0;

  cashEntries.forEach((e) => {
    if (!isMatch(e.contactId, e.contactName)) return;

    if (e.type === 'buyer_advance_deposit') {
      totalDeposited += e.amount;
    } else if (e.type === 'buyer_advance_refund') {
      if (e.category !== 'استرداد فائض شروات' && !e.description?.includes('استرداد فائض شروات')) {
        totalRefunded += e.amount;
      }
    } else if (e.type === 'advance_debt_settlement') {
      totalUsedForDebt += e.amount;
    }
  });

  let totalUsedInPOS = 0;
  transactions.forEach((t) => {
    if (!isMatch(t.buyerId, t.buyerName)) return;
    if (t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0) {
      totalUsedInPOS += t.buyerAdvanceUsed;
    } else if (t.settlementType === 'buyer_advance') {
      totalUsedInPOS += t.totalFromBuyer || 0;
    }
  });

  const currentAdvanceBalance = Math.max(
    0,
    totalDeposited - totalRefunded - totalUsedInPOS - totalUsedForDebt
  );

  return {
    totalDeposited,
    totalUsedInPOS,
    totalUsedForDebt,
    totalRefunded,
    currentAdvanceBalance,
  };
}


/**
 * Calculates transaction finances per fish auction standard rules:
 * - Buyer: +2% (Total from buyer = Gross + 2%)
 * - Seller: -3% (Net to seller = Gross - 3%)
 * - Association / Haraj Profit = 2% + 3% = 5% of gross
 */
export function calculateFinancials(
  grossAmount: number,
  buyerTaxRate = 0.02,
  sellerTaxRate = 0.03
): FinancialCalculationResult {
  const safeGross = Math.round(Math.max(0, Number(grossAmount) || 0));

  // Round all monetary amounts to whole currency units (no decimals or fractions)
  const buyerTaxAmount = Math.round(safeGross * buyerTaxRate);
  const totalFromBuyer = safeGross + buyerTaxAmount;

  const sellerTaxAmount = Math.round(safeGross * sellerTaxRate);
  const netToSeller = safeGross - sellerTaxAmount;

  const harajProfit = buyerTaxAmount + sellerTaxAmount;

  return {
    grossAmount: safeGross,
    buyerTaxRate,
    buyerTaxAmount,
    totalFromBuyer,
    sellerTaxRate,
    sellerTaxAmount,
    netToSeller,
    harajProfit,
  };
}

export function formatCurrency(amount: number, currency = 'ريال يمني'): string {
  const rounded = Math.round(Number(amount) || 0);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rounded);

  return currency ? `${formatted} ${currency}` : formatted;
}

export function parseQuantityNumber(val: number | string | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 1 : val;
  if (!val) return 1;
  const str = String(val).trim();
  // تحويل الأرقام العربية إلى إنجليزية
  const normalized = str.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
  // فحص الكسر مثل 1/2 أو 3/4
  if (normalized.includes('/')) {
    const parts = normalized.split('/');
    const n = parseFloat(parts[0]);
    const d = parseFloat(parts[1]);
    if (!isNaN(n) && !isNaN(d) && d !== 0) return n / d;
  }
  const parsed = parseFloat(normalized);
  return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

export function formatNumber(val: number | string): string {
  if (typeof val === 'string' && isNaN(Number(val.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])))) {
    return val;
  }
  const rounded = Math.round(Number(val) || 0);
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(rounded);
}

export function formatNumberWithDots(val: number | string): string {
  if (typeof val === 'string' && isNaN(Number(val.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)])))) {
    return val;
  }
  const rounded = Math.round(Number(val) || 0);
  return new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: 0,
  }).format(rounded);
}

export function generateTransactionId(sequenceNumber: number): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequenceNumber).padStart(4, '0');
  return `TRX-${year}${month}-${seq}`;
}

export function formatGregorianDate(dateInput?: Date | number | string): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }
    return '';
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';
    const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
    }
    const m2 = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m2) {
      return `${Number(m2[3])}/${Number(m2[2])}/${Number(m2[1])}`;
    }
    // Try parsing as standard date
    const parsed = new Date(trimmed.replace(/-/g, '/'));
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`;
    }
    // If it's a Hijri string or unparseable, return empty string so it doesn't falsely match today
    return '';
  }
  const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    return '';
  }
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${year}/${month}/${day}`;
}

export function isSameCalendarDay(
  dateInputA?: Date | number | string,
  dateInputB: Date | number | string = new Date()
): boolean {
  if (!dateInputA || !dateInputB) return false;
  const strA = formatGregorianDate(dateInputA);
  const strB = formatGregorianDate(dateInputB);
  if (!strA || !strB) return false;
  return strA === strB;
}

/**
 * الحصول على تاريخ اليوم بالتوقيت المحلي للجهاز بصيغة YYYY-MM-DD
 * بدون مشاكل فرق التوقيت (UTC Offset) التي تحدث عند استخدام toISOString
 */
export function getTodayLocalYMD(dateInput: Date = new Date()): string {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(timestamp?: number, dateStr?: string): string {
  if (dateStr && dateStr.trim()) {
    const formatted = formatGregorianDate(dateStr);
    if (formatted) return formatted;
    return dateStr;
  }
  if (timestamp && !isNaN(timestamp) && timestamp > 0) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }
  }
  const today = new Date();
  return `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
}

export function formatGregorianTime(dateInput?: Date | number | string, includeSeconds = false): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const period = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  return includeSeconds ? `${hours}:${minutes}:${seconds} ${period}` : `${hours}:${minutes} ${period}`;
}

export function getArabicFormattedDate(timestamp: number): { dateStr: string; timeStr: string } {
  const date = new Date(timestamp);
  const dateStr = formatGregorianDate(date);
  const timeStr = formatGregorianTime(date);
  return { dateStr, timeStr };
}

/**
 * تحليل تاريخ نصي بصيغة محلية موثوقة (تفادي مشاكل UTC Offset في محركات المتصفح)
 */
export function parseLocalDate(dateInput?: Date | number | string): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return null;
    const m = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = Number(m[3]);
      return new Date(year, month, day, 12, 0, 0); // منتصف النهار يمنع أي انزياح أو فرق توقيت
    }
    const m2 = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m2) {
      const year = Number(m2[3]);
      const month = Number(m2[2]) - 1;
      const day = Number(m2[1]);
      return new Date(year, month, day, 12, 0, 0);
    }
    const d = new Date(trimmed.replace(/-/g, '/'));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatArabicDayOnly(dateStr?: string, timestamp?: number): string {
  let date: Date | null = null;
  if (dateStr && dateStr.trim()) {
    date = parseLocalDate(dateStr);
  } else if (timestamp) {
    date = new Date(timestamp);
  }
  if (!date || isNaN(date.getTime())) {
    return dateStr || '—';
  }
  const dayName = date.toLocaleDateString('ar-EG', { weekday: 'long' });
  return `يوم ${dayName}`;
}

export function getWeekdayName(timestamp?: number, dateStr?: string): string {
  let date: Date | null = null;
  if (dateStr && dateStr.trim()) {
    date = parseLocalDate(dateStr);
  } else if (timestamp) {
    date = new Date(timestamp);
  }
  if (!date || isNaN(date.getTime())) {
    return '';
  }
  const dayName = date.toLocaleDateString('ar-EG', { weekday: 'long' });
  return dayName.replace(/^يوم\s+/, '');
}

export function tafqeet(amount: number, currency = 'ريال يمني'): string {
  if (!amount || isNaN(amount) || amount === 0) {
    return currency ? `صفر ${currency}` : 'صفر';
  }

  const integerPart = Math.floor(Math.abs(amount));
  const decimalPart = Math.round((Math.abs(amount) - integerPart) * 100);

  const ones = [
    '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'
  ];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertGroup(n: number): string {
    let res = '';
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    if (h > 0) {
      res += hundreds[h];
    }
    if (remainder > 0) {
      if (res !== '') res += ' و';
      if (remainder < 20) {
        res += ones[remainder];
      } else {
        const o = remainder % 10;
        const t = Math.floor(remainder / 10);
        if (o > 0) {
          res += ones[o] + ' و' + tens[t];
        } else {
          res += tens[t];
        }
      }
    }
    return res;
  }

  const billions = Math.floor(integerPart / 1_000_000_000);
  const millions = Math.floor((integerPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000);
  const rem = integerPart % 1_000;

  const parts: string[] = [];

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(convertGroup(billions) + ' مليارات');
    else parts.push(convertGroup(billions) + ' مليار');
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(convertGroup(millions) + ' ملايين');
    else parts.push(convertGroup(millions) + ' مليون');
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(convertGroup(thousands) + ' آلاف');
    else parts.push(convertGroup(thousands) + ' ألف');
  }

  if (rem > 0) {
    parts.push(convertGroup(rem));
  }

  let text = parts.join(' و');
  if (!text) text = 'صفر';

  let decimalText = '';
  if (decimalPart > 0) {
    decimalText = ` و${convertGroup(decimalPart)} فلس`;
  }

  const prefix = 'فقط ';
  const suffix = currency ? ` ${currency} لا غير` : ' لا غير';

  return `${prefix}${text}${decimalText}${suffix}`.replace(/\s+/g, ' ').trim();
}

/**
 * دالة مساعدة لتوحيد النصوص والأسماء العربية للمقارنة الدقيقة ومنع أخطاء الهمزات والمسافات
 */
export function normalizeArabic(text?: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/\s+/g, ' ');
}

export function fuzzyMatchArabic(sourceText?: string, queryText?: string): boolean {
  if (!sourceText || !queryText) return false;
  const sNorm = normalizeArabic(sourceText);
  const qNorm = normalizeArabic(queryText);
  if (sNorm.includes(qNorm)) return true;

  const sNoAl = sNorm.replace(/\bال/g, '');
  const qNoAl = qNorm.replace(/\bال/g, '');
  if (sNoAl.includes(qNoAl) || sNorm.includes(qNoAl)) return true;

  const words = qNorm.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const allMatch = words.every((w) => {
      const wNoAl = w.replace(/^ال/, '');
      return sNorm.includes(w) || sNoAl.includes(wNoAl);
    });
    if (allMatch) return true;
  }

  return false;
}



/**
 * استخراج تفاصيل إعادة بيع الشروة (اسم المشتري الجديد، رقم الفاتورة الجديدة، حالة سداد المشتري الجديد)
 */
export function getResoldDetails(t: Transaction): {
  isResold: boolean;
  newBuyerName?: string;
  newTransactionId?: string;
  paymentStatus?: 'pending' | 'paid';
  isSettled: boolean;
} {
  const isResold = isTransactionResold(t);
  if (!isResold) return { isResold: false, isSettled: false };

  let newBuyerName = t.resoldToBuyerName;
  let newTransactionId = t.resoldToTransactionId;
  let paymentStatus = t.resoldPaymentStatus;

  if (t.notes) {
    if (!newBuyerName) {
      const matchName = t.notes.match(/لمشتري آخر \(([^)]+)\)/);
      if (matchName) newBuyerName = matchName[1];
    }
    if (!newTransactionId) {
      const matchId = t.notes.match(/برقم #([^\s\],-]+)/);
      if (matchId) newTransactionId = matchId[1];
    }
    if (!paymentStatus) {
      if (
        t.notes.includes('حالة سداد الجديد: مدفوع نقداً') ||
        t.notes.includes('حالة سداد المشتري الجديد: مدفوع نقداً') ||
        t.notes.includes('سداد المشتري الجديد نقداً')
      ) {
        paymentStatus = 'paid';
      } else if (
        t.notes.includes('حالة سداد الجديد: آجل') ||
        t.notes.includes('حالة سداد المشتري الجديد: آجل')
      ) {
        paymentStatus = 'pending';
      }
    }
  }

  // تعتبر مسواة فعلياً فقط إذا كانت حالتها settled أو تم سداد المشتري الجديد
  const isSettled =
    t.paymentStatus === 'settled' ||
    (t.buyerRemainingDebt !== undefined && t.buyerRemainingDebt <= 0 && paymentStatus === 'paid');

  return {
    isResold: true,
    newBuyerName,
    newTransactionId,
    paymentStatus,
    isSettled,
  };
}

/**
 * فحص ما إذا كانت الفاتورة عبارة عن شروة محولة لمشتري جديد
 */
export const isTransferredTransaction = (t?: Transaction | null): boolean => {
  if (!t) return false;
  return Boolean(
    t.isTransferred ||
    Boolean(t.transferredFromBuyerName) ||
    (t.notes && (t.notes.includes('تحويل شروة') || t.notes.includes('نُقلت من المشتري')))
  );
};

/**
 * Returns the buyer debt recorded by a transaction, with protection against stale zero values.
 */
export function getTransactionBuyerDebt(t: Transaction): number {
  const total = Number(t.totalFromBuyer) || 0;
  const status = String(t.paymentStatus || '').toLowerCase();
  const recordedPaid = Math.max(0, Number(t.buyerPaidAmount) || 0);
  const posPaid = Math.max(0, Number(t.paidAtPosBuyerAmount) || 0);
  const advanceUsed = Math.max(0, Number(t.buyerAdvanceUsed) || 0);
  const paid = Math.max(recordedPaid, posPaid, advanceUsed);

  const isPaidStatus = status === 'paid' || status === 'settled';
  if (isPaidStatus && t.settlementType !== 'association_credit') return 0;
  if (isPaidStatus && t.settlementType === 'association_credit' && paid >= total) return 0;

  if (typeof t.buyerRemainingDebt === 'number' && t.buyerRemainingDebt > 0) {
    return Math.max(0, t.buyerRemainingDebt);
  }

  const derivedDebt = Math.max(0, total - paid);

  const isDebtStatus =
    status === 'pending' ||
    status === 'partial' ||
    status === 'debt' ||
    t.settlementType === 'association_credit';

  return isDebtStatus ? (derivedDebt > 0 ? derivedDebt : 0) : 0;
}

/**
 * حساب إجمالي صافي دين المشتري بدقة عبر خصم سندات السداد المقبوضة بالصندوق
 */
export function calculateBuyerTotalDebt(
  transactions: Transaction[],
  cashEntries: CashEntry[],
  buyerId?: string,
  buyerName?: string
): number {
  if (!buyerId && !buyerName) return 0;
  const normId = (buyerId || '').trim().toLowerCase();
  const normName = (buyerName || '').trim().toLowerCase();

  const isMatch = (cId?: string, cName?: string) => {
    const id = (cId || '').trim().toLowerCase();
    const name = (cName || '').trim().toLowerCase();
    return (
      (normId && (id === normId || name === normId)) ||
      (normName && (id === normName || name === normName))
    );
  };

  const buyerTrxs = (transactions || []).filter((t) => isMatch(t.buyerId, t.buyerName));
  if (buyerTrxs.length === 0) return 0;

  // 1. حساب إجمالي فواتير الآجل وغير المسددة نقداً في نقطة البيع
  let totalCreditRequired = 0;
  let totalPaidAtPos = 0;

  buyerTrxs.forEach((t) => {
    const resoldInfo = getResoldDetails(t);
    if (resoldInfo.isResold && resoldInfo.isSettled) return;

    const total = Number(t.totalFromBuyer) || 0;
    const isFullCash = t.settlementType === 'cash' || t.settlementType === 'association_cash';
    const isAdvance = t.settlementType === 'buyer_advance';

    if (isFullCash || isAdvance) {
      return;
    }

    if (t.settlementType === 'partial_cash') {
      totalCreditRequired += total;
      totalPaidAtPos += Math.max(0, Number(t.paidAtPosBuyerAmount) || 0);
    } else {
      totalCreditRequired += total;
    }
  });

  // 2. إجمالي كافة سندات السداد المقبوضة من المشتري في الصندوق
  const totalRepayments = (cashEntries || [])
    .filter((c) => {
      if (c.type !== 'buyer_debt_repayment' && c.type !== 'buyer_advance_repayment') return false;
      return isMatch(c.contactId, c.contactName);
    })
    .reduce((sum, c) => sum + (c.amount || 0), 0);

  // 3. صافي الدين = إجمالي المشتريات الآجلة - (المدفوع بنقطة البيع + كافة سندات السداد بالصندوق)
  const netDebt = Math.max(0, totalCreditRequired - totalPaidAtPos - totalRepayments);

  if (totalRepayments === 0) {
    const rawDebt = buyerTrxs.reduce((sum, t) => sum + Math.max(0, getTransactionBuyerDebt(t)), 0);
    return rawDebt;
  }

  return netDebt;
}

/**
 * Repairs stale buyer debt fields in memory and marks transactions that need persistence.
 * معالجة وتصحيح الفواتير التي أُغلقت خطأً عند سداد دفعة عامة جزئية من الدين
 */
export function normalizeBuyerDebtFields(
  trxs: Transaction[],
  cashEntries: CashEntry[] = []
): {
  updatedTrxs: Transaction[];
  hasChanges: boolean;
} {
  let hasChanges = false;

  // خريطة سندات السداد المرتبطة بفواتير محددة
  const linkedCashTrxIds = new Set<string>();
  (cashEntries || []).forEach((c) => {
    if (c.transactionId) linkedCashTrxIds.add(c.transactionId);
    if (c.referenceId) linkedCashTrxIds.add(c.referenceId);
  });

  const updatedTrxs = (trxs || []).map((transaction) => {
    const isCredit = transaction.settlementType === 'association_credit';
    const total = Number(transaction.totalFromBuyer) || 0;

    // فحص ما إذا كانت الفاتورة أُغلقت خطأً دون سداد كامل الحساب ودون وجود سند سداد خاص بها
    if (
      isCredit &&
      (transaction.paymentStatus === 'paid' || transaction.buyerRemainingDebt === 0) &&
      !linkedCashTrxIds.has(transaction.id) &&
      !(transaction.buyerAdvanceUsed && transaction.buyerAdvanceUsed >= total)
    ) {
      const currentNetDebt = calculateBuyerTotalDebt(
        trxs,
        cashEntries,
        transaction.buyerId,
        transaction.buyerName
      );

      // إذا كان المشتري لا يزال مديناً، تُعاد الفاتورة لحالتها الأصلية غير المسددة
      if (currentNetDebt > 0) {
        hasChanges = true;
        return {
          ...transaction,
          buyerRemainingDebt: total,
          buyerPaidAmount: 0,
          paymentStatus: 'pending',
          isEdited: false,
        } as Transaction;
      }
    }

    const debt = getTransactionBuyerDebt(transaction);

    const updates: Partial<Transaction> = {};
    if (typeof transaction.buyerRemainingDebt !== 'number' || transaction.buyerRemainingDebt !== debt) {
      updates.buyerRemainingDebt = debt;
    }
    if (isCredit && debt > 0 && transaction.paymentStatus !== 'partial' && transaction.paymentStatus !== 'debt') {
      updates.paymentStatus = 'pending' as any;
    }
    if (isCredit && debt <= 0 && transaction.paymentStatus !== 'paid' && transaction.paymentStatus !== 'settled') {
      updates.paymentStatus = 'paid' as any;
    }

    if (Object.keys(updates).length === 0) return transaction;
    hasChanges = true;
    return { ...transaction, ...updates } as Transaction;
  });

  return { updatedTrxs, hasChanges };
}

/**
 * مطابقة وتسوية ديون المشترين بدقة تامة مع سندات السداد المقبوضة بالصندوق (FIFO)
 * تضمن عدم ضياع أي مبالغ سداد مقبوضة وتوزيعها بدقة على فواتير المشتري من الأقدم إلى الأحدث
 */
export function reconcileBuyerDebtsWithCashEntries(
  trxs: Transaction[],
  cash: CashEntry[]
): { updatedTrxs: Transaction[]; hasChanges: boolean } {
  const debtRepayments = (cash || []).filter((c) => c.type === 'buyer_debt_repayment' || c.type === 'buyer_advance_repayment');
  if (!debtRepayments.length) return { updatedTrxs: trxs, hasChanges: false };

  const buyerCashMap = new Map<string, number>();
  debtRepayments.forEach((c) => {
    const name = (c.contactName || '').trim().toLowerCase();
    if (name) {
      buyerCashMap.set(name, (buyerCashMap.get(name) || 0) + (c.amount || 0));
    }
  });

  let hasChanges = false;
  const updatedMap = new Map<string, Transaction>();

  for (const [normName, totalCashRepaid] of buyerCashMap.entries()) {
    if (totalCashRepaid <= 0) continue;

    const buyerTrxs = (trxs || [])
      .filter((t) => (t.buyerName || '').trim().toLowerCase() === normName)
      .sort((a, b) => {
        const aTs = Number(a.timestamp) || (a.dateStr ? new Date(a.dateStr.replace(/\//g, '-')).getTime() : 0);
        const bTs = Number(b.timestamp) || (b.dateStr ? new Date(b.dateStr.replace(/\//g, '-')).getTime() : 0);
        return aTs - bTs;
      });

    if (buyerTrxs.length === 0) continue;

    const currentTrxPaid = buyerTrxs.reduce((sum, t) => sum + (t.buyerPaidAmount || 0), 0);
    const totalInvoiced = buyerTrxs.reduce((sum, t) => sum + (t.totalFromBuyer || 0), 0);
    const posPaid = buyerTrxs.reduce(
      (sum, t) => sum + (t.paidAtPosBuyerAmount && t.settlementType !== 'association_credit' ? t.paidAtPosBuyerAmount : 0),
      0
    );

    const expectedPaid = Math.min(totalInvoiced, posPaid + totalCashRepaid);
    if (Math.abs(currentTrxPaid - expectedPaid) > 1) {
      hasChanges = true;
      let availableRepay = totalCashRepaid;

      for (const t of buyerTrxs) {
        if (t.isEdited) continue; // Respect explicit user manual edits
        const invTotal = t.totalFromBuyer || 0;
        const initialPos = t.paidAtPosBuyerAmount && t.settlementType !== 'association_credit' ? t.paidAtPosBuyerAmount : 0;
        const maxRepayForTrx = Math.max(0, invTotal - initialPos);

        const repayAmt = Math.min(availableRepay, maxRepayForTrx);
        availableRepay -= repayAmt;
        const newPaid = initialPos + repayAmt;
        const newDebt = Math.max(0, invTotal - newPaid);
        const newStatus: 'paid' | 'pending' | 'settled' | 'partial' =
          newDebt === 0 ? 'paid' : newPaid > 0 ? 'partial' : 'pending';

        if (t.buyerPaidAmount !== newPaid || t.buyerRemainingDebt !== newDebt || t.paymentStatus !== newStatus) {
          updatedMap.set(t.id, {
            ...t,
            buyerPaidAmount: newPaid,
            buyerRemainingDebt: newDebt,
            paymentStatus: newStatus as any,
          });
        }
      }
    }
  }

  if (!hasChanges) return { updatedTrxs: trxs, hasChanges: false };

  const updatedTrxs = trxs.map((t) => updatedMap.get(t.id) || t);
  return { updatedTrxs, hasChanges: true };
}
