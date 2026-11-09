/**
 * operationsService.ts
 * 
 * المحرك المحاسبي المركزي الموحد لإدارة كافة العمليات في سوق حراج الأسماك:
 * 1. حفظ الفواتير (Save Transaction) مع منع التكرار اللحظي التام
 * 2. تعديل الفواتير (Update Transaction) ومزامنة الصندوق تلقائياً
 * 3. حذف الفواتير (Delete Transaction) وإلغاء القيود المرتبطة بأمان
 * 4. تسديد ديون المشترين (Buyer Debt Repayments) وتوليد سندات القبض بدقة (FIFO)
 * 5. صرف مستحقات الصيادين (Seller/Fisherman Payouts) ومقاصة السلف
 * 6. حذف وتعديل سندات الصندوق وإعادة قيد المبالغ تلقائياً
 */

import { Transaction, CashEntry, Contact } from '../types';
import {
  formatCurrency,
  formatGregorianDate,
  formatGregorianTime,
  getTodayLocalYMD,
  getTransactionBuyerDebt,
  normalizeArabic,
} from '../utils/calculations';
import {
  dedupeTransactionCashEntriesWithRemoved,
  removeTransactionLinkedCashEntries,
} from '../utils/cashEntrySync';

// ============================================================================
// 1. حفظ الفاتورة (Save Transaction)
// ============================================================================
export interface SaveTransactionResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  newCashEntriesToPersist: CashEntry[];
  updatedOriginalTrxToPersist?: Transaction;
}

export function executeSaveTransaction(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  newTrx: Transaction,
  updatedOriginalTrx?: Transaction
): SaveTransactionResult {
  // منع التكرار تماماً: إزالة أي فاتورة سابقة بنفس الـ ID قبل الإضافة
  let updatedTrxs = [newTrx, ...currentTransactions.filter((t) => t.id !== newTrx.id)];

  let updatedOrig: Transaction | undefined;
  if (updatedOriginalTrx) {
    updatedOrig = updatedOriginalTrx;
    updatedTrxs = updatedTrxs.map((t) => (t.id === updatedOriginalTrx.id ? updatedOriginalTrx : t));
  }

  const newCashEntriesToPersist: CashEntry[] = [];
  const now = new Date();

  // إذا كانت العملية إعادة بيع شروة، يُضاف الفائض والعمولة تلقائياً لدرج الكاش وصندوق النقدية إذا تم الدفع نقداً
  if (
    newTrx.isResale &&
    (newTrx.paymentStatus === 'paid' || (newTrx.paidAtPosBuyerAmount && newTrx.paidAtPosBuyerAmount > 0))
  ) {
    if (newTrx.resaleSurplus && newTrx.resaleSurplus > 0) {
      newCashEntriesToPersist.push({
        id: `CASH-${Date.now().toString().slice(-6)}`,
        timestamp: Date.now(),
        dateStr: getTodayLocalYMD(now),
        timeStr: newTrx.timeStr || formatGregorianTime(now),
        type: 'deposit',
        category: 'فائض بيع شروة',
        amount: newTrx.resaleSurplus,
        description: `إيداع فائض إعادة بيع شروة #${newTrx.resoldFromTransactionId || ''} لمشتري جديد (${newTrx.buyerName}) برقم فاتورة #${newTrx.id}`,
        performedBy: 'أمين الصندوق',
        contactId: newTrx.buyerId,
        contactName: newTrx.buyerName,
        transactionId: newTrx.id,
        referenceId: newTrx.resoldFromTransactionId,
      });
    }

    if (newTrx.harajProfit && newTrx.harajProfit > 0) {
      newCashEntriesToPersist.push({
        id: `CASH-${(Date.now() + 1).toString().slice(-6)}`,
        timestamp: Date.now() + 1,
        dateStr: getTodayLocalYMD(now),
        timeStr: newTrx.timeStr || formatGregorianTime(now),
        type: 'deposit',
        category: 'عمولة بيع شروة',
        amount: newTrx.harajProfit,
        description: `إيداع عمولة إعادة بيع شروة #${newTrx.resoldFromTransactionId || ''} لمشتري جديد (${newTrx.buyerName}) برقم فاتورة #${newTrx.id}`,
        performedBy: 'أمين الصندوق',
        contactId: newTrx.buyerId,
        contactName: newTrx.buyerName,
        transactionId: newTrx.id,
        referenceId: newTrx.resoldFromTransactionId,
      });
    }
  }

  const nextCashEntries =
    newCashEntriesToPersist.length > 0
      ? [...newCashEntriesToPersist, ...currentCashEntries]
      : currentCashEntries;

  return {
    nextTransactions: updatedTrxs,
    nextCashEntries,
    newCashEntriesToPersist,
    updatedOriginalTrxToPersist: updatedOrig,
  };
}

// ============================================================================
// 2. تعديل الفاتورة (Update Transaction)
// ============================================================================
export interface UpdateTransactionResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  cashEntriesToPersist: CashEntry[];
  cashEntryIdsToDelete: string[];
  finalUpdatedTrx: Transaction;
  settledOriginalTrx?: Transaction;
}

export function executeUpdateTransaction(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  updatedTrx: Transaction
): UpdateTransactionResult {
  const finalTrx: Transaction = {
    ...updatedTrx,
    isEdited: updatedTrx.isTransferred ? false : (updatedTrx.isEdited !== undefined ? updatedTrx.isEdited : true),
    editedAt: updatedTrx.editedAt || Date.now(),
    editedDateStr: updatedTrx.editedDateStr || formatGregorianDate(new Date()),
  };

  let settledOriginalTrx: Transaction | undefined;
  let nextTransactions = currentTransactions.map((t) => (t.id === finalTrx.id ? finalTrx : t));

  // إذا كانت هذه فاتورة إعادة بيع وتم سدادها بالكامل، تسوى الشروة الأصلية آلياً
  if (finalTrx.isResale && finalTrx.resoldFromTransactionId) {
    const isResalePaid =
      finalTrx.paymentStatus === 'paid' ||
      (finalTrx.buyerRemainingDebt !== undefined && finalTrx.buyerRemainingDebt <= 0);

    if (isResalePaid) {
      nextTransactions = nextTransactions.map((t) => {
        if (t.id === finalTrx.resoldFromTransactionId) {
          const origGross = t.grossAmount || 0;
          const resoldGross = finalTrx.grossAmount || 0;
          const isPriceIncreased = resoldGross > origGross;
          const origPaid = t.buyerPaidAmount || 0;
          const remainingTax = Math.max(0, (t.buyerTaxAmount || 0) - origPaid);
          const targetDebt = isPriceIncreased ? 0 : remainingTax;

          const audit = `[تمت تسوية الشروة آلياً بسداد المشتري الجديد (${finalTrx.buyerName}) للفاتورة #${finalTrx.id}${
            !isPriceIncreased && targetDebt > 0 ? ` - يتبقى سداد الضريبة السابقة بمبلغ ${targetDebt}` : ''
          }]`;

          settledOriginalTrx = {
            ...t,
            paymentStatus: targetDebt <= 0 ? 'settled' : 'pending',
            buyerRemainingDebt: targetDebt,
            resoldPaymentStatus: 'paid',
            notes: t.notes && !t.notes.includes(finalTrx.id) ? `${t.notes}\n${audit}` : (t.notes || audit),
            isEdited: true,
            editedAt: Date.now(),
          };
          return settledOriginalTrx;
        }
        return t;
      });
    }
  }

  // مزامنة سندات تسليم مستحقات الصياد (seller_payout) مع الفاتورة المعدلة
  const targetSellerPaid =
    typeof finalTrx.sellerPaidAmount === 'number'
      ? finalTrx.sellerPaidAmount
      : typeof finalTrx.paidAtPosAmount === 'number'
      ? finalTrx.paidAtPosAmount
      : finalTrx.sellerPaidStatus === 'unpaid'
      ? 0
      : finalTrx.netToSeller || 0;

  const { kept: dedupedEntries, removed: removedByDedupe } = dedupeTransactionCashEntriesWithRemoved(
    [...currentCashEntries],
    finalTrx.id
  );

  let nextCashEntries = dedupedEntries;
  const cashEntryIdsToDelete: string[] = removedByDedupe.map((re) => re.id);
  const cashEntriesToPersist: CashEntry[] = [];

  const linkedPayoutEntries = nextCashEntries.filter(
    (e) =>
      e.type === 'seller_payout' &&
      (e.transactionId === finalTrx.id ||
        e.referenceId === finalTrx.id ||
        (e.description && e.description.includes(finalTrx.id)))
  );

  if (linkedPayoutEntries.length > 0) {
    if (targetSellerPaid <= 0) {
      // تم إلغاء صرف مستحقات الصياد وتحويلها لدين آجل -> إزالة السندات
      nextCashEntries = nextCashEntries.filter(
        (e) => !linkedPayoutEntries.some((le) => le.id === e.id)
      );
      linkedPayoutEntries.forEach((le) => cashEntryIdsToDelete.push(le.id));
    } else {
      // تعديل السند الأساسي ليطابق المبلغ الجديد
      const primaryEntry = linkedPayoutEntries[0];
      const otherEntries = linkedPayoutEntries.slice(1);

      if (otherEntries.length > 0) {
        nextCashEntries = nextCashEntries.filter(
          (e) => !otherEntries.some((oe) => oe.id === e.id)
        );
        otherEntries.forEach((oe) => cashEntryIdsToDelete.push(oe.id));
      }

      const updatedPrimary: CashEntry = {
        ...primaryEntry,
        amount: targetSellerPaid,
        transactionId: finalTrx.id,
        referenceId: finalTrx.id,
        contactId: finalTrx.sellerId,
        contactName: finalTrx.sellerName,
        description: `تسليم مستحقات الصياد ${
          finalTrx.sellerPayoutMethod === 'exchange'
            ? `عبر الصرافة (${finalTrx.sellerExchangeName || 'حوالة صرافة'})`
            : 'نقداً'
        }: ${finalTrx.sellerName || 'صياد'} - تسليم وصرف مستحقات الفاتورة #${finalTrx.id}`,
        payoutMethod: finalTrx.sellerPayoutMethod || primaryEntry.payoutMethod || 'cash',
        exchangeName: finalTrx.sellerPayoutMethod === 'exchange' ? finalTrx.sellerExchangeName : undefined,
        category:
          finalTrx.sellerPayoutMethod === 'exchange'
            ? 'تسليم مستحقات عبر الصرافة'
            : 'تسليم مستحقات صياد',
      };

      nextCashEntries = nextCashEntries.map((e) =>
        e.id === updatedPrimary.id ? updatedPrimary : e
      );
      cashEntriesToPersist.push(updatedPrimary);
    }
  } else if (finalTrx.settlementType === 'association_credit' && targetSellerPaid > 0) {
    // فاتورة آجل مع تسليم فوري لمستحقات الصياد من الصندوق -> إنشاء سند صرف
    const now = new Date();
    const newPayoutEntry: CashEntry = {
      id: `PAY-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: finalTrx.dateStr || getTodayLocalYMD(now),
      timeStr: finalTrx.timeStr || formatGregorianTime(now),
      type: 'seller_payout',
      category:
        finalTrx.sellerPayoutMethod === 'exchange'
          ? 'تسليم مستحقات عبر الصرافة'
          : 'تسليم مستحقات صياد',
      amount: targetSellerPaid,
      description: `تسليم مستحقات الصياد ${
        finalTrx.sellerPayoutMethod === 'exchange'
          ? `عبر الصرافة (${finalTrx.sellerExchangeName || 'حوالة صرافة'})`
          : 'نقداً'
      }: ${finalTrx.sellerName || 'صياد'} - تسليم وصرف مستحقات الفاتورة #${finalTrx.id}`,
      performedBy: 'أمين الصندوق',
      contactId: finalTrx.sellerId,
      contactName: finalTrx.sellerName,
      transactionId: finalTrx.id,
      referenceId: finalTrx.id,
      payoutMethod: finalTrx.sellerPayoutMethod || 'cash',
      exchangeName: finalTrx.sellerPayoutMethod === 'exchange' ? finalTrx.sellerExchangeName : undefined,
    };
    nextCashEntries = [newPayoutEntry, ...nextCashEntries];
    cashEntriesToPersist.push(newPayoutEntry);
  }

  return {
    nextTransactions,
    nextCashEntries,
    cashEntriesToPersist,
    cashEntryIdsToDelete,
    finalUpdatedTrx: finalTrx,
    settledOriginalTrx,
  };
}

// ============================================================================
// 3. حذف الفاتورة (Delete Transaction)
// ============================================================================
export interface DeleteTransactionResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  removedCashEntryIds: string[];
}

export function executeDeleteTransaction(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  transactionId: string
): DeleteTransactionResult {
  if (!transactionId) {
    return {
      nextTransactions: currentTransactions,
      nextCashEntries: currentCashEntries,
      removedCashEntryIds: [],
    };
  }

  // 1. حذف الفاتورة من السجل
  const nextTransactions = currentTransactions.filter((t) => t.id !== transactionId);

  // 2. إزالة السندات المرتبطة حصراً بهذه الفاتورة (مثل صرف مستحقات الصياد أو فوائض البيع) لاستعادة رصيد الصندوق بدقة
  const linkedCashEntries = removeTransactionLinkedCashEntries(currentCashEntries, transactionId);
  const removedEntries = currentCashEntries.filter((entry) => linkedCashEntries.every((e) => e.id !== entry.id));
  const removedCashEntryIds = removedEntries.map((e) => e.id);

  return {
    nextTransactions,
    nextCashEntries: linkedCashEntries,
    removedCashEntryIds,
  };
}

// ============================================================================
// 4. تسديد ديون المشترين وسندات القبض (Buyer Debt Repayment - FIFO)
// ============================================================================
export interface RepayBuyerDebtResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  newCashEntry: CashEntry;
  modifiedTransactions: Transaction[];
}

export function executeRepayBuyerDebt(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  buyerId: string,
  buyerName: string,
  amount: number,
  currency: string = 'ريال يمني',
  notes?: string,
  repaymentMethod: 'cash' | 'exchange' = 'cash',
  exchangeName?: string,
  targetTransactionId?: string
): RepayBuyerDebtResult {
  if (amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }

  const normTargetId = (buyerId || '').trim().toLowerCase();
  const normTargetName = (buyerName || '').trim().toLowerCase();
  const hasSpecificTarget = Boolean(targetTransactionId && targetTransactionId !== 'ALL');

  let remainingToRepay = amount;
  const affectedTransactions: { id: string; advanceUsed?: number; debtPaid: number; remainingAfter: number }[] = [];
  const updatedMap = new Map<string, Transaction>();

  const isBuyerMatch = (t: Transaction) => {
    const normTrxId = (t.buyerId || '').trim().toLowerCase();
    const normTrxName = (t.buyerName || '').trim().toLowerCase();
    return (
      (normTargetId && (normTrxId === normTargetId || normTrxName === normTargetId)) ||
      (normTargetName && (normTrxId === normTargetName || normTrxName === normTargetName))
    );
  };

  // 1. سداد الفاتورة المحددة بالاسم أولاً إن وُجدت
  if (hasSpecificTarget) {
    const targetTrx = currentTransactions.find((t) => t.id === targetTransactionId);
    if (targetTrx && remainingToRepay > 0) {
      const currentDebt = getTransactionBuyerDebt(targetTrx);
      if (currentDebt > 0) {
        const deduct = Math.min(remainingToRepay, currentDebt);
        remainingToRepay -= deduct;
        const newDebt = Math.max(0, currentDebt - deduct);
        const newPaid = (targetTrx.buyerPaidAmount || 0) + deduct;
        const newStatus: 'paid' | 'pending' | 'settled' =
          newDebt === 0 ? 'paid' : 'pending';

        affectedTransactions.push({
          id: targetTrx.id,
          advanceUsed: targetTrx.buyerAdvanceUsed,
          debtPaid: deduct,
          remainingAfter: newDebt,
        });

        updatedMap.set(targetTrx.id, {
          ...targetTrx,
          buyerPaidAmount: newPaid,
          buyerRemainingDebt: newDebt,
          paymentStatus: newStatus as any,
        });
      }
    }
  }

  // 2. إذا تبقى أي مبلغ (أو لم تحدد فاتورة معينة)، يوزع تلقائياً على فواتير المشتري غير المسددة من الأقدم للأحدث (FIFO)
  if (remainingToRepay > 0) {
    const otherUnpaid = currentTransactions
      .filter((t) => isBuyerMatch(t) && (!hasSpecificTarget || t.id !== targetTransactionId))
      .sort((a, b) => {
        const aTs = Number(a.timestamp) || (a.dateStr ? new Date(a.dateStr.replace(/\//g, '-')).getTime() : 0);
        const bTs = Number(b.timestamp) || (b.dateStr ? new Date(b.dateStr.replace(/\//g, '-')).getTime() : 0);
        return aTs - bTs; // الأقدم أولاً
      });

    for (const t of otherUnpaid) {
      if (remainingToRepay <= 0) break;
      const currentDebt = getTransactionBuyerDebt(t);
      if (currentDebt > 0) {
        const deduct = Math.min(remainingToRepay, currentDebt);
        remainingToRepay -= deduct;
        const newDebt = Math.max(0, currentDebt - deduct);
        const newPaid = (t.buyerPaidAmount || 0) + deduct;
        const newStatus: 'paid' | 'pending' | 'settled' =
          newDebt === 0 ? 'paid' : 'pending';

        affectedTransactions.push({
          id: t.id,
          advanceUsed: t.buyerAdvanceUsed,
          debtPaid: deduct,
          remainingAfter: newDebt,
        });

        updatedMap.set(t.id, {
          ...t,
          buyerPaidAmount: newPaid,
          buyerRemainingDebt: newDebt,
          paymentStatus: newStatus as any,
        });
      }
    }
  }

  const modifiedTransactions: Transaction[] = [];
  let updatedTrxs = currentTransactions.map((t) => {
    const modified = updatedMap.get(t.id);
    if (modified) {
      modifiedTransactions.push(modified);
      return modified;
    }
    return t;
  });

  // إذا تم سداد فاتورة إعادة بيع، نقوم بتسوية الشروة الأصلية تلقائياً
  const repaidResaleList = updatedTrxs
    .filter((t) => t.isResale && t.resoldFromTransactionId)
    .map((t) => {
      const at = affectedTransactions.find((a) => a.id === t.id);
      if (at && at.debtPaid > 0) {
        return {
          resaleTrxId: t.id,
          debtPaid: at.debtPaid,
          isFullyPaid: t.paymentStatus === 'paid' || (t.buyerRemainingDebt !== undefined && t.buyerRemainingDebt <= 0),
          newBuyerName: t.buyerName || '',
        };
      }
      return null;
    })
    .filter(Boolean) as { resaleTrxId: string; debtPaid: number; isFullyPaid: boolean; newBuyerName: string }[];

  if (repaidResaleList.length > 0) {
    const resaleMap = new Map<string, { debtPaid: number; isFullyPaid: boolean; newBuyerName: string; resaleTrxId: string }>();
    updatedTrxs.forEach((t) => {
      if (t.isResale && t.resoldFromTransactionId) {
        const item = repaidResaleList.find((r) => r.resaleTrxId === t.id);
        if (item) {
          resaleMap.set(t.resoldFromTransactionId, item);
        }
      }
    });

    if (resaleMap.size > 0) {
      updatedTrxs = updatedTrxs.map((t) => {
        const info = resaleMap.get(t.id);
        if (info) {
          const curDebt = t.buyerRemainingDebt !== undefined
            ? t.buyerRemainingDebt
            : (t.paymentStatus === 'pending' ? t.totalFromBuyer : 0);
          const newDebt = info.isFullyPaid ? 0 : Math.max(0, curDebt - info.debtPaid);
          const newStatus = (info.isFullyPaid || newDebt === 0) ? 'settled' : (t.paymentStatus === 'paid' ? 'paid' : 'pending');
          const audit = `[تمت تسوية الشروة آلياً بسداد المشتري الجديد (${info.newBuyerName}) للفاتورة #${info.resaleTrxId}]`;
          const updatedOrig: Transaction = {
            ...t,
            buyerRemainingDebt: newDebt,
            paymentStatus: newStatus as any,
            resoldPaymentStatus: (info.isFullyPaid || newDebt === 0) ? 'paid' : t.resoldPaymentStatus,
            notes: t.notes && !t.notes.includes(info.resaleTrxId) ? `${t.notes}\n${audit}` : (t.notes || audit),
            isEdited: true,
            editedAt: Date.now(),
          };
          modifiedTransactions.push(updatedOrig);
          return updatedOrig;
        }
        return t;
      });
    }
  }

  // إنشاء سند القبض الحقيقي الوحيد في الصندوق
  const isExchange = repaymentMethod === 'exchange';
  let autoDesc = isExchange
    ? `سداد دين المشتري عبر الصرافة (${exchangeName?.trim() || 'حوالة صرافة'}): ${buyerName}`
    : `سداد دين المشتري: ${buyerName}`;

  if (hasSpecificTarget) {
    autoDesc += ` (سداد فاتورة/شروة #${targetTransactionId})`;
  }

  const advanceBreakdown = affectedTransactions
    .filter((at) => at.advanceUsed && at.advanceUsed > 0)
    .map((at) => `فاتورة #${at.id} (خصم سابق من القدمة: ${formatCurrency(at.advanceUsed!, currency)}، وسداد متبقي: ${formatCurrency(at.debtPaid, currency)}${at.remainingAfter === 0 ? ' - تم تصفيتها بالكامل' : ''})`)
    .join(' | ');

  if (advanceBreakdown) {
    autoDesc += ` [${advanceBreakdown}]`;
  }
  if (notes) {
    autoDesc += ` - ${notes}`;
  }

  const now = new Date();
  const newEntry: CashEntry = {
    id: `CASH-${Date.now().toString().slice(-6)}`,
    timestamp: Date.now(),
    dateStr: getTodayLocalYMD(now),
    timeStr: formatGregorianTime(now),
    type: 'buyer_debt_repayment',
    category: isExchange ? 'سداد دين عبر الصرافة' : 'سداد دين مشتري',
    amount,
    description: autoDesc,
    performedBy: 'أمين الصندوق',
    contactId: buyerId,
    contactName: buyerName,
    transactionId: hasSpecificTarget ? targetTransactionId : undefined,
    referenceId: hasSpecificTarget ? targetTransactionId : undefined,
    payoutMethod: isExchange ? 'exchange' : 'cash',
    repaymentMethod: isExchange ? 'exchange' : 'cash',
    exchangeName: isExchange ? exchangeName?.trim() : undefined,
  };

  const nextCashEntries = [newEntry, ...currentCashEntries];

  return {
    nextTransactions: updatedTrxs,
    nextCashEntries,
    newCashEntry: newEntry,
    modifiedTransactions,
  };
}

// ============================================================================
// 5. صرف مستحقات الصيادين ومقاصة السلف (Seller/Fisherman Payouts)
// ============================================================================
export interface PayoutSellerResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  newCashEntriesToPersist: CashEntry[];
  modifiedTransactions: Transaction[];
  payoutEntry?: CashEntry;
  settlementEntry?: CashEntry;
}

export function executePayoutSeller(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  sellerId: string,
  sellerName: string,
  amount: number, // Net cash/exchange to disburse
  notes?: string,
  settleAdvanceAmount: number = 0, // Amount to offset against fisherman's advance
  targetTransactionId?: string,
  payoutMethod: 'cash' | 'exchange' = 'cash',
  exchangeName?: string
): PayoutSellerResult {
  const totalToDeductFromCatch = (amount || 0) + (settleAdvanceAmount || 0);
  if (totalToDeductFromCatch <= 0) {
    return {
      nextTransactions: currentTransactions,
      nextCashEntries: currentCashEntries,
      newCashEntriesToPersist: [],
      modifiedTransactions: [],
    };
  }

  const normTargetId = (sellerId || '').trim().toLowerCase();
  const normTargetName = normalizeArabic(sellerName || '');

  let remainingToPay = totalToDeductFromCatch;
  const modifiedTransactions: Transaction[] = [];

  const nextTransactions = currentTransactions.map((t) => {
    if (targetTransactionId && t.id !== targetTransactionId) {
      return t;
    }

    const normTrxId = (t.sellerId || '').trim().toLowerCase();
    const normTrxName = normalizeArabic(t.sellerName || '');

    const isSellerMatch =
      (normTargetId && normTrxId === normTargetId) ||
      (normTargetName && (normTrxName === normTargetName || normTrxName.includes(normTargetName) || normTargetName.includes(normTrxName)));

    if (isSellerMatch && remainingToPay > 0 && t.settlementType !== 'direct_cash') {
      const netDue = t.netToSeller;
      const currentPaid =
        t.sellerPaidStatus === 'paid'
          ? netDue
          : (typeof t.sellerPaidAmount === 'number'
              ? t.sellerPaidAmount
              : (typeof t.paidAtPosAmount === 'number' ? t.paidAtPosAmount : 0));
      const unpaidForTrx = Math.max(0, netDue - currentPaid);

      if (unpaidForTrx > 0) {
        const deduct = Math.min(remainingToPay, unpaidForTrx);
        remainingToPay -= deduct;
        const newPaid = currentPaid + deduct;
        const newStatus: 'paid' | 'unpaid' | 'partial' =
          newPaid >= netDue ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

        const updatedT: Transaction = {
          ...t,
          sellerPaidAmount: newPaid,
          sellerPaidStatus: newStatus,
          ...(payoutMethod === 'exchange'
            ? {
                sellerPayoutMethod: 'exchange',
                sellerExchangeName: exchangeName?.trim() || undefined,
              }
            : {}),
        };
        modifiedTransactions.push(updatedT);
        return updatedT;
      }
    }
    return t;
  });

  const now = new Date();
  const newCashEntriesToPersist: CashEntry[] = [];
  let settlementEntry: CashEntry | undefined;
  let payoutEntry: CashEntry | undefined;

  // 1. في حال وجود مقاصة سلفة
  if (settleAdvanceAmount > 0) {
    settlementEntry = {
      id: `SETTLE-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'seller_advance_repayment',
      category: 'تسوية ومقاصة سلفة صياد',
      amount: settleAdvanceAmount,
      description: `تسوية ومقاصة سلفة صياد بالخصم من مستحقات صيد: ${sellerName}${notes ? ` - ${notes}` : ''}`,
      performedBy: 'أمين الصندوق',
      contactId: sellerId,
      contactName: sellerName,
    };
    newCashEntriesToPersist.push(settlementEntry);
  }

  // 2. في حال وجود صرف نقدية
  if (amount > 0) {
    payoutEntry = {
      id: `PAY-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now() + 1,
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'seller_payout',
      category: payoutMethod === 'exchange' ? 'تسليم مستحقات عبر الصرافة' : 'تسليم مستحقات صياد',
      amount,
      description: `تسليم مستحقات الصياد ${
        payoutMethod === 'exchange' ? `عبر الصرافة (${exchangeName || 'حوالة صرافة'})` : 'نقداً'
      }: ${sellerName}${settleAdvanceAmount > 0 ? ` (بعد مقاصة سلفة بقيمة ${settleAdvanceAmount} ريال)` : ''}${
        notes ? ` - ${notes}` : ''
      }`,
      performedBy: 'أمين الصندوق',
      contactId: sellerId,
      contactName: sellerName,
      transactionId: targetTransactionId,
      referenceId: targetTransactionId,
      payoutMethod,
      exchangeName: exchangeName?.trim() || undefined,
    };
    newCashEntriesToPersist.push(payoutEntry);
  }

  const nextCashEntries = [...newCashEntriesToPersist, ...currentCashEntries];

  return {
    nextTransactions,
    nextCashEntries,
    newCashEntriesToPersist,
    modifiedTransactions,
    payoutEntry,
    settlementEntry,
  };
}

// ============================================================================
// 6. حذف سند من الصندوق وإعادة قيد المبالغ تلقائياً (Delete Cash Entry)
// ============================================================================
export interface DeleteCashEntryResult {
  nextTransactions: Transaction[];
  nextCashEntries: CashEntry[];
  modifiedTransactions: Transaction[];
  deletedEntryId: string;
}

export function executeDeleteCashEntry(
  currentTransactions: Transaction[],
  currentCashEntries: CashEntry[],
  cashEntryId: string
): DeleteCashEntryResult {
  const entryToDelete = currentCashEntries.find((e) => e.id === cashEntryId);
  const nextCashEntries = currentCashEntries.filter((e) => e.id !== cashEntryId);
  const modifiedTransactions: Transaction[] = [];

  let nextTransactions = [...currentTransactions];

  // إذا كان السند المحذوف سداد دين مشتري، يُعاد قيد المبلغ ديناً على فواتير المشتري فوراً
  if (
    entryToDelete &&
    (entryToDelete.type === 'buyer_debt_repayment' || entryToDelete.type === 'buyer_advance_repayment')
  ) {
    const repayAmount = entryToDelete.amount || 0;
    const buyerId = entryToDelete.contactId;
    const buyerName = entryToDelete.contactName;
    const targetTrxId = entryToDelete.transactionId || entryToDelete.referenceId;

    let remainingToRevert = repayAmount;
    const now = new Date();

    // 1. إعادة الدين إلى الفاتورة المحددة بالسند إن وُجدت
    if (targetTrxId) {
      const trxIndex = nextTransactions.findIndex((t) => t.id === targetTrxId);
      if (trxIndex !== -1) {
        const t = nextTransactions[trxIndex];
        const curPaid = t.buyerPaidAmount || 0;
        const curDebt = t.buyerRemainingDebt || 0;
        const maxInvoiceAmount = t.totalFromBuyer || 0;
        const revertOnThis = Math.min(remainingToRevert, curPaid > 0 ? curPaid : maxInvoiceAmount);

        if (revertOnThis > 0) {
          remainingToRevert -= revertOnThis;
          const newPaid = Math.max(0, curPaid - revertOnThis);
          const newDebt = curDebt + revertOnThis;
          const newStatus: 'paid' | 'pending' | 'settled' = 'pending';
          const newSettlement = newPaid <= 0 ? 'association_credit' : t.settlementType;

          const updatedT: Transaction = {
            ...t,
            settlementType: newSettlement,
            buyerPaidAmount: newPaid,
            buyerRemainingDebt: newDebt,
            paidAtPosBuyerAmount:
              newSettlement === 'association_credit' ? 0 : Math.min(t.paidAtPosBuyerAmount || 0, newPaid),
            paymentStatus: newStatus as any,
            isEdited: true,
            editedAt: Date.now(),
            editedDateStr: formatGregorianDate(now),
          };
          nextTransactions[trxIndex] = updatedT;
          modifiedTransactions.push(updatedT);
        }
      }
    }

    // 2. إذا تبقّى مبلغ للإرجاع، يوزع لإعادة الدين على باقي فواتير المشتري (من الأحدث للأقدم - عكس السداد)
    if (remainingToRevert > 0 && (buyerId || buyerName)) {
      const isBuyerMatch = (t: Transaction) => {
        if (buyerId && t.buyerId && t.buyerId === buyerId) return true;
        if (buyerName && t.buyerName && t.buyerName.trim().toLowerCase() === buyerName.trim().toLowerCase()) return true;
        return false;
      };

      const matchingIndices = nextTransactions
        .map((t, idx) => ({ t, idx }))
        .filter(({ t }) => isBuyerMatch(t) && (!targetTrxId || t.id !== targetTrxId) && (t.buyerPaidAmount || 0) > 0)
        .sort((a, b) => (Number(b.t.timestamp) || 0) - (Number(a.t.timestamp) || 0));

      for (const { t, idx } of matchingIndices) {
        if (remainingToRevert <= 0) break;
        const curPaid = t.buyerPaidAmount || 0;
        const curDebt = t.buyerRemainingDebt || 0;
        const maxInvoiceAmount = t.totalFromBuyer || 0;
        const revertOnThis = Math.min(remainingToRevert, curPaid);

        if (revertOnThis > 0) {
          remainingToRevert -= revertOnThis;
          const newPaid = Math.max(0, curPaid - revertOnThis);
          const newDebt = curDebt + revertOnThis;
          const newStatus: 'paid' | 'pending' | 'settled' = 'pending';
          const newSettlement = newPaid <= 0 ? 'association_credit' : t.settlementType;

          const updatedT: Transaction = {
            ...t,
            settlementType: newSettlement,
            buyerPaidAmount: newPaid,
            buyerRemainingDebt: newDebt,
            paidAtPosBuyerAmount:
              newSettlement === 'association_credit' ? 0 : Math.min(t.paidAtPosBuyerAmount || 0, newPaid),
            paymentStatus: newStatus as any,
            isEdited: true,
            editedAt: Date.now(),
            editedDateStr: formatGregorianDate(now),
          };
          nextTransactions[idx] = updatedT;
          modifiedTransactions.push(updatedT);
        }
      }
    }
  }

  return {
    nextTransactions,
    nextCashEntries,
    modifiedTransactions,
    deletedEntryId: cashEntryId,
  };
}
