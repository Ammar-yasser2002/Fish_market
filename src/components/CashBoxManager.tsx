import React, { useState, useMemo, useEffect } from 'react';
import { AllDebtorsStatementModal } from './AllDebtorsStatementModal';
import { CashDayCloseRecord, CashEntry, CashEntryType, Contact, MarketSettings, Transaction } from '../types';
import { formatCurrency, formatNumber, tafqeet, formatArabicDayOnly, formatGregorianDate, formatGregorianTime, isSameCalendarDay, getTodayLocalYMD, normalizeArabic, calculateDrawerCash, getCarriedOverBalance, parseLocalDate, isTransactionResold, getTransactionBuyerDebt } from '../utils/calculations';
import { WhatsAppIcon } from '../utils/whatsapp';
import {
  Wallet,
  PlusCircle,
  MinusCircle,
  Receipt,
  Lock,
  Printer,
  Calendar,
  Search,
  Filter,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Coins,
  ShieldCheck,
  Building,
  Building2,
  FileSpreadsheet,
  X,
  FileCheck,
  HandCoins,
  Users,
  CreditCard,
  Zap,
  ChevronLeft,
  ArrowRight,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';

export const normalizeNumberInput = (val: string): string => {
  if (!val) return '';
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = val.replace(/[,،\s]/g, '');
  for (let i = 0; i < 10; i++) {
    res = res.replaceAll(arabicDigits[i], String(i));
  }
  return res;
};

interface CashBoxManagerProps {
  cashEntries: CashEntry[];
  cashClosings: CashDayCloseRecord[];
  transactions: Transaction[];
  contacts?: Contact[];
  settings: MarketSettings;
  onAddCashEntry: (entry: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => void;
  onDeleteCashEntry: (id: string) => void;
  onCloseDay: (closing: Omit<CashDayCloseRecord, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => void;
  onRepayBuyerDebt?: (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string,
    repaymentMethod?: 'cash' | 'exchange',
    exchangeName?: string,
    targetTransactionId?: string
  ) => void;
  onOffsetBuyerSalesDebt?: (
    buyerId: string,
    buyerName: string,
    surplusAction?: 'payout_cash' | 'deposit_advance',
    notes?: string
  ) => void;
  onSaveSellerAdvance?: (sellerId: string, sellerName: string, amount: number, notes?: string) => CashEntry | void;
  onRepaySellerAdvanceCash?: (sellerId: string, sellerName: string, amount: number, notes?: string) => CashEntry | void;
  onNavigateToBuyerStatement?: (buyerId: string) => void;
  onCashEntrySaved?: () => void;
  openOpeningRequest?: number;
}

const EXPENSE_CATEGORIES = [
  'رواتب عمال السوق',
  'سلف ومستحقات عمال',
  'شراء ثلج وتبريد',
  'وقود ومحروقات',
  'نثريات وضيافة',
  'صيانة ونظافة',
  'أدوات ومستلزمات حراج',
  'أخرى',
];

const DEPOSIT_CATEGORIES = [
  'فائض بيع شروة',
  'عمولة بيع شروة',
  'دعم سيولة نقدية',
  'سحب من البنك للدرج',
  'تحصيل خارجي يدوي',
  'أخرى',
];

const WITHDRAWAL_CATEGORIES = [
  'توريد بنكي',
  'تسليم أرباح للإدارة',
  'سحب عهدة',
  'أخرى',
];

export const CashBoxManager: React.FC<CashBoxManagerProps> = ({
  cashEntries,
  cashClosings,
  transactions,
  contacts = [],
  settings,
  onAddCashEntry,
  onDeleteCashEntry,
  onCloseDay,
  onRepayBuyerDebt,
  onOffsetBuyerSalesDebt,
  onSaveSellerAdvance,
  onRepaySellerAdvanceCash,
  onNavigateToBuyerStatement,
  onCashEntrySaved,
  openOpeningRequest,
}) => {
  // Modal states
  const [modalType, setModalType] = useState<
    | CashEntryType
    | 'closeDay'
    | 'printReport'
    | 'repayDebt'
    | 'debtorsList'
    | 'inflowBreakdown'
    | 'outflowBreakdown'
    | 'giveSellerAdvance'
    | 'repaySellerAdvance'
    | null
  >(null);

  const [drillDownInflowCategory, setDrillDownInflowCategory] = useState<
    'pos' | 'buyer_debt' | 'seller_advance' | 'deposit' | 'opening' | null
  >(null);

  const [drillDownOutflowCategory, setDrillDownOutflowCategory] = useState<
    'pos_payout' | 'seller_advances' | 'seller_payouts' | 'expenses' | 'withdrawals' | null
  >(null);

  // Form states for adding entry
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [entryFormError, setEntryFormError] = useState<string | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<CashEntry | null>(null);
  const [formDescription, setFormDescription] = useState('');
  const [formPerformedBy, setFormPerformedBy] = useState('أمين الصندوق');
  const [formWorkerName, setFormWorkerName] = useState('');
  const [formSalaryPeriod, setFormSalaryPeriod] = useState('');

  // Form states for Seller Advance & Repayment Modals (سلف الصيادين وسدادها نقداً)
  const [targetSellerId, setTargetSellerId] = useState('');
  const [targetSellerSearch, setTargetSellerSearch] = useState('');
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false);
  const [sellerAdvanceAmount, setSellerAdvanceAmount] = useState<number | ''>('');
  const [sellerAdvanceNotes, setSellerAdvanceNotes] = useState('');
  const [isSubmittingAdvance, setIsSubmittingAdvance] = useState(false);
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<CashEntry | null>(null);
  const [unifiedSellerAdvanceTab, setUnifiedSellerAdvanceTab] = useState<'repay' | 'give'>('repay');

  // Form states for Debt Repayment Modal (تسديد دين المشتري)
  const [repayBuyerId, setRepayBuyerId] = useState('');
  const [repayBuyerSearch, setRepayBuyerSearch] = useState('');
  const [isRepayBuyerDropdownOpen, setIsRepayBuyerDropdownOpen] = useState(false);
  const [repayAmount, setRepayAmount] = useState<number | ''>('');
  const [repayNotes, setRepayNotes] = useState('');
  const [repayMethod, setRepayMethod] = useState<'cash' | 'exchange' | 'offset'>('cash');
  const [offsetSurplusAction, setOffsetSurplusAction] = useState<'payout_cash' | 'deposit_advance'>('payout_cash');
  const [repayExchangeName, setRepayExchangeName] = useState('');
  const [selectedUnpaidTrxId, setSelectedUnpaidTrxId] = useState<string | null>(null);
  const [repaySuccessMessage, setRepaySuccessMessage] = useState<string | null>(null);

  // States for Debtors List Modal
  const [debtorSearchTerm, setDebtorSearchTerm] = useState('');
  const [debtorSortBy, setDebtorSortBy] = useState<'debt' | 'deals' | 'name'>('debt');
  const [isAllDebtorsStatementOpen, setIsAllDebtorsStatementOpen] = useState(false);

  // Form states for Day Closing
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [closingNotes, setClosingNotes] = useState('');
  const [lastClosedRecord, setLastClosedRecord] = useState<CashDayCloseRecord | null>(null);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<'all' | CashEntryType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [todayOnly, setTodayOnly] = useState<boolean>(() => {
    const today = getTodayLocalYMD();
    const hasToday = cashEntries.some(
      (e) => isSameCalendarDay(e.dateStr || e.timestamp, new Date()) || e.dateStr === today
    );
    return hasToday;
  });

  // Automatically show all entries if today has no entries but historical/restored entries exist
  useEffect(() => {
    const today = getTodayLocalYMD();
    const hasToday = cashEntries.some(
      (e) => isSameCalendarDay(e.dateStr || e.timestamp, new Date()) || e.dateStr === today
    );
    if (!hasToday && cashEntries.length > 0) {
      setTodayOnly(false);
    }
  }, [cashEntries]);

  // Option: Include POS Cash Sales automatically in drawer balance
  const [includePosCash, setIncludePosCash] = useState(true);

  const todayStr = getTodayLocalYMD();
  const todayGregorian = formatGregorianDate(new Date());

  // Map of debtors (buyers with outstanding debt owed to the association)
  const debtors = useMemo(() => {
    const map = new Map<
      string,
      {
        buyerId: string;
        buyerName: string;
        buyerPhone?: string;
        totalDebt: number;
        dealsCount: number;
        lastTrxDate?: string;
        lastTrxTime?: string;
        unpaidTransactions: Transaction[];
        dailyBreakdown: { dayKey: string; dayName: string; dateStr: string; debt: number }[];
      }
    >();
    transactions.forEach((t) => {
      // استبعاد الفواتير التي تمت إعادة بيعها لمشتري آخر أو تمت تسويتها
      if (isTransactionResold(t)) {
        if (!t.buyerRemainingDebt || t.buyerRemainingDebt <= 0) return;
      }
      if (t.paymentStatus === 'settled' || t.paymentStatus === 'paid') return;
      if (t.settlementType === 'association_cash' || t.settlementType === 'direct_cash') return;

      const debt = getTransactionBuyerDebt(t);

      if (debt > 0) {
        const contact = contacts.find((c) => c.id === t.buyerId || c.name === t.buyerName);
        const buyerId = contact?.id || t.buyerId || t.buyerName;
        const buyerName = contact?.name || t.buyerName || 'مشتري غير محدد';
        const buyerPhone = contact?.phone || t.buyerPhone;

        const existing = map.get(buyerId) || {
          buyerId,
          buyerName,
          buyerPhone,
          totalDebt: 0,
          dealsCount: 0,
          lastTrxDate: t.dateStr,
          lastTrxTime: t.timeStr,
          unpaidTransactions: [],
          dailyBreakdown: [],
        };
        existing.unpaidTransactions.push(t);
        existing.totalDebt += debt;
        existing.dealsCount += 1;
        if (t.dateStr && (!existing.lastTrxDate || t.dateStr > existing.lastTrxDate)) {
          existing.lastTrxDate = t.dateStr;
          existing.lastTrxTime = t.timeStr;
        }
        map.set(buyerId, existing);
      }
    });

    const result = Array.from(map.values());
    result.forEach((record) => {
      const dailyMap = new Map<string, { dayKey: string; dayName: string; dateStr: string; debt: number }>();
      record.unpaidTransactions.forEach((t) => {
        const debt = getTransactionBuyerDebt(t);

        if (debt > 0) {
          let date: Date | null = null;
          if (t.dateStr && t.dateStr.trim()) {
            date = parseLocalDate(t.dateStr);
          } else if (t.timestamp) {
            date = new Date(t.timestamp);
          }
          let dayName = 'يوم غير محدد';
          let dayKey = t.dateStr || '—';
          let dateStrFormatted = t.dateStr || '—';

          if (date && !isNaN(date.getTime())) {
            const dayNameOnly = date.toLocaleDateString('ar-EG', { weekday: 'long' });
            dayName = `يوم ${dayNameOnly}`;
            dayKey = getTodayLocalYMD(date);
            dateStrFormatted = formatGregorianDate(date);
          }

          const existingDay = dailyMap.get(dayKey) || {
            dayKey,
            dayName,
            dateStr: dateStrFormatted,
            debt: 0,
          };
          existingDay.debt += debt;
          dailyMap.set(dayKey, existingDay);
        }
      });
      record.dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    });

    return result.sort((a, b) => b.totalDebt - a.totalDebt);
  }, [transactions, contacts]);

  const filteredDebtors = useMemo(() => {
    let list = debtors;
    if (debtorSearchTerm.trim()) {
      const q = debtorSearchTerm.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.buyerName.toLowerCase().includes(q) ||
          (d.buyerPhone && d.buyerPhone.includes(q))
      );
    }
    if (debtorSortBy === 'deals') {
      return [...list].sort((a, b) => b.dealsCount - a.dealsCount);
    }
    if (debtorSortBy === 'name') {
      return [...list].sort((a, b) => a.buyerName.localeCompare(b.buyerName, 'ar'));
    }
    return list;
  }, [debtors, debtorSearchTerm, debtorSortBy]);

  const { visibleRepayDebtors, totalMatchingRepayDebtors } = useMemo(() => {
    const query = normalizeArabic(repayBuyerSearch);
    const rawQuery = repayBuyerSearch.trim();
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filtered = debtors.filter((d) => {
      if (!query && !numericQuery) return true;
      const normName = normalizeArabic(d.buyerName);
      const phoneClean = (d.buyerPhone || '').replace(/\D/g, '');

      const nameMatch = query ? normName.includes(query) : false;
      const phoneMatch = Boolean(
        numericQuery && (
          phoneClean.includes(numericQuery) ||
          phoneClean.endsWith(numericQuery)
        )
      );

      return nameMatch || phoneMatch;
    });

    const MAX_VISIBLE = 10;
    return {
      visibleRepayDebtors: filtered.slice(0, MAX_VISIBLE),
      totalMatchingRepayDebtors: filtered.length,
    };
  }, [debtors, repayBuyerSearch]);

  const selectedRepayDebtor = useMemo(
    () => debtors.find((d) => d.buyerId === repayBuyerId || d.buyerName.trim().toLowerCase() === repayBuyerSearch.trim().toLowerCase()),
    [debtors, repayBuyerId, repayBuyerSearch]
  );

  const buyerPendingSalesDues = useMemo(() => {
    if (!selectedRepayDebtor) return 0;
    const targetId = selectedRepayDebtor.buyerId.trim().toLowerCase();
    const targetName = selectedRepayDebtor.buyerName.trim().toLowerCase();
    return transactions.reduce((sum, transaction) => {
      const sellerId = (transaction.sellerId || '').trim().toLowerCase();
      const sellerName = (transaction.sellerName || '').trim().toLowerCase();
      const matchesBuyer =
        (targetId && (sellerId === targetId || sellerName === targetId)) ||
        (targetName && (sellerId === targetName || sellerName === targetName));
      if (!matchesBuyer || transaction.sellerPaidStatus === 'paid') return sum;
      const paid = typeof transaction.sellerPaidAmount === 'number'
        ? transaction.sellerPaidAmount
        : typeof transaction.paidAtPosAmount === 'number'
        ? transaction.paidAtPosAmount
        : 0;
      return sum + Math.max(0, (transaction.netToSeller || 0) - paid);
    }, 0);
  }, [selectedRepayDebtor, transactions]);

  const offsetSurplus = Math.max(0, buyerPendingSalesDues - (selectedRepayDebtor?.totalDebt || 0));

  const openRepayDebtModal = (bId?: string, bAmount?: number | '', bName?: string) => {
    const targetId = bId || debtors[0]?.buyerId || '';
    const matched = debtors.find((d) => d.buyerId === targetId);
    setRepayBuyerId(targetId);
    setRepayBuyerSearch(bName || matched?.buyerName || '');
    setRepayAmount(bAmount !== undefined ? bAmount : '');
    setRepayNotes('');
    setRepaySuccessMessage(null);
    setIsRepayBuyerDropdownOpen(false);
    setModalType('repayDebt');
  };

  // Sellers list derived from contacts, transactions, and cash entries
  const sellers = useMemo(() => {
    const list = contacts.filter((c) => c.type === 'seller' || c.type === 'both');
    const set = new Set(list.map((c) => c.name.trim().toLowerCase()));
    transactions.forEach((t) => {
      // Exclude lot resales - the seller is a buyer reselling, not a fisherman
      if (t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) return;

      if (t.sellerName) {
        const norm = t.sellerName.trim().toLowerCase();
        const normArabic = normalizeArabic(t.sellerName);
        if (norm && !set.has(norm)) {
          // إذا كان البائع مسجلاً كمشتري، لا يُضاف لقائمة الصيادين في الصندوق
          const isRegisteredBuyer = contacts.some(
            (c) =>
              c.type === 'buyer' &&
              ((t.sellerId && c.id === t.sellerId) ||
                c.name.trim().toLowerCase() === norm ||
                (normArabic.length > 2 && normalizeArabic(c.name) === normArabic))
          );
          if (isRegisteredBuyer) return;

          set.add(norm);
          list.push({
            id: t.sellerId || `seller-${t.sellerName}`,
            name: t.sellerName,
            phone: t.sellerPhone,
            type: 'seller',
          });
        }
      }
    });
    cashEntries.forEach((e) => {
      if ((e.type === 'seller_advance' || e.type === 'seller_advance_repayment') && e.contactName) {
        const norm = e.contactName.trim().toLowerCase();
        if (norm && !set.has(norm)) {
          set.add(norm);
          list.push({
            id: e.contactId || `seller-${e.contactName}`,
            name: e.contactName,
            phone: '',
            type: 'seller',
          });
        }
      }
    });
    return list;
  }, [contacts, transactions, cashEntries]);

  // Outstanding advances for each seller (matches accurately by both ID and Name to prevent hanging advances)
  const sellerAdvanceBalances = useMemo(() => {
    const map = new Map<string, number>();

    sellers.forEach((s) => {
      const sId = (s.id || '').trim().toLowerCase();
      const sName = (s.name || '').trim().toLowerCase();

      let taken = 0;
      let repaid = 0;

      cashEntries.forEach((e) => {
        if (e.type !== 'seller_advance' && e.type !== 'seller_advance_repayment') return;
        const eId = (e.contactId || '').trim().toLowerCase();
        const eName = (e.contactName || '').trim().toLowerCase();

        const isMatch = (sId && eId && sId === eId) || (sName && eName && sName === eName);
        if (isMatch) {
          if (e.type === 'seller_advance') taken += e.amount;
          else if (e.type === 'seller_advance_repayment') repaid += e.amount;
        }
      });

      const owed = Math.max(0, taken - repaid);
      if (sId) map.set(sId, owed);
      if (sName) map.set(sName, owed);
    });

    return map;
  }, [sellers, cashEntries]);

  // Sellers with active outstanding advances
  const sellersWithAdvances = useMemo(() => {
    return sellers
      .map((s) => {
        const idKey = (s.id || '').trim().toLowerCase();
        const nameKey = (s.name || '').trim().toLowerCase();
        const advanceOwed = (idKey && sellerAdvanceBalances.get(idKey)) ?? (nameKey && sellerAdvanceBalances.get(nameKey)) ?? 0;
        return {
          ...s,
          advanceOwed,
        };
      })
      .filter((s) => s.advanceOwed > 0)
      .sort((a, b) => b.advanceOwed - a.advanceOwed);
  }, [sellers, sellerAdvanceBalances]);

  const matchingSellersForAdvance = useMemo(() => {
    const q = targetSellerSearch.trim().toLowerCase();
    if (!q) return sellers;
    return sellers.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
  }, [sellers, targetSellerSearch]);

  const matchingSellersForRepay = useMemo(() => {
    const q = targetSellerSearch.trim().toLowerCase();
    if (!q) return sellersWithAdvances;
    return sellersWithAdvances.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.phone && s.phone.includes(q))
    );
  }, [sellersWithAdvances, targetSellerSearch]);

  const openGiveSellerAdvanceModal = (sId?: string, sName?: string) => {
    const firstSeller = sId ? sellers.find((s) => s.id === sId) : sellers[0];
    setTargetSellerId(sId || firstSeller?.id || '');
    setTargetSellerSearch(sName || firstSeller?.name || '');
    setSellerAdvanceAmount('');
    setSellerAdvanceNotes('');
    setIsSellerDropdownOpen(false);
    setIsSubmittingAdvance(false);
    setModalType('giveSellerAdvance');
  };

  const openRepaySellerAdvanceModal = (sId?: string, sName?: string) => {
    const normId = (sId || '').trim().toLowerCase();
    const normName = (sName || '').trim().toLowerCase();
    const matched = sellersWithAdvances.find((s) => 
      (normId && s.id.trim().toLowerCase() === normId) ||
      (normName && s.name.trim().toLowerCase() === normName)
    ) || sellersWithAdvances[0];

    const chosenId = sId || matched?.id || '';
    const chosenName = sName || matched?.name || '';
    const owed = matched?.advanceOwed ?? (chosenId ? sellerAdvanceBalances.get(chosenId.trim().toLowerCase()) : 0) ?? 0;

    setTargetSellerId(chosenId);
    setTargetSellerSearch(chosenName);
    setSellerAdvanceAmount(owed > 0 ? owed : '');
    setSellerAdvanceNotes('');
    setIsSellerDropdownOpen(false);
    setIsSubmittingAdvance(false);
    setModalType('repaySellerAdvance');
  };

  const totalOutstandingDebt = useMemo(() => {
    return debtors.reduce((sum, d) => sum + d.totalDebt, 0);
  }, [debtors]);

  // Total outstanding advances owed by fishermen to the cash drawer
  const totalOutstandingSellerAdvances = useMemo(() => {
    return sellersWithAdvances.reduce((sum, s) => sum + s.advanceOwed, 0);
  }, [sellersWithAdvances]);

  // POS Cash impact calculated based on settlement clearing models
  const posStats = useMemo(() => {
    if (!includePosCash) {
      return {
        posCashIn: 0,
        posCashOut: 0,
        associationProfit: 0,
        todayNewDebt: 0,
      };
    }
    const targetDate = new Date();
    const relevantTrxs = todayOnly
      ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, targetDate))
      : transactions;

    // Track transactions that already have explicit seller_payout CashEntries to prevent double-counting
    const countedTrxIds = new Set<string>();
    cashEntries.forEach((e) => {
      if (e.type === 'seller_payout') {
        if (e.transactionId) countedTrxIds.add(e.transactionId);
        if (e.referenceId) countedTrxIds.add(e.referenceId);
      }
    });

    let posCashIn = 0;
    let posCashOut = 0;
    let associationProfit = 0;
    let todayNewDebt = 0;
    let associationDeferredDebt = 0;

    const countedResaleDepositTrxIds = new Set<string>();
    cashEntries.forEach((e) => {
      if (e.type === 'deposit' && (e.category === 'فائض بيع شروة' || e.category === 'عمولة بيع شروة')) {
        if (e.transactionId) countedResaleDepositTrxIds.add(e.transactionId);
        if (e.referenceId) countedResaleDepositTrxIds.add(e.referenceId);
      }
    });

    relevantTrxs.forEach((t) => {
      // إذا كانت الفاتورة تمت إعادة بيعها لمشتري آخر، لا تتكرر متحصلاتها بل تُحتسب الفاتورة البديلة النشطة
      if (isTransactionResold(t)) {
        const hasManualPayout = countedTrxIds.has(t.id);
        const paidToSeller = hasManualPayout
          ? 0
          : t.settlementType === 'direct_cash'
          ? 0
          : t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
          ? 0
          : t.paidAtPosAmount !== undefined
          ? t.paidAtPosAmount
          : t.sellerPaidAmount !== undefined
          ? t.sellerPaidAmount
          : 0;
        posCashOut += paidToSeller;
        return;
      }

      associationProfit += t.harajProfit || 0;
      const hasManualPayout = countedTrxIds.has(t.id);
      const paidToSeller = hasManualPayout
        ? 0
        : t.settlementType === 'direct_cash'
        ? 0
        : t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
        ? 0
        : t.paidAtPosAmount !== undefined
        ? t.paidAtPosAmount
        : t.sellerPaidAmount !== undefined
        ? t.sellerPaidAmount
        : 0;

      let collectedFromBuyer = 0;
      if (t.settlementType === 'direct_cash') {
        collectedFromBuyer = t.harajProfit || 0;
      } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
        collectedFromBuyer = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
      } else if (t.settlementType === 'association_cash') {
        collectedFromBuyer = t.totalFromBuyer || 0;
      } else if (t.settlementType === 'partial_cash') {
        collectedFromBuyer = typeof t.paidAtPosBuyerAmount === 'number'
          ? t.paidAtPosBuyerAmount
          : typeof t.buyerPaidAmount === 'number' && t.paymentStatus === 'pending'
          ? t.buyerPaidAmount
          : 0;
      } else if (typeof t.paidAtPosBuyerAmount === 'number') {
        collectedFromBuyer = t.paidAtPosBuyerAmount;
      }

      // إذا كانت العملية إعادة بيع شروة وبها فائض مالي أو عمولة مودعة في الصندوق، يُخصمان من المبيعات تفادياً للتكرار
      if (t.isResale && collectedFromBuyer > 0 && countedResaleDepositTrxIds.has(t.id)) {
        const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
        const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
        collectedFromBuyer = Math.max(0, collectedFromBuyer - surplus - commission);
      }

      posCashIn += collectedFromBuyer;
      posCashOut += paidToSeller;

      if (t.settlementType !== 'direct_cash' && !t.isResale) {
        const netDue = t.netToSeller || 0;
        const actualPaid =
          t.sellerPaidStatus === 'paid'
            ? netDue
            : t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
            ? 0
            : typeof t.sellerPaidAmount === 'number'
            ? t.sellerPaidAmount
            : typeof t.paidAtPosAmount === 'number'
            ? t.paidAtPosAmount
            : 0;
        const rem = Math.max(0, netDue - actualPaid);
        associationDeferredDebt += rem;
      }

      const remDebt =
        typeof t.buyerRemainingDebt === 'number'
          ? t.buyerRemainingDebt
          : Math.max(0, (t.totalFromBuyer || 0) - collectedFromBuyer);
      if (remDebt > 0) {
        todayNewDebt += remDebt;
      }
    });

    return {
      posCashIn,
      posCashOut,
      associationProfit,
      todayNewDebt,
      associationDeferredDebt,
    };
  }, [transactions, includePosCash, todayOnly, cashEntries]);

  // Drill-down lists for Inflow Breakdown (من أين؟ وكيف؟ ولمن؟)
  const inflowDrillDownData = useMemo(() => {
    const targetDate = new Date();
    const relevantEntries = todayOnly
      ? cashEntries.filter((e) => isSameCalendarDay(e.dateStr || e.timestamp, targetDate))
      : cashEntries;

    const relevantTrxs = todayOnly
      ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, targetDate) && !isTransactionResold(t))
      : transactions.filter((t) => !isTransactionResold(t));

    const posList = relevantTrxs
      .map((t) => {
        let collectedCash = 0;
        if (t.settlementType === 'direct_cash') {
          collectedCash = t.harajProfit || 0;
        } else if (t.settlementType === 'buyer_advance' || t.settlementType === 'association_credit') {
          collectedCash = typeof t.paidAtPosBuyerAmount === 'number' ? t.paidAtPosBuyerAmount : 0;
        } else if (t.settlementType === 'association_cash') {
          collectedCash = t.totalFromBuyer || 0;
        } else if (t.settlementType === 'partial_cash') {
          collectedCash = typeof t.paidAtPosBuyerAmount === 'number'
            ? t.paidAtPosBuyerAmount
            : typeof t.buyerPaidAmount === 'number' && t.paymentStatus === 'pending'
            ? t.buyerPaidAmount
            : 0;
        } else if (typeof t.paidAtPosBuyerAmount === 'number') {
          collectedCash = t.paidAtPosBuyerAmount;
        }

        if (t.isResale && collectedCash > 0) {
          const surplus = t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0;
          const commission = t.harajProfit && t.harajProfit > 0 ? t.harajProfit : 0;
          collectedCash = Math.max(0, collectedCash - surplus - commission);
        }

        return {
          id: t.id,
          dateStr: t.dateStr,
          timeStr: t.timeStr,
          buyerName: t.buyerName || 'مشتري غير محدد',
          sellerName: t.sellerName || 'صياد غير محدد',
          itemsSummary: t.items?.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ') || 'أسماك متنوعة',
          amount: collectedCash,
          rawTrx: t,
        };
      })
      .filter((item) => item.amount > 0);

    const buyerDebtList = relevantEntries.filter((e) => e.type === 'buyer_debt_repayment');
    const sellerAdvanceList = relevantEntries.filter(
      (e) => e.type === 'seller_advance_repayment' && e.category !== 'تسوية ومقاصة سلفة صياد'
    );
    const depositsList = relevantEntries.filter(
      (e) => (e.type === 'deposit' || e.type === 'buyer_advance_deposit') && e.category !== 'إيداع فائض مقاصة بيعات'
    );
    const openingList = relevantEntries.filter((e) => e.type === 'opening');

    return {
      posList,
      buyerDebtList,
      sellerAdvanceList,
      depositsList,
      openingList,
    };
  }, [cashEntries, transactions, todayOnly, todayStr]);

  // Drill-down lists for Outflow Breakdown (من أين؟ وكيف؟ ولمن؟)
  const outflowDrillDownData = useMemo(() => {
    const targetDate = new Date();
    const relevantEntries = todayOnly
      ? cashEntries.filter((e) => isSameCalendarDay(e.dateStr || e.timestamp, targetDate))
      : cashEntries;

    const relevantTrxs = todayOnly
      ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, targetDate))
      : transactions;

    // 1. POS Cash Out (صافي مستحقات الصيادين المسلمة نقداً بالبيع)
    const posPayoutList = relevantTrxs
      .map((t) => {
        const paidToSeller =
          t.sellerPaidStatus === 'unpaid' || t.sellerPayoutMethod === 'exchange'
            ? 0
            : t.paidAtPosAmount !== undefined
            ? t.paidAtPosAmount
            : t.sellerPaidAmount !== undefined
            ? t.sellerPaidAmount
            : t.netToSeller || 0;

        let shouldInclude = false;
        if (
          t.settlementType === 'association_cash' ||
          t.settlementType === 'association_credit' ||
          t.settlementType === 'partial_cash' ||
          t.settlementType === 'buyer_advance'
        ) {
          shouldInclude = paidToSeller > 0;
        } else if (t.paymentStatus === 'paid') {
          shouldInclude = paidToSeller > 0;
        }

        const netDue = t.netToSeller || 0;
        const remainingToSeller = Math.max(0, netDue - paidToSeller);

        return {
          id: t.id,
          dateStr: t.dateStr,
          timeStr: t.timeStr,
          sellerName: t.sellerName || 'صياد غير محدد',
          buyerName: t.buyerName || 'مشتري غير محدد',
          itemsSummary: t.items?.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ') || 'أسماك متنوعة',
          amount: shouldInclude ? paidToSeller : 0,
          netDue,
          remainingToSeller,
          rawTrx: t,
        };
      })
      .filter((item) => item.amount > 0);

    // 2. Seller Advances issued from Cash Box (سلف الصيادين المنصرفة من الصندوق)
    const sellerAdvancesList = relevantEntries.filter(
      (e) => e.type === 'seller_advance' || (e.category === 'سلفة صياد' && e.type === 'expense')
    );

    // 3. Seller Payouts / Vouchers (سندات صرف مستحقات الصيادين اليدوية)
    const sellerPayoutsList = relevantEntries.filter(
      (e) => e.type === 'seller_payout'
    );

    // 4. Operational Expenses & Staff Wages (المصروفات التشغيلية ورواتب عمال السوق)
    const expensesList = relevantEntries.filter(
      (e) => e.type === 'expense' && e.category !== 'سلفة صياد'
    );

    // 5. Bank Withdrawals & Administration (السحوبات والتوريدات البنكية والإدارة)
    const withdrawalsList = relevantEntries.filter(
      (e) => e.type === 'withdrawal'
    );

    return {
      posPayoutList,
      sellerAdvancesList,
      sellerPayoutsList,
      expensesList,
      withdrawalsList,
    };
  }, [cashEntries, transactions, todayOnly, todayStr]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    const oneDay = 24 * 3600 * 1000;
    const now = Date.now();
    return cashEntries.filter((entry) => {
      if (
        todayOnly &&
        !isSameCalendarDay(entry.dateStr || entry.timestamp, new Date())
      ) {
        return false;
      }
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchCat = entry.category.toLowerCase().includes(term);
        const matchDesc = entry.description.toLowerCase().includes(term);
        const matchUser = (entry.performedBy || '').toLowerCase().includes(term);
        const matchContact = (entry.contactName || '').toLowerCase().includes(term);
        if (!matchCat && !matchDesc && !matchUser && !matchContact) return false;
      }
      return true;
    });
  }, [cashEntries, todayOnly, todayStr, todayGregorian, typeFilter, searchTerm]);

  // Overall Financial stats for the current day / active entries
  const stats = useMemo(() => {
    const targetDate = new Date();
    const relevantEntries = todayOnly
      ? cashEntries.filter((e) => isSameCalendarDay(e.dateStr || e.timestamp, targetDate))
      : cashEntries;

    const relevantTrxs = todayOnly
      ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, targetDate))
      : transactions;

    let opening = 0;
    let deposits = 0;
    let buyerDebtRepayments = 0;
    let buyerDebtExchangeRepayments = 0;
    let sellerExchangePayouts = 0;
    let sellerAdvanceRepayments = 0;
    let expenses = 0;
    let exchangeExpenses = 0;
    let withdrawals = 0;
    let surplusRefunds = 0;
    let sellerPayouts = 0;
    let sellerAdvances = 0;
    const countedSellerPayoutTrxIds = new Set<string>();

    relevantEntries.forEach((e) => {
      if (e.type === 'opening') opening += e.amount;
      else if ((e.type === 'deposit' && e.repaymentMethod !== 'exchange') || (e.type === 'buyer_advance_deposit' && e.category !== 'إيداع فائض مقاصة بيعات')) deposits += e.amount;
      else if (e.type === 'buyer_debt_repayment' || e.type === 'buyer_advance_repayment') {
        const isEx =
          e.repaymentMethod === 'exchange' ||
          e.payoutMethod === 'exchange' ||
          e.category === 'سداد دين عبر الصرافة' ||
          (e.description && e.description.includes('عبر الصرافة'));
        const isOffset = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';

        if (isEx) {
          buyerDebtExchangeRepayments += e.amount;
        } else if (!isOffset) {
          buyerDebtRepayments += e.amount;
        }
      }
      else if (e.type === 'seller_advance_repayment') {
        // Only direct cash repayment adds physical cash to the drawer
        if (e.category !== 'تسوية ومقاصة سلفة صياد') {
          sellerAdvanceRepayments += e.amount;
        }
      }
      else if (e.type === 'expense') {
        expenses += e.amount;
        if (e.payoutMethod === 'exchange') exchangeExpenses += e.amount;
      }
      else if (e.type === 'withdrawal') withdrawals += e.amount;
      else if (e.type === 'buyer_advance_refund') {
        withdrawals += e.amount;
        surplusRefunds += e.amount;
      }
      else if (e.type === 'seller_payout') {
        const isEx =
          e.category === 'تسليم مستحقات عبر الصرافة' ||
          e.payoutMethod === 'exchange' ||
          (e.description && e.description.includes('عبر الصرافة'));

        if (isEx) {
          sellerExchangePayouts += e.amount;
          if (e.transactionId) countedSellerPayoutTrxIds.add(e.transactionId);
          if (e.referenceId) countedSellerPayoutTrxIds.add(e.referenceId);
        } else {
          sellerPayouts += e.amount;
        }
      }
      else if (e.type === 'seller_advance') sellerAdvances += e.amount;
    });

    relevantTrxs.forEach((t) => {
      const isEx =
        t.sellerPayoutMethod === 'exchange' ||
        (t.notes && t.notes.includes('عبر الصرافة')) ||
        Boolean(t.sellerExchangeName);

      if (isEx && !countedSellerPayoutTrxIds.has(t.id)) {
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
    });

    // Inflow: Opening + Deposits + Debt Repayments + Seller Advance Repayments + POS Cash collected
    const carriedOver = todayOnly ? getCarriedOverBalance(cashClosings) : 0;
    const totalCashIn = carriedOver + opening + deposits + buyerDebtRepayments + sellerAdvanceRepayments + posStats.posCashIn;

    // Outflow: Expenses + Withdrawals + Seller Payouts + Seller Advances + POS Cash Out (صافي مستحقات الصيادين المسلمة نقداً بالبيع)
    const totalCashOut = expenses - exchangeExpenses + withdrawals + sellerPayouts + sellerAdvances + posStats.posCashOut;

    const rawDrawerBalance = Math.max(0, totalCashIn - totalCashOut);
    const separatedProfits = settings.separateProfitsFromDrawerCash ? posStats.associationProfit : 0;
    const currentDrawerBalance = Math.max(0, rawDrawerBalance - separatedProfits);
    const associationDeferredDebt = posStats.associationDeferredDebt;

    return {
      opening,
      carriedOverBalance: carriedOver,
      deposits,
      buyerDebtRepayments,
      buyerDebtExchangeRepayments,
      sellerExchangePayouts,
      sellerAdvanceRepayments,
      expenses,
      exchangeExpenses,
      withdrawals,
      surplusRefunds,
      sellerPayouts,
      sellerAdvances,
      posCashIn: posStats.posCashIn,
      posCashOut: posStats.posCashOut,
      posCashCollectedToday: posStats.posCashIn,
      associationProfit: posStats.associationProfit,
      rawDrawerBalance,
      separatedProfits,
      currentDrawerBalance,
      associationDeferredDebt,
      totalCashIn,
      totalCashOut,
    };
  }, [cashEntries, transactions, todayOnly, todayStr, todayGregorian, posStats, cashClosings, settings.separateProfitsFromDrawerCash]);

  // 1. إحصائيات درج اليوم الفعلي الثابتة (اليوم الحالي حصراً مع العهدة الصباحية)
  const todayDrawerStats = useMemo(() => {
    const carriedOver = getCarriedOverBalance(cashClosings);
    return calculateDrawerCash(
      cashEntries,
      transactions,
      true,
      carriedOver,
      Boolean(settings.separateProfitsFromDrawerCash)
    );
  }, [cashEntries, transactions, cashClosings, settings.separateProfitsFromDrawerCash]);

  // 2. إحصائيات الصندوق التراكمية الشاملة لكافة الفترات
  const cumulativeDrawerStats = useMemo(() => {
    return calculateDrawerCash(
      cashEntries,
      transactions,
      false,
      0,
      Boolean(settings.separateProfitsFromDrawerCash)
    );
  }, [cashEntries, transactions, settings.separateProfitsFromDrawerCash]);

  // وضع العرض لبطاقة رصيد الصندوق الفعلي:
  const [drawerCardModeOverride, setDrawerCardModeOverride] = useState<'today_only' | 'cumulative' | null>(null);

  const activeDrawerCardMode = drawerCardModeOverride || settings.cashDrawerDisplayMode || 'today_only';
  const isCumulativeDrawerCard = activeDrawerCardMode === 'cumulative';

  const displayedDrawerBalance = isCumulativeDrawerCard
    ? cumulativeDrawerStats.currentDrawerBalance
    : todayDrawerStats.currentDrawerBalance;

  const displayedOpeningFloat = isCumulativeDrawerCard
    ? (todayOnly ? stats.opening : cumulativeDrawerStats.opening)
    : todayDrawerStats.opening;

  // Calculate Running Balance for table items
  const entriesWithBalance = useMemo(() => {
    // Sort oldest first to calculate running balance, then reverse for display
    const sortedAsc = [...cashEntries].sort((a, b) => a.timestamp - b.timestamp);
    let running = 0;
    const map = new Map<string, number>();

    sortedAsc.forEach((e) => {
      const isOffset = e.category === 'مقاصة بيعات مع شروات' || e.repaymentMethod === 'offset';
      const isSurplusDeposit = e.category === 'إيداع فائض مقاصة بيعات';
      const isSellerOffset = e.category === 'تسوية ومقاصة سلفة صياد';

      if (isOffset || isSurplusDeposit || isSellerOffset) {
        // مقاصة دفترية بدون تأثير على رصيد النقدية الفعلي
        running += 0;
      } else if (e.type === 'expense' && e.payoutMethod === 'exchange') {
        running += 0;
      } else if (e.type === 'deposit' && e.repaymentMethod === 'exchange') {
        running += 0;
      } else if (
        e.type === 'opening' ||
        e.type === 'deposit' ||
        e.type === 'buyer_advance_deposit' ||
        e.type === 'buyer_debt_repayment' ||
        e.type === 'seller_advance_repayment'
      ) {
        running += e.amount;
      } else {
        running -= e.amount;
      }
      map.set(e.id, Math.max(0, running));
    });

    return filteredEntries.map((e) => ({
      ...e,
      runningBalance: map.get(e.id) ?? 0,
    }));
  }, [cashEntries, filteredEntries]);

  // Handle opening modal with defaults
  const handleOpenModal = (type: CashEntryType) => {
    setModalType(type);
    setFormAmount('');
    setEntryFormError(null);
    setFormDescription('');
    setFormWorkerName('');
    setFormSalaryPeriod('');
    setFormCategory('');
    if (type === 'opening') {
      setFormCategory('عهدة صباحية');
      setFormAmount('');
      setFormDescription('');
    }
  };

  useEffect(() => {
    if (openOpeningRequest) handleOpenModal('opening');
  }, [openOpeningRequest]);

  // Submit new cash entry
  const handleSubmitEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalType || modalType === 'closeDay' || modalType === 'printReport') return;
    const cleanAmount = typeof formAmount === 'number' ? formAmount : Number(normalizeNumberInput(String(formAmount)));
    if (!cleanAmount || cleanAmount <= 0) {
      setEntryFormError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    const enteredAmount = cleanAmount;
    const isOutflow = modalType === 'expense' || modalType === 'withdrawal';

    // منع خروج نقدية تتجاوز رصيد الصندوق لمنع الرصيد السالب
    const availableBalance = Math.max(
      displayedDrawerBalance,
      todayDrawerStats.currentDrawerBalance,
      stats.currentDrawerBalance
    );
    if (isOutflow && enteredAmount > availableBalance) {
      setEntryFormError(
        `رصيد الصندوق الحالي (${formatCurrency(availableBalance, settings.currency)}) غير كافٍ لإتمام حركة الصرف بمبلغ (${formatCurrency(enteredAmount, settings.currency)}). لا يمكن أن يصبح رصيد الصندوق سالباً.`
      );
      return;
    }

    setEntryFormError(null);

    let cat = formCategory.trim();
    if (!cat) {
      if (modalType === 'expense') {
        setEntryFormError('يرجى اختيار تصنيف المصروف');
        return;
      } else if (modalType === 'deposit') {
        cat = 'إيداع نقدية';
      } else if (modalType === 'withdrawal') {
        cat = 'سحب وتوريد';
      } else if (modalType === 'opening') {
        cat = 'عهدة صباحية';
      } else {
        cat = 'عام';
      }
    }

    let finalDesc = formDescription.trim();
    if (modalType === 'expense' && (formWorkerName.trim() || formSalaryPeriod.trim())) {
      const parts = [];
      if (formWorkerName.trim()) parts.push(`العامل: ${formWorkerName.trim()}`);
      if (formSalaryPeriod.trim()) parts.push(`عن: ${formSalaryPeriod.trim()}`);
      if (finalDesc) parts.push(finalDesc);
      finalDesc = parts.join(' - ');
    }

    onAddCashEntry({
      type: modalType,
      category: cat,
      amount: enteredAmount,
      description: finalDesc || `حركة ${modalType}`,
      performedBy: formPerformedBy.trim() || 'أمين الصندوق',
      contactName: formWorkerName.trim() || undefined,
    });

    setModalType(null);
    if (modalType === 'opening') onCashEntrySaved?.();
  };

  // Submit day closing
  const handleSubmitClosing = (e: React.FormEvent) => {
    e.preventDefault();
    const actual = countedCash === '' ? stats.currentDrawerBalance : Number(countedCash);
    const diff = actual - stats.currentDrawerBalance;
    const carriedOver = stats.carriedOverBalance || getCarriedOverBalance(cashClosings);

    const closingData = {
      openingBalance: stats.opening,
      carriedOverBalance: carriedOver,
      totalDeposits: stats.deposits,
      buyerDebtRepayments: stats.buyerDebtRepayments,
      sellerAdvanceRepayments: stats.sellerAdvanceRepayments,
      harajSellerPayouts: stats.posCashOut,
      sellerAdvances: stats.sellerAdvances,
      sellerPayouts: stats.sellerPayouts,
      totalExpenses: stats.expenses,
      exchangeExpenses: stats.exchangeExpenses,
      totalWithdrawals: stats.withdrawals,
      harajCashSales: stats.posCashCollectedToday,
      systemCalculatedBalance: stats.currentDrawerBalance,
      actualCountedCash: actual,
      difference: diff,
      notes: closingNotes.trim() || 'تم إقفال اليومية ومطابقة النقدية',
    };

    onCloseDay(closingData);
    setLastClosedRecord({
      ...closingData,
      id: `CLOSE-${Date.now()}`,
      timestamp: Date.now(),
      dateStr: todayStr,
      timeStr: formatGregorianTime(new Date()),
    });
    setModalType('printReport');
  };

  return (
    <div className="space-y-6">
      {/* SCREEN VIEW (Hidden when printing slip) */}
      <div className={modalType === 'printReport' ? 'no-print space-y-6' : 'space-y-6'}>

        {/* ------------------------------------------------------------- */}
        {/* TOP EXECUTIVE KPI CARDS */}
        {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 items-stretch">
        {/* Card 1: Main Cash Drawer Balance (رصيد الصندوق الفعلي) */}
        <div className="bg-white border border-slate-300 p-3 rounded-none shadow-xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-none bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-300 shadow-none">
                <Wallet className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">
                  رصيد الصندوق الفعلي
                </span>
                {Boolean(settings.separateProfitsFromDrawerCash) && (
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 font-bold px-1 py-0.2 rounded-none inline-block border border-emerald-300">
                    صافي السيولة
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setDrawerCardModeOverride((prev) =>
                  (prev || settings.cashDrawerDisplayMode || 'today_only') === 'cumulative'
                    ? 'today_only'
                    : 'cumulative'
                )
              }
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-none font-bold border cursor-pointer ${
                isCumulativeDrawerCard
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}
              title="انقر للتبديل بين رصيد درج اليوم الفعلي والرصيد التراكمي الشامل"
            >
              <ShieldCheck className="w-3 h-3" />
              <span>{isCumulativeDrawerCard ? 'تراكمي شامل' : 'كاش اليوم الفعلي'}</span>
            </button>
          </div>

          <div className="py-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-900">
              {formatCurrency(displayedDrawerBalance, settings.currency)}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-600 flex items-center justify-between font-bold">
              <span>
                {isCumulativeDrawerCard ? 'الرصيد التراكمي الشامل' : 'المبلغ المتوفر حالياً بالدرج (اليوم)'}
              </span>
              {!isCumulativeDrawerCard && cumulativeDrawerStats.currentDrawerBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setDrawerCardModeOverride('cumulative')}
                  className="text-[10px] text-emerald-800 hover:underline font-bold cursor-pointer"
                  title="عرض الرصيد التراكمي الشامل لكافة الحركات السابقة"
                >
                  (التراكمي: {formatNumber(cumulativeDrawerStats.currentDrawerBalance)})
                </button>
              )}
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-300 space-y-0.5 text-[10px] font-bold text-slate-600">
            {Boolean(settings.separateProfitsFromDrawerCash) && (
              <div className="flex items-center justify-between text-amber-900 bg-amber-50 px-1 py-0.5 border border-amber-200">
                <span>أرباح مفصولة (5%):</span>
                <span className="font-mono font-black text-amber-950">
                  -{formatCurrency(isCumulativeDrawerCard ? (cumulativeDrawerStats.separatedProfits || 0) : (todayDrawerStats.separatedProfits || 0), settings.currency)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>{isCumulativeDrawerCard ? 'مجموع العهد:' : 'عهدة بداية اليوم:'}</span>
              <span className="font-mono font-bold text-slate-800">{formatCurrency(displayedOpeningFloat, settings.currency)}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Outstanding Seller Advances (سلف الصيادين القائمة) */}
        <div
          id="cashbox-card-seller-advances"
          role="button"
          tabIndex={0}
          onClick={() => openRepaySellerAdvanceModal()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openRepaySellerAdvanceModal();
          }}
          className="bg-white border border-amber-300 p-3 rounded-none shadow-xs flex flex-col justify-between min-w-0 cursor-pointer hover:bg-amber-50/40 transition-colors"
          title="انقر لسداد سلفة صياد نقداً أو استعراض الصيادين المدينين بسلف"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-amber-950">
              سلف الصيادين القائمة
            </span>
            <div className="w-7 h-7 rounded-none bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-300">
              <Coins className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="py-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-900">
              {formatCurrency(totalOutstandingSellerAdvances, settings.currency)}
            </div>
            <div className="mt-0.5 text-[10px] text-amber-900 flex items-center justify-between font-bold">
              <span>سلف نقدية بانتظار السداد</span>
              <span className="px-1.5 py-0.2 rounded-none bg-amber-100 text-amber-900 font-mono text-[10px] font-bold border border-amber-300">
                {sellersWithAdvances.length} صياد
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-amber-200 flex items-center justify-between text-[10px] font-bold text-amber-800">
            <span>سداد سلفة نقداً ←</span>
            <span className="text-[9px] text-amber-600 font-normal">(انقر للسداد)</span>
          </div>
        </div>

        {/* Card 3: Outstanding Buyer Debt (ديون المشترين) */}
        <div
          id="cashbox-card-debtors"
          role="button"
          tabIndex={0}
          onClick={() => {
            setDebtorSearchTerm('');
            setModalType('debtorsList');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setDebtorSearchTerm('');
              setModalType('debtorsList');
            }
          }}
          className="bg-white border border-rose-300 p-3 rounded-none shadow-xs flex flex-col justify-between min-w-0 cursor-pointer hover:bg-rose-50/40 transition-colors"
          title="انقر لفتح شاشة ديون المشترين وعرض كافة المدينين والمبالغ المطلوبة"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-rose-950">
              ديون المشترين
            </span>
            <div className="w-7 h-7 rounded-none bg-rose-100 text-rose-800 flex items-center justify-center border border-rose-300">
              <HandCoins className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="py-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-700">
              {formatCurrency(totalOutstandingDebt, settings.currency)}
            </div>
            <div className="mt-0.5 text-[10px] text-rose-900 flex items-center justify-between font-bold">
              <span>مستحقات آجلة طرف المشترين</span>
              <span className="px-1.5 py-0.2 rounded-none bg-rose-100 text-rose-900 font-mono text-[10px] font-bold border border-rose-300">
                {debtors.length} مشتري
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-rose-200 flex items-center justify-between text-[10px] font-bold text-rose-700">
            <span>عرض شاشة المديونين ←</span>
            <span className="text-[9px] text-rose-500 font-normal">(انقر للعرض)</span>
          </div>
        </div>

        {/* Card 4: Inflow (إجمالي المقبوضات) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setModalType('inflowBreakdown')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setModalType('inflowBreakdown');
          }}
          className="bg-white border border-blue-300 p-3 rounded-none shadow-xs flex flex-col justify-between min-w-0 cursor-pointer hover:bg-blue-50/40 transition-colors"
          title="انقر هنا لعرض تفاصيل ومصادر إجمالي المقبوضات والوارد"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-blue-950">
              إجمالي الوارد (المقبوضات)
            </span>
            <div className="w-7 h-7 rounded-none bg-blue-100 text-blue-800 flex items-center justify-center border border-blue-300">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="py-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-blue-800">
              {formatCurrency(
                settings.showSurplusInCashCards === false
                  ? Math.max(0, stats.totalCashIn - stats.opening)
                  : stats.totalCashIn,
                settings.currency
              )}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-700 flex items-center justify-between font-bold">
              <span>
                {settings.showSurplusInCashCards === false
                  ? 'الإيداعات والتحصيلات (بدون العهدة)'
                  : 'العهدة + الإيداعات والتحصيلات'}
              </span>
              <span className="text-[9px] text-blue-700 underline font-bold">
                (التفاصيل)
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-blue-300 flex items-center justify-between text-[10px] font-bold text-blue-800">
            <span>حركة الدخل اليومي:</span>
            <span className="text-[9px] text-blue-600 font-normal">وارد الصندوق</span>
          </div>
        </div>

        {/* Card 5: Expenses & Fisherman Payouts (المنصرفات ومستحقات الصيادين) */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setModalType('outflowBreakdown')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setModalType('outflowBreakdown');
          }}
          className="bg-white border border-rose-300 p-3 rounded-none shadow-xs flex flex-col justify-between min-w-0 cursor-pointer hover:bg-rose-50/40 transition-colors"
          title="انقر هنا لعرض تفاصيل ومصادر المنصرفات ومستحقات الصيادين"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-rose-950">
              المنصرفات ومستحقات الصيادين
            </span>
            <div className="w-7 h-7 rounded-none bg-rose-100 text-rose-800 flex items-center justify-center border border-rose-300">
              <Receipt className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="py-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-rose-700">
              {formatCurrency(
                settings.showSurplusInCashCards === false
                  ? Math.max(0, stats.totalCashOut - stats.surplusRefunds)
                  : stats.totalCashOut,
                settings.currency
              )}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-700 flex items-center justify-between font-bold">
              <span>
                {settings.showSurplusInCashCards === false
                  ? 'تشغيل + مسحوبات وصيادين (بدون الفائض)'
                  : 'تشغيل + مسحوبات وصيادين'}
              </span>
              <span className="text-[9px] text-rose-700 underline font-bold">
                (التفاصيل)
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-rose-200 flex items-center justify-between text-[10px] font-bold text-rose-800">
            <span>حركة الصرف اليومي:</span>
            <span className="text-[9px] text-rose-600 font-normal">خارج الصندوق</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* QUICK ACTIONS BAR */}
      {/* ------------------------------------------------------------- */}
      {/* ------------------------------------------------------------- */}
      {/* QUICK ACTIONS BAR */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#f0f4f9] border border-slate-300 rounded-none p-2.5 shadow-xs">
        <div className="flex flex-col gap-2">
          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-7 gap-1.5 w-full">
            {/* Debtors List Screen Button */}
            <button
              id="cashbox-open-debtors-screen-btn"
              type="button"
              onClick={() => {
                setDebtorSearchTerm('');
                setModalType('debtorsList');
              }}
              className="h-8 px-2 rounded-none text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap border border-blue-950 shadow-none hover:opacity-90"
              style={{ backgroundColor: '#030164' }}
              title="عرض شاشة ديون المشترين"
            >
              <Users className="w-3.5 h-3.5 text-white" />
              <span>ديون المشترين</span>
              <span className="px-1 py-0.2 rounded-none bg-white/20 text-white font-mono text-[10px] border border-white/30">
                {debtors.length}
              </span>
            </button>

            {/* Buyer Debt Repayment */}
            <button
              id="cashbox-repay-debt-btn"
              type="button"
              onClick={() => openRepayDebtModal()}
              className="h-8 px-2 rounded-none text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap bg-rose-700 hover:bg-rose-800 border border-rose-800"
              title="تسديد وتسوية مبالغ ديون التجار"
            >
              <HandCoins className="w-3.5 h-3.5 text-white" />
              <span>تسديد دين مشتري</span>
              {debtors.length > 0 && (
                <span className="px-1 py-0.2 rounded-none bg-white/20 text-[10px] font-mono text-white font-bold border border-white/30">
                  {debtors.length}
                </span>
              )}
            </button>

            {/* Unified Seller Advance Management */}
            <button
              id="cashbox-unified-seller-advance-btn"
              type="button"
              onClick={() => {
                if (sellersWithAdvances.length > 0) {
                  openRepaySellerAdvanceModal();
                  setUnifiedSellerAdvanceTab('repay');
                } else {
                  openGiveSellerAdvanceModal();
                  setUnifiedSellerAdvanceTab('give');
                }
              }}
              className="h-8 px-2 rounded-none text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap border border-blue-950 shadow-none hover:opacity-90"
              style={{ backgroundColor: '#030164' }}
              title="إدارة سلف الصيادين (صرف / سداد)"
            >
              <HandCoins className="w-3.5 h-3.5 text-white" />
              <span>إدارة السلف</span>
              {sellersWithAdvances.length > 0 && (
                <span className="px-1 py-0.2 rounded-none bg-white/20 text-[10px] font-mono text-white font-bold border border-white/30">
                  {sellersWithAdvances.length}
                </span>
              )}
            </button>

            {/* Opening Float */}
            <button
              id="cashbox-opening-float-btn"
              type="button"
              onClick={() => handleOpenModal('opening')}
              className="h-8 px-2 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap border border-amber-700"
              title="تسجيل العهدة الصباحية في الصندوق"
            >
              <Coins className="w-3.5 h-3.5 text-white shrink-0" />
              <span>عهدة صباحية</span>
            </button>

            {/* Deposit */}
            <button
              id="cashbox-add-deposit-btn"
              type="button"
              onClick={() => handleOpenModal('deposit')}
              className="h-8 px-2 rounded-none bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap border border-emerald-800"
              title="إيداع نقدية إضافي في الصندوق"
            >
              <PlusCircle className="w-3.5 h-3.5 text-white" />
              <span>إيداع نقدية</span>
            </button>

            {/* Withdrawal */}
            <button
              id="cashbox-add-withdrawal-btn"
              type="button"
              onClick={() => handleOpenModal('withdrawal')}
              className="h-8 px-2 rounded-none text-white text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer whitespace-nowrap border border-blue-950 shadow-none hover:opacity-90"
              style={{ backgroundColor: '#030164' }}
              title="سحب نقدية أو توريد للمصرف / البنك"
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-white" />
              <span>سحب / توريد</span>
            </button>

            {/* Print Button */}
            <button
              id="cashbox-print-thermal-btn"
              type="button"
              onClick={() => window.print()}
              className="h-8 px-2 rounded-none bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
              title="طباعة كشف حركات الصندوق"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" />
              <span>طباعة</span>
            </button>
          </div>
        </div>

        {/* Setting Toggle: POS Cash Integration */}
        <div className="mt-2 pt-2 border-t border-slate-300 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePosCash}
              onChange={(e) => setIncludePosCash(e.target.checked)}
              className="rounded-none text-blue-900 focus:ring-blue-900 w-3.5 h-3.5 cursor-pointer"
            />
            <span className="font-bold text-slate-800">
              ربط مبيعات الحراج النقدية تلقائياً برصيد الصندوق
            </span>
            <span className="text-[11px] text-slate-500">
              (تضاف المبالغ المحصلة من المشترين نقداً فور تسجيل الفاتورة)
            </span>
          </label>

          <div className="text-[11px] text-slate-600">
            عدد الحركات المسجلة اليوم:{' '}
            <span className="font-bold font-mono text-slate-900">
              {cashEntries.filter((e) => e.dateStr === todayStr).length}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FILTER & SEARCH STRIP */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#f0f4f9] border border-slate-300 rounded-none p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث في البيان، التصنيف، أو المسؤول..."
            className="w-full pl-3 pr-8 py-1.5 rounded-none bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-900 placeholder:text-slate-400"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-none border border-slate-300 text-xs font-bold">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'all'
                  ? 'text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
              style={typeFilter === 'all' ? { backgroundColor: '#030164' } : undefined}
            >
              الكل
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('opening')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'opening'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              عهدة
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('expense')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'expense'
                  ? 'bg-rose-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              مصاريف
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('deposit')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'deposit'
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              إيداعات
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('withdrawal')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'withdrawal'
                  ? 'bg-blue-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              سحوبات
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('buyer_debt_repayment')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'buyer_debt_repayment'
                  ? 'bg-rose-800 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              سداد ديون
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('seller_payout')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer ${
                typeFilter === 'seller_payout'
                  ? 'bg-amber-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              مستحقات صيادين
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('seller_advance')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer font-bold ${
                typeFilter === 'seller_advance'
                  ? 'bg-amber-800 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              سلف الصيادين
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('seller_advance_repayment')}
              className={`px-2 py-1 rounded-none transition-all cursor-pointer font-bold ${
                typeFilter === 'seller_advance_repayment'
                  ? 'bg-emerald-800 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              سداد السلف
            </button>
          </div>

          <button
            type="button"
            onClick={() => setTodayOnly((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-none text-xs font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
              todayOnly
                ? 'bg-blue-50 text-blue-950 border-blue-400'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>حركات اليوم فقط</span>
          </button>
        </div>
      </div>

      {/* Cash Ledger Table */}
      <div className="bg-white border border-slate-300 rounded-none shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f0f4f9] text-slate-800 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-l border-slate-300">الرقم المرجعي / التاريخ</th>
                <th className="p-2 border-l border-slate-300">النوع</th>
                <th className="p-2 border-l border-slate-300">التصنيف</th>
                <th className="p-2 border-l border-slate-300">البيان / الوصف</th>
                <th className="p-2 border-l border-slate-300">المسؤول</th>
                <th className="p-2 text-center border-l border-slate-300">المبلغ</th>
                <th className="p-2 text-center border-l border-slate-300">الرصيد التراكمي</th>
                <th className="p-2 text-center no-print">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entriesWithBalance.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    {todayOnly && cashEntries.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-bold text-slate-600">لا توجد حركات مسجلة لتاريخ اليوم</p>
                        <p className="text-[11px] text-slate-400">
                          يوجد {cashEntries.length} حركة نقدية في السجل الكلي للمستعادة والسابقة
                        </p>
                        <button
                          type="button"
                          onClick={() => setTodayOnly(false)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-bold transition-colors shadow-xs"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>عرض كافة الحركات السابقة والمستعادة ({cashEntries.length} حركة)</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="font-bold">لا توجد حركات نقدية مسجلة</p>
                        <p className="text-[11px] mt-0.5">
                          يمكنك تسجيل عهدة صباحية أو مصروف جديد باستخدام الأزرار أعلاه
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                entriesWithBalance.map((entry) => {
                  const isPositive =
                    entry.type === 'opening' ||
                    entry.type === 'deposit' ||
                    entry.type === 'buyer_debt_repayment' ||
                    (entry.type === 'seller_advance_repayment' && entry.category !== 'تسوية ومقاصة سلفة صياد');
                  const isNonCashOffset =
                    entry.type === 'seller_advance_repayment' && entry.category === 'تسوية ومقاصة سلفة صياد';
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3.5 font-mono text-slate-500 whitespace-nowrap">
                        <span className="font-bold text-slate-800 block">{entry.id}</span>
                        <span className="text-[10px] text-slate-400">
                          {entry.dateStr} • {entry.timeStr}
                        </span>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        {entry.type === 'opening' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Coins className="w-3 h-3 text-amber-600" />
                            <span>عهدة صباحية</span>
                          </span>
                        )}
                        {entry.type === 'deposit' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-300">
                            <ArrowDownLeft className="w-3 h-3 text-blue-600" />
                            <span>إيداع نقدية</span>
                          </span>
                        )}
                        {entry.type === 'buyer_debt_repayment' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <HandCoins className="w-3 h-3 text-emerald-600" />
                            <span>سداد دين مشتري</span>
                          </span>
                        )}
                        {entry.type === 'expense' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <Receipt className="w-3 h-3 text-rose-600" />
                            <span>مصروف ونثريات</span>
                          </span>
                        )}
                        {entry.type === 'seller_payout' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-orange-50 text-orange-800 border border-orange-200">
                            <Users className="w-3 h-3 text-orange-600" />
                            <span>صرف مستحق صياد</span>
                          </span>
                        )}
                        {entry.type === 'seller_advance' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                            <HandCoins className="w-3 h-3 text-amber-700" />
                            <span>سلفة صياد</span>
                          </span>
                        )}
                        {entry.type === 'seller_advance_repayment' && (
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold ${
                              isNonCashOffset
                                ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>{isNonCashOffset ? 'مقاصة سلفة صياد' : 'سداد سلفة صياد نقداً'}</span>
                          </span>
                        )}
                        {entry.type === 'withdrawal' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <ArrowUpRight className="w-3 h-3 text-purple-600" />
                            <span>سحب / توريد</span>
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-bold text-slate-700 whitespace-nowrap">
                        {entry.category}
                      </td>

                      <td className="p-3.5 text-slate-600 max-w-xs">{entry.description}</td>

                      <td className="p-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {entry.performedBy || 'الكاشير'}
                      </td>

                      <td className="p-3.5 text-center font-mono font-black text-sm whitespace-nowrap">
                        {isNonCashOffset ? (
                          <span className="text-purple-700 font-bold" title="تسوية ومقاصة دفترية بدون حركة نقدية بالصندوق">
                            {formatCurrency(entry.amount, settings.currency)} <span className="text-[10px] text-purple-500 font-sans">(مقاصة)</span>
                          </span>
                        ) : (
                          <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                            {isPositive ? '+' : '-'} {formatCurrency(entry.amount, settings.currency)}
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                        {formatCurrency(entry.runningBalance, settings.currency)}
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap no-print">
                        <div className="flex items-center justify-center gap-1">
                          {(entry.type === 'seller_advance' || entry.type === 'seller_advance_repayment') && (
                            <button
                              type="button"
                              onClick={() => setSelectedVoucherForPrint(entry)}
                              className="p-1.5 rounded-none text-slate-400 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="طباعة سند السلفة / السداد"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEntryToDelete(entry)}
                            className="p-1.5 rounded-none text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="حذف الحركة"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* ------------------------------------------------------------- */}
      {/* MODAL: ADD CASH ENTRY (OPENING / EXPENSE / DEPOSIT / WITHDRAWAL) */}
      {/* ------------------------------------------------------------- */}
      {(modalType === 'opening' ||
        modalType === 'expense' ||
        modalType === 'deposit' ||
        modalType === 'withdrawal') && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-none flex items-center justify-center ${
                    modalType === 'opening'
                      ? 'bg-amber-100 text-amber-700'
                      : modalType === 'expense'
                      ? 'bg-rose-100 text-rose-700'
                      : modalType === 'deposit'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {modalType === 'opening' && <Coins className="w-5 h-5" />}
                  {modalType === 'expense' && <Receipt className="w-5 h-5" />}
                  {modalType === 'deposit' && <PlusCircle className="w-5 h-5" />}
                  {modalType === 'withdrawal' && <ArrowUpRight className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {modalType === 'opening' && 'تسجيل عهدة نقدية صباحية (Opening Float)'}
                    {modalType === 'expense' && 'تسجيل مصروف وتشغيل ونثريات (Cash Expense)'}
                    {modalType === 'deposit' && 'إيداع نقدية في الصندوق (Cash Deposit)'}
                    {modalType === 'withdrawal' && 'سحب نقدية وتوريد بنكي (Cash Withdrawal)'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    سيتم ترحيل الحركة فوراً وتحديث رصيد الكاش في الدرج
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitEntry} className="mt-5 space-y-4">
              {/* Drawer Cash Indicator for outflow operations */}
              {(modalType === 'expense' || modalType === 'withdrawal') && (
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-slate-500" />
                    <span>الرصيد النقدي المتوفر حالياً بالصندوق:</span>
                  </div>
                  <span
                    className={`font-mono font-black text-sm ${
                      stats.currentDrawerBalance <= 0 ? 'text-rose-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatCurrency(stats.currentDrawerBalance, settings.currency)}
                  </span>
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  المبلغ النقد ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    autoFocus
                    value={formAmount === '' ? '' : formAmount}
                    onChange={(e) => {
                      setEntryFormError(null);
                      const cleaned = normalizeNumberInput(e.target.value);
                      if (cleaned === '' || !isNaN(Number(cleaned))) {
                        setFormAmount(cleaned === '' ? '' : Number(cleaned));
                      }
                    }}
                    placeholder={modalType === 'opening' ? 'أدخل مبلغ العهدة النقدية...' : 'مثال: 15000'}
                    className="w-full px-4 py-3 rounded-none bg-slate-50 border border-slate-300 font-mono font-black text-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {settings.currency}
                  </span>
                </div>
                {typeof formAmount === 'number' && formAmount > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-blue-50 border border-blue-300 text-xs font-bold text-blue-900 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">المبلغ كتابة:</span>
                    <span className="text-blue-800">{tafqeet(formAmount, settings.currency)}</span>
                  </div>
                )}
                {entryFormError && (
                  <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-none text-xs font-bold text-rose-800 flex items-center gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{entryFormError}</span>
                  </div>
                )}
                {(modalType === 'expense' || modalType === 'withdrawal') &&
                  typeof formAmount === 'number' &&
                  formAmount > stats.currentDrawerBalance && (
                    <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-none text-xs font-bold text-rose-800 flex items-start gap-2 animate-in fade-in">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-black text-rose-900">⚠️ رصيد الصندوق غير كافٍ لإتمام هذه الحركة!</p>
                        <p className="mt-0.5 text-[11px] text-rose-700">
                          المبلغ المتوفر حالياً بالصندوق:{' '}
                          <span className="font-mono font-bold underline">
                            {formatCurrency(stats.currentDrawerBalance, settings.currency)}
                          </span>
                          . لا يمكن أن يصبح رصيد الصندوق بالسالب. يرجى إيداع عهدة نقدية أولاً.
                        </p>
                      </div>
                    </div>
                  )}
              </div>


              {/* Market Workers Specific Fields */}
              {modalType === 'expense' && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-none space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      تصنيف المصروف <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-none bg-white border border-amber-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                    >
                      <option value="">-- اختر تصنيف المصروف --</option>
                      {EXPENSE_CATEGORIES.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-black text-amber-900">
                    <Users className="w-4 h-4 text-amber-700" />
                    <span>بيانات عمال السوق (صرف رواتب وأجور العمال):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        اسم العامل / الموظف المستلم
                      </label>
                      <input
                        type="text"
                        list="registered-workers-list"
                        value={formWorkerName}
                        onChange={(e) => {
                          const wName = e.target.value;
                          setFormWorkerName(wName);
                          if (!formDescription || formDescription.startsWith('صرف ')) {
                            setFormDescription(wName ? `صرف أجر/راتب العامل: ${wName}` : '');
                          }
                        }}
                        placeholder="اختر أو اكتب اسم العامل..."
                        className="w-full px-3 py-2 rounded-none bg-white border border-amber-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                      <datalist id="registered-workers-list">
                        {contacts
                          .filter((c) => c.type === 'worker')
                          .map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.phone ? `${c.name} (${c.phone})` : c.name}
                            </option>
                          ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        عن شهر / فترة العمل
                      </label>
                      <input
                        type="text"
                        value={formSalaryPeriod}
                        onChange={(e) => setFormSalaryPeriod(e.target.value)}
                        placeholder="مثال: راتب شهر سبتمبر / أجر اليوم"
                        className="w-full px-3 py-2 rounded-none bg-white border border-amber-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البيان والتفاصيل (سبب الحركة)
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    modalType === 'opening'
                      ? 'مثال: عهدة نقدية صباحية لبداية اليوم وتوفير الفكة والصرافة...'
                      : 'مثال: شراء 5 قوالب ثلج لتبريد طاولات الحراج الأساسي'
                  }
                  className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Performed By */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  المسؤول / أمين الصندوق
                </label>
                <input
                  type="text"
                  value={formPerformedBy}
                  onChange={(e) => setFormPerformedBy(e.target.value)}
                  placeholder="اسم الشخص المنفذ للحركة"
                  className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-none text-white text-xs font-black shadow-xs transition-all cursor-pointer ${
                    modalType === 'opening'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : modalType === 'expense'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                      : modalType === 'deposit'
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                      : 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                  }`}
                >
                  حفظ وتأكيد الحركة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: REPAY BUYER DEBT (تسديد دين المشتري) */}
      {/* ------------------------------------------------------------- */}
      {modalType === 'repayDebt' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-none max-w-4xl w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-red-100 text-red-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تسديد دين المشتري
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    قبض نقدية وإيداعها في الصندوق مع تخفيض مديونية المشتري آلياً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setRepaySuccessMessage(null);
                }}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Success Feedback Notification Banner */}
            {repaySuccessMessage && (
              <div className="mt-3 p-3 rounded-none bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-2xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{repaySuccessMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRepaySuccessMessage(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                  title="إغلاق الإشعار"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const selected = selectedRepayDebtor;
                const bName = selected ? selected.buyerName : (repayBuyerSearch.trim() || 'مشتري');
                const bId = selected ? selected.buyerId : (repayBuyerId || repayBuyerSearch.trim());
                if (repayMethod === 'offset') {
                  if (!selected || buyerPendingSalesDues <= 0 || !onOffsetBuyerSalesDebt) {
                    alert('لا توجد مستحقات بيعات متاحة للمقاصة لهذا المشتري');
                    return;
                  }
                  onOffsetBuyerSalesDebt(
                    bId,
                    bName,
                    offsetSurplus > 0 ? offsetSurplusAction : undefined,
                    repayNotes || 'مقاصة مستحقات البيعات مع مديونية الشروات'
                  );
                  setRepaySuccessMessage(`✓ تمت المقاصة بمبلغ ${formatCurrency(Math.min(selected.totalDebt, buyerPendingSalesDues), settings.currency)} بين دين المشتري ومستحقات بيعاته.${offsetSurplus > 0 ? ` تمت معالجة الفائض ${formatCurrency(offsetSurplus, settings.currency)}.` : ''}`);
                  setRepayAmount('');
                  setRepayNotes('');
                  setSelectedUnpaidTrxId(null);
                  setRepayMethod('cash');
                  return;
                }
                const amt = Number(repayAmount);
                if (!amt || amt <= 0) {
                  alert('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
                  return;
                }
                const targetTrxId = selectedUnpaidTrxId && selectedUnpaidTrxId !== 'ALL' ? selectedUnpaidTrxId : undefined;
                if (onRepayBuyerDebt) {
                  onRepayBuyerDebt(bId, bName, amt, repayNotes, repayMethod, repayExchangeName.trim(), targetTrxId);
                } else {
                  const isEx = repayMethod === 'exchange';
                  onAddCashEntry({
                    type: 'buyer_debt_repayment',
                    category: isEx ? 'سداد دين عبر الصرافة' : 'سداد دين مشتري',
                    payoutMethod: isEx ? 'exchange' : 'cash',
                    repaymentMethod: isEx ? 'exchange' : 'cash',
                    exchangeName: isEx ? (repayExchangeName.trim() || undefined) : undefined,
                    amount: amt,
                    description: `تسديد دين المشتري ${isEx ? `عبر الصرافة (${repayExchangeName.trim() || 'حوالة صرافة'})` : 'نقداً'}: ${bName}${targetTrxId ? ` (سداد فاتورة #${targetTrxId})` : ''}${repayNotes ? ` - ${repayNotes}` : ''}`,
                    performedBy: formPerformedBy,
                    contactId: bId,
                    contactName: bName,
                  });
                }
                // تظل النافذة مفتوحة لمتابعة تسديد باقي الشروات أو اختيار مشتري آخر
                setRepaySuccessMessage(`✓ تم بنجاح قبض وتسجيل سداد بمبلغ ${formatCurrency(amt, settings.currency)} للمشتري (${bName}) في الصندوق.`);
                setRepayAmount('');
                setRepayNotes('');
                setSelectedUnpaidTrxId(null);
              }}
              className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 pl-1 space-y-4">
                {/* ROW 1: BUYER SEARCH & PAYMENT METHOD (2-COLUMN GRID) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <div className="space-y-2">
                    {/* Searchable Buyer Name Input */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ابحث أو اكتب اسم المشتري المدين <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={repayBuyerSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRepayBuyerSearch(val);
                      setIsRepayBuyerDropdownOpen(true);
                      const match = debtors.find(
                        (d) => d.buyerName.trim().toLowerCase() === val.trim().toLowerCase()
                      );
                      if (match) {
                        setRepayBuyerId(match.buyerId);
                        setRepayAmount('');
                      } else {
                        setRepayBuyerId('');
                      }
                    }}
                    onFocus={() => setIsRepayBuyerDropdownOpen(true)}
                    placeholder="اكتب اسم المشتري هنا للبحث..."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  />
                  {repayBuyerSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepayBuyerSearch('');
                        setRepayBuyerId('');
                        setIsRepayBuyerDropdownOpen(true);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Floating Suggestions List */}
                {isRepayBuyerDropdownOpen && debtors.length > 0 && (
                  <div className="absolute z-30 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-none shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {visibleRepayDebtors.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        لا يوجد مشتري مدين مطابق لـ &quot;{repayBuyerSearch}&quot; (يمكنك متابعة الكتابة)
                      </div>
                    ) : (
                      <>
                        {visibleRepayDebtors.map((d) => (
                          <div
                            key={d.buyerId}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setRepayBuyerId(d.buyerId);
                              setRepayBuyerSearch(d.buyerName);
                              setRepayAmount('');
                              setIsRepayBuyerDropdownOpen(false);
                            }}
                            className={`p-3 text-xs flex items-center justify-between cursor-pointer hover:bg-red-50/70 transition-colors ${
                              repayBuyerId === d.buyerId ? 'bg-red-50 border-r-4 border-red-600 font-bold' : ''
                            }`}
                          >
                            <div>
                              <span className="font-bold text-slate-900 block">{d.buyerName}</span>
                              {d.buyerPhone && (
                                <span className="text-[11px] text-slate-400 font-mono">📞 {d.buyerPhone}</span>
                              )}
                            </div>
                            <div className="text-left">
                              <span className="font-black font-mono text-red-700 block">
                                {formatCurrency(d.totalDebt, settings.currency)}
                              </span>
                              <span className="text-[10px] text-slate-500 font-bold">
                                {d.dealsCount} صفقات
                              </span>
                            </div>
                          </div>
                        ))}

                        {totalMatchingRepayDebtors > visibleRepayDebtors.length && (
                          <div className="p-2 bg-red-50/60 border-t border-red-200/60 text-center text-[10px] text-red-900 font-bold">
                            يوجد {totalMatchingRepayDebtors - visibleRepayDebtors.length} مشتري مدين آخر... تابع كتابة الاسم أو الهاتف لتضييق البحث
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Outstanding Debt Info Box */}
              {(() => {
                const selected = debtors.find((d) => d.buyerId === repayBuyerId || d.buyerName.trim().toLowerCase() === repayBuyerSearch.trim().toLowerCase());
                if (!selected) {
                  if (repayBuyerSearch.trim()) {
                    return (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-none flex items-center justify-between text-xs">
                        <div>
                          <span className="text-emerald-950 font-bold block">إجمالي دين المشتري الحالي:</span>
                          <span className="text-emerald-700 text-[11px]">تم سداد كامل المديونية لصندوق الجمعية</span>
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-black font-mono text-emerald-700 block">
                            {formatCurrency(0, settings.currency)}
                          </span>
                          <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                            خلو طرف كامل ✓
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }
                return (
                  <div className="p-3 bg-red-50/90 border border-red-200 rounded-none flex items-center justify-between text-xs">
                    <div>
                      <span className="text-red-950 font-bold block">إجمالي دين المشتري الحالي:</span>
                      <span className="text-red-700 text-[11px]">مستحق السداد لصندوق الجمعية</span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-black font-mono text-red-900 block">
                        {formatCurrency(selected.totalDebt, settings.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setRepayAmount(selected.totalDebt)}
                        className="text-[10px] text-red-700 underline font-bold hover:text-red-900 cursor-pointer"
                      >
                        سداد كامل المبلغ
                      </button>
                    </div>
                  </div>
                );
              })()}
                  </div>

                  {/* Repayment Method Selector (نقداً بالصندوق / عبر الصرافة) */}
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-2">
                <label className="block text-xs font-bold text-slate-700">طريقة سداد الدين:</label>
                <div className={`grid gap-2 ${buyerPendingSalesDues > 0 && onOffsetBuyerSalesDebt ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
                  <button
                    type="button"
                    onClick={() => setRepayMethod('cash')}
                    className={`p-2 rounded-none text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      repayMethod === 'cash'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <HandCoins className="w-3.5 h-3.5" />
                    <span>نقد في الصندوق (كاش)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRepayMethod('exchange')}
                    className={`p-2 rounded-none text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      repayMethod === 'exchange'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>عبر الصرافة / تحويل</span>
                  </button>
                  {buyerPendingSalesDues > 0 && onOffsetBuyerSalesDebt && (
                    <button
                      type="button"
                      onClick={() => {
                        setRepayMethod('offset');
                        setSelectedUnpaidTrxId(null);
                        setRepayAmount('');
                        setRepayNotes('مقاصة مستحقات البيعات مع مديونية الشروات');
                      }}
                      className={`p-2 rounded-none text-xs font-bold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        repayMethod === 'offset'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-white text-purple-800 border-purple-200 hover:bg-purple-50'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>مقاصة بيعات</span>
                    </button>
                  )}
                </div>

                {repayMethod === 'exchange' && (
                  <div className="pt-2 border-t border-slate-300">
                    <label className="block text-[11px] font-bold text-blue-900 mb-1">
                      اسم محل الصرافة أو رقم الحوالة:
                    </label>
                    <input
                      type="text"
                      value={repayExchangeName}
                      onChange={(e) => setRepayExchangeName(e.target.value)}
                      placeholder="مثال: صرافة الكريمي، البسيري، العمقي..."
                      className="w-full bg-white border border-blue-300 rounded-none p-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
                  </div>
                </div>

                {/* ROW 2: AMOUNT & UNPAID BILLS (2-COLUMN GRID) */}
                <div className={`grid gap-4 items-start ${repayMethod === 'offset' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
                  {/* Right Column: Amount Paid */}
                  <div className="space-y-3">
                    {repayMethod === 'offset' ? (
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-none space-y-2 text-xs">
                        <div className="flex justify-between gap-3"><span className="text-slate-600">الدين القائم:</span><b className="font-mono text-red-800">{formatCurrency(selectedRepayDebtor?.totalDebt || 0, settings.currency)}</b></div>
                        <div className="flex justify-between gap-3"><span className="text-slate-600">مستحقات البيعات غير المصروفة:</span><b className="font-mono text-purple-800">{formatCurrency(buyerPendingSalesDues, settings.currency)}</b></div>
                        <div className="flex justify-between gap-3 border-t border-purple-200 pt-2"><span className="font-bold text-slate-700">المقاصة:</span><b className="font-mono font-black text-purple-900">{formatCurrency(Math.min(selectedRepayDebtor?.totalDebt || 0, buyerPendingSalesDues), settings.currency)}</b></div>
                        {offsetSurplus > 0 && (
                          <div className="space-y-2 border-t border-purple-200 pt-2">
                            <p className="font-bold text-emerald-800">بعد سداد الدين يتبقى للمشتري فائض {formatCurrency(offsetSurplus, settings.currency)}. كيف تريد معالجته؟</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button type="button" onClick={() => setOffsetSurplusAction('payout_cash')} className={`p-2 rounded-none border text-xs font-bold ${offsetSurplusAction === 'payout_cash' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'}`}>صرف الفائض نقداً</button>
                              <button type="button" onClick={() => setOffsetSurplusAction('deposit_advance')} className={`p-2 rounded-none border text-xs font-bold ${offsetSurplusAction === 'deposit_advance' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'}`}>إيداع الفائض في القِدمة</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {repayMethod === 'exchange' ? 'المبلغ المسدد عبر الصرافة' : 'المبلغ المسدد نقداً الآن'} ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="مثال: 50000"
                    className="w-full px-4 py-3 rounded-none bg-slate-50 border border-slate-300 font-mono font-black text-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-600"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {settings.currency}
                  </span>
                </div>

                {/* معاينة المبلغ بالفواصل وكتابة بالكلمات لتمييز الأعداد الكبيرة */}
                {typeof repayAmount === 'number' && repayAmount > 0 && (
                  <div className="mt-2 p-2.5 rounded-none bg-slate-50 border border-slate-300 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="text-slate-500 font-medium">المبلغ المميّز بالفواصل:</span>
                      <span className="font-mono text-base font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-none border border-blue-300">
                        {formatNumber(repayAmount)} {settings.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-red-900 bg-red-50/80 p-2 rounded-none border border-red-200">
                      <span className="text-slate-500 font-medium shrink-0">المبلغ كتابة:</span>
                      <span className="text-red-800 text-left font-sans">{tafqeet(repayAmount, settings.currency)}</span>
                    </div>
                  </div>
                )}
                  </div>
                    )}
                </div>

                {/* Left Column: Targeted TRX & Unpaid Transactions */}
                <div className={`space-y-3 ${repayMethod === 'offset' ? 'hidden' : ''}`}>
                  {/* في حال تحديد فاتورة معينة للسداد الجزئي أو الكلي */}
              {(() => {
                if (!selectedUnpaidTrxId || selectedUnpaidTrxId === 'ALL') return null;
                const selectedDebtor = debtors.find((d) => d.buyerId === repayBuyerId || d.buyerName.trim().toLowerCase() === repayBuyerSearch.trim().toLowerCase());
                const targetedTrx = selectedDebtor?.unpaidTransactions?.find((t) => t.id === selectedUnpaidTrxId);
                if (!targetedTrx) return null;
                const debt = getTransactionBuyerDebt(targetedTrx);
                const payNum = Number(repayAmount) || 0;
                const remOnTrx = Math.max(0, debt - payNum);

                return (
                  <div className="p-3 bg-red-50 border border-red-300 rounded-none space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5 text-red-950">
                        <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                        <span>محددة للسداد المباشر: فاتورة #{targetedTrx.id}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUnpaidTrxId(null);
                          setRepayNotes('');
                        }}
                        className="text-[11px] text-slate-500 hover:text-red-700 underline font-bold cursor-pointer"
                      >
                        إلغاء التحديد (توزيع عام على كافة الشروات)
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-xs">
                      <div className="bg-white p-2 rounded-none border border-red-200">
                        <span className="text-[10px] text-slate-500 block font-sans">دين هذه الفاتورة:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(debt, '')}</span>
                      </div>
                      <div className="bg-white p-2 rounded-none border border-blue-300">
                        <span className="text-[10px] text-slate-500 block font-sans">المسدد منها الآن:</span>
                        <span className="font-bold text-blue-700">{formatCurrency(payNum, '')}</span>
                      </div>
                      <div className={`p-2 rounded-none border ${remOnTrx === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-amber-300 text-amber-900'}`}>
                        <span className="text-[10px] text-slate-500 block font-sans">المتبقي عليها:</span>
                        <span className="font-black">{formatCurrency(remOnTrx, '')}</span>
                      </div>
                    </div>

                    {payNum > 0 && (
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-red-200">
                        <span className="text-slate-600 font-sans">حالة هذه الفاتورة بعد السداد:</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          remOnTrx === 0
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}>
                          {remOnTrx === 0 ? '✓ سداد كامل وتصفية نهائية' : `سداد جزئي (يتبقى ${formatCurrency(remOnTrx, settings.currency)})`}
                        </span>
                      </div>
                    )}

                    {payNum > debt && (
                      <p className="text-[10px] text-amber-800 font-bold bg-amber-100/90 p-1.5 rounded-none text-center">
                        تنبيه: المبلغ المدخل ({formatCurrency(payNum, settings.currency)}) أكبر من دين هذه الشروة ({formatCurrency(debt, settings.currency)}).
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Remaining Debt preview */}
              {(() => {
                const selected = debtors.find((d) => d.buyerId === repayBuyerId || d.buyerName.trim().toLowerCase() === repayBuyerSearch.trim().toLowerCase());
                if (!selected || !repayAmount) return null;
                const rem = Math.max(0, selected.totalDebt - Number(repayAmount));
                return (
                  <div className="flex justify-between items-center text-xs px-1 text-slate-600">
                    <span>المتبقي في إجمالي مديونية المشتري بعد هذا السداد:</span>
                    <span className={`font-mono font-black ${rem === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(rem, settings.currency)} {rem === 0 && '(خلو طرف كامل)'}
                    </span>
                  </div>
                );
              })()}

              {/* ------------------------------------------------------------- */}
              {/* BUYER UNPAID PURCHASES LIST ("شروات المشتري المعلقة")          */}
              {/* ------------------------------------------------------------- */}
              {(() => {
                const selectedDebtor = debtors.find((d) => d.buyerId === repayBuyerId || d.buyerName.trim().toLowerCase() === repayBuyerSearch.trim().toLowerCase());
                if (!selectedDebtor || !selectedDebtor.unpaidTransactions || selectedDebtor.unpaidTransactions.length === 0) {
                  if (repayBuyerSearch.trim()) {
                    return (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-none text-center space-y-1">
                        <div className="flex items-center justify-center gap-1.5 text-emerald-900 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>تم سداد وتصفية كافة فواتير وشروات المشتري ({repayBuyerSearch}) بالكامل</span>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          لا توجد أي فواتير معلقة عليه حالياً (خلو طرف). يمكنك اختيار مشتري آخر للسداد من خانة البحث أعلاه، أو إغلاق النافذة عند الانتهاء.
                        </p>
                      </div>
                    );
                  }
                  return null;
                }

                return (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 flex-wrap gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-blue-600" />
                        <span>شروات / فواتير المشتري المعلقة ({selectedDebtor.unpaidTransactions.length}):</span>
                      </span>
                      {selectedDebtor.unpaidTransactions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedUnpaidTrxId === 'ALL') {
                              setSelectedUnpaidTrxId(null);
                              setRepayAmount('');
                              setRepayNotes('');
                            } else {
                              setSelectedUnpaidTrxId('ALL');
                              setRepayAmount(selectedDebtor.totalDebt);
                              setRepayNotes(`سداد كافة الشروات والفواتير المعلقة بالكامل (${selectedDebtor.unpaidTransactions.length} شروة)`);
                            }
                          }}
                          className={`text-[11px] font-bold px-2.5 py-1 rounded-none border transition-all cursor-pointer flex items-center gap-1 shadow-2xs ${
                            selectedUnpaidTrxId === 'ALL'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                          }`}
                          title="تحديد وإدراج كامل مديونية كافة الشروات المعلقة دفعة واحدة"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                          <span>{selectedUnpaidTrxId === 'ALL' ? '✓ تم تحديد الكل (سداد كافة الشروات)' : 'تحديد الكل (سداد كافة الشروات)'}</span>
                        </button>
                      )}
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-300 rounded-none p-2 bg-slate-50/50 scrollbar-thin">
                      {selectedDebtor.unpaidTransactions.map((trx) => {
                        const debt = getTransactionBuyerDebt(trx);

                        const isSelected = selectedUnpaidTrxId === trx.id || selectedUnpaidTrxId === 'ALL';
                        const dayLabel = formatArabicDayOnly(trx.dateStr, trx.timestamp);
                        const fishSummary = trx.items
                          .map((it) => `${it.fishName} (${it.quantity} ${it.unit})`)
                          .join('، ');

                        return (
                          <button
                            key={trx.id}
                            type="button"
                            onClick={() => {
                              if (selectedUnpaidTrxId === trx.id) {
                                setSelectedUnpaidTrxId(null);
                                setRepayAmount('');
                                setRepayNotes('');
                              } else {
                                setSelectedUnpaidTrxId(trx.id);
                                setRepayAmount(debt);
                                setRepayNotes(
                                  trx.buyerAdvanceUsed && trx.buyerAdvanceUsed > 0
                                    ? `سداد متبقي الشروة رقم ${trx.id} (${dayLabel}) - سبق خصم من القدمة: ${formatCurrency(trx.buyerAdvanceUsed, settings.currency)}`
                                    : `سداد الشروة/الفاتورة رقم ${trx.id} (${dayLabel})`
                                );
                              }
                            }}
                            className={`w-full text-right p-2.5 rounded-none border text-xs transition-all cursor-pointer flex flex-col gap-1 ${
                              isSelected
                                ? 'bg-red-50 border-red-400 ring-2 ring-red-500/20 text-red-950 font-bold shadow-2xs'
                                : 'bg-white border-slate-300 hover:border-red-200 hover:bg-red-50/30 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono font-bold">
                              <span className="text-blue-700 flex items-center gap-1">
                                <span>{trx.id}</span>
                                <span className="text-slate-500 font-sans font-medium text-[10px]">
                                  ({dayLabel})
                                </span>
                                {selectedUnpaidTrxId === trx.id && (
                                  <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.2 rounded font-sans font-bold">
                                    محددة للسداد
                                  </span>
                                )}
                              </span>
                              <span className="text-red-700 font-black">
                                {formatCurrency(debt, settings.currency)}
                              </span>
                            </div>

                            {selectedUnpaidTrxId === trx.id && typeof repayAmount === 'number' && repayAmount > 0 && (
                              <div className="flex items-center justify-between text-[11px] bg-red-100/90 border border-red-300 text-red-950 px-2 py-1 rounded-none font-bold font-sans">
                                <span>المسدد منها الآن: {formatCurrency(repayAmount, settings.currency)}</span>
                                <span>المتبقي: {formatCurrency(Math.max(0, debt - repayAmount), settings.currency)}</span>
                              </div>
                            )}

                            {trx.buyerAdvanceUsed && trx.buyerAdvanceUsed > 0 && (
                              <div className="flex items-center justify-between text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded font-bold font-sans">
                                <span>خصم سابق من القدمة:</span>
                                <span className="font-mono">-{formatCurrency(trx.buyerAdvanceUsed, settings.currency)}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-normal truncate">
                              <span className="truncate">الأسماك: {fishSummary || 'نوع سمك غير محدد'}</span>
                              {trx.sellerName && (
                                <span className="shrink-0 text-slate-600 font-medium">الصياد: {trx.sellerName}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    رقم السند أو ملاحظات السداد
                  </label>
                  <input
                    type="text"
                    value={repayNotes}
                    onChange={(e) => setRepayNotes(e.target.value)}
                    placeholder="مثال: دفعة نقدية عن فواتير أمس / حوالة سلمت نقداً"
                    className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 flex items-center justify-between gap-2.5 pt-3 mt-3 border-t border-slate-300 bg-white">
                <span className="text-[11px] text-slate-400">
                  💡 تظل النافذة مفتوحة لمتابعة تسديد باقي الشروات أو اختيار مشتري آخر.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalType(null);
                      setRepaySuccessMessage(null);
                      setRepayAmount('');
                      setRepayNotes('');
                      setSelectedUnpaidTrxId(null);
                    }}
                    className="px-5 py-2.5 rounded-none border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    إغلاق النافذة
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-none bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-xs shadow-red-600/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                  >
                    <HandCoins className="w-4 h-4" />
                    <span>{repayMethod === 'offset' ? 'تأكيد المقاصة المالية' : 'تأكيد وقبض النقدية في الصندوق'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: BUYER DEBTORS LIST SCREEN (شاشة ديون المشترين) */}
      {/* ------------------------------------------------------------- */}
      {modalType === 'debtorsList' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-none max-w-4xl w-full shadow-xl border border-slate-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Header */}
            <div className="p-5 sm:p-6 bg-gradient-to-r from-red-900 via-rose-900 to-red-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-none bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-red-100 shadow-inner">
                  <HandCoins className="w-6 h-6 text-red-200" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black tracking-tight text-white">
                      شاشة ديون المشترين
                    </h3>
                  </div>
                  <p className="text-xs text-red-200/90 mt-0.5">
                    كافة المشترين المدينين - انقر على اسم أي مشتري لفتح كشف حسابه مباشرة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="w-9 h-9 rounded-none bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Banner */}
            <div className="bg-red-50/80 border-b border-red-100 p-4 sm:px-6 grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
              <div className="bg-white rounded-none p-3 border border-red-200/70 shadow-2xs">
                <span className="text-[11px] font-semibold text-red-700 block">إجمالي الديون المطلوبة سدادها</span>
                <span className="text-xl font-black font-mono text-red-900">
                  {formatCurrency(totalOutstandingDebt, settings.currency)}
                </span>
              </div>
              <div className="bg-white rounded-none p-3 border border-red-200/70 shadow-2xs">
                <span className="text-[11px] font-semibold text-red-700 block">عدد المشترين المدينين</span>
                <span className="text-xl font-black font-mono text-slate-800">
                  {debtors.length} <span className="text-xs font-normal text-slate-500">مشتري</span>
                </span>
              </div>
              <div className="bg-white rounded-none p-3 border border-red-200/70 shadow-2xs">
                <span className="text-[11px] font-semibold text-red-700 block">إجمالي الفواتير الآجلة المعلقة</span>
                <span className="text-xl font-black font-mono text-slate-800">
                  {debtors.reduce((sum, d) => sum + d.dealsCount, 0)} <span className="text-xs font-normal text-slate-500">فاتورة/صفقة</span>
                </span>
              </div>
            </div>

            {/* Search & Actions Bar */}
            <div className="p-4 sm:px-6 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={debtorSearchTerm}
                  onChange={(e) => setDebtorSearchTerm(e.target.value)}
                  placeholder="ابحث باسم المشتري أو رقم الجوال..."
                  className="w-full pl-3 pr-10 py-2 rounded-none border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
                {debtorSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setDebtorSearchTerm('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none text-xs font-semibold self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setDebtorSortBy('debt')}
                  className={`px-2.5 py-1.5 rounded-none transition-all cursor-pointer ${
                    debtorSortBy === 'debt' ? 'bg-white text-red-900 font-black shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الأعلى ديناً
                </button>
                <button
                  type="button"
                  onClick={() => setDebtorSortBy('deals')}
                  className={`px-2.5 py-1.5 rounded-none transition-all cursor-pointer ${
                    debtorSortBy === 'deals' ? 'bg-white text-red-900 font-black shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  الأكثر فواتير
                </button>
                <button
                  type="button"
                  onClick={() => setDebtorSortBy('name')}
                  className={`px-2.5 py-1.5 rounded-none transition-all cursor-pointer ${
                    debtorSortBy === 'name' ? 'bg-white text-red-900 font-black shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  أبجدياً
                </button>
              </div>

              {/* WhatsApp Debtors Statement Button */}
              <button
                type="button"
                onClick={() => setIsAllDebtorsStatementOpen(true)}
                className="px-3.5 py-2 rounded-none bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 active:scale-95"
                title="إرسال وتصدير كشف ديون المشترين عبر WhatsApp كملف PDF"
              >
                <WhatsAppIcon size={15} />
                <span>واتساب كشف الديون</span>
              </button>

              {/* Print Debtors Statement Button */}
              <button
                type="button"
                onClick={() => setIsAllDebtorsStatementOpen(true)}
                className="px-3.5 py-2 rounded-none bg-slate-800 hover:bg-slate-900 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5 text-slate-300" />
                <span>طباعة كشف بالمشترين</span>
              </button>

              {/* Repay Debt shortcut */}
              <button
                type="button"
                onClick={() => {
                  openRepayDebtModal();
                }}
                className="px-3.5 py-2 rounded-none bg-red-600 hover:bg-red-700 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>سداد وتحصيل دين</span>
              </button>
            </div>

            {/* Instruction Alert */}
            <div className="px-4 sm:px-6 py-2.5 bg-rose-50/70 border-b border-rose-100 flex items-center gap-2 text-xs text-rose-900 font-medium shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
              <span>
                💡 <strong>تعليمات:</strong> انقر على أي سطر أو بطاقة مشتري للانتقال فوراً إلى <strong>كشف حسابه التفصيلي</strong> في قسم التقارير المالية.
              </span>
            </div>

            {/* Debtors List Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-100">
              {filteredDebtors.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  {debtors.length === 0 ? (
                    <div className="space-y-2">
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                      <p className="text-sm font-bold text-slate-700">لا توجد ديون معلقة على المشترين حالياً</p>
                      <p className="text-xs text-slate-400">كافة صفقات المشترين مسددة بالكامل لخزينة الجمعية</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Search className="w-10 h-10 text-slate-300 mx-auto" />
                      <p className="text-xs font-bold text-slate-600">لا يوجد مشتري يطابق: &quot;{debtorSearchTerm}&quot;</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDebtors.map((debtor, index) => (
                    <div
                      key={debtor.buyerId}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setModalType(null);
                        onNavigateToBuyerStatement?.(debtor.buyerId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setModalType(null);
                          onNavigateToBuyerStatement?.(debtor.buyerId);
                        }
                      }}
                      className="group p-3.5 sm:p-4 rounded-none border border-slate-300/90 hover:border-red-400 hover:bg-red-50/40 hover:shadow-xs transition-all duration-150 cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white"
                      title={`انقر لفتح كشف حساب ${debtor.buyerName}`}
                    >
                      {/* Left/Right: Index + Buyer Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-none bg-slate-100 group-hover:bg-red-100 text-slate-500 group-hover:text-red-700 font-mono text-xs font-black flex items-center justify-center shrink-0 transition-colors">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 group-hover:text-red-950 transition-colors truncate">
                              {debtor.buyerName}
                            </span>
                            <span className="px-2 py-0.5 rounded-none bg-red-100/80 text-red-800 text-[10px] font-bold">
                              {debtor.dealsCount} {debtor.dealsCount === 1 ? 'فاتورة' : 'فواتير'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500">
                            {debtor.buyerPhone && (
                              <span className="font-mono text-slate-600 flex items-center gap-1">
                                <span>📞</span>
                                <span>{debtor.buyerPhone}</span>
                              </span>
                            )}
                            {debtor.lastTrxDate && (
                              <span className="text-slate-400">
                                آخر حركة: {debtor.lastTrxDate}
                              </span>
                            )}
                          </div>
                          {debtor.dailyBreakdown && debtor.dailyBreakdown.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-1.5 border-t border-slate-100 text-[11px]">
                              <span className="font-bold text-slate-500">توزيع الدين باليوم:</span>
                              {debtor.dailyBreakdown.map((b) => (
                                <span
                                  key={b.dayKey}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none bg-rose-50 border border-rose-200/80 font-bold text-slate-800"
                                >
                                  <span>{b.dayName} ({b.dateStr}):</span>
                                  <span className="font-black font-mono text-red-700">{formatCurrency(b.debt, settings.currency)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right/Left: Required Amount to Pay + Action Button */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                        <div className="text-right sm:text-left">
                          <span className="text-[10px] font-bold text-slate-400 block">المبلغ المطلوب سداده</span>
                          <span className="text-base sm:text-lg font-black font-mono text-red-700 group-hover:text-red-900 transition-colors">
                            {formatCurrency(debtor.totalDebt, settings.currency)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRepayDebtModal(debtor.buyerId, '', debtor.buyerName);
                            }}
                            className="px-2.5 py-1.5 rounded-none bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition-colors cursor-pointer shrink-0"
                            title="سداد فوري للمشتري"
                          >
                            سداد
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalType(null);
                              onNavigateToBuyerStatement?.(debtor.buyerId);
                            }}
                            className="px-3 py-1.5 rounded-none bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                            title={`فتح كشف حساب ${debtor.buyerName}`}
                          >
                            <span>كشف الحساب</span>
                            <span className="group-hover:-translate-x-0.5 transition-transform text-xs">←</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span>
                إجمالي المعروض: <strong>{filteredDebtors.length}</strong> من أصل <strong>{debtors.length}</strong> مشتري
              </span>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-none bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ------------------------------------------------------------- */}
      {/* MODAL: DAILY SHIFT CLOSING (جرد وإقفال اليومية) */}
      {/* ------------------------------------------------------------- */}
      {modalType === 'closeDay' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-none max-w-3xl w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إقفال الصندوق وجرد اليومية</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    مطابقة الكاش الفعلي في الدرج مع الرصيد المحسوب بالنظام
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitClosing} className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 pl-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* Right Column: Financial Calculation Breakdown */}
                  <div>
                    <div className="bg-slate-50 border border-slate-300 rounded-none p-4 space-y-2.5 text-xs">
                <div className="flex justify-between items-center text-slate-700 font-semibold">
                  <span>العهدة الافتتاحية:</span>
                  <span className="font-mono font-bold">{formatCurrency(stats.opening, settings.currency)}</span>
                </div>
                <div className="flex justify-between items-center text-blue-600">
                  <span>+ إجمالي الإيداعات:</span>
                  <span className="font-mono font-bold">+{formatCurrency(stats.deposits, settings.currency)}</span>
                </div>
                {stats.buyerDebtRepayments > 0 && (
                  <div className="flex justify-between items-center text-emerald-600">
                    <span>+ تحصيلات ديون المشترين نقداً:</span>
                    <span className="font-mono font-bold">+{formatCurrency(stats.buyerDebtRepayments, settings.currency)}</span>
                  </div>
                )}
                {stats.posCashCollectedToday > 0 && (
                  <div className="flex justify-between items-center text-teal-600">
                    <span>+ مبيعات الحراج النقدية المحصلة:</span>
                    <span className="font-mono font-bold">+{formatCurrency(stats.posCashCollectedToday, settings.currency)}</span>
                  </div>
                )}
                {stats.posCashOut > 0 && (
                  <div className="flex justify-between items-center text-indigo-700">
                    <span>- صافي مستحقات الصيادين المصروفة نقداً (بدل عن المشترين):</span>
                    <span className="font-mono font-bold">-{formatCurrency(stats.posCashOut, settings.currency)}</span>
                  </div>
                )}
                {stats.buyerDebtExchangeRepayments > 0 && (
                  <div className="flex justify-between items-center text-teal-800 bg-teal-50/80 p-1.5 rounded font-black border border-teal-200">
                    <span>إجمالي التسديد عبر الصرافة للمشتري:</span>
                    <span className="font-mono">{formatCurrency(stats.buyerDebtExchangeRepayments, settings.currency)}</span>
                  </div>
                )}
                {stats.sellerExchangePayouts > 0 && (
                  <div className="flex justify-between items-center text-purple-800 bg-purple-50/80 p-1.5 rounded font-black border border-purple-200">
                    <span>إجمالي تسلم مستحقات الصياد عبر الصرافة:</span>
                    <span className="font-mono">{formatCurrency(stats.sellerExchangePayouts, settings.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-rose-600">
                  <span>- إجمالي المصروفات والنثريات:</span>
                  <span className="font-mono font-bold">-{formatCurrency(stats.expenses, settings.currency)}</span>
                </div>
                <div className="flex justify-between items-center text-amber-600">
                  <span>- إجمالي السحوبات والتوريدات:</span>
                  <span className="font-mono font-bold">-{formatCurrency(stats.withdrawals, settings.currency)}</span>
                </div>
                <div className="pt-2 border-t border-slate-300 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>الرصيد المحسوب بالنظام (المتوقع في الدرج):</span>
                  <span className="font-mono text-emerald-700">
                    {formatCurrency(stats.currentDrawerBalance, settings.currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Left Column: Counted Cash & Live Reconciliation Diff & Notes */}
            <div className="space-y-3.5">
              {/* Actual Cash Count Input */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  الكاش الفعلي في الدرج (بعد الجرد والعد اليدوي) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-none bg-slate-50 border border-slate-300 font-mono font-black text-lg text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {settings.currency}
                  </span>
                </div>
                {typeof countedCash === 'number' && countedCash > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">الكاش المعدود كتابة:</span>
                    <span className="text-emerald-800">{tafqeet(countedCash, settings.currency)}</span>
                  </div>
                )}
              </div>

              {/* Live Reconciliation Diff */}
              {countedCash !== '' && (
                <div
                  className={`p-3.5 rounded-none border flex items-center justify-between text-xs font-bold ${
                    Number(countedCash) - stats.currentDrawerBalance === 0
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : Number(countedCash) - stats.currentDrawerBalance > 0
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-rose-50 border-rose-300 text-rose-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {Number(countedCash) - stats.currentDrawerBalance === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                    <span>
                      {Number(countedCash) - stats.currentDrawerBalance === 0
                        ? 'مطابقة تامة! الرصيد الفعلي يطابق النظام تماماً.'
                        : Number(countedCash) - stats.currentDrawerBalance > 0
                        ? 'يوجد فائض في الصندوق بمقدار:'
                        : 'يوجد عجز في الصندوق بمقدار:'}
                    </span>
                  </div>
                  <span className="font-mono font-black text-sm">
                    {formatCurrency(
                      Math.abs(Number(countedCash) - stats.currentDrawerBalance),
                      settings.currency
                    )}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ملاحظات محضر الإقفال والتسليم
                </label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="مثال: تم الجرد بحضور أمين الصندوق والمشرف وتم تسليم النقدية..."
                  className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="shrink-0 flex items-center justify-end gap-2.5 pt-3 mt-3 border-t border-slate-300 bg-white">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-5 py-2.5 rounded-none border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>تأكيد الإقفال وإصدار المحضر</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: PRINT DAILY CLOSING REPORT / THERMAL VOUCHER */}
      {/* ------------------------------------------------------------- */}
      {modalType === 'printReport' && lastClosedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 print:shadow-none print:border-none print:p-0 print:max-w-full">
            <div className="no-print flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900">سند محضر إقفال الصندوق</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Slip Preview & Printable Box */}
            <div className="printable-receipt-area my-4 p-4 rounded-none bg-white border border-dashed border-slate-300 font-mono text-xs text-slate-900 space-y-2 print:border-none print:p-1 print:m-0">
              <div className="text-center font-bold text-slate-900 border-b border-slate-300 pb-2">
                <p className="text-sm">{settings.marketName}</p>
                <p className="text-[10px] text-slate-500">{settings.subTitle}</p>
                <p className="mt-1 font-black text-xs text-emerald-700">سند جرد وإقفال الصندوق</p>
                <p className="text-[10px] text-slate-400">
                  {lastClosedRecord.dateStr} • {lastClosedRecord.timeStr}
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between">
                  <span>العهدة الصباحية:</span>
                  <span>{formatCurrency(lastClosedRecord.openingBalance, settings.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>الإيداعات الإضافية:</span>
                  <span>{formatCurrency(lastClosedRecord.totalDeposits, settings.currency)}</span>
                </div>
                {(lastClosedRecord.buyerDebtRepayments ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>تحصيلات ديون المشترين:</span>
                    <span>+{formatCurrency(lastClosedRecord.buyerDebtRepayments || 0, settings.currency)}</span>
                  </div>
                )}
                {(lastClosedRecord.harajCashSales ?? 0) > 0 && (
                  <div className="flex justify-between text-teal-700">
                    <span>مبيعات الحراج النقدية:</span>
                    <span>+{formatCurrency(lastClosedRecord.harajCashSales || 0, settings.currency)}</span>
                  </div>
                )}
                {(lastClosedRecord.harajSellerPayouts ?? 0) > 0 && (
                  <div className="flex justify-between text-indigo-700 font-bold">
                    <span>مستحقات الصيادين (بدل المشترين):</span>
                    <span>-{formatCurrency(lastClosedRecord.harajSellerPayouts || 0, settings.currency)}</span>
                  </div>
                )}
                {(lastClosedRecord.buyerDebtExchangeRepayments ?? 0) > 0 && (
                  <div className="flex justify-between text-teal-800 font-bold">
                    <span>إجمالي التسديد عبر الصرافة للمشتري:</span>
                    <span>{formatCurrency(lastClosedRecord.buyerDebtExchangeRepayments || 0, settings.currency)}</span>
                  </div>
                )}
                {(lastClosedRecord.sellerExchangePayouts ?? 0) > 0 && (
                  <div className="flex justify-between text-purple-800 font-bold">
                    <span>إجمالي تسلم مستحقات الصياد عبر الصرافة:</span>
                    <span>{formatCurrency(lastClosedRecord.sellerExchangePayouts || 0, settings.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-600">
                  <span>المصروفات والنثريات:</span>
                  <span>-{formatCurrency(lastClosedRecord.totalExpenses, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>السحوبات والتوريد:</span>
                  <span>-{formatCurrency(lastClosedRecord.totalWithdrawals, settings.currency)}</span>
                </div>
                <div className="border-t border-slate-300 pt-1.5 flex justify-between font-black text-slate-900">
                  <span>الرصيد المحسوب بالنظام:</span>
                  <span>{formatCurrency(lastClosedRecord.systemCalculatedBalance, settings.currency)}</span>
                </div>

                <div className="flex justify-between font-black text-emerald-700">
                  <span>الكاش الفعلي بالدرج:</span>
                  <span>{formatCurrency(lastClosedRecord.actualCountedCash, settings.currency)}</span>
                </div>
                <div
                  className={`flex justify-between font-black ${
                    lastClosedRecord.difference === 0
                      ? 'text-emerald-600'
                      : lastClosedRecord.difference > 0
                      ? 'text-blue-600'
                      : 'text-rose-600'
                  }`}
                >
                  <span>الفارق (عجز/فائض):</span>
                  <span>{formatCurrency(lastClosedRecord.difference, settings.currency)}</span>
                </div>
              </div>

              {lastClosedRecord.notes && (
                <div className="pt-2 border-t border-slate-300 text-[11px] text-slate-500">
                  <span className="font-bold block">ملاحظات:</span>
                  <span>{lastClosedRecord.notes}</span>
                </div>
              )}

              <div className="pt-4 border-t border-slate-300 grid grid-cols-2 text-center text-[10px] text-slate-500">
                <div>
                  <p>أمين الصندوق</p>
                  <p className="mt-4 font-mono">..................</p>
                </div>
                <div>
                  <p>المشرف / الإدارة</p>
                  <p className="mt-4 font-mono">..................</p>
                </div>
              </div>
            </div>

            <div className="no-print flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-none border border-slate-300 text-slate-600 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة السند (80mm)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INFLOW BREAKDOWN (تفاصيل ومصادر إجمالي الوارد والمقبوضات) */}
      {modalType === 'inflowBreakdown' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-none max-w-xl w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تفاصيل ومصادر إجمالي الوارد (المقبوضات)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تفكيك كافة المبالغ الداخلة للصندوق ومصدر كل جزء (من أين؟ وكيف؟ ولمن؟)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setDrillDownInflowCategory(null);
                }}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Inflow Banner */}
            <div className="my-4 p-4 rounded-none bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between shadow-xs">
              <div>
                <span className="text-xs text-blue-200 font-semibold block">إجمالي المقبوضات والوارد</span>
                <span className="text-2xl font-black font-mono tracking-tight text-white">
                  {formatCurrency(
                    settings.showSurplusInCashCards === false
                      ? Math.max(0, stats.totalCashIn - stats.opening)
                      : stats.totalCashIn,
                    settings.currency
                  )}
                </span>
              </div>
              <span className="px-3 py-1 rounded-none bg-blue-500/30 border border-blue-400/30 text-blue-100 text-xs font-bold font-mono">
                {todayOnly ? 'اليوم فقط' : 'كافة الفترات'}
              </span>
            </div>

            {/* If Main Inflow List View */}
            {!drillDownInflowCategory && (
              <div className="space-y-2.5 text-xs">
                <p className="text-[11px] text-slate-500 font-medium pb-1">
                  💡 انقر على أي بند أدناه لمعرفة تفاصيل عملياته بدقة (من سدد؟ وتاريخ وسند القبض):
                </p>


                {/* 1. Opening */}
                {settings.showSurplusInCashCards !== false && (
                  <div
                    onClick={() => setDrillDownInflowCategory('opening')}
                    className="p-3 rounded-none bg-slate-50 border border-slate-300/80 hover:border-blue-400 hover:bg-blue-50/30 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-900 block group-hover:text-blue-700 transition-colors">
                          العهدة الصباحية الافتتاحية
                        </span>
                        <span className="text-[10px] text-slate-400">الرصيد النقدي المسجل لبداية اليومية</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-slate-900 text-sm">
                        +{formatCurrency(stats.opening, settings.currency)}
                      </span>
                      <ChevronLeft className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                )}

                {/* 2. POS Cash Sales */}
                {includePosCash && (
                  <div
                    onClick={() => setDrillDownInflowCategory('pos')}
                    className="p-3 rounded-none bg-blue-50/70 border border-blue-300/80 hover:border-blue-400 hover:bg-blue-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Zap className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="font-bold text-blue-950 block group-hover:text-blue-700 transition-colors">
                          مبيعات صفقات الحراج النقدية (POS)
                        </span>
                        <span className="text-[10px] text-blue-700">
                          النقد المقبوض مباشرة من المشترين في الحراج الأساسي ({inflowDrillDownData.posList.length} عمليات)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-blue-800 text-sm">
                        +{formatCurrency(stats.posCashIn, settings.currency)}
                      </span>
                      <ChevronLeft className="w-4 h-4 text-blue-400 group-hover:text-blue-700 transition-colors" />
                    </div>
                  </div>
                )}

                {/* 3. Buyer Debt Repayments */}
                <div
                  onClick={() => setDrillDownInflowCategory('buyer_debt')}
                  className="p-3 rounded-none bg-emerald-50/70 border border-emerald-200/80 hover:border-emerald-400 hover:bg-emerald-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <HandCoins className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-950 block group-hover:text-emerald-700 transition-colors">
                        سداد وتحصيل ديون المشترين
                      </span>
                      <span className="text-[10px] text-emerald-700">
                        المبالغ المقبوضة نقداً تسديداً لديون تجار سابقة ({inflowDrillDownData.buyerDebtList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-emerald-800 text-sm">
                      +{formatCurrency(stats.buyerDebtRepayments, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-emerald-400 group-hover:text-emerald-700 transition-colors" />
                  </div>
                </div>

                {/* 4. Seller Advance Repayments */}
                <div
                  onClick={() => setDrillDownInflowCategory('seller_advance')}
                  className="p-3 rounded-none bg-teal-50/70 border border-teal-200/80 hover:border-teal-400 hover:bg-teal-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                    <div>
                      <span className="font-bold text-teal-950 block group-hover:text-teal-700 transition-colors">
                        سداد سلف الصيادين نقداً
                      </span>
                      <span className="text-[10px] text-teal-700">
                        المبالغ النقدية الموردة للصندوق تسديداً لسلف الصيادين ({inflowDrillDownData.sellerAdvanceList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-teal-800 text-sm">
                      +{formatCurrency(stats.sellerAdvanceRepayments, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-teal-400 group-hover:text-teal-700 transition-colors" />
                  </div>
                </div>

                {/* 5. Additional Deposits */}
                <div
                  onClick={() => setDrillDownInflowCategory('deposit')}
                  className="p-3 rounded-none bg-sky-50/70 border border-sky-200/80 hover:border-sky-400 hover:bg-sky-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <PlusCircle className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <span className="font-bold text-sky-950 block group-hover:text-sky-700 transition-colors">
                        الإيداعات النقدية الإضافية
                      </span>
                      <span className="text-[10px] text-sky-700">
                        مبالغ الإيداعات اليدوية المغذية للصندوق ({inflowDrillDownData.depositsList.length} إيداعات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-sky-800 text-sm">
                      +{formatCurrency(stats.deposits, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-sky-400 group-hover:text-sky-700 transition-colors" />
                  </div>
                </div>
              </div>
            )}

            {/* If Drill-Down View for Selected Inflow Category */}
            {drillDownInflowCategory && (
              <div className="space-y-3 text-xs">
                {/* Back button & Category Header */}
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-none border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setDrillDownInflowCategory(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-none text-slate-700 font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>رجوع للمصادر</span>
                  </button>

                  <div className="text-left font-mono">
                    <span className="text-[10px] text-slate-500 block">إجمالي هذا البند:</span>
                    <span className="font-bold text-sm text-slate-900">
                      {drillDownInflowCategory === 'pos' && formatCurrency(stats.posCashIn, settings.currency)}
                      {drillDownInflowCategory === 'buyer_debt' && formatCurrency(stats.buyerDebtRepayments, settings.currency)}
                      {drillDownInflowCategory === 'seller_advance' && formatCurrency(stats.sellerAdvanceRepayments, settings.currency)}
                      {drillDownInflowCategory === 'deposit' && formatCurrency(stats.deposits, settings.currency)}
                      {drillDownInflowCategory === 'opening' && formatCurrency(stats.opening, settings.currency)}
                    </span>
                  </div>
                </div>

                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <span>سجل تفاصيل:</span>
                  <span className="text-blue-700">
                    {drillDownInflowCategory === 'pos' && 'مبيعات صفقات الحراج النقدية (POS)'}
                    {drillDownInflowCategory === 'buyer_debt' && 'سداد وتحصيل ديون المشترين'}
                    {drillDownInflowCategory === 'seller_advance' && 'سداد وتوريد سلف الصيادين نقداً'}
                    {drillDownInflowCategory === 'deposit' && 'الإيداعات النقدية الإضافية'}
                    {drillDownInflowCategory === 'opening' && 'العهدة الصباحية الافتتاحية'}
                  </span>
                </div>

                {/* Drill-down items content */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                  {/* Category: POS */}
                  {drillDownInflowCategory === 'pos' && (
                    inflowDrillDownData.posList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد مبيعات نقدية مسجلة في الفترة المحددة</p>
                    ) : (
                      inflowDrillDownData.posList.map((item) => (
                        <div key={item.id} className="p-3 bg-blue-50/40 border border-blue-300/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">المشتري: {item.buyerName}</span>
                            <span className="font-mono font-black text-blue-700 text-sm">
                              +{formatCurrency(item.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>الصياد: {item.sellerName} | أصناف: {item.itemsSummary}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{item.id} ({item.timeStr || item.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Buyer Debt Repayments */}
                  {drillDownInflowCategory === 'buyer_debt' && (
                    inflowDrillDownData.buyerDebtList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد سندات سداد ديون مسجلة في الفترة المحددة</p>
                    ) : (
                      inflowDrillDownData.buyerDebtList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-emerald-50/40 border border-emerald-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">المشتري المسدد: {entry.contactName || 'مشتري'}</span>
                            <span className="font-mono font-black text-emerald-700 text-sm">
                              +{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || 'سداد دفعة من الدين السابق'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Seller Advance Repayments */}
                  {drillDownInflowCategory === 'seller_advance' && (
                    inflowDrillDownData.sellerAdvanceList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد سدادات سلف موردة للصندوق في الفترة المحددة</p>
                    ) : (
                      inflowDrillDownData.sellerAdvanceList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-teal-50/40 border border-teal-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">الصياد المورّد: {entry.contactName || 'صياد'}</span>
                            <span className="font-mono font-black text-teal-700 text-sm">
                              +{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || 'توريد نقدي تسديداً لسلفة سابقة'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Additional Deposits */}
                  {drillDownInflowCategory === 'deposit' && (
                    inflowDrillDownData.depositsList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد إيداعات إضافية مسجلة في الفترة المحددة</p>
                    ) : (
                      inflowDrillDownData.depositsList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-sky-50/40 border border-sky-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">المودع: {entry.contactName || entry.performedBy || 'إيداع للصندوق'}</span>
                            <span className="font-mono font-black text-sky-700 text-sm">
                              +{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || entry.category || 'إيداع نقدي مغذي'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Opening Float */}
                  {drillDownInflowCategory === 'opening' && (
                    inflowDrillDownData.openingList.length === 0 ? (
                      <div className="p-3 bg-slate-50 border border-slate-300 rounded-none text-center text-slate-500">
                        العهدة الافتتاحية المسجلة: {formatCurrency(stats.opening, settings.currency)}
                      </div>
                    ) : (
                      inflowDrillDownData.openingList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-amber-50/40 border border-amber-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">عهدة صباحية</span>
                            <span className="font-mono font-black text-amber-700 text-sm">
                              +{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>القائم بالتسجيل: {entry.performedBy || 'أمين الصندوق'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('deposit');
                  setModalType(null);
                  setDrillDownInflowCategory(null);
                }}
                className="px-3.5 py-2 rounded-none bg-blue-50 text-blue-800 border border-blue-300 text-xs font-bold hover:bg-blue-100 cursor-pointer"
              >
                تصفية الجدول بحركات المقبوضات
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setDrillDownInflowCategory(null);
                }}
                className="px-4 py-2 rounded-none bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: OUTFLOW BREAKDOWN (تفاصيل ومصادر المنصرفات ومستحقات الصيادين) */}
      {modalType === 'outflowBreakdown' && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-none max-w-xl w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-slate-800">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-rose-100 text-rose-700 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تفاصيل ومصادر المنصرفات ومستحقات الصيادين
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    تفكيك كافة المبالغ الخارجة من الصندوق ومصارفها (من أين؟ وكيف؟ ولمن؟)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setDrillDownOutflowCategory(null);
                }}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Outflow Banner */}
            <div className="my-4 p-4 rounded-none bg-gradient-to-r from-rose-900 to-red-950 text-white flex items-center justify-between shadow-xs">
              <div>
                <span className="text-xs text-rose-200 font-semibold block">إجمالي المنصرفات والمدفوعات</span>
                <span className="text-2xl font-black font-mono tracking-tight text-white">
                  {formatCurrency(
                    Math.max(0, stats.totalCashOut - stats.surplusRefunds),
                    settings.currency
                  )}
                </span>
              </div>
              <span className="px-3 py-1 rounded-none bg-rose-500/30 border border-rose-400/30 text-rose-100 text-xs font-bold font-mono">
                {todayOnly ? 'اليوم فقط' : 'كافة الفترات'}
              </span>
            </div>

            {/* If Main Outflow List View */}
            {!drillDownOutflowCategory && (
              <div className="space-y-2.5 text-xs">
                <p className="text-[11px] text-slate-500 font-medium pb-1">
                  💡 انقر على أي بند أدناه لمعرفة تفاصيل عملياته بدقة (لمن صُرفت؟ وتاريخ وسند الصرف):
                </p>

                {stats.associationDeferredDebt > 0 && (
                  <div className="p-3 rounded-none bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>مستحقات مؤجلة لصيادين عاد/استقر متبقيها في كاش الدرج كدين على الجمعية:</span>
                    </div>
                    <span className="font-mono font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">
                      +{formatCurrency(stats.associationDeferredDebt, settings.currency)}
                    </span>
                  </div>
                )}

                {/* 1. POS Cash Out (صافي مستحقات الصيادين المسلمة نقداً بالبيع) */}
                {includePosCash && (
                  <div
                    onClick={() => setDrillDownOutflowCategory('pos_payout')}
                    className="p-3 rounded-none bg-orange-50/70 border border-orange-200/80 hover:border-rose-400 hover:bg-orange-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 text-orange-600 shrink-0" />
                      <div>
                        <span className="font-bold text-orange-950 block group-hover:text-rose-700 transition-colors">
                          صافي مستحقات الصيادين المسلمة نقداً بالبيع (POS)
                        </span>
                        <span className="text-[10px] text-orange-700">
                          صافي المبالغ المسلمة للبائعين من صفقات الحراج الأساسي ({outflowDrillDownData.posPayoutList.length} صفقات)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-orange-800 text-sm">
                        -{formatCurrency(stats.posCashOut, settings.currency)}
                      </span>
                      <ChevronLeft className="w-4 h-4 text-orange-400 group-hover:text-rose-600 transition-colors" />
                    </div>
                  </div>
                )}

                {/* 2. Seller Advances (سلف الصيادين المنصرفة من الصندوق) */}
                <div
                  onClick={() => setDrillDownOutflowCategory('seller_advances')}
                  className="p-3 rounded-none bg-amber-50/70 border border-amber-200/80 hover:border-amber-400 hover:bg-amber-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <HandCoins className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold text-amber-950 block group-hover:text-amber-700 transition-colors">
                        سلف الصيادين المنصرفة من الصندوق
                      </span>
                      <span className="text-[10px] text-amber-700">
                        سلف نقدية منصرفة للصيادين ومخصومة من الصندوق ({outflowDrillDownData.sellerAdvancesList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-amber-800 text-sm">
                      -{formatCurrency(stats.sellerAdvances, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-amber-400 group-hover:text-amber-600 transition-colors" />
                  </div>
                </div>

                {/* 3. Seller Payouts (سندات صرف مستحقات الصيادين اليدوية) */}
                <div
                  onClick={() => setDrillDownOutflowCategory('seller_payouts')}
                  className="p-3 rounded-none bg-rose-50/70 border border-rose-200/80 hover:border-rose-400 hover:bg-rose-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <Receipt className="w-4 h-4 text-rose-600 shrink-0" />
                    <div>
                      <span className="font-bold text-rose-950 block group-hover:text-rose-700 transition-colors">
                        سندات صرف مستحقات الصيادين اليدوية
                      </span>
                      <span className="text-[10px] text-rose-700">
                        مستحقات مسددة بسندات صرف نقدية منفصلة ({outflowDrillDownData.sellerPayoutsList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-rose-800 text-sm">
                      -{formatCurrency(stats.sellerPayouts, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-rose-400 group-hover:text-rose-600 transition-colors" />
                  </div>
                </div>

                {/* 4. Operating Expenses & Staff Wages (المصروفات التشغيلية ورواتب عمال السوق) */}
                <div
                  onClick={() => setDrillDownOutflowCategory('expenses')}
                  className="p-3 rounded-none bg-red-50/70 border border-red-200/80 hover:border-red-400 hover:bg-red-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <MinusCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <div>
                      <span className="font-bold text-red-950 block group-hover:text-red-700 transition-colors">
                        المصروفات التشغيلية ورواتب عمال وموظفي السوق
                      </span>
                      <span className="text-[10px] text-red-700">
                        أجور العمال، الرواتب، الشراء، وقود، صيانة ونثريات ({outflowDrillDownData.expensesList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-red-800 text-sm">
                      -{formatCurrency(stats.expenses, settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-red-400 group-hover:text-red-600 transition-colors" />
                  </div>
                </div>

                {/* 5. Bank & Admin Withdrawals (السحوبات والتوريدات البنكية والإدارة) */}
                <div
                  onClick={() => setDrillDownOutflowCategory('withdrawals')}
                  className="p-3 rounded-none bg-purple-50/70 border border-purple-200/80 hover:border-purple-400 hover:bg-purple-100/60 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-2.5">
                    <ArrowUpRight className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <span className="font-bold text-purple-950 block group-hover:text-purple-700 transition-colors">
                        السحوبات والتوريدات البنكية والإدارة
                      </span>
                      <span className="text-[10px] text-purple-700">
                        المبالغ المسحوبة من الدرج للتوريد البنكي أو الإدارة ({outflowDrillDownData.withdrawalsList.length} سندات)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-purple-800 text-sm">
                      -{formatCurrency(Math.max(0, stats.withdrawals - stats.surplusRefunds), settings.currency)}
                    </span>
                    <ChevronLeft className="w-4 h-4 text-purple-400 group-hover:text-purple-600 transition-colors" />
                  </div>
                </div>
              </div>
            )}

            {/* If Drill-Down View for Selected Outflow Category */}
            {drillDownOutflowCategory && (
              <div className="space-y-3 text-xs">
                {/* Back button & Category Header */}
                <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-none border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setDrillDownOutflowCategory(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-none text-slate-700 font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>رجوع للمصارف</span>
                  </button>

                  <div className="text-left font-mono">
                    <span className="text-[10px] text-slate-500 block">إجمالي هذا المنصرف:</span>
                    <span className="font-bold text-sm text-rose-700">
                      {drillDownOutflowCategory === 'pos_payout' && `-${formatCurrency(stats.posCashOut, settings.currency)}`}
                      {drillDownOutflowCategory === 'seller_advances' && `-${formatCurrency(stats.sellerAdvances, settings.currency)}`}
                      {drillDownOutflowCategory === 'seller_payouts' && `-${formatCurrency(stats.sellerPayouts, settings.currency)}`}
                      {drillDownOutflowCategory === 'expenses' && `-${formatCurrency(stats.expenses, settings.currency)}`}
                      {drillDownOutflowCategory === 'withdrawals' && `-${formatCurrency(Math.max(0, stats.withdrawals - stats.surplusRefunds), settings.currency)}`}
                    </span>
                  </div>
                </div>

                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <span>سجل تفاصيل:</span>
                  <span className="text-rose-700">
                    {drillDownOutflowCategory === 'pos_payout' && 'صافي مستحقات الصيادين المسلمة نقداً بالبيع (POS)'}
                    {drillDownOutflowCategory === 'seller_advances' && 'سلف الصيادين المنصرفة من الصندوق'}
                    {drillDownOutflowCategory === 'seller_payouts' && 'سندات صرف مستحقات الصيادين اليدوية'}
                    {drillDownOutflowCategory === 'expenses' && 'المصروفات التشغيلية ورواتب عمال وموظفي السوق'}
                    {drillDownOutflowCategory === 'withdrawals' && 'السحوبات والتوريدات البنكية والإدارة'}
                  </span>
                </div>

                {/* Drill-down items content */}
                <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                  {/* Category: POS Payout */}
                  {drillDownOutflowCategory === 'pos_payout' && (
                    outflowDrillDownData.posPayoutList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد مستحقات صيادين مسلمة نقداً بالبيع في الفترة المحددة</p>
                    ) : (
                      outflowDrillDownData.posPayoutList.map((item) => (
                        <div key={item.id} className="p-3 bg-orange-50/40 border border-orange-200/80 rounded-none space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">الصياد المستلم: {item.sellerName}</span>
                            <span className="font-mono font-black text-rose-700 text-sm">
                              -{formatCurrency(item.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>المشتري: {item.buyerName} | أصناف: {item.itemsSummary}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{item.id} ({item.timeStr || item.dateStr})</span>
                          </div>
                          {item.remainingToSeller > 0 && (
                            <div className="mt-1 pt-1.5 border-t border-orange-200/60 flex items-center justify-between text-[11px]">
                              <span className="text-amber-800 font-semibold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                <span>متبقي عاد واستقر في كاش الدرج (دين للصياد على الجمعية):</span>
                              </span>
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                +{formatCurrency(item.remainingToSeller, settings.currency)}
                              </span>
                            </div>
                          )}
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Seller Advances */}
                  {drillDownOutflowCategory === 'seller_advances' && (
                    outflowDrillDownData.sellerAdvancesList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد سلف صيادين منصرفة في الفترة المحددة</p>
                    ) : (
                      outflowDrillDownData.sellerAdvancesList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-amber-50/40 border border-amber-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">الصياد المستلم للسلفة: {entry.contactName || 'صياد'}</span>
                            <span className="font-mono font-black text-amber-800 text-sm">
                              -{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || 'صرف سلفة نقدية للصياد'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Seller Payouts */}
                  {drillDownOutflowCategory === 'seller_payouts' && (
                    outflowDrillDownData.sellerPayoutsList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد سندات صرف مستحقات يدوية في الفترة المحددة</p>
                    ) : (
                      outflowDrillDownData.sellerPayoutsList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-rose-50/40 border border-rose-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">الصياد المستلم للمستحقات: {entry.contactName || 'صياد'}</span>
                            <span className="font-mono font-black text-rose-700 text-sm">
                              -{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || 'صرف مستحقات صيد نقدية'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Expenses */}
                  {drillDownOutflowCategory === 'expenses' && (
                    outflowDrillDownData.expensesList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد مصروفات أو أجور مسجلة في الفترة المحددة</p>
                    ) : (
                      outflowDrillDownData.expensesList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-red-50/40 border border-red-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">
                              المستفيد / الجهة: {entry.contactName || 'جهة الصرف'}
                            </span>
                            <span className="font-mono font-black text-red-700 text-sm">
                              -{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1">
                            <span>
                              <strong className="text-slate-700">[{entry.category}]</strong> {entry.description}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}

                  {/* Category: Withdrawals */}
                  {drillDownOutflowCategory === 'withdrawals' && (
                    outflowDrillDownData.withdrawalsList.length === 0 ? (
                      <p className="text-center py-6 text-slate-400">لا توجد سحوبات أو توريدات بنكية مسجلة في الفترة المحددة</p>
                    ) : (
                      outflowDrillDownData.withdrawalsList.map((entry) => (
                        <div key={entry.id} className="p-3 bg-purple-50/40 border border-purple-200/80 rounded-none space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">المستلم / البنك: {entry.contactName || 'البنك / الإدارة'}</span>
                            <span className="font-mono font-black text-purple-700 text-sm">
                              -{formatCurrency(entry.amount, settings.currency)}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-1">
                            <span>{entry.description || 'سحب وتوريد نقدي من الصندوق'}</span>
                            <span className="font-mono text-[10px] text-slate-400">#{entry.id} ({entry.timeStr || entry.dateStr})</span>
                          </div>
                        </div>
                      ))
                    )
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('expense');
                  setModalType(null);
                  setDrillDownOutflowCategory(null);
                }}
                className="px-3.5 py-2 rounded-none bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold hover:bg-rose-100 cursor-pointer"
              >
                تصفية الجدول بحركات المصروفات
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalType(null);
                  setDrillDownOutflowCategory(null);
                }}
                className="px-4 py-2 rounded-none bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DISBURSE SELLER ADVANCE (صرف سلفة نقدية لصياد) */}
      {modalType === 'giveSellerAdvance' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-800 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">صرف سلفة نقدية لصياد</h3>
                  <p className="text-[11px] text-slate-400">تخصم مباشرة من رصيد الصندوق وتقيد سلفة بذمة الصياد</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => setModalType('giveSellerAdvance')}
                className="py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-amber-600 text-white shadow-xs"
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة صياد</span>
              </button>
              <button
                type="button"
                onClick={() => openRepaySellerAdvanceModal(targetSellerId, targetSellerSearch)}
                className="py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>🔺 سداد سلفة صياد</span>
              </button>
            </div>

            {/* Current Drawer Cash Indicator */}
            <div className="mt-4 p-3 bg-slate-100 rounded-none flex items-center justify-between text-xs">
              <span className="text-slate-600 font-bold">السيولة المتاحة بالصندوق حالياً:</span>
              <span className={`font-mono font-black text-sm ${stats.currentDrawerBalance <= 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {formatCurrency(stats.currentDrawerBalance, settings.currency)}
              </span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingAdvance) return;
                const amt = Number(sellerAdvanceAmount);
                if (!amt || amt <= 0) {
                  alert('يرجى إدخال مبلغ سلفة صحيح أكبر من الصفر');
                  return;
                }
                const matched = sellers.find(
                  (s) => s.id === targetSellerId || s.name.trim().toLowerCase() === targetSellerSearch.trim().toLowerCase()
                );
                const sId = targetSellerId || matched?.id || `seller-${Date.now()}`;
                const sName = targetSellerSearch.trim() || matched?.name || 'صياد غير محدد';

                if (amt > stats.currentDrawerBalance) {
                  const proceed = confirm(
                    `⚠️ تنبيه: مبلغ السلفة (${formatCurrency(amt, settings.currency)}) يتجاوز السيولة المتوفرة بالصندوق (${formatCurrency(stats.currentDrawerBalance, settings.currency)}).\nهل ترغب بالاستمرار رغم ذلك؟`
                  );
                  if (!proceed) return;
                }

                setIsSubmittingAdvance(true);
                try {
                  if (onSaveSellerAdvance) {
                    const res = onSaveSellerAdvance(sId, sName, amt, sellerAdvanceNotes.trim() || 'سلفة نقدية جانبية');
                    if (res && res.id) setSelectedVoucherForPrint(res);
                  } else {
                    onAddCashEntry({
                      type: 'seller_advance',
                      category: 'سلفة صياد',
                      amount: amt,
                      description: `سلفة نقدية للصياد: ${sName}${sellerAdvanceNotes ? ` - ${sellerAdvanceNotes}` : ''}`,
                      performedBy: formPerformedBy,
                      contactId: sId,
                      contactName: sName,
                    });
                  }
                  setTargetSellerId('');
                  setTargetSellerSearch('');
                  setSellerAdvanceAmount('');
                  setSellerAdvanceNotes('');
                  setModalType(null);
                } finally {
                  setIsSubmittingAdvance(false);
                }
              }}
              className="mt-4 space-y-4"
            >
              {/* Searchable Seller Input */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ابحث أو اكتب اسم الصياد <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={targetSellerSearch}
                    onChange={(e) => {
                      setTargetSellerSearch(e.target.value);
                      setIsSellerDropdownOpen(true);
                      const match = sellers.find(
                        (s) => s.name.trim().toLowerCase() === e.target.value.trim().toLowerCase()
                      );
                      if (match) setTargetSellerId(match.id);
                      else setTargetSellerId('');
                    }}
                    onFocus={() => setIsSellerDropdownOpen(true)}
                    placeholder="اكتب اسم الصياد هنا..."
                    className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  {targetSellerSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSellerSearch('');
                        setTargetSellerId('');
                        setIsSellerDropdownOpen(true);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isSellerDropdownOpen && sellers.length > 0 && (
                  <div className="absolute z-30 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-none shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {matchingSellersForAdvance.map((s) => {
                      const owed = (s.id && sellerAdvanceBalances.get(s.id.trim().toLowerCase())) ?? (s.name && sellerAdvanceBalances.get(s.name.trim().toLowerCase())) ?? 0;
                      return (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setTargetSellerId(s.id);
                            setTargetSellerSearch(s.name);
                            setIsSellerDropdownOpen(false);
                          }}
                          className={`p-3 text-xs flex items-center justify-between cursor-pointer hover:bg-amber-50/70 transition-colors ${
                            targetSellerId === s.id ? 'bg-amber-50 border-r-4 border-amber-600 font-bold' : ''
                          }`}
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{s.name}</span>
                            {s.phone && <span className="text-[10px] text-slate-400 font-mono">📞 {s.phone}</span>}
                          </div>
                          {owed > 0 && (
                            <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-none font-mono">
                              سلفة سابقة: {formatCurrency(owed, settings.currency)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  مبلغ السلفة ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={sellerAdvanceAmount}
                  onChange={(e) => setSellerAdvanceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="أدخل مبلغ السلفة..."
                  className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                {typeof sellerAdvanceAmount === 'number' && sellerAdvanceAmount > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-amber-50/70 border border-amber-200 text-xs font-bold text-amber-900 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">المبلغ كتابة:</span>
                    <span className="text-amber-900">{tafqeet(sellerAdvanceAmount, settings.currency)}</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ملاحظات وبيان السلفة
                </label>
                <input
                  type="text"
                  value={sellerAdvanceNotes}
                  onChange={(e) => setSellerAdvanceNotes(e.target.value)}
                  placeholder="مثال: سلفة لمستلزمات صيد، وقود، صيانة محرك..."
                  className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <HandCoins className="w-4 h-4" />
                  <span>تأكيد صرف السلفة وخصمها من الصندوق</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="py-3 px-4 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REPAY SELLER ADVANCE IN CASH (سداد سلفة صياد نقداً) */}
      {modalType === 'repaySellerAdvance' && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-none bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">سداد سلفة صياد نقداً</h3>
                  <p className="text-[11px] text-slate-400">توريد نقدية إلى الصندوق وإبراء ذمة الصياد من السلفة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => openGiveSellerAdvanceModal(targetSellerId, targetSellerSearch)}
                className="py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900"
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة صياد</span>
              </button>
              <button
                type="button"
                onClick={() => setModalType('repaySellerAdvance')}
                className="py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-emerald-600 text-white shadow-xs"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>🔺 سداد سلفة صياد</span>
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingAdvance) return;
                const amt = Number(sellerAdvanceAmount);
                if (!amt || amt <= 0) {
                  alert('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
                  return;
                }
                const matched = sellers.find(
                  (s) => s.id === targetSellerId || s.name.trim().toLowerCase() === targetSellerSearch.trim().toLowerCase()
                );
                const sId = targetSellerId || matched?.id || `seller-${Date.now()}`;
                const sName = targetSellerSearch.trim() || matched?.name || 'صياد غير محدد';

                setIsSubmittingAdvance(true);
                try {
                  if (onRepaySellerAdvanceCash) {
                    const res = onRepaySellerAdvanceCash(sId, sName, amt, sellerAdvanceNotes.trim() || 'سداد نقدي لسلفة');
                    if (res && res.id) setSelectedVoucherForPrint(res);
                  } else {
                    onAddCashEntry({
                      type: 'seller_advance_repayment',
                      category: 'سداد سلفة صياد نقداً',
                      amount: amt,
                      description: `سداد سلفة صياد نقداً إلى الصندوق: ${sName}${sellerAdvanceNotes ? ` - ${sellerAdvanceNotes}` : ''}`,
                      performedBy: formPerformedBy,
                      contactId: sId,
                      contactName: sName,
                    });
                  }
                  // Reset form states cleanly
                  setTargetSellerId('');
                  setTargetSellerSearch('');
                  setSellerAdvanceAmount('');
                  setSellerAdvanceNotes('');
                  setModalType(null);
                } finally {
                  setIsSubmittingAdvance(false);
                }
              }}
              className="mt-4 space-y-4"
            >
              {/* Searchable Seller Input */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ابحث عن الصياد المستلف <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={targetSellerSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTargetSellerSearch(val);
                      setIsSellerDropdownOpen(true);
                      const match = sellersWithAdvances.find(
                        (s) => s.name.trim().toLowerCase() === val.trim().toLowerCase()
                      );
                      if (match) {
                        setTargetSellerId(match.id);
                        setSellerAdvanceAmount(match.advanceOwed);
                      } else {
                        setTargetSellerId('');
                      }
                    }}
                    onFocus={() => setIsSellerDropdownOpen(true)}
                    placeholder="ابحث باسم الصياد..."
                    className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  {targetSellerSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSellerSearch('');
                        setTargetSellerId('');
                        setSellerAdvanceAmount('');
                        setIsSellerDropdownOpen(true);
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isSellerDropdownOpen && (
                  <div className="absolute z-30 right-0 left-0 mt-1 bg-white border border-slate-300 rounded-none shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {matchingSellersForRepay.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        لا يوجد صياد بسلف قائمة مطابق للبحث
                      </div>
                    ) : (
                      matchingSellersForRepay.map((s) => (
                        <div
                          key={s.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setTargetSellerId(s.id);
                            setTargetSellerSearch(s.name);
                            setSellerAdvanceAmount(s.advanceOwed);
                            setIsSellerDropdownOpen(false);
                          }}
                          className={`p-3 text-xs flex items-center justify-between cursor-pointer hover:bg-emerald-50/70 transition-colors ${
                            targetSellerId === s.id ? 'bg-emerald-50 border-r-4 border-emerald-600 font-bold' : ''
                          }`}
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{s.name}</span>
                            {s.phone && <span className="text-[10px] text-slate-400 font-mono">📞 {s.phone}</span>}
                          </div>
                          <div className="text-left">
                            <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 block text-[11px]">
                              سلفة: {formatCurrency(s.advanceOwed, settings.currency)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    المبلغ المسدد نقداً للصندوق ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  {(targetSellerId || targetSellerSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        const owed = (targetSellerId && sellerAdvanceBalances.get(targetSellerId.trim().toLowerCase())) ??
                          (targetSellerSearch && sellerAdvanceBalances.get(targetSellerSearch.trim().toLowerCase())) ?? 0;
                        if (owed > 0) setSellerAdvanceAmount(owed);
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-none cursor-pointer transition-colors"
                    >
                      سداد كامل السلفة القائمة
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={sellerAdvanceAmount}
                  onChange={(e) => setSellerAdvanceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="أدخل المبلغ المقبوض نقداً..."
                  className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                {typeof sellerAdvanceAmount === 'number' && sellerAdvanceAmount > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-emerald-50/70 border border-emerald-200 text-xs font-bold text-emerald-900 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">المبلغ كتابة:</span>
                    <span className="text-emerald-900">{tafqeet(sellerAdvanceAmount, settings.currency)}</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البيان والملاحظات
                </label>
                <input
                  type="text"
                  value={sellerAdvanceNotes}
                  onChange={(e) => setSellerAdvanceNotes(e.target.value)}
                  placeholder="سداد نقدي بالصندوق لسلفة سابقة..."
                  className="w-full px-3.5 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingAdvance}
                  className={`flex-1 py-3 px-4 rounded-none text-white text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 ${
                    isSubmittingAdvance ? 'bg-emerald-400 cursor-not-allowed opacity-70' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                  }`}
                >
                  <Coins className="w-4 h-4" />
                  <span>{isSubmittingAdvance ? 'جاري التسجيل...' : 'تأكيد قبض المبلغ وإضافته للصندوق'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingAdvance}
                  onClick={() => setModalType(null)}
                  className="py-3 px-4 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT VOUCHER FOR SELLER ADVANCE OR REPAYMENT */}
      {selectedVoucherForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 no-print">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-none flex items-center justify-center ${selectedVoucherForPrint.type === 'seller_advance' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  {selectedVoucherForPrint.type === 'seller_advance' ? 'سند صرف سلفة صياد' : 'سند قبض سداد سلفة صياد'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة السند</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedVoucherForPrint(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="printable-receipt-area p-4 border-2 border-slate-800 rounded-none bg-white space-y-4 my-2 text-xs max-w-[380px] mx-auto print:border-black print:p-2 print:shadow-none font-mono">
              <div className="text-center pb-3 border-b-2 border-slate-800">
                <div className="flex justify-center mb-1.5">
                  <img
                    src="/logo.png"
                    alt="شعار سوق عين بامعبد المركزي"
                    className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20"
                  />
                </div>
                <h2 className="text-base font-black text-slate-900">{settings.marketName}</h2>
                <p className="text-[11px] text-slate-600 font-bold">{settings.subTitle}</p>
                <div className={`inline-block mt-2 px-3 py-0.5 text-white rounded font-black text-xs ${selectedVoucherForPrint.type === 'seller_advance' ? 'bg-amber-700' : 'bg-emerald-700'}`}>
                  {selectedVoucherForPrint.type === 'seller_advance'
                    ? 'سند صرف سلفة نقدية (صياد)'
                    : selectedVoucherForPrint.category === 'تسوية ومقاصة سلفة صياد'
                    ? 'سند تسوية ومقاصة سلفة صياد'
                    : 'سند قبض سداد سلفة صياد نقداً'}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{selectedVoucherForPrint.id}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedVoucherForPrint.dateStr} {selectedVoucherForPrint.timeStr}
                  </span>
                </div>
              </div>

              <div className="space-y-2 py-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-500">اسم الصياد:</span>
                  <span className="font-black text-slate-900">{selectedVoucherForPrint.contactName || 'صياد غير محدد'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">المبلغ:</span>
                  <span className={`font-black font-mono text-sm ${selectedVoucherForPrint.type === 'seller_advance' ? 'text-amber-800' : 'text-emerald-700'}`}>
                    {formatCurrency(selectedVoucherForPrint.amount, settings.currency)}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded border border-slate-300 text-[11px] font-bold text-slate-900 text-center leading-relaxed">
                  {tafqeet(selectedVoucherForPrint.amount, settings.currency)}
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-800">{selectedVoucherForPrint.description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">أمين الصندوق:</span>
                  <span className="font-medium text-slate-800">{settings.employeeName || selectedVoucherForPrint.performedBy || 'أمين الصندوق'}</span>
                </div>
              </div>

              <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                <div>
                  <span className="text-slate-600 font-bold block mb-8">توقيع المستلم / الصياد:</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
                <div>
                  <span className="text-slate-600 font-bold block mb-1">توقيع أمين الصندوق:</span>
                  {settings.employeeName ? (
                    <span className="text-xs font-black text-slate-900 block mb-1">({settings.employeeName})</span>
                  ) : (
                    <span className="block mb-6"></span>
                  )}
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* All Debtors Statement Modal (طباعة كشف بالمشترين) */}
      {isAllDebtorsStatementOpen && (
        <AllDebtorsStatementModal
          isOpen={isAllDebtorsStatementOpen}
          onClose={() => setIsAllDebtorsStatementOpen(false)}
          transactions={transactions}
          contacts={contacts}
          cashEntries={cashEntries}
          settings={settings}
          defaultTimeframe="all"
        />
      )}

      {/* Delete Cash Entry Safe Confirmation Modal (بدون confirm المتجمد) */}
      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-none max-w-sm w-full p-6 shadow-xl border border-slate-100 text-right space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-rose-100 text-rose-600 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-sm">تأكيد حذف الحركة المالية</h4>
                <p className="text-xs text-slate-400">سيتم التراجع عن الحركة وتحديث رصيد الصندوق</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-1 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>رقم الحركة:</span>
                <span className="font-mono font-bold">#{entryToDelete.id}</span>
              </div>
              <div className="flex justify-between">
                <span>المبلغ:</span>
                <span className="font-mono font-black text-rose-600">
                  {formatCurrency(entryToDelete.amount, settings.currency)}
                </span>
              </div>
              {entryToDelete.description && (
                <div className="flex justify-between">
                  <span>البيان:</span>
                  <span className="font-medium text-slate-500 truncate max-w-[180px]">{entryToDelete.description}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteCashEntry(entryToDelete.id);
                  setEntryToDelete(null);
                }}
                className="px-5 py-2.5 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs shadow-rose-600/20 transition-all cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
