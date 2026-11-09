import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, MarketSettings, Contact, LotTransferRecord } from '../types';
import { formatCurrency, formatGregorianDate, formatGregorianTime, normalizeArabic } from '../utils/calculations';
import { loadLotTransfers, saveLotTransfers } from '../utils/storage';
import {
  X,
  ArrowLeftRight,
  User,
  Phone,
  Printer,
  Check,
  AlertCircle,
  Clock,
  Calendar,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Coins,
  Search,
  ChevronDown,
} from 'lucide-react';

interface TransferBuyerModalProps {
  transaction: Transaction;
  settings: MarketSettings;
  contacts?: Contact[];
  onClose: () => void;
  onConfirmTransfer: (updatedTrx: Transaction, autoPrint: boolean, transferRecord?: LotTransferRecord) => void;
  onResellTransaction?: (newTrx: Transaction, autoPrint: boolean, updatedOriginalTrx?: Transaction) => void;
  onQuickAddContact?: (contactData: Partial<Contact>) => Contact;
}

export const TransferBuyerModal: React.FC<TransferBuyerModalProps> = ({
  transaction,
  settings,
  contacts = [],
  onClose,
  onConfirmTransfer,
  onResellTransaction,
  onQuickAddContact,
}) => {
  const [activeTab, setActiveTab] = useState<'transfer' | 'resell'>('resell');

  const isOriginalFullyPaid = useMemo(() => {
    if (transaction.paymentStatus === 'paid') return true;
    if (
      transaction.buyerRemainingDebt !== undefined &&
      transaction.buyerRemainingDebt <= 0 &&
      (transaction.totalFromBuyer || 0) > 0
    ) {
      return true;
    }
    if (
      transaction.settlementType === 'direct_cash' ||
      transaction.settlementType === 'association_cash'
    ) {
      return true;
    }
    return false;
  }, [transaction]);

  // Transfer state
  const [newBuyerName, setNewBuyerName] = useState('');
  const [newBuyerPhone, setNewBuyerPhone] = useState('');
  const [newPaymentStatus, setNewPaymentStatus] = useState<'pending' | 'paid'>(
    isOriginalFullyPaid ? 'paid' : 'pending'
  );
  const [autoPrint, setAutoPrint] = useState(false);
  const [transferNotes, setTransferNotes] = useState('');
  const [isTransferDropdownOpen, setIsTransferDropdownOpen] = useState(false);
  const [highlightedTransferIndex, setHighlightedTransferIndex] = useState(-1);
  const transferBuyerContainerRef = useRef<HTMLDivElement>(null);
  const transferInputRef = useRef<HTMLInputElement>(null);

  // Resell state
  const [resellBuyerName, setResellBuyerName] = useState('');
  const [resellBuyerPhone, setResellBuyerPhone] = useState('');
  const [resellPrice, setResellPrice] = useState<number | ''>(transaction.grossAmount);
  const [resellPaymentStatus, setResellPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [sellerTaxMode, setSellerTaxMode] = useState<'pay' | 'exempt'>('exempt');
  const [resellNotes, setResellNotes] = useState('');
  const [resellAutoPrint, setResellAutoPrint] = useState(false);
  const [isResellDropdownOpen, setIsResellDropdownOpen] = useState(false);
  const [highlightedResellIndex, setHighlightedResellIndex] = useState(-1);
  const resellBuyerContainerRef = useRef<HTMLDivElement>(null);
  const resellInputRef = useRef<HTMLInputElement>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available buyers excluding current buyer
  const availableBuyers = useMemo(() => {
    const currentNorm = normalizeArabic(transaction.buyerName || '');
    return contacts.filter(
      (c) =>
        (c.type === 'buyer' || c.type === 'both') &&
        c.type !== 'worker' &&
        normalizeArabic(c.name) !== currentNorm
    );
  }, [contacts, transaction.buyerName]);

  // Filtered matching buyers for Transfer tab (autocomplete on typing 1+ letter or on toggle)
  const matchingTransferBuyers = useMemo(() => {
    const rawQuery = newBuyerName.trim();
    if (!rawQuery) return availableBuyers;
    const query = normalizeArabic(rawQuery);
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filtered = availableBuyers.filter((b) => {
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

    return filtered.sort((a, b) => {
      const aStarts = normalizeArabic(a.name).startsWith(query);
      const bStarts = normalizeArabic(b.name).startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [availableBuyers, newBuyerName]);

  const visibleTransferBuyers = useMemo(() => {
    return matchingTransferBuyers.slice(0, 10);
  }, [matchingTransferBuyers]);

  const matchedContactForTransfer = useMemo(() => {
    if (!newBuyerName.trim()) return null;
    const norm = normalizeArabic(newBuyerName);
    return availableBuyers.find((c) => normalizeArabic(c.name) === norm) || null;
  }, [availableBuyers, newBuyerName]);

  // Filtered matching buyers for Resell tab
  const matchingResellBuyers = useMemo(() => {
    const rawQuery = resellBuyerName.trim();
    if (!rawQuery) return availableBuyers;
    const query = normalizeArabic(rawQuery);
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filtered = availableBuyers.filter((b) => {
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

    return filtered.sort((a, b) => {
      const aStarts = normalizeArabic(a.name).startsWith(query);
      const bStarts = normalizeArabic(b.name).startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [availableBuyers, resellBuyerName]);

  const visibleResellBuyers = useMemo(() => {
    return matchingResellBuyers.slice(0, 10);
  }, [matchingResellBuyers]);

  const matchedContactForResell = useMemo(() => {
    if (!resellBuyerName.trim()) return null;
    const norm = normalizeArabic(resellBuyerName);
    return availableBuyers.find((c) => normalizeArabic(c.name) === norm) || null;
  }, [availableBuyers, resellBuyerName]);

  // Financial calculations for resell based on user-specified resellPrice & previous lot cost
  const activeResellGross = typeof resellPrice === 'number' && resellPrice > 0 ? resellPrice : 0;
  const originalGross = Number(transaction.grossAmount) || 0;
  const isPriceIncreased = activeResellGross > originalGross;
  const priceDifference = activeResellGross - originalGross;

  // خيار دفع الضريبة أو الإعفاء منها على المشتري الأصلي (البائع)
  const defaultSellerRate = typeof settings.sellerTaxRate === 'number' ? settings.sellerTaxRate : 0.03;
  const isSellerExempt = sellerTaxMode === 'exempt';
  const effectiveSellerRate = (!isSellerExempt && isPriceIncreased) ? defaultSellerRate : 0;
  const sellerCommission = isSellerExempt ? 0 : Math.round(activeResellGross * effectiveSellerRate * 100) / 100;

  const previousGross = transaction.totalFromBuyer || transaction.grossAmount || 0;
  const unpaidPreviousCost = Math.max(0, previousGross - (transaction.buyerPaidAmount || 0));

  // صافي الفائض لدرج الكاش في حال البيع بزيادة بعد تغطية التكلفة السابقة وعمولة البيع
  const calculatedSurplus = Math.round(((activeResellGross - sellerCommission) - unpaidPreviousCost) * 100) / 100;
  const finalSurplus = isPriceIncreased && calculatedSurplus > 0 ? calculatedSurplus : 0;
  const netToSeller = finalSurplus;

  // المشتري الجديد يدفع ضريبة الشراء المعتادة
  const buyerTaxRate = typeof settings.buyerTaxRate === 'number' ? settings.buyerTaxRate : 0.02;
  const buyerCommission = Math.round(activeResellGross * buyerTaxRate * 100) / 100;
  const totalCommission = Math.round((sellerCommission + buyerCommission) * 100) / 100;
  const totalFromBuyer = Math.round((activeResellGross + buyerCommission) * 100) / 100;

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        transferBuyerContainerRef.current &&
        !transferBuyerContainerRef.current.contains(e.target as Node)
      ) {
        setIsTransferDropdownOpen(false);
      }
      if (
        resellBuyerContainerRef.current &&
        !resellBuyerContainerRef.current.contains(e.target as Node)
      ) {
        setIsResellDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectBuyerForTransfer = (contact: Contact) => {
    setNewBuyerName(contact.name);
    if (contact.phone) {
      setNewBuyerPhone(contact.phone);
    }
    setIsTransferDropdownOpen(false);
    setHighlightedTransferIndex(-1);
    setErrorMessage(null);
  };

  const handleSelectBuyerForResell = (contact: Contact) => {
    setResellBuyerName(contact.name);
    if (contact.phone) {
      setResellBuyerPhone(contact.phone);
    }
    setIsResellDropdownOpen(false);
    setHighlightedResellIndex(-1);
    setErrorMessage(null);
  };

  const handleTransferKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isTransferDropdownOpen && visibleTransferBuyers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedTransferIndex((prev) =>
          prev < visibleTransferBuyers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedTransferIndex((prev) =>
          prev > 0 ? prev - 1 : visibleTransferBuyers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        if (highlightedTransferIndex >= 0 && visibleTransferBuyers[highlightedTransferIndex]) {
          e.preventDefault();
          handleSelectBuyerForTransfer(visibleTransferBuyers[highlightedTransferIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsTransferDropdownOpen(false);
        return;
      }
    }
  };

  const handleResellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isResellDropdownOpen && visibleResellBuyers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedResellIndex((prev) =>
          prev < visibleResellBuyers.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedResellIndex((prev) =>
          prev > 0 ? prev - 1 : visibleResellBuyers.length - 1
        );
        return;
      } else if (e.key === 'Enter') {
        if (highlightedResellIndex >= 0 && visibleResellBuyers[highlightedResellIndex]) {
          e.preventDefault();
          handleSelectBuyerForResell(visibleResellBuyers[highlightedResellIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsResellDropdownOpen(false);
        return;
      }
    }
  };

  const handleConfirmTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = newBuyerName.trim();
    if (!trimmedName) {
      setErrorMessage('يرجى كتابة أو اختيار اسم المشتري الجديد المحول إليه');
      return;
    }

    if (trimmedName.toLowerCase() === (transaction.buyerName || '').trim().toLowerCase()) {
      setErrorMessage('لا يمكن تحويل الشروة إلى نفس المشتري الحالي');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const transferTimestamp = `${formatGregorianDate(now)} ${formatGregorianTime(now)}`;

      const transferAuditLog = `[تحويل شروة: نُقلت من المشتري (${transaction.buyerName}) إلى (${trimmedName}) بتاريخ ${transferTimestamp}]`;
      const combinedNotes = transaction.notes
        ? `${transaction.notes}\n${transferAuditLog}${transferNotes ? ` - ملاحظة: ${transferNotes.trim()}` : ''}`
        : `${transferAuditLog}${transferNotes ? ` - ملاحظة: ${transferNotes.trim()}` : ''}`;

      const matchedContact = contacts.find(
        (c) =>
          (c.type === 'buyer' || c.type === 'both') &&
          c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      let newBuyerId = matchedContact?.id;
      if (!newBuyerId) {
        if (onQuickAddContact) {
          const created = onQuickAddContact({
            name: trimmedName,
            type: 'buyer',
            phone: newBuyerPhone.trim() || undefined,
          });
          newBuyerId = created.id;
        } else {
          newBuyerId = `buyer-${Date.now()}`;
        }
      }

      // Recalculate buyer financial fields for the new buyer
      const buyerPaidAmount =
        newPaymentStatus === 'paid'
          ? transaction.totalFromBuyer
          : 0;
      const buyerRemainingDebt =
        newPaymentStatus === 'pending'
          ? transaction.totalFromBuyer
          : 0;

      const updatedTrx: Transaction = {
        ...transaction,
        buyerId: newBuyerId,
        buyerName: trimmedName,
        buyerPhone: newBuyerPhone.trim() || (matchedContact?.phone ? matchedContact.phone : undefined),
        paymentStatus: newPaymentStatus,
        settlementType: newPaymentStatus === 'paid' ? 'association_cash' : 'association_credit',
        buyerPaidAmount,
        buyerRemainingDebt,
        buyerAdvanceUsed: 0,
        notes: combinedNotes,
        isEdited: false,
        isTransferred: true,
        transferredFromBuyerName: transaction.buyerName,
        transferredAt: Date.now(),
        editedAt: Date.now(),
        editedDateStr: formatGregorianDate(new Date()),
      };

      const transferRecord: LotTransferRecord = {
        id: `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        transactionId: transaction.id,
        timestamp: Date.now(),
        dateStr: transaction.dateStr || formatGregorianDate(new Date()),
        timeStr: formatGregorianTime(new Date()),
        fromBuyerId: transaction.buyerId,
        fromBuyerName: transaction.buyerName,
        toBuyerId: newBuyerId,
        toBuyerName: trimmedName,
        toBuyerPhone: newBuyerPhone.trim() || (matchedContact?.phone ? matchedContact.phone : undefined),
        grossAmount: transaction.grossAmount,
        buyerTaxAmount: transaction.buyerTaxAmount,
        totalAmount: transaction.totalFromBuyer,
        paymentStatus: newPaymentStatus,
        notes: transferNotes.trim() || undefined,
      };

      try {
        const existingTransfers = loadLotTransfers();
        saveLotTransfers([transferRecord, ...existingTransfers]);
      } catch (e) {
        console.warn('Error saving lot transfer record:', e);
      }

      onConfirmTransfer(updatedTrx, autoPrint, transferRecord);
      onClose();
    } catch (err) {
      console.error('Error transferring transaction:', err);
      setErrorMessage('حدث خطأ أثناء تنفيذ عملية التحويل، يرجى المحاولة ثانية');
      setIsSubmitting(false);
    }
  };

  const handleConfirmResell = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = resellBuyerName.trim();
    if (!trimmedName) {
      setErrorMessage('يرجى كتابة أو اختيار اسم المشتري الجديد');
      return;
    }

    if (trimmedName.toLowerCase() === (transaction.buyerName || '').trim().toLowerCase()) {
      setErrorMessage('لا يمكن بيع الشروة لنفس المشتري الحالي (البائع)');
      return;
    }

    const finalGross = typeof resellPrice === 'number' ? resellPrice : Number(resellPrice);
    if (!finalGross || finalGross <= 0) {
      setErrorMessage('يرجى تحديد سعر بيع جديد صحيح أكبر من الصفر');
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const matchedContact = contacts.find(
        (c) =>
          (c.type === 'buyer' || c.type === 'both') &&
          c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      let newBuyerId = matchedContact?.id;
      if (!newBuyerId) {
        if (onQuickAddContact) {
          const created = onQuickAddContact({
            name: trimmedName,
            type: 'buyer',
            phone: resellBuyerPhone.trim() || undefined,
          });
          newBuyerId = created.id;
        } else {
          newBuyerId = `buyer-${Date.now()}`;
        }
      }
      const isPaid = resellPaymentStatus === 'paid';

      // Financials based on finalGross and previous lot cost
      const originalGross = Number(transaction.grossAmount) || 0;
      const isPriceIncreased = finalGross > originalGross;
      const defaultSellerRate = typeof settings.sellerTaxRate === 'number' ? settings.sellerTaxRate : 0.03;
      const isSellerExempt = sellerTaxMode === 'exempt';
      const effectiveSellerRate = (!isSellerExempt && isPriceIncreased) ? defaultSellerRate : 0;
      const finalSellerCommission = isSellerExempt ? 0 : Math.round(finalGross * effectiveSellerRate * 100) / 100;

      const previousCost = transaction.totalFromBuyer || transaction.grossAmount || 0;
      const unpaidCost = Math.max(0, previousCost - (transaction.buyerPaidAmount || 0));
      // Net surplus credited to cash drawer = Net sale proceeds minus unpaid cost of previous lot
      const calculatedSurplus = Math.round(((finalGross - finalSellerCommission) - unpaidCost) * 100) / 100;
      const effectiveSurplus = isPriceIncreased && calculatedSurplus > 0 ? calculatedSurplus : 0;

      const buyerTaxRate = typeof settings.buyerTaxRate === 'number' ? settings.buyerTaxRate : 0.02;
      const finalBuyerCommission = Math.round(finalGross * buyerTaxRate * 100) / 100;
      const finalTotalFromBuyer = Math.round((finalGross + finalBuyerCommission) * 100) / 100;
      const newTrxId = `TRX-${Date.now().toString().slice(-6)}`;

      // Adjust items to reflect the new price
      let updatedItems = transaction.items && transaction.items.length > 0
        ? transaction.items.map((it) => ({ ...it }))
        : [];

      if (updatedItems.length === 1) {
        const it = updatedItems[0];
        const q = it.quantity || 1;
        updatedItems = [{
          ...it,
          unitPrice: Math.round((finalGross / q) * 100) / 100,
          totalGross: finalGross,
        }];
      } else if (updatedItems.length > 1) {
        const origTotal = transaction.grossAmount || 1;
        const ratio = finalGross / origTotal;
        let runningSum = 0;
        updatedItems = updatedItems.map((it, idx) => {
          if (idx === updatedItems.length - 1) {
            const itemTotal = Math.round((finalGross - runningSum) * 100) / 100;
            return {
              ...it,
              totalGross: itemTotal,
              unitPrice: it.quantity > 0 ? Math.round((itemTotal / it.quantity) * 100) / 100 : itemTotal,
            };
          } else {
            const itemTotal = Math.round((it.totalGross * ratio) * 100) / 100;
            runningSum += itemTotal;
            return {
              ...it,
              totalGross: itemTotal,
              unitPrice: it.quantity > 0 ? Math.round((itemTotal / it.quantity) * 100) / 100 : itemTotal,
            };
          }
        });
      } else {
        updatedItems = [{
          fishTypeId: 'lot',
          fishName: 'شروة سمك',
          quantity: 1,
          unit: 'شروة',
          unitPrice: finalGross,
          totalGross: finalGross,
        }];
      }

      // 1. Prepare updated original transaction
      const originalActualPaid = typeof transaction.buyerPaidAmount === 'number' ? transaction.buyerPaidAmount : 0;
      const currentOriginalDebt =
        typeof transaction.buyerRemainingDebt === 'number'
          ? transaction.buyerRemainingDebt
          : transaction.paymentStatus === 'pending' || transaction.settlementType === 'association_credit'
          ? transaction.totalFromBuyer
          : Math.max(0, transaction.totalFromBuyer - originalActualPaid);

      // في حال البيع بنفس السعر: تسقط قيمة الشروة عن المشتري القديم ويبقى عليه ضريبته السابقة فقط إن لم يكن سددها
      // في حال البيع بزيادة: تسوى الشروة بالكامل وتسقط عن المشتري الأصلي
      const remainingPrevTax = Math.max(0, (transaction.buyerTaxAmount || 0) - originalActualPaid);
      const targetSettledDebt = isPriceIncreased ? 0 : remainingPrevTax;

      const updatedOriginalTrx: Transaction = {
        ...transaction,
        wasResold: true,
        resoldToTransactionId: newTrxId,
        resoldToBuyerName: trimmedName,
        resoldPaymentStatus: resellPaymentStatus,
        buyerPaidAmount: originalActualPaid,
        buyerRemainingDebt: targetSettledDebt,
        paymentStatus: targetSettledDebt <= 0 ? 'settled' : 'partial',
        notes: transaction.notes
          ? `${transaction.notes}\n[تمت إعادة بيع الشروة لمشتري آخر (${trimmedName}) برقم #${newTrxId} - حالة سداد الجديد: ${
              isPaid
                ? isPriceIncreased
                  ? 'مدفوع نقداً (تمت التسوية وإسقاط الدين بالكامل)'
                  : `مدفوع نقداً (تمت تسوية قيمة الشروة ويبقى سداد الضريبة السابقة بمبلغ ${formatCurrency(targetSettledDebt, settings.currency)})`
                : 'آجل (انتقلت مديونية الشروة للمشتري الجديد وتمت تسوية الشروة الأصلية)'
            }]`
          : `[تمت إعادة بيع الشروة لمشتري آخر (${trimmedName}) برقم #${newTrxId} - حالة سداد الجديد: ${
              isPaid
                ? isPriceIncreased
                  ? 'مدفوع نقداً (تمت التسوية وإسقاط الدين بالكامل)'
                  : `مدفوع نقداً (تمت تسوية قيمة الشروة ويبقى سداد الضريبة السابقة بمبلغ ${formatCurrency(targetSettledDebt, settings.currency)})`
                : 'آجل (انتقلت مديونية الشروة للمشتري الجديد وتمت تسوية الشروة الأصلية)'
            }]`,
        isEdited: true,
        editedAt: Date.now(),
        editedDateStr: formatGregorianDate(now),
      };

      // 2. Prepare new resale transaction (الفائض يودع في درج الكاش وصندوق النقدية)
      const totalCommission = Math.round((finalSellerCommission + finalBuyerCommission) * 100) / 100;
      const newTrx: Transaction = {
        id: newTrxId,
        isResale: true,
        resaleSurplus: effectiveSurplus,
        resoldFromTransactionId: transaction.id,
        sellerId: transaction.buyerId || `buyer-${Date.now()}`,
        sellerName: transaction.buyerName,
        buyerId: newBuyerId,
        buyerName: trimmedName,
        buyerPhone: resellBuyerPhone.trim() || (matchedContact?.phone ? matchedContact.phone : undefined),
        grossAmount: finalGross,
        sellerTaxRate: effectiveSellerRate,
        sellerTaxAmount: finalSellerCommission,
        netToSeller: 0, // الفائض يودع لدرج الكاش ولا يترتب دين للبائع القديم
        harajProfit: totalCommission,
        sellerPaidStatus: 'paid', // خالص لدرج الكاش
        sellerRemainingDebt: 0,
        sellerPaidAmount: 0,
        paidAtPosAmount: 0,
        buyerTaxRate: buyerTaxRate,
        buyerTaxAmount: finalBuyerCommission,
        totalFromBuyer: finalTotalFromBuyer,
        paymentStatus: resellPaymentStatus,
        settlementType: isPaid ? 'association_cash' : 'association_credit',
        buyerPaidAmount: isPaid ? finalTotalFromBuyer : 0,
        paidAtPosBuyerAmount: isPaid ? finalTotalFromBuyer : 0,
        buyerRemainingDebt: isPaid ? 0 : finalTotalFromBuyer,
        buyerAdvanceUsed: 0,
        items: updatedItems,
        dateStr: formatGregorianDate(now),
        timeStr: formatGregorianTime(now),
        timestamp: Date.now(),
        notes: resellNotes.trim() ? resellNotes.trim() : '',
      };

      if (onResellTransaction) {
        onResellTransaction(newTrx, resellAutoPrint, updatedOriginalTrx);
      }
      onClose();
    } catch (err) {
      console.error('Error reselling transaction:', err);
      setErrorMessage('حدث خطأ أثناء تنفيذ عملية بيع الشروة، يرجى المحاولة ثانية');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white border border-slate-300 rounded-none w-full max-w-6xl 2xl:max-w-7xl max-h-[96vh] flex flex-col shadow-xl animate-in fade-in zoom-in-95 text-slate-800 my-auto overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-none flex items-center justify-center border shrink-0 ${
              activeTab === 'resell'
                ? 'bg-emerald-600/10 text-emerald-700 border-emerald-200'
                : 'bg-purple-600/10 text-purple-700 border-purple-200'
            }`}>
              {activeTab === 'resell' ? <ShoppingBag className="w-3.5 h-3.5" /> : <ArrowLeftRight className="w-3.5 h-3.5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                <span>{activeTab === 'resell' ? 'بيع الشروة لمشتري آخر كـ بائع' : 'تحويل الشروة / الفاتورة لمشتري آخر'}</span>
                <span className="font-mono text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded border border-purple-200 text-[11px]">
                  #{transaction.id}
                </span>
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500">
                {activeTab === 'resell'
                  ? `إعادة بيع الشروة باسم (${transaction.buyerName}) كبائع لمشتري جديد (معفى من ضريبة البيع بنفس السعر، أو مع احتساب الضريبة عند الزيادة)`
                  : 'نقل مسؤولية الفاتورة والضريبة بالكامل من ذمة المشتري الحالي إلى مشتري جديد'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-none hover:bg-slate-200/50 transition-colors cursor-pointer shrink-0"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher at Top - Prominent Segmented Control */}
        <div className="shrink-0 px-3 py-1.5 bg-slate-100 border-b border-slate-300">
          <div className="grid grid-cols-2 gap-2 bg-slate-200/90 p-0.5 rounded-none">
            <button
              type="button"
              onClick={() => {
                setActiveTab('transfer');
                setErrorMessage(null);
              }}
              className={`py-1.5 px-3 rounded-none font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'transfer'
                  ? 'bg-purple-700 text-white shadow-sm ring-1 ring-purple-600'
                  : 'text-slate-700 hover:bg-white/70'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>تحويل الشروة (نقل الفاتورة)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('resell');
                setErrorMessage(null);
              }}
              className={`py-1.5 px-3 rounded-none font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'resell'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500'
                  : 'text-slate-700 hover:bg-white/70'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>بيع الشروة (إعادة بيع كـ بائع)</span>
            </button>
          </div>
        </div>

        {/* Modal Body: TRANSFER TAB */}
        {activeTab === 'transfer' && (
          <form onSubmit={handleConfirmTransfer} className="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-none text-red-700 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Direct Switch to Resell Tab Banner */}
              <div className="p-2.5 px-3 bg-emerald-50/90 border border-emerald-300 rounded-none flex items-center justify-between gap-2 shadow-2xs">
                <div className="text-[11px] text-emerald-950 font-medium">
                  <span className="font-bold block text-emerald-900">هل يقوم المشتري ببيع الشروة لمشتري آخر كـ بائع؟</span>
                  <span>يمكنك تحديد سعر جديد واختيار إما دفع أو إعفاء البائع من الضريبة.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('resell')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-none font-black text-xs shrink-0 cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                >
                  <span>بيع الشروة كـ بائع</span>
                  <ShoppingBag className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 2-Column Grid Layout for Transfer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Right Column: Original Deal Details & Accounting Impact */}
              <div className="space-y-3">
                {/* Current Invoice Summary Card */}
                <div className="bg-slate-50 border border-slate-300/80 rounded-none p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-300/60 pb-2">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {transaction.dateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {transaction.timeStr}
                    </span>
                    <span>
                      {transaction.isResale || Boolean(transaction.resoldFromTransactionId) || transaction.notes?.startsWith('إعادة بيع شروة من:') ? 'البائع:' : 'الصياد:'}{' '}
                      <b className="text-slate-800">{transaction.sellerName}</b>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Current Buyer */}
                    <div className="bg-white p-2.5 rounded-none border border-slate-300">
                      <span className="text-[10px] text-slate-500 block">المشتري الحالي (السابق):</span>
                      <span className="font-bold text-slate-900 text-xs block truncate">
                        {transaction.buyerName}
                      </span>
                      <span className="text-[10px] text-amber-600 font-medium block mt-0.5">
                        (ستُحذف من حسابه تماماً)
                      </span>
                    </div>

                    {/* Total Liability & Tax */}
                    <div className="bg-white p-2.5 rounded-none border border-purple-200">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-purple-700 font-bold block">إجمالي الشروة:</span>
                        {isOriginalFullyPaid ? (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            مسددة بالكامل ✓
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            دين غير مسدد
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-black text-slate-900 text-sm block">
                        {formatCurrency(transaction.totalFromBuyer, settings.currency)}
                      </span>
                      <span className="text-[10px] text-slate-500 block font-mono">
                        يشمل عمولة/ضريبة: +{formatCurrency(transaction.buyerTaxAmount, settings.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Informational Assurance Notice (Capsule) */}
                <div className={`px-2.5 py-1.5 rounded-none border flex items-center gap-1.5 text-[10px] sm:text-[11px] shadow-2xs ${
                  newPaymentStatus === 'paid'
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 font-medium'
                    : 'bg-amber-50/90 border-amber-300 text-amber-950 font-medium'
                }`}>
                  <ShieldCheck className="w-3.5 h-3.5 text-current shrink-0" />
                  <div className="leading-tight">
                    <span className="font-bold ml-1">الأثر المحاسبي للتحويل:</span>
                    <span>
                      {newPaymentStatus === 'paid' ? (
                        <>
                          ستنتقل الشروة ({formatCurrency(transaction.totalFromBuyer, settings.currency)}) إلى المشتري الجديد (<b>{newBuyerName.trim() || 'المشتري الجديد'}</b>) <b>كفاتورة مسددة بالكامل</b> وتبرأ ذمة <b>{transaction.buyerName}</b> نهائياً.
                        </>
                      ) : (
                        <>
                          ستنتقل الشروة ({formatCurrency(transaction.totalFromBuyer, settings.currency)}) كـ <b>دين آجل على الحساب</b> في ذمة <b>{newBuyerName.trim() || 'المشتري الجديد'}</b>، وتبرأ ذمة <b>{transaction.buyerName}</b> فوراً.
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Optional Transfer Note & Auto Print Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                  <div>
                    <label className="block text-slate-600 mb-0.5 font-medium text-[10px]">
                      سبب أو ملاحظات التحويل (اختياري):
                    </label>
                    <input
                      type="text"
                      value={transferNotes}
                      onChange={(e) => setTransferNotes(e.target.value)}
                      placeholder="مثال: باتفاق بين الطرفين بعد البيع الأساسي..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-none py-1 px-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-purple-500 text-xs"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="w-full flex items-center gap-2 cursor-pointer select-none py-1.5 px-2 rounded-none hover:bg-slate-50 border border-slate-300/70 bg-white">
                      <input
                        type="checkbox"
                        checked={autoPrint}
                        onChange={(e) => setAutoPrint(e.target.checked)}
                        className="w-3.5 h-3.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                      />
                      <span className="font-bold text-slate-700 flex items-center gap-1 text-[10px] sm:text-[11px] truncate">
                        <Printer className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>طباعة الفاتورة بعد التحويل</span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Left Column: New Buyer Selection & Payment Status */}
              <div className="space-y-3">
                {/* New Buyer Selection */}
                <div className="p-3.5 bg-purple-50/40 rounded-none border border-purple-200/80 space-y-2.5 relative">
                  <div className="flex items-center justify-between">
                    <label className="text-purple-950 font-bold flex items-center gap-1.5 text-xs">
                      <User className="w-3.5 h-3.5 text-purple-600" />
                      <span>المشتري الجديد (المحول إليه):</span>
                    </label>
                    <div className="flex items-center gap-1">
                      {matchedContactForTransfer ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-none font-bold flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5" />
                          مشتري مسجل
                        </span>
                      ) : newBuyerName.trim() ? (
                        <span className="text-[10px] text-purple-700 bg-purple-100 border border-purple-200 px-1.5 py-0.5 rounded-none font-bold">
                          مشتري جديد
                        </span>
                      ) : (
                        <span className="text-[10px] text-purple-600 font-bold bg-purple-100/80 px-1.5 py-0.5 rounded">مطلوب</span>
                      )}
                    </div>
                  </div>

                  {/* Autocomplete Input Container */}
                  <div ref={transferBuyerContainerRef} className="relative">
                    <div className="relative">
                      <input
                        ref={transferInputRef}
                        type="text"
                        value={newBuyerName}
                        onChange={(e) => {
                          setNewBuyerName(e.target.value);
                          setErrorMessage(null);
                          setIsTransferDropdownOpen(true);
                          setHighlightedTransferIndex(0);
                        }}
                        onFocus={() => {
                          setIsTransferDropdownOpen(true);
                          setHighlightedTransferIndex(0);
                        }}
                        onKeyDown={handleTransferKeyDown}
                        placeholder="اكتب أول حرف من اسم المشتري للبحث الفوري..."
                        autoComplete="off"
                        className="w-full bg-white border border-purple-200 rounded-none py-2.5 pr-8 pl-14 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs shadow-2xs placeholder:text-slate-400 placeholder:font-normal"
                        autoFocus
                      />
                      {/* Search Icon right */}
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none">
                        <Search className="w-3.5 h-3.5" />
                      </div>
                      {/* Controls left: Clear & Toggle Chevron */}
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {newBuyerName && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewBuyerName('');
                              setNewBuyerPhone('');
                              setHighlightedTransferIndex(-1);
                              setIsTransferDropdownOpen(false);
                              transferInputRef.current?.focus();
                            }}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
                            title="مسح الاسم"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setIsTransferDropdownOpen((prev) => !prev);
                            transferInputRef.current?.focus();
                          }}
                          className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-none transition-colors cursor-pointer"
                          title="عرض قائمة المشترين"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isTransferDropdownOpen ? 'rotate-180 text-purple-600' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Autocomplete Dropdown List */}
                    {isTransferDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-purple-200 rounded-none shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-purple-50 animate-in fade-in-50 zoom-in-95">
                        {matchingTransferBuyers.length > 0 ? (
                          <>
                            {newBuyerName.trim() ? (
                              <div className="px-3 py-1.5 bg-purple-50/80 text-[10px] text-purple-800 font-bold flex items-center justify-between border-b border-purple-100">
                                <span>المشترون المطابقون ({matchingTransferBuyers.length}):</span>
                                <span className="text-[9px] text-purple-500 font-normal">اختر بالضغط أو بالأسهم + Enter</span>
                              </div>
                            ) : (
                              <div className="px-3 py-1.5 bg-purple-50/80 text-[10px] text-purple-800 font-bold flex items-center justify-between border-b border-purple-100">
                                <span>المشترون المسجلون:</span>
                                <span className="text-[9px] text-purple-500 font-normal">اكتب أول حرف للبحث السريع</span>
                              </div>
                            )}
                            {visibleTransferBuyers.map((c, idx) => {
                              const isSelected = newBuyerName.trim() === c.name.trim();
                              const isHighlighted = highlightedTransferIndex === idx;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectBuyerForTransfer(c)}
                                  className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                    isHighlighted
                                      ? 'bg-purple-100/90 text-purple-950 font-black'
                                      : isSelected
                                      ? 'bg-purple-50 text-purple-900 font-bold'
                                      : 'hover:bg-purple-50/60 text-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <User className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-purple-600' : 'text-slate-400'}`} />
                                    <span className="truncate">{c.name}</span>
                                  </div>
                                  {c.phone ? (
                                    <span className="text-[11px] text-slate-500 font-mono shrink-0 flex items-center gap-1" dir="ltr">
                                      <Phone className="w-2.5 h-2.5 text-slate-400" />
                                      {c.phone}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 shrink-0">مسجل</span>
                                  )}
                                </button>
                              );
                            })}
                            {matchingTransferBuyers.length > visibleTransferBuyers.length && (
                              <div className="p-2 bg-purple-50/40 text-center text-[10px] text-purple-800 font-medium">
                                يوجد {matchingTransferBuyers.length - visibleTransferBuyers.length} مشتري آخر... تابع كتابة الاسم لتضييق البحث
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-3 text-center text-xs text-slate-500">
                            <span>لا يوجد مشتري مسجل باسم "{newBuyerName}"</span>
                            <div className="text-[11px] text-purple-700 font-bold mt-1 flex items-center justify-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-600" />
                              <span>سيتم اعتماده وحفظه كمشتري جديد تلقائياً</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* New Buyer Phone */}
                  <div>
                    <label className="block text-[11px] text-slate-600 mb-1 flex items-center gap-1 font-medium">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>رقم هاتف المشتري الجديد (اختياري):</span>
                    </label>
                    <input
                      type="text"
                      value={newBuyerPhone}
                      onChange={(e) => setNewBuyerPhone(e.target.value)}
                      placeholder="مثال: 777123456"
                      className="w-full bg-white border border-slate-300 rounded-none p-2 text-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {/* Payment Status for the New Buyer */}
                <div className="bg-slate-50 p-3 rounded-none border border-slate-300/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-700 font-bold text-xs">
                      حالة سداد المشتري الجديد للشروة:
                    </label>
                    {isOriginalFullyPaid ? (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-none border border-emerald-300">
                        معتمدة: مدفوع نقداً (خالصة) ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-none border border-amber-300">
                        معتمدة: دين آجل على الحساب ⚠️
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPaymentStatus('paid')}
                      className={`p-2.5 rounded-none border text-right transition-all cursor-pointer ${
                        newPaymentStatus === 'paid'
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-1 ring-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs flex items-center gap-1">
                          <span>مدفوع نقداً / خالص</span>
                          {isOriginalFullyPaid && (
                            <span className="text-[9px] bg-emerald-200/90 text-emerald-900 px-1 rounded font-black">
                              الموصى به
                            </span>
                          )}
                        </span>
                        {newPaymentStatus === 'paid' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {isOriginalFullyPaid
                          ? 'الشروة مسددة سابقاً، فتتحول للمشتري الجديد كفاتورة مسددة دون قبض أي مبالغ إضافية منه'
                          : 'تسجيل الفاتورة كمدفوعة ومسددة بالكامل'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewPaymentStatus('pending')}
                      className={`p-2.5 rounded-none border text-right transition-all cursor-pointer ${
                        newPaymentStatus === 'pending'
                          ? 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-300 shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs flex items-center gap-1">
                          <span>دين آجل على الحساب</span>
                          {!isOriginalFullyPaid && (
                            <span className="text-[9px] bg-amber-200/90 text-amber-900 px-1 rounded font-black">
                              الموصى به
                            </span>
                          )}
                        </span>
                        {newPaymentStatus === 'pending' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        قيد قيمة الشروة كدين آجل في كشف حساب المشتري الجديد
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Pinned Sticky Footer - ALWAYS VISIBLE WITHOUT SCROLLING */}
            <div className="shrink-0 flex items-center justify-between gap-2.5 px-4 py-2 bg-slate-50 border-t border-slate-300 rounded-b-2xl">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-5 py-2 text-xs font-bold text-white rounded-none transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  isSubmitting
                    ? 'bg-purple-400 cursor-not-allowed'
                    : 'bg-purple-700 hover:bg-purple-800 active:bg-purple-900'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'جارٍ التحويل...' : 'تأكيد تحويل الشروة'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Modal Body: RESELL TAB (بيع الشروة لمشتري آخر) */}
        {activeTab === 'resell' && (
          <form onSubmit={handleConfirmResell} className="flex-1 flex flex-col min-h-0 overflow-hidden text-xs">
            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded-none text-red-700 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 2-Column Grid Layout for Resell */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Right Column: New Buyer, Price, Tax, Notes */}
                <div className="space-y-2.5">
                  {/* 1. New Buyer Name Input */}
                  <div className="p-2.5 bg-emerald-50/70 rounded-none border border-emerald-300 space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-800 font-bold flex items-center gap-1.5 text-xs">
                        <User className="w-3.5 h-3.5 text-emerald-600" />
                        <span>اسم المشتري الجديد:</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {matchedContactForResell ? (
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-none font-bold flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" />
                            مشتري مسجل
                          </span>
                        ) : resellBuyerName.trim() ? (
                          <span className="text-[10px] text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-none font-bold">
                            مشتري جديد
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-600 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded">مطلوب</span>
                        )}
                      </div>
                    </div>

                    {/* Autocomplete Input Container */}
                    <div ref={resellBuyerContainerRef} className="relative">
                      <div className="relative">
                        <input
                          ref={resellInputRef}
                          type="text"
                          value={resellBuyerName}
                          onChange={(e) => {
                            setResellBuyerName(e.target.value);
                            setErrorMessage(null);
                            setIsResellDropdownOpen(true);
                            setHighlightedResellIndex(0);
                          }}
                          onFocus={() => {
                            setIsResellDropdownOpen(true);
                            setHighlightedResellIndex(0);
                          }}
                          onKeyDown={handleResellKeyDown}
                          placeholder="اكتب أول حرف من اسم المشتري للبحث الفوري..."
                          autoComplete="off"
                          className="w-full bg-white border border-slate-300 rounded-none py-2 pr-8 pl-14 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs shadow-2xs placeholder:text-slate-400 placeholder:font-normal"
                          autoFocus
                        />
                        {/* Search Icon right */}
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none">
                          <Search className="w-3.5 h-3.5" />
                        </div>
                        {/* Controls left: Clear & Toggle Chevron */}
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {resellBuyerName && (
                            <button
                              type="button"
                              onClick={() => {
                                setResellBuyerName('');
                                setResellBuyerPhone('');
                                setHighlightedResellIndex(-1);
                                setIsResellDropdownOpen(false);
                                resellInputRef.current?.focus();
                              }}
                              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
                              title="مسح الاسم"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setIsResellDropdownOpen((prev) => !prev);
                              resellInputRef.current?.focus();
                            }}
                            className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-none transition-colors cursor-pointer"
                            title="عرض قائمة المشترين"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                isResellDropdownOpen ? 'rotate-180 text-emerald-600' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Autocomplete Dropdown List */}
                      {isResellDropdownOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-emerald-200 rounded-none shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-emerald-50 animate-in fade-in-50 zoom-in-95">
                          {matchingResellBuyers.length > 0 ? (
                            <>
                              {resellBuyerName.trim() ? (
                                <div className="px-3 py-1.5 bg-emerald-50/80 text-[10px] text-emerald-800 font-bold flex items-center justify-between border-b border-emerald-100">
                                  <span>المشترون المطابقون ({matchingResellBuyers.length}):</span>
                                  <span className="text-[9px] text-emerald-600 font-normal">اختر بالضغط أو بالأسهم + Enter</span>
                                </div>
                              ) : (
                                <div className="px-3 py-1.5 bg-emerald-50/80 text-[10px] text-emerald-800 font-bold flex items-center justify-between border-b border-emerald-100">
                                  <span>المشترون المسجلون:</span>
                                  <span className="text-[9px] text-emerald-600 font-normal">اكتب أول حرف للبحث السريع</span>
                                </div>
                              )}
                              {visibleResellBuyers.map((c, idx) => {
                                const isSelected = resellBuyerName.trim() === c.name.trim();
                                const isHighlighted = highlightedResellIndex === idx;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => handleSelectBuyerForResell(c)}
                                    className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                      isHighlighted
                                        ? 'bg-emerald-100/90 text-emerald-950 font-black'
                                        : isSelected
                                        ? 'bg-emerald-50 text-emerald-900 font-bold'
                                        : 'hover:bg-emerald-50/60 text-slate-800'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 truncate">
                                      <User className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-slate-400'}`} />
                                      <span className="truncate">{c.name}</span>
                                    </div>
                                    {c.phone ? (
                                      <span className="text-[11px] text-slate-500 font-mono shrink-0 flex items-center gap-1" dir="ltr">
                                        <Phone className="w-2.5 h-2.5 text-slate-400" />
                                        {c.phone}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 shrink-0">مسجل</span>
                                    )}
                                  </button>
                                );
                              })}
                              {matchingResellBuyers.length > visibleResellBuyers.length && (
                                <div className="p-2 bg-emerald-50/40 text-center text-[10px] text-emerald-800 font-medium">
                                  يوجد {matchingResellBuyers.length - visibleResellBuyers.length} مشتري آخر... تابع كتابة الاسم لتضييق البحث
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="p-3 text-center text-xs text-slate-500">
                              <span>لا يوجد مشتري مسجل باسم "{resellBuyerName}"</span>
                              <div className="text-[11px] text-emerald-700 font-bold mt-1 flex items-center justify-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-600" />
                                <span>سيتم اعتماده وحفظه كمشتري جديد تلقائياً</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* New Buyer Phone */}
                    <div>
                      <label className="block text-[10px] text-slate-600 mb-0.5 flex items-center gap-1 font-medium">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>رقم هاتف المشتري الجديد (اختياري):</span>
                      </label>
                      <input
                        type="text"
                        value={resellBuyerPhone}
                        onChange={(e) => setResellBuyerPhone(e.target.value)}
                        placeholder="مثال: 777123456"
                        className="w-full bg-white border border-slate-300 rounded-none py-1 px-2 text-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* 2. New Selling Price Input (تحديد السعر الجديد للبيع) */}
                  <div className="p-2.5 bg-emerald-50/70 rounded-none border border-emerald-300 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-amber-950 font-bold flex items-center gap-1.5 text-xs">
                        <Coins className="w-4 h-4 text-amber-600" />
                        <span>تحديد السعر الجديد للبيع ({settings.currency}):</span>
                      </label>
                      <span className="text-[11px] text-amber-800 font-medium font-mono">
                        سعر الشراء الأصلي: <b>{formatCurrency(transaction.grossAmount, settings.currency)}</b>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={resellPrice}
                        onChange={(e) => {
                          setResellPrice(e.target.value === '' ? '' : Number(e.target.value));
                          setErrorMessage(null);
                        }}
                        placeholder="أدخل السعر الجديد للبيع..."
                        className="flex-1 bg-white border border-amber-300 rounded-none py-1.5 px-2.5 font-mono font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm shadow-2xs"
                        required
                      />
                      {typeof resellPrice === 'number' && resellPrice > 0 && (
                        <div className={`px-2.5 py-1 rounded-none border text-xs font-bold font-mono text-center shrink-0 shadow-2xs ${
                          priceDifference > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : priceDifference < 0
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : 'bg-blue-50 text-blue-800 border-blue-300'
                        }`}>
                          <span className="text-[9px] block font-sans font-medium">فارق السعر:</span>
                          <span>{priceDifference > 0 ? `+${formatCurrency(priceDifference, '')}` : priceDifference === 0 ? 'نفس السعر (0)' : formatCurrency(priceDifference, '')}</span>
                        </div>
                      )}
                    </div>

                    {/* زر وخيار: دفع الضريبة أو الإعفاء منها للبائع (المشتري الأصلي) */}
                    <div className="bg-white border border-amber-200/80 rounded-none p-2 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span className="flex items-center gap-1.5">
                          <Coins className="w-4 h-4 text-amber-600" />
                          <span>ضريبة / عمولة البيع على ({transaction.buyerName}):</span>
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-none font-black ${
                          isSellerExempt
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {isSellerExempt ? '✓ معفى من الضريبة (0%)' : `دفع الضريبة (${Math.round(defaultSellerRate * 100)}%)`}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setSellerTaxMode('pay')}
                          className={`py-1.5 px-2.5 rounded-none text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            !isSellerExempt
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/30'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          <span>دفع الضريبة ({Math.round(defaultSellerRate * 100)}%)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSellerTaxMode('exempt')}
                          className={`py-1.5 px-2.5 rounded-none text-xs font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            isSellerExempt
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-400/30'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>إعفاء البائع (0%)</span>
                        </button>
                      </div>

                      {/* توضيح حالة الضريبة */}
                      <div className="pt-0.5">
                        {isSellerExempt ? (
                          <div className="flex items-center gap-1.5 text-emerald-800 text-[11px] font-medium">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>
                              تم إعفاء <b>{transaction.buyerName}</b> من ضريبة إعادة البيع (0.00 {settings.currency}).
                            </span>
                          </div>
                        ) : typeof resellPrice === 'number' && resellPrice > 0 ? (
                          isPriceIncreased ? (
                            <div className="flex items-center gap-1.5 text-amber-900 text-[11px] font-medium">
                              <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>
                                زيادة بالسعر (+{formatCurrency(priceDifference, settings.currency)}): عمولة البيع (-{Math.round(defaultSellerRate * 100)}%) بمبلغ <b>{formatCurrency(sellerCommission, settings.currency)}</b> تُخصم للصندوق.
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-slate-600 text-[11px] font-medium">
                              <Check className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>
                                بيع بنفس السعر أو أقل: لا ضريبة بيع إضافية عليه.
                              </span>
                            </div>
                          )
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Optional Resell Note & Auto Print Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    <div>
                      <label className="block text-slate-600 mb-0.5 font-medium text-[10px]">
                        ملاحظات بيع الشروة (اختياري):
                      </label>
                      <input
                        type="text"
                        value={resellNotes}
                        onChange={(e) => setResellNotes(e.target.value)}
                        placeholder="مثال: بيع شروة مباشرة بعد البيع الأساسي..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-none py-1 px-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                    </div>

                    <div className="flex items-end">
                      <label className="w-full flex items-center gap-2 cursor-pointer select-none py-1.5 px-2 rounded-none hover:bg-slate-50 border border-slate-300/70 bg-white">
                        <input
                          type="checkbox"
                          checked={resellAutoPrint}
                          onChange={(e) => setResellAutoPrint(e.target.checked)}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-slate-700 flex items-center gap-1 text-[10px] sm:text-[11px] truncate">
                          <Printer className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>طباعة فاتورة البيع فوراً</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

              {/* Left Column: Surplus Breakdown & Payment Status */}
              <div className="space-y-2.5">
                {/* 3. Real-time Commission & Surplus Breakdown Card */}
                <div className="bg-emerald-50/70 border border-emerald-300 rounded-none p-2.5 space-y-2 shadow-xs">
                  <div className="flex items-center justify-between text-xs text-emerald-950 font-bold border-b border-emerald-200/80 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>احتساب الفائض لدرج الكاش والعمولات آلياً</span>
                    </span>
                    <span className="font-mono text-emerald-800">
                      السعر الجديد: <b>{formatCurrency(activeResellGross, settings.currency)}</b>
                    </span>
                  </div>

                  {/* Commission Grid: Seller (Surplus) and Buyer */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Seller Side: original buyer */}
                    <div className="bg-white p-2 rounded-none border border-emerald-300 shadow-2xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-emerald-800 font-bold">تسوية الشروة:</span>
                        <span className="text-[10px] text-slate-500 font-mono">سعر الشراء: {formatCurrency(originalGross, '')}</span>
                      </div>
                      <span className="font-black text-slate-900 text-xs block truncate">
                        {transaction.buyerName}
                      </span>

                      <div className="pt-1 border-t border-slate-100 space-y-0.5 text-[11px]">
                        <div className="flex justify-between text-slate-600 font-mono">
                          <span>قيمة البيع:</span>
                          <span>{formatCurrency(activeResellGross, settings.currency)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 font-mono">
                          <span>الشروة الأصلية:</span>
                          <span className="text-amber-700">-{formatCurrency(originalGross, settings.currency)}</span>
                        </div>
                        {isSellerExempt ? (
                          <div className="flex justify-between text-emerald-700 font-mono font-bold bg-emerald-50/80 p-0.5 px-1 rounded text-[10px]">
                            <span>عمولة البيع:</span>
                            <span>0 {settings.currency} (معفى ✓)</span>
                          </div>
                        ) : isPriceIncreased ? (
                          <div className="flex justify-between text-rose-600 font-mono font-bold bg-rose-50/80 p-0.5 px-1 rounded text-[10px]">
                            <span>عمولة البيع:</span>
                            <span>-{formatCurrency(sellerCommission, settings.currency)}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-emerald-700 font-mono font-bold bg-emerald-50/80 p-0.5 px-1 rounded text-[10px]">
                            <span>عمولة البيع:</span>
                            <span>0 {settings.currency} (معفى)</span>
                          </div>
                        )}
                        <div className="pt-1 border-t border-emerald-100 flex items-center justify-between font-bold">
                          <span className="text-emerald-900 font-black">فائض الكاش:</span>
                          <span className={`font-mono font-black text-xs ${finalSurplus > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {formatCurrency(finalSurplus, settings.currency)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Buyer Side: new buyer */}
                    <div className="bg-white p-2 rounded-none border border-blue-300 shadow-2xs space-y-1">
                      <span className="text-[10px] text-blue-800 font-bold block">المشتري الجديد:</span>
                      <span className="font-black text-blue-950 text-xs block truncate">
                        {resellBuyerName.trim() || 'لم يحدد بعد'}
                      </span>

                      <div className="pt-1 border-t border-slate-100 space-y-0.5 text-[11px]">
                        <div className="flex justify-between text-slate-600 font-mono">
                          <span>قيمة الشروة:</span>
                          <span>{formatCurrency(activeResellGross, settings.currency)}</span>
                        </div>
                        <div className="flex justify-between text-blue-600 font-mono font-bold bg-blue-50/80 p-0.5 px-1 rounded text-[10px]">
                          <span>عمولة (+{Math.round(buyerTaxRate * 100)}%):</span>
                          <span>+{formatCurrency(buyerCommission, settings.currency)}</span>
                        </div>
                        <div className="pt-1 border-t border-slate-300 flex items-center justify-between font-bold">
                          <span className="text-blue-900 font-black">المطلوب منه:</span>
                          <span className="font-mono font-black text-blue-700 text-xs">
                            {formatCurrency(totalFromBuyer, settings.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* الأثر المحاسبي وحالة السداد داخل بطاقة تسوية الكاش والعمولات (سداد آجل / نقدي) */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-700 pt-1">
                    <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                    <p className="leading-tight">
                      {resellPaymentStatus === 'paid' ? (
                        isPriceIncreased ? (
                          <>
                            سداد نقدي: تتم تسوية الشروة السابقة وتبرأ ذمة <b className="font-bold">{transaction.buyerName}</b>، ويُضاف <b>الفائض ({formatCurrency(finalSurplus, settings.currency)})</b> مع <b>العمولة ({formatCurrency(totalCommission, settings.currency)})</b> لدرج الكاش.
                          </>
                        ) : (
                          <>
                            سداد نقدي بنفس السعر: تسقط قيمة الشروة عن <b className="font-bold">{transaction.buyerName}</b>، ويبقى عليه ضريبته السابقة ({formatCurrency(transaction.buyerTaxAmount, settings.currency)})، وتودع عمولة المشتري الجديد في الكاش.
                          </>
                        )
                      ) : (
                        <>
                          سداد آجل: تظل الشروة ديناً معلقاً على <b className="font-bold">{transaction.buyerName}</b> حتى يقوم <b className="font-bold">{resellBuyerName.trim() || 'المشتري الجديد'}</b> بالسداد.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* 4. Payment Status for the New Buyer */}
                <div className="bg-emerald-50/70 p-2.5 rounded-none border border-emerald-300 space-y-1.5">
                  <label className="block text-slate-700 font-bold text-xs">
                    حالة سداد المشتري الجديد للشروة:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setResellPaymentStatus('pending')}
                      className={`p-2 rounded-none border text-right transition-all cursor-pointer ${
                        resellPaymentStatus === 'pending'
                          ? 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-300 shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs">آجل / على الحساب</span>
                        {resellPaymentStatus === 'pending' && <Check className="w-3.5 h-3.5 text-amber-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        تُقيد كمديونية وتظل الشروة الأصلية معلقة حتى سداده
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setResellPaymentStatus('paid')}
                      className={`p-2 rounded-none border text-right transition-all cursor-pointer ${
                        resellPaymentStatus === 'paid'
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-1 ring-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-bold text-xs">مدفوع نقداً / فوري</span>
                        {resellPaymentStatus === 'paid' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        دفع كاش فوراً وتسقط قيمة الشروة عن البائع
                      </p>
                    </button>
                  </div>
                </div>

                {/* الأثر المالي أسفل خيارات حالة سداد المشتري الجديد */}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-700 pt-1">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <div className="leading-tight">
                    <span className="font-black ml-1 text-slate-900">الأثر المالي:</span>
                    <span>
                      {resellPaymentStatus === 'paid' ? (
                        isSellerExempt ? (
                          <>
                            تم إعفاء (<b className="font-bold">{transaction.buyerName}</b>) من ضريبة البيع، وستتم إضافة <b>الفائض الصافي ({formatCurrency(finalSurplus, settings.currency)})</b> مع عمولة المشتري الجديد ({formatCurrency(buyerCommission, settings.currency)}) إلى درج الكاش، وتبرأ ذمة (<b className="font-bold">{transaction.buyerName}</b>) فوراً.
                          </>
                        ) : isPriceIncreased ? (
                          <>
                            ستتم إضافة <b>الفائض الصافي ({formatCurrency(finalSurplus, settings.currency)})</b> والعمولة ({formatCurrency(totalCommission, settings.currency)}) إلى درج الكاش، وتبرأ ذمة (<b className="font-bold">{transaction.buyerName}</b>) فوراً.
                          </>
                        ) : (
                          <>
                            تم إعفاء (<b className="font-bold">{transaction.buyerName}</b>) من ضريبة البيع لبيعه بنفس السعر، وستسقط قيمة الشروة عنه ويبقى عليه ضريبته السابقة ({formatCurrency(transaction.buyerTaxAmount, settings.currency)})، وتودع عمولة المشتري الجديد في درج الكاش.
                          </>
                        )
                      ) : (
                        <>
                          تُسجل الشروة كدين آجل على <b className="font-bold">{resellBuyerName.trim() || 'المشتري الجديد'}</b> بمبلغ <b className="font-mono font-black">{formatCurrency(totalFromBuyer, settings.currency)}</b>، وتظل الشروة السابقة ديناً على <b className="font-bold">{transaction.buyerName}</b> حتى يتم تحصيل المبلغ من المشتري الجديد.
                        </>
                      )}
                    </span>
                  </div>
                </div>

              </div>
            </div>
            </div>

            {/* Pinned Sticky Footer - ALWAYS VISIBLE WITHOUT SCROLLING */}
            <div className="shrink-0 flex items-center justify-between gap-2.5 px-4 py-2 bg-slate-50 border-t border-slate-300 rounded-b-2xl">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-5 py-2 text-xs font-bold text-white rounded-none transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  isSubmitting
                    ? 'bg-emerald-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'جارٍ الحفظ...' : 'إتمام البيعة'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
