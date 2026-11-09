import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Contact, Transaction, MarketSettings, FishType, CashEntry, LotTransferRecord } from '../types';
import { loadLotTransfers, exportAllData } from '../utils/storage';
import { sendBackupEmailNow } from '../services/emailBackupClient';
import { isExactContactMatch, isTransactionSellerMatchForBuyer } from '../utils/contactMatching';
import {
  formatCurrency,
  formatNumber,
  formatNumberWithDots,
  tafqeet,
  formatArabicDayOnly,
  getWeekdayName,
  calculateDrawerCash,
  calculateBuyerAdvanceBalance,
  normalizeArabic,
  fuzzyMatchArabic,
  formatGregorianDate,
  formatDisplayDate,
  isTransactionResold,
  getResoldDetails,
  isTransferredTransaction,
  getTodayLocalYMD,
  isSameCalendarDay,
  parseLocalDate,
  getTransactionBuyerDebt,
} from '../utils/calculations';
import { FishermanSettlementModal } from './FishermanSettlementModal';
import { BuyerStatementModal } from './BuyerStatementModal';
import { BuyerAdvanceModal } from './BuyerAdvanceModal';
import { AllDebtorsStatementModal } from './AllDebtorsStatementModal';
import { EditTransactionModal } from './EditTransactionModal';
import { TransferBuyerModal } from './TransferBuyerModal';
import { FishermanDisbursementsModal } from './FishermanDisbursementsModal';
import {
  printReceiptVoucherA4Direct,
  exportReceiptVoucherPdfA4,
  printFishermanPayoutVoucherA4Direct,
  exportFishermanPayoutVoucherPdfA4,
  INVOICE_MARGIN_CREDIT_TEXT,
} from '../utils/invoiceExport';
import { WhatsAppIcon } from './WhatsAppIcon';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareReceiptVoucherPdf, ShareTarget } from '../utils/shareUtils';
import {
  TrendingUp,
  UserCheck,
  Loader2,
  ShoppingBag,
  Printer,
  FileText,
  Pencil,
  Calendar,
  Download,
  Fish,
  PieChart,
  DollarSign,
  ArrowUpRight,
  ArrowDownLeft,
  HandCoins,
  Receipt,
  X,
  Search,
  Wallet,
  Sparkles,
  ArrowRightLeft,
  ShieldCheck,
  AlertCircle,
  Scale,
  Users,
  UserPlus,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Plus,
  Coins,
  Building2,
  Utensils,
  Coffee,
  Briefcase,
  RotateCw,
  Settings,
  Database,
  LogOut,
  Mail,
  Trash2,
  User,
  FileSpreadsheet,
} from 'lucide-react';

interface ReportsViewProps {
  transactions: Transaction[];
  contacts: Contact[];
  cashEntries?: CashEntry[];
  fishTypes?: FishType[];
  settings: MarketSettings;
  onOpenReceipt: (trx: Transaction, mode?: 'buyer' | 'seller' | 'both') => void;
  onDeleteTransaction?: (id: string) => void;
  onUpdateTransaction?: (updatedTrx: Transaction, autoPrint: boolean) => void;
  onSaveTransaction?: (newTrx: Transaction, autoPrint: boolean, updatedOriginalTrx?: Transaction) => void;
  onOffsetBuyerSalesDebt?: (
    buyerId: string,
    buyerName: string,
    surplusAction?: 'payout_cash' | 'deposit_advance',
    notes?: string
  ) => void;
  onSettleResoldTransaction?: (trxId: string, notes?: string) => void;
  onRepayBuyerDebt?: (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string,
    repaymentMethod?: 'cash' | 'exchange',
    exchangeName?: string,
    targetTransactionId?: string
  ) => void;
  onPayoutSeller?: (
    sellerId: string,
    sellerName: string,
    amount: number,
    notes?: string,
    settleAdvanceAmount?: number,
    targetTransactionId?: string,
    payoutMethod?: 'cash' | 'exchange',
    exchangeName?: string
  ) => { payoutEntry?: CashEntry; settlementEntry?: CashEntry } | CashEntry | void;
  onSaveSellerAdvance?: (sellerId: string, sellerName: string, amount: number, notes?: string) => CashEntry | void;
  onRepaySellerAdvanceCash?: (sellerId: string, sellerName: string, amount: number, notes?: string) => CashEntry | void;
  onSaveBuyerLoan?: (buyerId: string, buyerName: string, amount: number, notes?: string) => CashEntry | void;
  onRepayBuyerLoanCash?: (buyerId: string, buyerName: string, amount: number, notes?: string) => CashEntry | void;
  onSaveBuyerAdvanceEntry?: (entry: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => CashEntry | void;
  onSettleBuyerDebtFromAdvance?: (buyerId: string, buyerName: string, amount: number, notes?: string, targetTransactionId?: string) => CashEntry | void;
  targetBuyerStatement?: { buyerId: string; ts: number } | null;
  targetSellerStatement?: { sellerId: string; ts: number } | null;
  lotTransfers?: LotTransferRecord[];
  onAddContact?: (contactData: Partial<Contact>) => Contact;
  onAddCashEntry?: (entry: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => void;
  onDeleteCashEntry?: (id: string) => void;
  onUpdateCashEntry?: (entry: CashEntry) => void;
  onNavigateToSettings?: () => void;
  onNavigateToBackup?: () => void;
  onLogout?: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  contacts,
  cashEntries = [],
  fishTypes = [],
  settings,
  onOpenReceipt,
  onDeleteTransaction,
  onUpdateTransaction,
  onSaveTransaction,
  onOffsetBuyerSalesDebt,
  onSettleResoldTransaction,
  onRepayBuyerDebt,
  onPayoutSeller,
  onSaveSellerAdvance,
  onRepaySellerAdvanceCash,
  onSaveBuyerLoan,
  onRepayBuyerLoanCash,
  onSaveBuyerAdvanceEntry,
  onSettleBuyerDebtFromAdvance,
  targetBuyerStatement,
  targetSellerStatement,
  lotTransfers,
  onAddContact,
  onAddCashEntry,
  onDeleteCashEntry,
  onUpdateCashEntry,
  onNavigateToSettings,
  onNavigateToBackup,
  onLogout,
}) => {
  const [reportType, setReportType] = useState<
    'association' | 'buyer' | 'seller' | 'staff' | 'office' | 'lot_transfers'
  >('association');

  // Sellers and buyers
  const sellers = useMemo(() => {
    const list: Contact[] = contacts.filter((c) => c.type === 'seller' || c.type === 'both');
    const existingIds = new Set(list.map((c) => c.id));
    const existingNames = new Set(list.map((c) => c.name.trim().toLowerCase()));

    // Also harvest any fishermen/sellers from transactions who may not be in contacts yet
    transactions.forEach((t) => {
      // Exclude lot resales - the seller is a buyer reselling a lot, not a fisherman
      if (t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) return;

      const sId = (t.sellerId || t.sellerName || '').trim();
      const sName = (t.sellerName || 'صياد غير محدد').trim();
      const normSName = normalizeArabic(sName);

      const contactMatch = contacts.find((c) =>
        (sId && c.id === sId) ||
        (sName && c.name.trim().toLowerCase() === sName.toLowerCase()) ||
        (normSName.length > 2 && normalizeArabic(c.name) === normSName)
      );

      const identifier = sId || contactMatch?.id || `seller-${sName.toLowerCase().replace(/\s+/g, '-')}`;
      const isKnown = existingIds.has(identifier) ||
                      existingNames.has(sName.toLowerCase()) ||
                      Boolean(contactMatch && existingIds.has(contactMatch.id));

      if (!isKnown) {
        existingIds.add(identifier);
        existingNames.add(sName.toLowerCase());
        list.push({
          id: identifier,
          name: sName,
          phone: t.sellerPhone || contactMatch?.phone || '',
          type: contactMatch ? 'both' : 'seller',
          notes: 'مسجل كصياد/بائع في العمليات',
          createdAt: t.dateStr || new Date().toISOString(),
        });
      }
    });

    return list;
  }, [contacts, transactions]);

  const buyers = useMemo(() => {
    const list: Contact[] = contacts.filter((c) => (c.type === 'buyer' || c.type === 'both') && c.type !== 'worker');
    const existingIds = new Set(list.map((c) => c.id));
    const existingNames = new Set(list.map((c) => c.name.trim().toLowerCase()));

    // Also harvest any buyers from transactions who may not be in contacts yet
    transactions.forEach((t) => {
      const bId = (t.buyerId || t.buyerName || '').trim();
      const bName = (t.buyerName || 'مشتري غير محدد').trim();
      const normBName = normalizeArabic(bName);

      const contactMatch = contacts.find((c) =>
        (bId && c.id === bId) ||
        (bName && c.name.trim().toLowerCase() === bName.toLowerCase()) ||
        (normBName.length > 2 && normalizeArabic(c.name) === normBName)
      );

      // استبعاد عمال وموظفي السوق الصريحين تماماً من كشف المشترين
      if (contactMatch && contactMatch.type === 'worker') {
        return;
      }

      const isKnown = (bId && existingIds.has(bId)) ||
                      existingNames.has(bName.toLowerCase()) ||
                      Boolean(contactMatch && existingIds.has(contactMatch.id));

      if (bId && !isKnown) {
        existingIds.add(bId);
        existingNames.add(bName.toLowerCase());
        list.push({
          id: bId,
          name: bName,
          phone: t.buyerPhone || '',
          type: 'buyer',
          notes: 'مضاف من سجل العمليات',
          createdAt: t.dateStr || new Date().toISOString(),
        });
      }
    });

    return list;
  }, [contacts, transactions]);

  const [selectedBuyerId, setSelectedBuyerId] = useState<string>(buyers[0]?.id || '');
  const [buyerDayFilter, setBuyerDayFilter] = useState<string>('all');
  const [buyerSpecificDate, setBuyerSpecificDate] = useState<string>('');
  const [buyerInvoiceQuery, setBuyerInvoiceQuery] = useState<string>('');
  const [buyerTransactionScope, setBuyerTransactionScope] = useState<'unpaid' | 'all'>('unpaid');
  const [buyerFinancialTab, setBuyerFinancialTab] = useState<'all' | 'repayments' | 'advances'>('all');
  const [selectedSellerId, setSelectedSellerId] = useState<string>(sellers[0]?.id || '');
  const [sellerDayFilter, setSellerDayFilter] = useState<string>('all');
  const [sellerSpecificDate, setSellerSpecificDate] = useState<string>('');
  const [sellerInvoiceQuery, setSellerInvoiceQuery] = useState<string>('');
  const [buyerSearchQuery, setBuyerSearchQuery] = useState<string>('');
  const [sellerSearchQuery, setSellerSearchQuery] = useState<string>('');

  const [isReportsBuyerDropdownOpen, setIsReportsBuyerDropdownOpen] = useState(false);
  const [highlightedReportsBuyerIndex, setHighlightedReportsBuyerIndex] = useState(-1);
  const reportsBuyerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reportsBuyerRef.current && !reportsBuyerRef.current.contains(event.target as Node)) {
        setIsReportsBuyerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sorted buyers with most recently used / frequently dealt first
  const sortedBuyers = useMemo(() => {
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

    return [...buyers].sort((a, b) => {
      const aTs = Math.max(lastActiveMap.get(a.id) || 0, lastActiveMap.get(a.name.trim().toLowerCase()) || 0);
      const bTs = Math.max(lastActiveMap.get(b.id) || 0, lastActiveMap.get(b.name.trim().toLowerCase()) || 0);
      if (bTs !== aTs) return bTs - aTs;
      const aFreq = (frequencyMap.get(a.id) || 0) + (frequencyMap.get(a.name.trim().toLowerCase()) || 0);
      const bFreq = (frequencyMap.get(b.id) || 0) + (frequencyMap.get(b.name.trim().toLowerCase()) || 0);
      if (bFreq !== aFreq) return bFreq - aFreq;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [buyers, transactions]);

  // Filtered matching buyers with name and phone search + 10-item limit
  const { visibleBuyersBySearch, totalMatchingBuyers } = useMemo(() => {
    const query = normalizeArabic(buyerSearchQuery);
    const rawQuery = buyerSearchQuery.trim();
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
      visibleBuyersBySearch: filtered.slice(0, MAX_VISIBLE),
      totalMatchingBuyers: filtered.length,
    };
  }, [sortedBuyers, buyerSearchQuery]);

  const handleReportsBuyerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isReportsBuyerDropdownOpen) {
      if (e.key === 'ArrowDown') {
        setIsReportsBuyerDropdownOpen(true);
        setHighlightedReportsBuyerIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedReportsBuyerIndex((prev) =>
        prev < visibleBuyersBySearch.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedReportsBuyerIndex((prev) =>
        prev > 0 ? prev - 1 : visibleBuyersBySearch.length - 1
      );
    } else if (e.key === 'Enter') {
      if (highlightedReportsBuyerIndex >= 0 && visibleBuyersBySearch[highlightedReportsBuyerIndex]) {
        e.preventDefault();
        const b = visibleBuyersBySearch[highlightedReportsBuyerIndex];
        setSelectedBuyerId(b.id);
        setBuyerSearchQuery(b.name);
        setIsReportsBuyerDropdownOpen(false);
        setHighlightedReportsBuyerIndex(-1);
      } else {
        setIsReportsBuyerDropdownOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsReportsBuyerDropdownOpen(false);
    }
  };

    const filteredSellersBySearch = useMemo(() => {
    const seenMap = new Map();
    sellers.forEach((s) => seenMap.set(s.id, s));
    contacts.filter((c) => c.type === 'seller' || c.type === 'both').forEach((c) => {
      if (!seenMap.has(c.id)) seenMap.set(c.id, c);
    });
    const allS = Array.from(seenMap.values());

    if (!sellerSearchQuery.trim()) return allS;
    const rawQ = sellerSearchQuery.trim();
    const numQ = rawQ.replace(/\D/g, '');

    return allS.filter((s) => {
      const nameMatch = fuzzyMatchArabic(s.name, rawQ);
      const phoneClean = (s.phone || '').replace(/\D/g, '');
      const phoneMatch = Boolean(numQ && phoneClean.includes(numQ));
      const idMatch = (s.id || '').toLowerCase().includes(rawQ.toLowerCase());
      return nameMatch || phoneMatch || idMatch;
    });
  }, [sellers, contacts, sellerSearchQuery]);

  // التحديث التلقائي لكشف حساب الصياد فور كتابة الاسم بالبحث
  useEffect(() => {
    if (sellerSearchQuery.trim() && filteredSellersBySearch.length > 0) {
      const isCurrentInResults = filteredSellersBySearch.some((s) => s.id === selectedSellerId);
      if (!isCurrentInResults) {
        setSelectedSellerId(filteredSellersBySearch[0].id);
      }
    }
  }, [sellerSearchQuery, filteredSellersBySearch, selectedSellerId]);

  // Synchronize selected seller when sellers list loads or changes
  useEffect(() => {
    if (sellers.length > 0) {
      const exists = sellers.some((s) => s.id === selectedSellerId);
      if (!exists) {
        setSelectedSellerId(sellers[0].id);
      }
    }
  }, [sellers, selectedSellerId]);

  // Synchronize selected buyer when buyers list loads or changes
  useEffect(() => {
    if (buyers.length > 0) {
      const exists = buyers.some((b) => b.id === selectedBuyerId);
      if (!exists) {
        setSelectedBuyerId(buyers[0].id);
      }
    }
  }, [buyers, selectedBuyerId]);

  // Timeframe filter
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const timeframeLabels: Record<string, string> = {
    today: 'حركة اليوم',
    week: 'حركة الأسبوع',
    month: 'حركة الشهر',
    all: 'كافة العمليات المسجلة',
  };

  // Modals for print statement/settlement/edit/repay/receipt
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState<boolean>(false);
  const [settlementModalPrintMode, setSettlementModalPrintMode] = useState<'official' | 'thermal' | 'service'>('official');
  const [isBuyerModalOpen, setIsBuyerModalOpen] = useState<boolean>(false);
  const [buyerModalPrintMode, setBuyerModalPrintMode] = useState<'official' | 'invoice' | 'transit' | 'thermal'>('invoice');
  const [isDisbursementsModalOpen, setIsDisbursementsModalOpen] = useState<boolean>(false);
  const [disbursementsModalPrintMode, setDisbursementsModalPrintMode] = useState<'official' | 'thermal'>('official');
  const [fishermanRole, setFishermanRole] = useState<'fisherman' | 'seller'>('fisherman');
  const [buyerRole, setBuyerRole] = useState<'fisherman' | 'seller'>('fisherman');
  const [advanceModalInitialTab, setAdvanceModalInitialTab] = useState<'advance' | 'loan'>('advance');
  const [settlementBuyerOverride, setSettlementBuyerOverride] = useState<Contact | null>(null);
  const [settlementTransactionsOverride, setSettlementTransactionsOverride] = useState<Transaction[] | null>(null);
  const [settlementRoleOverride, setSettlementRoleOverride] = useState<'fisherman' | 'seller' | undefined>(undefined);

  const handleOpenBuyerStatement = (mode: 'official' | 'invoice' | 'thermal' | 'transit' = 'invoice') => {
    setBuyerModalPrintMode(mode);
    setIsBuyerModalOpen(true);
  };

  // Handle incoming direct navigation to a specific buyer statement
  const lastHandledBuyerStatementTsRef = useRef<number>(0);
  useEffect(() => {
    if (targetBuyerStatement?.buyerId && targetBuyerStatement.ts !== lastHandledBuyerStatementTsRef.current) {
      lastHandledBuyerStatementTsRef.current = targetBuyerStatement.ts;
      const targetId = targetBuyerStatement.buyerId.trim();
      const targetNorm = normalizeArabic(targetId);
      const matched =
        buyers.find((b) => b.id === targetId || b.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(b.name) === targetNorm || normalizeArabic(b.name).includes(targetNorm)) ||
        contacts.find((c) => (c.type === 'buyer' || c.type === 'both') && (c.id === targetId || c.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(c.name) === targetNorm)) ||
        contacts.find((c) => c.id === targetId || c.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(c.name) === targetNorm);

      // التوجيه المباشر والأكيد لكشف حساب المشتري
      setReportType('buyer');
      const matchedTrx = !matched ? transactions.find((t) =>
        (t.buyerId && t.buyerId === targetId) ||
        (t.buyerName && (t.buyerName.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(t.buyerName) === targetNorm || normalizeArabic(t.buyerName).includes(targetNorm)))
      ) : null;

      if (matched) {
        setSelectedBuyerId(matched.id);
        setBuyerSearchQuery(matched.name);
      } else if (matchedTrx) {
        setSelectedBuyerId(matchedTrx.buyerId || matchedTrx.buyerName);
        setBuyerSearchQuery(matchedTrx.buyerName);
      } else {
        setSelectedBuyerId(targetId);
        setBuyerSearchQuery(targetId);
      }
      setTimeframe('all');
      setBuyerDayFilter('all');
      setBuyerSpecificDate('');
      setBuyerInvoiceQuery('');
      setBuyerFinancialTab('all');
      setIsBuyerModalOpen(false);
      setIsAllDebtorsModalOpen(false);
    }
  }, [targetBuyerStatement, buyers, contacts, transactions]);

  // Handle incoming direct navigation to a specific seller/fisherman statement
  const lastHandledSellerStatementTsRef = useRef<number>(0);
  useEffect(() => {
    if (targetSellerStatement?.sellerId && targetSellerStatement.ts !== lastHandledSellerStatementTsRef.current) {
      lastHandledSellerStatementTsRef.current = targetSellerStatement.ts;
      const targetId = targetSellerStatement.sellerId.trim();
      const targetNorm = normalizeArabic(targetId);
      const matched =
        sellers.find((s) => s.id === targetId || s.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(s.name) === targetNorm || normalizeArabic(s.name).includes(targetNorm)) ||
        contacts.find((c) => (c.type === 'seller' || c.type === 'both') && (c.id === targetId || c.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(c.name) === targetNorm)) ||
        contacts.find((c) => c.id === targetId || c.name.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(c.name) === targetNorm);

      setReportType('seller');
      const matchedTrx = !matched ? transactions.find((t) =>
        (t.sellerId && t.sellerId === targetId) ||
        (t.sellerName && (t.sellerName.trim().toLowerCase() === targetId.toLowerCase() || normalizeArabic(t.sellerName) === targetNorm || normalizeArabic(t.sellerName).includes(targetNorm)))
      ) : null;

      if (matched) {
        setSelectedSellerId(matched.id);
        setSellerSearchQuery(matched.name);
      } else if (matchedTrx) {
        setSelectedSellerId(matchedTrx.sellerId || matchedTrx.sellerName);
        setSellerSearchQuery(matchedTrx.sellerName);
      } else {
        setSelectedSellerId(targetId);
        setSellerSearchQuery(targetId);
      }
      setTimeframe('all');
      setSellerDayFilter('all');
      setSellerSpecificDate('');
      setSellerInvoiceQuery('');
      setIsDisbursementsModalOpen(false);
    }
  }, [targetSellerStatement, sellers, contacts, transactions]);

  const handleOpenDisbursementsModal = (mode: 'official' | 'thermal' = 'official') => {
    setDisbursementsModalPrintMode(mode);
    setIsDisbursementsModalOpen(true);
  };

  const [isAllDebtorsModalOpen, setIsAllDebtorsModalOpen] = useState<boolean>(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingContext, setEditingContext] = useState<'buyer' | 'seller' | 'full'>('full');
  const [transferringTransaction, setTransferringTransaction] = useState<Transaction | null>(null);
  const [isEditBuyerDebtModalOpen, setIsEditBuyerDebtModalOpen] = useState<boolean>(false);
  const [customBuyerRemainingDebtInput, setCustomBuyerRemainingDebtInput] = useState<string>('');
  const [selectedTrxForDebtEdit, setSelectedTrxForDebtEdit] = useState<string>('ALL');
  const [selectedTrxForDelete, setSelectedTrxForDelete] = useState<Transaction | null>(null);

  // Quick Email Backup State & Handler
  const [isSendingEmailBackup, setIsSendingEmailBackup] = useState(false);
  const [emailBackupFeedback, setEmailBackupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendQuickEmailBackup = async () => {
    const targetEmail = (settings.autoBackupEmail || settings.marketEmail || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      setEmailBackupFeedback({
        type: 'error',
        message: 'يرجى إدخال بريد إلكتروني صالح في إعدادات النظام أولاً',
      });
      setTimeout(() => setEmailBackupFeedback(null), 5000);
      return;
    }

    setIsSendingEmailBackup(true);
    setEmailBackupFeedback(null);
    try {
      const backupJson = exportAllData(transactions, contacts, fishTypes, settings, cashEntries);
      await sendBackupEmailNow(targetEmail, backupJson, {
        host: settings.smtpHost,
        port: settings.smtpPort,
        user: settings.smtpUser,
        pass: settings.smtpPass,
        secure: settings.smtpSecure,
      });
      setEmailBackupFeedback({
        type: 'success',
        message: `تم إرسال النسخة بنجاح إلى: ${targetEmail}`,
      });
      setTimeout(() => setEmailBackupFeedback(null), 6000);
    } catch (err: any) {
      console.error('Quick email backup error:', err);
      setEmailBackupFeedback({
        type: 'error',
        message: err.message || 'تعذر إرسال النسخة الاحتياطية إلى البريد',
      });
      setTimeout(() => setEmailBackupFeedback(null), 6000);
    } finally {
      setIsSendingEmailBackup(false);
    }
  };

  // Market Workers / Employees List & State
  const workers = useMemo(() => {
    const list: Contact[] = contacts.filter(
      (c) => c.type === 'worker' || (Boolean(c.role) && (c.role || '').trim() !== '')
    );
    const existingNames = new Set(list.map((w) => w.name.trim().toLowerCase()));

    // Always ensure Cashier / Market Staff exists if not present
    if (!existingNames.has('أمين الصندوق')) {
      list.unshift({
        id: 'worker-cashier',
        name: 'أمين الصندوق',
        type: 'worker',
        role: 'مسؤول الصندوق واليومية',
        dailyWage: 0,
        createdAt: new Date().toISOString(),
      });
      existingNames.add('أمين الصندوق');
    }

    // Harvest any workers mentioned in cash entries
    (cashEntries || []).forEach((e) => {
      const matchWorker =
        e.category === 'أجور عمال وتنزيل' ||
        e.category === 'رواتب ومستحقات موظفين' ||
        e.category === 'سلفة موظف / عامل' ||
        e.category === 'مكافأة موظف' ||
        e.category === 'سداد سلفة موظف';
      if (matchWorker && e.contactName) {
        const norm = e.contactName.trim().toLowerCase();
        if (!existingNames.has(norm)) {
          existingNames.add(norm);
          list.push({
            id: e.contactId || `worker-${norm}`,
            name: e.contactName,
            type: 'worker',
            role: 'عامل / موظف سوق',
            dailyWage: 0,
            createdAt: e.dateStr,
          });
        }
      }
    });

    return list;
  }, [contacts, cashEntries]);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(workers[0]?.id || '');
  const [workerSearchQuery, setWorkerSearchQuery] = useState<string>('');

  const filteredWorkers = useMemo(() => {
    if (!workerSearchQuery.trim()) return workers;
    const q = workerSearchQuery.trim().toLowerCase();
    return workers.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.role && w.role.toLowerCase().includes(q))
    );
  }, [workers, workerSearchQuery]);

  const selectedWorker = useMemo(() => {
    return workers.find((w) => w.id === selectedWorkerId) || workers[0];
  }, [workers, selectedWorkerId]);

  // Financial history for the selected worker
  const workerEntries = useMemo(() => {
    if (!selectedWorker) return [];
    const wId = selectedWorker.id.trim().toLowerCase();
    const wName = selectedWorker.name.trim().toLowerCase();

    return (cashEntries || []).filter((e) => {
      const eId = (e.contactId || '').trim().toLowerCase();
      const eName = (e.contactName || '').trim().toLowerCase();
      return (eId && eId === wId) || (eName && eName === wName);
    });
  }, [cashEntries, selectedWorker]);

  const workerMetrics = useMemo(() => {
    let totalPaid = 0;
    let totalAdvances = 0;
    let totalAdvancesRepaid = 0;

    workerEntries.forEach((e) => {
      if (
        e.category === 'أجور عمال وتنزيل' ||
        e.category === 'رواتب ومستحقات موظفين' ||
        e.category === 'صرف أجر / راتب نقداً' ||
        e.category === 'مكافأة موظف'
      ) {
        totalPaid += e.amount;
      } else if (e.category === 'سلفة موظف / عامل') {
        if (e.type === 'expense') totalAdvances += e.amount;
        else if (e.type === 'deposit') totalAdvancesRepaid += e.amount;
      } else if (e.category === 'سداد سلفة موظف') {
        totalAdvancesRepaid += e.amount;
      }
    });

    const netAdvanceBalance = Math.max(0, totalAdvances - totalAdvancesRepaid);

    return {
      totalPaid,
      totalAdvances,
      totalAdvancesRepaid,
      netAdvanceBalance,
    };
  }, [workerEntries]);

  // Worker Modals State
  const [isAddWorkerModalOpen, setIsAddWorkerModalOpen] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerRole, setNewWorkerRole] = useState('');
  const [newWorkerPhone, setNewWorkerPhone] = useState('');
  const [newWorkerDailyWage, setNewWorkerDailyWage] = useState<number | ''>('');
  const [newWorkerNotes, setNewWorkerNotes] = useState('');

  const [isPayWorkerModalOpen, setIsPayWorkerModalOpen] = useState(false);
  const [isWorkerActionsMenuOpen, setIsWorkerActionsMenuOpen] = useState(false);
  const [payWorkerBeneficiarySearch, setPayWorkerBeneficiarySearch] = useState('');
  const [isBeneficiarySuggestionsOpen, setIsBeneficiarySuggestionsOpen] = useState(false);
  const [payWorkerAmount, setPayWorkerAmount] = useState<number | ''>('');
  const [payWorkerCategory, setPayWorkerCategory] = useState<string>('');
  const [payWorkerNotes, setPayWorkerNotes] = useState('');
  const [payWorkerMethod, setPayWorkerMethod] = useState<'cash' | 'exchange'>('cash');
  const [payWorkerExchangeName, setPayWorkerExchangeName] = useState('');
  const [isSubmittingWorkerPayment, setIsSubmittingWorkerPayment] = useState(false);

  const beneficiarySuggestions = useMemo(() => {
    if (!payWorkerBeneficiarySearch.trim()) return workers.slice(0, 8);
    const q = payWorkerBeneficiarySearch.trim().toLowerCase();
    return workers.filter(
      (w) => w.name.toLowerCase().includes(q) || (w.role && w.role.toLowerCase().includes(q))
    );
  }, [workers, payWorkerBeneficiarySearch]);

  const [isWorkerAdvanceUnifiedModalOpen, setIsWorkerAdvanceUnifiedModalOpen] = useState(false);
  const [workerAdvanceUnifiedTab, setWorkerAdvanceUnifiedTab] = useState<'give' | 'repay'>('give');
  const [isWorkerAdvanceModalOpen, setIsWorkerAdvanceModalOpen] = useState(false);
  const [workerAdvanceAmount, setWorkerAdvanceAmount] = useState<number | ''>('');
  const [workerAdvanceNotes, setWorkerAdvanceNotes] = useState('');
  const [workerAdvanceMethod, setWorkerAdvanceMethod] = useState<'cash' | 'exchange'>('cash');
  const [workerAdvanceExchangeName, setWorkerAdvanceExchangeName] = useState('');
  const [isSubmittingWorkerAdvance, setIsSubmittingWorkerAdvance] = useState(false);

  const [isWorkerRepayModalOpen, setIsWorkerRepayModalOpen] = useState(false);
  const [workerRepayAmount, setWorkerRepayAmount] = useState<number | ''>('');
  const [workerRepayNotes, setWorkerRepayNotes] = useState('');
  const [workerRepayMethod, setWorkerRepayMethod] = useState<'cash' | 'exchange'>('cash');
  const [workerRepayExchangeName, setWorkerRepayExchangeName] = useState('');
  const [isSubmittingWorkerRepay, setIsSubmittingWorkerRepay] = useState(false);

  const [isWorkerStatementPrintOpen, setIsWorkerStatementPrintOpen] = useState(false);

  // Lot Transfers state
  const [lotTransferSearch, setLotTransferSearch] = useState('');
  const [lotTransferDayFilter, setLotTransferDayFilter] = useState<string>('all');
  const [lotTransferSpecificDate, setLotTransferSpecificDate] = useState<string>('');
  const [lotTransferInvoiceQuery, setLotTransferInvoiceQuery] = useState<string>('');
  const activeLotTransfers = useMemo(() => {
    return lotTransfers && lotTransfers.length > 0 ? lotTransfers : loadLotTransfers();
  }, [lotTransfers]);

  const filteredLotTransfers = useMemo(() => {
    return activeLotTransfers.filter((t) => {
      // 1. Free search text
      if (lotTransferSearch.trim()) {
        const q = lotTransferSearch.trim().toLowerCase();
        const matches =
          t.transactionId.toLowerCase().includes(q) ||
          t.fromBuyerName.toLowerCase().includes(q) ||
          t.toBuyerName.toLowerCase().includes(q) ||
          (t.toBuyerPhone && t.toBuyerPhone.includes(q)) ||
          (t.notes && t.notes.toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Day of Week
      if (lotTransferDayFilter !== 'all') {
        const d = (t.timestamp && !isNaN(Number(t.timestamp)) && Number(t.timestamp) > 0)
          ? new Date(Number(t.timestamp))
          : parseLocalDate(t.dateStr);
        if (!d || isNaN(d.getTime()) || d.getDay().toString() !== lotTransferDayFilter) {
          return false;
        }
      }

      // 3. Specific Date
      if (lotTransferSpecificDate.trim()) {
        if (!isSameCalendarDay(t.timestamp || t.dateStr, lotTransferSpecificDate.trim())) return false;
      }

      // 4. Invoice / Transaction ID
      if (lotTransferInvoiceQuery.trim()) {
        const q = lotTransferInvoiceQuery.trim().toLowerCase();
        if (!t.transactionId.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [activeLotTransfers, lotTransferSearch, lotTransferDayFilter, lotTransferSpecificDate, lotTransferInvoiceQuery]);

  const lotTransfersStats = useMemo(() => {
    let totalGross = 0;
    let totalTax = 0;
    let totalNet = 0;
    filteredLotTransfers.forEach((t) => {
      totalGross += t.grossAmount || 0;
      totalTax += t.buyerTaxAmount || 0;
      totalNet += t.totalAmount || 0;
    });
    return {
      count: filteredLotTransfers.length,
      totalGross,
      totalTax,
      totalNet,
    };
  }, [filteredLotTransfers]);

  // Worker Handlers
  const handleAddWorkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerName.trim()) return;
    if (onAddContact) {
      const created = onAddContact({
        name: newWorkerName.trim(),
        role: newWorkerRole.trim() || 'عامل سوق',
        phone: newWorkerPhone.trim() || undefined,
        dailyWage: typeof newWorkerDailyWage === 'number' ? newWorkerDailyWage : undefined,
        notes: newWorkerNotes.trim() || undefined,
        type: 'worker',
      });
      if (created) {
        setSelectedWorkerId(created.id);
      }
    }
    setNewWorkerName('');
    setNewWorkerRole('');
    setNewWorkerPhone('');
    setNewWorkerDailyWage('');
    setNewWorkerNotes('');
    setIsAddWorkerModalOpen(false);
  };

  const handlePayWorkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const beneficiaryName = payWorkerBeneficiarySearch.trim() || selectedWorker?.name || '';
    if (!beneficiaryName || !payWorkerAmount || Number(payWorkerAmount) <= 0) return;

    const matchedWorker = workers.find(
      (w) => w.name.trim().toLowerCase() === beneficiaryName.toLowerCase() || w.id === selectedWorkerId
    ) || selectedWorker;

    setIsSubmittingWorkerPayment(true);
    try {
      if (onAddCashEntry) {
        onAddCashEntry({
          type: 'expense',
          category: payWorkerCategory.trim() || 'أجور عمال ومستحقات',
          amount: Number(payWorkerAmount),
          description: `صرف أجر/مستحقات لـ: ${beneficiaryName}${matchedWorker?.role ? ` (${matchedWorker.role})` : ''} - ${payWorkerMethod === 'exchange' ? `عبر الصرافة (${payWorkerExchangeName.trim() || 'صرافة'})` : 'نقداً من الصندوق'}${payWorkerNotes.trim() ? ` - ${payWorkerNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactId: matchedWorker?.id,
          contactName: beneficiaryName,
          payoutMethod: payWorkerMethod,
          exchangeName: payWorkerMethod === 'exchange' ? payWorkerExchangeName.trim() || undefined : undefined,
        });
      }
      setPayWorkerAmount('');
      setPayWorkerCategory('');
      setPayWorkerNotes('');
      setPayWorkerMethod('cash');
      setPayWorkerExchangeName('');
      setPayWorkerBeneficiarySearch('');
      setIsBeneficiarySuggestionsOpen(false);
      setIsPayWorkerModalOpen(false);
    } finally {
      setIsSubmittingWorkerPayment(false);
    }
  };

  const handleWorkerAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !workerAdvanceAmount || workerAdvanceAmount <= 0) return;
    setIsSubmittingWorkerAdvance(true);
    try {
      if (onAddCashEntry) {
        onAddCashEntry({
          type: 'expense',
          category: 'سلفة موظف / عامل',
          amount: Number(workerAdvanceAmount),
          description: `صرف سلفة للموظف/العامل: ${selectedWorker.name} - ${workerAdvanceMethod === 'exchange' ? `عبر الصرافة (${workerAdvanceExchangeName.trim() || 'صرافة'})` : 'نقداً من الصندوق'}${workerAdvanceNotes.trim() ? ` - ${workerAdvanceNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactId: selectedWorker.id,
          contactName: selectedWorker.name,
          payoutMethod: workerAdvanceMethod,
          exchangeName: workerAdvanceMethod === 'exchange' ? workerAdvanceExchangeName.trim() || undefined : undefined,
        });
      }
      setWorkerAdvanceAmount('');
      setWorkerAdvanceNotes('');
      setWorkerAdvanceMethod('cash');
      setWorkerAdvanceExchangeName('');
      setIsWorkerAdvanceModalOpen(false);
    } finally {
      setIsSubmittingWorkerAdvance(false);
    }
  };

  const handleWorkerRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !workerRepayAmount || workerRepayAmount <= 0) return;
    setIsSubmittingWorkerRepay(true);
    try {
      if (onAddCashEntry) {
        onAddCashEntry({
          type: 'deposit',
          category: 'سداد سلفة موظف',
          amount: Number(workerRepayAmount),
          description: `استرداد وسداد سلفة الموظف/العامل: ${selectedWorker.name} - ${workerRepayMethod === 'exchange' ? `عبر الصرافة (${workerRepayExchangeName.trim() || 'صرافة'})` : 'نقداً للصندوق'}${workerRepayNotes.trim() ? ` - ${workerRepayNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactId: selectedWorker.id,
          contactName: selectedWorker.name,
          payoutMethod: workerRepayMethod,
          repaymentMethod: workerRepayMethod,
          exchangeName: workerRepayMethod === 'exchange' ? workerRepayExchangeName.trim() || undefined : undefined,
        });
      }
      setWorkerRepayAmount('');
      setWorkerRepayNotes('');
      setWorkerRepayMethod('cash');
      setWorkerRepayExchangeName('');
      setIsWorkerRepayModalOpen(false);
    } finally {
      setIsSubmittingWorkerRepay(false);
    }
  };

  // =========================================================================
  // OFFICE LEDGER & EXPENSES STATE (كشف حساب ونثريات وسلف المكتب)
  // =========================================================================
  const officeOfficers = useMemo(() => {
    return [
      { id: 'office-all', name: 'كافة حركات ونثريات المكتب (شامل)', role: 'إدارة السوق والمكتب' },
    ];
  }, []);

  const [selectedOfficeOfficerId, setSelectedOfficeOfficerId] = useState<string>('office-all');
  const [officeSearchQuery, setOfficeSearchQuery] = useState<string>('');

  const selectedOfficeOfficer = useMemo(() => {
    return officeOfficers.find((o) => o.id === selectedOfficeOfficerId) || officeOfficers[0];
  }, [officeOfficers, selectedOfficeOfficerId]);

  // Office cash entries filtered
  const officeEntries = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    return (cashEntries || []).filter((e) => {
      // 1. Timeframe filter
      if (timeframe === 'today' && !isSameCalendarDay(e.timestamp || e.dateStr, new Date())) return false;
      if (timeframe === 'week' && now - e.timestamp > 7 * dayMs) return false;
      if (timeframe === 'month' && now - e.timestamp > 30 * dayMs) return false;

      // 2. Relevance check for office
      const cat = (e.category || '').trim().toLowerCase();
      const desc = (e.description || '').trim().toLowerCase();
      const cName = (e.contactName || '').trim().toLowerCase();
      const cId = (e.contactId || '').trim().toLowerCase();

      const isOffice =
        cat.includes('مكتب') ||
        cat.includes('نثريات') ||
        cat.includes('ضيافة') ||
        cat.includes('إفطار') ||
        cat.includes('غداء') ||
        cat.includes('سحوبات وتوريدات الإدارة') ||
        cat.includes('مصروفات مكتبية') ||
        cat.includes('سلفة ومسحوبات المكتب') ||
        cat.includes('سداد واسترداد سلفة المكتب') ||
        desc.includes('المكتب') ||
        desc.includes('للمكتب') ||
        desc.includes('نثريات المكتب') ||
        cName.includes('مكتب') ||
        cId.startsWith('office-');

      if (!isOffice) return false;

      // 3. Officer filter
      if (selectedOfficeOfficerId !== 'office-all') {
        const matchOfficer =
          (e.contactId && e.contactId === selectedOfficeOfficer.id) ||
          (e.contactName && e.contactName.trim().toLowerCase() === selectedOfficeOfficer.name.trim().toLowerCase());
        if (!matchOfficer) return false;
      }

      // 4. Search query
      if (officeSearchQuery.trim()) {
        const q = officeSearchQuery.trim().toLowerCase();
        const matchSearch =
          (e.description && e.description.toLowerCase().includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q)) ||
          (e.contactName && e.contactName.toLowerCase().includes(q)) ||
          (e.id && e.id.toLowerCase().includes(q));
        if (!matchSearch) return false;
      }

      return true;
    });
  }, [cashEntries, timeframe, selectedOfficeOfficerId, selectedOfficeOfficer, officeSearchQuery]);

  const officeMetrics = useMemo(() => {
    let totalExpenses = 0; // نثريات، وجبات، ضيافة، مستلزمات
    let totalAdvances = 0; // سلف وعُهد مسحوبة للمكتب
    let totalAdvancesRepaid = 0; // سلف مستردة أو مسددة للصندوق

    officeEntries.forEach((e) => {
      const cat = (e.category || '').toLowerCase();
      const desc = (e.description || '').toLowerCase();
      const isAdvance =
        cat.includes('سلفة') ||
        cat.includes('سلف') ||
        cat.includes('عهدة') ||
        cat.includes('مسحوبات') ||
        desc.includes('سلفة') ||
        desc.includes('عهدة');

      if (e.type === 'expense') {
        if (isAdvance) {
          totalAdvances += e.amount || 0;
        } else {
          totalExpenses += e.amount || 0;
        }
      } else if (e.type === 'deposit') {
        totalAdvancesRepaid += e.amount || 0;
      }
    });

    const netAdvanceBalance = Math.max(0, totalAdvances - totalAdvancesRepaid);
    const totalDisbursed = totalExpenses + totalAdvances;

    return {
      totalExpenses,
      totalAdvances,
      totalAdvancesRepaid,
      netAdvanceBalance,
      totalDisbursed,
    };
  }, [officeEntries]);

  // Office Modals State
  const [isOfficeExpenseModalOpen, setIsOfficeExpenseModalOpen] = useState(false);
  const [isOfficeActionsMenuOpen, setIsOfficeActionsMenuOpen] = useState(false);
  const [officeExpenseAmount, setOfficeExpenseAmount] = useState<number | ''>('');
  const [officeExpenseCategory, setOfficeExpenseCategory] = useState<string>('');
  const [officeExpenseOfficer, setOfficeExpenseOfficer] = useState<string>('مسؤول المكتب');
  const [officeExpenseNotes, setOfficeExpenseNotes] = useState<string>('');
  const [officeExpenseMethod, setOfficeExpenseMethod] = useState<'cash' | 'exchange'>('cash');
  const [officeExpenseExchangeName, setOfficeExpenseExchangeName] = useState('');
  const [isSubmittingOfficeExpense, setIsSubmittingOfficeExpense] = useState(false);

  const [isOfficeAdvanceUnifiedModalOpen, setIsOfficeAdvanceUnifiedModalOpen] = useState(false);
  const [officeAdvanceUnifiedTab, setOfficeAdvanceUnifiedTab] = useState<'give' | 'repay'>('give');
  const [isOfficeAdvanceModalOpen, setIsOfficeAdvanceModalOpen] = useState(false);
  const [officeAdvanceAmount, setOfficeAdvanceAmount] = useState<number | ''>('');
  const [officeAdvanceOfficer, setOfficeAdvanceOfficer] = useState<string>('مسؤول المكتب');
  const [officeAdvanceNotes, setOfficeAdvanceNotes] = useState<string>('');
  const [officeAdvanceMethod, setOfficeAdvanceMethod] = useState<'cash' | 'exchange'>('cash');
  const [officeAdvanceExchangeName, setOfficeAdvanceExchangeName] = useState('');
  const [isSubmittingOfficeAdvance, setIsSubmittingOfficeAdvance] = useState(false);

  const [isOfficeRepayModalOpen, setIsOfficeRepayModalOpen] = useState(false);
  const [officeRepayAmount, setOfficeRepayAmount] = useState<number | ''>('');
  const [officeRepayOfficer, setOfficeRepayOfficer] = useState<string>('مسؤول المكتب');
  const [officeRepayNotes, setOfficeRepayNotes] = useState<string>('');
  const [officeRepayMethod, setOfficeRepayMethod] = useState<'cash' | 'exchange'>('cash');
  const [officeRepayExchangeName, setOfficeRepayExchangeName] = useState('');
  const [isSubmittingOfficeRepay, setIsSubmittingOfficeRepay] = useState(false);

  const [isOfficeStatementPrintOpen, setIsOfficeStatementPrintOpen] = useState(false);

  const handleOfficeExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeExpenseAmount || Number(officeExpenseAmount) <= 0) return;
    setIsSubmittingOfficeExpense(true);
    try {
      if (onAddCashEntry) {
        const officer = officeExpenseOfficer.trim() || 'مسؤول المكتب';
        const cat = officeExpenseCategory.trim() || 'نثريات ومصروفات المكتب';
        onAddCashEntry({
          type: 'expense',
          category: cat,
          amount: Number(officeExpenseAmount),
          description: `صرف نثريات ومصاريف للمكتب (${officer}): ${cat} - ${officeExpenseMethod === 'exchange' ? `عبر الصرافة (${officeExpenseExchangeName.trim() || 'صرافة'})` : 'نقداً من الصندوق'}${officeExpenseNotes.trim() ? ` - ${officeExpenseNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactName: officer,
          contactId: 'office-expense',
          payoutMethod: officeExpenseMethod,
          exchangeName: officeExpenseMethod === 'exchange' ? officeExpenseExchangeName.trim() || undefined : undefined,
        });
      }
      setOfficeExpenseAmount('');
      setOfficeExpenseCategory('');
      setOfficeExpenseNotes('');
      setOfficeExpenseMethod('cash');
      setOfficeExpenseExchangeName('');
      setIsOfficeExpenseModalOpen(false);
    } finally {
      setIsSubmittingOfficeExpense(false);
    }
  };

  const handleOfficeAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeAdvanceAmount || Number(officeAdvanceAmount) <= 0) return;
    setIsSubmittingOfficeAdvance(true);
    try {
      if (onAddCashEntry) {
        const officer = officeAdvanceOfficer.trim() || 'مسؤول المكتب';
        onAddCashEntry({
          type: 'expense',
          category: 'سلفة ومسحوبات المكتب',
          amount: Number(officeAdvanceAmount),
          description: `صرف سلفة/مسحوبات للمكتب (${officer}) - ${officeAdvanceMethod === 'exchange' ? `عبر الصرافة (${officeAdvanceExchangeName.trim() || 'صرافة'})` : 'نقداً من الصندوق'}${officeAdvanceNotes.trim() ? ` - ${officeAdvanceNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactName: officer,
          contactId: 'office-advance',
          payoutMethod: officeAdvanceMethod,
          exchangeName: officeAdvanceMethod === 'exchange' ? officeAdvanceExchangeName.trim() || undefined : undefined,
        });
      }
      setOfficeAdvanceAmount('');
      setOfficeAdvanceNotes('');
      setOfficeAdvanceMethod('cash');
      setOfficeAdvanceExchangeName('');
      setIsOfficeAdvanceModalOpen(false);
    } finally {
      setIsSubmittingOfficeAdvance(false);
    }
  };

  const handleOfficeRepaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeRepayAmount || Number(officeRepayAmount) <= 0) return;
    setIsSubmittingOfficeRepay(true);
    try {
      if (onAddCashEntry) {
        const officer = officeRepayOfficer.trim() || 'مسؤول المكتب';
        onAddCashEntry({
          type: 'deposit',
          category: 'سداد واسترداد سلفة المكتب',
          amount: Number(officeRepayAmount),
          description: `توريد واسترداد سلفة/عهدة المكتب (${officer}) - ${officeRepayMethod === 'exchange' ? `عبر الصرافة (${officeRepayExchangeName.trim() || 'صرافة'})` : 'نقداً للصندوق'}${officeRepayNotes.trim() ? ` - ${officeRepayNotes.trim()}` : ''}`,
          performedBy: 'أمين الصندوق',
          contactName: officer,
          contactId: 'office-repay',
          payoutMethod: officeRepayMethod,
          repaymentMethod: officeRepayMethod,
          exchangeName: officeRepayMethod === 'exchange' ? officeRepayExchangeName.trim() || undefined : undefined,
        });
      }
      setOfficeRepayAmount('');
      setOfficeRepayNotes('');
      setOfficeRepayMethod('cash');
      setOfficeRepayExchangeName('');
      setIsOfficeRepayModalOpen(false);
    } finally {
      setIsSubmittingOfficeRepay(false);
    }
  };

  const [isRepayModalOpen, setIsRepayModalOpen] = useState<boolean>(false);
  const [repaymentSource, setRepaymentSource] = useState<'cash' | 'exchange' | 'advance' | 'offset' | 'resale_settle'>('cash');
  const [offsetSurplusAction, setOffsetSurplusAction] = useState<'payout_cash' | 'deposit_advance'>('payout_cash');
  const [isBuyerSalesModalOpen, setIsBuyerSalesModalOpen] = useState<boolean>(false);
  const [repayExchangeName, setRepayExchangeName] = useState<string>('');
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState<boolean>(false);
  const [repayAmount, setRepayAmount] = useState<number | ''>('');
  const [repayNotes, setRepayNotes] = useState<string>('');
  const [selectedUnpaidTrxId, setSelectedUnpaidTrxId] = useState<string | null>(null);
  const [selectedRepaymentForPrint, setSelectedRepaymentForPrint] = useState<CashEntry | null>(null);
  const [repaymentToCancel, setRepaymentToCancel] = useState<CashEntry | null>(null);
  const [editingRepaymentEntry, setEditingRepaymentEntry] = useState<CashEntry | null>(null);
  const [editRepaymentAmountInput, setEditRepaymentAmountInput] = useState<string>('');
  const [editRepaymentNotesInput, setEditRepaymentNotesInput] = useState<string>('');

  const handleOpenEditRepayment = (entry: CashEntry) => {
    setEditingRepaymentEntry(entry);
    setEditRepaymentAmountInput(String(entry.amount || 0));
    setEditRepaymentNotesInput(entry.notes || entry.description || '');
  };

  const handleSaveEditRepayment = () => {
    if (!editingRepaymentEntry || !onUpdateCashEntry) return;
    const cleanStr = editRepaymentAmountInput.trim().replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    const newAmount = cleanStr === '' ? 0 : parseFloat(cleanStr);
    if (isNaN(newAmount) || newAmount < 0) {
      alert('يرجى إدخال مبلغ صحيح أكبر من أو يساوي الصفر');
      return;
    }
    const updated: CashEntry = {
      ...editingRepaymentEntry,
      amount: newAmount,
      notes: editRepaymentNotesInput.trim(),
      description: editRepaymentNotesInput.trim() || editingRepaymentEntry.description,
    };
    onUpdateCashEntry(updated);
    setEditingRepaymentEntry(null);
  };
  const [repaymentPrintMode, setRepaymentPrintMode] = useState<'a4' | 'thermal'>('a4');
  const [isExportingRepaymentPdf, setIsExportingRepaymentPdf] = useState<boolean>(false);
  const [repaymentExportMsg, setRepaymentExportMsg] = useState<string | null>(null);

  // Seller Payout modal & printing
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState<boolean>(false);
  const [targetTransactionForPayout, setTargetTransactionForPayout] = useState<Transaction | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<number | ''>('');
  const [payoutMethod, setPayoutMethod] = useState<'cash' | 'exchange'>('cash');
  const [payoutExchangeName, setPayoutExchangeName] = useState<string>('');
  const [payoutNotes, setPayoutNotes] = useState<string>('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState<boolean>(false);
  const [selectedSellerPayoutForPrint, setSelectedSellerPayoutForPrint] = useState<CashEntry | null>(null);
  const [payoutPaperFormat, setPayoutPaperFormat] = useState<'a4' | 'thermal'>('a4');
  const [isPrintingPayoutA4, setIsPrintingPayoutA4] = useState<boolean>(false);
  const [isExportingPayoutPdf, setIsExportingPayoutPdf] = useState<boolean>(false);
  const [isSendingWhatsAppPayout, setIsSendingWhatsAppPayout] = useState<boolean>(false);
  const [payoutToast, setPayoutToast] = useState<string | null>(null);
  const [disbursementFilter, setDisbursementFilter] = useState<'all' | 'vouchers' | 'pos' | 'settlements'>('all');

  // Advance Settlement state inside Seller Payout
  const [isAdvanceSettlementEnabled, setIsAdvanceSettlementEnabled] = useState<boolean>(false);
  const [advanceSettlementAmount, setAdvanceSettlementAmount] = useState<number | ''>('');
  const [selectedSettlementForPrint, setSelectedSettlementForPrint] = useState<CashEntry | null>(null);
  const [pendingSettlementPrint, setPendingSettlementPrint] = useState<CashEntry | null>(null);

  // Seller Advance modal & printing
  const [isSellerAdvanceUnifiedModalOpen, setIsSellerAdvanceUnifiedModalOpen] = useState<boolean>(false);
  const [sellerAdvanceUnifiedTab, setSellerAdvanceUnifiedTab] = useState<'give' | 'repay'>('give');
  const [isSellerAdvanceModalOpen, setIsSellerAdvanceModalOpen] = useState<boolean>(false);
  const [sellerAdvanceAmount, setSellerAdvanceAmount] = useState<number | ''>('');
  const [sellerAdvanceNotes, setSellerAdvanceNotes] = useState<string>('');
  const [isSubmittingSellerAdvance, setIsSubmittingSellerAdvance] = useState<boolean>(false);
  const [selectedSellerAdvanceForPrint, setSelectedSellerAdvanceForPrint] = useState<CashEntry | null>(null);

  // Seller Advance Direct Cash Repayment modal & printing
  const [isRepaySellerAdvanceModalOpen, setIsRepaySellerAdvanceModalOpen] = useState<boolean>(false);
  const [sellerRepayAmount, setSellerRepayAmount] = useState<number | ''>('');
  const [sellerRepayNotes, setSellerRepayNotes] = useState<string>('');
  const [isSubmittingSellerRepay, setIsSubmittingSellerRepay] = useState<boolean>(false);
  const [selectedRepayAdvanceForPrint, setSelectedRepayAdvanceForPrint] = useState<CashEntry | null>(null);

  // Buyer Loan (السلفة: المشتري يستلف من الصندوق) modal & printing
  const [isBuyerLoanModalOpen, setIsBuyerLoanModalOpen] = useState<boolean>(false);
  const [buyerLoanTab, setBuyerLoanTab] = useState<'give' | 'repay'>('give');
  const [buyerLoanAmount, setBuyerLoanAmount] = useState<number | ''>('');
  const [buyerLoanNotes, setBuyerLoanNotes] = useState<string>('');
  const [isSubmittingBuyerLoan, setIsSubmittingBuyerLoan] = useState<boolean>(false);
  const [selectedBuyerLoanForPrint, setSelectedBuyerLoanForPrint] = useState<CashEntry | null>(null);

  // 2. Buyer Statement Calculations
  const selectedBuyer = useMemo(() => {
    return (
      buyers.find((b) => b.id === selectedBuyerId || b.name.trim().toLowerCase() === (selectedBuyerId || '').trim().toLowerCase()) ||
      contacts.find((c) => c.id === selectedBuyerId || c.name.trim().toLowerCase() === (selectedBuyerId || '').trim().toLowerCase()) ||
      buyers[0]
    );
  }, [contacts, selectedBuyerId, buyers]);

  // Unpaid purchases/transactions for selected buyer
  const selectedBuyerUnpaidTransactions = useMemo(() => {
    if (!selectedBuyer) return [];
    return transactions.filter((t) => {
      const isBuyer = isExactContactMatch(t.buyerId, t.buyerName, selectedBuyer.id, selectedBuyer.name);
      if (!isBuyer) return false;

      const debt =
        t.buyerRemainingDebt !== undefined
          ? t.buyerRemainingDebt
          : t.paymentStatus === 'pending' || t.settlementType === 'association_credit'
          ? t.totalFromBuyer
          : t.settlementType === 'partial_cash'
          ? Math.max(0, t.totalFromBuyer - (t.buyerPaidAmount || 0))
          : 0;

      return debt > 0;
    });
  }, [selectedBuyer, transactions]);

  // الشروات المعلقة التي تمت إعادة بيعها لمشترين آخرين (شروة وبيعة)
  const resoldPendingTransactions = useMemo(() => {
    if (!selectedBuyer) return [];
    return selectedBuyerUnpaidTransactions.filter(
      (t) => (t.wasResold || Boolean(t.resoldToTransactionId) || Boolean(t.resoldToBuyerName)) && t.paymentStatus !== 'settled'
    );
  }, [selectedBuyer, selectedBuyerUnpaidTransactions]);

  const resoldPendingDebt = useMemo(() => {
    return resoldPendingTransactions.reduce((sum, t) => {
      const d = t.buyerRemainingDebt !== undefined
        ? t.buyerRemainingDebt
        : (t.paymentStatus === 'pending' || t.settlementType === 'association_credit'
            ? t.totalFromBuyer
            : 0);
      return sum + Math.max(0, d);
    }, 0);
  }, [resoldPendingTransactions]);

  const handleSettleResold = (targetTrxId?: string) => {
    const trxsToSettle = targetTrxId
      ? resoldPendingTransactions.filter((t) => t.id === targetTrxId)
      : (selectedUnpaidTrxId && selectedUnpaidTrxId !== 'ALL'
          ? resoldPendingTransactions.filter((t) => t.id === selectedUnpaidTrxId)
          : resoldPendingTransactions);

    if (trxsToSettle.length === 0) return;

    trxsToSettle.forEach((trx) => {
      if (onSettleResoldTransaction) {
        onSettleResoldTransaction(trx.id, repayNotes);
      } else if (onUpdateTransaction) {
        const now = new Date();
        const audit = `[تمت تصفية وتسوية دين الشروة الأصلية بإعادة البيع للمشتري (${trx.resoldToBuyerName || 'الجديد'})]`;
        const settledTrx: Transaction = {
          ...trx,
          paymentStatus: 'settled',
          buyerRemainingDebt: 0,
          resoldPaymentStatus: 'paid',
          notes: trx.notes && !trx.notes.includes('تمت تصفية') ? `${trx.notes}\n${audit}` : (trx.notes || audit),
          isEdited: true,
          editedAt: Date.now(),
          editedDateStr: formatGregorianDate(now),
        };
        onUpdateTransaction(settledTrx, false);
      }
    });

    setIsRepayModalOpen(false);
    setSelectedUnpaidTrxId(null);
    setRepayAmount('');
    setRepayNotes('');
  };

  // Overall Debtors stats for end-of-day
  const allDebtorsStats = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => {
      const debt =
        t.buyerRemainingDebt !== undefined
          ? t.buyerRemainingDebt
          : t.paymentStatus === 'pending' || t.settlementType === 'association_credit'
          ? t.totalFromBuyer
          : t.paymentStatus === 'partial' || t.settlementType === 'partial_cash'
          ? Math.max(0, t.totalFromBuyer - (t.buyerPaidAmount || 0))
          : 0;

      if (debt > 0) {
        const id = t.buyerId || t.buyerName;
        map.set(id, (map.get(id) || 0) + debt);
      }
    });

    const count = map.size;
    let totalDebt = 0;
    map.forEach((val) => {
      totalDebt += val;
    });

    return { count, totalDebt };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    return transactions.filter((t) => {
      if (timeframe === 'today') return isSameCalendarDay(t.timestamp || t.dateStr, new Date());
      if (timeframe === 'week') return now - t.timestamp <= 7 * dayMs;
      if (timeframe === 'month') return now - t.timestamp <= 30 * dayMs;
      return true;
    });
  }, [transactions, timeframe]);

  // 1. Association Profit Calculations (Lazy computed only when tab is active)
  const associationMetrics = useMemo(() => {
    if (reportType !== 'association') {
      return { totalTurnover: 0, buyerCommission: 0, sellerCommission: 0, totalAssociationProfit: 0, count: 0 };
    }
    return filteredTransactions.reduce(
      (acc, t) => {
        acc.totalTurnover += t.grossAmount;
        acc.buyerCommission += t.buyerTaxAmount;
        acc.sellerCommission += t.sellerTaxAmount;
        acc.totalAssociationProfit += (t.harajProfit || 0);
        acc.count += 1;
        return acc;
      },
      {
        totalTurnover: 0,
        buyerCommission: 0,
        sellerCommission: 0,
        totalAssociationProfit: 0,
        count: 0,
      }
    );
  }, [filteredTransactions, reportType]);

  // Species breakdown for Association Report (Lazy computed only when tab is active)
  const speciesAnalytics = useMemo(() => {
    if (reportType !== 'association') return [];
    const map = new Map<string, { name: string; totalQty: number; totalGross: number; unit: string }>();

    filteredTransactions.forEach((t) => {
      t.items.forEach((item) => {
        const existing = map.get(item.fishName) || {
          name: item.fishName,
          totalQty: 0,
          totalGross: 0,
          unit: item.unit,
        };
        existing.totalQty += item.quantity;
        existing.totalGross += item.totalGross;
        map.set(item.fishName, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.totalGross - a.totalGross);
  }, [filteredTransactions, reportType]);

  // 2. Buyer Statement Calculations
  const allBuyerTransactions = useMemo(() => {
    if (!selectedBuyer) return [];
    const bId = (selectedBuyer.id || '').trim().toLowerCase();
    const bName = normalizeArabic(selectedBuyer.name);

    return transactions.filter((t) => {
      const tId = (t.buyerId || '').trim().toLowerCase();
      const tName = normalizeArabic(t.buyerName);
      return (bId && (tId === bId || tName === bId)) ||
             (bName && (tName === bName || tId === bName));
    });
  }, [transactions, selectedBuyer]);

  const buyerTransactions = useMemo(() => {
    if (!selectedBuyer) return [];
    const bId = (selectedBuyer.id || '').trim().toLowerCase();
    const bName = normalizeArabic(selectedBuyer.name);

    const isCustomFiltered = Boolean(buyerSpecificDate.trim() || buyerInvoiceQuery.trim() || buyerDayFilter !== 'all');

    const sourceList = isCustomFiltered
      ? transactions
      : filteredTransactions;

    const list = sourceList.filter((t) => {
      const tId = (t.buyerId || '').trim().toLowerCase();
      const tName = normalizeArabic(t.buyerName);
      const isBuyer = (bId && (tId === bId || tName === bId)) ||
                      (bName && (tName === bName || tId === bName));
      if (!isBuyer) return false;

      // 1. Filter by Day of Week (0 = Sunday, 1 = Monday, ...)
      if (buyerDayFilter !== 'all') {
        const d = (t.timestamp && !isNaN(Number(t.timestamp)) && Number(t.timestamp) > 0)
          ? new Date(Number(t.timestamp))
          : parseLocalDate(t.dateStr);
        if (!d || isNaN(d.getTime()) || d.getDay().toString() !== buyerDayFilter) return false;
      }

      // 2. Filter by Specific Date (YYYY-MM-DD)
      if (buyerSpecificDate.trim()) {
        if (!isSameCalendarDay(t.timestamp || t.dateStr, buyerSpecificDate.trim())) return false;
      }

      // 3. Filter by Invoice / Transaction ID
      if (buyerInvoiceQuery.trim()) {
        const q = buyerInvoiceQuery.trim().toLowerCase();
        if (!t.id.toLowerCase().includes(q)) return false;
      }

      if (buyerTransactionScope === 'unpaid') {
        const resoldInfo = getResoldDetails(t);
        if (resoldInfo.isResold && resoldInfo.isSettled) return false;
        const remainingDebt =
          t.buyerRemainingDebt !== undefined
            ? t.buyerRemainingDebt
            : t.paymentStatus === 'pending' ||
              t.paymentStatus === 'partial' ||
              t.paymentStatus === 'debt' ||
              t.settlementType === 'association_credit'
            ? t.totalFromBuyer
            : t.settlementType === 'partial_cash'
            ? Math.max(0, t.totalFromBuyer - (t.buyerPaidAmount || 0))
            : 0;
        if (remainingDebt <= 0) return false;
      }

      return true;
    });

    if (list.length === 0 && allBuyerTransactions.length > 0 && !isCustomFiltered && timeframe === 'all' && buyerTransactionScope === 'all') {
      return allBuyerTransactions;
    }

    return list;
  }, [transactions, filteredTransactions, timeframe, selectedBuyer, buyerDayFilter, buyerSpecificDate, buyerInvoiceQuery, buyerTransactionScope, allBuyerTransactions]);

  const buyerCustomFilterLabel = useMemo(() => {
    const dayNames: Record<string, string> = {
      '0': 'يوم الأحد',
      '1': 'يوم الإثنين',
      '2': 'يوم الثلاثاء',
      '3': 'يوم الأربعاء',
      '4': 'يوم الخميس',
      '5': 'يوم الجمعة',
      '6': 'يوم السبت',
    };
    const parts: string[] = [];
    if (buyerDayFilter !== 'all') parts.push(dayNames[buyerDayFilter] || '');
    if (buyerSpecificDate.trim()) parts.push(`الموافق ${buyerSpecificDate.trim()}`);
    if (buyerInvoiceQuery.trim()) parts.push(`فاتورة #${buyerInvoiceQuery.trim()}`);
    if (parts.length > 0) return `شروات ${parts.join(' - ')}`;
    return undefined;
  }, [buyerDayFilter, buyerSpecificDate, buyerInvoiceQuery]);

  const buyerSalesCustomFilterLabel = useMemo(() => {
    if (!buyerCustomFilterLabel) return undefined;
    return buyerCustomFilterLabel.replace('شروات', 'بيعات');
  }, [buyerCustomFilterLabel]);

  const buyerMetrics = useMemo(() => {
    return buyerTransactions.reduce(
      (acc, t) => {
        acc.grossTotal += t.grossAmount;
        acc.taxTotal += t.buyerTaxAmount;
        acc.finalTotal += t.totalFromBuyer;
        acc.count += 1;
        return acc;
      },
      { grossTotal: 0, taxTotal: 0, finalTotal: 0, count: 0 }
    );
  }, [buyerTransactions]);

  // All sales across all time for this buyer
  const allBuyerSalesTransactions = useMemo(() => {
    if (!selectedBuyer) return [];

    return transactions.filter((t) => {
      const isSeller = isTransactionSellerMatchForBuyer(t, selectedBuyer);
      return isSeller;
    });
  }, [transactions, selectedBuyer]);

  // 2.b Buyer Sales Transactions (بيعات هذا المشتري عندما يبيع لآخرين كـ بائع)
  const buyerSalesTransactions = useMemo(() => {
    if (!selectedBuyer) return [];

    const isCustomFiltered = Boolean(buyerSpecificDate.trim() || buyerInvoiceQuery.trim() || buyerDayFilter !== 'all');

    const sourceList = isCustomFiltered
      ? transactions
      : filteredTransactions;

    const list = sourceList.filter((t) => {
      const isSeller = isTransactionSellerMatchForBuyer(t, selectedBuyer);
      if (!isSeller) return false;

      if (buyerDayFilter !== 'all') {
        const d = (t.timestamp && !isNaN(Number(t.timestamp)) && Number(t.timestamp) > 0)
          ? new Date(Number(t.timestamp))
          : parseLocalDate(t.dateStr);
        if (!d || isNaN(d.getTime()) || d.getDay().toString() !== buyerDayFilter) return false;
      }

      if (buyerSpecificDate.trim()) {
        if (!isSameCalendarDay(t.timestamp || t.dateStr, buyerSpecificDate.trim())) return false;
      }

      if (buyerInvoiceQuery.trim()) {
        const q = buyerInvoiceQuery.trim().toLowerCase();
        if (!t.id.toLowerCase().includes(q)) return false;
      }

      return true;
    });

    if (list.length === 0 && allBuyerSalesTransactions.length > 0 && !isCustomFiltered && timeframe === 'all') {
      return allBuyerSalesTransactions;
    }

    return list;
  }, [transactions, filteredTransactions, timeframe, selectedBuyer, buyerDayFilter, buyerSpecificDate, buyerInvoiceQuery, allBuyerSalesTransactions]);

  const buyerSalesMetrics = useMemo(() => {
    return buyerSalesTransactions.reduce(
      (acc, t) => {
        acc.grossTotal += t.grossAmount;
        acc.taxTotal += t.sellerTaxAmount; // 2%
        acc.netTotal += t.netToSeller;
        acc.surplusTotal += (t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0);
        acc.count += 1;
        return acc;
      },
      { grossTotal: 0, taxTotal: 0, netTotal: 0, surplusTotal: 0, count: 0 }
    );
  }, [buyerSalesTransactions]);

  // إجمالي فائض الشروات التراكمي للمشتري (الناتج حصراً عن بيع أو إعادة بيع شرواته للغير كـ بائع/مسوّق)
  const selectedBuyerTotalSurplus = useMemo(() => {
    if (!selectedBuyer) return 0;
    return transactions.reduce((sum, t) => {
      const isSeller = isTransactionSellerMatchForBuyer(t, selectedBuyer);
      if (isSeller && t.resaleSurplus && t.resaleSurplus > 0) {
        return sum + t.resaleSurplus;
      }
      return sum;
    }, 0);
  }, [transactions, selectedBuyer]);

  // إجمالي الفائض الذي تم استرداده وصرفه نقداً للمشتري سابقاً
  const selectedBuyerRefundedSurplus = useMemo(() => {
    if (!selectedBuyer || !cashEntries) return 0;
    const bId = (selectedBuyer.id || '').trim().toLowerCase();
    const bName = normalizeArabic(selectedBuyer.name);
    return cashEntries.reduce((sum, e) => {
      const cId = (e.contactId || '').trim().toLowerCase();
      const cName = normalizeArabic(e.contactName);
      const isMatch = (bId && (cId === bId || cName === bId)) ||
                      (bName && (cName === bName || cId === bName));
      if (isMatch && (e.category === 'استرداد فائض شروات' || e.description?.includes('استرداد فائض شروات') || e.category?.includes('استرداد فائض'))) {
        return sum + e.amount;
      }
      return sum;
    }, 0);
  }, [cashEntries, selectedBuyer]);

  // فائض الشروات المتبقي والمتاح للاسترداد حالياً
  const selectedBuyerAvailableSurplus = useMemo(() => {
    return Math.max(0, selectedBuyerTotalSurplus - selectedBuyerRefundedSurplus);
  }, [selectedBuyerTotalSurplus, selectedBuyerRefundedSurplus]);

  // Outstanding sales dues owed to this buyer as seller (مستحقات البيعات غير المصروفة له)
  const buyerPendingSalesDues = useMemo(() => {
    return allBuyerSalesTransactions.reduce((acc, t) => {
      const paid = typeof t.sellerPaidAmount === 'number'
        ? t.sellerPaidAmount
        : typeof t.paidAtPosAmount === 'number'
        ? t.paidAtPosAmount
        : t.sellerPaidStatus === 'paid'
        ? (t.netToSeller || 0)
        : 0;
      const rem = Math.max(0, (t.netToSeller || 0) - paid);
      return t.sellerPaidStatus !== 'paid' ? acc + rem : acc;
    }, 0);
  }, [allBuyerSalesTransactions]);

  const handleOpenBuyerServiceInvoice = () => {
    if (!selectedBuyer) return;
    const isFiltered = Boolean(buyerDayFilter !== 'all' || buyerSpecificDate.trim() || buyerInvoiceQuery.trim());
    const txs = isFiltered ? buyerSalesTransactions : (buyerSalesTransactions.length > 0 ? buyerSalesTransactions : allBuyerSalesTransactions);
    if (txs.length === 0) return;
    setSettlementBuyerOverride(selectedBuyer);
    setSettlementTransactionsOverride(txs);
    setSettlementRoleOverride('seller');
    setSettlementModalPrintMode('service');
    setIsSettlementModalOpen(true);
  };

  // Repayment & payment receipts history for the selected buyer
  const buyerRepayments = useMemo(() => {
    if (!selectedBuyer) return [];
    return (cashEntries || []).filter((e) => {
      if (e.type !== 'buyer_debt_repayment') return false;
      return isExactContactMatch(e.contactId, e.contactName, selectedBuyer.id, selectedBuyer.name);
    });
  }, [cashEntries, selectedBuyer]);

  const totalBuyerRepayments = useMemo(() => {
    return buyerRepayments.reduce((sum, r) => sum + r.amount, 0);
  }, [buyerRepayments]);

  // Outstanding Debt for the selected buyer across all their transactions
  const selectedBuyerDebt = useMemo(() => {
    if (!selectedBuyer) return 0;
    return transactions
      .filter((t) => isExactContactMatch(t.buyerId, t.buyerName, selectedBuyer.id, selectedBuyer.name))
      .reduce((sum, t) => {
        const debt = getTransactionBuyerDebt(t);
        return sum + Math.max(0, debt);
      }, 0);
  }, [transactions, selectedBuyer]);

  // Advance wallet balance & statistics for selected buyer
  const selectedBuyerAdvanceStats = useMemo(() => {
    if (!selectedBuyer) {
      return {
        totalDeposited: 0,
        totalUsedInPOS: 0,
        totalUsedForDebt: 0,
        totalRefunded: 0,
        currentAdvanceBalance: 0,
      };
    }
    return calculateBuyerAdvanceBalance(selectedBuyer.id, selectedBuyer.name, cashEntries, transactions);
  }, [selectedBuyer, cashEntries, transactions]);

  // Advance ledger entries for selected buyer
  const buyerAdvanceLedger = useMemo(() => {
    if (!selectedBuyer) return [];
    const normId = selectedBuyer.id.trim().toLowerCase();
    const normName = selectedBuyer.name.trim().toLowerCase();

    return (cashEntries || []).filter((e) => {
      const match =
        (e.contactId && e.contactId.trim().toLowerCase() === normId) ||
        (e.contactName && e.contactName.trim().toLowerCase() === normName);
      return (
        match &&
        (e.type === 'buyer_advance_deposit' ||
          e.type === 'buyer_advance_refund' ||
          e.type === 'advance_debt_settlement')
      );
    });
  }, [cashEntries, selectedBuyer]);

  // Buyer Loans / Advances (سلف المشتري المسحوبة نقداً من الصندوق)
  const buyerAdvancesList = useMemo(() => {
    if (!selectedBuyer) return [];
    const normId = selectedBuyer.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedBuyer.name);
    return (cashEntries || []).filter((e) => {
      const match =
        (e.contactId && e.contactId.trim().toLowerCase() === normId) ||
        (e.contactName && normalizeArabic(e.contactName).includes(normName));
      return (
        match &&
        (e.type === 'buyer_advance' ||
          e.type === 'buyer_advance_repayment' ||
          e.category === 'سلفة مشتري' ||
          e.category === 'سداد سلفة مشتري نقداً')
      );
    });
  }, [cashEntries, selectedBuyer]);

  const totalBuyerAdvancesOwed = useMemo(() => {
    let taken = 0;
    let repaid = 0;
    buyerAdvancesList.forEach((a) => {
      if (a.type === 'buyer_advance' || a.category === 'سلفة مشتري') taken += a.amount;
      else if (a.type === 'buyer_advance_repayment' || a.category === 'سداد سلفة مشتري نقداً') repaid += a.amount;
    });
    return Math.max(0, taken - repaid);
  }, [buyerAdvancesList]);

  // Unified Buyer Financial Ledger (Repayments + Advance Wallet movements + Loans)
  const combinedBuyerFinancialEntries = useMemo(() => {
    const list: {
      id: string;
      timestamp: number;
      dateStr: string;
      timeStr: string;
      category: string;
      badgeType: 'deposit' | 'refund' | 'repayment' | 'settlement';
      badgeLabel: string;
      amount: number;
      description: string;
      performedBy: string;
      rawRepayment?: CashEntry;
      isAdvance: boolean;
    }[] = [];

    // 1. Cash repayments (سندات سداد الديون نقداً)
    buyerRepayments.forEach((r) => {
      list.push({
        id: r.id,
        timestamp: r.timestamp || (r.dateStr ? new Date(r.dateStr).getTime() : 0) || 0,
        dateStr: r.dateStr,
        timeStr: r.timeStr,
        category: 'سداد دين نقدي (سند قبض)',
        badgeType: 'repayment',
        badgeLabel: 'سداد دين نقدي (قبض)',
        amount: r.amount,
        description: r.description || 'سداد دين مالي للجمعية',
        performedBy: r.performedBy || 'أمين الصندوق',
        rawRepayment: r,
        isAdvance: false,
      });
    });

    // 2. Advance movements (إيداعات واستردادات ومقاصة رصيد القدمة)
    buyerAdvanceLedger.forEach((adv) => {
      const isDeposit = adv.type === 'buyer_advance_deposit';
      const isRefund = adv.type === 'buyer_advance_refund';
      list.push({
        id: adv.id,
        timestamp: adv.timestamp || (adv.dateStr ? new Date(adv.dateStr).getTime() : 0) || 0,
        dateStr: adv.dateStr,
        timeStr: adv.timeStr,
        category: isDeposit ? 'قبض دفعة مقدمة (قدمة)' : isRefund ? 'استرداد دفعة مقدمة' : 'سداد دين من رصيد القدمة',
        badgeType: isDeposit ? 'deposit' : isRefund ? 'refund' : 'settlement',
        badgeLabel: isDeposit ? 'قبض قدمة (+)' : isRefund ? 'استرداد قدمة (-)' : 'مقاصة دين من القدمة',
        amount: adv.amount,
        description: adv.description || adv.category || 'حركة رصيد قدمة',
        performedBy: adv.performedBy || 'أمين الصندوق',
        isAdvance: true,
      });
    });

    // Sort by timestamp descending
    list.sort((a, b) => b.timestamp - a.timestamp);

    if (buyerFinancialTab === 'repayments') {
      return list.filter((e) => !e.isAdvance);
    }
    if (buyerFinancialTab === 'advances') {
      return list.filter((e) => e.isAdvance);
    }
    return list;
  }, [buyerRepayments, buyerAdvanceLedger, buyerFinancialTab]);

  // 3. Seller Statement Calculations
  const selectedSeller = useMemo(() => {
    return (
      sellers.find((c) => c.id === selectedSellerId || c.name.trim().toLowerCase() === (selectedSellerId || '').trim().toLowerCase() || normalizeArabic(c.name) === normalizeArabic(selectedSellerId || '')) ||
      contacts.find((c) => c.id === selectedSellerId || c.name.trim().toLowerCase() === (selectedSellerId || '').trim().toLowerCase() || normalizeArabic(c.name) === normalizeArabic(selectedSellerId || '')) ||
      sellers[0]
    );
  }, [sellers, contacts, selectedSellerId]);

  const sellerTransactions = useMemo(() => {
    if (!selectedSeller) return [];
    const normId = selectedSeller.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedSeller.name);

    const sourceList = (sellerSpecificDate.trim() || sellerInvoiceQuery.trim() || (sellerDayFilter !== 'all' && timeframe === 'today'))
      ? transactions
      : filteredTransactions;

    return sourceList.filter((t) => {
      // Exclude lot resales from fishermen catch reports
      if (t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) return false;

      const sId = (t.sellerId || '').trim().toLowerCase();
      const sName = normalizeArabic(t.sellerName);
      const isSeller = (sId && sId === normId) || (normName && sName === normName);
      if (!isSeller) return false;

      // 1. Filter by Day of Week (0 = Sunday, 1 = Monday, ...)
      if (sellerDayFilter !== 'all') {
        const d = (t.timestamp && !isNaN(Number(t.timestamp)) && Number(t.timestamp) > 0)
          ? new Date(Number(t.timestamp))
          : parseLocalDate(t.dateStr);
        if (!d || isNaN(d.getTime()) || d.getDay().toString() !== sellerDayFilter) return false;
      }

      // 2. Filter by Specific Date (YYYY-MM-DD)
      if (sellerSpecificDate.trim()) {
        if (!isSameCalendarDay(t.timestamp || t.dateStr, sellerSpecificDate.trim())) return false;
      }

      // 3. Filter by Invoice / Transaction ID
      if (sellerInvoiceQuery.trim()) {
        const q = sellerInvoiceQuery.trim().toLowerCase();
        if (!t.id.toLowerCase().includes(q)) return false;
      }

      return true;
    });
  }, [transactions, filteredTransactions, timeframe, selectedSeller, sellerDayFilter, sellerSpecificDate, sellerInvoiceQuery]);

  const sellerMetrics = useMemo(() => {
    return sellerTransactions.reduce(
      (acc, t) => {
        acc.grossTotal += t.grossAmount;
        acc.deductionTotal += t.sellerTaxAmount;
        acc.netTotal += t.netToSeller;
        acc.count += 1;
        return acc;
      },
      { grossTotal: 0, deductionTotal: 0, netTotal: 0, count: 0 }
    );
  }, [sellerTransactions]);

  // Cumulative transactions for selected seller across all time
  const allSellerTransactions = useMemo(() => {
    if (!selectedSeller) return [];
    const normId = selectedSeller.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedSeller.name);
    return transactions.filter((t) => {
      const sId = (t.sellerId || '').trim().toLowerCase();
      const sName = normalizeArabic(t.sellerName);
      return (sId && sId === normId) || (normName && sName === normName);
    });
  }, [transactions, selectedSeller]);

  const allSellerNetTotal = useMemo(() => {
    return allSellerTransactions
      .filter((t) => t.settlementType !== 'direct_cash')
      .reduce((sum, t) => sum + t.netToSeller, 0);
  }, [allSellerTransactions]);

  // Cash disbursed directly at POS sales window (if explicitly paid at counter)
  const totalPaidAtPOS = useMemo(() => {
    return allSellerTransactions
      .filter((t) => t.settlementType !== 'direct_cash')
      .reduce((sum, t) => {
        if (t.sellerPaidStatus === 'unpaid') return sum;
        const posAmt = typeof t.paidAtPosAmount === 'number' ? t.paidAtPosAmount : 0;
        return sum + posAmt;
      }, 0);
  }, [allSellerTransactions]);

  // Payout receipts / vouchers issued to the selected fisherman
  const sellerPayouts = useMemo(() => {
    if (!selectedSeller) return [];
    const normId = selectedSeller.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedSeller.name);
    return (cashEntries || []).filter((e) => {
      if (e.type !== 'seller_payout') return false;
      const cId = (e.contactId || '').trim().toLowerCase();
      const cName = normalizeArabic(e.contactName);
      return (cId && cId === normId) || (normName && cName === normName);
    });
  }, [cashEntries, selectedSeller]);

  const totalSellerPayouts = useMemo(() => {
    return sellerPayouts.reduce((sum, p) => sum + p.amount, 0);
  }, [sellerPayouts]);

  // إذا كان هذا الصياد/البائع يشتري أيضاً أسماك كمشتري
  const sellerBuyerPurchasesCount = useMemo(() => {
    if (!selectedSeller) return 0;
    const normId = selectedSeller.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedSeller.name);
    return transactions.filter((t) => {
      const bId = (t.buyerId || '').trim().toLowerCase();
      const bName = normalizeArabic(t.buyerName);
      return (normId && (bId === normId || bName === normId)) ||
             (normName && (bName === normName || bId === normName));
    }).length;
  }, [transactions, selectedSeller]);

  // Remaining balance owed to the fisherman by the system/association (ديناً على الحراج)
  // Computed directly and accurately from transactions to prevent double-deduction or zero-balance bugs
  const remainingSellerBalance = useMemo(() => {
    if (!selectedSeller) return 0;
    return allSellerTransactions
      .filter((t) => t.settlementType !== 'direct_cash')
      .reduce((sum, t) => {
        if (t.sellerPaidStatus === 'paid') return sum;
        const paid = typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0);
        return sum + Math.max(0, t.netToSeller - paid);
      }, 0);
  }, [allSellerTransactions, selectedSeller]);

  // Seller Advances (سلف الصياد الجانبية دون ضريبة)
  const sellerAdvancesList = useMemo(() => {
    if (!selectedSeller) return [];
    const normId = selectedSeller.id.trim().toLowerCase();
    const normName = normalizeArabic(selectedSeller.name);
    return (cashEntries || []).filter((e) => {
      const match =
        (e.contactId && e.contactId.trim().toLowerCase() === normId) ||
        (e.contactName && normalizeArabic(e.contactName).includes(normName));
      return match && (e.type === 'seller_advance' || e.type === 'seller_advance_repayment');
    });
  }, [cashEntries, selectedSeller]);

  const totalSellerAdvancesOwed = useMemo(() => {
    let taken = 0;
    let repaid = 0;
    sellerAdvancesList.forEach((a) => {
      if (a.type === 'seller_advance') taken += a.amount;
      else if (a.type === 'seller_advance_repayment') repaid += a.amount;
    });
    return Math.max(0, taken - repaid);
  }, [sellerAdvancesList]);

  // Total cash handed over to fisherman across all transactions
  const totalSellerPaid = useMemo(() => {
    if (!selectedSeller) return 0;
    return allSellerTransactions
      .filter((t) => t.settlementType !== 'direct_cash')
      .reduce((sum, t) => {
        if (t.sellerPaidStatus === 'paid') return sum + t.netToSeller;
        const paid = typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0);
        return sum + paid;
      }, 0);
  }, [allSellerTransactions, selectedSeller]);

  // Unified history of all cash disbursements to the selected fisherman (POS sales payouts + separate payout vouchers)
  const allFishermanCashDisbursements = useMemo(() => {
    if (!selectedSeller) return [];

    // 1. Direct payouts at POS sales window (whether full guarantee or partial payout)
    const posDisbursements = sellerTransactions
      .filter((t) => t.settlementType !== 'direct_cash')
      .map((t) => {
        const paidAtPOS = t.sellerPaidStatus === 'unpaid'
          ? 0
          : (typeof t.paidAtPosAmount === 'number'
              ? t.paidAtPosAmount
              : (typeof t.sellerPaidAmount === 'number' ? t.sellerPaidAmount : 0));
        const currentTotalPaid = t.sellerPaidStatus === 'paid'
          ? t.netToSeller
          : (typeof t.sellerPaidAmount === 'number'
              ? t.sellerPaidAmount
              : (typeof t.paidAtPosAmount === 'number' ? t.paidAtPosAmount : 0));
        const remDebt = Math.max(0, t.netToSeller - currentTotalPaid);
        return {
          id: t.id,
          timestamp: t.timestamp,
          dateStr: t.dateStr,
          timeStr: t.timeStr,
          sourceType: 'pos_sale' as const,
          typeLabel:
            t.sellerPaidStatus === 'paid'
              ? paidAtPOS < t.netToSeller && paidAtPOS > 0
                ? 'تسليم جزئي عند البيع (تمت تصفيته لاحقاً ✓)'
                : 'تسليم فوري عند البيع ✓'
              : remDebt > 0 && paidAtPOS > 0
              ? 'تسليم جزئي عند البيع'
              : remDebt === 0
              ? 'تسليم فوري عند البيع ✓'
              : 'دين على الحراج',
          amount: paidAtPOS,
          totalDue: t.netToSeller,
          remainingForTrx: remDebt,
          description: `تسليم صافي قيمة مبيعات الأسماك (${t.items.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ')}) - المشتري: ${t.buyerName}`,
          officer: 'أمين الصندوق / الأساسي',
          rawTrx: t,
          rawCashEntry: undefined as CashEntry | undefined,
        };
      })
      .filter((d) => d.amount > 0);

    // 2. Separate cash payout vouchers
    const voucherDisbursements = sellerPayouts.map((p) => ({
      id: p.id,
      timestamp: p.timestamp,
      dateStr: p.dateStr,
      timeStr: p.timeStr,
      sourceType: 'payout_voucher' as const,
      typeLabel: 'سند صرف نقدية (سداد متبقي)',
      amount: p.amount,
      totalDue: p.amount,
      remainingForTrx: 0,
      description: p.description || 'سداد دفعة نقدية من المستحقات السابقة للصياد',
      officer: p.performedBy || 'أمين الصندوق',
      rawTrx: undefined as Transaction | undefined,
      rawCashEntry: p,
    }));

    // 3. Advance settlements & direct cash repayments
    const settlementDisbursements = (sellerAdvancesList || [])
      .filter((a) => a.type === 'seller_advance_repayment')
      .map((s) => {
        const isCashRepay = s.category === 'سداد سلفة صياد نقداً';
        return {
          id: s.id,
          timestamp: s.timestamp,
          dateStr: s.dateStr,
          timeStr: s.timeStr,
          sourceType: (isCashRepay ? 'advance_cash_repay' : 'advance_settlement') as
            | 'pos_sale'
            | 'payout_voucher'
            | 'advance_settlement'
            | 'advance_cash_repay',
          typeLabel: isCashRepay ? 'سند سداد سلفة نقداً (قبض صندوق)' : 'سند تسوية ومقاصة سلفة (خصم من المستحقات)',
          amount: s.amount,
          totalDue: s.amount,
          remainingForTrx: 0,
          description: s.description || (isCashRepay ? 'سداد سلفة صياد نقداً إلى الصندوق' : 'تسوية ومقاصة سلفة صياد بالخصم من مستحقات صيد'),
          officer: s.performedBy || 'أمين الصندوق',
          rawTrx: undefined as Transaction | undefined,
          rawCashEntry: s,
        };
      });

    return [...posDisbursements, ...voucherDisbursements, ...settlementDisbursements].sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedSeller, sellerTransactions, sellerPayouts, sellerAdvancesList]);

  const filteredDisbursements = useMemo(() => {
    if (disbursementFilter === 'vouchers') {
      return allFishermanCashDisbursements.filter((d) => d.sourceType === 'payout_voucher');
    }
    if (disbursementFilter === 'pos') {
      return allFishermanCashDisbursements.filter((d) => d.sourceType === 'pos_sale');
    }
    if (disbursementFilter === 'settlements') {
      return allFishermanCashDisbursements.filter(
        (d) => d.sourceType === 'advance_settlement' || d.sourceType === 'advance_cash_repay'
      );
    }
    return allFishermanCashDisbursements;
  }, [allFishermanCashDisbursements, disbursementFilter]);

  // Drawer Cash
  const currentCashDrawer = useMemo(() => {
    return Math.max(0, calculateDrawerCash(cashEntries || [], transactions, false, 0, Boolean(settings?.separateProfitsFromDrawerCash)).currentDrawerBalance);
  }, [cashEntries, transactions, settings?.separateProfitsFromDrawerCash]);

  const handlePrintStatement = () => {
    window.print();
  };

  const handleOpenPayoutForTransaction = (trx: Transaction, remDebt: number) => {
    setTargetTransactionForPayout(trx);
    setIsAdvanceSettlementEnabled(false);
    setAdvanceSettlementAmount('');
    setPayoutAmount(remDebt);
    setPayoutNotes(`تسليم وصرف مستحقات الفاتورة #${trx.id}`);
    setIsSubmittingPayout(false);
    setIsPayoutModalOpen(true);
  };

  const [reportsShareToast, setReportsShareToast] = useState<string | null>(null);

  const handleSaveCustomBuyerDebt = () => {
    if (!selectedBuyer) return;
    const newDebtNum = Math.max(0, Number(customBuyerRemainingDebtInput) || 0);
    const targetTrxs = allBuyerTransactions.length > 0 ? allBuyerTransactions : [];

    if (targetTrxs.length === 0) {
      alert('لا توجد شروات مسجلة لهذا المشتري لتعديل دينها');
      setIsEditBuyerDebtModalOpen(false);
      return;
    }

    if (selectedTrxForDebtEdit !== 'ALL') {
      const targetTrx = targetTrxs.find((t) => t.id === selectedTrxForDebtEdit);
      if (targetTrx && onUpdateTransaction) {
        const invTotal = targetTrx.totalFromBuyer || 0;
        const boundedDebt = Math.min(invTotal, newDebtNum);
        const newPaid = Math.max(0, invTotal - boundedDebt);
        const updatedTrx: Transaction = {
          ...targetTrx,
          buyerRemainingDebt: boundedDebt,
          buyerPaidAmount: newPaid,
          paidAtPosBuyerAmount: newPaid,
          settlementType: boundedDebt <= 0 ? 'association_cash' : 'partial_cash',
          paymentStatus: boundedDebt <= 0 ? 'paid' : 'pending',
          isEdited: true,
          editedAt: Date.now(),
          editedDateStr: formatGregorianDate(new Date()),
        };
        onUpdateTransaction(updatedTrx, false);
      }
    } else {
      let remainingDebtToAllocate = newDebtNum;
      const sorted = [...targetTrxs].sort((a, b) => {
        const aTs = Number(a.timestamp) || (a.dateStr ? new Date(a.dateStr.replace(/\//g, '-')).getTime() : 0);
        const bTs = Number(b.timestamp) || (b.dateStr ? new Date(b.dateStr.replace(/\//g, '-')).getTime() : 0);
        return bTs - aTs;
      });

      for (const t of sorted) {
        const invTotal = t.totalFromBuyer || 0;
        const allocDebt = Math.min(invTotal, remainingDebtToAllocate);
        remainingDebtToAllocate -= allocDebt;
        const newPaid = Math.max(0, invTotal - allocDebt);

        const updatedTrx: Transaction = {
          ...t,
          buyerRemainingDebt: allocDebt,
          buyerPaidAmount: newPaid,
          paidAtPosBuyerAmount: newPaid,
          settlementType: allocDebt <= 0 ? 'association_cash' : 'partial_cash',
          paymentStatus: allocDebt <= 0 ? 'paid' : 'pending',
          isEdited: true,
          editedAt: Date.now(),
          editedDateStr: formatGregorianDate(new Date()),
        };
        if (onUpdateTransaction) {
          onUpdateTransaction(updatedTrx, false);
        }
      }
    }

    setIsEditBuyerDebtModalOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Floating Share Toast */}
      {reportsShareToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] max-w-lg w-full bg-slate-900 text-white px-4 py-3 rounded-none shadow-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4 no-print">
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{reportsShareToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setReportsShareToast(null)}
            className="text-slate-400 hover:text-white font-black cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Report Type Switcher */}
      <div className="bg-white border border-slate-300 rounded-none p-2.5 sm:p-3 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-slate-300">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300">
            <button
              id="rep-tab-association"
              type="button"
              onClick={() => setReportType('association')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'association'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'association' ? { backgroundColor: '#030164' } : undefined}
            >
              <TrendingUp className="w-4 h-4" />
              <span>تقرير أرباح الجمعية والحراج</span>
            </button>
            <button
              id="rep-tab-buyer"
              type="button"
              onClick={() => setReportType('buyer')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'buyer'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'buyer' ? { backgroundColor: '#030164' } : undefined}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>كشف حساب المشتري (+2%)</span>
            </button>
            <button
              id="rep-tab-seller"
              type="button"
              onClick={() => setReportType('seller')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'seller'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'seller' ? { backgroundColor: '#030164' } : undefined}
            >
              <UserCheck className="w-4 h-4" />
              <span>كشف حساب الصياد (-3%)</span>
            </button>
            <button
              id="rep-tab-staff"
              type="button"
              onClick={() => setReportType('staff')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'staff'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'staff' ? { backgroundColor: '#030164' } : undefined}
            >
              <Users className="w-4 h-4" />
              <span>كشف حساب عمال وموظفي السوق</span>
            </button>
            <button
              id="rep-tab-office"
              type="button"
              onClick={() => setReportType('office')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'office'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'office' ? { backgroundColor: '#030164' } : undefined}
            >
              <Building2 className="w-4 h-4" />
              <span>كشف حساب المكتب</span>
            </button>
            <button
              id="rep-tab-transfers"
              type="button"
              onClick={() => setReportType('lot_transfers')}
              className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                reportType === 'lot_transfers'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              style={reportType === 'lot_transfers' ? { backgroundColor: '#030164' } : undefined}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>سجل حركات تحويل الشروات</span>
            </button>
          </div>

          {/* Timeframe selector (shown on non-buyer tabs; buyer tab has its own dedicated integrated header) */}
          {reportType !== 'buyer' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setTimeframe('today')}
                className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  timeframe === 'today' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('week')}
                className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  timeframe === 'week' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الأسبوع
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('month')}
                className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  timeframe === 'month' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الشهر
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('all')}
                className={`px-3 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  timeframe === 'all' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                جميع الفترات
              </button>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* REPORT 1: ASSOCIATION PROFIT & COMMISSION */}
        {/* ------------------------------------------------------------- */}
        {reportType === 'association' && (
          <div className="pt-4 space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-300 p-4 rounded-none shadow-xs">
                <span className="text-xs text-slate-500 font-semibold block mb-1">الإجمالي الأساسي</span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {formatCurrency(associationMetrics.totalTurnover, settings.currency)}
                </span>
                <span className="text-[11px] text-slate-400 block mt-1">
                  من {associationMetrics.count} صفقات مسجلة
                </span>
              </div>

              <div className="bg-blue-50/80 border border-blue-300 p-4 rounded-none shadow-xs">
                <span className="text-xs text-blue-900 font-bold block mb-1">عمولات المشترين (+2%) المحصلة</span>
                <span className="text-2xl font-black font-mono text-blue-700">
                  {formatCurrency(associationMetrics.buyerCommission, settings.currency)}
                </span>
                <span className="text-[11px] text-blue-600/70 block mt-1 font-medium">
                  إيراد إضافي من المشترين
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-300 p-4 rounded-none shadow-xs">
                <span className="text-xs text-slate-700 font-bold block mb-1">عمولات البائعين (-3%) المستقطعة</span>
                <span className="text-2xl font-black font-mono text-slate-800">
                  {formatCurrency(associationMetrics.sellerCommission, settings.currency)}
                </span>
                <span className="text-[11px] text-slate-500 block mt-1">
                  استقطاع خدمة الحراج
                </span>
              </div>

              <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white p-4 rounded-none shadow-sm">
                <span className="text-xs text-blue-100 block mb-1 font-bold">
                  إجمالي صافي أرباح الجمعية (5%)
                </span>
                <span className="text-3xl font-black font-mono text-white">
                  {formatCurrency(associationMetrics.totalAssociationProfit, settings.currency)}
                </span>
                <span className="text-[11px] text-blue-200 block mt-1">
                  2% مشتري + 3% بائع
                </span>
              </div>
            </div>

            {/* Fish Analytics Table */}
            <div className="bg-white border border-slate-300 rounded-none p-4 space-y-3 shadow-xs">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Fish className="w-4 h-4 text-blue-600" />
                  أكثر الأسماك تداولاً وحصداً للعمولات في الحراج
                </h3>
                <button
                  type="button"
                  onClick={handlePrintStatement}
                  className="px-3.5 py-1.5 rounded-none bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 border border-slate-300 shadow-xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-blue-600" />
                  <span>طباعة التقرير</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-none">
                <table className="w-full text-right text-xs">
                  <thead className="bg-blue-50/70 text-slate-700 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-3">نوع السمك</th>
                      <th className="p-3 text-center">إجمالي الكمية المباعة</th>
                      <th className="p-3 text-center">القيمة الإجمالية (Gross)</th>
                      <th className="p-3 text-center">حصة الجمعية (5%)</th>
                      <th className="p-3 text-center">نسبة المساهمة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {speciesAnalytics.map((sp, idx) => {
                      const sharePercent =
                        associationMetrics.totalTurnover > 0
                          ? ((sp.totalGross / associationMetrics.totalTurnover) * 100).toFixed(1)
                          : '0';
                      const associationShare = sp.totalGross * 0.05;

                      return (
                        <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                          <td className="p-3 font-bold text-slate-900">{sp.name}</td>
                          <td className="p-3 text-center font-mono text-slate-700">
                            {formatNumber(sp.totalQty)} {sp.unit}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-900">
                            {formatCurrency(sp.totalGross, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-blue-700">
                            {formatCurrency(associationShare, settings.currency)}
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2.5 py-0.5 rounded-none bg-slate-100 text-[11px] font-mono text-slate-700 border border-slate-300">
                              {sharePercent}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* REPORT 2: BUYER ACCOUNT STATEMENT */}
        {/* ------------------------------------------------------------- */}
        {reportType === 'buyer' && (
          <div className="pt-1 space-y-2.5">
            {/* Unified Sleek Command Center */}
            <div className="bg-white rounded-none border border-slate-300/90 shadow-sm overflow-hidden transition-all">
              {/* ROW 1: Buyer Search & Select (Right) + Timeframe Pills (Left) */}
              <div className="p-2 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2.5">
                {/* Search & Buyer Dropdown */}
                <div ref={reportsBuyerRef} className="relative flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white px-2.5 py-1.5 rounded-none border border-slate-300 shadow-2xs shrink-0">
                    <User className="w-3.5 h-3.5 text-blue-700" />
                    <span>البحث واختيار المشتري:</span>
                  </div>

                  <div className="relative min-w-[240px] sm:min-w-[280px]">
                    <input
                      type="text"
                      value={buyerSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBuyerSearchQuery(val);
                        setIsReportsBuyerDropdownOpen(true);
                        setHighlightedReportsBuyerIndex(0);
                        const match = buyers.find((b) => b.name.toLowerCase() === val.trim().toLowerCase());
                        if (match) setSelectedBuyerId(match.id);
                      }}
                      onFocus={() => setIsReportsBuyerDropdownOpen(true)}
                      onKeyDown={handleReportsBuyerKeyDown}
                      placeholder={selectedBuyer?.name ? `المشتري: ${selectedBuyer.name}` : "اكتب اسم المشتري أو رقم الهاتف..."}
                      className="w-full bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-none py-1.5 pr-8 pl-14 focus:ring-2 focus:ring-blue-500 shadow-2xs outline-none transition-all placeholder:text-slate-400 placeholder:font-normal"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      {buyerSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setBuyerSearchQuery('');
                            setHighlightedReportsBuyerIndex(-1);
                            setIsReportsBuyerDropdownOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="مسح البحث"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsReportsBuyerDropdownOpen((prev) => !prev)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                        title="عرض قائمة المشترين"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isReportsBuyerDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Floating Smart Dropdown */}
                    {isReportsBuyerDropdownOpen && (
                      <div className="absolute z-50 right-0 left-0 mt-1.5 bg-white border border-slate-300 rounded-none shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100">
                        {!buyerSearchQuery.trim() && visibleBuyersBySearch.length > 0 && (
                          <div className="px-3 py-1.5 bg-blue-50/70 border-b border-blue-300/50 text-[10px] text-blue-900 font-bold flex items-center justify-between">
                            <span>المشترون الأكثر نشاطاً مؤخراً:</span>
                            <span className="text-[9px] text-slate-500 font-normal">اختر أو ابحث بالاسم/الهاتف</span>
                          </div>
                        )}

                        {visibleBuyersBySearch.length > 0 ? (
                          <>
                            {visibleBuyersBySearch.map((b, idx) => {
                              const isSelected = selectedBuyerId === b.id;
                              const isHighlighted = highlightedReportsBuyerIndex === idx;
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedBuyerId(b.id);
                                    setBuyerSearchQuery(b.name);
                                    setIsReportsBuyerDropdownOpen(false);
                                    setHighlightedReportsBuyerIndex(-1);
                                  }}
                                  className={`w-full text-right px-3.5 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    isHighlighted
                                      ? 'bg-blue-100/90 text-blue-950 font-black'
                                      : isSelected
                                      ? 'bg-blue-50 text-blue-900 font-bold'
                                      : 'hover:bg-slate-50 text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                                    <span className="truncate">{b.name}</span>
                                  </div>
                                  {b.phone && (
                                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                                      📞 {b.phone}
                                    </span>
                                  )}
                                </button>
                              );
                            })}

                            {totalMatchingBuyers > visibleBuyersBySearch.length && (
                              <div className="p-2 bg-blue-50/50 border-t border-blue-300/50 text-center text-[10px] text-blue-900 font-bold">
                                يوجد {totalMatchingBuyers - visibleBuyersBySearch.length} مشتري آخر... تابع كتابة الاسم أو الهاتف لتضييق البحث
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-400">
                            لا يوجد مشتري مطابق لـ "{buyerSearchQuery}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Timeframe Selector Pills (اليوم, الأسبوع, الشهر, جميع الفترات) */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300 text-xs">
                  <button
                    type="button"
                    onClick={() => setTimeframe('today')}
                    className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all cursor-pointer ${
                      timeframe === 'today'
                        ? 'text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    style={timeframe === 'today' ? { backgroundColor: '#030164' } : undefined}
                  >
                    اليوم
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeframe('week')}
                    className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all cursor-pointer ${
                      timeframe === 'week'
                        ? 'text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    style={timeframe === 'week' ? { backgroundColor: '#030164' } : undefined}
                  >
                    الأسبوع
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeframe('month')}
                    className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all cursor-pointer ${
                      timeframe === 'month'
                        ? 'text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    style={timeframe === 'month' ? { backgroundColor: '#030164' } : undefined}
                  >
                    الشهر
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeframe('all')}
                    className={`px-3 py-1.5 rounded-none text-xs font-bold transition-all cursor-pointer ${
                      timeframe === 'all'
                        ? 'text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                    style={timeframe === 'all' ? { backgroundColor: '#030164' } : undefined}
                  >
                    جميع الفترات
                  </button>
                </div>
              </div>

              {/* ROW 2: Advanced Detailed Filters Strip */}
              <div className="py-1.5 px-2.5 bg-slate-50/80 border-b border-slate-300 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Day of Week */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>تحديد يوم الأسبوع:</span>
                    </span>
                    <select
                      id="rep-buyer-day-filter"
                      value={buyerDayFilter}
                      onChange={(e) => setBuyerDayFilter(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-900 font-bold rounded-none px-2 py-0.5 focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs shadow-2xs"
                    >
                      <option value="all">كافة أيام الأسبوع</option>
                      <option value="0">يوم الأحد</option>
                      <option value="1">يوم الإثنين</option>
                      <option value="2">يوم الثلاثاء</option>
                      <option value="3">يوم الأربعاء</option>
                      <option value="4">يوم الخميس</option>
                      <option value="5">يوم الجمعة</option>
                      <option value="6">يوم السبت</option>
                    </select>
                  </div>

                  {/* Specific Date */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-700">تاريخ محدد:</span>
                    <input
                      type="date"
                      value={buyerSpecificDate}
                      onChange={(e) => setBuyerSpecificDate(e.target.value)}
                      className="bg-white border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 text-xs shadow-2xs"
                    />
                  </div>

                  {/* Invoice / Lot Query */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-700">رقم الفاتورة / الشروة:</span>
                    <input
                      type="text"
                      value={buyerInvoiceQuery}
                      onChange={(e) => setBuyerInvoiceQuery(e.target.value)}
                      placeholder="مثال: TRX-..."
                      className="bg-white border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 w-32 font-mono text-xs shadow-2xs"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setBuyerTransactionScope('unpaid');
                          setBuyerDayFilter('all');
                          setBuyerSpecificDate('');
                          setBuyerInvoiceQuery('');
                        }}
                        className={`px-2 py-1 rounded-none border font-bold text-xs transition-colors ${
                          buyerTransactionScope === 'unpaid'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-red-700 border-red-200 hover:bg-red-50'
                        }`}
                      >
                        غير المسددة
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBuyerTransactionScope('all');
                          setBuyerDayFilter('all');
                          setBuyerSpecificDate('');
                          setBuyerInvoiceQuery('');
                          setTimeframe('all');
                        }}
                        className={`px-2 py-1 rounded-none border font-bold text-xs transition-colors flex items-center gap-1 ${
                          buyerTransactionScope === 'all'
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                        title="عرض كافة الشروات ومسح التصفية"
                      >
                        <X className="w-3 h-3" />
                        <span>الكل</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filter count & Reset */}
                {(buyerDayFilter !== 'all' || buyerSpecificDate || buyerInvoiceQuery) && (
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-none bg-blue-100 text-blue-800 text-[11px] font-bold">
                      تم حصر: {buyerTransactions.length} شروة
                      {allBuyerSalesTransactions.length > 0 ? ` | ${buyerSalesTransactions.length} بيعة` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBuyerDayFilter('all');
                        setBuyerSpecificDate('');
                        setBuyerInvoiceQuery('');
                      }}
                      className="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center gap-1 cursor-pointer bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-none transition-colors"
                    >
                      <X className="w-3 h-3" />
                      <span>إلغاء التصفية</span>
                    </button>
                  </div>
                )}
              </div>

              {/* ROW 3: Financial Action Buttons & Print (Organized Uniform 4-Button Grid) */}
              <div className="p-2 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
                  {/* 1. إدارة القدمة والسلف (دمج زر القدمة مع زر سلف المشتري) */}
                  <button
                    type="button"
                    onClick={() => {
                      setAdvanceModalInitialTab('advance');
                      setIsAdvanceModalOpen(true);
                    }}
                    className="h-9 px-3 rounded-none text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-[0.98] hover:opacity-90"
                    style={{ backgroundColor: '#030164' }}
                    title="إدارة رصيد القدمة (دفعة مقدمة / استرداد) وسلف المشتري (صرف / سداد)"
                  >
                    <Wallet className="w-3.5 h-3.5 text-white shrink-0" />
                    <span className="truncate">إدارة القدمة والسلف</span>
                    {selectedBuyerAdvanceStats.currentAdvanceBalance > 0 && (
                      <span className="px-1.5 py-0.5 rounded-none bg-emerald-500/40 text-[10px] font-mono text-white font-bold border border-emerald-400/40 shrink-0" title="رصيد القدمة">
                        {formatCurrency(selectedBuyerAdvanceStats.currentAdvanceBalance, '')}
                      </span>
                    )}
                    {selectedBuyerAvailableSurplus > 0 && (
                      <span className="px-1.5 py-0.5 rounded-none bg-purple-500/40 text-[10px] font-mono text-white font-bold border border-purple-400/40 shrink-0" title="فائض شروات متاح للاسترداد">
                        فائض: {formatCurrency(selectedBuyerAvailableSurplus, '')}
                      </span>
                    )}
                    {totalBuyerAdvancesOwed > 0 && (
                      <span className="px-1.5 py-0.5 rounded-none bg-amber-500/40 text-[10px] font-mono text-white font-bold border border-amber-400/40 shrink-0" title="سلف قائمة بذمة المشتري">
                        سلف: {formatCurrency(totalBuyerAdvancesOwed, '')}
                      </span>
                    )}
                  </button>

                  {/* 2. زر تسديد دين المشتري / مقاصة بيعات (دمج زر إجراء مقاصة بيعات مع تسديد دين المشتري) */}
                  <button
                    type="button"
                    onClick={() => {
                      setRepaymentSource(buyerPendingSalesDues > 0 && selectedBuyerDebt > 0 ? 'offset' : 'cash');
                      setRepayAmount('');
                      setRepayNotes(buyerPendingSalesDues > 0 && selectedBuyerDebt > 0 ? 'مقاصة مستحقات البيعات مع مديونية الشروات' : '');
                      setRepayExchangeName('');
                      setIsRepayModalOpen(true);
                    }}
                    className="h-9 px-3 rounded-none text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-[0.98] bg-rose-600 hover:bg-rose-700"
                    title="تسديد وتسوية مبالغ دين المشتري (نقداً / عبر الصرافة / من رصيد القدمة / مقاصة مع مستحقات البيعات)"
                  >
                    <Coins className="w-3.5 h-3.5 text-white shrink-0" />
                    <span className="truncate">تسديد دين المشتري / مقاصة</span>
                    {selectedBuyerDebt > 0 && (
                      <span className="px-1.5 py-0.5 rounded-none bg-white/20 text-[10px] font-mono text-white font-bold border border-white/20 shrink-0">
                        {formatCurrency(selectedBuyerDebt, '')}
                      </span>
                    )}
                    {buyerPendingSalesDues > 0 && (
                      <span className="px-1.5 py-0.5 rounded-none bg-purple-900/90 text-[10px] font-mono text-white font-bold border border-purple-400/40 shrink-0" title="مستحقات بيعات متاحة للمقاصة">
                        مقاصة: {formatCurrency(buyerPendingSalesDues, '')}
                      </span>
                    )}
                  </button>

                  {/* 3. زر شروة وبيعة */}
                  {settings.showBuyerResaleButton !== false && (
                    <button
                      type="button"
                      onClick={() => setIsBuyerSalesModalOpen(true)}
                      className="h-9 px-3 rounded-none text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-[0.98] hover:opacity-90"
                      style={{ backgroundColor: '#030164' }}
                      title="عرض سجل بيعات هذا المشتري لمشترين آخرين (شروة وبيعة)"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-white shrink-0" />
                      <span className="truncate">شروة و بيعة</span>
                      {buyerSalesTransactions.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-none bg-white/20 text-[10px] font-mono text-white font-bold border border-white/20 shrink-0">
                          {buyerSalesTransactions.length} بيعة
                        </span>
                      )}
                    </button>
                  )}

                  {/* 4. زر فاتورة المشتري A4 - لون أخضر غامق */}
                  <button
                    type="button"
                    onClick={() => handleOpenBuyerStatement('invoice')}
                    className="h-9 px-3 rounded-none text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 border border-emerald-900 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-[0.98]"
                    title="معاينة وطباعة فاتورة المشتري بصيغة A4 الرسمية المعترف بها"
                  >
                    <Printer className="w-3.5 h-3.5 text-white shrink-0" />
                    <span className="truncate">فاتورة المشتري</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Buyer KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="bg-white border border-slate-300 p-2.5 rounded-none shadow-xs">
                <span className="text-[11px] text-slate-500 font-semibold block mb-0.5">عدد الشروات</span>
                <span className="text-lg font-black font-mono text-slate-900">
                  {buyerMetrics.count}
                </span>
              </div>
              <div className="bg-white border border-slate-300 p-2.5 rounded-none shadow-xs">
                <span className="text-[11px] text-slate-500 font-semibold block mb-0.5">المشتريات الأساسية</span>
                <span className="text-lg font-black font-mono text-slate-900">
                  {formatCurrency(buyerMetrics.grossTotal, settings.currency)}
                </span>
              </div>
              <div className="bg-blue-50/80 border border-blue-300 p-2.5 rounded-none shadow-xs">
                <span className="text-[11px] text-blue-900 font-bold block mb-0.5">ضريبة وعمولة (+2%)</span>
                <span className="text-lg font-black font-mono text-blue-700">
                  +{formatCurrency(buyerMetrics.taxTotal, settings.currency)}
                </span>
              </div>
              <div className="bg-red-50/90 border border-red-200 p-2.5 rounded-none shadow-xs">
                <span className="text-[11px] text-red-900 block mb-0.5 font-bold">
                  إجمالي المطلوب نهائياً
                </span>
                <span className="text-lg font-black font-mono text-red-600">
                  {formatCurrency(buyerMetrics.finalTotal, settings.currency)}
                </span>
              </div>
              <div
                onClick={() => {
                  setCustomBuyerRemainingDebtInput(selectedBuyerDebt.toString());
                  setSelectedTrxForDebtEdit(allBuyerTransactions.length === 1 ? allBuyerTransactions[0].id : 'ALL');
                  setIsEditBuyerDebtModalOpen(true);
                }}
                className={`p-2.5 rounded-none border shadow-xs cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group relative ${
                  selectedBuyerDebt > 0
                    ? 'bg-amber-50 border-amber-300 hover:border-amber-400 hover:bg-amber-100/70'
                    : 'bg-slate-50 border-slate-300 hover:border-blue-300 hover:bg-blue-50/50'
                }`}
                title="انقر هنا لتعديل المبلغ المتبقي ديناً على المشتري مباشرة"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[11px] font-bold ${selectedBuyerDebt > 0 ? 'text-amber-950' : 'text-slate-600'}`}>
                    المتبقي عليه
                  </span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-white/90 px-1.5 py-0.5 rounded border border-blue-300 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Pencil className="w-3 h-3" />
                  </div>
                </div>
                <span className={`text-lg font-black font-mono block ${selectedBuyerDebt > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
                  {formatCurrency(selectedBuyerDebt, settings.currency)}
                </span>
                <span className="text-[9.5px] text-slate-400 font-medium block mt-0.5">
                  انقر لتعديل المتبقي
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-300 p-2.5 rounded-none shadow-xs">
                <span className="text-[11px] text-emerald-950 font-bold block mb-0.5 flex items-center justify-between">
                  <span>رصيد القدمة (المتاح)</span>
                  <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                </span>
                <span className="text-lg font-black font-mono text-emerald-700">
                  {formatCurrency(selectedBuyerAdvanceStats.currentAdvanceBalance, settings.currency)}
                </span>
              </div>
            </div>

            {/* Net Financial Standing Banner (صافي المركز المالي للمشتري) */}
            <div className={`py-2 px-3 rounded-none border flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-xs ${
              selectedBuyerAdvanceStats.currentAdvanceBalance > selectedBuyerDebt
                ? 'bg-emerald-500/10 border-emerald-300 text-emerald-950'
                : selectedBuyerDebt > selectedBuyerAdvanceStats.currentAdvanceBalance
                ? 'bg-amber-500/10 border-amber-300 text-amber-950'
                : 'bg-slate-100 border-slate-300 text-slate-800'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <ArrowRightLeft className="w-4 h-4 text-slate-700 shrink-0" />
                <span className="font-bold">صافي المركز المالي للمشتري:</span>
                {(() => {
                  const netAdvanceDiff = selectedBuyerAdvanceStats.currentAdvanceBalance - selectedBuyerDebt;
                  const totalSurplus = Math.max(0, netAdvanceDiff) + selectedBuyerAvailableSurplus;

                  if (netAdvanceDiff > 0 || totalSurplus > 0) {
                    return (
                      <span className="font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                        المشتري دائن (له فائض رصيد متاح: {formatCurrency(totalSurplus, settings.currency)})
                      </span>
                    );
                  } else if (selectedBuyerDebt > selectedBuyerAdvanceStats.currentAdvanceBalance) {
                    return (
                      <span className="font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        المشتري مدين (المتبقي ديناً على المشتري بعد احتساب القدمة: {formatCurrency(selectedBuyerDebt - selectedBuyerAdvanceStats.currentAdvanceBalance, settings.currency)})
                      </span>
                    );
                  } else {
                    return (
                      <span className="font-black text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-300">
                        الحساب المالي متوازن تماماً (0.00)
                      </span>
                    );
                  }
                })()}
                {selectedBuyerAvailableSurplus > 0 && selectedBuyerAdvanceStats.currentAdvanceBalance > 0 && (
                  <span className="font-black text-emerald-950 bg-emerald-100/90 border border-emerald-300 px-2.5 py-0.5 rounded-none flex items-center gap-1 shadow-2xs">
                    <span>فائض الشروات:</span>
                    <span className="font-mono text-emerald-800">+{formatCurrency(selectedBuyerAvailableSurplus, settings.currency)}</span>
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-600 font-mono">
                إجمالي القدمة المودعة: {formatCurrency(selectedBuyerAdvanceStats.totalDeposited, settings.currency)} | المستهلك بالشروات: {formatCurrency(selectedBuyerAdvanceStats.totalUsedInPOS, settings.currency)} | المسدد للديون: {formatCurrency(selectedBuyerAdvanceStats.totalUsedForDebt, settings.currency)}{selectedBuyerAvailableSurplus > 0 ? ` | فائض الشروات: ${formatCurrency(selectedBuyerAvailableSurplus, settings.currency)}` : ''}
              </div>
            </div>

            {/* Buyer Transactions Breakdown Table */}
            <div className="bg-white border border-slate-300 rounded-none overflow-x-auto shadow-xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-blue-50/70 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="py-2.5 px-3">رقم الفاتورة</th>
                    <th className="py-2.5 px-3">التاريخ والوقت</th>
                    <th className="py-2.5 px-3">الصياد</th>
                    <th className="py-2.5 px-3">الأسماك والكميات</th>
                    <th className="py-2.5 px-3 text-center">السعر</th>
                    <th className="py-2.5 px-3 text-center">ضريبة الأصناف</th>
                    <th className="py-2.5 px-3 text-center text-blue-900 bg-blue-100/60 font-black">إجمالي الضريبة</th>
                    <th className="py-2.5 px-3 text-center text-red-700 bg-red-50/70">المطلوب سداده</th>
                    <th className="py-2.5 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {buyerTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-400">
                        {buyerTransactionScope === 'unpaid'
                          ? 'لا توجد شروات غير مسددة لهذا المشتري.'
                          : 'لا توجد عمليات مسجلة لهذا المشتري في الفترة المحددة.'}
                      </td>
                    </tr>
                  ) : (
                    buyerTransactions.map((t) => {
                      const resoldInfo = getResoldDetails(t);
                      const isPaidInFull = !resoldInfo.isResold && (
                        t.paymentStatus === 'paid' ||
                        t.paymentStatus === 'settled' ||
                        (t.buyerRemainingDebt !== undefined && t.buyerRemainingDebt <= 0) ||
                        t.settlementType === 'association_cash' ||
                        t.settlementType === 'direct_cash'
                      );

                      const isPartial =
                        !resoldInfo.isResold &&
                        !isPaidInFull &&
                        t.buyerRemainingDebt !== undefined &&
                        t.buyerRemainingDebt > 0 &&
                        t.buyerRemainingDebt < t.totalFromBuyer;

                      return (
                        <tr key={t.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="p-3.5 font-mono font-bold text-blue-700">
                            <div>{t.id}</div>
                            {isTransferredTransaction(t) ? (
                              <span className="text-[10px] font-bold text-purple-700 block mt-0.5">
                                (محولة)
                              </span>
                            ) : t.isEdited ? (
                              <span className="text-[10px] font-bold text-amber-700 block mt-0.5">
                                تم التعديل
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3.5 text-slate-600 font-mono whitespace-nowrap">
                            <span className="font-bold text-slate-700">{getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}</span>
                            <span>{formatDisplayDate(t.timestamp, t.dateStr)}</span>
                            <span className="text-[10px] text-slate-400 mr-1.5 font-mono">{t.timeStr}</span>
                          </td>
                          <td className="p-3.5 text-slate-800 font-medium">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{t.sellerName}</span>
                              {(t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) && (
                                <span className="text-[10px] font-bold text-purple-700">
                                  (إعادة بيع شروة)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-600">
                            <div className="space-y-1">
                              {t.items.map((it, idx) => (
                                <div key={idx} className="flex flex-wrap items-center justify-between text-xs border-b border-slate-100 last:border-0 pb-0.5 gap-1">
                                  <span className="font-bold text-slate-800">{it.fishName}</span>
                                  <span className="font-mono text-slate-600">
                                    {it.quantity} {it.unit} × {formatCurrency(it.unitPrice, '')} = {formatCurrency(it.totalGross, settings.currency)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-mono font-bold text-slate-900">
                            {formatCurrency(t.grossAmount, settings.currency)}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="space-y-1">
                              {t.items.map((it, idx) => {
                                const taxRate = t.buyerTaxRate !== undefined ? t.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
                                const itemTax = it.totalGross * taxRate;
                                return (
                                  <div key={idx} className="flex items-center justify-between gap-1.5 text-xs font-mono border-b border-slate-100 last:border-0 pb-0.5">
                                    <span className="text-slate-600 font-sans text-xs truncate max-w-[70px]" title={it.fishName}>{it.fishName}:</span>
                                    <span className="font-bold text-blue-700">+{formatCurrency(itemTax, settings.currency)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-3.5 text-center font-mono font-black text-blue-700 bg-blue-50/40 text-xs">
                            +{formatCurrency(t.buyerTaxAmount, settings.currency)}
                          </td>
                          <td className={`p-3.5 text-center ${resoldInfo.isResold ? 'bg-purple-50/50' : isPaidInFull ? 'bg-emerald-50/40' : isPartial ? 'bg-amber-50/60' : 'bg-red-50/60'}`}>
                            {resoldInfo.isResold ? (
                              <div className="space-y-0.5 text-center">
                                <div className="font-mono font-black text-purple-900">
                                  {formatCurrency(t.totalFromBuyer, settings.currency)}
                                </div>
                                <div className="mt-1 space-y-0.5 text-center">
                                  <div className="text-[11px] font-bold text-purple-700">
                                    تمت التسوية بإعادة البيع ✓
                                  </div>
                                  <div className="text-[10px] text-purple-950 font-bold block">
                                    بيعت لـ: {resoldInfo.newBuyerName || 'مشتري آخر'}
                                  </div>
                                  {resoldInfo.newTransactionId && (
                                    <div className="text-[9px] text-slate-500 font-mono block">
                                      فاتورة جديدة #{resoldInfo.newTransactionId}
                                    </div>
                                  )}
                                  <div className="text-[9px] font-medium text-slate-600 block">
                                    حالة سداد الجديد:{' '}
                                    <b className={resoldInfo.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                                      {resoldInfo.paymentStatus === 'paid' ? 'مدفوع نقداً ✓' : 'آجل (دين عليه)'}
                                    </b>
                                  </div>
                                </div>
                              </div>
                            ) : isPaidInFull ? (
                              <div className="space-y-0.5">
                                <div className="font-mono font-black text-slate-800">
                                  {formatCurrency(t.totalFromBuyer, settings.currency)}
                                </div>
                                {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                  <div className="text-[10px] font-bold text-indigo-700 mt-0.5 block">
                                    خصم من القدمة: -{formatCurrency(t.buyerAdvanceUsed, settings.currency)}
                                  </div>
                                )}
                                <div className="text-[11px] font-bold text-emerald-700 mt-1">
                                  <span>{t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && t.buyerAdvanceUsed < t.totalFromBuyer ? 'تم سداد ما تبقى بالكامل ✓' : 'تم السداد بالكامل ✓'}</span>
                                </div>
                              </div>
                            ) : isPartial ? (
                              <div className="space-y-1">
                                {/* إجمالي الفاتورة الأصلية بلون هادئ وخافت */}
                                <div className="text-[10.5px] font-medium text-slate-500 font-mono" title="إجمالي الفاتورة الأصلية">
                                  <span>الأصل: {formatCurrency(t.totalFromBuyer, settings.currency)}</span>
                                </div>
                                {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                  <div className="text-[10px] font-bold text-indigo-700 block">
                                    خصم من القدمة: -{formatCurrency(t.buyerAdvanceUsed, settings.currency)}
                                  </div>
                                )}
                                <div className="text-[10px] font-bold text-amber-700">
                                  <span>سداد جزئي</span>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div className="font-mono font-black text-red-600">
                                  {formatCurrency(t.totalFromBuyer, settings.currency)}
                                </div>
                                {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                  <div className="text-[10px] font-bold text-indigo-700 mt-0.5 block">
                                    خصم من القدمة: -{formatCurrency(t.buyerAdvanceUsed, settings.currency)}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenReceipt(t, 'buyer')}
                              className="p-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                              title="طباعة فاتورة المشتري"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContext('buyer');
                                setEditingTransaction(t);
                              }}
                              className="p-1.5 rounded-none bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                              title="تعديل فاتورة المشتري"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setTransferringTransaction(t)}
                              className="p-1.5 rounded-none bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 cursor-pointer shadow-2xs transition-colors"
                              title="تحويل الشروة لمشتري آخر"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedTrxForDelete(t)}
                              className="p-1.5 rounded-none bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer shadow-2xs transition-colors"
                              title="حذف العملية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

            {/* إشعار ورابط انتقال لكشف حسابه كصياد/بائع عند وجود مبيعات */}
            {!settings?.enableBuyerFishSalesAndOffset && allBuyerSalesTransactions.length > 0 && (
              <div className="mt-4 p-3.5 bg-blue-50/80 border border-blue-300 rounded-none flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-none bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Fish className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">
                      هذا العميل مسجل أيضاً كصياد/بائع ولديه ({allBuyerSalesTransactions.length}) بيعة أسماك
                    </div>
                    <div className="text-[11px] text-slate-500">
                      حسابه ومبيعاته كبائع مفصولة تماماً ومتاحة في قسم كشف الصيادين والبائعين
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReportType('seller');
                    const sMatch = sellers.find((s) => normalizeArabic(s.name) === normalizeArabic(selectedBuyer?.name || ''));
                    if (sMatch) setSelectedSellerId(sMatch.id);
                  }}
                  className="px-3.5 py-1.5 bg-[#030164] hover:opacity-90 text-white rounded-none text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-2xs"
                >
                  <span>عرض كشف حسابه كصياد/بائع</span>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ─── جدول مبيعات وتوريد الأسماك الخاصة بهذا العميل (كبائع / صياد) - عند تفعيل الدمج فقط ─── */}
            {Boolean(settings?.enableBuyerFishSalesAndOffset) && allBuyerSalesTransactions.length > 0 && (
              <div className="space-y-2 mt-4">
                {/* شريط عنوان مبيعات البائع / الصياد */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-white border border-slate-300 rounded-none shadow-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="w-7 h-7 rounded-none bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-300 shadow-2xs">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <h4 className="font-black text-sm text-slate-800">
                      مبيعات {selectedBuyer?.name || ''}
                      {buyerSalesCustomFilterLabel ? (
                        <span className="text-xs font-bold text-blue-700 mr-1.5 font-sans">
                          ({buyerSalesCustomFilterLabel})
                        </span>
                      ) : null}
                    </h4>
                    <span className="text-xs font-bold font-mono px-2.5 py-0.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {buyerDayFilter !== 'all' || buyerSpecificDate.trim()
                        ? `صافي مستحق بيعات اليوم (${buyerSalesTransactions.length} بيعة): `
                        : 'صافي المستحق له: '}
                      {formatCurrency(
                        buyerDayFilter !== 'all' || buyerSpecificDate.trim()
                          ? buyerSalesMetrics.netTotal
                          : allBuyerSalesTransactions.reduce((s, t) => s + (t.netToSeller || 0), 0),
                        settings.currency
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* زر فاتورة خدمية A4 لمبيعات هذا العميل من الأسماك */}
                    <button
                      type="button"
                      onClick={() => handleOpenBuyerServiceInvoice()}
                      disabled={buyerSalesTransactions.length === 0}
                      className="h-8 px-3 rounded-none text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ backgroundColor: '#030164' }}
                      title={
                        buyerSalesTransactions.length === 0
                          ? 'لا توجد بيعات في اليوم المحدد لمعاينتها'
                          : 'معاينة وطباعة الفاتورة الخدمية الرسمية لمبيعات هذا العميل من الأسماك كبائع'
                      }
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-white shrink-0" />
                      <span className="truncate">فاتورة خدمية</span>
                      {buyerSalesTransactions.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-white/20 text-[10px] font-mono">
                          {buyerSalesTransactions.length}
                        </span>
                      )}
                    </button>

                    {/* زر إجراء مقاصة سريعة في رأس جدول المبيعات */}
                    {selectedBuyerDebt > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRepaymentSource('offset');
                          setRepayAmount(selectedBuyerDebt);
                          setRepayNotes('مقاصة مستحقات البيعات مع مديونية الشروات');
                          setIsRepayModalOpen(true);
                        }}
                        className="h-8 px-3 rounded-none text-xs font-bold text-white flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-[0.98] bg-purple-700 hover:bg-purple-800"
                        title="إجراء مقاصة وتسوية دين الشروات من صافي مبيعات الأسماك"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-white shrink-0" />
                        <span className="truncate">إجراء مقاصة سريعة ({formatCurrency(selectedBuyerDebt, settings.currency)})</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* جدول مبيعات العميل المطابق لجدول الشروات */}
                <div className="bg-white border border-slate-300 rounded-none overflow-x-auto shadow-xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-blue-50/70 text-slate-700 font-bold border-b border-slate-300">
                      <tr>
                        <th className="py-2.5 px-3">رقم الفاتورة</th>
                        <th className="py-2.5 px-3">التاريخ والوقت</th>
                        <th className="py-2.5 px-3">المشتري منه</th>
                        <th className="py-2.5 px-3">الأسماك والكميات</th>
                        <th className="py-2.5 px-3 text-center">السعر</th>
                        <th className="py-2.5 px-3 text-center">خصم العمولة</th>
                        <th className="py-2.5 px-3 text-center text-blue-900 bg-blue-100/60 font-black">إجمالي العمولة</th>
                        <th className="py-2.5 px-3 text-center text-emerald-800 bg-emerald-50/70 font-black">صافي المستحق (له)</th>
                        <th className="py-2.5 px-3 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {buyerSalesTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-slate-500 bg-slate-50/50">
                            <div className="flex flex-col items-center justify-center gap-2 py-3">
                              <div className="w-9 h-9 rounded-none bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shadow-2xs">
                                <AlertCircle className="w-5 h-5" />
                              </div>
                              <span className="font-bold text-slate-800 text-sm">
                                {buyerDayFilter !== 'all' || buyerSpecificDate.trim()
                                  ? 'لا توجد بيعات مسجلة لهذا المشتري في هذا اليوم المحدد.'
                                  : 'لا توجد بيعات مسجلة لهذا المشتري في الفترة المحددة.'}
                              </span>
                              {buyerDayFilter !== 'all' || buyerSpecificDate.trim() ? (
                                <p className="text-xs text-slate-400 font-medium max-w-md text-center">
                                  تم حصر شروات المشتري فقط لهذا اليوم، ولم يقم العميل بتوريد أو بيع أي أسماك في التاريخ المختار.
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        buyerSalesTransactions.map((st) => {
                        const isSellerPaid = st.sellerPaidStatus === 'paid' || (st.sellerPaidAmount !== undefined && st.sellerPaidAmount >= st.netToSeller);
                        return (
                          <tr key={st.id} className="hover:bg-blue-50/40 transition-colors">
                            {/* رقم الفاتورة */}
                            <td className="p-3.5 font-mono font-bold text-blue-700">
                              <div>{st.id.startsWith('#') ? st.id : `#${st.id}`}</div>
                              {st.isEdited ? (
                                <span className="text-[10px] font-bold text-amber-700 block mt-0.5">
                                  تم التعديل
                                </span>
                              ) : null}
                            </td>

                            {/* التاريخ والوقت */}
                            <td className="p-3.5 text-slate-600 font-mono whitespace-nowrap">
                              <span className="font-bold text-slate-700">
                                {getWeekdayName(st.timestamp, st.dateStr) ? `${getWeekdayName(st.timestamp, st.dateStr)}، ` : ''}
                              </span>
                              <span>{formatDisplayDate(st.timestamp, st.dateStr)}</span>
                              {st.timeStr && (
                                <span className="text-[10px] text-slate-400 mr-1.5 font-mono">{st.timeStr}</span>
                              )}
                            </td>

                            {/* المشتري منه */}
                            <td className="p-3.5 text-slate-800 font-medium">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span>{st.buyerName}</span>
                              </div>
                            </td>

                            {/* الأسماك والكميات */}
                            <td className="p-3.5 text-slate-600">
                              <div className="space-y-1">
                                {st.items.map((it, idx) => (
                                  <div key={idx} className="flex flex-wrap items-center justify-between text-xs border-b border-slate-100 last:border-0 pb-0.5 gap-1">
                                    <span className="font-bold text-slate-800">{it.fishName}</span>
                                    <span className="font-mono text-slate-600">
                                      {it.quantity} {it.unit} × {formatCurrency(it.unitPrice, '')} = {formatCurrency(it.totalGross, settings.currency)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* السعر */}
                            <td className="p-3.5 text-center font-mono font-bold text-slate-900">
                              {formatCurrency(st.grossAmount, settings.currency)}
                            </td>

                            {/* خصم العمولة */}
                            <td className="p-3.5 text-center">
                              <div className="space-y-1">
                                {st.items.map((it, idx) => {
                                  const taxRate = st.sellerTaxRate !== undefined ? st.sellerTaxRate : (settings.sellerTaxRate ?? 0.02);
                                  const itemTax = it.totalGross * taxRate;
                                  return (
                                    <div key={idx} className="flex items-center justify-between gap-1.5 text-xs font-mono border-b border-slate-100 last:border-0 pb-0.5">
                                      <span className="text-slate-600 font-sans text-xs truncate max-w-[70px]" title={it.fishName}>{it.fishName}:</span>
                                      <span className="font-bold text-rose-600">-{formatCurrency(itemTax, settings.currency)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>

                            {/* إجمالي العمولة */}
                            <td className="p-3.5 text-center font-mono font-black text-rose-600 bg-blue-50/40 text-xs">
                              -{formatCurrency(st.sellerTaxAmount, settings.currency)}
                            </td>

                            {/* صافي المستحق (له) */}
                            <td className={`p-3.5 text-center ${isSellerPaid ? 'bg-emerald-50/40' : 'bg-amber-50/60'}`}>
                              <div className="space-y-0.5">
                                <div className="font-mono font-black text-slate-800">
                                  +{formatCurrency(st.netToSeller, settings.currency)}
                                </div>
                                <div className={`text-[11px] font-bold mt-1 ${isSellerPaid ? 'text-emerald-700' : 'text-amber-700'}`}>
                                  <span>{isSellerPaid ? 'تم الصرف بالكامل ✓' : 'مستحق له (متاح للمقاصة)'}</span>
                                </div>
                              </div>
                            </td>

                            {/* الإجراءات */}
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenReceipt(st, 'seller')}
                                  className="p-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                                  title="طباعة فاتورة البيعة / الصرف"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingContext('seller');
                                    setEditingTransaction(st);
                                  }}
                                  className="p-1.5 rounded-none bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                                  title="تعديل فاتورة البيعة"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedTrxForDelete(st)}
                                  className="p-1.5 rounded-none bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer shadow-2xs transition-colors"
                                  title="حذف العملية"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                {selectedBuyerDebt > 0 && !isSellerPaid && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRepaymentSource('offset');
                                      setRepayAmount(Math.min(selectedBuyerDebt, st.netToSeller));
                                      setRepayNotes(`مقاصة مستحقات فاتورة بيعة #${st.id} مع مديونية الشروات`);
                                      setIsRepayModalOpen(true);
                                    }}
                                    className="p-1.5 rounded-none bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 cursor-pointer shadow-2xs transition-colors"
                                    title="إجراء مقاصة لهذه البيعة مع مديونية الشروات"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}



            {/* Unified Buyer Financial Ledger (سجل وسندات العمليات المالية ورصيد القدمة) */}
            <div className="bg-white border border-slate-300 rounded-none overflow-hidden shadow-xs space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-none bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-900">
                      سجل وحركات العمليات المالية ورصيد القدمة للمشتري ({selectedBuyer?.name})
                    </h4>
                    <span className="text-xs text-slate-400">
                      سجل شامل لكل المبالغ والعمليات المالية للمشتري: (سندات القبض والسداد + حركات رصيد القدمة والعربون)
                    </span>
                  </div>
                </div>

                {/* Filter tabs and Quick Action buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-none border border-slate-300 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setBuyerFinancialTab('all')}
                      className={`px-3 py-1.5 rounded-none transition-all cursor-pointer ${
                        buyerFinancialTab === 'all'
                          ? 'bg-white text-indigo-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      كافة الحركات ({buyerRepayments.length + buyerAdvanceLedger.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuyerFinancialTab('repayments')}
                      className={`px-3 py-1.5 rounded-none transition-all cursor-pointer ${
                        buyerFinancialTab === 'repayments'
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      سندات السداد والتحصيل ({buyerRepayments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBuyerFinancialTab('advances')}
                      className={`px-3 py-1.5 rounded-none transition-all cursor-pointer ${
                        buyerFinancialTab === 'advances'
                          ? 'bg-white text-blue-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      حركات ورصيد القدمة ({buyerAdvanceLedger.length})
                    </button>
                  </div>

                  <span className="px-3 py-1.5 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold font-mono">
                    إجمالي المسدد: {formatCurrency(totalBuyerRepayments, settings.currency)}
                  </span>
                  <span className="px-3 py-1.5 rounded-none bg-blue-50 text-blue-800 border border-blue-300 text-xs font-bold font-mono">
                    القدمة المتاحة: {formatCurrency(selectedBuyerAdvanceStats.currentAdvanceBalance, settings.currency)}
                  </span>

                  <button
                    type="button"
                    onClick={() => setIsAdvanceModalOpen(true)}
                    className="px-3 py-1.5 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                    title="تسجيل سلفة / دفعة جديدة للمشتري"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>سلفة / دفعة جديدة</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-3">رقم السند</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">نوع الحركة والتصنيف</th>
                      <th className="p-3 text-center">المبلغ</th>
                      <th className="p-3">البيان / التفاصيل</th>
                      <th className="p-3 text-center">المحصل / أمين الصندوق</th>
                      <th className="p-3 text-center">طباعة السند</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {combinedBuyerFinancialEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-bold">لا توجد حركات مالية مسجلة لهذا المشتري في هذا السجل</p>
                        </td>
                      </tr>
                    ) : (
                      combinedBuyerFinancialEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="p-3 font-mono font-bold text-indigo-700">{entry.id}</td>
                          <td className="p-3 text-slate-600 font-mono whitespace-nowrap">
                            <span className="font-bold text-slate-700">
                              {getWeekdayName(entry.timestamp, entry.dateStr) ? `${getWeekdayName(entry.timestamp, entry.dateStr)}، ` : ''}
                            </span>
                            <span>{formatDisplayDate(entry.timestamp, entry.dateStr)}</span>
                            <span className="text-[10px] text-slate-400 mr-1.5 font-mono">{entry.timeStr}</span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold ${
                                entry.badgeType === 'repayment'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : entry.badgeType === 'deposit'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-300'
                                  : entry.badgeType === 'refund'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {entry.badgeLabel}
                            </span>
                          </td>
                          <td className="p-3 text-center font-mono font-black text-slate-900 bg-slate-50/50 whitespace-nowrap">
                            {formatCurrency(entry.amount, settings.currency)}
                          </td>
                          <td className="p-3 text-slate-700 font-medium">
                            {entry.description || '-'}
                          </td>
                          <td className="p-3 text-center text-slate-600">
                            {entry.performedBy || 'أمين الصندوق'}
                          </td>
                          <td className="p-3 text-center">
                            {entry.rawRepayment ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedRepaymentForPrint(entry.rawRepayment!)}
                                  className="p-1.5 rounded-none bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-pointer shadow-2xs transition-colors"
                                  title="طباعة سند القبض (حراري 80mm أو رسمي A4)"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                {onUpdateCashEntry && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditRepayment(entry.rawRepayment!)}
                                    className="p-1.5 rounded-none bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                                    title="تعديل مبلغ وبيان هذا السند"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onDeleteCashEntry && (
                                  <button
                                    type="button"
                                    onClick={() => setRepaymentToCancel(entry.rawRepayment!)}
                                    className="p-1.5 rounded-none bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer shadow-2xs transition-colors"
                                    title="إلغاء هذا السند وإرجاع المبلغ ديناً على المشتري"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* REPORT 3: SELLER / FISHERMAN STATEMENT */}
        {/* ------------------------------------------------------------- */}
        {reportType === 'seller' && (
          <div className="pt-4 space-y-4">
            {/* Seller Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-none border border-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-bold text-slate-800">اختر الصياد:</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="بحث سريع عن صياد..."
                    value={sellerSearchQuery}
                    onChange={(e) => setSellerSearchQuery(e.target.value)}
                    className="pr-8 pl-3 py-1.5 rounded-none bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
                  />
                </div>
                <select
                  id="rep-seller-select"
                  value={selectedSellerId}
                  onChange={(e) => setSelectedSellerId(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-900 text-xs font-bold rounded-none p-2 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs min-w-[180px]"
                >
                  {filteredSellersBySearch.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetTransactionForPayout(null);
                    const catchDues = remainingSellerBalance;
                    const advancesOwed = totalSellerAdvancesOwed;

                    if (advancesOwed > 0 && catchDues > 0) {
                      // Automatically offer full or maximum possible advance settlement
                      const suggestedSettlement = Math.min(advancesOwed, catchDues);
                      setIsAdvanceSettlementEnabled(true);
                      setAdvanceSettlementAmount(suggestedSettlement);
                      const netCashNeeded = Math.max(0, catchDues - suggestedSettlement);
                      // Always prefill with full net cash due
                      setPayoutAmount(netCashNeeded);
                    } else {
                      setIsAdvanceSettlementEnabled(false);
                      setAdvanceSettlementAmount('');
                      setPayoutAmount(Math.max(0, catchDues));
                    }
                    setPayoutNotes('');
                    setIsSubmittingPayout(false);
                    setIsPayoutModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-none text-xs font-bold text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#030164' }}
                >
                  <HandCoins className="w-3.5 h-3.5" />
                  <span>تسليم / صرف مستحقات للصياد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSellerAdvanceUnifiedTab(totalSellerAdvancesOwed > 0 ? 'repay' : 'give');
                    setSellerAdvanceAmount('');
                    setSellerAdvanceNotes('');
                    setSellerRepayAmount(totalSellerAdvancesOwed > 0 ? totalSellerAdvancesOwed : '');
                    setSellerRepayNotes('');
                    setIsSellerAdvanceUnifiedModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-none text-xs font-bold text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#030164' }}
                  title="إدارة سلف الصياد: صرف سلفة نقدية جديدة أو سداد سلفة قائمة نقداً"
                >
                  <HandCoins className="w-3.5 h-3.5" />
                  <span>إدارة السلف (صرف / سداد)</span>
                  {totalSellerAdvancesOwed > 0 && (
                    <span className="px-1.5 py-0.5 rounded-none bg-white/20 text-[10px] font-mono text-white font-bold border border-white/20 shrink-0">
                      سلفة: {formatCurrency(totalSellerAdvancesOwed, '')}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettlementModalPrintMode('official');
                    setIsSettlementModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-none text-xs font-bold text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: '#030164' }}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة إشعار تصفية الصياد</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSettlementModalPrintMode('service');
                    setIsSettlementModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-none text-xs font-bold text-white flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:opacity-90 active:scale-[0.98] bg-indigo-700 hover:bg-indigo-800"
                  title="فتح ومعاينة الفاتورة الخدمية الرسمية للصياد مباشرة وفق النموذج المعتمد"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>فاتورة خدمية</span>
                </button>

              </div>
            </div>

            {/* Advanced Filters for Fisherman: Day of Week, Specific Date, Invoice No. */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-none border border-blue-300 text-xs shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Day of Week */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>تحديد يوم الأسبوع:</span>
                  </span>
                  <select
                    id="rep-seller-day-filter"
                    value={sellerDayFilter}
                    onChange={(e) => setSellerDayFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs"
                  >
                    <option value="all">كافة أيام الأسبوع</option>
                    <option value="0">يوم الأحد</option>
                    <option value="1">يوم الإثنين</option>
                    <option value="2">يوم الثلاثاء</option>
                    <option value="3">يوم الأربعاء</option>
                    <option value="4">يوم الخميس</option>
                    <option value="5">يوم الجمعة</option>
                    <option value="6">يوم السبت</option>
                  </select>
                </div>

                {/* Specific Date */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">تاريخ محدد:</span>
                  <input
                    type="date"
                    value={sellerSpecificDate}
                    onChange={(e) => setSellerSpecificDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>

                {/* Invoice No */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">رقم الفاتورة / الشروة:</span>
                  <input
                    type="text"
                    value={sellerInvoiceQuery}
                    onChange={(e) => setSellerInvoiceQuery(e.target.value)}
                    placeholder="مثال: TRX-..."
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 w-32 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Active Filter Badges and Reset Button */}
              {(sellerDayFilter !== 'all' || sellerSpecificDate || sellerInvoiceQuery) && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-none bg-blue-100 text-blue-800 text-[11px] font-bold">
                    تم حصر: {sellerTransactions.length} شروة
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSellerDayFilter('all');
                      setSellerSpecificDate('');
                      setSellerInvoiceQuery('');
                    }}
                    className="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center gap-1 cursor-pointer bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-none transition-colors"
                  >
                    <X className="w-3 h-3" />
                    <span>إلغاء التصفية</span>
                  </button>
                </div>
              )}
            </div>

            {/* Seller KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white border border-slate-300 p-3.5 rounded-none shadow-xs">
                <span className="text-[11px] text-slate-500 font-semibold block mb-1">دفعات الصيد المباعة</span>
                <span className="text-xl font-black font-mono text-slate-900">
                  {sellerMetrics.count}
                </span>
              </div>
              <div className="bg-white border border-slate-300 p-3.5 rounded-none shadow-xs">
                <span className="text-[11px] text-slate-500 font-semibold block mb-1">إجمالي المبيعات (البيع)</span>
                <span className="text-xl font-black font-mono text-slate-900">
                  {formatCurrency(sellerMetrics.grossTotal, settings.currency)}
                </span>
              </div>
              <div className="bg-red-50/70 border border-red-200 p-3.5 rounded-none shadow-xs">
                <span className="text-[11px] text-red-900 font-bold block mb-1">خصم عمولة الحراج (-3%)</span>
                <span className="text-xl font-black font-mono text-red-600">
                  -{formatCurrency(sellerMetrics.deductionTotal, settings.currency)}
                </span>
              </div>
              <div className="bg-blue-50/80 border border-blue-300 p-3.5 rounded-none shadow-xs">
                <span className="text-[11px] text-blue-900 block mb-1 font-bold">
                  صافي المستحق الكلي للصياد
                </span>
                <span className="text-xl font-black font-mono text-blue-700">
                  {formatCurrency(sellerMetrics.netTotal, settings.currency)}
                </span>
              </div>
              <div className="bg-emerald-50/80 border border-emerald-200 p-3.5 rounded-none shadow-xs">
                <span className="text-[11px] text-emerald-900 block mb-1 font-bold">
                  إجمالي المسلم له نقداً
                </span>
                <span className="text-xl font-black font-mono text-emerald-700">
                  {formatCurrency(totalSellerPaid, settings.currency)}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">
                  ({sellerPayouts.length > 0 ? `${sellerPayouts.length} سند صرف + ` : ''}بضمانة الجمعية)
                </span>
              </div>
              <div className={`p-3.5 rounded-none shadow-xs border ${
                remainingSellerBalance > 0
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-emerald-600 text-white border-emerald-700'
              }`}>
                <span className={`text-[11px] block mb-1 font-bold ${
                  remainingSellerBalance > 0 ? 'text-amber-900' : 'text-emerald-100'
                }`}>
                  المتبقي للصياد ديناً على الحراج
                </span>
                <span className={`text-xl font-black font-mono ${
                  remainingSellerBalance > 0 ? 'text-amber-700' : 'text-white'
                }`}>
                  {formatCurrency(remainingSellerBalance, settings.currency)}
                </span>
                <span className="text-[10px] block mt-0.5 font-bold">
                  {remainingSellerBalance > 0 ? 'دين مستحق للصياد' : 'تمت التصفية بالكامل ✓'}
                </span>
              </div>
            </div>

            {/* If seller has side advances, display an alert banner */}
            {totalSellerAdvancesOwed > 0 && (
              <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-none flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-amber-950 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>
                    تنبيه سلفة: يوجد على هذا الصياد سلف نقدية جانبية مستحقة للجمعية بمقدار:{' '}
                    <span className="font-mono text-sm font-black text-amber-900">
                      {formatCurrency(totalSellerAdvancesOwed, settings.currency)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSellerRepayAmount(totalSellerAdvancesOwed);
                      setSellerRepayNotes('');
                      setIsRepaySellerAdvanceModalOpen(true);
                    }}
                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-none text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                  >
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>سداد نقدي للصندوق</span>
                  </button>
                  <span className="text-[11px] text-amber-800 font-semibold">
                    (سلفة جانبية مقيدة في الذمة بدون ضريبة)
                  </span>
                </div>
              </div>
            )}

            {/* إشعار ورابط انتقال لكشف حسابه كمشتري عند وجود شروات */}
            {sellerBuyerPurchasesCount > 0 && (
              <div className="mb-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-none flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-none bg-amber-600 text-white flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-800">
                      هذا العميل مسجل أيضاً كمشتري ولديه ({sellerBuyerPurchasesCount}) شروة مشتريات
                    </div>
                    <div className="text-[11px] text-slate-500">
                      حسابه كمشتري منفصل تماماً ويحتوي على شرواته ومديونياته
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReportType('buyer');
                    const bMatch = buyers.find((b) => normalizeArabic(b.name) === normalizeArabic(selectedSeller?.name || ''));
                    if (bMatch) setSelectedBuyerId(bMatch.id);
                  }}
                  className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-none text-xs font-bold flex items-center gap-2 cursor-pointer transition-all shadow-2xs"
                >
                  <span>عرض كشف حسابه كمشتري</span>
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Seller Transactions Breakdown Table */}
            <div className="bg-white border border-slate-300 rounded-none overflow-x-auto shadow-xs">
              <div className="p-3 bg-slate-50 border-b border-slate-300 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Fish className="w-4 h-4 text-blue-600" />
                  <span>عمليات وشروات بيع الصيد ({sellerTransactions.length} عملية):</span>
                </span>
                <span className="text-[11px] text-slate-500 font-bold">
                  الفترة المحددة: {timeframe === 'today' ? 'اليوم' : timeframe === 'week' ? 'أسبوع' : timeframe === 'month' ? 'شهر' : 'الكل'}
                </span>
              </div>
              <table className="w-full text-right text-xs">
                <thead className="bg-blue-50/70 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-3">رقم العملية</th>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">المشتري</th>
                    <th className="p-3">الأسماك المباعة</th>
                    <th className="p-3 text-center">قيمة البيع</th>
                    <th className="p-3 text-center">الخصم (-3%)</th>
                    <th className="p-3 text-center">الصافي للصياد</th>
                    <th className="p-3 text-center">المسلّم نقداً للصياد</th>
                    <th className="p-3 text-center">المتبقي ديناً على الحراج</th>
                    <th className="p-3 text-center">حالة الاستلام</th>
                    <th className="p-3 text-center">إيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sellerTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-slate-400">
                        لا توجد عمليات مسجلة لهذا الصياد في الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    sellerTransactions.map((t) => {
                      const paidAmount = t.sellerPaidStatus === 'paid'
                        ? t.netToSeller
                        : (typeof t.sellerPaidAmount === 'number'
                            ? t.sellerPaidAmount
                            : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0));
                      const remainingDebt = Math.max(0, t.netToSeller - paidAmount);
                      return (
                        <tr key={t.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-blue-700">
                            <div>{t.id}</div>
                            {isTransferredTransaction(t) ? (
                              <span className="text-[10px] font-bold text-purple-700 block mt-0.5">
                                (محولة)
                              </span>
                            ) : t.isEdited ? (
                              <span className="text-[10px] font-bold text-amber-700 block mt-0.5">
                                تم التعديل
                              </span>
                            ) : null}
                          </td>
                          <td className="p-3 text-slate-600 font-mono whitespace-nowrap">
                            <span className="font-bold text-slate-700">{getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}</span>
                            <span>{formatDisplayDate(t.timestamp, t.dateStr)}</span>
                            <span className="text-[10px] text-slate-400 mr-1.5 font-mono">{t.timeStr}</span>
                          </td>
                          <td className="p-3 text-slate-800 font-medium">{t.buyerName}</td>
                          <td className="p-3 text-slate-600">
                            {t.items.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ')}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-slate-900">
                            {formatCurrency(t.grossAmount, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-red-600">
                            -{formatCurrency(t.sellerTaxAmount, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-slate-900">
                            {formatCurrency(t.netToSeller, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                            {formatCurrency(paidAmount, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono font-bold">
                            {remainingDebt > 0 ? (
                              <span className="text-amber-900 font-bold font-mono">
                                {formatCurrency(remainingDebt, settings.currency)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0 (خالص)</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {remainingDebt <= 0 ? (
                              <span className="text-[11px] font-bold text-emerald-700 whitespace-nowrap">
                                مسلّم بالكامل ✓
                              </span>
                            ) : paidAmount > 0 ? (
                              <span className="text-[11px] font-bold text-amber-700 whitespace-nowrap">
                                مسلم جزئياً ({formatCurrency(paidAmount, settings.currency)})
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-800 whitespace-nowrap">
                                دين على الحراج (غير مسلّم)
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {remainingDebt > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenPayoutForTransaction(t, remainingDebt)}
                                  className="px-2.5 py-1 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors text-[11px] whitespace-nowrap"
                                  title="تسليم وصرف مستحقات هذه الفاتورة للصياد نقداً"
                                >
                                  <HandCoins className="w-3.5 h-3.5" />
                                  <span>صرف المستحقات ({formatCurrency(remainingDebt, '')})</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenReceipt(t, 'seller')}
                                className="p-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                                title="طباعة إشعار صرف البائع (الصياد)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContext('seller');
                                  setEditingTransaction(t);
                                }}
                                className="p-1.5 rounded-none bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                                title="تعديل فاتورة الصياد"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTransferringTransaction(t)}
                                className="p-1.5 rounded-none bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 cursor-pointer shadow-2xs transition-colors"
                                title="تحويل الشروة لمشتري آخر"
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedTrxForDelete(t)}
                                className="p-1.5 rounded-none bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 cursor-pointer shadow-2xs transition-colors"
                                title="حذف العملية"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* Fisherman Payouts Breakdown Table (سجل وسندات عمليات صرف وتسليم مستحقات الصياد المالية) */}
            <div className="bg-white border border-slate-300 rounded-none overflow-hidden shadow-xs space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-900">
                      سجل وحركات تسليم المبالغ النقدية للصياد (كافة الدفعات المسلّمة)
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      سجل شامل لكل المبالغ المسلّمة للصياد: {selectedSeller?.name} (عند البيع بضمانة الجمعية + سندات الصرف)
                    </span>
                  </div>
                </div>

                {/* Filter buttons and Totals */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-none border border-slate-300 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => setDisbursementFilter('all')}
                      className={`px-2.5 py-1 rounded-none transition-all cursor-pointer ${
                        disbursementFilter === 'all'
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      كافة المسلّمات ({allFishermanCashDisbursements.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisbursementFilter('pos')}
                      className={`px-2.5 py-1 rounded-none transition-all cursor-pointer ${
                        disbursementFilter === 'pos'
                          ? 'bg-white text-blue-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      تسليمات البيع بضمانة الجمعية ({allFishermanCashDisbursements.filter((d) => d.sourceType === 'pos_sale').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisbursementFilter('vouchers')}
                      className={`px-2.5 py-1 rounded-none transition-all cursor-pointer ${
                        disbursementFilter === 'vouchers'
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      سندات الصرف النقدية ({sellerPayouts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisbursementFilter('settlements')}
                      className={`px-2.5 py-1 rounded-none transition-all cursor-pointer ${
                        disbursementFilter === 'settlements'
                          ? 'bg-purple-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      سندات سداد ومقاصة السلف ({allFishermanCashDisbursements.filter((d) => d.sourceType === 'advance_settlement' || d.sourceType === 'advance_cash_repay').length})
                    </button>
                  </div>

                  <span className="px-3 py-1 rounded-none bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold font-mono">
                    إجمالي المسلّم له: {formatCurrency(totalSellerPaid, settings.currency)}
                  </span>
                  {remainingSellerBalance > 0 ? (
                    <span className="px-3 py-1 rounded-none bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold font-mono">
                      متبقي له ديناً على النظام: {formatCurrency(remainingSellerBalance, settings.currency)}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-none bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold">
                      تمت التصفية بالكامل ✓
                    </span>
                  )}

                  {/* Quick Print Buttons for Fisherman Disbursements: Thermal 80mm & Official A4 */}
                  <div className="flex items-center gap-1.5 mr-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenDisbursementsModal('thermal')}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:scale-105"
                      title="طباعة إيصال حراري فوري (80mm) لجدول المسلّمات المالي للصياد"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-300" />
                      <span>طباعة حرارية (80mm)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDisbursementsModal('official')}
                      className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:scale-105"
                      title="طباعة كشف مالي رسمي كامل A4 لجدول المسلّمات المالي للصياد"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة كشف A4</span>
                    </button>

                    <ShareOptionsDropdown
                      id="rep-disbursements-table-share-btn"
                      onShare={() => handleOpenDisbursementsModal('official')}
                      buttonLabel="مشاركة ⋮"
                      buttonClassName="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-none text-xs font-bold flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                      menuTitle="مشاركة كشف مسلّمات الصياد (PDF)"
                      tooltip="خيارات مشاركة كشف مسلّمات الصياد (تطبيق LocalSend، البلوتوث، تطبيقات ويندوز، نسخ الملف)"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-emerald-50/70 text-slate-700 font-bold border-b border-emerald-200/60">
                    <tr>
                      <th className="p-3">رقم السند / الحركة</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3 text-center">نوع حركة التسليم</th>
                      <th className="p-3 text-center">المبلغ المسلّم / المقاص</th>
                      <th className="p-3">البيان / تفاصيل التسليم</th>
                      <th className="p-3 text-center">المحصل / أمين الصندوق</th>
                      <th className="p-3 text-center">طباعة الإيصال / السند</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredDisbursements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-slate-400">
                          لا توجد مبالغ مسجلة مسلّمة لهذا الصياد في هذا التصنيف.
                        </td>
                      </tr>
                    ) : (
                      filteredDisbursements.map((d) => (
                        <tr key={`${d.sourceType}-${d.id}`} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="p-3 font-mono font-bold text-emerald-700">{d.id}</td>
                          <td className="p-3 text-slate-600 font-mono">
                            {d.dateStr} - {d.timeStr}
                          </td>
                          <td className="p-3 text-center">
                            {d.sourceType === 'pos_sale' ? (
                              <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300 whitespace-nowrap">
                                {d.typeLabel}
                              </span>
                            ) : d.sourceType === 'advance_settlement' ? (
                              <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200 whitespace-nowrap inline-flex items-center gap-1">
                                <Scale className="w-3 h-3 text-purple-700" />
                                <span>{d.typeLabel}</span>
                              </span>
                            ) : d.sourceType === 'advance_cash_repay' ? (
                              <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-200 whitespace-nowrap inline-flex items-center gap-1">
                                <ArrowDownLeft className="w-3 h-3 text-teal-700" />
                                <span>{d.typeLabel}</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-none text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 whitespace-nowrap">
                                {d.typeLabel}
                              </span>
                            )}
                          </td>
                          <td className={`p-3 text-center font-mono font-black ${
                            d.sourceType === 'advance_settlement'
                              ? 'text-purple-900 bg-purple-50/50'
                              : d.sourceType === 'advance_cash_repay'
                              ? 'text-teal-900 bg-teal-50/50'
                              : 'text-emerald-800 bg-emerald-50/50'
                          }`}>
                            {formatCurrency(d.amount, settings.currency)}
                          </td>
                          <td className="p-3 text-slate-700 font-medium">
                            {d.description}
                          </td>
                          <td className="p-3 text-center text-slate-600">
                            {d.officer}
                          </td>
                          <td className="p-3 text-center">
                            {d.rawCashEntry ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (d.sourceType === 'advance_settlement') {
                                    setSelectedSettlementForPrint(d.rawCashEntry!);
                                  } else if (d.sourceType === 'advance_cash_repay') {
                                    setSelectedRepayAdvanceForPrint(d.rawCashEntry!);
                                  } else {
                                    setSelectedSellerPayoutForPrint(d.rawCashEntry!);
                                  }
                                }}
                                className={`p-1.5 rounded-none border cursor-pointer shadow-2xs transition-colors ${
                                  d.sourceType === 'advance_settlement'
                                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                                    : d.sourceType === 'advance_cash_repay'
                                    ? 'bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                }`}
                                title={
                                  d.sourceType === 'advance_settlement'
                                    ? 'طباعة سند تسوية ومقاصة السلفة'
                                    : d.sourceType === 'advance_cash_repay'
                                    ? 'طباعة سند قبض سداد السلفة نقداً'
                                    : 'طباعة سند صرف النقدية'
                                }
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            ) : d.rawTrx ? (
                              <button
                                type="button"
                                onClick={() => onOpenReceipt(d.rawTrx!, 'seller')}
                                className="p-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                                title="طباعة إشعار صرف البائع (الصياد)"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: MARKET STAFF & WORKERS ACCOUNT STATEMENT & SETTLEMENTS */}
        {/* ========================================================================= */}
        {reportType === 'staff' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Toolbar: Worker Selection, Add Worker, Quick Actions */}
            <div className="bg-slate-50 border border-slate-300 rounded-none p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                {/* Worker Selector Dropdown & Search */}
                <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1 min-w-[260px]">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      اختيار الموظف / العامل / أمين الصندوق:
                    </label>
                    <div className="relative">
                      <select
                        value={selectedWorker?.id || ''}
                        onChange={(e) => setSelectedWorkerId(e.target.value)}
                        className="w-full pl-8 pr-10 py-2.5 bg-white border border-slate-300 rounded-none text-xs font-bold text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {filteredWorkers.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} - ({w.role || 'عامل سوق'}) {w.dailyWage ? `[أجر: ${formatCurrency(w.dailyWage, settings.currency)}]` : ''}
                          </option>
                        ))}
                      </select>
                      <Users className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="w-full sm:w-56">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      بحث سريع بالاسم أو الصفة:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={workerSearchQuery}
                        onChange={(e) => setWorkerSearchQuery(e.target.value)}
                        placeholder="ابحث..."
                        className="w-full pr-8 pl-3 py-2 bg-white border border-slate-300 rounded-none text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* New Worker Button */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setNewWorkerName('');
                      setNewWorkerRole('');
                      setNewWorkerPhone('');
                      setNewWorkerDailyWage('');
                      setNewWorkerNotes('');
                      setIsAddWorkerModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 text-white rounded-none text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: '#030164' }}
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>إضافة عامل / موظف جديد</span>
                  </button>
                </div>
              </div>

              {/* Selected Worker Info Badge */}
              {selectedWorker && (
                <div className="mt-4 pt-4 border-t border-slate-300/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-none bg-blue-100 text-blue-700 font-black flex items-center justify-center text-sm shadow-xs">
                      {selectedWorker.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">{selectedWorker.name}</span>
                        <span className="px-2.5 py-0.5 rounded-none bg-slate-200 text-slate-700 font-bold text-[10px]">
                          {selectedWorker.role || 'عامل سوق'}
                        </span>
                      </div>
                      <div className="text-slate-500 flex items-center gap-3 mt-0.5 text-[11px]">
                        {selectedWorker.phone && <span>هاتف: {selectedWorker.phone}</span>}
                        {selectedWorker.dailyWage && (
                          <span>الأجر اليومي المعتاد: <strong className="text-slate-700">{formatCurrency(selectedWorker.dailyWage, settings.currency)}</strong></span>
                        )}
                        {selectedWorker.notes && <span className="text-slate-400">ملاحظة: {selectedWorker.notes}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Worker Action Buttons */}
                  <div className="relative flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isWorkerActionsMenuOpen}
                      onClick={() => setIsWorkerActionsMenuOpen((open) => !open)}
                      className="px-4 py-2.5 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 font-bold rounded-none text-xs flex items-center gap-2 shadow-xs cursor-pointer transition-colors active:scale-[0.98]"
                      title="صرف أجر أو نثريات أو إدارة السلف"
                    >
                      <DollarSign className="w-4 h-4 text-sky-700" />
                      <span>صرف نثريات</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isWorkerActionsMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isWorkerActionsMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-none border border-slate-300 bg-white p-1.5 shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setPayWorkerBeneficiarySearch(selectedWorker.name);
                            setPayWorkerCategory('صرف أجر / راتب نقداً');
                            setPayWorkerAmount(selectedWorker.dailyWage || '');
                            setPayWorkerMethod('cash');
                            setPayWorkerExchangeName('');
                            setIsBeneficiarySuggestionsOpen(false);
                            setIsWorkerActionsMenuOpen(false);
                            setIsPayWorkerModalOpen(true);
                          }}
                          className="w-full rounded-none px-3 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-900 flex items-center gap-2"
                        >
                          <DollarSign className="w-4 h-4 text-sky-700" />
                          صرف أجر / مستحقات
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWorkerAdvanceUnifiedTab(workerMetrics.netAdvanceBalance > 0 ? 'repay' : 'give');
                            setWorkerAdvanceAmount('');
                            setWorkerAdvanceNotes('');
                            setWorkerAdvanceMethod('cash');
                            setWorkerAdvanceExchangeName('');
                            setWorkerRepayAmount(workerMetrics.netAdvanceBalance > 0 ? workerMetrics.netAdvanceBalance : '');
                            setWorkerRepayNotes('');
                            setWorkerRepayMethod('cash');
                            setWorkerRepayExchangeName('');
                            setIsWorkerActionsMenuOpen(false);
                            setIsWorkerAdvanceUnifiedModalOpen(true);
                          }}
                          className="w-full rounded-none px-3 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-900 flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-2"><HandCoins className="w-4 h-4 text-sky-700" />إدارة السلف (صرف / سداد)</span>
                          {workerMetrics.netAdvanceBalance > 0 && <span className="text-[10px] font-mono font-bold text-sky-800">{formatCurrency(workerMetrics.netAdvanceBalance, '')}</span>}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsWorkerStatementPrintOpen(true)}
                      className="px-3.5 py-2 text-white font-bold rounded-none text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ backgroundColor: '#030164' }}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة كشف الحساب</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Financial KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>إجمالي الأجور المصروفة</span>
                  <div className="w-8 h-8 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatCurrency(workerMetrics.totalPaid, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  مجموع الأجور والرواتب والمكافآت المسلمة له
                </p>
              </div>

              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>إجمالي السلف الممنوحة</span>
                  <div className="w-8 h-8 rounded-none bg-amber-50 text-amber-600 flex items-center justify-center">
                    <HandCoins className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-amber-700">
                  {formatCurrency(workerMetrics.totalAdvances, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  المبالغ المصروفة كسلف للعامل من الصندوق
                </p>
              </div>

              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>السلف المستردة / المسددة</span>
                  <div className="w-8 h-8 rounded-none bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-emerald-700">
                  {formatCurrency(workerMetrics.totalAdvancesRepaid, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  مجموع ما تم استرجاعه وإيداعه بالصندوق
                </p>
              </div>

              <div className={`border rounded-none p-4 shadow-xs ${
                workerMetrics.netAdvanceBalance > 0
                  ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                  : 'bg-white border-slate-300 text-slate-900'
              }`}>
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className={workerMetrics.netAdvanceBalance > 0 ? 'text-rose-700' : 'text-slate-500'}>
                    متبقي السلفة بذمة الموظف
                  </span>
                  <div className={`w-8 h-8 rounded-none flex items-center justify-center ${
                    workerMetrics.netAdvanceBalance > 0
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    <Scale className="w-4 h-4" />
                  </div>
                </div>
                <div className={`text-xl font-black ${
                  workerMetrics.netAdvanceBalance > 0 ? 'text-rose-700' : 'text-slate-900'
                }`}>
                  {formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)}
                </div>
                <p className={`text-[11px] mt-1 ${
                  workerMetrics.netAdvanceBalance > 0 ? 'text-rose-600' : 'text-slate-400'
                }`}>
                  {workerMetrics.netAdvanceBalance > 0 ? 'سلفة مستحقة للتحصيل أو الخصم' : 'تمت تصفية كافة السلف بالكامل'}
                </p>
              </div>
            </div>

            {/* Worker Ledger / Transaction History */}
            <div className="bg-white border border-slate-300 rounded-none shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    سجل حركات ومدفوعات وسلف الموظف ({selectedWorker?.name || '---'})
                  </h3>
                  <span className="px-2 py-0.5 rounded-none bg-slate-200 text-slate-700 font-bold text-xs">
                    {workerEntries.length} حركة
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-300 text-slate-600 font-black">
                      <th className="py-3 px-4">رقم الحركة</th>
                      <th className="py-3 px-4">التاريخ والوقت</th>
                      <th className="py-3 px-4">نوع الحركة والتصنيف</th>
                      <th className="py-3 px-4">البيان والتفاصيل</th>
                      <th className="py-3 px-4 text-emerald-700">المنصرف للموظف (مدين)</th>
                      <th className="py-3 px-4 text-blue-700">المسدد للصندوق (دائن)</th>
                      <th className="py-3 px-4">أمين الصندوق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {workerEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Users className="w-8 h-8 text-slate-300" />
                            <p className="font-bold text-sm">لا توجد حركات مالية مسجلة لهذا العامل/الموظف حتى الآن</p>
                            <p className="text-xs text-slate-400">يمكنك صرف أجر أو سلفة مباشرة باستخدام الأزرار أعلاه</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      workerEntries.map((e) => {
                        const isDisbursedToWorker = e.type === 'expense';
                        const isPaidByWorker = e.type === 'deposit';
                        return (
                          <tr key={e.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{e.id}</td>
                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                              <div>{formatDisplayDate(e.timestamp, e.dateStr)}</div>
                              <div className="text-[10px] text-slate-400">{e.timeStr}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-none text-[11px] font-bold ${
                                e.category === 'سلفة موظف / عامل'
                                  ? 'bg-amber-100 text-amber-800'
                                  : e.category === 'سداد سلفة موظف'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {e.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-xs">{e.description}</td>
                            <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                              {isDisbursedToWorker ? (
                                <span className="text-rose-600">
                                  {formatCurrency(e.amount, settings.currency)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                              {isPaidByWorker ? (
                                <span className="text-emerald-600">
                                  {formatCurrency(e.amount, settings.currency)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500">{e.performedBy || 'أمين الصندوق'}</td>
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

        {/* ========================================================================= */}
        {/* TAB 4.5: OFFICE LEDGER & EXPENSES (كشف حساب ونثريات وسلف المكتب) */}
        {/* ========================================================================= */}
        {reportType === 'office' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Top Bar: Selector & Quick Actions */}
            <div className="bg-slate-50 border border-slate-300 rounded-none p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  {/* Account / Officer selector */}
                  <div className="w-full sm:w-72">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      اختيار حساب أو مسؤول المكتب:
                    </label>
                    <div className="relative">
                      <select
                        id="office-officer-select"
                        value={selectedOfficeOfficerId}
                        onChange={(e) => setSelectedOfficeOfficerId(e.target.value)}
                        className="w-full pl-8 pr-10 py-2.5 bg-white border border-slate-300 rounded-none text-xs font-bold text-slate-900 shadow-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        {officeOfficers.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name} - ({o.role})
                          </option>
                        ))}
                      </select>
                      <Building2 className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Search query input */}
                  <div className="w-full sm:w-60">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      بحث في حركات ونثريات المكتب:
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={officeSearchQuery}
                        onChange={(e) => setOfficeSearchQuery(e.target.value)}
                        placeholder="ابحث بالبيان أو التصنيف..."
                        className="w-full pr-8 pl-3 py-2 bg-white border border-slate-300 rounded-none text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 shadow-xs"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Actions at top: صرف نثريات + طباعة كشف حساب المكتب */}
                <div className="flex items-end gap-2.5 flex-wrap sm:flex-nowrap">
                  {/* Quick Action Buttons: صرف نثريات */}
                  <div className="relative">
                    <button
                      type="button"
                      aria-expanded={isOfficeActionsMenuOpen}
                      onClick={() => setIsOfficeActionsMenuOpen((open) => !open)}
                      className="w-full sm:w-auto px-4 py-2.5 bg-sky-100 hover:bg-sky-200 text-sky-900 border border-sky-300 font-bold rounded-none text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-colors active:scale-[0.98]"
                      title="صرف نثريات المكتب أو إدارة السلف والعهدة"
                    >
                      <Coffee className="w-4 h-4 text-sky-700" />
                      <span>صرف نثريات</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOfficeActionsMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isOfficeActionsMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 z-40 w-64 rounded-none border border-slate-300 bg-white p-1.5 shadow-xl">
                        <button
                          type="button"
                          onClick={() => {
                            setOfficeExpenseOfficer(selectedOfficeOfficerId !== 'office-all' ? selectedOfficeOfficer.name : 'مسؤول المكتب');
                            setOfficeExpenseCategory('');
                            setOfficeExpenseAmount('');
                            setOfficeExpenseNotes('');
                            setIsOfficeActionsMenuOpen(false);
                            setIsOfficeExpenseModalOpen(true);
                          }}
                          className="w-full rounded-none px-3 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-900 flex items-center gap-2 cursor-pointer"
                        >
                          <Coffee className="w-4 h-4 text-sky-700" />
                          صرف نثريات / وجبات المكتب
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOfficeAdvanceUnifiedTab(officeMetrics.netAdvanceBalance > 0 ? 'repay' : 'give');
                            setOfficeAdvanceOfficer(selectedOfficeOfficerId !== 'office-all' ? selectedOfficeOfficer.name : 'مسؤول المكتب');
                            setOfficeAdvanceAmount('');
                            setOfficeAdvanceNotes('');
                            setOfficeRepayOfficer(selectedOfficeOfficerId !== 'office-all' ? selectedOfficeOfficer.name : 'مسؤول المكتب');
                            setOfficeRepayAmount(officeMetrics.netAdvanceBalance > 0 ? officeMetrics.netAdvanceBalance : '');
                            setOfficeRepayNotes('سداد وتوريد سلفة/عهدة المكتب للصندوق');
                            setIsOfficeActionsMenuOpen(false);
                            setIsOfficeAdvanceUnifiedModalOpen(true);
                          }}
                          className="w-full rounded-none px-3 py-2.5 text-right text-xs font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-900 flex items-center justify-between gap-2 cursor-pointer"
                          title="صرف سلفة أو تسجيل سدادها"
                        >
                          <span className="flex items-center gap-2">
                            <HandCoins className="w-4 h-4 text-sky-700" />
                            إدارة السلف (صرف / سداد)
                          </span>
                          {officeMetrics.netAdvanceBalance > 0 && (
                            <span className="text-[10px] font-mono font-bold text-sky-800">
                              {formatCurrency(officeMetrics.netAdvanceBalance, '')}
                            </span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsOfficeStatementPrintOpen(true)}
                    className="w-full sm:w-auto px-4 py-2.5 text-white rounded-none text-xs font-bold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ backgroundColor: '#030164' }}
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة كشف حساب المكتب</span>
                  </button>
                </div>
              </div>

              {/* Selected Officer / Office Info Badge */}
              <div className="mt-4 pt-4 border-t border-slate-300/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-none bg-indigo-100 text-indigo-700 font-black flex items-center justify-center text-sm shadow-xs">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-900 text-sm">{selectedOfficeOfficer.name}</span>
                      <span className="px-2.5 py-0.5 rounded-none bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px]">
                        {selectedOfficeOfficer.role}
                      </span>
                    </div>
                    <div className="text-slate-500 flex items-center gap-3 mt-0.5 text-[11px]">
                      <span>متابعة دقيقة لنثريات الإفطار، الغداء، الضيافة، مستلزمات وسلف ومسحوبات المكتب</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Financial KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Expenses & Petty Cash */}
              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>إجمالي نثريات ومصروفات المكتب</span>
                  <div className="w-8 h-8 rounded-none bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Utensils className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatCurrency(officeMetrics.totalExpenses, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  وجبات الإفطار والغداء، الضيافة، والمستلزمات
                </p>
              </div>

              {/* Card 2: Total Advances Withdrawn */}
              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>إجمالي السلف والمسحوبات</span>
                  <div className="w-8 h-8 rounded-none bg-amber-50 text-amber-600 flex items-center justify-center">
                    <HandCoins className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-amber-700">
                  {formatCurrency(officeMetrics.totalAdvances, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  المبالغ المسحوبة كعهدة أو سلفة للمكتب
                </p>
              </div>

              {/* Card 3: Repaid Advances */}
              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>السلف المستردة / الموردة</span>
                  <div className="w-8 h-8 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-blue-700">
                  {formatCurrency(officeMetrics.totalAdvancesRepaid, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  المبالغ الموردة للصندوق كسداد للعهدة أو السلف
                </p>
              </div>

              {/* Card 4: Net Balance Outstanding */}
              <div
                className={`border rounded-none p-4 shadow-xs ${
                  officeMetrics.netAdvanceBalance > 0
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className={officeMetrics.netAdvanceBalance > 0 ? 'text-rose-700' : 'text-slate-500'}>
                    متبقي السلفة / العهدة بذمة المكتب
                  </span>
                  <div
                    className={`w-8 h-8 rounded-none flex items-center justify-center ${
                      officeMetrics.netAdvanceBalance > 0
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Scale className="w-4 h-4" />
                  </div>
                </div>
                <div
                  className={`text-xl font-black ${
                    officeMetrics.netAdvanceBalance > 0 ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(officeMetrics.netAdvanceBalance, settings.currency)}
                </div>
                <p
                  className={`text-[11px] mt-1 ${
                    officeMetrics.netAdvanceBalance > 0 ? 'text-rose-600' : 'text-slate-400'
                  }`}
                >
                  {officeMetrics.netAdvanceBalance > 0
                    ? 'رصيد عهدة أو سلفة مستحقة للتحصيل أو التسوية'
                    : 'تمت تصفية كافة السلف والعهد المكتبية بالكامل'}
                </p>
              </div>
            </div>

            {/* Office Ledger Table */}
            <div className="bg-white border border-slate-300 rounded-none shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    سجل حركات ونثريات ومدفوعات وسلف المكتب ({selectedOfficeOfficer.name})
                  </h3>
                  <span className="px-2 py-0.5 rounded-none bg-slate-200 text-slate-700 font-bold text-xs">
                    {officeEntries.length} حركة
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-300 text-slate-600 font-black">
                      <th className="py-3 px-4">رقم السند</th>
                      <th className="py-3 px-4">التاريخ والوقت</th>
                      <th className="py-3 px-4">نوع الحركة والتصنيف</th>
                      <th className="py-3 px-4">المستلم / المسؤول</th>
                      <th className="py-3 px-4 text-rose-700">المنصرف للمكتب (مدين)</th>
                      <th className="py-3 px-4 text-blue-700">المورد للصندوق (دائن)</th>
                      <th className="py-3 px-4">أمين الصندوق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {officeEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Building2 className="w-8 h-8 text-slate-300" />
                            <p className="font-bold text-sm">لا توجد حركات مسجلة للمكتب في هذه الفترة</p>
                            <p className="text-xs text-slate-400">
                              يمكنك تسجيل صرفة إفطار/غداء، نثريات أو سلفة مباشرة عبر الأزرار أعلاه
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      officeEntries.map((e) => {
                        const isDisbursedToOffice = e.type === 'expense';
                        const isDepositedFromOffice = e.type === 'deposit';

                        return (
                          <tr key={e.id} className="hover:bg-slate-50/75 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-700">{e.id}</td>
                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                              <span className="font-mono">{formatDisplayDate(e.timestamp, e.dateStr)}</span>
                              <span className="text-[10px] text-slate-400 mr-1.5 font-mono">{e.timeStr}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-none text-[11px] font-bold ${
                                  e.type === 'deposit'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-300'
                                    : (e.category || '').includes('سلفة') || (e.category || '').includes('مسحوبات')
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {e.type === 'deposit' ? (
                                  <ShieldCheck className="w-3 h-3" />
                                ) : (e.category || '').includes('سلفة') || (e.category || '').includes('مسحوبات') ? (
                                  <HandCoins className="w-3 h-3" />
                                ) : (
                                  <Coffee className="w-3 h-3" />
                                )}
                                <span>{e.category || 'نثريات المكتب'}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-800">
                              {e.contactName || selectedOfficeOfficer.name}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-rose-700 whitespace-nowrap">
                              {isDisbursedToOffice ? (
                                `-${formatCurrency(e.amount, settings.currency)}`
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                              {isDepositedFromOffice ? (
                                `+${formatCurrency(e.amount, settings.currency)}`
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500">{e.performedBy || 'أمين الصندوق'}</td>
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

        {/* ========================================================================= */}
        {/* TAB 5: LOT TRANSFERS AUDIT LOG (سجل حركات تحويل الشروات) */}
        {/* ========================================================================= */}
        {reportType === 'lot_transfers' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Description */}
            <div className="bg-slate-50 border border-slate-300 rounded-none p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900">
                        سجل حركات تحويل الشروات وتغيير المشتري
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        سجل تدقيق مالي يوثق كل عملية نقل شروة من مشتري سابق إلى مشتري جديد مع نقل ضريبة الدلالة (+2%) والمديونية بالكامل
                      </p>
                    </div>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="w-full sm:w-72">
                  <div className="relative">
                    <input
                      type="text"
                      value={lotTransferSearch}
                      onChange={(e) => setLotTransferSearch(e.target.value)}
                      placeholder="ابحث برقم الفاتورة، المشتري، الهاتف..."
                      className="w-full pr-9 pl-4 py-2.5 bg-white border border-slate-300 rounded-none text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 shadow-xs"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Filters for Lot Transfers: Day of Week, Specific Date, Invoice No. */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-none border border-blue-300 text-xs shadow-2xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Day of Week */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>تحديد يوم الأسبوع:</span>
                  </span>
                  <select
                    id="rep-lot-transfer-day-filter"
                    value={lotTransferDayFilter}
                    onChange={(e) => setLotTransferDayFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs"
                  >
                    <option value="all">كافة أيام الأسبوع</option>
                    <option value="0">يوم الأحد</option>
                    <option value="1">يوم الإثنين</option>
                    <option value="2">يوم الثلاثاء</option>
                    <option value="3">يوم الأربعاء</option>
                    <option value="4">يوم الخميس</option>
                    <option value="5">يوم الجمعة</option>
                    <option value="6">يوم السبت</option>
                  </select>
                </div>

                {/* Specific Date */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">تاريخ محدد:</span>
                  <input
                    type="date"
                    value={lotTransferSpecificDate}
                    onChange={(e) => setLotTransferSpecificDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                </div>

                {/* Invoice No */}
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">رقم الفاتورة / الشروة:</span>
                  <input
                    type="text"
                    value={lotTransferInvoiceQuery}
                    onChange={(e) => setLotTransferInvoiceQuery(e.target.value)}
                    placeholder="مثال: TRX-..."
                    className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-none px-2.5 py-1 focus:ring-2 focus:ring-blue-500 w-32 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Active Filter Badges and Reset Button */}
              {(lotTransferDayFilter !== 'all' || lotTransferSpecificDate || lotTransferInvoiceQuery || lotTransferSearch) && (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-none bg-blue-100 text-blue-800 text-[11px] font-bold">
                    تم حصر: {filteredLotTransfers.length} عملية
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLotTransferDayFilter('all');
                      setLotTransferSpecificDate('');
                      setLotTransferInvoiceQuery('');
                      setLotTransferSearch('');
                    }}
                    className="text-rose-600 hover:text-rose-800 font-bold text-xs flex items-center gap-1 cursor-pointer bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-none transition-colors"
                  >
                    <X className="w-3 h-3" />
                    <span>إلغاء التصفية</span>
                  </button>
                </div>
              )}
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>إجمالي عمليات التحويل</span>
                  <div className="w-8 h-8 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {lotTransfersStats.count} عملية
                </div>
                <p className="text-[11px] text-slate-400 mt-1">عدد الفواتير المنقولة بين المشترين</p>
              </div>

              <div className="bg-white border border-slate-300 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>قيمة الشروات الأصلية</span>
                  <div className="w-8 h-8 rounded-none bg-slate-100 text-slate-700 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatCurrency(lotTransfersStats.totalGross, settings.currency)}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">إجمالي صافي قيمة الحراج الأساسية</p>
              </div>

              <div className="bg-white border border-slate-300 bg-blue-50/40 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-blue-800 mb-2">
                  <span>إجمالي الضريبة المنقولة (+2%)</span>
                  <div className="w-8 h-8 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-blue-700">
                  {formatCurrency(lotTransfersStats.totalTax, settings.currency)}
                </div>
                <p className="text-[11px] text-blue-600/80 mt-1">حُذفت من السابق وأُلحقت بالمشتري الجديد</p>
              </div>

              <div className="bg-white border border-emerald-200 bg-emerald-50/30 rounded-none p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-800 mb-2">
                  <span>إجمالي المبالغ المنقولة</span>
                  <div className="w-8 h-8 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-xl font-black text-emerald-700">
                  {formatCurrency(lotTransfersStats.totalNet, settings.currency)}
                </div>
                <p className="text-[11px] text-emerald-600/80 mt-1">المبلغ الإجمالي الشامل للضريبة</p>
              </div>
            </div>

            {/* Transfers Table */}
            <div className="bg-white border border-slate-300 rounded-none shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-300 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-blue-600" />
                  <h3 className="text-sm font-black text-slate-900">
                    جدول تفاصيل الشروات المحوّلة
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-none bg-slate-200 text-slate-700 font-bold text-xs">
                    {filteredLotTransfers.length} سجل
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-300 text-slate-600 font-black">
                      <th className="py-3 px-4">رقم الفاتورة</th>
                      <th className="py-3 px-4">تاريخ ووقت التحويل</th>
                      <th className="py-3 px-4 text-rose-700">المشتري السابق</th>
                      <th className="py-3 px-4 text-emerald-700">المشتري الجديد (المُحوَّل له)</th>
                      <th className="py-3 px-4">قيمة الشروة</th>
                      <th className="py-3 px-4 text-blue-700">الضريبة (+2%)</th>
                      <th className="py-3 px-4 font-black">الإجمالي المنقول</th>
                      <th className="py-3 px-4">طريقة السداد</th>
                      <th className="py-3 px-4">ملاحظات وسبب النقل</th>
                      <th className="py-3 px-4">بواسطة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLotTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <ArrowRightLeft className="w-8 h-8 text-slate-300" />
                            <p className="font-bold text-sm">لا توجد حركات تحويل شروات مسجلة حتى الآن</p>
                            <p className="text-xs text-slate-400">
                              عند الضغط على زر "تحويل الشروة لمشتري آخر" في كشف الحساب سيتم تسجيل كافة التفاصيل هنا آلياً
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLotTransfers.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="py-3 px-4 font-mono font-black text-blue-700">
                            {t.transactionId}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap font-mono">
                            <span className="font-bold text-slate-700">{getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}</span>
                            <span>{formatDisplayDate(t.timestamp, t.dateStr)}</span>
                            <div className="text-[10px] text-slate-400">{t.timeStr}</div>
                          </td>
                          <td className="py-3 px-4 font-bold text-rose-700">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                              <span>{t.fromBuyerName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-700">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span>{t.toBuyerName}</span>
                              {t.toBuyerPhone && <span className="text-[10px] text-slate-400 font-normal">({t.toBuyerPhone})</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">
                            {formatCurrency(t.grossAmount, settings.currency)}
                          </td>
                          <td className="py-3 px-4 font-black text-blue-700 whitespace-nowrap">
                            +{formatCurrency(t.buyerTaxAmount, settings.currency)}
                          </td>
                          <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap bg-emerald-50/40">
                            {formatCurrency(t.totalAmount, settings.currency)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-none text-[10px] font-bold ${
                              t.settlementType === 'association_credit'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {t.settlementType === 'association_credit' ? 'آجل ذمة' : 'نقداً'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs">{t.notes || 'تحويل شروة نظامي'}</td>
                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{t.performedBy || 'أمين الصندوق'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fisherman Settlement Notice Modal */}
      {isSettlementModalOpen && (
        <FishermanSettlementModal
          isOpen={isSettlementModalOpen}
          onClose={() => {
            setIsSettlementModalOpen(false);
            setSettlementBuyerOverride(null);
            setSettlementTransactionsOverride(null);
            setSettlementRoleOverride(undefined);
          }}
          seller={settlementBuyerOverride || selectedSeller}
          transactions={settlementTransactionsOverride || sellerTransactions}
          contacts={contacts}
          settings={settings}
          timeframe={timeframe}
          sellerMetrics={settlementBuyerOverride ? {
            grossTotal: (settlementTransactionsOverride || []).reduce((s, t) => s + (Number(t.grossAmount) || 0), 0),
            deductionTotal: (settlementTransactionsOverride || []).reduce((s, t) => s + (Number(t.sellerTaxAmount ?? (t as any).commissionAmount) || 0), 0),
            netTotal: (settlementTransactionsOverride || []).reduce((s, t) => s + (Number(t.netToSeller ?? ((Number(t.grossAmount) || 0) - (Number(t.sellerTaxAmount) || 0))) || 0), 0),
            count: (settlementTransactionsOverride || []).length,
          } : sellerMetrics}
          totalPaid={settlementBuyerOverride ? 0 : totalSellerPaid}
          remainingBalance={settlementBuyerOverride ? (settlementTransactionsOverride || []).reduce((s, t) => s + (t.netToSeller || 0), 0) : remainingSellerBalance}
          payouts={settlementBuyerOverride ? [] : sellerPayouts}
          initialPrintMode={settlementModalPrintMode}
          initialSellerRole={settlementRoleOverride || fishermanRole}
        />
      )}

      {/* Buyer Account Statement Modal */}
      {isBuyerModalOpen && (
        <BuyerStatementModal
          isOpen={isBuyerModalOpen}
          onClose={() => setIsBuyerModalOpen(false)}
          initialPrintMode={buyerModalPrintMode}
          onOpenAllDebtorsModal={() => setIsAllDebtorsModalOpen(true)}
          onOpenAdvanceModal={() => {
            setAdvanceModalInitialTab('advance');
            setIsAdvanceModalOpen(true);
          }}
          onOpenLoanModal={() => {
            setAdvanceModalInitialTab('loan');
            setIsAdvanceModalOpen(true);
          }}
          onOpenServiceInvoice={() => {
            handleOpenBuyerServiceInvoice();
          }}
          onOpenOffsetModal={() => {
            setIsBuyerModalOpen(false);
            setRepaymentSource('offset');
            setRepayAmount('');
            setRepayNotes('مقاصة مستحقات البيعات مع مديونية الشروات');
            setIsRepayModalOpen(true);
          }}
          buyer={selectedBuyer}
          transactions={buyerTransactions.length > 0 ? buyerTransactions : allBuyerTransactions}
          salesTransactions={
            settings?.enableBuyerFishSalesAndOffset
              ? (
                  (buyerDayFilter !== 'all' || buyerSpecificDate.trim() || buyerInvoiceQuery.trim())
                    ? buyerSalesTransactions
                    : (buyerSalesTransactions.length > 0 ? buyerSalesTransactions : allBuyerSalesTransactions)
                )
              : []
          }
          repayments={buyerRepayments}
          advanceEntries={buyerAdvanceLedger}
          advanceBalance={selectedBuyerAdvanceStats.currentAdvanceBalance}
          loanBalance={totalBuyerAdvancesOwed}
          settings={settings}
          timeframe={timeframe}
          customFilterLabel={buyerCustomFilterLabel}
          buyerMetrics={buyerMetrics}
          onDeleteCashEntry={onDeleteCashEntry}
        />
      )}

      {/* Fisherman Disbursements Ledger Modal (سجل تسليم المبالغ النقدية للصياد) */}
      {isDisbursementsModalOpen && (
        <FishermanDisbursementsModal
          isOpen={isDisbursementsModalOpen}
          onClose={() => setIsDisbursementsModalOpen(false)}
          seller={selectedSeller}
          disbursements={filteredDisbursements}
          filterTitle={
            disbursementFilter === 'pos'
              ? 'تسليمات البيع بضمانة الجمعية'
              : disbursementFilter === 'vouchers'
              ? 'سندات الصرف النقدية'
              : disbursementFilter === 'settlements'
              ? 'سندات سداد ومقاصة السلف'
              : 'كافة المسلّمات'
          }
          totalPaid={totalSellerPaid}
          remainingBalance={remainingSellerBalance}
          settings={settings}
          initialPrintMode={disbursementsModalPrintMode}
        />
      )}

      {/* All Indebted Buyers Statement Modal (نهاية اليوم) */}
      {isAllDebtorsModalOpen && (
        <AllDebtorsStatementModal
          isOpen={isAllDebtorsModalOpen}
          onClose={() => setIsAllDebtorsModalOpen(false)}
          transactions={transactions}
          contacts={contacts}
          cashEntries={cashEntries}
          settings={settings}
          defaultTimeframe="all"
        />
      )}

      {/* Delete Transaction Confirmation Modal */}
      {selectedTrxForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-none max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-300 text-right">
            <div className="flex items-center gap-2.5 text-red-600 border-b border-red-100 pb-3">
              <div className="w-9 h-9 rounded-none bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">تأكيد حذف العملية</h3>
                <p className="text-[11px] text-slate-500">حذف نهائي للعملية وضبط الحسابات</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-none border border-slate-300">
              <p>
                هل أنت متأكد من رغبتك في حذف العملية رقم{' '}
                <span className="font-mono text-blue-700 font-bold">{selectedTrxForDelete.id}</span>؟{' '}
                سيتم تعديل الحسابات والتقارير المالية تلقائياً.
              </p>
              <div className="p-2.5 bg-amber-50 rounded-none border border-amber-200 text-amber-900 font-bold text-[11px] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  تنبيه: سيتم حذف العملية أيضاً وإلغاؤها نهائياً من جهة الصياد / البائع ({selectedTrxForDelete.sellerName || 'الصياد'}).
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSelectedTrxForDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTransaction && selectedTrxForDelete) {
                    onDeleteTransaction(selectedTrxForDelete.id);
                  }
                  setSelectedTrxForDelete(null);
                }}
                className="px-4 py-2 text-xs bg-red-600 hover:bg-red-700 text-white font-bold rounded-none shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد الحذف</span>
              </button>
            </div>
          </div>
        </div>
      )}



  {/* Modal: تعديل دين المشتري (المتبقي غير مسدد) مباشرة */}
  {isEditBuyerDebtModalOpen && selectedBuyer && (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-none max-w-lg w-full p-5 sm:p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-200" dir="rtl">
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                تعديل دين المشتري (المتبقي)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                العميل: <span className="font-bold text-slate-800">{selectedBuyer.name}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsEditBuyerDebtModalOpen(false)}
            className="w-8 h-8 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="py-4 space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-50 border border-slate-300 p-2.5 rounded-none">
              <span className="text-[11px] text-slate-500 font-bold block mb-0.5">إجمالي الشروات:</span>
              <span className="text-sm font-mono font-black text-slate-800">
                {formatCurrency(buyerMetrics.finalTotal, settings.currency)}
              </span>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-none">
              <span className="text-[11px] text-amber-800 font-bold block mb-0.5">الدين الحالي المسجل:</span>
              <span className="text-sm font-mono font-black text-amber-900">
                {formatCurrency(selectedBuyerDebt, settings.currency)}
              </span>
            </div>
          </div>

          {allBuyerTransactions.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                الشروة / الفاتورة المراد تعديل دينها:
              </label>
              <select
                value={selectedTrxForDebtEdit}
                onChange={(e) => setSelectedTrxForDebtEdit(e.target.value)}
                className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-2 text-xs font-bold text-slate-900 focus:bg-[#FFFDF0] focus:outline-none"
              >
                <option value="ALL">توزيع المبلغ على جميع فواتير المشتري</option>
                {allBuyerTransactions.map((t) => (
                  <option key={t.id} value={t.id}>
                    فاتورة #{t.id} - بتاريخ {t.dateStr} (الإجمالي: {formatCurrency(t.totalFromBuyer, settings.currency)} - متبقي حالي: {formatCurrency(t.buyerRemainingDebt ?? 0, settings.currency)})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-800">
                المبلغ المتبقي ديناً الجديد:
              </label>
              <button
                type="button"
                onClick={() => setCustomBuyerRemainingDebtInput('0')}
                className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors cursor-pointer"
              >
                تصفير الدين (0 ريال - مسدد بالكامل)
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                value={customBuyerRemainingDebtInput}
                onChange={(e) => {
                  const val = e.target.value
                    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                    .replace(/[^0-9.]/g, '');
                  const parts = val.split('.');
                  const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val;
                  setCustomBuyerRemainingDebtInput(sanitized);
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full bg-[#FEF9D7] border border-amber-300 rounded-none p-3 text-lg font-mono font-black text-slate-900 text-center focus:bg-[#FFFDF0] focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="0"
                autoFocus
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-500">
                {settings.currency}
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-none border border-slate-300 text-xs flex items-center justify-between">
            <span className="font-bold text-slate-600">حالة الفاتورة بعد التعديل:</span>
            <span className={`font-bold px-2 py-0.5 rounded ${
              (Number(customBuyerRemainingDebtInput) || 0) <= 0
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}>
              {(Number(customBuyerRemainingDebtInput) || 0) <= 0
                ? 'مسدد بالكامل ✓'
                : `سداد جزئي (متبقي دين: ${formatCurrency(Number(customBuyerRemainingDebtInput) || 0, settings.currency)})`}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setIsEditBuyerDebtModalOpen(false)}
            className="px-4 py-2 rounded-none text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSaveCustomBuyerDebt}
            className="px-5 py-2 rounded-none text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>حفظ وتثبيت المبلغ المتبقي</span>
          </button>
        </div>
      </div>
    </div>
  )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <EditTransactionModal
          transaction={editingTransaction}
          settings={settings}
          contacts={contacts}
          fishTypes={fishTypes}
          editContext={editingContext}
          onClose={() => setEditingTransaction(null)}
          onSave={(updatedTrx, autoPrint) => {
            if (onUpdateTransaction) {
              onUpdateTransaction(updatedTrx, autoPrint);
            }
            setEditingTransaction(null);
          }}
        />
      )}

      {/* Transfer Buyer Modal */}
      {transferringTransaction && (
        <TransferBuyerModal
          transaction={transferringTransaction}
          settings={settings}
          contacts={contacts}
          onClose={() => setTransferringTransaction(null)}
          onQuickAddContact={onAddContact}
          onConfirmTransfer={(updatedTrx, autoPrint) => {
            if (onUpdateTransaction) {
              onUpdateTransaction(updatedTrx, autoPrint);
            }
            setTransferringTransaction(null);
          }}
          onResellTransaction={(newTrx, autoPrint, updatedOriginalTrx) => {
            if (onSaveTransaction) {
              onSaveTransaction(newTrx, autoPrint, updatedOriginalTrx);
            }
            setTransferringTransaction(null);
          }}
        />
      )}

      {/* MODAL: Repay Buyer Debt (تسديد دين المشتري / مقاصة) */}
      {isRepayModalOpen && selectedBuyer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-none max-w-4xl w-full max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-red-100 text-red-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    تسديد دين المشتري
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    سداد مديونية الشروات (نقداً / صرافة / رصيد القدمة / مقاصة مع البيعات)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRepayModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (repaymentSource === 'resale_settle') {
                  handleSettleResold();
                  return;
                }
                if (repaymentSource === 'offset') {
                  if (onOffsetBuyerSalesDebt) {
                    onOffsetBuyerSalesDebt(
                      selectedBuyer.id,
                      selectedBuyer.name,
                      buyerPendingSalesDues > selectedBuyerDebt ? offsetSurplusAction : undefined,
                      repayNotes
                    );
                  }
                  setIsRepayModalOpen(false);
                  return;
                }

                const amt = Number(repayAmount);
                if (!amt || amt <= 0) {
                  alert('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
                  return;
                }
                const targetTrxId = selectedUnpaidTrxId && selectedUnpaidTrxId !== 'ALL' ? selectedUnpaidTrxId : undefined;
                if (repaymentSource === 'advance') {
                  if (amt > selectedBuyerAdvanceStats.currentAdvanceBalance) {
                    alert(`المبلغ المدخل (${formatCurrency(amt, settings.currency)}) يتجاوز رصيد القدمة المتاح (${formatCurrency(selectedBuyerAdvanceStats.currentAdvanceBalance, settings.currency)})`);
                    return;
                  }
                  if (onSettleBuyerDebtFromAdvance) {
                    onSettleBuyerDebtFromAdvance(selectedBuyer.id, selectedBuyer.name, amt, repayNotes, targetTrxId);
                  }
                } else if (repaymentSource === 'exchange') {
                  if (onRepayBuyerDebt) {
                    onRepayBuyerDebt(selectedBuyer.id, selectedBuyer.name, amt, repayNotes, 'exchange', repayExchangeName.trim(), targetTrxId);
                  }
                } else {
                  if (onRepayBuyerDebt) {
                    onRepayBuyerDebt(selectedBuyer.id, selectedBuyer.name, amt, repayNotes, 'cash', undefined, targetTrxId);
                  }
                }
                setIsRepayModalOpen(false);
                setRepayExchangeName('');
                setSelectedUnpaidTrxId(null);
              }}
              className="mt-4 flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto min-h-0 pr-1 pl-1 space-y-4">
                {/* TOP ROW: BUYER INFO & PAYMENT SOURCE (2-COLUMN GRID) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                  <div className="space-y-2">
                    <div className="p-3 bg-red-50/90 border border-red-200 rounded-none space-y-1">
                      <div className="flex justify-between text-xs font-bold text-red-950">
                        <span>المشتري:</span>
                        <span>{selectedBuyer.name}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-red-950">
                        <span>إجمالي دين الشروات الحالي:</span>
                        <span className="font-mono text-red-700">
                          {formatCurrency(selectedBuyerDebt, settings.currency)}
                        </span>
                      </div>
                    </div>

                    {/* تنبيه وخيار سريع لتصفية الشروات الأصلية المعاد بيعها للغير */}
                    {resoldPendingTransactions.length > 0 && (
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-none flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-purple-950 font-bold">
                          <ArrowRightLeft className="w-4 h-4 text-purple-700 shrink-0" />
                          <div>
                            <span>توجد شروة أصلية معاد بيعها للغير ({formatCurrency(resoldPendingDebt, settings.currency)})</span>
                            <p className="text-[10px] text-purple-800 font-normal mt-0.5">
                              مُحوّلة ومطلوبة من المشتري الجديد، يمكنك تصفيتها وإبراء ذمة ({selectedBuyer.name}) دون إدخال نقد مكرر للصندوق.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSettleResold()}
                          className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-black rounded-none cursor-pointer shadow-xs transition-colors flex items-center gap-1.5 text-xs"
                          title="تصفية وإبراء ذمة المشتري من الشروة المعاد بيعها دون تكرار كاش الصندوق"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>تصفية وتسوية بإعادة البيع الآن ✓</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* PAYMENT SOURCE SELECTOR */}
                  <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-2">
                    <label className="block text-xs font-bold text-slate-700">طريقة ومصدر السداد:</label>
                    <div className={`grid gap-2 ${
                      resoldPendingTransactions.length > 0
                        ? 'grid-cols-2 sm:grid-cols-3'
                        : (selectedBuyerAdvanceStats.currentAdvanceBalance > 0 && buyerPendingSalesDues > 0)
                        ? 'grid-cols-2 sm:grid-cols-4'
                        : (selectedBuyerAdvanceStats.currentAdvanceBalance > 0 || buyerPendingSalesDues > 0)
                        ? 'grid-cols-3'
                        : 'grid-cols-2'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setRepaymentSource('cash')}
                        className={`p-2 rounded-none text-xs font-bold border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                          repaymentSource === 'cash'
                            ? 'bg-red-600 text-white border-red-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <HandCoins className="w-4 h-4" />
                        <span>نقد بالصندوق</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRepaymentSource('exchange')}
                        className={`p-2 rounded-none text-xs font-bold border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                          repaymentSource === 'exchange'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-blue-50'
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                        <span>عبر الصرافة</span>
                      </button>

                      {selectedBuyerAdvanceStats.currentAdvanceBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRepaymentSource('advance');
                            const maxAvail = Math.min(selectedBuyerDebt, selectedBuyerAdvanceStats.currentAdvanceBalance);
                            if (!repayAmount || Number(repayAmount) > maxAvail) {
                              setRepayAmount(maxAvail);
                            }
                          }}
                          className={`p-2 rounded-none text-xs font-bold border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                            repaymentSource === 'advance'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                          }`}
                        >
                          <Wallet className="w-4 h-4" />
                          <span>خصم من القدمة</span>
                        </button>
                      )}

                      {buyerPendingSalesDues > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRepaymentSource('offset');
                            setRepayNotes(`مقاصة مستحقات البيعات مع مديونية الشروات`);
                          }}
                          className={`p-2 rounded-none text-xs font-bold border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                            repaymentSource === 'offset'
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-purple-50'
                          }`}
                          title="مقاصة مالية بين مديونية الشروات ومستحقات بيعاته للآخرين"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                          <span>مقاصة بيعات</span>
                        </button>
                      )}

                      {resoldPendingTransactions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRepaymentSource('resale_settle');
                            setRepayNotes(`تصفية وتسوية دين الشروة الأصلية المعاد بيعها للغير`);
                          }}
                          className={`p-2 rounded-none text-xs font-bold border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                            repaymentSource === 'resale_settle'
                              ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                              : 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100'
                          }`}
                          title="تصفية وإبراء ذمة الشروة المعاد بيعها للغير دون تكرار إدخال النقد للصندوق"
                        >
                          <RotateCw className="w-4 h-4" />
                          <span>تسوية بإعادة البيع</span>
                        </button>
                      )}
                    </div>

                    {repaymentSource === 'exchange' && (
                      <div className="pt-2 border-t border-slate-300">
                        <label className="block text-[11px] font-bold text-blue-900 mb-1">
                          اسم محل الصرافة أو رقم الحوالة / السند:
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

                    {repaymentSource === 'advance' && (
                      <div className="text-[11px] text-emerald-900 bg-emerald-50 p-2 rounded-none border border-emerald-200 flex justify-between items-center font-bold">
                        <span>رصيد القدمة المتاح للمشتري:</span>
                        <span className="font-mono text-emerald-700">{formatCurrency(selectedBuyerAdvanceStats.currentAdvanceBalance, settings.currency)}</span>
                      </div>
                    )}
                  </div>
                </div>

              {/* RESALE SETTLEMENT RECONCILIATION SECTION */}
              {repaymentSource === 'resale_settle' ? (
                <div className="p-3.5 bg-purple-50/80 border border-purple-300 rounded-none space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-purple-200 pb-2 text-purple-950">
                    <span className="flex items-center gap-1.5">
                      <ArrowRightLeft className="w-4 h-4 text-purple-700" />
                      <span>تسوية وتصفية دين الشروات الأصلية المحولة والمعاد بيعها</span>
                    </span>
                    <span className="font-mono text-purple-800">
                      ({resoldPendingTransactions.length} شروة معاد بيعها)
                    </span>
                  </div>

                  <p className="text-xs text-purple-900 leading-relaxed">
                    هذه العملية تقوم بإبراء ذمة المشتري الحالي (<b>{selectedBuyer.name}</b>) من قيمة الشروة الأصلية التي تمت إعادة بيعها، واعتبارها مسوّاة ومسددة بالكامل دون تكرار قيد إيداع نقدي في كاش الدرج (لأن التحصيل النقدي سيتم من فاتورة المشتري الجديد).
                  </p>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800">
                      الشروات الأصلية المحولة المراد تسويتها:
                    </label>
                    <div className="max-h-48 overflow-y-auto space-y-2 border border-purple-200 rounded-none p-2 bg-white">
                      {resoldPendingTransactions.map((trx) => {
                        const debt = trx.buyerRemainingDebt !== undefined ? trx.buyerRemainingDebt : trx.totalFromBuyer;
                        const isChosen = !selectedUnpaidTrxId || selectedUnpaidTrxId === 'ALL' || selectedUnpaidTrxId === trx.id;
                        return (
                          <div
                            key={trx.id}
                            onClick={() => setSelectedUnpaidTrxId(selectedUnpaidTrxId === trx.id ? null : trx.id)}
                            className={`p-2.5 rounded-none border text-xs cursor-pointer transition-all flex items-center justify-between ${
                              isChosen
                                ? 'bg-purple-50/80 border-purple-400 text-purple-950 font-bold ring-1 ring-purple-300'
                                : 'bg-slate-50 border-slate-300 text-slate-600'
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-blue-700">#{trx.id}</span>
                                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                                  معاد بيعها إلى: {trx.resoldToBuyerName || 'مشتري آخر'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600">
                                {trx.items.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ')}
                              </div>
                            </div>
                            <div className="text-left font-mono font-black text-purple-900 text-sm">
                              {formatCurrency(debt, settings.currency)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-none text-xs text-emerald-950 font-bold flex justify-between items-center">
                    <span>إجمالي المبلغ الذي سيتم تسويته وإبراء ذمته:</span>
                    <span className="font-mono text-emerald-800 text-sm">
                      {formatCurrency(
                        selectedUnpaidTrxId && selectedUnpaidTrxId !== 'ALL'
                          ? (resoldPendingTransactions.find(t => t.id === selectedUnpaidTrxId)?.buyerRemainingDebt || 0)
                          : resoldPendingDebt,
                        settings.currency
                      )}
                    </span>
                  </div>
                </div>
              ) : repaymentSource === 'offset' ? (
                <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-none space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-purple-200/80 pb-2 text-purple-950">
                    <span className="flex items-center gap-1">
                      <ArrowRightLeft className="w-4 h-4 text-purple-700" />
                      <span>المقاصة المالية التلقائية بين الشروات والبيعات</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-none border border-red-200">
                      <span className="text-[10px] text-slate-500 block">مديونية الشروات الحالية:</span>
                      <span className="font-mono font-black text-red-700 text-sm">
                        {formatCurrency(selectedBuyerDebt, settings.currency)}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-none border border-emerald-200">
                      <span className="text-[10px] text-slate-500 block">مستحقات البيعات المعلقة:</span>
                      <span className="font-mono font-black text-emerald-700 text-sm">
                        {formatCurrency(buyerPendingSalesDues, settings.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Offset Result Preview */}
                  {buyerPendingSalesDues >= selectedBuyerDebt ? (
                    <div className="space-y-2.5 pt-1">
                      <div className="p-2.5 bg-emerald-100/80 border border-emerald-300 rounded-none text-emerald-950 text-xs font-medium">
                        ✓ <b className="font-bold">سيتم سداد وتصفية كامل دين الشروات ({formatCurrency(selectedBuyerDebt, settings.currency)}) بالكامل</b> وتصبح (0.00).
                        {buyerPendingSalesDues > selectedBuyerDebt && (
                          <div className="mt-1 text-emerald-900 font-bold">
                            يتبقى للمشتري/البائع فائض قدره: <span className="font-mono font-black text-emerald-800">{formatCurrency(buyerPendingSalesDues - selectedBuyerDebt, settings.currency)}</span>
                          </div>
                        )}
                      </div>

                      {buyerPendingSalesDues > selectedBuyerDebt && (
                        <div className="bg-white p-3 rounded-none border border-purple-200 space-y-2">
                          <span className="block text-[11px] font-bold text-slate-800">
                            كيف ترغب في معالجة الفائض المتبقي له ({formatCurrency(buyerPendingSalesDues - selectedBuyerDebt, settings.currency)})؟
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setOffsetSurplusAction('payout_cash')}
                              className={`p-2.5 rounded-none border text-right cursor-pointer text-xs font-bold transition-all ${
                                offsetSurplusAction === 'payout_cash'
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-1 ring-emerald-400 shadow-2xs'
                                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span>صرفه نقداً الآن</span>
                                {offsetSurplusAction === 'payout_cash' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                              </div>
                              <p className="text-[10px] text-slate-500 font-normal">
                                صرف الفائض نقداً من الصندوق له فوراً
                              </p>
                            </button>

                            <button
                              type="button"
                              onClick={() => setOffsetSurplusAction('deposit_advance')}
                              className={`p-2.5 rounded-none border text-right cursor-pointer text-xs font-bold transition-all ${
                                offsetSurplusAction === 'deposit_advance'
                                  ? 'bg-purple-50 border-purple-500 text-purple-950 ring-1 ring-purple-400 shadow-2xs'
                                  : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span>إيداع في القدمة</span>
                                {offsetSurplusAction === 'deposit_advance' && <Check className="w-3.5 h-3.5 text-purple-600" />}
                              </div>
                              <p className="text-[10px] text-slate-500 font-normal">
                                إضافة الفائض كرصيد قدمة لحسابه
                              </p>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-100/80 border border-amber-300 rounded-none text-amber-950 text-xs font-medium">
                      سيتم تصفية كامل مستحقات البيعات (<b className="font-mono font-bold">{formatCurrency(buyerPendingSalesDues, settings.currency)}</b>) وخصمها من مديونية الشروات، ويتبقى عليه دين قدره:{' '}
                      <b className="font-mono font-black text-amber-900">{formatCurrency(selectedBuyerDebt - buyerPendingSalesDues, settings.currency)}</b>.
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  {/* RIGHT COLUMN: Amount & Tafqeet */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {repaymentSource === 'advance' ? 'المبلغ المراد سداده خصماً من القدمة' : repaymentSource === 'exchange' ? 'المبلغ المراد سداده عبر الصرافة' : 'المبلغ المراد تحصيله / سداده نقداً'} ({settings.currency}) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        max={repaymentSource === 'advance' ? selectedBuyerAdvanceStats.currentAdvanceBalance : undefined}
                        value={repayAmount}
                        onChange={(e) => {
                          setRepayAmount(e.target.value === '' ? '' : Number(e.target.value));
                        }}
                        placeholder="أدخل المبلغ..."
                        className="w-full px-3 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                        required
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
                </div>

                {/* LEFT COLUMN: Targeted TRX & Unpaid Invoices List */}
                <div className="space-y-3">
                  {/* في حال تحديد فاتورة معينة للسداد الجزئي أو الكلي */}
                  {(() => {
                    if (!selectedUnpaidTrxId || selectedUnpaidTrxId === 'ALL') return null;
                    const targetedTrx = selectedBuyerUnpaidTransactions.find((t) => t.id === selectedUnpaidTrxId);
                    if (!targetedTrx) return null;
                    const debt =
                      targetedTrx.buyerRemainingDebt !== undefined
                        ? targetedTrx.buyerRemainingDebt
                        : targetedTrx.paymentStatus === 'pending' || targetedTrx.settlementType === 'association_credit'
                        ? targetedTrx.totalFromBuyer
                        : Math.max(0, targetedTrx.totalFromBuyer - (targetedTrx.buyerPaidAmount || 0));
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

                  {/* ------------------------------------------------------------- */}
                  {/* BUYER UNPAID PURCHASES LIST ("شروات المشتري المعلقة")          */}
                  {/* ------------------------------------------------------------- */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 flex-wrap gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-blue-600" />
                        <span>شروات / فواتير المشتري المعلقة ({selectedBuyerUnpaidTransactions.length}):</span>
                      </span>
                      {selectedBuyerUnpaidTransactions.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedUnpaidTrxId === 'ALL') {
                              setSelectedUnpaidTrxId(null);
                              setRepayAmount('');
                              setRepayNotes('');
                            } else {
                              setSelectedUnpaidTrxId('ALL');
                              const totalUnpaidDebt = selectedBuyerDebt;
                              const targetAmt = repaymentSource === 'advance'
                                ? Math.min(totalUnpaidDebt, selectedBuyerAdvanceStats.currentAdvanceBalance)
                                : totalUnpaidDebt;
                              setRepayAmount(targetAmt);
                              setRepayNotes(`سداد كافة الشروات والفواتير المعلقة بالكامل (${selectedBuyerUnpaidTransactions.length} شروة)`);
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

                    {selectedBuyerUnpaidTransactions.length === 0 ? (
                      <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-none text-center text-xs text-slate-500 font-medium">
                        لا توجد شروات معلقة لهذا المشتري.
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-300 rounded-none p-2 bg-slate-50/50 scrollbar-thin">
                        {selectedBuyerUnpaidTransactions.map((trx) => {
                          const debt =
                            trx.buyerRemainingDebt !== undefined
                              ? trx.buyerRemainingDebt
                              : trx.paymentStatus === 'pending' || trx.settlementType === 'association_credit'
                              ? trx.totalFromBuyer
                              : trx.settlementType === 'partial_cash'
                              ? Math.max(0, trx.totalFromBuyer - (trx.buyerPaidAmount || 0))
                              : 0;

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
                                  const targetAmt = repaymentSource === 'advance'
                                    ? Math.min(debt, selectedBuyerAdvanceStats.currentAdvanceBalance)
                                    : debt;
                                  setRepayAmount(targetAmt);
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

                              {(trx.wasResold || Boolean(trx.resoldToTransactionId) || Boolean(trx.resoldToBuyerName)) && (
                                <div className="flex items-center justify-between pt-1 mt-0.5 border-t border-purple-200 text-[11px]">
                                  <span className="text-purple-800 font-bold">
                                    معاد بيعها إلى: {trx.resoldToBuyerName || 'مشتري آخر'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSettleResold(trx.id);
                                    }}
                                    className="px-2 py-0.5 bg-purple-700 hover:bg-purple-800 text-white rounded text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                                    title="تصفية وتسوية هذه الشروة الأصلية دون تكرار إدخال النقد للصندوق"
                                  >
                                    تصفية وتسوية بإعادة البيع ✓
                                  </button>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ملاحظات أو بيان السداد (اختياري)
                </label>
                <input
                  type="text"
                  value={repayNotes}
                  onChange={(e) => setRepayNotes(e.target.value)}
                  placeholder="مثلاً: خصم من رصيد القدمة أو دفعة نقدية بالصندوق أو مقاصة بيعات..."
                  className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
                />
              </div>

              </div>

              {/* STICKY FOOTER ACTION BUTTONS */}
              <div className="shrink-0 flex items-center justify-end gap-2.5 pt-3 mt-3 border-t border-slate-300 bg-white">
                <button
                  type="button"
                  onClick={() => setIsRepayModalOpen(false)}
                  className="px-5 py-2.5 rounded-none text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className={`px-6 py-2.5 rounded-none text-xs font-black text-white shadow-xs cursor-pointer transition-colors flex items-center gap-1.5 ${
                    repaymentSource === 'resale_settle'
                      ? 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900'
                      : repaymentSource === 'offset'
                      ? 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900'
                      : repaymentSource === 'advance'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {repaymentSource === 'resale_settle' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد التسوية بإعادة البيع وإبراء الذمة ✓</span>
                    </>
                  ) : repaymentSource === 'offset' ? (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>تأكيد المقاصة المالية ✓</span>
                    </>
                  ) : repaymentSource === 'advance' ? (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>تأكيد السداد من رصيد القدمة ✓</span>
                    </>
                  ) : (
                    <>
                      <HandCoins className="w-4 h-4" />
                      <span>تأكيد التسديد النقدي</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Buyer Sales to Others (شروة وبيعة) */}
      {isBuyerSalesModalOpen && selectedBuyer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className="bg-white border border-slate-300 rounded-none w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl animate-in fade-in zoom-in-95 my-auto"
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-emerald-100 bg-emerald-50/70 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>سجل بيعات هذا المشتري (المبيعات للآخرين كـ بائع):</span>
                    <span className="px-2.5 py-0.5 rounded-none bg-emerald-100 text-emerald-800 text-xs font-mono font-bold">
                      {buyerSalesTransactions.length} عملية بيع
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    العمليات التي قام فيها ({selectedBuyer.name}) ببيع الأسماك لمشترين آخرين (خصم عمولة 2%، وإضافة 2% على المشتري الآخر)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBuyerSalesModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 rounded-none border border-slate-300">
                  <span className="text-[11px] text-slate-500 block font-semibold">عدد عمليات البيع</span>
                  <span className="text-lg font-black font-mono text-slate-900">{buyerSalesTransactions.length}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-none border border-slate-300">
                  <span className="text-[11px] text-slate-500 block font-semibold">إجمالي قيمة البيعات</span>
                  <span className="text-lg font-black font-mono text-slate-900">
                    {formatCurrency(buyerSalesMetrics.grossTotal, settings.currency)}
                  </span>
                </div>
                <div className="bg-rose-50/70 p-3 rounded-none border border-rose-200">
                  <span className="text-[11px] text-rose-700 block font-semibold">خصم العمولة (2%-)</span>
                  <span className="text-lg font-black font-mono text-rose-700">
                    -{formatCurrency(buyerSalesMetrics.taxTotal, settings.currency)}
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-none border border-emerald-300">
                  <span className="text-[11px] text-emerald-800 block font-bold">صافي مستحقات البيعات</span>
                  <span className="text-lg font-black font-mono text-emerald-700">
                    {formatCurrency(buyerSalesMetrics.netTotal, settings.currency)}
                  </span>
                </div>
                <div className="bg-teal-50/80 p-3 rounded-none border border-teal-300 col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-teal-800 block font-bold">إجمالي الفائض المحقق</span>
                  <span className="text-lg font-black font-mono text-teal-700">
                    +{formatCurrency(buyerSalesMetrics.surplusTotal, settings.currency)}
                  </span>
                </div>
              </div>

              {/* Outstanding sales dues banner */}
              {buyerPendingSalesDues > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-none flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-amber-950 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>المتبقي غير المصروف للمشتري من هذه البيعات:</span>
                  </div>
                  <span className="font-mono font-black text-amber-800 text-sm">
                    {formatCurrency(buyerPendingSalesDues, settings.currency)}
                  </span>
                </div>
              )}

              {/* Transactions Table */}
              <div className="overflow-x-auto border border-slate-300 rounded-none">
                <table className="w-full text-right text-xs">
                  <thead className="bg-emerald-50/70 text-slate-700 font-bold border-b border-slate-300">
                    <tr>
                      <th className="p-3">رقم العملية</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">المشتري منه</th>
                      <th className="p-3">الأصناف والكميات</th>
                      <th className="p-3 text-center">إجمالي القيمة</th>
                      <th className="p-3 text-center">خصم العمولة (2%-)</th>
                      <th className="p-3 text-center text-teal-900 bg-teal-50/60">الفائض</th>
                      <th className="p-3 text-center">صافي المستحق</th>
                      <th className="p-3 text-center">حالة الصرف</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {buyerSalesTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-500 bg-slate-50/50">
                          <div className="flex flex-col items-center justify-center gap-2 py-3">
                            <div className="w-9 h-9 rounded-none bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shadow-2xs">
                              <AlertCircle className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-slate-800 text-sm">
                              {buyerDayFilter !== 'all' || buyerSpecificDate.trim()
                                ? 'لا توجد بيعات مسجلة لهذا المشتري في هذا اليوم المحدد.'
                                : 'لا توجد عمليات بيع مسجلة لهذا المشتري.'}
                            </span>
                            {buyerDayFilter !== 'all' || buyerSpecificDate.trim() ? (
                              <p className="text-xs text-slate-400 font-medium">
                                لم يتم تسجيل أي عمليات بيع أو توريد أسماك لهذا المشتري في التاريخ المختار.
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      buyerSalesTransactions.map((t) => {
                        const isSellerPaid = t.sellerPaidStatus === 'paid' || (t.sellerPaidAmount !== undefined && t.sellerPaidAmount >= t.netToSeller);
                        const isSellerPartial = t.sellerPaidStatus === 'partial' || (t.sellerPaidAmount !== undefined && t.sellerPaidAmount > 0 && t.sellerPaidAmount < t.netToSeller);
                        return (
                          <tr key={t.id} className="hover:bg-emerald-50/30 transition-colors">
                            <td className="p-3 font-mono font-bold text-slate-900">
                              <div>{t.id}</div>
                              {t.resaleSurplus && t.resaleSurplus > 0 ? (
                                <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black font-mono">
                                  <span>فائض:</span>
                                  <span>+{formatCurrency(t.resaleSurplus, settings.currency)}</span>
                                </span>
                              ) : null}
                            </td>
                            <td className="p-3 text-slate-700">
                              <div>{formatDisplayDate(t.dateStr)}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{t.timeStr || ''}</div>
                            </td>
                            <td className="p-3 font-bold text-blue-900">{t.buyerName}</td>
                            <td className="p-3">
                              <div className="space-y-1">
                                {t.items.map((it, idx) => (
                                  <div key={idx} className="text-xs">
                                    <span className="font-bold text-slate-800">{it.fishName}</span>: {it.quantity} {it.unit} × {formatCurrency(it.unitPrice, '')}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-900">
                              {formatCurrency(t.grossAmount, settings.currency)}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-rose-600 bg-rose-50/40">
                              -{formatCurrency(t.sellerTaxAmount, settings.currency)}
                            </td>
                            <td className="p-3 text-center font-mono font-bold">
                              {t.resaleSurplus && t.resaleSurplus > 0 ? (
                                <span className="text-teal-900 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-black">
                                  +{formatCurrency(t.resaleSurplus, settings.currency)}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-normal">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                              {formatCurrency(t.netToSeller, settings.currency)}
                            </td>
                            <td className="p-3 text-center">
                              {isSellerPaid ? (
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 border border-emerald-300 rounded px-1.5 py-0.5 inline-block">
                                  {t.sellerPayoutMethod === 'exchange' ? 'مصروف عبر الصرافة ✓' : 'مسلّم بالكامل ✓'}
                                </span>
                              ) : isSellerPartial ? (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 border border-amber-300 rounded px-1.5 py-0.5 inline-block">
                                  متبقي له: {formatCurrency(t.sellerRemainingDebt || 0, settings.currency)}
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-red-600">
                                  مؤجل (مستحق له)
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenReceipt(t, 'seller')}
                                  className="p-1.5 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 cursor-pointer shadow-2xs transition-colors"
                                  title="طباعة إشعار صرف البائع (الصياد)"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingContext('seller');
                                    setEditingTransaction(t);
                                  }}
                                  className="p-1.5 rounded-none bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer shadow-2xs transition-colors"
                                  title="تعديل فاتورة البيع كـ بائع"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
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

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex justify-end">
              <button
                type="button"
                onClick={() => setIsBuyerSalesModalOpen(false)}
                className="px-5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-none hover:bg-slate-100 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Unified Buyer Advance & Loan Management (إدارة القدمة والسلف) */}
      {isAdvanceModalOpen && selectedBuyer && (
        <BuyerAdvanceModal
          isOpen={isAdvanceModalOpen}
          buyer={selectedBuyer}
          currentAdvanceBalance={selectedBuyerAdvanceStats.currentAdvanceBalance}
          availableSurplus={selectedBuyerAvailableSurplus}
          currentDebt={selectedBuyerDebt}
          currentDrawerCash={currentCashDrawer}
          loanBalance={totalBuyerAdvancesOwed}
          initialTab={advanceModalInitialTab}
          settings={settings}
          onClose={() => {
            setIsAdvanceModalOpen(false);
            setAdvanceModalInitialTab('advance');
          }}
          onSaveAdvanceEntry={(buyerId, buyerName, amount, type, notes, category) => {
            if (onSaveBuyerAdvanceEntry) {
              return onSaveBuyerAdvanceEntry({
                amount,
                type,
                category: category || (type === 'buyer_advance_deposit' ? 'قبض دفعة مقدمة (قدمة)' : 'استرداد دفعة مقدمة'),
                performedBy: 'أمين الصندوق',
                contactId: buyerId,
                contactName: buyerName,
                description: notes || '',
              });
            }
          }}
          onSaveBuyerLoan={(buyerId, buyerName, amount, notes) => {
            if (onSaveBuyerLoan) {
              const res = onSaveBuyerLoan(buyerId, buyerName, amount, notes);
              if (res) setSelectedBuyerLoanForPrint(res);
              return res;
            }
          }}
          onRepayBuyerLoanCash={(buyerId, buyerName, amount, notes) => {
            if (onRepayBuyerLoanCash) {
              const res = onRepayBuyerLoanCash(buyerId, buyerName, amount, notes);
              if (res) setSelectedBuyerLoanForPrint(res);
              return res;
            }
          }}
        />
      )}

      {/* MODAL: Single Repayment Voucher Print (A4 Official / Thermal 80mm) */}
      {selectedRepaymentForPrint && typeof document !== 'undefined' && createPortal(
        <div
          id="single-repayment-modal"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:p-0 print:bg-white print:fixed print:inset-0 print:z-[9999]"
        >
          <div
            className={`relative bg-white rounded-none w-full p-4 sm:p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 my-auto print:border-none print:shadow-none print:p-0 print:m-0 ${
              repaymentPrintMode === 'a4' ? 'max-w-4xl' : 'max-w-md'
            }`}
          >
            {/* Modal Controls Header (no-print) */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 mb-3 border-b border-slate-300 no-print">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">سند قبض مالي (سداد دين)</h3>
                  <span className="text-[11px] font-mono text-emerald-700 font-bold">
                    #{selectedRepaymentForPrint.id}
                  </span>
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="inline-flex p-1 bg-slate-100 rounded-none text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setRepaymentPrintMode('a4')}
                  className={`px-3 py-1.5 rounded-none transition-all flex items-center gap-1.5 cursor-pointer ${
                    repaymentPrintMode === 'a4'
                      ? 'bg-white text-emerald-800 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>سند رسمي A4 (نسختان)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRepaymentPrintMode('thermal')}
                  className={`px-3 py-1.5 rounded-none transition-all flex items-center gap-1.5 cursor-pointer ${
                    repaymentPrintMode === 'thermal'
                      ? 'bg-white text-emerald-800 shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>إيصال حراري (80mm)</span>
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                {repaymentPrintMode === 'a4' ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await printReceiptVoucherA4Direct(
                          selectedRepaymentForPrint,
                          settings,
                          selectedRepaymentForPrint.contactName || selectedBuyer?.name,
                          'سند قبض مالي (سداد دين)'
                        );
                        if (res?.message) {
                          setRepaymentExportMsg(res.message);
                          setTimeout(() => setRepaymentExportMsg(null), 3500);
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs active:scale-95"
                      title="طباعة السند مباشرة بجودة متجهات A4 [Ctrl+P]"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة سند A4 فوري</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExportingRepaymentPdf}
                      onClick={async () => {
                        setIsExportingRepaymentPdf(true);
                        try {
                          const res = await exportReceiptVoucherPdfA4(
                            selectedRepaymentForPrint,
                            settings,
                            selectedRepaymentForPrint.contactName || selectedBuyer?.name,
                            'سند قبض مالي (سداد دين)'
                          );
                          if (res?.message) {
                            setRepaymentExportMsg(res.message);
                            setTimeout(() => setRepaymentExportMsg(null), 3500);
                          }
                        } catch (err: any) {
                          setRepaymentExportMsg(err.message || 'حدث خطأ أثناء تصدير PDF');
                          setTimeout(() => setRepaymentExportMsg(null), 3500);
                        } finally {
                          setIsExportingRepaymentPdf(false);
                        }
                      }}
                      className="px-3 py-1.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs active:scale-95 disabled:opacity-50"
                      title="تصدير السند كملف PDF رسمي بحجم A4"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isExportingRepaymentPdf ? 'جارٍ التصدير...' : 'حفظ PDF (A4)'}</span>
                    </button>
                    <ShareOptionsDropdown
                      onShare={async (target) => {
                        setIsExportingRepaymentPdf(true);
                        try {
                          const res = await shareReceiptVoucherPdf(
                            selectedRepaymentForPrint,
                            settings,
                            target,
                            selectedRepaymentForPrint.contactName || selectedBuyer?.name,
                            'سند قبض مالي (سداد دين)'
                          );
                          if (res?.message) {
                            setRepaymentExportMsg(res.message);
                            setTimeout(() => setRepaymentExportMsg(null), 3500);
                          }
                        } catch (err: any) {
                          setRepaymentExportMsg(err?.message || 'حدث خطأ أثناء المشاركة');
                          setTimeout(() => setRepaymentExportMsg(null), 3500);
                        } finally {
                          setIsExportingRepaymentPdf(false);
                        }
                      }}
                      isSharing={isExportingRepaymentPdf}
                      title="مشاركة سند القبض المالي A4 (LocalSend، بلوتوث، ويندوز)"
                      buttonClassName="p-2 rounded-none bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs active:scale-95 disabled:opacity-50"
                      iconClassName="w-4 h-4 text-white"
                      align="left"
                      id="repayment-voucher-share-btn"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs active:scale-95"
                    title="طباعة إيصال حراري فوري 80mm [Ctrl+P]"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة حرارية (80mm)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedRepaymentForPrint(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
                  title="إغلاق [Esc]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Toast Notification message */}
            {repaymentExportMsg && (
              <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded-none text-emerald-800 text-xs font-bold text-center animate-in fade-in">
                {repaymentExportMsg}
              </div>
            )}

            {/* Mode Content Preview */}
            {repaymentPrintMode === 'a4' ? (
              <div className="bg-slate-100/70 p-3 sm:p-5 rounded-none border border-slate-300 max-h-[72vh] overflow-y-auto space-y-4 font-sans">
                {/* Notice bar */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-none p-2.5 text-xs text-emerald-800 font-bold flex items-center justify-between">
                  <span>📄 معاينة سند القبض الرسمي بحجم A4 (نسختان للورقة مع خط قص فاصل)</span>
                  <span className="text-[11px] text-emerald-700">دقة متجهات نقية 100%</span>
                </div>

                {/* Slip 1: Customer Copy */}
                <div className="bg-white border-2 border-slate-800 rounded-none p-4 shadow-xs relative">
                  <div className="flex justify-between items-center border-b-2 border-slate-800 pb-2.5 mb-3">
                    <div className="flex items-center gap-3">
                      <img src="/logo.png" alt="شعار" className="w-12 h-12 object-contain" />
                      <div>
                        <h4 className="text-sm font-black text-slate-900 leading-tight">{settings.marketName}</h4>
                        <p className="text-[10px] font-bold text-slate-600">{settings.subTitle}</p>
                        <p className="text-[9px] text-slate-400">{settings.location || 'م/شبوة - رضوم - عين بامعبد'}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="bg-slate-900 text-white px-3 py-1 rounded text-xs font-black">
                        سند قبض مالي (سداد دين)
                      </div>
                      <div className="text-[10px] font-bold text-emerald-700 mt-1">
                        ● النسخة الأصلية (المشتري / المسدد)
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <div className="border border-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded text-center">
                        <span className="text-[9px] text-emerald-800 block">رقم السند</span>
                        <span className="text-xs font-black text-emerald-900">{selectedRepaymentForPrint.id}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        {selectedRepaymentForPrint.dateStr} {selectedRepaymentForPrint.timeStr}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                    <div className="sm:col-span-1 border-2 border-emerald-600 bg-emerald-50/70 rounded-none p-2.5 text-center">
                      <span className="text-[10px] font-bold text-emerald-800 block mb-0.5">المبلغ المقبوض</span>
                      <span className="text-xl font-black font-mono text-emerald-950">
                        {formatCurrency(selectedRepaymentForPrint.amount, settings.currency)}
                      </span>
                    </div>
                    <div className="sm:col-span-2 border border-slate-300 bg-slate-50 rounded-none p-2.5 flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-slate-500 block mb-0.5">المبلغ كتابةً بالحروف:</span>
                      <span className="text-xs font-bold text-slate-900">
                        فقط {tafqeet(selectedRepaymentForPrint.amount, settings.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50/70 border border-slate-300 rounded-none p-3 text-xs space-y-1.5 mb-3">
                    <div className="flex justify-between border-b border-dashed border-slate-300 pb-1.5">
                      <div>
                        <span className="text-slate-500 font-medium">استلمنا من الأخ / المشتري:</span>
                        <strong className="text-slate-900 mr-2 text-sm">{selectedRepaymentForPrint.contactName || selectedBuyer?.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">طريقة السداد:</span>
                        <strong className="text-emerald-700 mr-1.5">نقداً (صندوق الإدارة)</strong>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <div>
                        <span className="text-slate-500 font-medium">وذلك مقابل / عن:</span>
                        <span className="text-slate-800 font-bold mr-2">{selectedRepaymentForPrint.description || 'سداد دين مالي'}</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-bold">✓ إشعار قيد مالي معتمد</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center text-xs pt-1">
                    <div>
                      <span className="text-slate-600 font-bold block mb-5">توقيع المسدد (المشتري):</span>
                      <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold block mb-1">أمين الصندوق / المستلم:</span>
                      <span className="text-xs font-black text-slate-900 block mb-1">{settings.employeeName || selectedRepaymentForPrint.performedBy || 'أمين الصندوق'}</span>
                      <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold block mb-1">اعتماد الإدارة والختم:</span>
                      <div className="border border-dashed border-slate-300 rounded h-8 w-20 mx-auto flex items-center justify-center text-[9px] text-slate-400">الختم الرسمي</div>
                    </div>
                  </div>
                </div>

                {/* Cut Line */}
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-400 py-1">
                  <div className="flex-1 border-b-2 border-dashed border-slate-300"></div>
                  <span className="flex items-center gap-1 bg-slate-200 px-3 py-0.5 rounded-none text-[11px] text-slate-600">
                    ✂ خط قص فاصل (فصل نسخة المشتري عن نسخة الإدارة والأرشيف)
                  </span>
                  <div className="flex-1 border-b-2 border-dashed border-slate-300"></div>
                </div>

                {/* Slip 2: Archive Copy */}
                <div className="bg-white border-2 border-slate-800 rounded-none p-4 shadow-xs relative opacity-90">
                  <div className="flex justify-between items-center border-b-2 border-slate-800 pb-2.5 mb-3">
                    <div className="flex items-center gap-3">
                      <img src="/logo.png" alt="شعار" className="w-12 h-12 object-contain" />
                      <div>
                        <h4 className="text-sm font-black text-slate-900 leading-tight">{settings.marketName}</h4>
                        <p className="text-[10px] font-bold text-slate-600">{settings.subTitle}</p>
                        <p className="text-[9px] text-slate-400">{settings.location || 'م/شبوة - رضوم - عين بامعبد'}</p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="bg-slate-900 text-white px-3 py-1 rounded text-xs font-black">
                        سند قبض مالي (سداد دين)
                      </div>
                      <div className="text-[10px] font-bold text-blue-700 mt-1">
                        ● نسخة الإدارة والحسابات (الأرشيف)
                      </div>
                    </div>
                    <div className="text-left font-mono">
                      <div className="border border-blue-600 bg-blue-50 px-2.5 py-0.5 rounded text-center">
                        <span className="text-[9px] text-blue-800 block">رقم السند</span>
                        <span className="text-xs font-black text-blue-900">{selectedRepaymentForPrint.id}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1">
                        {selectedRepaymentForPrint.dateStr} {selectedRepaymentForPrint.timeStr}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
                    <div className="sm:col-span-1 border-2 border-blue-600 bg-blue-50/70 rounded-none p-2.5 text-center">
                      <span className="text-[10px] font-bold text-blue-800 block mb-0.5">المبلغ المقبوض</span>
                      <span className="text-xl font-black font-mono text-blue-950">
                        {formatCurrency(selectedRepaymentForPrint.amount, settings.currency)}
                      </span>
                    </div>
                    <div className="sm:col-span-2 border border-slate-300 bg-slate-50 rounded-none p-2.5 flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-slate-500 block mb-0.5">المبلغ كتابةً بالحروف:</span>
                      <span className="text-xs font-bold text-slate-900">
                        فقط {tafqeet(selectedRepaymentForPrint.amount, settings.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-slate-50/70 border border-slate-300 rounded-none p-3 text-xs space-y-1.5 mb-3">
                    <div className="flex justify-between border-b border-dashed border-slate-300 pb-1.5">
                      <div>
                        <span className="text-slate-500 font-medium">استلمنا من الأخ / المشتري:</span>
                        <strong className="text-slate-900 mr-2 text-sm">{selectedRepaymentForPrint.contactName || selectedBuyer?.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">طريقة السداد:</span>
                        <strong className="text-blue-700 mr-1.5">نقداً (صندوق الإدارة)</strong>
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <div>
                        <span className="text-slate-500 font-medium">وذلك مقابل / عن:</span>
                        <span className="text-slate-800 font-bold mr-2">{selectedRepaymentForPrint.description || 'سداد دين مالي'}</span>
                      </div>
                      <span className="text-[10px] text-blue-700 font-bold">✓ إشعار قيد مالي معتمد</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center text-xs pt-1">
                    <div>
                      <span className="text-slate-600 font-bold block mb-5">توقيع المسدد (المشتري):</span>
                      <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold block mb-1">أمين الصندوق / المستلم:</span>
                      <span className="text-xs font-black text-slate-900 block mb-1">{settings.employeeName || selectedRepaymentForPrint.performedBy || 'أمين الصندوق'}</span>
                      <div className="border-b border-dashed border-slate-300 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold block mb-1">اعتماد الإدارة والختم:</span>
                      <div className="border border-dashed border-slate-300 rounded h-8 w-20 mx-auto flex items-center justify-center text-[9px] text-slate-400">الختم الرسمي</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Printable Voucher Area: 80mm Thermal */
              <div className="printable-receipt-area p-4 border-2 border-slate-800 rounded-none bg-white space-y-4 my-2 text-xs max-w-[380px] mx-auto font-mono">
                <div className="text-center pb-3 border-b-2 border-slate-800">
                  <div className="flex justify-center mb-1.5">
                    <img
                      src="/logo.png"
                      alt="شعار سوق عين بامعبد المركزي"
                      className="w-20 h-20 object-contain mx-auto"
                    />
                  </div>
                  <h2 className="text-base font-black text-slate-900">{settings.marketName}</h2>
                  <p className="text-[11px] text-slate-600 font-bold">{settings.subTitle}</p>
                  <div className="inline-block mt-2 px-3 py-0.5 bg-slate-900 text-white rounded font-black text-xs">
                    سند قبض مالي (سداد دين)
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                    <span className="font-mono font-black text-emerald-700 text-sm">{selectedRepaymentForPrint.id}</span>
                  </div>
                  <div className="text-left">
                    <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedRepaymentForPrint.dateStr} {selectedRepaymentForPrint.timeStr}</span>
                  </div>
                </div>

                <div className="space-y-2 py-1 font-sans">
                  <div className="flex justify-between">
                    <span className="text-slate-500">استلمنا من المشتري:</span>
                    <span className="font-black text-slate-900">{selectedRepaymentForPrint.contactName || selectedBuyer?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">مبلغ وقدره:</span>
                    <span className="font-black font-mono text-emerald-700 text-sm">{formatCurrency(selectedRepaymentForPrint.amount, settings.currency)}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-300 text-[11px] font-bold text-slate-800 text-center leading-relaxed">
                    {tafqeet(selectedRepaymentForPrint.amount, settings.currency)}
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">وذلك عن:</span>
                    <span className="font-medium text-slate-800">{selectedRepaymentForPrint.description}</span>
                  </div>
                </div>

                <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <span className="text-slate-600 font-bold block mb-8">توقيع المستلم:</span>
                    <div className="border-b border-dashed border-slate-400 mx-4"></div>
                  </div>
                  <div>
                    <span className="text-slate-600 font-bold block mb-8">توقيع المسدد:</span>
                    <div className="border-b border-dashed border-slate-400 mx-4"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Footer (no-print) */}
            <div className="no-print pt-3 mt-2 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
              <span>يمكنك إغلاق النافذة [Esc] أو استخدام أزرار الطباعة بالأعلى</span>
              <button
                type="button"
                onClick={() => setSelectedRepaymentForPrint(null)}
                className="px-4 py-1.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Cancel Debt Repayment and Revert to Debt */}
      {repaymentToCancel && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100 text-rose-600">
              <div className="w-10 h-10 rounded-none bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">إلغاء سند سداد الدين وإرجاعه ديناً</h3>
                <p className="text-[11px] text-slate-500 font-mono">سند قبض رقم #{repaymentToCancel.id}</p>
              </div>
            </div>

            <div className="py-4 space-y-3">
              <div className="p-3 bg-amber-50 rounded-none border border-amber-200 text-xs text-amber-900 font-bold leading-relaxed">
                هل أنت متأكد من إلغاء هذا السداد وإعادة قيد المبلغ ديناً على المشتري؟
              </div>

              <div className="bg-slate-50 p-3 rounded-none border border-slate-300 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">المشتري:</span>
                  <span className="font-black text-slate-900">{repaymentToCancel.contactName || selectedBuyer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">المبلغ المسدد:</span>
                  <span className="font-mono font-black text-rose-600 text-sm">{formatCurrency(repaymentToCancel.amount, settings.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">التاريخ:</span>
                  <span className="font-mono text-slate-700">{repaymentToCancel.dateStr} {repaymentToCancel.timeStr}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                ⚠️ عند التأكيد: سيتم حذف هذا السند نهائياً من الصندوق، وخصم الـ {formatCurrency(repaymentToCancel.amount, settings.currency)} من رصيد كاش الدرج، وإعادة قيدها كدين في ذمة المشتري فوراً.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRepaymentToCancel(null)}
                className="px-4 py-2 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteCashEntry) {
                    onDeleteCashEntry(repaymentToCancel.id);
                  }
                  setRepaymentToCancel(null);
                }}
                className="px-4 py-2 rounded-none bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs shadow-rose-600/20 transition-all cursor-pointer"
              >
                نعم، إلغاء السداد وإرجاعه ديناً
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: Edit Debt Repayment Voucher */}
      {editingRepaymentEntry && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 text-right" dir="rtl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3 text-amber-600">
                <div className="w-10 h-10 rounded-none bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">تعديل سند سداد دين نقدي</h3>
                  <p className="text-[11px] text-slate-500 font-mono">سند قبض رقم #{editingRepaymentEntry.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRepaymentEntry(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="bg-slate-50 p-3 rounded-none border border-slate-300 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">المشتري:</span>
                  <span className="font-black text-slate-900">{editingRepaymentEntry.contactName || selectedBuyer?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">المبلغ الحالي المقيد:</span>
                  <span className="font-mono font-black text-slate-700 text-sm">
                    {formatCurrency(editingRepaymentEntry.amount, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">التاريخ والوقت:</span>
                  <span className="font-mono text-slate-700">{editingRepaymentEntry.dateStr} {editingRepaymentEntry.timeStr}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    المبلغ الجديد للسند ({settings.currency}):
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditRepaymentAmountInput('0')}
                      className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-none border border-slate-300 transition-colors cursor-pointer"
                    >
                      تصفير (0)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditRepaymentAmountInput(String(editingRepaymentEntry.amount || 0))}
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded-none border border-amber-200 transition-colors cursor-pointer"
                    >
                      المبلغ المسجل ({editingRepaymentEntry.amount || 0})
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    dir="ltr"
                    value={editRepaymentAmountInput}
                    onChange={(e) => {
                      const val = e.target.value
                        .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
                        .replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      const sanitized = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : val;
                      setEditRepaymentAmountInput(sanitized);
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveEditRepayment();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingRepaymentEntry(null);
                      }
                    }}
                    className="w-full pl-3 pr-3 py-2 bg-white border border-slate-300 rounded-none text-slate-900 font-mono font-black text-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all text-left"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البيان والتفاصيل (الملاحظات):
                </label>
                <input
                  type="text"
                  value={editRepaymentNotesInput}
                  onChange={(e) => setEditRepaymentNotesInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEditRepayment();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingRepaymentEntry(null);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-none text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-all"
                  placeholder="ملاحظات أو بيان السند..."
                />
              </div>

              {/* الأثر المالي للتعديل */}
              {(() => {
                const newAmt = parseFloat(editRepaymentAmountInput) || 0;
                const oldAmt = editingRepaymentEntry.amount || 0;
                const diff = newAmt - oldAmt;
                if (diff > 0) {
                  return (
                    <div className="p-2.5 bg-emerald-50 rounded-none border border-emerald-200 text-[11px] text-emerald-800 font-medium leading-relaxed">
                      💡 <strong>زيادة سداد (+{formatCurrency(diff, settings.currency)}):</strong> سيتم إيداع الفارق في كاش الدرج وتخفيض ديون المشتري المتبقية فوراً.
                    </div>
                  );
                } else if (diff < 0) {
                  return (
                    <div className="p-2.5 bg-rose-50 rounded-none border border-rose-200 text-[11px] text-rose-800 font-medium leading-relaxed">
                      ⚠️ <strong>تخفيض سداد (-{formatCurrency(Math.abs(diff), settings.currency)}):</strong> سيتم خصم الفارق من كاش الدرج وإعادة قيده كدين في ذمة المشتري فوراً.
                    </div>
                  );
                }
                return (
                  <div className="p-2 bg-slate-50 rounded-none border border-slate-300 text-[11px] text-slate-500 font-medium text-center">
                    المبلغ متطابق (تعديل البيان فقط)
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingRepaymentEntry(null)}
                className="px-4 py-2 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEditRepayment}
                className="px-4 py-2 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs shadow-amber-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                حفظ وتثبيت التعديل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Payout Seller (تسليم وصرف مستحقات الصياد) */}
      {isPayoutModalOpen && selectedSeller && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-4 sm:p-5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <HandCoins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    تسليم وصرف مستحقات الصياد
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    صرف المستحقات وتوليد سند صرف رسمي
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPayoutModalOpen(false);
                  setTargetTransactionForPayout(null);
                }}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingPayout) return;
                const settleAmt = isAdvanceSettlementEnabled ? (Number(advanceSettlementAmount) || 0) : 0;
                const cashAmt = Number(payoutAmount) || 0;
                const totalDeductedFromCatch = settleAmt + cashAmt;

                const effectiveCatchDues = targetTransactionForPayout
                  ? Math.max(0, targetTransactionForPayout.netToSeller - (targetTransactionForPayout.sellerPaidStatus === 'paid' ? targetTransactionForPayout.netToSeller : (targetTransactionForPayout.sellerPaidAmount || targetTransactionForPayout.paidAtPosAmount || 0)))
                  : remainingSellerBalance;

                if (settleAmt <= 0 && cashAmt <= 0) {
                  alert('يرجى تحديد مبلغ للمقاصة أو إدخال مبلغ للصرف النقدي');
                  return;
                }

                if (settleAmt > totalSellerAdvancesOwed) {
                  alert(`مبلغ المقاصة (${formatCurrency(settleAmt, settings.currency)}) يتجاوز إجمالي سلفة الصياد القائمة (${formatCurrency(totalSellerAdvancesOwed, settings.currency)})`);
                  return;
                }

                if (totalDeductedFromCatch > effectiveCatchDues) {
                  alert(`إجمالي المبلغ المطلوب تسويته وصرفه (${formatCurrency(totalDeductedFromCatch, settings.currency)}) يتجاوز إجمالي مستحقات الصياد القائمة (${formatCurrency(effectiveCatchDues, settings.currency)})`);
                  return;
                }

                if (payoutMethod === 'cash' && cashAmt > currentCashDrawer) {
                  alert(
                    `🚫 يمنع منعاً باتاً الاحتساب بسالب في الصندوق!\n\n` +
                    `المبلغ المطلوب صرفه نقداً (${formatCurrency(cashAmt, settings.currency)}) يتجاوز رصيد الصندوق المتوفر (${formatCurrency(currentCashDrawer, settings.currency)}).\n\n` +
                    `يتم صرف المتاح بالصندوق فقط (${formatCurrency(currentCashDrawer, settings.currency)})، أو اختيار طريقة الصرف (عبر الصرافة).`
                  );
                  setPayoutAmount(Math.max(0, currentCashDrawer));
                  return;
                }

                const deferredDebt = effectiveCatchDues - totalDeductedFromCatch;
                let finalPayoutNotes = payoutNotes ? payoutNotes.trim() : '';
                if (payoutMethod === 'exchange') {
                  const exNote = `تم التسديد والصرف عبر الصرافة: ${payoutExchangeName.trim() || 'حوالة صرافة'}`;
                  finalPayoutNotes = finalPayoutNotes ? `${finalPayoutNotes} - ${exNote}` : exNote;
                }
                if (deferredDebt > 0) {
                  const deferredNote = `(المتبقي ديناً مؤجلاً في ذمة الجمعية: ${formatCurrency(deferredDebt, settings.currency)})`;
                  finalPayoutNotes = finalPayoutNotes ? `${finalPayoutNotes} - ${deferredNote}` : deferredNote;
                }

                setIsSubmittingPayout(true);
                try {
                  if (onPayoutSeller) {
                    const res = onPayoutSeller(
                      selectedSeller.id,
                      selectedSeller.name,
                      cashAmt,
                      finalPayoutNotes,
                      settleAmt,
                      targetTransactionForPayout?.id,
                      payoutMethod,
                      payoutExchangeName.trim()
                    );
                    if (res && typeof res === 'object') {
                      if ('settlementEntry' in res || 'payoutEntry' in res) {
                        const dual = res as { payoutEntry?: CashEntry; settlementEntry?: CashEntry };
                        if (dual.payoutEntry && dual.settlementEntry) {
                          setSelectedSellerPayoutForPrint(dual.payoutEntry);
                          setPendingSettlementPrint(dual.settlementEntry);
                        } else if (dual.payoutEntry) {
                          setSelectedSellerPayoutForPrint(dual.payoutEntry);
                        } else if (dual.settlementEntry) {
                          setSelectedSettlementForPrint(dual.settlementEntry);
                        }
                      } else if ('id' in res) {
                        setSelectedSellerPayoutForPrint(res as CashEntry);
                      }
                    }
                  }
                  setIsPayoutModalOpen(false);
                  setTargetTransactionForPayout(null);
                } finally {
                  setIsSubmittingPayout(false);
                }
              }}
              className="mt-3 space-y-3 text-xs"
            >
              {/* Target Transaction Banner if paying a specific invoice */}
              {targetTransactionForPayout && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-none flex items-center justify-between text-xs font-bold text-emerald-950">
                  <div className="flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>فاتورة: <span className="font-mono text-emerald-800">{targetTransactionForPayout.id}</span></span>
                  </div>
                  <span className="font-mono text-emerald-900 bg-white border border-emerald-200 px-2 py-0.5 rounded-none text-[11px]">
                    {formatCurrency(targetTransactionForPayout.netToSeller, settings.currency)}
                  </span>
                </div>
              )}

              {/* Clean Seller Info & Remaining Due Card */}
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-none flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 block">الصياد:</span>
                  <span className="text-sm font-black text-slate-900">{selectedSeller.name}</span>
                </div>
                <div className="text-left">
                  <span className="text-[11px] text-emerald-700 block font-bold">المتبقي للصياد:</span>
                  <span className="font-mono font-black text-base text-emerald-700">
                    {formatCurrency(targetTransactionForPayout ? targetTransactionForPayout.netToSeller : remainingSellerBalance, settings.currency)}
                  </span>
                </div>
              </div>

              {/* Advance Settlement Section (Compact) */}
              {totalSellerAdvancesOwed > 0 && (
                <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-none space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isAdvanceSettlementEnabled}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setIsAdvanceSettlementEnabled(enabled);
                          if (enabled) {
                            const maxSettlement = Math.min(totalSellerAdvancesOwed, remainingSellerBalance);
                            setAdvanceSettlementAmount(maxSettlement);
                            const netCash = Math.max(0, remainingSellerBalance - maxSettlement);
                            setPayoutAmount(netCash);
                          } else {
                            setAdvanceSettlementAmount('');
                            setPayoutAmount(Math.max(0, remainingSellerBalance));
                          }
                        }}
                        className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                      />
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-amber-600" />
                        <span>خصم من سلفة الصياد القائمة</span>
                      </span>
                    </label>
                    <span className="text-[11px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-200">
                      السلفة: {formatCurrency(totalSellerAdvancesOwed, settings.currency)}
                    </span>
                  </div>

                  {isAdvanceSettlementEnabled && (
                    <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                      <input
                        type="number"
                        min="0"
                        max={Math.min(totalSellerAdvancesOwed, remainingSellerBalance)}
                        step="any"
                        value={advanceSettlementAmount}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value));
                          setAdvanceSettlementAmount(val);
                          const numVal = Number(val) || 0;
                          const netCash = Math.max(0, remainingSellerBalance - numVal);
                          setPayoutAmount(netCash);
                        }}
                        placeholder="مبلغ المقاصة..."
                        className="flex-1 px-2.5 py-1.5 rounded-none bg-white border border-amber-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const fullPossible = Math.min(totalSellerAdvancesOwed, remainingSellerBalance);
                          setAdvanceSettlementAmount(fullPossible);
                          const netCash = Math.max(0, remainingSellerBalance - fullPossible);
                          setPayoutAmount(netCash);
                        }}
                        className="text-[11px] font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 px-2 py-1.5 rounded-none border border-amber-300 cursor-pointer shrink-0"
                      >
                        خصم كامل السلفة ({formatCurrency(Math.min(totalSellerAdvancesOwed, remainingSellerBalance), '')})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method Selector */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-none">
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('cash')}
                    className={`py-1.5 px-2 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      payoutMethod === 'cash'
                        ? 'bg-white text-emerald-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>نقداً من الصندوق</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayoutMethod('exchange')}
                    className={`py-1.5 px-2 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      payoutMethod === 'exchange'
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>عبر الصرافة</span>
                  </button>
                </div>

                {payoutMethod === 'exchange' && (
                  <input
                    type="text"
                    value={payoutExchangeName}
                    onChange={(e) => setPayoutExchangeName(e.target.value)}
                    placeholder="اسم محل الصرافة أو رقم الحوالة..."
                    className="w-full px-3 py-1.5 bg-blue-50/50 border border-blue-300 rounded-none text-xs font-bold text-blue-950 focus:ring-1 focus:ring-blue-500 focus:bg-white"
                  />
                )}
              </div>

              {/* Cash / Exchange Payout Input Section */}
              {(() => {
                const modalTargetDues = targetTransactionForPayout
                  ? Math.max(0, targetTransactionForPayout.netToSeller - (targetTransactionForPayout.sellerPaidStatus === 'paid' ? targetTransactionForPayout.netToSeller : (targetTransactionForPayout.sellerPaidAmount || targetTransactionForPayout.paidAtPosAmount || 0)))
                  : Math.max(0, remainingSellerBalance - (isAdvanceSettlementEnabled ? (Number(advanceSettlementAmount) || 0) : 0));
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-700">
                        {payoutMethod === 'cash' ? 'المبلغ المراد صرفه وتسليمه' : 'المبلغ المحول'}:
                      </label>
                      <button
                        type="button"
                        onClick={() => setPayoutAmount(modalTargetDues)}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-none transition-colors"
                      >
                        صرف كامل المستحق ({formatCurrency(modalTargetDues, '')})
                      </button>
                    </div>

                    <input
                      type="number"
                      min="0"
                      max={payoutMethod === 'cash' ? Math.max(0, currentCashDrawer) : modalTargetDues}
                      step="any"
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-black text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                );
              })()}

              {/* Notes */}
              <div>
                <input
                  type="text"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="ملاحظات أو بيان إضافي (اختياري)..."
                  className="w-full px-3 py-1.5 rounded-none bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={
                    isSubmittingPayout ||
                    ((!advanceSettlementAmount || Number(advanceSettlementAmount) <= 0) && (!payoutAmount || Number(payoutAmount) <= 0)) ||
                    (payoutMethod === 'cash' && Number(payoutAmount) > currentCashDrawer) ||
                    ((isAdvanceSettlementEnabled ? (Number(advanceSettlementAmount) || 0) : 0) + (Number(payoutAmount) || 0) > (targetTransactionForPayout ? targetTransactionForPayout.netToSeller : remainingSellerBalance))
                  }
                  className={`flex-1 py-2.5 px-4 rounded-none text-white text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 ${
                    isSubmittingPayout ||
                    ((!advanceSettlementAmount || Number(advanceSettlementAmount) <= 0) && (!payoutAmount || Number(payoutAmount) <= 0)) ||
                    (payoutMethod === 'cash' && Number(payoutAmount) > currentCashDrawer) ||
                    ((isAdvanceSettlementEnabled ? (Number(advanceSettlementAmount) || 0) : 0) + (Number(payoutAmount) || 0) > (targetTransactionForPayout ? targetTransactionForPayout.netToSeller : remainingSellerBalance))
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer active:scale-98'
                  }`}
                >
                  <HandCoins className="w-4 h-4" />
                  <span>{isSubmittingPayout ? 'جاري التنفيذ...' : 'تأكيد العملية'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingPayout}
                  onClick={() => {
                    setIsPayoutModalOpen(false);
                    setTargetTransactionForPayout(null);
                  }}
                  className="py-2.5 px-4 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Single Seller Payout Voucher Print (Supports A4 & Thermal) */}
      {selectedSellerPayoutForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className={`bg-white rounded-none w-full shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 my-auto ${
            payoutPaperFormat === 'a4' ? 'max-w-4xl' : 'max-w-md'
          }`}>
            {/* Modal Header & Actions (No Print) */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-4 border-b border-slate-100 no-print">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 leading-tight">سند صرف نقدية (مستحقات صياد)</h3>
                  <p className="text-[11px] text-slate-500 font-bold">وثيقة إثبات صرف رسمي ومطابقة المستحقات</p>
                </div>
              </div>

              {/* Format Toggle: A4 vs Thermal */}
              <div className="flex items-center bg-slate-100 p-1 rounded-none border border-slate-300 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPayoutPaperFormat('a4')}
                  className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                    payoutPaperFormat === 'a4'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>ورق رسمي (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayoutPaperFormat('thermal')}
                  className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                    payoutPaperFormat === 'thermal'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>إيصال حراري (80mm)</span>
                </button>
              </div>

              {/* Action Buttons: طباعة / تحميل / WhatsApp */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 1. طباعة */}
                <button
                  type="button"
                  disabled={isPrintingPayoutA4}
                  onClick={async () => {
                    if (payoutPaperFormat === 'a4') {
                      try {
                        setIsPrintingPayoutA4(true);
                        const res = await printFishermanPayoutVoucherA4Direct(
                          selectedSellerPayoutForPrint,
                          settings,
                          {
                            seller: selectedSeller,
                            allSellerNetTotal,
                            totalSellerPayouts,
                            remainingSellerBalance,
                          }
                        );
                        if (res && res.message && !res.message.includes('إلغاء')) {
                          setPayoutToast(res.message);
                          setTimeout(() => setPayoutToast(null), 4000);
                        }
                      } catch (err: any) {
                        console.warn('Payout A4 direct print error, falling back:', err);
                        window.print();
                      } finally {
                        setIsPrintingPayoutA4(false);
                      }
                    } else {
                      window.print();
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all shadow-xs disabled:opacity-50"
                  title="طباعة سند الصرف مباشرة [Ctrl+P]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isPrintingPayoutA4 ? 'جارٍ الطباعة...' : 'طباعة'}</span>
                </button>

                {/* 2. تحميل PDF */}
                <button
                  type="button"
                  disabled={isExportingPayoutPdf}
                  onClick={async () => {
                    try {
                      setIsExportingPayoutPdf(true);
                      const res = await exportFishermanPayoutVoucherPdfA4(
                        selectedSellerPayoutForPrint,
                        settings,
                        {
                          seller: selectedSeller,
                          allSellerNetTotal,
                          totalSellerPayouts,
                          remainingSellerBalance,
                        }
                      );
                      if (res && res.message) {
                        setPayoutToast(res.message);
                        setTimeout(() => setPayoutToast(null), 4000);
                      }
                    } catch (err: any) {
                      setPayoutToast('فشل تصدير سند الصرف PDF: ' + (err?.message || 'خطأ'));
                      setTimeout(() => setPayoutToast(null), 4000);
                    } finally {
                      setIsExportingPayoutPdf(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all border border-slate-300"
                  title="تحميل سند الصرف كملف PDF رسمي بحجم A4"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>{isExportingPayoutPdf ? 'جارٍ التحميل...' : 'تحميل'}</span>
                </button>

                {/* 3. WhatsApp */}
                <button
                  type="button"
                  disabled={isSendingWhatsAppPayout}
                  onClick={async () => {
                    const phoneToUse = selectedSeller?.phone || '';
                    const beneficiary = selectedSellerPayoutForPrint.contactName || selectedSeller?.name || 'الصياد';
                    try {
                      setIsSendingWhatsAppPayout(true);
                      let cleanPhone = phoneToUse.replace(/\D/g, '');
                      if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.slice(2);
                      if (cleanPhone.startsWith('0') && cleanPhone.length === 10) cleanPhone = '967' + cleanPhone.slice(1);
                      else if (cleanPhone.length === 9 && (cleanPhone.startsWith('7') || cleanPhone.startsWith('1'))) cleanPhone = '967' + cleanPhone;

                      // فتح محادثة واتساب فوراً في 0 مللي ثانية
                      if (cleanPhone) {
                        const directWaUrl = `whatsapp://send?phone=${cleanPhone}`;
                        if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                          (window as any).electronAPI.openExternal(directWaUrl).catch(() => {});
                        }
                      }

                      // توليد ملف PDF صامت وإرساله مباشرة
                      const pdfRes = await exportFishermanPayoutVoucherPdfA4(
                        selectedSellerPayoutForPrint,
                        settings,
                        {
                          seller: selectedSeller,
                          allSellerNetTotal,
                          totalSellerPayouts,
                          remainingSellerBalance,
                        },
                        true
                      );

                      if (pdfRes && pdfRes.savedPath && typeof window !== 'undefined' && (window as any).electronAPI?.sendWhatsAppFile) {
                        await (window as any).electronAPI.sendWhatsAppFile({
                          filePath: pdfRes.savedPath,
                          phone: cleanPhone,
                        });
                        setPayoutToast(`تم فتح WhatsApp وإرفاق سند الصرف (${beneficiary}) كملف PDF مباشرة!`);
                        setTimeout(() => setPayoutToast(null), 4000);
                      } else {
                        const msg = `*سند صرف نقدية - ${settings.marketName}*\nرقم السند: ${selectedSellerPayoutForPrint.id}\nالتاريخ: ${selectedSellerPayoutForPrint.dateStr}\nالمستفيد: ${beneficiary}\nالمبلغ: ${formatCurrency(selectedSellerPayoutForPrint.amount, settings.currency)}\nالبيان: ${selectedSellerPayoutForPrint.description || 'مستحقات حراج الأسماك'}`;
                        const waUrl = cleanPhone
                          ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
                          : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                        if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                          await (window as any).electronAPI.openExternal(waUrl);
                        } else {
                          window.open(waUrl, '_blank');
                        }
                      }
                    } catch (e: any) {
                      setPayoutToast('خطأ أثناء فتح واتساب: ' + (e?.message || ''));
                      setTimeout(() => setPayoutToast(null), 4000);
                    } finally {
                      setIsSendingWhatsAppPayout(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-none bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all border border-emerald-300 disabled:opacity-50"
                  title="إرسال سند الصرف عبر WhatsApp للمستفيد"
                >
                  {isSendingWhatsAppPayout ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                  ) : (
                    <WhatsAppIcon size={14} />
                  )}
                  <span>WhatsApp</span>
                </button>

                {pendingSettlementPrint && (
                  <button
                    type="button"
                    onClick={() => {
                      const st = pendingSettlementPrint;
                      setSelectedSellerPayoutForPrint(null);
                      setPendingSettlementPrint(null);
                      setSelectedSettlementForPrint(st);
                    }}
                    className="px-2.5 py-1.5 rounded-none bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>سند المقاصة ←</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedSellerPayoutForPrint(null);
                    if (pendingSettlementPrint) {
                      setSelectedSettlementForPrint(pendingSettlementPrint);
                      setPendingSettlementPrint(null);
                    }
                  }}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-all"
                  title="إغلاق السند"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Toast Feedback */}
            {payoutToast && (
              <div className="no-print mx-4 my-2 p-2.5 rounded-none bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 shadow-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{payoutToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPayoutToast(null)}
                  className="text-emerald-700 hover:text-emerald-950 font-black cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Modal Body: Scrollable Document Preview Area */}
            <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
              {payoutPaperFormat === 'a4' ? (
                /* ══ 1. A4 Official Cash Payout Voucher Layout ══ */
                <div className="bg-white border-2 border-slate-900 rounded-none p-6 sm:p-8 space-y-6 shadow-sm relative font-sans text-xs">
                  {/* Horizontal Developer Credit at bottom of paper */}
                  <div className="no-print absolute bottom-2 left-0 right-0 text-center text-[8px] font-mono font-bold text-slate-400 select-none pointer-events-none">
                    {INVOICE_MARGIN_CREDIT_TEXT}
                  </div>

                  {/* Header Box */}
                  <div className="border-2 border-slate-900 rounded-none p-4 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-3 items-center gap-4">
                    {/* Market Data */}
                    <div className="text-right space-y-0.5">
                      <h2 className="text-lg sm:text-xl font-black text-slate-900">{settings.marketName}</h2>
                      <p className="text-xs text-slate-600 font-bold">{settings.subTitle}</p>
                      <div className="text-[11px] text-slate-500 font-medium">هاتف: {settings.contactPhone || '782191112'}</div>
                      <div className="text-[11px] text-slate-500 font-medium">العنوان: {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}</div>
                    </div>

                    {/* Logo & Document Title Badge */}
                    <div className="text-center flex flex-col items-center justify-center">
                      <img
                        src="/logo.png"
                        alt="شعار السوق"
                        className="w-24 h-24 object-contain mx-auto block mb-1 drop-shadow-xs"
                      />
                      <div className="inline-block px-3.5 py-1 bg-slate-900 text-white rounded-none font-black text-xs sm:text-sm">
                        سند صرف نقدية (تسليم مستحقات صياد)
                      </div>
                    </div>

                    {/* Document Meta Tag Box */}
                    <div className="text-left font-mono flex flex-col items-end justify-center">
                      <div className="border-2 border-slate-900 bg-white rounded-none px-4 py-1.5 text-center min-w-[170px] shadow-2xs mb-1">
                        <span className="text-[10px] text-slate-500 font-bold block">رقم السند المالي</span>
                        <span className="text-base font-black text-emerald-700 block">{selectedSellerPayoutForPrint.id}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-sans text-right space-y-0.5" dir="rtl">
                        <div>التاريخ: <strong className="text-slate-900 font-mono">{selectedSellerPayoutForPrint.dateStr}</strong></div>
                        <div>الوقت: <strong className="text-slate-900 font-mono">{selectedSellerPayoutForPrint.timeStr}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Main Payout Data Grid */}
                  <div className="border-2 border-slate-900 rounded-none overflow-hidden divide-y divide-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
                      <div className="bg-slate-50 p-3 font-black text-slate-700 border-l border-slate-300 flex items-center">
                        صُرف للأخ / الصياد:
                      </div>
                      <div className="p-3 font-black text-slate-900 text-sm flex items-center gap-2">
                        <span>{selectedSellerPayoutForPrint.contactName || selectedSeller?.name || 'غير محدد'}</span>
                        {selectedSeller?.phone && (
                          <span className="text-xs font-mono font-bold text-slate-500">({selectedSeller.phone})</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
                      <div className="bg-slate-50 p-3 font-black text-slate-700 border-l border-slate-300 flex items-center">
                        مبلغ وقدره:
                      </div>
                      <div className="p-3 flex items-center">
                        <div className="inline-flex items-baseline gap-1.5 bg-emerald-50 border-2 border-emerald-500 px-3.5 py-1 rounded-none text-emerald-800 font-mono font-black text-base">
                          <span>{formatCurrency(selectedSellerPayoutForPrint.amount, '')}</span>
                          <span className="text-xs font-sans font-bold">{settings.currency}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
                      <div className="bg-slate-50 p-3 font-black text-slate-700 border-l border-slate-300 flex items-center">
                        فقط وقدره:
                      </div>
                      <div className="p-3">
                        <div className="bg-slate-50 border border-slate-300 rounded-none p-2.5 font-bold text-slate-900 text-xs">
                          {tafqeet(selectedSellerPayoutForPrint.amount, settings.currency)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
                      <div className="bg-slate-50 p-3 font-black text-slate-700 border-l border-slate-300 flex items-center">
                        البيان وسبب الصرف:
                      </div>
                      <div className="p-3 font-medium text-slate-800 leading-relaxed">
                        {selectedSellerPayoutForPrint.description || `تسليم وصرف مستحقات مبيعات أسماك بالحراج للأخ ${selectedSellerPayoutForPrint.contactName || selectedSeller?.name}`}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr]">
                      <div className="bg-slate-50 p-3 font-black text-slate-700 border-l border-slate-300 flex items-center">
                        طريقة الصرف:
                      </div>
                      <div className="p-3 font-black text-emerald-800 flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        <span>
                          {selectedSellerPayoutForPrint.payoutMethod === 'exchange' || selectedSellerPayoutForPrint.exchangeName
                            ? `عبر الصرافة (${selectedSellerPayoutForPrint.exchangeName || 'حوالة صرافة معتمدة'})`
                            : 'نقداً من خزينة صندوق الحراج (كاش)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Financial Balance Snapshot Box */}
                  <div className="bg-slate-50 border border-slate-300 rounded-none p-3.5 space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                      <span className="font-black text-slate-900 text-xs">كشف وموقف مستحقات الصياد حتى تحرير هذا السند:</span>
                      <span className="text-[10px] text-slate-500 font-bold">مطابقة محاسبية معتمدة</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-white border border-slate-300 rounded-none p-2.5 text-center">
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">إجمالي الصافي المستحق</span>
                        <span className="font-mono font-black text-slate-900 text-xs sm:text-sm">
                          {formatCurrency(allSellerNetTotal, settings.currency)}
                        </span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-300 rounded-none p-2.5 text-center">
                        <span className="text-[10px] text-emerald-700 font-bold block mb-1">المصروف بهذا السند</span>
                        <span className="font-mono font-black text-emerald-800 text-xs sm:text-sm">
                          {formatCurrency(selectedSellerPayoutForPrint.amount, settings.currency)}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-300 rounded-none p-2.5 text-center">
                        <span className="text-[10px] text-slate-500 font-bold block mb-1">إجمالي المسلم حتى تاريخه</span>
                        <span className="font-mono font-black text-emerald-700 text-xs sm:text-sm">
                          {formatCurrency(totalSellerPayouts, settings.currency)}
                        </span>
                      </div>
                      <div className="bg-amber-50 border border-amber-300 rounded-none p-2.5 text-center">
                        <span className="text-[10px] text-amber-800 font-bold block mb-1">المتبقي المؤجل على الجمعية</span>
                        <span className="font-mono font-black text-amber-900 text-xs sm:text-sm">
                          {formatCurrency(remainingSellerBalance, settings.currency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Legal Notice */}
                  <div className="p-2.5 bg-slate-50/50 border border-dashed border-slate-300 rounded-none text-center text-[10.5px] font-bold text-slate-600">
                    يُعتبر هذا السند وثيقة صرف رسمية وإبراء ذمة لإدارة سوق الحراج بالمبلغ الموضح أعلاه، ويحق للمستفيد الاحتفاظ بنسخته.
                  </div>

                  {/* Signatures */}
                  <div className="pt-6 border-t-2 border-slate-900 grid grid-cols-3 gap-6 text-center">
                    <div>
                      <span className="font-black text-slate-800 block mb-1">توقيع واستلام الصياد (المستفيد):</span>
                      <div className="border-b-2 border-dashed border-slate-300 h-10 mx-2"></div>
                      <div className="text-[11px] font-bold text-slate-700 mt-1">
                        {selectedSellerPayoutForPrint.contactName || selectedSeller?.name}
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">ختم السوق الرسمي</span>
                      <div className="w-14 h-14 rounded-none border-2 border-dashed border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">
                        ختم السوق
                      </div>
                    </div>
                    <div>
                      <span className="font-black text-slate-800 block mb-1">أمين الصندوق / الإدارة المالية:</span>
                      <div className="border-b-2 border-dashed border-slate-300 h-10 mx-2"></div>
                      {settings.employeeName && (
                        <div className="text-[11px] font-bold text-slate-700 mt-1">({settings.employeeName})</div>
                      )}
                    </div>
                  </div>

                  {/* Micro Footer */}
                  <div className="pt-3 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <div>نظام حراج الأسماك ونقطة البيع الإلكترونية © {new Date().getFullYear()}</div>
                    <div>مستند رسمي A4 - صفحة 1 من 1</div>
                    <div dir="ltr">{selectedSellerPayoutForPrint.timeStr} - {selectedSellerPayoutForPrint.dateStr}</div>
                  </div>
                </div>
              ) : (
                /* ══ 2. 80mm Thermal Receipt Layout ══ */
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
                    <div className="inline-block mt-2 px-3 py-0.5 bg-slate-900 text-white rounded font-black text-xs">
                      سند صرف نقدية (تسليم مستحقات صياد)
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                    <div>
                      <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                      <span className="font-mono font-black text-emerald-700 text-sm">{selectedSellerPayoutForPrint.id}</span>
                    </div>
                    <div className="text-left">
                      <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedSellerPayoutForPrint.dateStr} {selectedSellerPayoutForPrint.timeStr}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 py-1 font-sans">
                    <div className="flex justify-between">
                      <span className="text-slate-500">صُرف للصياد:</span>
                      <span className="font-black text-slate-900">
                        {selectedSellerPayoutForPrint.contactName || selectedSeller?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">مبلغ وقدره:</span>
                      <span className="font-black font-mono text-emerald-700 text-sm">
                        {formatCurrency(selectedSellerPayoutForPrint.amount, settings.currency)}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-300 text-[11px] font-bold text-slate-800 text-center leading-relaxed">
                      {tafqeet(selectedSellerPayoutForPrint.amount, settings.currency)}
                    </div>
                    <div className="flex justify-between pt-1">
                      <span className="text-slate-500">البيان:</span>
                      <span className="font-medium text-slate-800">
                        {selectedSellerPayoutForPrint.description}
                      </span>
                    </div>
                  </div>

                  {/* Status of Balance snapshot */}
                  <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-none space-y-1 font-sans text-[11px]">
                    <div className="flex justify-between text-slate-600">
                      <span>إجمالي الصافي المستحق:</span>
                      <span className="font-mono font-bold">{formatCurrency(allSellerNetTotal, settings.currency)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>المصروف نقداً بهذا السند:</span>
                      <span className="font-mono font-black">{formatCurrency(selectedSellerPayoutForPrint.amount, settings.currency)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>إجمالي المسلم حتى تاريخه:</span>
                      <span className="font-mono font-bold">{formatCurrency(totalSellerPayouts, settings.currency)}</span>
                    </div>
                    <div className="flex justify-between text-amber-900 font-bold border-t border-slate-300 pt-1">
                      <span>المتبقي للصياد ديناً مؤجلاً على الجمعية:</span>
                      <span className="font-mono font-black">{formatCurrency(remainingSellerBalance, settings.currency)}</span>
                    </div>
                  </div>

                  <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                    <div>
                      <span className="text-slate-600 font-bold block mb-8">توقيع واستلام الصياد:</span>
                      <div className="border-b border-dashed border-slate-400 mx-4"></div>
                    </div>
                    <div>
                      <span className="text-slate-600 font-bold block mb-8">توقيع أمين الصندوق:</span>
                      <div className="border-b border-dashed border-slate-400 mx-4"></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Seller Advance Settlement Voucher (سند تسوية ومقاصة سلفة صياد) */}
      {selectedSettlementForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 no-print">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-none bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">سند تسوية ومقاصة سلفة صياد</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-none bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة السند</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSettlementForPrint(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Voucher Area (Supported for 80mm Thermal Receipt Printers & Standard Printing) */}
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
                <div className="inline-block mt-2 px-3 py-0.5 bg-purple-900 text-white rounded font-black text-xs">
                  سند تسوية ومقاصة سلفة (خصم من مستحقات صيد)
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                  <span className="font-mono font-black text-purple-700 text-sm">{selectedSettlementForPrint.id}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedSettlementForPrint.dateStr} {selectedSettlementForPrint.timeStr}
                  </span>
                </div>
              </div>

              <div className="space-y-2 py-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-500">اسم الصياد:</span>
                  <span className="font-black text-slate-900">
                    {selectedSettlementForPrint.contactName || selectedSeller?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">مبلغ المقاصة المستقطع:</span>
                  <span className="font-black font-mono text-purple-700 text-sm">
                    {formatCurrency(selectedSettlementForPrint.amount, settings.currency)}
                  </span>
                </div>
                <div className="p-2 bg-purple-50 rounded border border-purple-200 text-[11px] font-bold text-purple-900 text-center leading-relaxed">
                  {tafqeet(selectedSettlementForPrint.amount, settings.currency)}
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">وذلك عن:</span>
                  <span className="font-medium text-slate-800">
                    {selectedSettlementForPrint.description}
                  </span>
                </div>
              </div>

              {/* Balances after settlement */}
              <div className="p-2.5 bg-slate-50 border border-slate-300 rounded-none space-y-1 font-sans text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>نوع العملية:</span>
                  <span className="font-bold text-purple-900">مقاصة دفترية (بدون حركة نقدية بالصندوق)</span>
                </div>
                <div className="flex justify-between text-purple-950 font-bold border-t border-slate-300 pt-1">
                  <span>المبلغ المحسوم من السلفة:</span>
                  <span className="font-mono font-black">{formatCurrency(selectedSettlementForPrint.amount, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-amber-900 font-bold">
                  <span>متبقي مستحقات الصيد في ذمة الجمعية:</span>
                  <span className="font-mono">{formatCurrency(remainingSellerBalance, settings.currency)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>متبقي سلفة الصياد المستحقة للجمعية:</span>
                  <span className="font-mono font-bold">{formatCurrency(totalSellerAdvancesOwed, settings.currency)}</span>
                </div>
              </div>

              <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                <div>
                  <span className="text-slate-600 font-bold block mb-8">إقرار وموافقة الصياد:</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
                <div>
                  <span className="text-slate-600 font-bold block mb-8">توقيع أمين الصندوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Seller Advance Cash Out (صرف سلفة نقدية جانبية للصياد) */}
      {isSellerAdvanceModalOpen && selectedSeller && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-none bg-amber-100 text-amber-800 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">صرف سلفة نقدية للصياد</h3>
                  <p className="text-[11px] text-slate-400">سلفة جانبية مقيدة في الذمة بدون احتساب أي ضريبة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSellerAdvanceModalOpen(false)}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingSellerAdvance) return;
                const amt = Number(sellerAdvanceAmount);
                if (amt <= 0) return;
                if (amt > currentCashDrawer) {
                  alert(
                    `لا يمكن صرف السلفة بمبلغ (${formatCurrency(amt, settings.currency)}) لأن السيولة النقدية المتاحة في الصندوق حالياً (${formatCurrency(currentCashDrawer, settings.currency)}) فقط.`
                  );
                  return;
                }

                setIsSubmittingSellerAdvance(true);
                try {
                  if (onSaveSellerAdvance) {
                    const res = onSaveSellerAdvance(
                      selectedSeller.id,
                      selectedSeller.name,
                      amt,
                      sellerAdvanceNotes.trim() || 'سلفة نقدية جانبية'
                    );
                    if (res && res.id) {
                      setSelectedSellerAdvanceForPrint(res);
                    }
                  }
                  setSellerAdvanceAmount('');
                  setSellerAdvanceNotes('');
                  setIsSellerAdvanceModalOpen(false);
                } finally {
                  setIsSubmittingSellerAdvance(false);
                }
              }}
              className="mt-4 space-y-4"
            >
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-none space-y-1 text-xs">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>الصياد المستلف:</span>
                  <span className="text-amber-900 font-black">{selectedSeller.name}</span>
                </div>
                {totalSellerAdvancesOwed > 0 && (
                  <div className="flex justify-between font-bold text-amber-900">
                    <span>سلف سابقة متبقية عليه:</span>
                    <span className="font-mono">{formatCurrency(totalSellerAdvancesOwed, settings.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-600">
                  <span>السيولة المتاحة بالصندوق:</span>
                  <span className={`font-mono font-black ${currentCashDrawer > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {formatCurrency(currentCashDrawer, settings.currency)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-slate-600">
                  <span>نوع السلفة:</span>
                  <span className="text-emerald-700 font-black">سلفة جانبية (معفاة من الضريبة 0%)</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  مبلغ السلفة ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  autoFocus
                  value={sellerAdvanceAmount}
                  onChange={(e) => setSellerAdvanceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="أدخل مبلغ السلفة..."
                  className="w-full px-3 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                {typeof sellerAdvanceAmount === 'number' && sellerAdvanceAmount > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-amber-50/60 border border-amber-200 text-xs font-bold text-amber-900 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">المبلغ كتابة:</span>
                    <span className="text-amber-900">{tafqeet(sellerAdvanceAmount, settings.currency)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البيان / ملاحظات السلفة
                </label>
                <input
                  type="text"
                  value={sellerAdvanceNotes}
                  onChange={(e) => setSellerAdvanceNotes(e.target.value)}
                  placeholder="مثال: سلفة مؤقتة لأغراض المحروقات أو الصيانة..."
                  className="w-full px-3 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingSellerAdvance}
                  className={`flex-1 py-3 px-4 rounded-none text-white text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 ${
                    isSubmittingSellerAdvance ? 'bg-amber-400 cursor-not-allowed opacity-70' : 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                  }`}
                >
                  <HandCoins className="w-4 h-4" />
                  <span>{isSubmittingSellerAdvance ? 'جاري الحفظ...' : 'تأكيد صرف السلفة وتوليد السند'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSellerAdvance}
                  onClick={() => setIsSellerAdvanceModalOpen(false)}
                  className="py-3 px-4 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Single Seller Advance Voucher Print */}
      {selectedSellerAdvanceForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 no-print">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-none bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">سند صرف سلفة صياد</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة السند</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSellerAdvanceForPrint(null)}
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
                <div className="inline-block mt-2 px-3 py-0.5 bg-amber-700 text-white rounded font-black text-xs">
                  سند صرف سلفة نقدية جانبية (صياد)
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                  <span className="font-mono font-black text-amber-800 text-sm">{selectedSellerAdvanceForPrint.id}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedSellerAdvanceForPrint.dateStr} {selectedSellerAdvanceForPrint.timeStr}
                  </span>
                </div>
              </div>

              <div className="space-y-2 py-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-500">صُرفت سلفة للصياد:</span>
                  <span className="font-black text-slate-900">
                    {selectedSellerAdvanceForPrint.contactName || selectedSeller?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">مبلغ وقدره:</span>
                  <span className="font-black font-mono text-amber-800 text-sm">
                    {formatCurrency(selectedSellerAdvanceForPrint.amount, settings.currency)}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded border border-slate-300 text-[11px] font-bold text-slate-800 text-center leading-relaxed">
                  {tafqeet(selectedSellerAdvanceForPrint.amount, settings.currency)}
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-800">
                    {selectedSellerAdvanceForPrint.description}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-none text-[11px] text-amber-900 font-sans leading-relaxed">
                💡 ملاحظة: هذه سلفة جانبية مقيدة في ذمة الصياد لصالح إدارة الجمعية والحراج دون احتساب أي ضريبة.
              </div>

              <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                <div>
                  <span className="text-slate-600 font-bold block mb-8">توقيع واستلام الصياد:</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
                <div>
                  <span className="text-slate-600 font-bold block mb-8">توقيع أمين الصندوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Seller Advance Direct Cash Repayment (سداد سلفة صياد نقداً وإعادتها للصندوق) */}
      {isRepaySellerAdvanceModalOpen && selectedSeller && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-none bg-teal-100 text-teal-800 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">سداد سلفة صياد نقداً (قبض صندوق)</h3>
                  <p className="text-[11px] text-slate-400">إيداع نقدي مباشر في الصندوق لسداد وإبراء ذمة الصياد من السلفة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRepaySellerAdvanceModalOpen(false)}
                className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmittingSellerRepay) return;
                const amt = Number(sellerRepayAmount);
                if (amt <= 0) return;

                setIsSubmittingSellerRepay(true);
                try {
                  if (onRepaySellerAdvanceCash) {
                    const res = onRepaySellerAdvanceCash(
                      selectedSeller.id,
                      selectedSeller.name,
                      amt,
                      sellerRepayNotes.trim() || 'سداد سلفة صياد نقداً'
                    );
                    if (res && res.id) {
                      setSelectedRepayAdvanceForPrint(res);
                    }
                  }
                  setSellerRepayAmount('');
                  setSellerRepayNotes('');
                  setIsRepaySellerAdvanceModalOpen(false);
                } finally {
                  setIsSubmittingSellerRepay(false);
                }
              }}
              className="mt-4 space-y-4"
            >
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-1.5 text-xs">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>الصياد:</span>
                  <span className="text-slate-900 font-black">{selectedSeller.name}</span>
                </div>
                <div className="flex justify-between font-bold text-amber-800">
                  <span>إجمالي السلف القائمة بذمته:</span>
                  <span className="font-mono font-black">{formatCurrency(totalSellerAdvancesOwed, settings.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-600">
                  <span>الأثر المحاسبي:</span>
                  <span className="text-emerald-700 font-bold">إيداع نقدي يرفع رصيد الصندوق فوراً (+)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    مبلغ السداد النقدي ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  {totalSellerAdvancesOwed > 0 && (
                    <button
                      type="button"
                      onClick={() => setSellerRepayAmount(totalSellerAdvancesOwed)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 cursor-pointer transition-colors"
                    >
                      سداد كامل السلفة ({formatCurrency(totalSellerAdvancesOwed, '')})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  autoFocus
                  value={sellerRepayAmount}
                  onChange={(e) => setSellerRepayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="أدخل مبلغ السداد النقدي..."
                  className="w-full px-3 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                {typeof sellerRepayAmount === 'number' && sellerRepayAmount > 0 && (
                  <div className="mt-1.5 p-2 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 font-medium">المبلغ كتابة:</span>
                    <span className="text-emerald-800 font-mono">{tafqeet(sellerRepayAmount, settings.currency)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البيان والملاحظات
                </label>
                <input
                  type="text"
                  value={sellerRepayNotes}
                  onChange={(e) => setSellerRepayNotes(e.target.value)}
                  placeholder="مثال: سداد سلفة نقدية مباشرة من الصياد..."
                  className="w-full px-3 py-2.5 rounded-none bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingSellerRepay}
                  className={`flex-1 py-3 px-4 rounded-none text-white text-xs font-black shadow-xs transition-all flex items-center justify-center gap-1.5 ${
                    isSubmittingSellerRepay ? 'bg-emerald-400 cursor-not-allowed opacity-70' : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>{isSubmittingSellerRepay ? 'جاري التسجيل...' : 'تأكيد استلام النقد وتوليد السند'}</span>
                </button>
                <button
                  type="button"
                  disabled={isSubmittingSellerRepay}
                  onClick={() => setIsRepaySellerAdvanceModalOpen(false)}
                  className="py-3 px-4 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Single Seller Advance Repayment Voucher Print (سند قبض سداد سلفة صياد نقداً) */}
      {selectedRepayAdvanceForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 no-print">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-none bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">سند قبض سداد سلفة نقداً (صياد)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-none bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة السند</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRepayAdvanceForPrint(null)}
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
                <div className="inline-block mt-2 px-3 py-0.5 bg-teal-700 text-white rounded font-black text-xs">
                  سند قبض نقدي - سداد سلفة صياد
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                  <span className="font-mono font-black text-teal-800 text-sm">{selectedRepayAdvanceForPrint.id}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedRepayAdvanceForPrint.dateStr} {selectedRepayAdvanceForPrint.timeStr}
                  </span>
                </div>
              </div>

              <div className="space-y-2 py-1 font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-500">استلمنا من الصياد:</span>
                  <span className="font-black text-slate-900">
                    {selectedRepayAdvanceForPrint.contactName || selectedSeller?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">مبلغ وقدره (توريد للصندوق):</span>
                  <span className="font-black font-mono text-teal-800 text-sm">
                    {formatCurrency(selectedRepayAdvanceForPrint.amount, settings.currency)}
                  </span>
                </div>
                <div className="p-2 bg-slate-50 rounded border border-slate-300 text-[11px] font-bold text-slate-800 text-center leading-relaxed">
                  {tafqeet(selectedRepayAdvanceForPrint.amount, settings.currency)}
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-800">
                    {selectedRepayAdvanceForPrint.description}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-teal-50/70 border border-teal-200 rounded-none text-[11px] text-teal-900 font-sans leading-relaxed">
                ✓ إشعار إيداع: تم توريد المبلغ نقداً إلى خزينة الصندوق وإبراء ذمة الصياد بمقدار المبلغ المسدد.
              </div>

              <div className="pt-6 border-t-2 border-slate-800 grid grid-cols-2 gap-4 text-center">
                <div>
                  <span className="text-slate-600 font-bold block mb-8">توقيع المسدد (الصياد):</span>
                  <div className="border-b border-dashed border-slate-400 mx-4"></div>
                </div>
                <div>
                  <span className="text-slate-600 font-bold block mb-1">توقيع المستلم (أمين الصندوق):</span>
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

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW WORKER / STAFF (إضافة عامل أو موظف جديد) */}
      {/* ========================================================================= */}
      {isAddWorkerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إضافة عامل / موظف جديد</h3>
                  <p className="text-xs text-slate-500 mt-0.5">تسجيل موظف أو عامل بالسوق لمتابعة كشف حسابه وأجوره</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddWorkerModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddWorkerSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم العامل / الموظف <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWorkerName}
                  onChange={(e) => setNewWorkerName(e.target.value)}
                  placeholder="مثال: يحيى علي حمالي، أو سالم كاتب..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  الصفة / الوظيفة <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newWorkerRole}
                  onChange={(e) => setNewWorkerRole(e.target.value)}
                  placeholder="اكتب الصفة أو الوظيفة..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف
                  </label>
                  <input
                    type="tel"
                    value={newWorkerPhone}
                    onChange={(e) => setNewWorkerPhone(e.target.value)}
                    placeholder="اختياري"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الأجر اليومي المعتاد ({settings.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newWorkerDailyWage}
                    onChange={(e) => setNewWorkerDailyWage(e.target.value ? Number(e.target.value) : '')}
                    placeholder="0.00"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات إضافية
                </label>
                <input
                  type="text"
                  value={newWorkerNotes}
                  onChange={(e) => setNewWorkerNotes(e.target.value)}
                  placeholder="أي تفاصيل أخرى..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddWorkerModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-none bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ الموظف</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PAY WORKER WAGE / SALARY (صرف أجر / راتب نقداً) */}
      {/* ========================================================================= */}
      {isPayWorkerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">صرف أجر / مستحقات نقدية</h3>
                  <p className="text-xs text-slate-500 mt-0.5">تسجيل صرف أجر نقدي من الصندوق للعامل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayWorkerModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePayWorkerSubmit} className="mt-5 space-y-4">
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المستفيد (العامل / الموظف) <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={payWorkerBeneficiarySearch}
                    onChange={(e) => {
                      setPayWorkerBeneficiarySearch(e.target.value);
                      setIsBeneficiarySuggestionsOpen(true);
                    }}
                    onFocus={() => setIsBeneficiarySuggestionsOpen(true)}
                    placeholder="اكتب اسم الموظف أو اختر من القائمة..."
                    className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 shadow-xs"
                  />
                  <Users className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>

                {isBeneficiarySuggestionsOpen && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-300 rounded-none shadow-xl max-h-48 overflow-y-auto">
                    {beneficiarySuggestions.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500 text-center font-bold">
                        لا يوجد موظف مطابق (سيتم تسجيل الصرف باسم: {payWorkerBeneficiarySearch || 'بدون اسم'})
                      </div>
                    ) : (
                      beneficiarySuggestions.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => {
                            setPayWorkerBeneficiarySearch(w.name);
                            setSelectedWorkerId(w.id);
                            if (w.dailyWage && (!payWorkerAmount || payWorkerAmount === '')) {
                              setPayWorkerAmount(w.dailyWage);
                            }
                            setIsBeneficiarySuggestionsOpen(false);
                          }}
                          className="w-full p-2.5 text-right hover:bg-emerald-50 flex items-center justify-between border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors"
                        >
                          <div>
                            <span className="font-bold text-xs text-slate-900">{w.name}</span>
                            <span className="text-[11px] text-slate-500 mr-2">({w.role || 'عامل سوق'})</span>
                          </div>
                          {w.dailyWage && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-none">
                              الأجر: {formatCurrency(w.dailyWage, settings.currency)}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ المنصرف نقداً ({settings.currency}) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={payWorkerAmount}
                  onChange={(e) => setPayWorkerAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-base font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
                {payWorkerAmount && Number(payWorkerAmount) > 0 && (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1">
                    {tafqeet(Number(payWorkerAmount), settings.currency)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">مصدر الصرف</label>
                <div className="grid grid-cols-2 gap-2 rounded-none bg-slate-100 p-1">
                  <button type="button" onClick={() => setPayWorkerMethod('cash')} className={`rounded-none py-2 text-xs font-bold ${payWorkerMethod === 'cash' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصندوق</button>
                  <button type="button" onClick={() => setPayWorkerMethod('exchange')} className={`rounded-none py-2 text-xs font-bold ${payWorkerMethod === 'exchange' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصرافة</button>
                </div>
                {payWorkerMethod === 'exchange' && (
                  <input type="text" value={payWorkerExchangeName} onChange={(e) => setPayWorkerExchangeName(e.target.value)} placeholder="اسم الصرافة / رقم الحوالة" className="mt-2 w-full rounded-none border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500" />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  تصنيف المصروف <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={payWorkerCategory}
                  onChange={(e) => setPayWorkerCategory(e.target.value)}
                  placeholder="اكتب تصنيف المصروف..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البيان / ملاحظات الصرف
                </label>
                <input
                  type="text"
                  value={payWorkerNotes}
                  onChange={(e) => setPayWorkerNotes(e.target.value)}
                  placeholder="مثال: أجر تنزيل شحنة، أو راتب أسبوعي..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayWorkerModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWorkerPayment}
                  className="px-5 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingWorkerPayment ? 'جارٍ الحفظ...' : 'تأكيد وصرف الأجر'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ISSUE WORKER ADVANCE (صرف سلفة نقدية للعامل) */}
      {/* ========================================================================= */}
      {isWorkerAdvanceModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">صرف سلفة نقدية لعامل / موظف</h3>
                  <p className="text-xs text-slate-500 mt-0.5">صرف مبلغ سلفة مؤقتة تسجل بذمة العامل من الصندوق</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkerAdvanceModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWorkerAdvanceSubmit} className="mt-5 space-y-4">
              <div className="p-3 bg-amber-50/70 rounded-none border border-amber-200 flex items-center justify-between text-xs">
                <div>
                  <div className="text-amber-700 font-bold">المستلم:</div>
                  <div className="font-black text-slate-900 text-sm mt-0.5">{selectedWorker.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-amber-700 font-bold">السلف الحالية بذمته:</div>
                  <div className="font-black text-rose-700 text-xs mt-0.5">
                    {formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  مبلغ السلفة المطلوب صرفه ({settings.currency}) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="any"
                  value={workerAdvanceAmount}
                  onChange={(e) => setWorkerAdvanceAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-base font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 shadow-xs"
                />
                {workerAdvanceAmount && Number(workerAdvanceAmount) > 0 && (
                  <p className="text-[11px] font-bold text-amber-700 mt-1">
                    {tafqeet(Number(workerAdvanceAmount), settings.currency)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البيان / سبب السلفة
                </label>
                <input
                  type="text"
                  value={workerAdvanceNotes}
                  onChange={(e) => setWorkerAdvanceNotes(e.target.value)}
                  placeholder="مثال: سلفة علاجية، أو سلفة على الحساب..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWorkerAdvanceModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWorkerAdvance}
                  className="px-5 py-2.5 rounded-none bg-amber-600 hover:bg-amber-700 text-xs font-bold text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingWorkerAdvance ? 'جارٍ الصرف...' : 'تأكيد وصرف السلفة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REPAY WORKER ADVANCE (سداد / استرداد سلفة نقداً من العامل) */}
      {/* ========================================================================= */}
      {isWorkerRepayModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">سداد واسترداد سلفة نقداً</h3>
                  <p className="text-xs text-slate-500 mt-0.5">توريد نقدي للصندوق لتسديد سلفة العامل</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkerRepayModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleWorkerRepaySubmit} className="mt-5 space-y-4">
              <div className="p-3 bg-blue-50/70 rounded-none border border-blue-300 flex items-center justify-between text-xs">
                <div>
                  <div className="text-blue-700 font-bold">العامل / الموظف:</div>
                  <div className="font-black text-slate-900 text-sm mt-0.5">{selectedWorker.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-blue-700 font-bold">إجمالي متبقي السلفة:</div>
                  <div className="font-black text-rose-700 text-xs mt-0.5">
                    {formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المبلغ المسدد نقداً ({settings.currency}) <span className="text-rose-600">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0.01"
                  max={workerMetrics.netAdvanceBalance > 0 ? workerMetrics.netAdvanceBalance : undefined}
                  step="any"
                  value={workerRepayAmount}
                  onChange={(e) => setWorkerRepayAmount(e.target.value ? Number(e.target.value) : '')}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-base font-black text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
                {workerRepayAmount && Number(workerRepayAmount) > 0 && (
                  <p className="text-[11px] font-bold text-blue-700 mt-1">
                    {tafqeet(Number(workerRepayAmount), settings.currency)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  البيان / ملاحظات السداد
                </label>
                <input
                  type="text"
                  value={workerRepayNotes}
                  onChange={(e) => setWorkerRepayNotes(e.target.value)}
                  placeholder="مثال: سداد نقدي لكامل السلفة / قسط سلفة..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsWorkerRepayModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWorkerRepay}
                  className="px-5 py-2.5 rounded-none bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingWorkerRepay ? 'جارٍ التوريد...' : 'تأكيد وإيداع السداد'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PRINTABLE WORKER STATEMENT (طباعة كشف حساب وتصفية العامل) */}
      {/* ========================================================================= */}
      {isWorkerStatementPrintOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-3xl w-full p-6 sm:p-8 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none print:p-0">
            {/* Header Toolbar (hidden on print) */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-300 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">معاينة كشف حساب العامل للطباعة</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsWorkerStatementPrintOpen(false)}
                  className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="space-y-6">
              {/* Official Market Header */}
              <div className="text-center pb-4 border-b-2 border-slate-800">
                <img src="/logo.png" alt="الشعار" className="w-28 h-28 object-contain mx-auto mb-2" />
                <h1 className="text-lg font-black text-slate-900">{settings.marketName}</h1>
                <p className="text-xs text-slate-600 mt-0.5">{settings.marketLocation || 'حراج وسوق الأسماك المركزي'}</p>
                <div className="inline-block mt-2 px-4 py-1 rounded-none bg-slate-100 text-slate-800 text-xs font-bold border border-slate-300">
                  كشف حساب ومستحقات وسلف موظف / عامل سوق
                </div>
              </div>

              {/* Worker Profile Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-none border border-slate-300 text-xs">
                <div>
                  <span className="text-slate-500 block">اسم الموظف/العامل:</span>
                  <strong className="text-slate-900 text-sm">{selectedWorker.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">الصفة / الوظيفة:</span>
                  <strong className="text-slate-800">{selectedWorker.role || 'عامل سوق'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">الهاتف:</span>
                  <strong className="text-slate-800 font-mono">{selectedWorker.phone || 'غير مسجل'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">تاريخ إصدار الكشف:</span>
                  <strong className="text-slate-800">{formatGregorianDate(new Date())}</strong>
                </div>
              </div>

              {/* KPI Breakdown */}
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="p-3 bg-blue-50 border border-blue-300 rounded-none">
                  <span className="text-blue-800 font-bold block mb-1">إجمالي الأجور المستلمة</span>
                  <span className="text-base font-black text-blue-900 font-mono">
                    {formatCurrency(workerMetrics.totalPaid, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-none">
                  <span className="text-amber-800 font-bold block mb-1">إجمالي السلف المنصرفة</span>
                  <span className="text-base font-black text-amber-900 font-mono">
                    {formatCurrency(workerMetrics.totalAdvances, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-none">
                  <span className="text-emerald-800 font-bold block mb-1">السلف المسددة</span>
                  <span className="text-base font-black text-emerald-900 font-mono">
                    {formatCurrency(workerMetrics.totalAdvancesRepaid, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-none">
                  <span className="text-rose-800 font-bold block mb-1">متبقي السلفة بذمته</span>
                  <span className="text-base font-black text-rose-900 font-mono">
                    {formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-right border-collapse text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black">
                    <th className="p-2.5 border-l border-slate-300">#</th>
                    <th className="p-2.5 border-l border-slate-300">التاريخ</th>
                    <th className="p-2.5 border-l border-slate-300">نوع الحركة والتصنيف</th>
                    <th className="p-2.5 border-l border-slate-300">البيان</th>
                    <th className="p-2.5 border-l border-slate-300">المنصرف للموظف</th>
                    <th className="p-2.5">المسدد للصندوق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {workerEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        لا توجد حركات مالية مسجلة
                      </td>
                    </tr>
                  ) : (
                    workerEntries.map((e, idx) => (
                      <tr key={e.id}>
                        <td className="p-2 border-l border-slate-300 font-mono">{idx + 1}</td>
                        <td className="p-2 border-l border-slate-300 font-mono">{e.dateStr}</td>
                        <td className="p-2 border-l border-slate-300 font-bold">{e.category}</td>
                        <td className="p-2 border-l border-slate-300">{e.description}</td>
                        <td className="p-2 border-l border-slate-300 font-bold font-mono">
                          {e.type === 'expense' ? formatCurrency(e.amount, settings.currency) : '-'}
                        </td>
                        <td className="p-2 font-bold font-mono">
                          {e.type === 'deposit' ? formatCurrency(e.amount, settings.currency) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="pt-8 border-t-2 border-slate-800 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <span className="text-slate-700 font-bold block mb-10">توقيع الموظف / العامل:</span>
                  <div className="border-b border-dashed border-slate-400 mx-8"></div>
                </div>
                <div>
                  <span className="text-slate-700 font-bold block mb-10">توقيع واعتماد أمين الصندوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-8"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL: OFFICE EXPENSE / PETTY CASH (صرف نثريات / وجبات / مستلزمات للمكتب) */}
      {/* ========================================================================= */}
      {isOfficeExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-none bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">صرف نثريات ومصروف للمكتب</h3>
                  <p className="text-xs text-slate-400 mt-0.5">تسجيل صرفية إفطار أو غداء أو نثريات وضيافة للمكتب</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOfficeExpenseModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOfficeExpenseSubmit} className="mt-5 space-y-4">
              {/* Officer / Beneficiary */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  مسؤول / مستلم النثريات <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={officeExpenseOfficer}
                  onChange={(e) => setOfficeExpenseOfficer(e.target.value)}
                  placeholder="مثال: مسؤول المكتب، مدير الإدارة، إلخ"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  تصنيف النثريات / المصروف <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={officeExpenseCategory}
                  onChange={(e) => setOfficeExpenseCategory(e.target.value)}
                  placeholder="اكتب تصنيف النثريات / المصروف..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  المبلغ المنصرف ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="0.01"
                  value={officeExpenseAmount}
                  onChange={(e) => setOfficeExpenseAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">مصدر الصرف</label>
                <div className="grid grid-cols-2 gap-2 rounded-none bg-slate-100 p-1">
                  <button type="button" onClick={() => setOfficeExpenseMethod('cash')} className={`rounded-none py-2 text-xs font-bold ${officeExpenseMethod === 'cash' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصندوق</button>
                  <button type="button" onClick={() => setOfficeExpenseMethod('exchange')} className={`rounded-none py-2 text-xs font-bold ${officeExpenseMethod === 'exchange' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصرافة</button>
                </div>
                {officeExpenseMethod === 'exchange' && (
                  <input type="text" value={officeExpenseExchangeName} onChange={(e) => setOfficeExpenseExchangeName(e.target.value)} placeholder="اسم الصرافة / رقم الحوالة" className="mt-2 w-full rounded-none border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500" />
                )}
              </div>


              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOfficeExpenseModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOfficeExpense || !officeExpenseAmount}
                  className="px-5 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد صرف النثريات</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: OFFICE ADVANCE (صرف سلفة / عهدة مكتبية) */}
      {/* ========================================================================= */}
      {isOfficeAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">صرف سلفة / عهدة للمكتب</h3>
                  <p className="text-xs text-slate-400 mt-0.5">تسجيل سحب مبالغ كعهدة أو سلفة لمسؤول المكتب</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOfficeAdvanceModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOfficeAdvanceSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  اسم المستلم / مسؤول المكتب <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={officeAdvanceOfficer}
                  onChange={(e) => setOfficeAdvanceOfficer(e.target.value)}
                  placeholder="مثال: مسؤول المكتب، مدير الإدارة..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  مبلغ السلفة ({settings.currency}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="0.01"
                  value={officeAdvanceAmount}
                  onChange={(e) => setOfficeAdvanceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والغرض (اختياري)</label>
                <input
                  type="text"
                  value={officeAdvanceNotes}
                  onChange={(e) => setOfficeAdvanceNotes(e.target.value)}
                  placeholder="مثال: سلفة لمشتريات المكتب، عهدة مصاريف طارئة..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">مصدر صرف السلفة</label>
                <div className="grid grid-cols-2 gap-2 rounded-none bg-slate-100 p-1">
                  <button type="button" onClick={() => setWorkerAdvanceMethod('cash')} className={`rounded-none py-2 text-xs font-bold ${workerAdvanceMethod === 'cash' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصندوق</button>
                  <button type="button" onClick={() => setWorkerAdvanceMethod('exchange')} className={`rounded-none py-2 text-xs font-bold ${workerAdvanceMethod === 'exchange' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصرافة</button>
                </div>
                {workerAdvanceMethod === 'exchange' && (
                  <input type="text" value={workerAdvanceExchangeName} onChange={(e) => setWorkerAdvanceExchangeName(e.target.value)} placeholder="اسم الصرافة / رقم الحوالة" className="mt-2 w-full rounded-none border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500" />
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOfficeAdvanceModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOfficeAdvance || !officeAdvanceAmount}
                  className="px-5 py-2.5 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد صرف السلفة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: OFFICE REPAY ADVANCE (سداد واسترداد سلفة المكتب) */}
      {/* ========================================================================= */}
      {isOfficeRepayModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-none bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">سداد / استرداد سلفة المكتب</h3>
                  <p className="text-xs text-slate-400 mt-0.5">توريد نقدي وإرجاع متبقي السلفة أو العهدة إلى الصندوق</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOfficeRepayModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOfficeRepaySubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  اسم المورد / مسؤول المكتب <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={officeRepayOfficer}
                  onChange={(e) => setOfficeRepayOfficer(e.target.value)}
                  placeholder="مثال: مسؤول المكتب..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    المبلغ المورد للصندوق ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  {officeMetrics.netAdvanceBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setOfficeRepayAmount(officeMetrics.netAdvanceBalance)}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      تصفية المتبقي بالكامل ({formatCurrency(officeMetrics.netAdvanceBalance, settings.currency)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="0.01"
                  value={officeRepayAmount}
                  onChange={(e) => setOfficeRepayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والملاحظات</label>
                <input
                  type="text"
                  value={officeRepayNotes}
                  onChange={(e) => setOfficeRepayNotes(e.target.value)}
                  placeholder="مثال: توريد متبقي عهدة المصروفات، سداد سلفة نقدية..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOfficeRepayModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOfficeRepay || !officeRepayAmount}
                  className="px-5 py-2.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>تأكيد توريد وإيداع المبلغ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PRINTABLE OFFICE STATEMENT (طباعة كشف حساب المكتب) */}
      {/* ========================================================================= */}
      {isOfficeStatementPrintOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-3xl w-full p-6 sm:p-8 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto print:max-w-none print:shadow-none print:border-none print:p-0">
            {/* Header Toolbar (hidden on print) */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-300 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-black text-slate-900">معاينة كشف حساب المكتب للطباعة</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOfficeExpenseOfficer(selectedOfficeOfficerId !== 'office-all' ? selectedOfficeOfficer.name : 'مسؤول المكتب');
                    setOfficeExpenseCategory('');
                    setOfficeExpenseAmount('');
                    setOfficeExpenseNotes('');
                    setIsOfficeExpenseModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 rounded-none text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  title="تسجيل صرف نثريات للمكتب مباشرة"
                >
                  <Coffee className="w-4 h-4 text-sky-600" />
                  <span>صرف نثريات</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الآن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsOfficeStatementPrintOpen(false)}
                  className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="space-y-6">
              {/* Official Market Header */}
              <div className="text-center pb-4 border-b-2 border-slate-800">
                <img src="/logo.png" alt="الشعار" className="w-28 h-28 object-contain mx-auto mb-2" />
                <h1 className="text-lg font-black text-slate-900">{settings.marketName}</h1>
                <p className="text-xs text-slate-600 mt-0.5">{settings.marketLocation || 'إدارة وحراج الأسماك المركزي'}</p>
                <div className="inline-block mt-2 px-4 py-1 rounded-none bg-slate-100 text-slate-800 text-xs font-bold border border-slate-300">
                  كشف حساب وسجل حركات ونثريات وسلف المكتب
                </div>
              </div>

              {/* Office Profile Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-none border border-slate-300 text-xs">
                <div>
                  <span className="text-slate-500 block">الحساب / المسؤول:</span>
                  <strong className="text-slate-900 text-sm">{selectedOfficeOfficer.name}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">الصفة / الإدارة:</span>
                  <strong className="text-slate-800">{selectedOfficeOfficer.role}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">الفترة الزمنية:</span>
                  <strong className="text-slate-800">
                    {timeframe === 'today' ? 'اليوم' : timeframe === 'week' ? 'أسبوع' : timeframe === 'month' ? 'شهر' : 'كافة الحركات'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">تاريخ إصدار الكشف:</span>
                  <strong className="text-slate-800">{formatGregorianDate(new Date())}</strong>
                </div>
              </div>

              {/* KPI Breakdown */}
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-none">
                  <span className="text-emerald-800 font-bold block mb-1">إجمالي النثريات والمصروفات</span>
                  <span className="text-base font-black text-emerald-900 font-mono">
                    {formatCurrency(officeMetrics.totalExpenses, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-none">
                  <span className="text-amber-800 font-bold block mb-1">إجمالي السلف والمسحوبات</span>
                  <span className="text-base font-black text-amber-900 font-mono">
                    {formatCurrency(officeMetrics.totalAdvances, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-300 rounded-none">
                  <span className="text-blue-800 font-bold block mb-1">السلف المستردة / المسددة</span>
                  <span className="text-base font-black text-blue-900 font-mono">
                    {formatCurrency(officeMetrics.totalAdvancesRepaid, settings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-none">
                  <span className="text-rose-800 font-bold block mb-1">صافي عهدة / سلفة المكتب</span>
                  <span className="text-base font-black text-rose-900 font-mono">
                    {formatCurrency(officeMetrics.netAdvanceBalance, settings.currency)}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-right border-collapse text-xs border border-slate-300">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 font-black">
                    <th className="p-2.5 border-l border-slate-300">#</th>
                    <th className="p-2.5 border-l border-slate-300">التاريخ</th>
                    <th className="p-2.5 border-l border-slate-300">نوع الحركة والتصنيف</th>
                    <th className="p-2.5 border-l border-slate-300">المستلم / المسؤول</th>
                    <th className="p-2.5 border-l border-slate-300">المنصرف للمكتب</th>
                    <th className="p-2.5">المورد للصندوق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {officeEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-400">
                        لا توجد حركات مالية مسجلة للمكتب في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    officeEntries.map((e, idx) => (
                      <tr key={e.id}>
                        <td className="p-2 border-l border-slate-300 font-mono">{idx + 1}</td>
                        <td className="p-2 border-l border-slate-300 font-mono">{e.dateStr}</td>
                        <td className="p-2 border-l border-slate-300 font-bold">{e.category || 'نثريات المكتب'}</td>
                        <td className="p-2 border-l border-slate-300">{e.contactName || selectedOfficeOfficer.name}</td>
                        <td className="p-2 border-l border-slate-300 font-bold font-mono">
                          {e.type === 'expense' ? formatCurrency(e.amount, settings.currency) : '-'}
                        </td>
                        <td className="p-2 font-bold font-mono">
                          {e.type === 'deposit' ? formatCurrency(e.amount, settings.currency) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Signatures */}
              <div className="pt-8 border-t-2 border-slate-800 grid grid-cols-3 gap-6 text-center text-xs">
                <div>
                  <span className="text-slate-700 font-bold block mb-10">توقيع مسؤول المكتب:</span>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                </div>
                <div>
                  <span className="text-slate-700 font-bold block mb-10">توقيع أمين الصندوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                </div>
                <div>
                  <span className="text-slate-700 font-bold block mb-10">اعتماد إدارة السوق:</span>
                  <div className="border-b border-dashed border-slate-400 mx-6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* UNIFIED MODAL: SELLER ADVANCE MANAGEMENT (إدارة سلف الصياد - صرف وسداد) */}
      {/* ========================================================================= */}
      {isSellerAdvanceUnifiedModalOpen && selectedSeller && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 text-slate-800" dir="rtl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إدارة سلف الصياد ({selectedSeller.name})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الرصيد القائم حالياً: <strong className="text-amber-700 font-mono font-black">{formatCurrency(totalSellerAdvancesOwed, settings.currency)}</strong>
                    {totalSellerAdvancesOwed > 0 && (
                      <span className="text-[11px] text-amber-900/80 font-mono font-bold mr-1">
                        ({formatNumberWithDots(totalSellerAdvancesOwed)})
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSellerAdvanceUnifiedModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => setSellerAdvanceUnifiedTab('give')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  sellerAdvanceUnifiedTab === 'give'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة للصياد</span>
              </button>
              <button
                type="button"
                onClick={() => setSellerAdvanceUnifiedTab('repay')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  sellerAdvanceUnifiedTab === 'repay'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🔺 سداد سلفة نقداً</span>
              </button>
            </div>

            {/* TAB 1: GIVE ADVANCE FORM */}
            {sellerAdvanceUnifiedTab === 'give' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!sellerAdvanceAmount || Number(sellerAdvanceAmount) <= 0 || isSubmittingSellerAdvance) return;
                  setIsSubmittingSellerAdvance(true);
                  try {
                    if (onSaveSellerAdvance) {
                      const res = onSaveSellerAdvance(
                        selectedSeller.id,
                        selectedSeller.name,
                        Number(sellerAdvanceAmount),
                        sellerAdvanceNotes.trim() || undefined
                      );
                      if (res) setSelectedSellerAdvanceForPrint(res);
                    }
                    setSellerAdvanceAmount('');
                    setSellerAdvanceNotes('');
                    setIsSellerAdvanceUnifiedModalOpen(false);
                  } finally {
                    setIsSubmittingSellerAdvance(false);
                  }
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    مبلغ السلفة ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    min="0.01"
                    value={sellerAdvanceAmount}
                    onChange={(e) => setSellerAdvanceAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />

                  {/* Formatted Number Display & Live Tafqeet */}
                  {Number(sellerAdvanceAmount) > 0 && (
                    <div className="mt-2 p-2.5 bg-amber-50/90 border border-amber-200 rounded-none space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-900">المبلغ بالأرقام المنظمة:</span>
                        <span className="font-black font-mono text-sm text-amber-800">
                          {formatNumberWithDots(Number(sellerAdvanceAmount))} {settings.currency}
                          <span className="text-[10px] text-amber-600 font-normal mr-1.5">({formatCurrency(Number(sellerAdvanceAmount), '')})</span>
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-amber-900 pt-1 border-t border-amber-200/70">
                        <span className="text-slate-500 font-normal">المبلغ كتابةً: </span>
                        {tafqeet(Number(sellerAdvanceAmount), settings.currency)}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pt-1 border-t border-amber-200/50">
                        <span>إجمالي سلفة الصياد بعد هذا الصرف:</span>
                        <span className="font-mono font-black text-amber-800">
                          {formatCurrency(totalSellerAdvancesOwed + Number(sellerAdvanceAmount), settings.currency)} ({formatNumberWithDots(totalSellerAdvancesOwed + Number(sellerAdvanceAmount))})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والغرض (اختياري)</label>
                  <input
                    type="text"
                    value={sellerAdvanceNotes}
                    onChange={(e) => setSellerAdvanceNotes(e.target.value)}
                    placeholder="مثال: سلفة نقدية مباشرة، شراء شباك صيد..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSellerAdvanceUnifiedModalOpen(false)}
                    className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSellerAdvance || !sellerAdvanceAmount}
                    className="px-5 py-2.5 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد صرف السلفة</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: REPAY ADVANCE FORM */}
            {sellerAdvanceUnifiedTab === 'repay' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!sellerRepayAmount || Number(sellerRepayAmount) <= 0 || isSubmittingSellerRepay) return;
                  setIsSubmittingSellerRepay(true);
                  try {
                    if (onRepaySellerAdvanceCash) {
                      const res = onRepaySellerAdvanceCash(
                        selectedSeller.id,
                        selectedSeller.name,
                        Number(sellerRepayAmount),
                        sellerRepayNotes.trim() || 'سداد سلفة صياد نقداً'
                      );
                      if (res) setSelectedRepaymentForPrint(res);
                    }
                    setSellerRepayAmount('');
                    setSellerRepayNotes('');
                    setIsSellerAdvanceUnifiedModalOpen(false);
                  } finally {
                    setIsSubmittingSellerRepay(false);
                  }
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      المبلغ المسدد نقداً ({settings.currency}) <span className="text-rose-500">*</span>
                    </label>
                    {totalSellerAdvancesOwed > 0 && (
                      <button
                        type="button"
                        onClick={() => setSellerRepayAmount(totalSellerAdvancesOwed)}
                        className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>سداد كامل السلفة</span>
                        <span className="font-mono">({formatNumberWithDots(totalSellerAdvancesOwed)} {settings.currency})</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    min="0.01"
                    value={sellerRepayAmount}
                    onChange={(e) => setSellerRepayAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />

                  {/* Formatted Number Display & Live Tafqeet */}
                  {Number(sellerRepayAmount) > 0 && (
                    <div className="mt-2 p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-none space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-900">المبلغ بالأرقام المنظمة:</span>
                        <span className="font-black font-mono text-sm text-emerald-800">
                          {formatNumberWithDots(Number(sellerRepayAmount))} {settings.currency}
                          <span className="text-[10px] text-emerald-600 font-normal mr-1.5">({formatCurrency(Number(sellerRepayAmount), '')})</span>
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-emerald-900 pt-1 border-t border-emerald-200/70">
                        <span className="text-slate-500 font-normal">المبلغ كتابةً: </span>
                        {tafqeet(Number(sellerRepayAmount), settings.currency)}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pt-1 border-t border-emerald-200/50">
                        <span>المتبقي من السلفة بعد السداد:</span>
                        <span className="font-mono font-black text-emerald-800">
                          {formatCurrency(Math.max(0, totalSellerAdvancesOwed - Number(sellerRepayAmount)), settings.currency)} ({formatNumberWithDots(Math.max(0, totalSellerAdvancesOwed - Number(sellerRepayAmount)))})
                        </span>
                      </div>
                      {Number(sellerRepayAmount) >= totalSellerAdvancesOwed && totalSellerAdvancesOwed > 0 && (
                        <div className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded text-center">
                          ✓ سداد كامل - تصفية سلفة الصياد بالكامل
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والملاحظات</label>
                  <input
                    type="text"
                    value={sellerRepayNotes}
                    onChange={(e) => setSellerRepayNotes(e.target.value)}
                    placeholder="مثال: سداد سلفة نقداً للصندوق..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsSellerAdvanceUnifiedModalOpen(false)}
                    className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSellerRepay || !sellerRepayAmount}
                    className="px-5 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد استلام وتوريد المبلغ</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* UNIFIED MODAL: BUYER LOAN MANAGEMENT (إدارة سلف المشتري - يستلف من الصندوق) */}
      {/* ========================================================================= */}
      {isBuyerLoanModalOpen && selectedBuyer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 text-slate-800" dir="rtl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إدارة سلف المشتري ({selectedBuyer.name})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    السلفة القائمة بذمة المشتري: <strong className="text-amber-700 font-mono font-black">{formatCurrency(totalBuyerAdvancesOwed, settings.currency)}</strong>
                    {totalBuyerAdvancesOwed > 0 && (
                      <span className="text-[11px] text-amber-900/80 font-mono font-bold mr-1">
                        ({formatNumberWithDots(totalBuyerAdvancesOwed)})
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBuyerLoanModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => setBuyerLoanTab('give')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  buyerLoanTab === 'give'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة (استلاف)</span>
              </button>
              <button
                type="button"
                onClick={() => setBuyerLoanTab('repay')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  buyerLoanTab === 'repay'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🔺 سداد سلفة نقداً</span>
              </button>
            </div>

            {/* TAB 1: GIVE BUYER LOAN (صرف سلفة: المشتري يستلف نقدية من الصندوق) */}
            {buyerLoanTab === 'give' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!buyerLoanAmount || Number(buyerLoanAmount) <= 0 || isSubmittingBuyerLoan) return;
                  if (Number(buyerLoanAmount) > currentCashDrawer) {
                    alert(`المبلغ المطلوب (${formatCurrency(Number(buyerLoanAmount), settings.currency)}) يتجاوز رصيد الصندوق المتوفر (${formatCurrency(currentCashDrawer, settings.currency)})`);
                    return;
                  }
                  setIsSubmittingBuyerLoan(true);
                  try {
                    if (onSaveBuyerLoan) {
                      const res = onSaveBuyerLoan(
                        selectedBuyer.id,
                        selectedBuyer.name,
                        Number(buyerLoanAmount),
                        buyerLoanNotes.trim() || undefined
                      );
                      if (res) setSelectedBuyerLoanForPrint(res);
                    }
                    setBuyerLoanAmount('');
                    setBuyerLoanNotes('');
                    setIsBuyerLoanModalOpen(false);
                  } finally {
                    setIsSubmittingBuyerLoan(false);
                  }
                }}
                className="mt-4 space-y-4"
              >
                <div className="p-3 bg-amber-50 rounded-none border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">💡 المشتري يستلف نقدية من الصندوق:</p>
                  <p className="text-[11px] text-amber-800">
                    سيتم صرف المبلغ نقداً من الصندوق وتقييده ديناً (سلفة قائمة) بذمة المشتري للجمعية.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      مبلغ السلفة المطلوب استلافه ({settings.currency}) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[11px] text-slate-500">
                      سيولة الصندوق: <strong className="font-mono text-slate-800">{formatCurrency(currentCashDrawer, settings.currency)} ({formatNumberWithDots(currentCashDrawer)})</strong>
                    </span>
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    min="0.01"
                    max={currentCashDrawer > 0 ? currentCashDrawer : undefined}
                    value={buyerLoanAmount}
                    onChange={(e) => setBuyerLoanAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />

                  {/* Formatted Number Display & Live Tafqeet */}
                  {Number(buyerLoanAmount) > 0 && (
                    <div className="mt-2 p-2.5 bg-amber-50/90 border border-amber-200 rounded-none space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-900">المبلغ بالأرقام المنظمة:</span>
                        <span className="font-black font-mono text-sm text-amber-800">
                          {formatNumberWithDots(Number(buyerLoanAmount))} {settings.currency}
                          <span className="text-[10px] text-amber-600 font-normal mr-1.5">({formatCurrency(Number(buyerLoanAmount), '')})</span>
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-amber-900 pt-1 border-t border-amber-200/70">
                        <span className="text-slate-500 font-normal">المبلغ كتابةً: </span>
                        {tafqeet(Number(buyerLoanAmount), settings.currency)}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pt-1 border-t border-amber-200/50">
                        <span>إجمالي سلفة المشتري بعد هذا الصرف:</span>
                        <span className="font-mono font-black text-amber-800">
                          {formatCurrency(totalBuyerAdvancesOwed + Number(buyerLoanAmount), settings.currency)} ({formatNumberWithDots(totalBuyerAdvancesOwed + Number(buyerLoanAmount))})
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والغرض (اختياري)</label>
                  <input
                    type="text"
                    value={buyerLoanNotes}
                    onChange={(e) => setBuyerLoanNotes(e.target.value)}
                    placeholder="مثال: سلفة نقدية شخصية للمشتري..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsBuyerLoanModalOpen(false)}
                    className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBuyerLoan || !buyerLoanAmount || Number(buyerLoanAmount) > currentCashDrawer}
                    className="px-5 py-2.5 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد صرف السلفة نقداً</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: REPAY BUYER LOAN (سداد سلفة: المشتري يدفع نقدية للصندوق) */}
            {buyerLoanTab === 'repay' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!buyerLoanAmount || Number(buyerLoanAmount) <= 0 || isSubmittingBuyerLoan) return;
                  setIsSubmittingBuyerLoan(true);
                  try {
                    if (onRepayBuyerLoanCash) {
                      const res = onRepayBuyerLoanCash(
                        selectedBuyer.id,
                        selectedBuyer.name,
                        Number(buyerLoanAmount),
                        buyerLoanNotes.trim() || 'سداد سلفة مشتري نقداً'
                      );
                      if (res) setSelectedBuyerLoanForPrint(res);
                    }
                    setBuyerLoanAmount('');
                    setBuyerLoanNotes('');
                    setIsBuyerLoanModalOpen(false);
                  } finally {
                    setIsSubmittingBuyerLoan(false);
                  }
                }}
                className="mt-4 space-y-4"
              >
                <div className="p-3 bg-emerald-50 rounded-none border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <p className="font-bold">💡 المشتري يورد نقدية للصندوق لسداد سلفته:</p>
                  <p className="text-[11px] text-emerald-800">
                    سيتم إيداع المبلغ في الصندوق وتخفيض السلفة القائمة بذمة المشتري.
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-800">
                      المبلغ المسدد نقداً ({settings.currency}) <span className="text-rose-500">*</span>
                    </label>
                    {totalBuyerAdvancesOwed > 0 && (
                      <button
                        type="button"
                        onClick={() => setBuyerLoanAmount(totalBuyerAdvancesOwed)}
                        className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                      >
                        <span>سداد كامل السلفة</span>
                        <span className="font-mono">({formatNumberWithDots(totalBuyerAdvancesOwed)} {settings.currency})</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    autoFocus
                    min="0.01"
                    value={buyerLoanAmount}
                    onChange={(e) => setBuyerLoanAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />

                  {/* Formatted Number Display & Live Tafqeet */}
                  {Number(buyerLoanAmount) > 0 && (
                    <div className="mt-2 p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-none space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-900">المبلغ بالأرقام المنظمة:</span>
                        <span className="font-black font-mono text-sm text-emerald-800">
                          {formatNumberWithDots(Number(buyerLoanAmount))} {settings.currency}
                          <span className="text-[10px] text-emerald-600 font-normal mr-1.5">({formatCurrency(Number(buyerLoanAmount), '')})</span>
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-emerald-900 pt-1 border-t border-emerald-200/70">
                        <span className="text-slate-500 font-normal">المبلغ كتابةً: </span>
                        {tafqeet(Number(buyerLoanAmount), settings.currency)}
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 pt-1 border-t border-emerald-200/50">
                        <span>المتبقي من السلفة بعد السداد:</span>
                        <span className="font-mono font-black text-emerald-800">
                          {formatCurrency(Math.max(0, totalBuyerAdvancesOwed - Number(buyerLoanAmount)), settings.currency)} ({formatNumberWithDots(Math.max(0, totalBuyerAdvancesOwed - Number(buyerLoanAmount)))})
                        </span>
                      </div>
                      {Number(buyerLoanAmount) >= totalBuyerAdvancesOwed && totalBuyerAdvancesOwed > 0 && (
                        <div className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded text-center">
                          ✓ سداد كامل - تصفية سلفة المشتري بالكامل
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والملاحظات</label>
                  <input
                    type="text"
                    value={buyerLoanNotes}
                    onChange={(e) => setBuyerLoanNotes(e.target.value)}
                    placeholder="مثال: سداد سلفة مشتري نقداً للصندوق..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsBuyerLoanModalOpen(false)}
                    className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingBuyerLoan || !buyerLoanAmount}
                    className="px-5 py-2.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد استلام وتوريد المبلغ للصندوق</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* PRINT VOUCHER MODAL FOR BUYER LOAN */}
      {selectedBuyerLoanForPrint && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-none flex items-center justify-center ${selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  <HandCoins className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900">
                  {selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'سند صرف سلفة مشتري' : 'سند قبض سداد سلفة مشتري'}
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
                  onClick={() => setSelectedBuyerLoanForPrint(null)}
                  className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="printable-receipt-area p-4 border-2 border-slate-800 rounded-none bg-white space-y-4 my-2 text-xs max-w-[380px] mx-auto print:border-black print:p-2 font-mono">
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
                <div className={`inline-block mt-2 px-3 py-0.5 text-white rounded font-black text-xs ${selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'bg-amber-800' : 'bg-emerald-800'}`}>
                  {selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'سند صرف سلفة نقدية لمشتري' : 'سند قبض سداد سلفة مشتري'}
                </div>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-300">
                <div>
                  <span className="text-slate-500 block text-[11px]">رقم السند:</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{selectedBuyerLoanForPrint.id}</span>
                </div>
                <div className="text-left">
                  <span className="text-slate-500 block text-[11px]">التاريخ والوقت:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedBuyerLoanForPrint.dateStr} {selectedBuyerLoanForPrint.timeStr}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-none border border-slate-300">
                <div className="flex justify-between font-bold">
                  <span className="text-slate-600">اسم المشتري:</span>
                  <span className="text-slate-900">{selectedBuyerLoanForPrint.contactName}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span className="text-slate-600">نوع العملية:</span>
                  <span className={selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'text-amber-800' : 'text-emerald-800'}>
                    {selectedBuyerLoanForPrint.type === 'buyer_advance' ? 'صرف سلفة (استلاف من الصندوق)' : 'سداد نقدي لسلفة قائمة'}
                  </span>
                </div>
              </div>

              <div className="text-center p-3 bg-slate-100 rounded-none border border-slate-300">
                <span className="text-[11px] text-slate-600 block mb-0.5">المبلغ:</span>
                <span className="text-xl font-mono font-black text-slate-900">
                  {formatCurrency(selectedBuyerLoanForPrint.amount, settings.currency)}
                </span>
                <p className="text-[11px] text-slate-600 font-bold mt-1">
                  {tafqeet(selectedBuyerLoanForPrint.amount, settings.currency)}
                </p>
              </div>

              {selectedBuyerLoanForPrint.description && (
                <div className="text-[11px] text-slate-700 bg-slate-50 p-2 rounded-none border border-slate-300">
                  <span className="font-bold block text-slate-500">البيان:</span>
                  <span>{selectedBuyerLoanForPrint.description}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-300 text-center text-[11px]">
                <div>
                  <span className="text-slate-500 block">توقيع المستلم:</span>
                  <div className="h-8 border-b border-dashed border-slate-400 mt-2"></div>
                </div>
                <div>
                  <span className="text-slate-500 block">أمين الصندوق:</span>
                  {settings.employeeName ? (
                    <span className="text-xs font-black text-slate-900 block mt-0.5">({settings.employeeName})</span>
                  ) : (
                    <div className="h-4"></div>
                  )}
                  <div className="h-6 border-b border-dashed border-slate-400 mt-1"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNIFIED MODAL: WORKER ADVANCE MANAGEMENT (إدارة سلف العامل - صرف وسداد) */}
      {/* ========================================================================= */}
      {isWorkerAdvanceUnifiedModalOpen && selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 text-slate-800" dir="rtl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إدارة سلف العامل ({selectedWorker.name})</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الرصيد المتبقي: <strong className="text-amber-700 font-mono">{formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkerAdvanceUnifiedModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => setWorkerAdvanceUnifiedTab('give')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  workerAdvanceUnifiedTab === 'give'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة للعامل</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkerAdvanceUnifiedTab('repay')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  workerAdvanceUnifiedTab === 'repay'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🔺 سداد / استرداد سلفة</span>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => {
                if (workerAdvanceUnifiedTab === 'give') handleWorkerAdvanceSubmit(e);
                else handleWorkerRepaySubmit(e);
                setIsWorkerAdvanceUnifiedModalOpen(false);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    {workerAdvanceUnifiedTab === 'give' ? 'مبلغ السلفة' : 'المبلغ المسدد نقداً'} ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  {workerAdvanceUnifiedTab === 'repay' && workerMetrics.netAdvanceBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setWorkerRepayAmount(workerMetrics.netAdvanceBalance)}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      تصفية كامل السلفة ({formatCurrency(workerMetrics.netAdvanceBalance, settings.currency)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="0.01"
                  value={workerAdvanceUnifiedTab === 'give' ? workerAdvanceAmount : workerRepayAmount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    if (workerAdvanceUnifiedTab === 'give') setWorkerAdvanceAmount(val);
                    else setWorkerRepayAmount(val);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والملاحظات</label>
                <input
                  type="text"
                  value={workerAdvanceUnifiedTab === 'give' ? workerAdvanceNotes : workerRepayNotes}
                  onChange={(e) => {
                    if (workerAdvanceUnifiedTab === 'give') setWorkerAdvanceNotes(e.target.value);
                    else setWorkerRepayNotes(e.target.value);
                  }}
                  placeholder={workerAdvanceUnifiedTab === 'give' ? 'مثال: سلفة أسبوعية...' : 'مثال: سداد سلفة نقداً...'}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">مصدر الحركة</label>
                <div className="grid grid-cols-2 gap-2 rounded-none bg-slate-100 p-1">
                  <button type="button" onClick={() => workerAdvanceUnifiedTab === 'give' ? setWorkerAdvanceMethod('cash') : setWorkerRepayMethod('cash')} className={`rounded-none py-2 text-xs font-bold ${(workerAdvanceUnifiedTab === 'give' ? workerAdvanceMethod : workerRepayMethod) === 'cash' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصندوق</button>
                  <button type="button" onClick={() => workerAdvanceUnifiedTab === 'give' ? setWorkerAdvanceMethod('exchange') : setWorkerRepayMethod('exchange')} className={`rounded-none py-2 text-xs font-bold ${(workerAdvanceUnifiedTab === 'give' ? workerAdvanceMethod : workerRepayMethod) === 'exchange' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصرافة</button>
                </div>
                {(workerAdvanceUnifiedTab === 'give' ? workerAdvanceMethod : workerRepayMethod) === 'exchange' && (
                  <input type="text" value={workerAdvanceUnifiedTab === 'give' ? workerAdvanceExchangeName : workerRepayExchangeName} onChange={(e) => workerAdvanceUnifiedTab === 'give' ? setWorkerAdvanceExchangeName(e.target.value) : setWorkerRepayExchangeName(e.target.value)} placeholder="اسم الصرافة / رقم الحوالة" className="mt-2 w-full rounded-none border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500" />
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsWorkerAdvanceUnifiedModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    workerAdvanceUnifiedTab === 'give'
                      ? isSubmittingWorkerAdvance || !workerAdvanceAmount
                      : isSubmittingWorkerRepay || !workerRepayAmount
                  }
                  className={`px-5 py-2.5 rounded-none text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    workerAdvanceUnifiedTab === 'give' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{workerAdvanceUnifiedTab === 'give' ? 'تأكيد صرف السلفة' : 'تأكيد استرداد السلفة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNIFIED MODAL: OFFICE ADVANCE MANAGEMENT (إدارة سلف المكتب - صرف وسداد) */}
      {/* ========================================================================= */}
      {isOfficeAdvanceUnifiedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-xl border border-slate-100 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 text-slate-800" dir="rtl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-none bg-amber-100 text-amber-700 flex items-center justify-center">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">إدارة سلف وعهدة المكتب</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    العهدة القائمة: <strong className="text-amber-700 font-mono">{formatCurrency(officeMetrics.netAdvanceBalance, settings.currency)}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOfficeAdvanceUnifiedModalOpen(false)}
                className="p-2 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-1 bg-slate-100 rounded-none">
              <button
                type="button"
                onClick={() => setOfficeAdvanceUnifiedTab('give')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  officeAdvanceUnifiedTab === 'give'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة / عهدة</span>
              </button>
              <button
                type="button"
                onClick={() => setOfficeAdvanceUnifiedTab('repay')}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  officeAdvanceUnifiedTab === 'repay'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🔺 سداد / توريد سلفة</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                if (officeAdvanceUnifiedTab === 'give') handleOfficeAdvanceSubmit(e);
                else handleOfficeRepaySubmit(e);
                setIsOfficeAdvanceUnifiedModalOpen(false);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  اسم المستلم / مسؤول المكتب <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={officeAdvanceUnifiedTab === 'give' ? officeAdvanceOfficer : officeRepayOfficer}
                  onChange={(e) => {
                    if (officeAdvanceUnifiedTab === 'give') setOfficeAdvanceOfficer(e.target.value);
                    else setOfficeRepayOfficer(e.target.value);
                  }}
                  placeholder="مثال: مسؤول المكتب..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    {officeAdvanceUnifiedTab === 'give' ? 'مبلغ السلفة / العهدة' : 'المبلغ المورد للصندوق'} ({settings.currency}) <span className="text-rose-500">*</span>
                  </label>
                  {officeAdvanceUnifiedTab === 'repay' && officeMetrics.netAdvanceBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => setOfficeRepayAmount(officeMetrics.netAdvanceBalance)}
                      className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      تصفية كامل العهدة ({formatCurrency(officeMetrics.netAdvanceBalance, settings.currency)})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  autoFocus
                  min="0.01"
                  value={officeAdvanceUnifiedTab === 'give' ? officeAdvanceAmount : officeRepayAmount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    if (officeAdvanceUnifiedTab === 'give') setOfficeAdvanceAmount(val);
                    else setOfficeRepayAmount(val);
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">البيان والغرض (اختياري)</label>
                <input
                  type="text"
                  value={officeAdvanceUnifiedTab === 'give' ? officeAdvanceNotes : officeRepayNotes}
                  onChange={(e) => {
                    if (officeAdvanceUnifiedTab === 'give') setOfficeAdvanceNotes(e.target.value);
                    else setOfficeRepayNotes(e.target.value);
                  }}
                  placeholder={officeAdvanceUnifiedTab === 'give' ? 'مثال: عهدة مشتريات المكتب...' : 'مثال: توريد متبقي العهدة...'}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">مصدر الحركة</label>
                <div className="grid grid-cols-2 gap-2 rounded-none bg-slate-100 p-1">
                  <button type="button" onClick={() => officeAdvanceUnifiedTab === 'give' ? setOfficeAdvanceMethod('cash') : setOfficeRepayMethod('cash')} className={`rounded-none py-2 text-xs font-bold ${(officeAdvanceUnifiedTab === 'give' ? officeAdvanceMethod : officeRepayMethod) === 'cash' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصندوق</button>
                  <button type="button" onClick={() => officeAdvanceUnifiedTab === 'give' ? setOfficeAdvanceMethod('exchange') : setOfficeRepayMethod('exchange')} className={`rounded-none py-2 text-xs font-bold ${(officeAdvanceUnifiedTab === 'give' ? officeAdvanceMethod : officeRepayMethod) === 'exchange' ? 'bg-white text-sky-900 shadow-xs' : 'text-slate-600'}`}>الصرافة</button>
                </div>
                {(officeAdvanceUnifiedTab === 'give' ? officeAdvanceMethod : officeRepayMethod) === 'exchange' && (
                  <input type="text" value={officeAdvanceUnifiedTab === 'give' ? officeAdvanceExchangeName : officeRepayExchangeName} onChange={(e) => officeAdvanceUnifiedTab === 'give' ? setOfficeAdvanceExchangeName(e.target.value) : setOfficeRepayExchangeName(e.target.value)} placeholder="اسم الصرافة / رقم الحوالة" className="mt-2 w-full rounded-none border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs focus:bg-white focus:ring-2 focus:ring-sky-500" />
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsOfficeAdvanceUnifiedModalOpen(false)}
                  className="px-4 py-2.5 rounded-none border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    officeAdvanceUnifiedTab === 'give'
                      ? isSubmittingOfficeAdvance || !officeAdvanceAmount
                      : isSubmittingOfficeRepay || !officeRepayAmount
                  }
                  className={`px-5 py-2.5 rounded-none text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    officeAdvanceUnifiedTab === 'give' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{officeAdvanceUnifiedTab === 'give' ? 'تأكيد صرف السلفة' : 'تأكيد توريد وإيداع المبلغ'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
