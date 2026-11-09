import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Contact, FishType, MarketSettings, SettlementType, Transaction, TransactionItem, CashEntry } from '../types';
import { calculateFinancials, formatCurrency, formatNumber, generateTransactionId, getArabicFormattedDate, tafqeet, calculateBuyerAdvanceBalance, normalizeArabic, fuzzyMatchArabic, parseQuantityNumber, getTransactionBuyerDebt } from '../utils/calculations';
import { TodayPOSTransactionsTable } from './TodayPOSTransactionsTable';
import { SellerStatementModal } from './SellerStatementModal';
import { BuyerStatementModal } from './BuyerStatementModal';
import {
  Fish,
  User,
  ShoppingBag,
  Plus,
  Trash2,
  Printer,
  Save,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Calculator,
  Check,
  AlertCircle,
  X,
  ChevronDown,
  Search,
  Coins,
  Clock,
  CreditCard,
  HandCoins,
  Pencil,
  Wallet,
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

interface LiquidityModalState {
  isOpen: boolean;
  autoPrint: boolean;
  actualSellerPaid: number;
  maxAvailableDrawerCash: number;
  cashInFromInvoice: number;
  maxCanPay: number;
  remainingDebt: number;
  shortage: number;
  netToSeller: number;
  baseTransaction: Transaction;
}

interface FastEntryPOSProps {
  contacts: Contact[];
  fishTypes: FishType[];
  settings: MarketSettings;
  transactionsCount: number;
  currentDrawerCash?: number;
  cashEntries?: CashEntry[];
  transactions?: Transaction[];
  isActive?: boolean;
  onOpenCashBox?: () => void;
  onAddCashEntry?: (entry: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => void;
  onSaveTransaction: (trx: Transaction, autoPrint: boolean) => void;
  onUpdateTransaction?: (trx: Transaction, autoPrint?: boolean) => void;
  onQuickAddContact: (contact: Partial<Contact>) => Contact;
  onUpdateContact?: (contact: Contact) => void;
  onOpenReceipt?: (trx: Transaction) => void;
  onNavigateToCustomerStatement?: (type: 'buyer' | 'seller', nameOrId: string) => void;
}

export const FastEntryPOS: React.FC<FastEntryPOSProps> = ({
  contacts,
  fishTypes,
  settings,
  transactionsCount,
  currentDrawerCash,
  cashEntries = [],
  transactions = [],
  isActive = true,
  onOpenCashBox,
  onAddCashEntry,
  onSaveTransaction,
  onUpdateTransaction,
  onQuickAddContact,
  onUpdateContact,
  onOpenReceipt,
  onNavigateToCustomerStatement,
}) => {
  // Sellers and Buyers filtered (مع استبعاد عمال السوق الصريحين تماماً من قائمة المشترين)
  const sellers = contacts.filter((c) => c.type === 'seller' || c.type === 'both');
  const buyers = contacts.filter((c) => (c.type === 'buyer' || c.type === 'both') && c.type !== 'worker');

  // فواتير اليوم المحفوظة حديثاً للتحديث اللحظي المباشر في السطر الأول دون أي تأخير
  const [recentSavedTransactions, setRecentSavedTransactions] = useState<Transaction[]>([]);
  const [highlightedTrxId, setHighlightedTrxId] = useState<string | null>(null);

  // حالة تعديل فاتورة سابقة واسترجاع بياناتها للحقول
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editingOriginalTrx, setEditingOriginalTrx] = useState<Transaction | null>(null);

  // دمج الفواتير الحديثة مع فواتير النظام مع ضمان الترتيب التنازلي وظهور أحدث فاتورة في الأعلى
  const allPosTransactions = useMemo(() => {
    const map = new Map<string, Transaction>();
    recentSavedTransactions.forEach((t) => map.set(t.id, t));
    (transactions || []).forEach((t) => {
      if (!map.has(t.id)) {
        map.set(t.id, t);
      }
    });
    return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [transactions, recentSavedTransactions]);

  // Autocomplete & input states for Seller (fisherman) - persists across transactions
  const [sellerName, setSellerName] = useState<string>(sellers[0]?.name || '');
  const [selectedSellerContact, setSelectedSellerContact] = useState<Contact | null>(sellers[0] || null);
  const [sellerRole, setSellerRole] = useState<'fisherman' | 'seller'>('fisherman');
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState<boolean>(false);
  const [highlightedSellerIndex, setHighlightedSellerIndex] = useState<number>(-1);
  const sellerContainerRef = useRef<HTMLDivElement>(null);

  // Autocomplete & input states for Buyer (merchant) - starts empty and cleared after each invoice
  const [buyerName, setBuyerName] = useState<string>('');
  const [selectedBuyerContact, setSelectedBuyerContact] = useState<Contact | null>(null);
  const [isBuyerDropdownOpen, setIsBuyerDropdownOpen] = useState<boolean>(false);
  const [highlightedBuyerIndex, setHighlightedBuyerIndex] = useState<number>(-1);
  const buyerContainerRef = useRef<HTMLDivElement>(null);

  // Navigable input refs for seamless keyboard flow across fields
  const sellerInputRef = useRef<HTMLInputElement>(null);
  const buyerInputRef = useRef<HTMLInputElement>(null);
  const fishInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const unitInputRef = useRef<HTMLInputElement>(null);
  const unitPriceInputRef = useRef<HTMLInputElement>(null);
  const lumpSumPriceInputRef = useRef<HTMLInputElement>(null);
  const submitPrintBtnRef = useRef<HTMLButtonElement>(null);
  const submitOnlyBtnRef = useRef<HTMLButtonElement>(null);

  // Active Fish item entry & autocomplete dropdown state
  const [selectedFishId, setSelectedFishId] = useState<string>('');
  const [customFishName, setCustomFishName] = useState<string>('');
  const [isFishDropdownOpen, setIsFishDropdownOpen] = useState<boolean>(false);
  const [highlightedFishIndex, setHighlightedFishIndex] = useState<number>(-1);
  const fishContainerRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState<number | string>('');
  const [unit, setUnit] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<number | ''>('');
  const [isLumpSum, setIsLumpSum] = useState<boolean>(false);
  const [lumpSumPrice, setLumpSumPrice] = useState<number | ''>('');

  // Multi-item cart (allows multiple species in single auction ticket, but initialized with ready single item)
  const [itemsList, setItemsList] = useState<TransactionItem[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingItemData, setEditingItemData] = useState<TransactionItem | null>(null);
  const [notes, setNotes] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savedFeedbackMessage, setSavedFeedbackMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Quick Account Statement Modals state
  const [isSellerStatementOpen, setIsSellerStatementOpen] = useState<boolean>(false);
  const [statementSellerContact, setStatementSellerContact] = useState<Contact | null>(null);
  const [isBuyerStatementOpen, setIsBuyerStatementOpen] = useState<boolean>(false);
  const [statementBuyerContact, setStatementBuyerContact] = useState<Contact | null>(null);

  // Smart Quick Search fields for statements (حقل الصياد السريع & حقل المشتري السريع)
  const [topSellerQuery, setTopSellerQuery] = useState<string>('');
  const [isTopSellerDropdownOpen, setIsTopSellerDropdownOpen] = useState<boolean>(false);
  const [highlightedTopSellerIndex, setHighlightedTopSellerIndex] = useState<number>(-1);
  const topSellerContainerRef = useRef<HTMLDivElement>(null);
  const topSellerInputRef = useRef<HTMLInputElement>(null);

  const [topBuyerQuery, setTopBuyerQuery] = useState<string>('');
  const [isTopBuyerDropdownOpen, setIsTopBuyerDropdownOpen] = useState<boolean>(false);
  const [highlightedTopBuyerIndex, setHighlightedTopBuyerIndex] = useState<number>(-1);
  const topBuyerContainerRef = useRef<HTMLDivElement>(null);
  const topBuyerInputRef = useRef<HTMLInputElement>(null);

  const handleOpenSellerStatementFromQuery = (nameOrContact?: string | Contact) => {
    let target: Contact | undefined;
    let targetNameOrId: string | undefined;

    if (nameOrContact && typeof nameOrContact === 'object') {
      target = nameOrContact;
      targetNameOrId = nameOrContact.id || nameOrContact.name;
    } else {
      const q = (typeof nameOrContact === 'string' ? nameOrContact : topSellerQuery || sellerName).trim();
      if (!q) {
        setValidationError('يرجى كتابة أو تحديد اسم الصياد أولاً لعرض كشف حسابه');
        return;
      }
      const qLower = q.toLowerCase();
      target =
        sellers.find((s) => s.id === q || s.name.trim().toLowerCase() === qLower || s.name.trim().toLowerCase().includes(qLower)) ||
        contacts.find((c) => c.id === q || c.name.trim().toLowerCase() === qLower || c.name.trim().toLowerCase().includes(qLower)) ||
        selectedSellerContact ||
        undefined;
      targetNameOrId = target ? (target.id || target.name) : q;
    }

    // إذا تم تحديد جهة اتصال نوعها مشتري حصراً، تحويل التوجيه فوراً لكشف حساب المشتري لمنع الخلط
    if (target && target.type === 'buyer') {
      handleOpenBuyerStatementFromQuery(target);
      return;
    }

    if (targetNameOrId) {
      if (onNavigateToCustomerStatement) {
        onNavigateToCustomerStatement('seller', targetNameOrId);
      } else {
        const fallbackTarget: Contact = target || {
          id: `seller-${Date.now()}`,
          name: targetNameOrId,
          type: 'seller',
          phone: '',
          createdAt: new Date().toISOString(),
        };
        setStatementSellerContact(fallbackTarget);
        setIsSellerStatementOpen(true);
      }
      setIsTopSellerDropdownOpen(false);
      setValidationError(null);
    } else {
      setValidationError('يرجى تحديد أو كتابة اسم الصياد أولاً لعرض كشف حسابه');
    }
  };

  const handleOpenBuyerStatementFromQuery = (nameOrContact?: string | Contact) => {
    let target: Contact | undefined;
    let targetNameOrId: string | undefined;

    if (nameOrContact && typeof nameOrContact === 'object') {
      target = nameOrContact;
      targetNameOrId = nameOrContact.id || nameOrContact.name;
    } else {
      const q = (typeof nameOrContact === 'string' ? nameOrContact : topBuyerQuery || buyerName).trim();
      if (!q) {
        setValidationError('يرجى كتابة أو تحديد اسم المشتري أولاً لعرض كشف حسابه');
        return;
      }
      const qLower = q.toLowerCase();
      const qNorm = normalizeArabic(q);
      target =
        buyers.find((b) => b.id === q || b.name.trim().toLowerCase() === qLower || normalizeArabic(b.name) === qNorm) ||
        contacts.find((c) => (c.type === 'buyer' || c.type === 'both') && (c.id === q || c.name.trim().toLowerCase() === qLower || normalizeArabic(c.name) === qNorm)) ||
        buyers.find((b) => b.name.trim().toLowerCase().includes(qLower) || normalizeArabic(b.name).includes(qNorm)) ||
        contacts.find((c) => (c.type === 'buyer' || c.type === 'both') && (c.name.trim().toLowerCase().includes(qLower) || normalizeArabic(c.name).includes(qNorm))) ||
        contacts.find((c) => c.id === q || c.name.trim().toLowerCase() === qLower || normalizeArabic(c.name) === qNorm) ||
        selectedBuyerContact ||
        undefined;
      targetNameOrId = target ? (target.id || target.name) : q;
    }

    if (targetNameOrId) {
      if (onNavigateToCustomerStatement) {
        onNavigateToCustomerStatement('buyer', targetNameOrId);
      } else {
        const fallbackTarget: Contact = target || {
          id: `buyer-${Date.now()}`,
          name: targetNameOrId,
          type: 'buyer',
          phone: '',
          createdAt: new Date().toISOString(),
        };
        setStatementBuyerContact(fallbackTarget);
        setIsBuyerStatementOpen(true);
      }
      setIsTopBuyerDropdownOpen(false);
      setValidationError(null);
    } else {
      setValidationError('يرجى تحديد أو كتابة اسم المشتري أولاً لعرض كشف حسابه');
    }
  };

  // Buyer metrics for statement modal
  const statementBuyerTransactions = useMemo(() => {
    if (!statementBuyerContact) return [];
    return (transactions || []).filter(
      (t) =>
        (t.buyerId && t.buyerId === statementBuyerContact.id) ||
        (t.buyerName || '').trim().toLowerCase() === (statementBuyerContact.name || '').trim().toLowerCase()
    );
  }, [transactions, statementBuyerContact]);

  const statementBuyerMetrics = useMemo(() => {
    let grossTotal = 0;
    let taxTotal = 0;
    let finalTotal = 0;
    statementBuyerTransactions.forEach((t) => {
      grossTotal += Number(t.grossAmount) || 0;
      taxTotal += Number(t.buyerTaxAmount) || 0;
      finalTotal += Number(t.totalFromBuyer) || 0;
    });
    return {
      grossTotal,
      taxTotal,
      finalTotal,
      count: statementBuyerTransactions.length,
    };
  }, [statementBuyerTransactions]);

  // Settlement & Clearing method state (آجل بضمان الجمعية أو كاش عبر الصندوق)
  const [settlementType, setSettlementType] = useState<SettlementType>('association_credit');
  const [partialPaidInput, setPartialPaidInput] = useState<number | ''>('');

  // Custom payout amount to seller (الافتراضي: مسدد بالكامل 100% نقداً بضمان الجمعية)
  const [sellerPaidMode, setSellerPaidMode] = useState<'full' | 'half' | 'zero' | 'custom'>('full');
  const [customSellerPaidInput, setCustomSellerPaidInput] = useState<number | ''>('');

  // Liquidity Alert & Quick Float Modal state
  const [liquidityModal, setLiquidityModal] = useState<LiquidityModalState | null>(null);
  const [quickFloatInput, setQuickFloatInput] = useState<string>('');
  const [quickFloatError, setQuickFloatError] = useState<string | null>(null);

  // Option to deduct purchase amount from buyer's advance balance (قدمة)
  const [useBuyerAdvance, setUseBuyerAdvance] = useState<boolean>(true);

  // Real-time calculation of selected buyer's advance deposit (قدمة)
  const buyerAdvanceStats = useMemo(() => {
    return calculateBuyerAdvanceBalance(
      selectedBuyerContact?.id,
      buyerName,
      cashEntries,
      transactions
    );
  }, [selectedBuyerContact, buyerName, cashEntries, transactions]);

  const buyerAvailableAdvance = buyerAdvanceStats.currentAdvanceBalance;

  // Real-time calculation of advances (سلف) on the selected Seller (Fisherman)
  const sellerDebtStats = useMemo(() => {
    const sName = sellerName.trim().toLowerCase();
    const sId = selectedSellerContact?.id?.trim().toLowerCase();
    if (!sName && !sId) {
      return { advanceDebt: 0, totalDebt: 0 };
    }

    // Advances (سلف الصياد النقدية من الصندوق فقط)
    let advanceTaken = 0;
    let advanceRepaid = 0;
    (cashEntries || []).forEach((e) => {
      const match =
        (sId && e.contactId && e.contactId.trim().toLowerCase() === sId) ||
        (sName && e.contactName && e.contactName.trim().toLowerCase() === sName);
      if (match) {
        if (e.type === 'seller_advance') advanceTaken += e.amount;
        else if (e.type === 'seller_advance_repayment') advanceRepaid += e.amount;
      }
    });
    const advanceDebt = Math.max(0, advanceTaken - advanceRepaid);

    return {
      advanceDebt,
      totalDebt: advanceDebt,
    };
  }, [sellerName, selectedSellerContact, cashEntries]);

  // Real-time calculation of unpaid purchases & debts on the selected Buyer (المشتري)
  const buyerDebtStats = useMemo(() => {
    const bName = buyerName.trim().toLowerCase();
    const bId = selectedBuyerContact?.id?.trim().toLowerCase();
    if (!bName && !bId) {
      return { totalDebt: 0, unpaidDealsCount: 0 };
    }

    let totalDebt = 0;
    let unpaidDealsCount = 0;
    (transactions || []).forEach((t) => {
      const matchBuyer =
        (bId && t.buyerId && t.buyerId.trim().toLowerCase() === bId) ||
        (bName && t.buyerName && t.buyerName.trim().toLowerCase() === bName);
      if (matchBuyer) {
        const debt = getTransactionBuyerDebt(t);
        if (debt > 0) {
          totalDebt += debt;
          unpaidDealsCount += 1;
        }
      }
    });

    return {
      totalDebt,
      unpaidDealsCount,
    };
  }, [buyerName, selectedBuyerContact, transactions]);

  // Commission and discount rates from Settings (Defaults: 2% buyer, 3% seller)
  const defaultBuyerTaxRate = typeof settings.buyerTaxRate === 'number' ? settings.buyerTaxRate : 0.02;
  const defaultSellerTaxRate = typeof settings.sellerTaxRate === 'number' ? settings.sellerTaxRate : 0.03;

  // Buyer commission rate override (default from settings, but cashier can exempt or adjust)
  const [customBuyerTaxRate, setCustomBuyerTaxRate] = useState<number | null>(null);
  const activeBuyerTaxRate = customBuyerTaxRate !== null ? customBuyerTaxRate : defaultBuyerTaxRate;

  // Seller discount rate override (default from settings, but cashier can switch or exempt)
  const [customSellerTaxRate, setCustomSellerTaxRate] = useState<number | null>(() => {
    try {
      const storedRate = window.localStorage.getItem('fast-entry:seller-tax-rate');
      if (storedRate === null) return null;
      const parsedRate = Number(storedRate);
      return Number.isFinite(parsedRate) ? parsedRate : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (customSellerTaxRate === null) {
        window.localStorage.removeItem('fast-entry:seller-tax-rate');
      } else {
        window.localStorage.setItem('fast-entry:seller-tax-rate', String(customSellerTaxRate));
      }
    } catch {
      // localStorage may be unavailable; the in-memory selection still works for this session.
    }
  }, [customSellerTaxRate]);

  const activeSellerTaxRate = customSellerTaxRate !== null ? customSellerTaxRate : defaultSellerTaxRate;

  // Calculate gross for current uncommitted item
  const currentItemGross = useMemo(() => {
    if (isLumpSum) {
      return Number(lumpSumPrice) || 0;
    }
    const strQty = String(quantity ?? '').trim();
    if (!strQty) return 0;
    const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
    const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
    const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
    const priceVal = Number(unitPrice) || 0;
    if (!isNumeric) {
      return priceVal;
    }
    const parsedQty = parseQuantityNumber(strQty);
    return Math.round((parsedQty || 0) * priceVal * 100) / 100;
  }, [isLumpSum, lumpSumPrice, quantity, unitPrice]);

  // Total gross: items in list + current uncommitted item (if any)
  const effectiveGross =
    itemsList.reduce((sum, item) => sum + item.totalGross, 0) + currentItemGross;

  // Real-time financial calculations
  const financials = calculateFinancials(
    effectiveGross,
    activeBuyerTaxRate,
    activeSellerTaxRate
  );

  // Calculate effective paid to fisherman from association (الافتراضي 100% نقداً)
  const effectiveSellerPaid = useMemo(() => {
    if (sellerPaidMode === 'full') {
      return financials.netToSeller;
    }
    if (sellerPaidMode === 'half') {
      return Math.round(financials.netToSeller / 2);
    }
    if (sellerPaidMode === 'zero') {
      return 0;
    }
    // 'custom'
    if (customSellerPaidInput === '') {
      return financials.netToSeller;
    }
    return Math.min(financials.netToSeller, Math.max(0, Number(customSellerPaidInput)));
  }, [sellerPaidMode, customSellerPaidInput, financials.netToSeller]);

  const sellerRemainingDebt = Math.max(0, financials.netToSeller - effectiveSellerPaid);

  // Fish selection & autocomplete logic
  const handleSelectFish = (fish: FishType) => {
    setSelectedFishId(fish.id);
    setCustomFishName(fish.arabicName || fish.name);
    if (fish.unitLabel && !unit) {
      setUnit(fish.unitLabel);
    }
    setIsFishDropdownOpen(false);
    setHighlightedFishIndex(-1);
  };

  const handleFishInputChange = (val: string) => {
    setCustomFishName(val);
    setSelectedFishId('');
    setIsFishDropdownOpen(true);
    setHighlightedFishIndex(0);
    const exact = fishTypes.find(
      (f) => (f.arabicName || '').trim().toLowerCase() === val.trim().toLowerCase()
    );
    if (exact) {
      setSelectedFishId(exact.id);
      if (exact.unitLabel && !unit) setUnit(exact.unitLabel);
    }
  };

  const fishInputValue = customFishName || (selectedFishId ? (fishTypes.find((f) => f.id === selectedFishId)?.arabicName || '') : '');
  const filteredFish = useMemo(() => {
    const q = fishInputValue.trim().toLowerCase();
    if (!q) return fishTypes;
    return fishTypes.filter((f) =>
      (f.arabicName || '').toLowerCase().includes(q) ||
      (f.name || '').toLowerCase().includes(q)
    );
  }, [fishInputValue, fishTypes]);


  // Add current item to list (for multi-item deals)
  const handleAddItemToList = () => {
    const activeFish = fishTypes.find((f) => f.id === selectedFishId);
    const fishName = customFishName.trim() || activeFish?.arabicName || '';
    if (!fishName) {
      setValidationError('⚠️ حقل الصنف فارغ: يرجى اختيار نوع السمك أو كتابة اسم الصنف أولاً');
      return;
    }

    if (isLumpSum) {
      const lumpVal = Number(lumpSumPrice);
      if (!lumpSumPrice || isNaN(lumpVal) || lumpVal <= 0) {
        setValidationError('⚠️ حقل السعر فارغ: يرجى إدخال السعر الإجمالي المقطوع للصنف');
        return;
      }
      const strQty = String(quantity ?? '').trim();
      const resolvedUnit = unit.trim() || activeFish?.unitLabel || 'شروة/لوت';
      const parsedQty = parseQuantityNumber(strQty);
      const qtyVal = strQty === '' ? 1 : (isNaN(Number(strQty)) ? strQty : Number(strQty));
      const newItem: TransactionItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        fishTypeId: selectedFishId || 'custom',
        fishName,
        quantity: qtyVal,
        unit: resolvedUnit,
        unitPrice: lumpVal / (typeof qtyVal === 'number' && qtyVal > 0 ? qtyVal : (parsedQty || 1)),
        totalGross: lumpVal,
      };
      setItemsList((prev) => [...prev, newItem]);
    } else {
      const strQty = String(quantity ?? '').trim();
      if (!strQty) {
        setValidationError('⚠️ حقل الكمية فارغ: يرجى إدخال كمية الصنف');
        return;
      }
      const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
      const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
      const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
      const priceVal = Number(unitPrice);
      if (unitPrice === '' || isNaN(priceVal) || priceVal <= 0) {
        setValidationError('⚠️ حقل سعر الوحدة فارغ: يرجى إدخال سعر الوحدة للصنف');
        return;
      }
      const resolvedUnit = unit.trim() || activeFish?.unitLabel || (isNumeric ? 'حبة' : '');
      const parsedQty = parseQuantityNumber(strQty);
      const itemGross = !isNumeric ? priceVal : Math.round(parsedQty * priceVal * 100) / 100;
      const finalQty = !isNumeric ? strQty : (isFraction ? strQty : (Number(normalizedDigits) || parsedQty));
      const newItem: TransactionItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        fishTypeId: selectedFishId || 'custom',
        fishName,
        quantity: finalQty,
        unit: resolvedUnit,
        unitPrice: priceVal,
        totalGross: itemGross,
      };
      setItemsList((prev) => [...prev, newItem]);
    }

    setValidationError(null);

    // تفريغ حقول الصنف لإتاحة كتابة الصنف التالي
    setSelectedFishId('');
    setCustomFishName('');
    setQuantity('');
    setUnitPrice('');
    setUnit('');
    setIsLumpSum(false);
    setLumpSumPrice('');

    setTimeout(() => {
      fishInputRef.current?.focus();
      fishInputRef.current?.select?.();
    }, 60);
  };

  const handleRemoveItem = (index: number) => {
    setItemsList((prev) => prev.filter((_, i) => i !== index));
    if (editingItemIndex === index) {
      setEditingItemIndex(null);
      setEditingItemData(null);
    }
  };

  const handleStartEditItem = (index: number) => {
    setEditingItemIndex(index);
    setEditingItemData({ ...itemsList[index] });
  };

  // Sorted sellers with most recently active first (strictly sellers and both, excluding workers)
  const sortedSellers = useMemo(() => {
    const rawSellers = contacts.filter((c) => (c.type === 'seller' || c.type === 'both') && c.type !== 'worker');
    const lastActiveMap = new Map<string, number>();
    const frequencyMap = new Map<string, number>();

    transactions.forEach((t) => {
      const sName = t.sellerName?.trim().toLowerCase();
      const sId = t.sellerId;
      const ts = t.timestamp || 0;
      if (sId) {
        lastActiveMap.set(sId, Math.max(lastActiveMap.get(sId) || 0, ts));
        frequencyMap.set(sId, (frequencyMap.get(sId) || 0) + 1);
      }
      if (sName) {
        lastActiveMap.set(sName, Math.max(lastActiveMap.get(sName) || 0, ts));
        frequencyMap.set(sName, (frequencyMap.get(sName) || 0) + 1);
      }
    });

    return [...rawSellers].sort((a, b) => {
      const aTs = Math.max(lastActiveMap.get(a.id) || 0, lastActiveMap.get(a.name.trim().toLowerCase()) || 0);
      const bTs = Math.max(lastActiveMap.get(b.id) || 0, lastActiveMap.get(b.name.trim().toLowerCase()) || 0);
      if (bTs !== aTs) return bTs - aTs;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [contacts, transactions]);

  // Filtered matching sellers with name and phone search + 10-item limit (مع إظهار المشترين إذا كان المحاسب يبحث عن اسمهم لبيع صيد)
  const { visibleSellers, totalMatchingSellers } = useMemo(() => {
    const query = normalizeArabic(sellerName);
    const rawQuery = sellerName.trim();
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filteredSellers = sortedSellers.filter((s) => {
      if (!query && !numericQuery) return true;
      const normName = normalizeArabic(s.name);
      const phoneClean = (s.phone || '').replace(/\D/g, '');

      const nameMatch = query ? normName.includes(query) : false;
      const phoneMatch = Boolean(
        numericQuery && (
          phoneClean.includes(numericQuery) ||
          phoneClean.endsWith(numericQuery)
        )
      );

      return nameMatch || phoneMatch;
    });

    // إذا كتب المحاسب حرفين أو أكثر وبحث عن شخص، نبحث أيضاً في المشترين المسجلين في حال أراد أحدهم البيع
    const matchingBuyers = (query.length >= 2 || numericQuery.length >= 2)
      ? contacts.filter((c) => {
        if (c.type !== 'buyer') return false;
        const normName = normalizeArabic(c.name);
        const phoneClean = (c.phone || '').replace(/\D/g, '');
        const nameMatch = query ? normName.includes(query) : false;
        const phoneMatch = Boolean(numericQuery && (phoneClean.includes(numericQuery) || phoneClean.endsWith(numericQuery)));
        return nameMatch || phoneMatch;
      })
      : [];

    const combined = [...filteredSellers, ...matchingBuyers];
    const MAX_VISIBLE = 10;
    return {
      visibleSellers: combined.slice(0, MAX_VISIBLE),
      totalMatchingSellers: combined.length,
    };
  }, [sortedSellers, contacts, sellerName]);

  // Sorted buyers with most recently used / frequently dealt first
  const sortedBuyers = useMemo(() => {
    const rawBuyers = contacts.filter((c) => (c.type === 'buyer' || c.type === 'both') && c.type !== 'worker');
    const lastActiveMap = new Map<string, number>();
    const frequencyMap = new Map<string, number>();

    transactions.forEach((t) => {
      const bName = t.buyerName?.trim().toLowerCase();
      const bId = t.buyerId;
      const ts = t.timestamp || 0;
      if (bId) {
        lastActiveMap.set(bId, Math.max(lastActiveMap.get(bId) || 0, ts));
        frequencyMap.set(bId, (frequencyMap.get(bId) || 0) + 1);
      }
      if (bName) {
        lastActiveMap.set(bName, Math.max(lastActiveMap.get(bName) || 0, ts));
        frequencyMap.set(bName, (frequencyMap.get(bName) || 0) + 1);
      }
    });

    return [...rawBuyers].sort((a, b) => {
      const aTs = Math.max(lastActiveMap.get(a.id) || 0, lastActiveMap.get(a.name.trim().toLowerCase()) || 0);
      const bTs = Math.max(lastActiveMap.get(b.id) || 0, lastActiveMap.get(b.name.trim().toLowerCase()) || 0);
      if (bTs !== aTs) return bTs - aTs;
      const aFreq = (frequencyMap.get(a.id) || 0) + (frequencyMap.get(a.name.trim().toLowerCase()) || 0);
      const bFreq = (frequencyMap.get(b.id) || 0) + (frequencyMap.get(b.name.trim().toLowerCase()) || 0);
      if (bFreq !== aFreq) return bFreq - aFreq;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [contacts, transactions]);

  // Filtered matching buyers with name and phone search + 10-item limit
  const { visibleBuyers, totalMatchingBuyers } = useMemo(() => {
    const query = normalizeArabic(buyerName);
    const rawQuery = buyerName.trim();
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filtered = sortedBuyers.filter((b) => {
      if (!query && !numericQuery) return true;
      const normName = normalizeArabic(b.name);
      const phoneClean = (b.phone || '').replace(/\D/g, '');

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
      visibleBuyers: filtered.slice(0, MAX_VISIBLE),
      totalMatchingBuyers: filtered.length,
    };
  }, [sortedBuyers, buyerName]);

  // Matching sellers for smart top quick-statement search (instant matching on first letter)
  // Matching sellers for smart top quick-statement search (instant matching on first letter, phone, or name)
  const matchingTopSellers = useMemo(() => {
    const rawQ = topSellerQuery.trim();
    if (!rawQ) return [];
    const numQ = rawQ.replace(/\D/g, '');

    const seenNames = new Set();
    const allCandidateSellers = [];

    sortedSellers.forEach((s) => {
      const lower = s.name.trim().toLowerCase();
      if (!seenNames.has(lower)) {
        seenNames.add(lower);
        allCandidateSellers.push(s);
      }
    });

    transactions.forEach((t) => {
      const sName = (t.sellerName || '').trim();
      if (sName && !seenNames.has(sName.toLowerCase())) {
        seenNames.add(sName.toLowerCase());
        allCandidateSellers.push({
          id: t.sellerId || ('seller-' + sName),
          name: sName,
          type: 'seller',
          phone: '',
          createdAt: t.dateStr || new Date().toISOString(),
        });
      }
    });

    return allCandidateSellers.filter((s) => {
      const nameMatch = fuzzyMatchArabic(s.name, rawQ);
      const phone = (s.phone || '').replace(/\D/g, '');
      const phoneMatch = Boolean(numQ && phone.includes(numQ));
      const idMatch = (s.id || '').toLowerCase().includes(rawQ.toLowerCase());
      return nameMatch || phoneMatch || idMatch;
    }).slice(0, 20);
  }, [sortedSellers, transactions, topSellerQuery]);

  // Matching buyers for smart top quick-statement search (instant matching on first letter)
  const matchingTopBuyers = useMemo(() => {
    const q = normalizeArabic(topBuyerQuery);
    const rawQ = topBuyerQuery.trim();
    if (!rawQ) return [];
    const numQ = rawQ.replace(/\D/g, '');
    return sortedBuyers.filter((b) => {
      const norm = normalizeArabic(b.name);
      const phone = (b.phone || '').replace(/\D/g, '');
      const nameMatch = q ? norm.includes(q) : false;
      const phoneMatch = Boolean(numQ && phone.includes(numQ));
      return nameMatch || phoneMatch;
    }).slice(0, 8);
  }, [sortedBuyers, topBuyerQuery]);

  // Keyboard navigation for Top Seller Quick Search (Arrow keys + Enter)
  const handleTopSellerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isTopSellerDropdownOpen && matchingTopSellers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedTopSellerIndex((prev) =>
          prev < matchingTopSellers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedTopSellerIndex((prev) =>
          prev > 0 ? prev - 1 : matchingTopSellers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedTopSellerIndex >= 0 && matchingTopSellers[highlightedTopSellerIndex]) {
          const chosen = matchingTopSellers[highlightedTopSellerIndex];
          setTopSellerQuery(chosen.name);
          handleOpenSellerStatementFromQuery(chosen);
        } else if (matchingTopSellers.length > 0) {
          const first = matchingTopSellers[0];
          setTopSellerQuery(first.name);
          handleOpenSellerStatementFromQuery(first);
        } else {
          handleOpenSellerStatementFromQuery();
        }
        setIsTopSellerDropdownOpen(false);
        return;
      } else if (e.key === 'Escape') {
        setIsTopSellerDropdownOpen(false);
        return;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleOpenSellerStatementFromQuery();
    }
  };

  // Keyboard navigation for Top Buyer Quick Search (Arrow keys + Enter)
  const handleTopBuyerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isTopBuyerDropdownOpen && matchingTopBuyers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedTopBuyerIndex((prev) =>
          prev < matchingTopBuyers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedTopBuyerIndex((prev) =>
          prev > 0 ? prev - 1 : matchingTopBuyers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedTopBuyerIndex >= 0 && matchingTopBuyers[highlightedTopBuyerIndex]) {
          const chosen = matchingTopBuyers[highlightedTopBuyerIndex];
          setTopBuyerQuery(chosen.name);
          handleOpenBuyerStatementFromQuery(chosen);
        } else if (matchingTopBuyers.length > 0) {
          const first = matchingTopBuyers[0];
          setTopBuyerQuery(first.name);
          handleOpenBuyerStatementFromQuery(first);
        } else {
          handleOpenBuyerStatementFromQuery();
        }
        setIsTopBuyerDropdownOpen(false);
        return;
      } else if (e.key === 'Escape') {
        setIsTopBuyerDropdownOpen(false);
        return;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleOpenBuyerStatementFromQuery();
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        sellerContainerRef.current &&
        !sellerContainerRef.current.contains(event.target as Node)
      ) {
        setIsSellerDropdownOpen(false);
      }
      if (
        buyerContainerRef.current &&
        !buyerContainerRef.current.contains(event.target as Node)
      ) {
        setIsBuyerDropdownOpen(false);
      }
      if (
        fishContainerRef.current &&
        !fishContainerRef.current.contains(event.target as Node)
      ) {
        setIsFishDropdownOpen(false);
      }
      if (
        topSellerContainerRef.current &&
        !topSellerContainerRef.current.contains(event.target as Node)
      ) {
        setIsTopSellerDropdownOpen(false);
      }
      if (
        topBuyerContainerRef.current &&
        !topBuyerContainerRef.current.contains(event.target as Node)
      ) {
        setIsTopBuyerDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus on active screen
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        if (!sellerName) {
          sellerInputRef.current?.focus();
        } else {
          buyerInputRef.current?.focus();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  // Global POS Keyboard Shortcuts (Ctrl+Enter to save/print, Alt+Enter to save only, F1-F3 to jump fields)
  useEffect(() => {
    if (!isActive) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (liquidityModal?.isOpen) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleProcessTransaction(true);
      } else if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        handleProcessTransaction(false);
      } else if (e.key === 'F1') {
        e.preventDefault();
        sellerInputRef.current?.focus();
        sellerInputRef.current?.select?.();
      } else if (e.key === 'F2') {
        e.preventDefault();
        buyerInputRef.current?.focus();
        buyerInputRef.current?.select?.();
      } else if (e.key === 'F3') {
        e.preventDefault();
        fishInputRef.current?.focus();
        fishInputRef.current?.select?.();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isActive, liquidityModal, sellerName, buyerName, itemsList, selectedFishId, customFishName, quantity, unitPrice, lumpSumPrice, isLumpSum]);

  // Sync initial seller once if inputs are empty on load; leave buyer empty
  const initialSellerSyncDone = useRef(false);
  useEffect(() => {
    if (!initialSellerSyncDone.current && sellers.length > 0) {
      if (!sellerName) {
        setSellerName(sellers[0].name);
        setSelectedSellerContact(sellers[0]);
      }
      initialSellerSyncDone.current = true;
    }
  }, [contacts, sellers, sellerName]);

  const handleSelectSeller = (contact: Contact) => {
    setSellerName(contact.name);
    setSelectedSellerContact(contact);
    if (contact.type === 'buyer' || contact.type === 'both') {
      if (settings.showSellerRoleToggle) {
        setSellerRole('seller');
      }
    }
    setIsSellerDropdownOpen(false);
    setHighlightedSellerIndex(-1);
  };

  const handleSellerInputChange = (val: string) => {
    setSellerName(val);
    setIsSellerDropdownOpen(true);
    setHighlightedSellerIndex(0);
    const exact = contacts.find((s) => s.name.trim().toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setSelectedSellerContact(exact);
      if (exact.type === 'buyer' || exact.type === 'both') {
        if (settings.showSellerRoleToggle) {
          setSellerRole('seller');
        }
      }
    } else {
      setSelectedSellerContact(null);
    }
  };

  const handleSelectBuyer = (contact: Contact) => {
    setBuyerName(contact.name);
    setSelectedBuyerContact(contact);
    setIsBuyerDropdownOpen(false);
    setHighlightedBuyerIndex(-1);
  };

  const handleBuyerInputChange = (val: string) => {
    setBuyerName(val);
    setIsBuyerDropdownOpen(true);
    setHighlightedBuyerIndex(0);
    const exact = buyers.find((b) => b.name.trim().toLowerCase() === val.trim().toLowerCase());
    if (exact) {
      setSelectedBuyerContact(exact);
    } else {
      setSelectedBuyerContact(null);
    }
  };

  const handleSellerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isSellerDropdownOpen && visibleSellers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedSellerIndex((prev) =>
          prev < visibleSellers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedSellerIndex((prev) =>
          prev > 0 ? prev - 1 : visibleSellers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedSellerIndex >= 0 && visibleSellers[highlightedSellerIndex]) {
          handleSelectSeller(visibleSellers[highlightedSellerIndex]);
        }
        setIsSellerDropdownOpen(false);
        buyerInputRef.current?.focus();
        buyerInputRef.current?.select?.();
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsSellerDropdownOpen(false);
        return;
      }
    } else {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsSellerDropdownOpen(true);
        setHighlightedSellerIndex(0);
        return;
      }
    }

    if (e.key === 'Enter' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
      e.preventDefault();
      setIsSellerDropdownOpen(false);
      buyerInputRef.current?.focus();
      buyerInputRef.current?.select?.();
    }
  };

  const handleBuyerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isBuyerDropdownOpen && visibleBuyers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedBuyerIndex((prev) =>
          prev < visibleBuyers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedBuyerIndex((prev) =>
          prev > 0 ? prev - 1 : visibleBuyers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedBuyerIndex >= 0 && visibleBuyers[highlightedBuyerIndex]) {
          handleSelectBuyer(visibleBuyers[highlightedBuyerIndex]);
        }
        setIsBuyerDropdownOpen(false);
        fishInputRef.current?.focus();
        fishInputRef.current?.select?.();
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsBuyerDropdownOpen(false);
        return;
      }
    } else {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsBuyerDropdownOpen(true);
        setHighlightedBuyerIndex(0);
        return;
      }
    }

    if (e.key === 'Enter' || (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
      e.preventDefault();
      setIsBuyerDropdownOpen(false);
      fishInputRef.current?.focus();
      fishInputRef.current?.select?.();
    } else if (e.key === 'ArrowRight' && (e.currentTarget.selectionStart === 0 || !buyerName)) {
      e.preventDefault();
      setIsBuyerDropdownOpen(false);
      sellerInputRef.current?.focus();
      sellerInputRef.current?.select?.();
    }
  };

  const handleFishKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isFishDropdownOpen && filteredFish.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedFishIndex((prev) =>
          prev < filteredFish.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedFishIndex((prev) =>
          prev > 0 ? prev - 1 : filteredFish.length - 1
        );
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsFishDropdownOpen(false);
        return;
      }
    } else {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsFishDropdownOpen(true);
        setHighlightedFishIndex(0);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (isFishDropdownOpen && highlightedFishIndex >= 0 && filteredFish[highlightedFishIndex]) {
        handleSelectFish(filteredFish[highlightedFishIndex]);
      }
      setIsFishDropdownOpen(false);
      if (isLumpSum) {
        lumpSumPriceInputRef.current?.focus();
        lumpSumPriceInputRef.current?.select?.();
      } else {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select?.();
      }
    } else if (e.key === 'ArrowLeft' && (e.currentTarget.selectionStart === e.currentTarget.value.length || !isFishDropdownOpen)) {
      e.preventDefault();
      setIsFishDropdownOpen(false);
      if (isLumpSum) {
        lumpSumPriceInputRef.current?.focus();
        lumpSumPriceInputRef.current?.select?.();
      } else {
        quantityInputRef.current?.focus();
        quantityInputRef.current?.select?.();
      }
    } else if (e.key === 'ArrowRight' && (e.currentTarget.selectionStart === 0 || !isFishDropdownOpen)) {
      e.preventDefault();
      setIsFishDropdownOpen(false);
      buyerInputRef.current?.focus();
      buyerInputRef.current?.select?.();
    }
  };

  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowLeft') {
      e.preventDefault();
      unitInputRef.current?.focus();
      unitInputRef.current?.select?.();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      fishInputRef.current?.focus();
      fishInputRef.current?.select?.();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      unitPriceInputRef.current?.focus();
      unitPriceInputRef.current?.select?.();
    }
  };

  const handleUnitKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowLeft') {
      e.preventDefault();
      unitPriceInputRef.current?.focus();
      unitPriceInputRef.current?.select?.();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select?.();
    }
  };

  const handleUnitPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitOnlyBtnRef.current?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      unitInputRef.current?.focus();
      unitInputRef.current?.select?.();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select?.();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      submitOnlyBtnRef.current?.focus();
    }
  };

  const handleLumpSumPriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      submitOnlyBtnRef.current?.focus();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      fishInputRef.current?.focus();
      fishInputRef.current?.select?.();
    }
  };

  const handleSubmitOnlyKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      submitPrintBtnRef.current?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isLumpSum) {
        lumpSumPriceInputRef.current?.focus();
        lumpSumPriceInputRef.current?.select?.();
      } else {
        unitPriceInputRef.current?.focus();
        unitPriceInputRef.current?.select?.();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (isLumpSum) {
        lumpSumPriceInputRef.current?.focus();
      } else {
        unitPriceInputRef.current?.focus();
      }
    }
  };

  const handleSubmitPrintKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      submitOnlyBtnRef.current?.focus();
    }
  };

  // استرجاع بيانات الفاتورة المحددة بالكامل إلى حقول الإدخال للتعديل
  const handleLoadTransactionForEdit = (trx: Transaction) => {
    // 1. استرجاع بيانات الصياد
    setSellerName(trx.sellerName || '');
    const matchedSeller = sellers.find(
      (s) => s.id === trx.sellerId || s.name.trim().toLowerCase() === (trx.sellerName || '').trim().toLowerCase()
    );
    setSelectedSellerContact(
      matchedSeller || {
        id: trx.sellerId || `seller-${Date.now()}`,
        name: trx.sellerName,
        type: 'seller',
        phone: trx.sellerPhone || '',
      }
    );
    setSellerRole(trx.sellerRole === 'seller' ? 'seller' : 'fisherman');

    // 2. استرجاع بيانات المشتري
    setBuyerName(trx.buyerName || '');
    const matchedBuyer = buyers.find(
      (b) => b.id === trx.buyerId || b.name.trim().toLowerCase() === (trx.buyerName || '').trim().toLowerCase()
    ) || contacts.find(
      (c) => c.id === trx.buyerId || c.name.trim().toLowerCase() === (trx.buyerName || '').trim().toLowerCase()
    );
    setSelectedBuyerContact(
      matchedBuyer || {
        id: trx.buyerId || `buyer-${Date.now()}`,
        name: trx.buyerName,
        type: 'buyer',
        phone: trx.buyerPhone || '',
      }
    );

    // 3. استرجاع بيانات الصنف والكمية والوحدة والسعر بالكامل إلى حقول النموذج النشطة
    if (trx.items && trx.items.length > 0) {
      const firstItem = trx.items[0];
      const matchedFish = fishTypes.find(
        (f) =>
          f.id === firstItem.fishTypeId ||
          (f.arabicName || '').trim().toLowerCase() === (firstItem.fishName || '').trim().toLowerCase()
      );

      setSelectedFishId(matchedFish ? matchedFish.id : (firstItem.fishTypeId || 'custom'));
      setCustomFishName(firstItem.fishName || matchedFish?.arabicName || '');
      setQuantity(firstItem.quantity !== undefined && firstItem.quantity !== null ? firstItem.quantity : '');
      setUnit(firstItem.unit || matchedFish?.unitLabel || 'حبة');

      const isLump =
        firstItem.unit === 'شروة' ||
        firstItem.unit === 'شروة مقطوعة' ||
        firstItem.unit === 'شروة/لوت' ||
        firstItem.unit === 'لوت' ||
        (firstItem.totalGross > 0 && (!firstItem.unitPrice || firstItem.unitPrice === 0));

      if (isLump) {
        setIsLumpSum(true);
        setLumpSumPrice(firstItem.totalGross || (firstItem.unitPrice ? firstItem.unitPrice * (firstItem.quantity || 1) : ''));
        setUnitPrice('');
      } else {
        setIsLumpSum(false);
        setUnitPrice(firstItem.unitPrice !== undefined && firstItem.unitPrice !== null ? firstItem.unitPrice : '');
        setLumpSumPrice('');
      }

      // إذا كانت الفاتورة تحتوي على أكثر من صنف، نضع باقي الأصناف في قائمة الجدول
      if (trx.items.length > 1) {
        setItemsList(trx.items.slice(1).map((it) => ({ ...it })));
      } else {
        setItemsList([]);
      }
    } else {
      // في حال عدم وجود قائمة أصناف تفصيلية (مثل مبيعات الحراج المقطوعة)
      setSelectedFishId('custom');
      setCustomFishName('شروة أسماك');
      setQuantity(1);
      setUnit('شروة');
      setIsLumpSum(true);
      setLumpSumPrice(trx.grossAmount || '');
      setUnitPrice('');
      setItemsList([]);
    }

    // 4. استرجاع الضرائب وطريقة السداد والملاحظات وحالة الصرف
    setCustomSellerTaxRate(
      trx.sellerTaxRate !== undefined && trx.sellerTaxRate !== null
        ? trx.sellerTaxRate
        : null
    );
    setCustomBuyerTaxRate(
      trx.buyerTaxRate !== undefined && trx.buyerTaxRate !== null
        ? trx.buyerTaxRate
        : null
    );
    setSettlementType((trx.settlementType as any) || 'association_credit');
    if (trx.settlementType === 'partial_cash' && typeof trx.buyerPaidAmount === 'number') {
      setPartialPaidInput(trx.buyerPaidAmount);
    } else {
      setPartialPaidInput('');
    }

    if (trx.sellerPaidStatus === 'paid') {
      setSellerPaidMode('full');
      setCustomSellerPaidInput('');
    } else if (trx.sellerPaidStatus === 'unpaid') {
      setSellerPaidMode('zero');
      setCustomSellerPaidInput('');
    } else if (typeof trx.sellerPaidAmount === 'number' && trx.sellerPaidAmount > 0) {
      setSellerPaidMode('custom');
      setCustomSellerPaidInput(trx.sellerPaidAmount);
    } else {
      setSellerPaidMode('full');
      setCustomSellerPaidInput('');
    }

    setNotes(trx.notes || '');

    // 5. حفظ معرّف الفاتورة الأصلية لتحديثها عند الحفظ بدلاً من إنشاء فاتورة جديدة
    setEditingTransactionId(trx.id);
    setEditingOriginalTrx(trx);

    // 6. إشعار للمستخدم والتمرير لأعلى النموذج والتركيز على حقل الكمية أو السعر للتعديل الفوري
    setSavedFeedbackMessage(`تم استرجاع بيانات الفاتورة #${trx.id} بنجاح (الصياد، المشتري، الصنف، الكمية، السعر)`);
    setTimeout(() => setSavedFeedbackMessage(null), 4000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (quantityInputRef.current) {
        quantityInputRef.current.focus();
        quantityInputRef.current.select?.();
      } else if (fishInputRef.current) {
        fishInputRef.current.focus();
        fishInputRef.current.select?.();
      }
    }, 120);
  };

  const handleCancelEdit = () => {
    setEditingTransactionId(null);
    setEditingOriginalTrx(null);
    resetPOSForm();
    setSavedFeedbackMessage('تم إلغاء التعديل وتفريغ الحقول');
    setTimeout(() => setSavedFeedbackMessage(null), 3000);
  };

  // Save transaction
  const handleProcessTransaction = (autoPrint: boolean) => {
    if (isSubmitting) return;
    // 1. Resolve seller info
    const finalSellerName = sellerName.trim();
    if (!finalSellerName) {
      setValidationError('⚠️ حقل الصياد فارغ: يرجى كتابة أو اختيار اسم الصياد');
      return;
    }

    let finalSellerId = selectedSellerContact?.id;
    let finalSellerPhone = selectedSellerContact?.phone || '';

    // If no existing contact matched, check contacts across the entire directory
    if (!selectedSellerContact) {
      const existingMatch = contacts.find(
        (s) => s.name.trim().toLowerCase() === finalSellerName.toLowerCase()
      );
      if (existingMatch) {
        finalSellerId = existingMatch.id;
        finalSellerPhone = existingMatch.phone || '';
        setSelectedSellerContact(existingMatch);
        // ترقية ذكية تلقائية: إذا كان العميل مسجلاً كمشتري فقط وباع سمكاً الآن، يتم ترقية حسابه لـ (صياد ومشتري معاً)
        if (existingMatch.type === 'buyer') {
          const upgraded: Contact = { ...existingMatch, type: 'both' };
          onUpdateContact(upgraded);
          setSelectedSellerContact(upgraded);
        }
      } else {
        // Auto-register new seller in contacts
        const newContact = onQuickAddContact({
          name: finalSellerName,
          type: 'seller',
        });
        finalSellerId = newContact.id;
        finalSellerPhone = newContact.phone || '';
        setSelectedSellerContact(newContact);
      }
    } else if (selectedSellerContact.type === 'buyer') {
      // ترقية ذكية تلقائية في حال كان محدد مسبقاً
      const upgraded: Contact = { ...selectedSellerContact, type: 'both' };
      onUpdateContact(upgraded);
      setSelectedSellerContact(upgraded);
    }

    // 2. Resolve buyer info
    const finalBuyerName = buyerName.trim();
    if (!finalBuyerName) {
      setValidationError('⚠️ حقل المشتري فارغ: يرجى كتابة أو اختيار اسم المشتري');
      return;
    }

    let finalBuyerId = selectedBuyerContact?.id;
    let finalBuyerPhone = selectedBuyerContact?.phone || '';

    if (!selectedBuyerContact) {
      const existingMatch = buyers.find(
        (b) => b.name.trim().toLowerCase() === finalBuyerName.toLowerCase()
      ) || contacts.find(
        (c) => c.name.trim().toLowerCase() === finalBuyerName.toLowerCase()
      );
      if (existingMatch) {
        finalBuyerId = existingMatch.id;
        finalBuyerPhone = existingMatch.phone || '';
        setSelectedBuyerContact(existingMatch);
        // ترقية ذكية تلقائية: إذا كان العميل مسجلاً كصياد فقط واشترى سمكاً الآن، يتم ترقية حسابه لـ (صياد ومشتري معاً)
        if (existingMatch.type === 'seller') {
          const upgraded: Contact = { ...existingMatch, type: 'both' };
          onUpdateContact(upgraded);
          setSelectedBuyerContact(upgraded);
        }
      } else {
        // Auto-register new buyer in contacts
        const newContact = onQuickAddContact({
          name: finalBuyerName,
          type: 'buyer',
        });
        finalBuyerId = newContact.id;
        setSelectedBuyerContact(newContact);
      }
    } else if (selectedBuyerContact.type === 'seller') {
      // ترقية ذكية تلقائية في حال كان محدد مسبقاً
      const upgraded: Contact = { ...selectedBuyerContact, type: 'both' };
      onUpdateContact(upgraded);
      setSelectedBuyerContact(upgraded);
    }

    // 3. Resolve items with strict checks against empty fields
    let finalItems: TransactionItem[] = [];
    if (itemsList.length > 0) {
      finalItems = [...itemsList];

      // If user also entered another item in the active fields, validate it strictly
      const hasAnyActiveInput = Boolean(
        selectedFishId ||
        customFishName.trim() ||
        quantity !== '' ||
        unitPrice !== '' ||
        lumpSumPrice !== ''
      );

      if (hasAnyActiveInput) {
        const activeFish = fishTypes.find((f) => f.id === selectedFishId);
        const fishName = customFishName.trim() || activeFish?.arabicName || '';
        if (!fishName) {
          setValidationError('⚠️ حقل الصنف فارغ: يرجى اختيار نوع السمك أو كتابة اسم الصنف الإضافي');
          return;
        }

        if (isLumpSum) {
          const lumpVal = Number(lumpSumPrice);
          if (!lumpSumPrice || isNaN(lumpVal) || lumpVal <= 0) {
            setValidationError('⚠️ حقل السعر فارغ: يرجى إدخال السعر المقطوع للصنف الإضافي');
            return;
          }
          const strQty = String(quantity ?? '').trim();
          const resolvedUnit = unit.trim() || activeFish?.unitLabel || 'شروة/لوت';
          const parsedQty = parseQuantityNumber(strQty);
          const qtyVal = strQty === '' ? 1 : (isNaN(Number(strQty)) ? strQty : Number(strQty));
          finalItems.push({
            id: `item-${Date.now()}`,
            fishTypeId: selectedFishId || 'custom',
            fishName,
            quantity: qtyVal,
            unit: resolvedUnit,
            unitPrice: lumpVal / (typeof qtyVal === 'number' && qtyVal > 0 ? qtyVal : (parsedQty || 1)),
            totalGross: lumpVal,
          });
        } else {
          const strQty = String(quantity ?? '').trim();
          if (!strQty) {
            setValidationError('⚠️ حقل الكمية فارغ: يرجى إدخال كمية الصنف الإضافي');
            return;
          }
          const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
          const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
          const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
          const priceVal = Number(unitPrice);
          if (unitPrice === '' || isNaN(priceVal) || priceVal <= 0) {
            setValidationError('⚠️ حقل سعر الوحدة فارغ: يرجى إدخال سعر الوحدة للصنف الإضافي');
            return;
          }
          const resolvedUnit = unit.trim() || activeFish?.unitLabel || (isNumeric ? 'حبة' : '');
          const parsedQty = parseQuantityNumber(strQty);
          const itemGross = !isNumeric ? priceVal : Math.round(parsedQty * priceVal * 100) / 100;
          const finalQty = !isNumeric ? strQty : (isFraction ? strQty : (Number(normalizedDigits) || parsedQty));
          finalItems.push({
            id: `item-${Date.now()}`,
            fishTypeId: selectedFishId || 'custom',
            fishName,
            quantity: finalQty,
            unit: resolvedUnit,
            unitPrice: priceVal,
            totalGross: itemGross,
          });
        }
      }
    } else {
      // Single fast item from active inputs - strictly validated against empty fields
      const activeFish = fishTypes.find((f) => f.id === selectedFishId);
      const fishName = customFishName.trim() || activeFish?.arabicName || '';
      if (!fishName) {
        setValidationError('⚠️ حقل نوع السمك فارغ: يرجى اختيار نوع السمك أو كتابة اسم الصنف');
        return;
      }

      if (isLumpSum) {
        const lumpVal = Number(lumpSumPrice);
        if (!lumpSumPrice || isNaN(lumpVal) || lumpVal <= 0) {
          setValidationError('⚠️ حقل السعر فارغ: يرجى إدخال السعر الإجمالي المقطوع للصفقة');
          return;
        }
        const strQty = String(quantity ?? '').trim();
        const resolvedUnit = unit.trim() || activeFish?.unitLabel || 'شروة/لوت';
        const parsedQty = parseQuantityNumber(strQty);
        const qtyVal = strQty === '' ? 1 : (isNaN(Number(strQty)) ? strQty : Number(strQty));
        finalItems = [
          {
            id: `item-${Date.now()}`,
            fishTypeId: selectedFishId || 'custom',
            fishName,
            quantity: qtyVal,
            unit: resolvedUnit,
            unitPrice: lumpVal / (typeof qtyVal === 'number' && qtyVal > 0 ? qtyVal : (parsedQty || 1)),
            totalGross: lumpVal,
          },
        ];
      } else {
        const strQty = String(quantity ?? '').trim();
        if (!strQty) {
          setValidationError('⚠️ حقل الكمية فارغ: يرجى إدخال كمية الأسماك');
          return;
        }
        const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
        const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
        const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
        const priceVal = Number(unitPrice);
        if (unitPrice === '' || isNaN(priceVal) || priceVal <= 0) {
          setValidationError('⚠️ حقل سعر الوحدة فارغ: يرجى إدخال سعر الوحدة');
          return;
        }
        const resolvedUnit = unit.trim() || activeFish?.unitLabel || (isNumeric ? 'حبة' : '');
        const parsedQty = parseQuantityNumber(strQty);
        const itemGross = !isNumeric ? priceVal : Math.round(parsedQty * priceVal * 100) / 100;
        const finalQty = !isNumeric ? strQty : (isFraction ? strQty : (Number(normalizedDigits) || parsedQty));
        finalItems = [
          {
            id: `item-${Date.now()}`,
            fishTypeId: selectedFishId || 'custom',
            fishName,
            quantity: finalQty,
            unit: resolvedUnit,
            unitPrice: priceVal,
            totalGross: itemGross,
          },
        ];
      }
    }

    if (finalItems.length === 0) {
      setValidationError('⚠️ الفاتورة فارغة: لا توجد أي أصناف مسجلة');
      return;
    }

    const totalGross = finalItems.reduce((sum, it) => sum + it.totalGross, 0);
    const fin = calculateFinancials(totalGross, activeBuyerTaxRate, activeSellerTaxRate);

    // 4. Validate partial payment input if selected
    if (settlementType === 'partial_cash') {
      const parsedPaid = Number(partialPaidInput);
      if (partialPaidInput === '' || isNaN(parsedPaid) || parsedPaid <= 0) {
        setValidationError('⚠️ حقل الدفع الجزئي فارغ: يرجى إدخال المبلغ المسدد نقداً من المشتري');
        return;
      }
      if (parsedPaid > fin.totalFromBuyer) {
        setValidationError(`⚠️ المبلغ المسدد نقداً (${formatNumber(parsedPaid)}) لا يمكن أن يتجاوز إجمالي الفاتورة المطلوب (${formatNumber(fin.totalFromBuyer)})`);
        return;
      }
    }

    // 5. Validate custom seller payout if selected
    if (sellerPaidMode === 'custom') {
      const parsedCustom = Number(customSellerPaidInput);
      if (customSellerPaidInput === '' || isNaN(parsedCustom) || parsedCustom < 0) {
        setValidationError('⚠️ حقل المبلغ المسلم للصياد فارغ: يرجى إدخال المبلغ المسلم نقداً');
        return;
      }
    }
    const now = Date.now();
    const { dateStr, timeStr } = getArabicFormattedDate(now);
    const trxId = generateTransactionId(transactionsCount + 1);

    let buyerPaidAmount = fin.totalFromBuyer;
    let buyerRemainingDebt = 0;
    let paymentStatus: 'paid' | 'pending' | 'settled' = 'paid';
    let buyerAdvanceUsed: number | undefined = undefined;
    let effectiveSettlementType = settlementType;

    if (useBuyerAdvance && buyerAvailableAdvance > 0) {
      if (buyerAvailableAdvance >= fin.totalFromBuyer) {
        buyerAdvanceUsed = fin.totalFromBuyer;
        buyerPaidAmount = fin.totalFromBuyer;
        buyerRemainingDebt = 0;
        paymentStatus = 'paid';
        effectiveSettlementType = 'buyer_advance';
      } else {
        buyerAdvanceUsed = buyerAvailableAdvance;
        buyerPaidAmount = buyerAvailableAdvance;
        buyerRemainingDebt = Math.max(0, fin.totalFromBuyer - buyerAvailableAdvance);
        paymentStatus = 'pending';
        effectiveSettlementType = 'buyer_advance';
      }
    } else if (settlementType === 'association_cash') {
      buyerPaidAmount = fin.totalFromBuyer;
      buyerRemainingDebt = 0;
      paymentStatus = 'paid';
    } else if (settlementType === 'direct_cash') {
      buyerPaidAmount = fin.totalFromBuyer;
      buyerRemainingDebt = 0;
      paymentStatus = 'settled';
    } else if (settlementType === 'association_credit') {
      buyerPaidAmount = 0;
      buyerRemainingDebt = fin.totalFromBuyer;
      paymentStatus = 'pending';
    } else if (settlementType === 'partial_cash') {
      const parsedPaid = typeof partialPaidInput === 'number' ? partialPaidInput : 0;
      buyerPaidAmount = Math.min(fin.totalFromBuyer, Math.max(0, parsedPaid));
      buyerRemainingDebt = Math.max(0, fin.totalFromBuyer - buyerPaidAmount);
      paymentStatus = buyerRemainingDebt === 0 ? 'paid' : 'pending';
    }

    let actualSellerPaid = effectiveSellerPaid;
    let sellerRemainingDebt = Math.max(0, fin.netToSeller - actualSellerPaid);
    let sellerPaidStatus: 'paid' | 'unpaid' | 'partial' =
      actualSellerPaid >= fin.netToSeller ? 'paid' : actualSellerPaid > 0 ? 'partial' : 'unpaid';

    // فحص سيولة الصندوق لمنع خروج نقدية تجعل رصيد الصندوق سالباً
    let cashInFromInvoice = 0;
    if (effectiveSettlementType === 'association_cash') {
      cashInFromInvoice = fin.totalFromBuyer;
    } else if (effectiveSettlementType === 'direct_cash') {
      cashInFromInvoice = fin.harajProfit;
    } else if (effectiveSettlementType === 'partial_cash') {
      cashInFromInvoice = buyerPaidAmount;
    } else {
      cashInFromInvoice = 0;
    }

    const netDrawerCashNeeded = actualSellerPaid - cashInFromInvoice;

    if (
      actualSellerPaid > 0 &&
      currentDrawerCash !== undefined &&
      netDrawerCashNeeded > Math.max(0, currentDrawerCash)
    ) {
      const maxAvailableDrawerCash = Math.max(0, currentDrawerCash);
      const totalAvailableCash = maxAvailableDrawerCash + cashInFromInvoice;
      const maxCanPay = Math.min(actualSellerPaid, totalAvailableCash);
      const remainingDebt = Math.max(0, fin.netToSeller - maxCanPay);
      const shortage = actualSellerPaid - totalAvailableCash;

      const draftTransaction: Transaction = {
        id: trxId,
        timestamp: now,
        dateStr,
        timeStr,
        sellerId: finalSellerId || `seller-${now}`,
        sellerName: finalSellerName,
        sellerPhone: finalSellerPhone,
        sellerRole,
        buyerId: finalBuyerId || `buyer-${now}`,
        buyerName: finalBuyerName,
        buyerPhone: finalBuyerPhone,
        items: finalItems,
        grossAmount: fin.grossAmount,
        buyerTaxRate: fin.buyerTaxRate,
        buyerTaxAmount: fin.buyerTaxAmount,
        totalFromBuyer: fin.totalFromBuyer,
        sellerTaxRate: fin.sellerTaxRate,
        sellerTaxAmount: fin.sellerTaxAmount,
        netToSeller: fin.netToSeller,
        harajProfit: fin.harajProfit,
        paymentStatus,
        settlementType: effectiveSettlementType,
        buyerPaidAmount,
        paidAtPosBuyerAmount: buyerPaidAmount,
        buyerRemainingDebt,
        buyerAdvanceUsed,
        sellerPaidAmount: actualSellerPaid,
        paidAtPosAmount: actualSellerPaid,
        sellerPaidStatus,
        notes: notes.trim() || 'فاتورة سريعة',
      };

      setQuickFloatInput(String(shortage));
      setQuickFloatError(null);
      setIsSubmitting(false);
      setLiquidityModal({
        isOpen: true,
        autoPrint,
        actualSellerPaid,
        maxAvailableDrawerCash,
        cashInFromInvoice,
        maxCanPay,
        remainingDebt,
        shortage,
        netToSeller: fin.netToSeller,
        baseTransaction: draftTransaction,
      });
      return;
    }

    setIsSubmitting(true);
    const newTransaction: Transaction = {
      id: trxId,
      timestamp: now,
      dateStr,
      timeStr,
      sellerId: finalSellerId || `seller-${now}`,
      sellerName: finalSellerName,
      sellerPhone: finalSellerPhone,
      sellerRole,
      buyerId: finalBuyerId || `buyer-${now}`,
      buyerName: finalBuyerName,
      buyerPhone: finalBuyerPhone,
      items: finalItems,
      grossAmount: fin.grossAmount,
      buyerTaxRate: fin.buyerTaxRate,
      buyerTaxAmount: fin.buyerTaxAmount,
      totalFromBuyer: fin.totalFromBuyer,
      sellerTaxRate: fin.sellerTaxRate,
      sellerTaxAmount: fin.sellerTaxAmount,
      netToSeller: fin.netToSeller,
      harajProfit: fin.harajProfit,
      paymentStatus,
      settlementType: effectiveSettlementType,
      buyerPaidAmount,
      paidAtPosBuyerAmount: buyerPaidAmount,
      buyerRemainingDebt,
      buyerAdvanceUsed,
      sellerPaidAmount: actualSellerPaid,
      paidAtPosAmount: actualSellerPaid,
      sellerPaidStatus,
      notes: notes.trim() || 'فاتورة سريعة',
    };

    if (editingTransactionId) {
      const finalUpdatedTrx: Transaction = {
        ...(editingOriginalTrx || {}),
        ...newTransaction,
        id: editingTransactionId,
        dateStr: editingOriginalTrx?.dateStr || dateStr,
        timeStr: editingOriginalTrx?.timeStr || timeStr,
        timestamp: editingOriginalTrx?.timestamp || now,
        isEdited: true,
        editedAt: Date.now(),
        editedDateStr: dateStr,
      };

      if (onUpdateTransaction) {
        onUpdateTransaction(finalUpdatedTrx, autoPrint);
      } else {
        onSaveTransaction(finalUpdatedTrx, autoPrint);
      }

      setRecentSavedTransactions((prev) => [
        finalUpdatedTrx,
        ...prev.filter((t) => t.id !== finalUpdatedTrx.id),
      ]);
      setHighlightedTrxId(finalUpdatedTrx.id);
      setTimeout(() => {
        setHighlightedTrxId((current) => (current === finalUpdatedTrx.id ? null : current));
      }, 4500);

      setSavedFeedbackMessage(`تم تحديث بيانات الفاتورة #${finalUpdatedTrx.id} بنجاح`);
      setTimeout(() => setSavedFeedbackMessage(null), 4000);

      resetPOSForm();
      return;
    }

    onSaveTransaction(newTransaction, autoPrint);

    // تحديث حالة الجدول اللحظي لإظهار الفاتورة فوراً في السطر الأول مع وميض تأكيد
    setRecentSavedTransactions((prev) => [newTransaction, ...prev.filter((t) => t.id !== newTransaction.id)]);
    setHighlightedTrxId(newTransaction.id);
    setTimeout(() => {
      setHighlightedTrxId((current) => (current === newTransaction.id ? null : current));
    }, 4500);

    if (!autoPrint) {
      setSavedFeedbackMessage('تم حفظ الفاتورة بنجاح في السجل');
      setTimeout(() => {
        setSavedFeedbackMessage(null);
      }, 4000);
    }

    resetPOSForm();
  };

  const resetPOSForm = () => {
    setIsSubmitting(false);
    setEditingTransactionId(null);
    setEditingOriginalTrx(null);
    setSellerPaidMode('full');
    setCustomSellerPaidInput('');
    setSettlementType('association_credit');
    setItemsList([]);
    setSelectedFishId('');
    setCustomFishName('');
    setQuantity('');
    setUnitPrice('');
    setIsLumpSum(false);
    setLumpSumPrice('');
    setUnit('');
    setNotes('');
    setPartialPaidInput('');
    setValidationError(null);

    // الاحتفاظ باختيارات عمولة المشتري وخصم الصياد للفاتورة التالية
    // يزيل زر إفراغ النموذج الاختيارات صراحةً

    // تفريغ حقل المشتري بعد كل عملية، والاحتفاظ باسم الصياد في حال كان هناك بائع واحد وعدة مشترين
    setBuyerName('');
    setSelectedBuyerContact(null);
    setIsBuyerDropdownOpen(false);

    // إعادة التركيز التلقائي على حقل المشتري ليكون جاهزاً فوراً للفاتورة التالية
    setTimeout(() => {
      if (buyerInputRef.current) {
        buyerInputRef.current.focus();
        buyerInputRef.current.select?.();
      }
    }, 80);
  };

  const handleExecuteQuickFloatAndSave = () => {
    if (!liquidityModal) return;
    const cleanVal = normalizeNumberInput(quickFloatInput);
    const depositAmt = Number(cleanVal);
    if (!depositAmt || depositAmt <= 0) {
      setQuickFloatError('يرجى إدخال مبلغ عهدة صحيح أكبر من الصفر');
      return;
    }

    // 1. Add cash entry
    if (onAddCashEntry) {
      onAddCashEntry({
        type: 'opening',
        category: 'عهدة صباحية',
        amount: depositAmt,
        description: `إيداع عهدة نقدية صباحية بالصندوق (تغطية صفقة الصياد: ${liquidityModal.baseTransaction.sellerName})`,
        performedBy: 'أمين الصندوق',
      });
    }

    // 2. Compute final seller paid with the new float
    const newTotalAvailable = liquidityModal.maxAvailableDrawerCash + depositAmt + liquidityModal.cashInFromInvoice;
    const finalSellerPaid = Math.min(liquidityModal.baseTransaction.netToSeller, newTotalAvailable);
    const finalRemainingDebt = Math.max(0, liquidityModal.baseTransaction.netToSeller - finalSellerPaid);
    const finalStatus: 'paid' | 'unpaid' | 'partial' =
      finalSellerPaid >= liquidityModal.baseTransaction.netToSeller
        ? 'paid'
        : finalSellerPaid > 0
          ? 'partial'
          : 'unpaid';

    const finalTrx: Transaction = {
      ...liquidityModal.baseTransaction,
      sellerPaidAmount: finalSellerPaid,
      paidAtPosAmount: finalSellerPaid,
      sellerRemainingDebt: finalRemainingDebt,
      sellerPaidStatus: finalStatus,
    };

    onSaveTransaction(finalTrx, liquidityModal.autoPrint);

    // تحديث حالة الجدول اللحظي
    setRecentSavedTransactions((prev) => [finalTrx, ...prev.filter((t) => t.id !== finalTrx.id)]);
    setHighlightedTrxId(finalTrx.id);
    setTimeout(() => {
      setHighlightedTrxId((current) => (current === finalTrx.id ? null : current));
    }, 4500);

    if (!liquidityModal.autoPrint) {
      setSavedFeedbackMessage('تم إيداع العهدة وحفظ الفاتورة بنجاح في السجل');
      setTimeout(() => setSavedFeedbackMessage(null), 4000);
    }
    resetPOSForm();
    setLiquidityModal(null);
  };

  const handleSaveWithAvailableCashAndDebt = () => {
    if (!liquidityModal) return;
    if (liquidityModal.maxAvailableDrawerCash <= 0 && liquidityModal.cashInFromInvoice <= 0) {
      setQuickFloatError('لا يمكن إصدار الفاتورة والصندوق فارغ. يرجى إضافة عهدة أولاً.');
      return;
    }
    const finalSellerPaid = liquidityModal.maxCanPay;
    const finalRemainingDebt = liquidityModal.remainingDebt;
    const finalStatus: 'paid' | 'unpaid' | 'partial' =
      finalSellerPaid >= liquidityModal.baseTransaction.netToSeller
        ? 'paid'
        : finalSellerPaid > 0
          ? 'partial'
          : 'unpaid';

    const finalTrx: Transaction = {
      ...liquidityModal.baseTransaction,
      sellerPaidAmount: finalSellerPaid,
      paidAtPosAmount: finalSellerPaid,
      sellerRemainingDebt: finalRemainingDebt,
      sellerPaidStatus: finalStatus,
    };

    onSaveTransaction(finalTrx, liquidityModal.autoPrint);

    // تحديث حالة الجدول اللحظي
    setRecentSavedTransactions((prev) => [finalTrx, ...prev.filter((t) => t.id !== finalTrx.id)]);
    setHighlightedTrxId(finalTrx.id);
    setTimeout(() => {
      setHighlightedTrxId((current) => (current === finalTrx.id ? null : current));
    }, 4500);

    if (!liquidityModal.autoPrint) {
      setSavedFeedbackMessage('تم حفظ الفاتورة بنجاح وتسجيل المستحقات ديناً على الجمعية');
      setTimeout(() => setSavedFeedbackMessage(null), 4000);
    }
    resetPOSForm();
    setLiquidityModal(null);
  };

  // Keyboard shortcuts (Enter or Ctrl+Enter to save and print)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleProcessTransaction(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActive,
    effectiveGross,
    sellerName,
    selectedSellerContact,
    buyerName,
    selectedBuyerContact,
    itemsList,
    quantity,
    unitPrice,
    isLumpSum,
    lumpSumPrice,
    activeBuyerTaxRate,
    activeSellerTaxRate,
  ]);

  return (
    <div className="space-y-2">
      {/* شريط أدوات ERP العلوي (Toolbar) بالأزرار المتقاربة جداً والحواف الحادة كلاسيكياً مثل أونكس برو */}
      <div className="bg-[#f0f4f9] border border-slate-300 p-1 flex flex-wrap items-center justify-between gap-1 shadow-xs rounded-none">
        {/* عنوان الشاشة والوضع الحالي */}
        <div className="flex items-center gap-2 px-2 py-0.5 border-l border-slate-300">
          <div
            className="w-6 h-6 flex items-center justify-center text-white font-bold text-xs rounded-none"
            style={{ backgroundColor: '#030164' }}
          >
            <Fish className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>أنظمة الحسابات</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-blue-900 font-bold">تسجيل فاتورة حراج (سند مبيعات)</span>
            </h2>
          </div>
        </div>

        {/* حقول وأزرار الوصول السريع الذكية لكشف حساب الصياد والمشتري مع دعم التنقل بأسهم الكيبورد */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* حقل وزر كشف حساب الصياد السريع مع قائمة ذكية فورية */}
          <div ref={topSellerContainerRef} className="relative">
            <div className="flex items-center gap-1 bg-white border border-slate-300 px-1 py-0.5 rounded-none shadow-2xs">
              <Fish className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <input
                ref={topSellerInputRef}
                type="text"
                value={topSellerQuery}
                onChange={(e) => {
                  setTopSellerQuery(e.target.value);
                  setIsTopSellerDropdownOpen(true);
                  setHighlightedTopSellerIndex(0);
                }}
                onFocus={() => {
                  if (topSellerQuery.trim()) setIsTopSellerDropdownOpen(true);
                }}
                onKeyDown={handleTopSellerKeyDown}
                placeholder={selectedSellerContact?.name ? `صياد: ${selectedSellerContact.name}` : "حقل الصياد السريع..."}
                className="w-32 sm:w-44 text-xs font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-400 placeholder:font-normal"
                title="اكتب اسم أو هاتف الصياد واستخدم أسهم الكيبورد [↑ ↓] واضغط Enter لعرض كشف حسابه فوراً"
              />
              <button
                type="button"
                onClick={() => handleOpenSellerStatementFromQuery()}
                className="px-2 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-none border border-emerald-800 cursor-pointer transition-colors shadow-none shrink-0"
                title="عرض كشف حساب ومستحقات الصياد فوراً"
              >
                كشف الصياد
              </button>
            </div>

            {/* القائمة الذكية المنسدلة لاقتراحات الصيادين تظهر فور كتابة أول حرف */}
            {isTopSellerDropdownOpen && matchingTopSellers.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-300 shadow-xl z-50 py-1 text-right animate-in fade-in zoom-in-95 duration-100 rounded-none max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                  <span>الصيادون المطابقون (تنقل بـ ↑ ↓ واضغط Enter):</span>
                  <span>{matchingTopSellers.length}</span>
                </div>
                {matchingTopSellers.map((s, idx) => {
                  const isHighlighted = idx === highlightedTopSellerIndex;
                  return (
                    <div
                      key={s.id || idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTopSellerQuery(s.name);
                        handleOpenSellerStatementFromQuery(s);
                      }}
                      onMouseEnter={() => setHighlightedTopSellerIndex(idx)}
                      className={`px-2.5 py-1.5 text-xs cursor-pointer flex items-center justify-between border-b border-slate-100 last:border-b-0 ${isHighlighted ? 'bg-emerald-100 text-emerald-950 font-bold' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Fish className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{s.name}</span>
                      </div>
                      {s.phone && (
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{s.phone}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* حقل وزر كشف حساب المشتري السريع مع قائمة ذكية فورية */}
          <div ref={topBuyerContainerRef} className="relative">
            <div className="flex items-center gap-1 bg-white border border-slate-300 px-1 py-0.5 rounded-none shadow-2xs">
              <ShoppingBag className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <input
                ref={topBuyerInputRef}
                type="text"
                value={topBuyerQuery}
                onChange={(e) => {
                  setTopBuyerQuery(e.target.value);
                  setIsTopBuyerDropdownOpen(true);
                  setHighlightedTopBuyerIndex(0);
                }}
                onFocus={() => {
                  if (topBuyerQuery.trim()) setIsTopBuyerDropdownOpen(true);
                }}
                onKeyDown={handleTopBuyerKeyDown}
                placeholder={selectedBuyerContact?.name ? `مشتري: ${selectedBuyerContact.name}` : "حقل المشتري السريع..."}
                className="w-32 sm:w-44 text-xs font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-400 placeholder:font-normal"
                title="اكتب اسم أو هاتف المشتري واستخدم أسهم الكيبورد [↑ ↓] واضغط Enter لعرض كشف حسابه فوراً"
              />
              <button
                type="button"
                onClick={() => handleOpenBuyerStatementFromQuery()}
                className="px-2 py-1 bg-[#030164] hover:bg-blue-900 text-white font-bold text-xs rounded-none border border-[#030164] cursor-pointer transition-colors shadow-none shrink-0"
                title="عرض كشف حساب ومطالبة المشتري فوراً"
              >
                كشف المشتري
              </button>
            </div>

            {/* القائمة الذكية المنسدلة لاقتراحات المشترين تظهر فور كتابة أول حرف */}
            {isTopBuyerDropdownOpen && matchingTopBuyers.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-slate-300 shadow-xl z-50 py-1 text-right animate-in fade-in zoom-in-95 duration-100 rounded-none max-h-60 overflow-y-auto">
                <div className="px-2 py-1 text-[10px] font-bold text-blue-800 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                  <span>المشترون المطابقون (تنقل بـ ↑ ↓ واضغط Enter):</span>
                  <span>{matchingTopBuyers.length}</span>
                </div>
                {matchingTopBuyers.map((b, idx) => {
                  const isHighlighted = idx === highlightedTopBuyerIndex;
                  return (
                    <div
                      key={b.id || idx}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setTopBuyerQuery(b.name);
                        handleOpenBuyerStatementFromQuery(b);
                      }}
                      onMouseEnter={() => setHighlightedTopBuyerIndex(idx)}
                      className={`px-2.5 py-1.5 text-xs cursor-pointer flex items-center justify-between border-b border-slate-100 last:border-b-0 ${isHighlighted ? 'bg-blue-100 text-blue-950 font-bold' : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <ShoppingBag className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate">{b.name}</span>
                      </div>
                      {b.phone && (
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{b.phone}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* زر إفراغ النموذج وتصفير الحقول */}
          <button
            id="clear-form-btn"
            type="button"
            onClick={() => {
              setSellerPaidMode('full');
              setCustomSellerPaidInput('');
              setSettlementType('association_credit');
              setPartialPaidInput('');
              setItemsList([]);
              setIsLumpSum(false);
              setQuantity('');
              setUnitPrice('');
              setLumpSumPrice('');
              setSelectedFishId('');
              setCustomFishName('');
              setUnit('');
              setNotes('');
              setValidationError(null);
              setSellerName('');
              setSelectedSellerContact(null);
              setBuyerName('');
              setSelectedBuyerContact(null);
              setCustomSellerTaxRate(null);
              setCustomBuyerTaxRate(null);
              setEditingTransactionId(null);
              setEditingOriginalTrx(null);
            }}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1 rounded-none border border-slate-300 cursor-pointer shadow-none transition-colors"
            title="إفراغ النموذج وتصفير الحقول"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>تفريغ / جديد</span>
          </button>

          {/* رصيد الصندوق والدرج */}
          {currentDrawerCash !== undefined && (
            <button
              type="button"
              onClick={onOpenCashBox}
              className={`px-2.5 py-1.5 font-bold text-xs flex items-center gap-1.5 rounded-none border cursor-pointer shadow-none transition-colors ${currentDrawerCash > 0
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                  : 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100'
                }`}
              title="الرصيد النقدي المتوفر حالياً بالصندوق - انقر للانتقال للصندوق"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>الدرج:</span>
              <span className="font-mono font-black">{formatCurrency(currentDrawerCash, settings.currency)}</span>
              {currentDrawerCash <= 0 && (
                <span className="text-[10px] bg-rose-200 text-rose-900 px-1 py-0.2 rounded-none font-bold">
                  بحاجة عهدة
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* شريط حالة تعديل الفاتورة المسترجعة */}
      {editingTransactionId && (
        <div className="bg-amber-50 border-2 border-amber-500 p-2 text-amber-950 flex flex-wrap items-center justify-between gap-2 shadow-xs rounded-none animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-amber-600 rounded-full animate-ping shrink-0"></span>
            <div className="text-xs font-black">
              أنت الآن في وضع تعديل الفاتورة رقم: <span className="font-mono text-sm underline text-blue-900 font-black">#{editingTransactionId}</span>
              {editingOriginalTrx && (
                <span className="mr-2 font-normal text-amber-900 text-[11px]">
                  (الصياد: <strong className="font-bold text-slate-900">{editingOriginalTrx.sellerName}</strong> — المشتري: <strong className="font-bold text-slate-900">{editingOriginalTrx.buyerName}</strong>)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-amber-800 font-bold hidden sm:inline">
              عدّل البيانات ثم اضغط [تحديث وطباعة] أو [Ctrl+Enter] لحفظ التعديلات بالسجل
            </span>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-3 py-1 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-900 font-bold text-xs border border-rose-300 rounded-none cursor-pointer transition-colors shadow-2xs"
            >
              إلغاء التعديل وتفريغ الحقول ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. قسم رأس الفاتورة والبيانات الأساسية (أعلى الجدول) بتنسيق شبكي منتظم وحواف حادة */}
      <div className="bg-white border border-slate-300 p-2.5 rounded-none shadow-xs space-y-2">
        {/* صف بيانات الصياد والمشتري */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* صندوق الصياد */}
          <div
            ref={sellerContainerRef}
            className="relative bg-slate-50/60 p-2 border border-slate-300 rounded-none space-y-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="pos-seller-input"
                  className="text-xs font-black text-slate-900 flex items-center gap-1"
                >
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>{sellerRole === 'fisherman' ? 'الصياد' : 'البائع'}</span>
                </label>

                {settings.showSellerRoleToggle && (
                  <div className="inline-flex items-center bg-slate-200 p-0.5 rounded-none border border-slate-300 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setSellerRole('fisherman')}
                      className={`px-1.5 py-0.2 rounded-none transition-all cursor-pointer ${sellerRole === 'fisherman'
                          ? 'bg-blue-700 text-white font-black'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      صياد
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellerRole('seller')}
                      className={`px-1.5 py-0.2 rounded-none transition-all cursor-pointer ${sellerRole === 'seller'
                          ? 'bg-amber-600 text-white font-black'
                          : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      بائع
                    </button>
                  </div>
                )}

                {/* أزرار خصم الصياد بحواف حادة ومتقاربة */}
                <div className="flex items-center bg-white p-0.5 rounded-none border border-slate-300 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCustomSellerTaxRate(null)}
                    className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${customSellerTaxRate === null || activeSellerTaxRate === defaultSellerTaxRate
                        ? 'bg-blue-800 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
                    title={`الخصم الافتراضي (${Math.round(defaultSellerTaxRate * 100)}%)`}
                  >
                    خصم {Math.round(defaultSellerTaxRate * 100)}%
                  </button>
                  {Math.round(defaultSellerTaxRate * 100) !== 2 && (
                    <button
                      type="button"
                      onClick={() => setCustomSellerTaxRate(0.02)}
                      className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${activeSellerTaxRate === 0.02 && customSellerTaxRate !== null
                          ? 'bg-amber-600 text-white font-bold'
                          : 'text-amber-700 hover:bg-amber-50'
                        }`}
                    >
                      خصم 2%
                    </button>
                  )}
                  {Math.round(defaultSellerTaxRate * 100) !== 1 && (
                    <button
                      type="button"
                      onClick={() => setCustomSellerTaxRate(0.01)}
                      className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${activeSellerTaxRate === 0.01 && customSellerTaxRate !== null
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-emerald-700 hover:bg-emerald-50'
                        }`}
                    >
                      خصم 1%
                    </button>
                  )}
                </div>
              </div>

              {sellerName.trim() ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenSellerStatementFromQuery(selectedSellerContact || sellerName)}
                    className="text-[10px] px-1.5 py-0.2 rounded-none font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 cursor-pointer flex items-center gap-0.5"
                    title="عرض كشف حساب ومستحقات هذا الصياد مباشرة"
                  >
                    <span>كشف حسابه</span>
                  </button>
                  {selectedSellerContact ? (
                    <span className="text-[10px] px-1 py-0.2 rounded-none font-bold text-emerald-800 bg-emerald-100 border border-emerald-300">
                      ✓ صياد مسجل
                    </span>
                  ) : (
                    <span className="text-[10px] text-blue-800 bg-blue-100 border border-blue-300 px-1 py-0.2 rounded-none font-bold">
                      جديد
                    </span>
                  )}
                  {sellerDebtStats.totalDebt > 0 && (
                    <span className="text-[10px] text-rose-900 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded-none font-bold">
                      دين: {formatCurrency(sellerDebtStats.totalDebt, settings.currency)}
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* حقل اسم الصياد */}
            <div className="relative">
              <input
                ref={sellerInputRef}
                id="pos-seller-input"
                type="text"
                value={sellerName}
                onChange={(e) => handleSellerInputChange(e.target.value)}
                onFocus={() => setIsSellerDropdownOpen(true)}
                onKeyDown={handleSellerKeyDown}
                placeholder="اكتب اسم الصياد أو رقم الهاتف..."
                autoComplete="off"
                className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 text-xs sm:text-sm font-bold rounded-none py-1.5 pr-7 pl-12 focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none placeholder:font-normal placeholder:text-slate-400"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {sellerName && (
                  <button
                    type="button"
                    onClick={() => {
                      setSellerName('');
                      setSelectedSellerContact(null);
                      setIsSellerDropdownOpen(true);
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-600 rounded-none cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSellerDropdownOpen((prev) => !prev)}
                  className="p-0.5 text-slate-400 hover:text-slate-600 rounded-none cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 ${isSellerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* قائمة اقتراحات الصيادين */}
            {isSellerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border border-slate-300 rounded-none shadow-xl z-40 max-h-52 overflow-y-auto divide-y divide-slate-100">
                {visibleSellers.length > 0 ? (
                  visibleSellers.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSeller(s)}
                      className={`w-full text-right px-3 py-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer rounded-none ${highlightedSellerIndex === idx
                          ? 'bg-blue-100 text-blue-950 font-bold'
                          : selectedSellerContact?.id === s.id
                            ? 'bg-amber-50 text-amber-900 font-bold'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold">{s.name}</span>
                        {s.type === 'buyer' && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded-none font-bold border border-purple-200">
                            مشتري يريد البيع
                          </span>
                        )}
                        {s.type === 'both' && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.2 rounded-none font-bold border border-blue-200">
                            صياد ومشتري
                          </span>
                        )}
                      </div>
                      {s.phone && <span className="text-[10px] text-slate-400 font-mono">📞 {s.phone}</span>}
                    </button>
                  ))
                ) : (
                  <div className="p-2 text-center text-xs text-slate-500">
                    سيتم حفظ "{sellerName}" كصياد جديد تلقائياً
                  </div>
                )}
              </div>
            )}
          </div>

          {/* صندوق المشتري */}
          <div
            ref={buyerContainerRef}
            className="relative bg-slate-50/60 p-2 border border-slate-300 rounded-none space-y-1"
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="pos-buyer-input"
                  className="text-xs font-black text-slate-900 flex items-center gap-1"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                  <span>المشتري</span>
                </label>

                {/* أزرار عمولة المشتري بحواف حادة */}
                <div className="flex items-center bg-white p-0.5 rounded-none border border-slate-300 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setCustomBuyerTaxRate(null)}
                    className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${customBuyerTaxRate === null || activeBuyerTaxRate === defaultBuyerTaxRate
                        ? 'bg-blue-800 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                      }`}
                    title={`العمولة الافتراضية (+${Math.round(defaultBuyerTaxRate * 100)}%)`}
                  >
                    عمولة +{Math.round(defaultBuyerTaxRate * 100)}%
                  </button>
                  {Math.round(defaultBuyerTaxRate * 100) !== 3 && (
                    <button
                      type="button"
                      onClick={() => setCustomBuyerTaxRate(0.03)}
                      className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${activeBuyerTaxRate === 0.03 && customBuyerTaxRate !== null
                          ? 'bg-blue-700 text-white font-bold'
                          : 'text-blue-700 hover:bg-blue-50'
                        }`}
                    >
                      عمولة +3%
                    </button>
                  )}
                </div>
              </div>

              {buyerName.trim() ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenBuyerStatementFromQuery(selectedBuyerContact || buyerName)}
                    className="text-[10px] px-1.5 py-0.2 rounded-none font-bold text-blue-900 bg-blue-100 hover:bg-blue-200 border border-blue-300 cursor-pointer flex items-center gap-0.5"
                    title="عرض كشف حساب ومطالبة هذا المشتري مباشرة"
                  >
                    <span>كشف حسابه</span>
                  </button>
                  {selectedBuyerContact ? (
                    <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-1 py-0.2 rounded-none font-bold">
                      ✓ مشتري مسجل
                    </span>
                  ) : (
                    <span className="text-[10px] text-blue-800 bg-blue-100 border border-blue-300 px-1 py-0.2 rounded-none font-bold">
                      جديد
                    </span>
                  )}
                  {buyerDebtStats.totalDebt > 0 && (
                    <span className="text-[10px] text-rose-900 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded-none font-bold">
                      دين: {formatCurrency(buyerDebtStats.totalDebt, settings.currency)}
                    </span>
                  )}
                  {buyerAvailableAdvance > 0 && (
                    <span className="text-[10px] text-emerald-800 bg-emerald-100 border border-emerald-300 px-1 py-0.2 rounded-none font-bold">
                      قدمة: {formatCurrency(buyerAvailableAdvance, settings.currency)}
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            {/* حقل اسم المشتري */}
            <div className="relative">
              <input
                ref={buyerInputRef}
                id="pos-buyer-input"
                type="text"
                value={buyerName}
                onChange={(e) => handleBuyerInputChange(e.target.value)}
                onFocus={() => setIsBuyerDropdownOpen(true)}
                onKeyDown={handleBuyerKeyDown}
                placeholder="اكتب اسم المشتري أو رقم الهاتف..."
                autoComplete="off"
                className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 text-xs sm:text-sm font-bold rounded-none py-1.5 pr-7 pl-12 focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none placeholder:font-normal placeholder:text-slate-400"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {buyerName && (
                  <button
                    type="button"
                    onClick={() => {
                      setBuyerName('');
                      setSelectedBuyerContact(null);
                      setIsBuyerDropdownOpen(true);
                    }}
                    className="p-0.5 text-slate-400 hover:text-slate-600 rounded-none cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsBuyerDropdownOpen((prev) => !prev)}
                  className="p-0.5 text-slate-400 hover:text-slate-600 rounded-none cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 ${isBuyerDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {/* قائمة اقتراحات المشترين */}
            {isBuyerDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-0.5 bg-white border border-slate-300 rounded-none shadow-xl z-40 max-h-52 overflow-y-auto divide-y divide-slate-100">
                {visibleBuyers.length > 0 ? (
                  visibleBuyers.map((b, idx) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => handleSelectBuyer(b)}
                      className={`w-full text-right px-3 py-1.5 text-xs flex items-center justify-between gap-2 cursor-pointer rounded-none ${highlightedBuyerIndex === idx
                          ? 'bg-blue-100 text-blue-950 font-bold'
                          : selectedBuyerContact?.id === b.id
                            ? 'bg-blue-50 text-blue-900 font-bold'
                            : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <span className="font-bold">{b.name}</span>
                      {b.phone && <span className="text-[10px] text-slate-400 font-mono">📞 {b.phone}</span>}
                    </button>
                  ))
                ) : (
                  <div className="p-2 text-center text-xs text-slate-500">
                    سيتم اعتماد "{buyerName}" كمشتري جديد تلقائياً
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* صف إدخال الصنف السريع وطريقة السداد */}
        {/* صف إدخال الصنف السريع وطريقة السداد وأزرار الحفظ/الطباعة في سطر واحد متكامل */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-1.5 pt-1 border-t border-slate-200 items-end">
          {/* 1. حقول الصنف: السمك، الكمية، الوحدة، السعر (6 أعمدة) */}
          <div className="lg:col-span-6 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                <Fish className="w-3.5 h-3.5 text-blue-700" />
                <span>إدخال بيانات السمك والصنف:</span>
              </span>
              <div className="flex items-center bg-slate-100 p-0.5 rounded-none border border-slate-300 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setIsLumpSum(false)}
                  className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${!isLumpSum ? 'bg-blue-800 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  سعر الوحدة × الكمية
                </button>
                <button
                  type="button"
                  onClick={() => setIsLumpSum(true)}
                  className={`px-1.5 py-0.5 rounded-none transition-all cursor-pointer ${isLumpSum ? 'bg-blue-800 text-white font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  سعر مقطوع (شروة)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 items-end">
              {/* اسم السمك */}
              <div ref={fishContainerRef} className="sm:col-span-4 relative">
                <label
                  htmlFor="pos-custom-fish-name"
                  className="block text-[11px] font-bold text-slate-700 mb-0.5"
                >
                  نوع / صنف السمك:
                </label>
                <input
                  ref={fishInputRef}
                  id="pos-custom-fish-name"
                  type="text"
                  autoComplete="off"
                  placeholder="اسم الصنف (ثمد، ناجل...)"
                  value={fishInputValue}
                  onFocus={() => setIsFishDropdownOpen(true)}
                  onChange={(e) => handleFishInputChange(e.target.value)}
                  onKeyDown={handleFishKeyDown}
                  className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 text-xs font-bold rounded-none py-1.5 px-1.5 focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none placeholder:text-slate-400"
                />
                {isFishDropdownOpen && filteredFish.length > 0 && (
                  <div className="absolute z-50 top-full right-0 left-0 mt-0.5 bg-white border border-slate-300 rounded-none shadow-xl max-h-44 overflow-y-auto">
                    {filteredFish.map((fish, idx) => (
                      <button
                        key={fish.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectFish(fish);
                          setIsFishDropdownOpen(false);
                          if (isLumpSum) {
                            lumpSumPriceInputRef.current?.focus();
                            lumpSumPriceInputRef.current?.select?.();
                          } else {
                            quantityInputRef.current?.focus();
                            quantityInputRef.current?.select?.();
                          }
                        }}
                        className={`w-full text-right px-2.5 py-1.5 text-xs font-bold transition-colors border-b border-slate-100 last:border-0 cursor-pointer rounded-none ${highlightedFishIndex === idx
                            ? 'bg-blue-100 text-blue-950 font-black'
                            : selectedFishId === fish.id
                              ? 'bg-blue-50 text-blue-900 font-bold'
                              : 'text-slate-800 hover:bg-slate-50'
                          }`}
                      >
                        {fish.arabicName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!isLumpSum ? (
                <>
                  {/* الكمية */}
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="pos-quantity-input"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5 text-center"
                    >
                      الكمية:
                    </label>
                    <input
                      ref={quantityInputRef}
                      id="pos-quantity-input"
                      type="text"
                      placeholder="الكمية"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      onKeyDown={handleQuantityKeyDown}
                      className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 font-mono font-bold text-xs rounded-none py-1.5 px-1 text-center focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none"
                    />
                  </div>

                  {/* الوحدة */}
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="pos-unit-select"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5 text-center"
                    >
                      الوحدة:
                    </label>
                    <input
                      ref={unitInputRef}
                      id="pos-unit-select"
                      type="text"
                      list="pos-unit-options"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      onKeyDown={handleUnitKeyDown}
                      placeholder="الوحدة"
                      className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 text-xs font-bold rounded-none py-1.5 px-1 text-center focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none"
                    />
                    <datalist id="pos-unit-options">
                      <option value="كيلو">كيلو (كجم)</option>
                      <option value="صندوق" />
                      <option value="طراد / شلة" />
                      <option value="حبة" />
                      <option value="حوت" />
                      <option value="سلة" />
                    </datalist>
                  </div>

                  {/* سعر الوحدة */}
                  <div className="sm:col-span-4">
                    <label
                      htmlFor="pos-unit-price-input"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5 text-center"
                    >
                      سعر الوحدة ({settings.currency}):
                    </label>
                    <input
                      ref={unitPriceInputRef}
                      id="pos-unit-price-input"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="سعر الوحدة"
                      value={unitPrice === '' ? '' : unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      onKeyDown={handleUnitPriceKeyDown}
                      className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 font-mono font-bold text-xs rounded-none py-1.5 px-1 text-center focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="sm:col-span-5">
                    <label
                      htmlFor="pos-lump-sum-input"
                      className="block text-[11px] font-bold text-slate-700 mb-0.5 text-center"
                    >
                      السعر المقطوع للشروة:
                    </label>
                    <input
                      ref={lumpSumPriceInputRef}
                      id="pos-lump-sum-input"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="السعر المقطوع للشروة"
                      value={lumpSumPrice === '' ? '' : lumpSumPrice}
                      onChange={(e) => setLumpSumPrice(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      onKeyDown={handleLumpSumPriceKeyDown}
                      className="w-full bg-[#FEF9D7] border border-amber-400 text-blue-950 font-mono font-black text-xs rounded-none py-1.5 px-2 text-center focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 mb-0.5 text-center">
                      الوصف:
                    </label>
                    <input
                      type="text"
                      placeholder="الوصف (لوت...)"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full bg-[#FEF9D7] border border-amber-300/80 text-slate-900 text-xs font-bold rounded-none py-1.5 px-2 text-center focus:border-blue-600 focus:bg-[#FFFDF0] focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 2. أزرار الحفظ والطباعة في نفس الصف بجوار حقل سعر الوحدة مباشرة (3 أعمدة) */}
          <div className="lg:col-span-3 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="text-[11px] font-bold text-slate-700">إجراء الفاتورة:</span>
              <span className="text-[10px] text-slate-400 font-mono">Enter / Ctrl+Enter</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                ref={submitOnlyBtnRef}
                id="pos-submit-only-btn"
                type="button"
                disabled={isSubmitting}
                onClick={() => handleProcessTransaction(false)}
                onKeyDown={handleSubmitOnlyKeyDown}
                className={`py-1.5 px-1 font-bold text-xs flex items-center justify-center gap-1 rounded-none border shadow-2xs transition-colors ${isSubmitting
                    ? 'opacity-50 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                    : editingTransactionId
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-400 cursor-pointer'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer'
                  }`}
                title={editingTransactionId ? 'تحديث الفاتورة بالسجل بدون طباعة' : 'حفظ الفاتورة بالسجل'}
              >
                <Save className={`w-3.5 h-3.5 shrink-0 ${editingTransactionId ? 'text-amber-800' : 'text-slate-600'}`} />
                <span className="truncate">{isSubmitting ? 'جاري الحفظ...' : editingTransactionId ? 'تحديث بالسجل' : 'حفظ بالسجل'}</span>
              </button>

              <button
                ref={submitPrintBtnRef}
                id="pos-submit-print-btn"
                type="button"
                disabled={isSubmitting}
                onClick={() => handleProcessTransaction(true)}
                onKeyDown={handleSubmitPrintKeyDown}
                className={`py-1.5 px-1 text-white font-black text-xs flex items-center justify-center gap-1 rounded-none shadow-2xs transition-colors ${isSubmitting
                    ? 'opacity-50 cursor-not-allowed bg-blue-900/50 border border-blue-900/50'
                    : editingTransactionId
                      ? 'bg-amber-600 hover:bg-amber-700 border border-amber-700 active:bg-amber-800 cursor-pointer'
                      : 'bg-[#030164] hover:bg-blue-900 border border-[#030164] active:bg-blue-950 cursor-pointer'
                  }`}
                title="تسجيل الفاتورة وطباعة الإشعار فوراً [Ctrl+Enter]"
              >
                <Printer className="w-3.5 h-3.5 shrink-0 text-white" />
                <span className="truncate">{isSubmitting ? 'جاري التسجيل...' : editingTransactionId ? 'تحديث وطباعة' : 'تسجيل وطباعة'}</span>
              </button>
            </div>
          </div>

          {/* 3. طريقة السداد وصرف نقدية الصياد (في أقصى اليسار - 3 أعمدة) */}
          <div className="lg:col-span-3 space-y-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1 text-[11px]">
                <HandCoins className="w-3 h-3 text-emerald-700" />
                <span>طريقة الدفع:</span>
              </span>
              <span className="text-[10px] text-blue-800 font-mono">
                {settlementType === 'association_credit' && 'آجل (دين)'}
                {settlementType === 'association_cash' && 'كاش بالصندوق'}
                {settlementType === 'partial_cash' && 'دفع جزئي'}
              </span>
            </div>

            {/* أزرار السداد مصغرة بنص ملون عند التحديد فقط */}
            <div className="grid grid-cols-3 gap-0.5 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => setSettlementType('association_credit')}
                className={`py-1 px-0.5 rounded-none transition-all cursor-pointer border text-center ${settlementType === 'association_credit'
                    ? 'bg-amber-50/60 text-amber-800 border-amber-600 font-black ring-1 ring-amber-400'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{settlementType === 'association_credit' ? '● ' : ''}آجل (دين)</span>
              </button>
              <button
                type="button"
                onClick={() => setSettlementType('association_cash')}
                className={`py-1 px-0.5 rounded-none transition-all cursor-pointer border text-center ${settlementType === 'association_cash'
                    ? 'bg-emerald-50/60 text-emerald-800 border-emerald-600 font-black ring-1 ring-emerald-400'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{settlementType === 'association_cash' ? '● ' : ''}كاش بالصندوق</span>
              </button>
              <button
                type="button"
                onClick={() => setSettlementType('partial_cash')}
                className={`py-1 px-0.5 rounded-none transition-all cursor-pointer border text-center ${settlementType === 'partial_cash'
                    ? 'bg-blue-50/60 text-blue-800 border-blue-600 font-black ring-1 ring-blue-400'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
              >
                <span>{settlementType === 'partial_cash' ? '● ' : ''}دفع جزئي</span>
              </button>
            </div>

            {settlementType === 'partial_cash' && (
              <input
                type="number"
                min="0"
                step="any"
                placeholder="المبلغ المدفوع كاش..."
                value={partialPaidInput}
                onChange={(e) => setPartialPaidInput(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-2 py-0.5 bg-[#FEF9D7] border border-blue-500 rounded-none text-xs font-mono font-bold text-slate-900 focus:bg-[#FFFDF0] focus:outline-none"
              />
            )}

            {/* صرف نقدية الصياد: 100% / مؤجل 0% / يدوي */}
            <div className="flex items-center gap-0.5 pt-0.5 text-[9.5px] font-bold">
              <span className="text-slate-600 shrink-0 text-[10px]">صرف الصياد:</span>
              <button
                type="button"
                onClick={() => {
                  setSellerPaidMode('full');
                  setCustomSellerPaidInput('');
                }}
                className={`flex-1 py-0.5 px-0.5 rounded-none border text-center cursor-pointer ${sellerPaidMode === 'full'
                    ? 'bg-emerald-700 text-white border-emerald-800 font-bold'
                    : 'bg-white text-slate-700 border-slate-300'
                  }`}
              >
                100% نقداً
              </button>
              <button
                type="button"
                onClick={() => {
                  setSellerPaidMode('zero');
                  setCustomSellerPaidInput(0);
                }}
                className={`flex-1 py-0.5 px-0.5 rounded-none border text-center cursor-pointer ${sellerPaidMode === 'zero'
                    ? 'bg-slate-700 text-white border-slate-800 font-bold'
                    : 'bg-white text-slate-700 border-slate-300'
                  }`}
              >
                مؤجل 0%
              </button>
              <button
                type="button"
                onClick={() => {
                  setSellerPaidMode('custom');
                  if (customSellerPaidInput === '') {
                    setCustomSellerPaidInput(financials.netToSeller);
                  }
                }}
                className={`flex-1 py-0.5 px-0.5 rounded-none border text-center cursor-pointer ${sellerPaidMode === 'custom'
                    ? 'bg-blue-700 text-white border-blue-800 font-bold'
                    : 'bg-white text-slate-700 border-slate-300'
                  }`}
              >
                يدوي
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* 3. الجدول في الوسط (The Table in the Center) مع دمج الإجماليات الستة مباشرة في شبكة الجدول */}
      <div className="bg-white border border-slate-300 rounded-none shadow-xs overflow-hidden">
        {/* شريط عنوان جدول أصناف الفاتورة */}
        <div className="bg-[#e9f1fb] border-b border-slate-300 px-3 py-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#030164]"></span>
              <span>جدول أصناف وبنود الفاتورة الحالية</span>
            </span>
            <span className="text-[11px] font-mono font-bold bg-white text-blue-900 border border-slate-300 px-2 py-0.2">
              {itemsList.length > 0 ? `${itemsList.length} أصناف مضافة` : 'صنف واحد نشط'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleAddItemToList}
              className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs flex items-center gap-1 rounded-none border border-slate-300 cursor-pointer shadow-none"
              title="إضافة سطر صنف جديد للفاتورة"
            >
              <Plus className="w-3 h-3 text-blue-700" />
              <span>إدراج سطر جديد</span>
            </button>
          </div>
        </div>

        {/* جدول الأصناف بتنسيق إكسل المخطط مع تذييل الإجماليات المدمجة (نمط Zebra بيج/كريمي وأبيض مطابق للصورة) */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#fae8d4] text-slate-900 font-bold border-b border-slate-300 text-[11px]">
                <th className="p-1.5 border border-slate-300 text-center w-10"># م</th>
                <th className="p-1.5 border border-slate-300">نوع وصنف السمك</th>
                <th className="p-1.5 border border-slate-300 text-center w-16">الكمية</th>
                <th className="p-1.5 border border-slate-300 text-center w-16">الوحدة</th>
                <th className="p-1.5 border border-slate-300 text-center w-20">سعر الوحدة</th>
                <th className="p-1.5 border border-slate-300 text-center w-24">إجمالي الشروة (Gross)</th>
                <th className="p-1.5 border border-slate-300 text-center w-20 text-blue-900">عمولة (+2%)</th>
                <th className="p-1.5 border border-slate-300 text-center w-24 bg-blue-100/70 text-blue-950 font-black">المطلوب من المشتري</th>
                <th className="p-1.5 border border-slate-300 text-center w-20 text-rose-900">خصم الصياد (-3%)</th>
                <th className="p-1.5 border border-slate-300 text-center w-20 text-indigo-950">دخل الحراج (5%)</th>
                <th className="p-1.5 border border-slate-300 text-center w-24 bg-emerald-100/70 text-emerald-950 font-black">الصافي للصياد</th>
                <th className="p-1.5 border border-slate-300 text-center w-14">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {itemsList.length > 0 ? (
                itemsList.map((item, idx) => {
                  const isEvenRow = idx % 2 === 1;
                  const itemGross = item.totalGross || 0;
                  const bRate = activeBuyerTaxRate;
                  const sRate = activeSellerTaxRate;
                  const itemBuyerTax = Math.round(itemGross * bRate);
                  const itemBuyerTotal = itemGross + itemBuyerTax;
                  const itemSellerTax = Math.round(itemGross * sRate);
                  const itemHarajProfit = itemBuyerTax + itemSellerTax;
                  const itemNetToSeller = itemGross - itemSellerTax;

                  return (
                    <tr
                      key={item.id || idx}
                      className={`transition-colors ${isEvenRow ? 'bg-[#FDEBD9] hover:bg-[#FCD8BE]' : 'bg-white hover:bg-[#FFF7F0]'
                        }`}
                    >
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-700">
                        {idx + 1}
                      </td>
                      <td className="p-1.5 border border-slate-300 font-bold text-slate-900">
                        {item.fishName}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-800">
                        {item.quantity}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center text-slate-700">
                        {item.unit || '---'}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-800">
                        {formatNumber(item.unitPrice)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-900">
                        {formatNumber(itemGross)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-800">
                        +{formatNumber(itemBuyerTax)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-blue-950 bg-blue-50/70">
                        {formatNumber(itemBuyerTotal)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-rose-800">
                        -{formatNumber(itemSellerTax)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-indigo-900">
                        +{formatNumber(itemHarajProfit)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-emerald-950 bg-emerald-50/70">
                        {formatNumber(itemNetToSeller)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleStartEditItem(idx)}
                            className="p-1 rounded-none bg-white hover:bg-blue-100 text-blue-800 border border-slate-300 cursor-pointer"
                            title="تعديل هذا السطر"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded-none bg-white hover:bg-rose-100 text-rose-700 border border-slate-300 cursor-pointer"
                            title="حذف هذا السطر"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                /* في حال لم تدرج أصناف متعددة بعد: عرض الصنف الحالي قيد الكتابة كسطر نشط بالجدول بجميع الأعمدة المالية */
                (() => {
                  const activeGross = effectiveGross || 0;
                  const bRate = activeBuyerTaxRate;
                  const sRate = activeSellerTaxRate;
                  const activeBuyerTax = Math.round(activeGross * bRate);
                  const activeBuyerTotal = activeGross + activeBuyerTax;
                  const activeSellerTax = Math.round(activeGross * sRate);
                  const activeHarajProfit = activeBuyerTax + activeSellerTax;
                  const activeNetToSeller = activeGross - activeSellerTax;

                  return (
                    <tr className="bg-white hover:bg-[#eaf1fb]">
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-800">
                        1
                      </td>
                      <td className="p-1.5 border border-slate-300 font-bold text-slate-900">
                        {fishInputValue.trim() ? (
                          <span>{fishInputValue}</span>
                        ) : (
                          <span className="text-slate-400 italic font-normal text-[11px]">
                            (اكتب اسم الصنف في حقل السمك أعلاه ليظهر هنا مباشرة)
                          </span>
                        )}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-800">
                        {quantity || (!isLumpSum ? 0 : 1)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center text-slate-700">
                        {unit || (isLumpSum ? 'شروة مقطوعة' : 'كيلو')}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-800">
                        {isLumpSum ? formatNumber(Number(lumpSumPrice) || 0) : formatNumber(Number(unitPrice) || 0)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-blue-900">
                        {formatNumber(activeGross)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-800">
                        +{formatNumber(activeBuyerTax)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-blue-950 bg-blue-50/70">
                        {formatNumber(activeBuyerTotal)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-rose-800">
                        -{formatNumber(activeSellerTax)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-indigo-900">
                        +{formatNumber(activeHarajProfit)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-emerald-950 bg-emerald-50/70">
                        {formatNumber(activeNetToSeller)}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center text-slate-400 text-[10px]">
                        نشط
                      </td>
                    </tr>
                  );
                })()
              )}

              {/* سطر شبكي فارغ إضافي للحفاظ على شكل الجدول الإكسل */}
              {itemsList.length < 2 && (
                <tr className="bg-[#dce8f9]/50">
                  <td className="p-1.5 border border-slate-300 text-center font-mono text-slate-400">
                    {itemsList.length + (itemsList.length === 0 ? 2 : 1)}
                  </td>
                  <td className="p-1.5 border border-slate-300 text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                  <td className="p-1.5 border border-slate-300 text-center text-slate-300">---</td>
                </tr>
              )}
            </tbody>

            {/* سطر الإجماليات المدمج كأعمدة مباشرة لحفظ المساحة بالكامل بدون أي أسطر مهدورة */}
            <tfoot>
              <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold text-xs">
                <td colSpan={5} className="p-1.5 border border-slate-300 text-right font-black text-slate-900 bg-slate-200">
                  الإجمالي النهائي للفاتورة الحالية:
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-mono font-black text-slate-950">
                  {formatCurrency(financials.grossAmount, settings.currency)}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-800 bg-blue-50">
                  +{formatCurrency(financials.buyerTaxAmount, settings.currency)}
                </td>
                <td className="p-1.5 border-2 border-blue-600 text-center font-mono font-black text-blue-950 bg-blue-100 text-xs sm:text-sm">
                  {formatCurrency(financials.totalFromBuyer, settings.currency)}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-rose-800 bg-rose-50">
                  -{formatCurrency(financials.sellerTaxAmount, settings.currency)}
                </td>
                <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-indigo-900 bg-indigo-50">
                  +{formatCurrency(financials.harajProfit, settings.currency)}
                </td>
                <td className="p-1.5 border-2 border-emerald-600 text-center font-mono font-black text-emerald-950 bg-emerald-100 text-xs sm:text-sm">
                  {formatCurrency(financials.netToSeller, settings.currency)}
                </td>
                <td className="p-1.5 border border-slate-300 text-center text-slate-400 text-[10px]">
                  ---
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* تنبيهات التحقق ورسائل الحفظ أسفل الجدول مباشرة (تظهر فقط عند وجود تنبيه أو رسالة) */}
        {(savedFeedbackMessage || validationError) && (
          <div className="bg-[#f8fafc] border-t border-slate-300 p-2 flex flex-wrap items-center justify-between gap-2">
            {savedFeedbackMessage && (
              <div className="px-2 py-1 rounded-none bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-700" />
                <span>{savedFeedbackMessage}</span>
              </div>
            )}

            {validationError && (
              <div className="px-2 py-1 rounded-none bg-rose-100 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                <span>{validationError}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. سجل فواتير اليوم المباشرة (حركات الحراج) أسفل جدول الأصناف مباشرة */}
      <TodayPOSTransactionsTable
        transactions={allPosTransactions}
        settings={settings}
        contacts={contacts}
        onOpenReceipt={onOpenReceipt}
        onEditTransaction={handleLoadTransactionForEdit}
        onOpenSellerStatement={(sellerNameOrId) => handleOpenSellerStatementFromQuery(sellerNameOrId)}
        onOpenBuyerStatement={(buyerNameOrId) => handleOpenBuyerStatementFromQuery(buyerNameOrId)}
        highlightedTrxId={highlightedTrxId}
      />

      {/* Quick Edit Item Modal */}
      {editingItemIndex !== null && editingItemData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-right">
            {/* Header */}
            <div className="bg-blue-600 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Pencil className="w-4 h-4 text-sky-300" />
                <span>تعديل صنف في الفاتورة</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingItemIndex(null);
                  setEditingItemData(null);
                }}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Fish Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">نوع السمك / الصنف</label>
                <input
                  type="text"
                  value={editingItemData.fishName}
                  onChange={(e) =>
                    setEditingItemData({ ...editingItemData, fishName: e.target.value })
                  }
                  className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-lg p-2.5 text-xs font-bold text-slate-900 focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="اسم الصنف..."
                />
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">الكمية</label>
                  <input
                    type="text"
                    value={editingItemData.quantity === 0 ? '' : editingItemData.quantity}
                    onChange={(e) => {
                      const strVal = e.target.value;
                      const normalizedDigits = strVal.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
                      const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
                      const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
                      const parsedQty = parseQuantityNumber(strVal);
                      const finalQty = !isNumeric ? strVal : (isFraction ? strVal : (Number(normalizedDigits) || parsedQty));
                      const newGross = !isNumeric
                        ? editingItemData.unitPrice
                        : Math.round(parsedQty * editingItemData.unitPrice * 100) / 100;
                      setEditingItemData({
                        ...editingItemData,
                        quantity: finalQty,
                        totalGross: newGross,
                      });
                    }}
                    className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-lg p-2 font-mono font-bold text-sm text-center focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">الوحدة</label>
                  <input
                    type="text"
                    list="edit-unit-options"
                    value={editingItemData.unit}
                    onChange={(e) =>
                      setEditingItemData({ ...editingItemData, unit: e.target.value })
                    }
                    placeholder="اكتب أو اختر الوحدة..."
                    className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-lg p-2 text-xs font-semibold focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <datalist id="edit-unit-options">
                    <option value="كيلو">كيلو (كجم)</option>
                    <option value="صندوق" />
                    <option value="طراد / شلة" />
                    <option value="حبة" />
                    <option value="حوت" />
                    <option value="سلة" />
                  </datalist>
                </div>
              </div>

              {/* Unit Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  سعر الوحدة ({settings.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={editingItemData.unitPrice === 0 ? '' : editingItemData.unitPrice}
                  onChange={(e) => {
                    const price = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                    const strVal = String(editingItemData.quantity ?? '').trim();
                    const normalizedDigits = strVal.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
                    const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
                    const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
                    const parsedQty = parseQuantityNumber(strVal);
                    const newGross = !isNumeric
                      ? price
                      : Math.round(parsedQty * price * 100) / 100;
                    setEditingItemData({
                      ...editingItemData,
                      unitPrice: price,
                      totalGross: newGross,
                    });
                  }}
                  className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-lg p-2 font-mono font-bold text-sm text-center focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Total Gross Display */}
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900">إجمالي هذا الصنف:</span>
                <span className="text-base font-black font-mono text-blue-700">
                  {formatCurrency(editingItemData.totalGross, settings.currency)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!editingItemData.fishName.trim() || editingItemData.totalGross <= 0) {
                    return;
                  }
                  setItemsList((prev) =>
                    prev.map((it, i) => (i === editingItemIndex ? editingItemData : it))
                  );
                  setEditingItemIndex(null);
                  setEditingItemData(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>حفظ التعديل</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const it = editingItemData;
                  setItemsList((prev) => prev.filter((_, i) => i !== editingItemIndex));
                  const matchedFish = fishTypes.find(
                    (f) => f.id === it.fishTypeId || f.arabicName === it.fishName
                  );
                  if (matchedFish) {
                    setSelectedFishId(matchedFish.id);
                    setCustomFishName('');
                  } else {
                    setSelectedFishId('');
                    setCustomFishName(it.fishName);
                  }
                  setQuantity(it.quantity);
                  setUnit(it.unit);
                  setUnitPrice(it.unitPrice);
                  setIsLumpSum(false);
                  setLumpSumPrice('');
                  setEditingItemIndex(null);
                  setEditingItemData(null);
                }}
                className="text-slate-600 hover:text-blue-700 text-[11px] font-semibold underline cursor-pointer"
                title="نقل الصنف للتعديل عبر شاشة الإدخال العادية"
              >
                تعديل عبر الحقول الرئيسية
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingItemIndex(null);
                  setEditingItemData(null);
                }}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Liquidity Alert & Direct Float Deposit Modal (حل مشكلة السيولة دون تعليق أو خروج) */}
      {liquidityModal && liquidityModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden text-right animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-amber-500 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">تنبيه سيولة الصندوق</h3>
                  <p className="text-xs text-amber-100 font-medium">
                    السيولة المتوفرة بالصندوق غير كافية لصرف كامل مستحقات الصياد نقداً
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiquidityModal(null)}
                className="text-white/80 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 text-slate-700 text-xs">
              {/* Numbers Summary Card */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-slate-600">
                  <span>المبلغ المطلوب صرفه نقداً للصياد:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(liquidityModal.actualSellerPaid, settings.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>الرصيد النقدي المتوفر حالياً بالصندوق:</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(liquidityModal.maxAvailableDrawerCash, settings.currency)}
                  </span>
                </div>
                {liquidityModal.cashInFromInvoice > 0 && (
                  <div className="flex items-center justify-between text-emerald-700">
                    <span>النقد المحصل من المشتري في هذه الفاتورة:</span>
                    <span className="font-mono font-bold text-sm">
                      +{formatCurrency(liquidityModal.cashInFromInvoice, settings.currency)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-rose-600 font-black">
                  <span>العجز المطلوب تغطيته نقداً:</span>
                  <span className="font-mono text-base">
                    {formatCurrency(liquidityModal.shortage, settings.currency)}
                  </span>
                </div>
              </div>

              {/* Option 1: Direct Cash Float Deposit (Recommended) */}
              <div className="p-4 bg-amber-50/70 border border-amber-300 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-black text-amber-900">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span>الخيار 1: إيداع عهدة نقدية بالصندوق الآن والمتابعة (فوري)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
                    الحل الأسرع
                  </span>
                </div>
                {liquidityModal.maxAvailableDrawerCash <= 0 && liquidityModal.cashInFromInvoice <= 0 ? (
                  <>
                    <p className="text-[11px] text-rose-800 leading-relaxed font-bold">
                      لا يمكن إصدار الفاتورة لأن رصيد الصندوق صفر. أضف عهدة جديدة أولاً، ثم عد إلى الفاتورة لإتمام إصدارها.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLiquidityModal(null);
                        onOpenCashBox?.();
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Coins className="w-4 h-4" />
                      <span>إضافة عهدة جديدة</span>
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      يمكنك إيداع عهدة صباحية الآن لتغذية الصندوق، وسيتم حفظ الفاتورة فوراً دون الحاجة لمغادرة الشاشة أو إعادة كتابة البيانات:
                    </p>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        مبلغ العهدة النقدية للإيداع ({settings.currency}):
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quickFloatInput}
                          onChange={(e) => {
                            setQuickFloatError(null);
                            const val = normalizeNumberInput(e.target.value);
                            setQuickFloatInput(val);
                          }}
                          placeholder="المبلغ المراد إيداعه..."
                          className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-amber-300 font-mono font-black text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                          {settings.currency}
                        </span>
                      </div>
                      {Number(quickFloatInput) > 0 && (
                        <div className="mt-1 text-[11px] font-bold text-amber-900 flex items-center justify-between">
                          <span className="text-slate-500">كتابة:</span>
                          <span>{tafqeet(Number(quickFloatInput), settings.currency)}</span>
                        </div>
                      )}
                      {quickFloatError && (
                        <p className="mt-1 text-rose-600 text-[11px] font-bold">{quickFloatError}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleExecuteQuickFloatAndSave}
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Coins className="w-4 h-4" />
                      <span>إيداع العهدة وحفظ الفاتورة مباشرة</span>
                    </button>
                  </>
                )}
              </div>

              {/* Option 2: Pay Available and Keep Remaining as Association Debt */}
              {liquidityModal.maxAvailableDrawerCash > 0 || liquidityModal.cashInFromInvoice > 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800">
                    <HandCoins className="w-4 h-4 text-blue-600" />
                    <span>الخيار 2: صرف المتاح بالصندوق وتسجيل الباقي ديناً على الجمعية</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {liquidityModal.maxCanPay > 0 ? (
                      <>
                        يتم دفع كامل المتاح بالصندوق (
                        <span className="font-mono font-bold text-slate-800">
                          {formatCurrency(liquidityModal.maxCanPay, settings.currency)}
                        </span>
                        ) للصياد، وتسجيل باقي المستحقات (
                        <span className="font-mono font-bold text-slate-800">
                          {formatCurrency(liquidityModal.remainingDebt, settings.currency)}
                        </span>
                        ) ديناً مستحقاً له على الجمعية دون أن يصبح رصيد الصندوق سالباً.
                      </>
                    ) : (
                      <>
                        حفظ الفاتورة مع تسجيل كامل مستحقات الصياد (
                        <span className="font-mono font-bold text-slate-800">
                          {formatCurrency(liquidityModal.netToSeller, settings.currency)}
                        </span>
                        ) ديناً على الجمعية (يبقى رصيد الصندوق 0 دون سحب نقد).
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleSaveWithAvailableCashAndDebt}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {liquidityModal.maxCanPay > 0
                        ? `صرف المتاح (${formatCurrency(liquidityModal.maxCanPay, settings.currency)}) وحفظ الفاتورة`
                        : 'حفظ الفاتورة وتسجيل كامل المبلغ ديناً'}
                    </span>
                  </button>
                </div>
              ) : null}

              {/* Footer Cancel / Edit */}
              <div className="flex items-center justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setLiquidityModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
                >
                  إلغاء والتراجع لتعديل الفاتورة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal: كشف حساب ومستحقات الصياد */}
      {isSellerStatementOpen && statementSellerContact && (
        <SellerStatementModal
          isOpen={isSellerStatementOpen}
          onClose={() => setIsSellerStatementOpen(false)}
          seller={statementSellerContact}
          transactions={transactions}
          cashEntries={cashEntries}
          settings={settings}
          onOpenReceipt={onOpenReceipt}
        />
      )}

      {/* Modal: كشف حساب ومطالبة المشتري */}
      {isBuyerStatementOpen && statementBuyerContact && (
        <BuyerStatementModal
          isOpen={isBuyerStatementOpen}
          onClose={() => setIsBuyerStatementOpen(false)}
          buyer={statementBuyerContact}
          transactions={statementBuyerTransactions}
          repayments={cashEntries.filter(c => (c.contactId && c.contactId === statementBuyerContact.id) || (c.contactName || '').trim().toLowerCase() === (statementBuyerContact.name || '').trim().toLowerCase())}
          settings={settings}
          timeframe="all"
          buyerMetrics={statementBuyerMetrics}
        />
      )}
    </div>
  );
};
