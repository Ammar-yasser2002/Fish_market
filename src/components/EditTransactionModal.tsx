import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction, TransactionItem, MarketSettings, Contact, FishType, SettlementType } from '../types';
import { calculateFinancials, formatCurrency, tafqeet, formatGregorianDate, normalizeArabic, parseQuantityNumber } from '../utils/calculations';
import {
  X,
  Printer,
  Check,
  Plus,
  Trash2,
  FileText,
  User,
  ShoppingBag,
  Fish,
  Calendar,
  Clock,
  Phone,
  AlertCircle,
  Wallet,
  Coins,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Building2,
  Search,
  ChevronDown,
} from 'lucide-react';

interface EditTransactionModalProps {
  transaction: Transaction;
  settings: MarketSettings;
  contacts?: Contact[];
  fishTypes?: FishType[];
  editContext?: 'buyer' | 'seller' | 'full';
  onClose: () => void;
  onSave: (updatedTrx: Transaction, autoPrint: boolean) => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  settings,
  contacts = [],
  fishTypes = [],
  editContext = 'full',
  onClose,
  onSave,
}) => {
  // Form states initialized with existing transaction data
  const [sellerName, setSellerName] = useState(transaction.sellerName || '');
  const [selectedSellerId, setSelectedSellerId] = useState<string | undefined>(transaction.sellerId);
  const [buyerName, setBuyerName] = useState(transaction.buyerName || '');
  const [selectedBuyerId, setSelectedBuyerId] = useState<string | undefined>(transaction.buyerId);
  const [buyerPhone, setBuyerPhone] = useState(transaction.buyerPhone || '');
  const [dateStr, setDateStr] = useState(transaction.dateStr || '');
  const [timeStr, setTimeStr] = useState(transaction.timeStr || '');
  const [settlementType, setSettlementType] = useState<SettlementType>(() => {
    const total = transaction.totalFromBuyer || 0;
    const paid = typeof transaction.buyerPaidAmount === 'number'
      ? transaction.buyerPaidAmount
      : (typeof transaction.paidAtPosBuyerAmount === 'number' ? transaction.paidAtPosBuyerAmount : undefined);
    const remaining = typeof transaction.buyerRemainingDebt === 'number' ? transaction.buyerRemainingDebt : undefined;
    const isPaidStatus = transaction.paymentStatus === 'paid' || transaction.paymentStatus === 'settled';
    const isPendingStatus = transaction.paymentStatus === 'pending' || transaction.paymentStatus === 'unpaid';

    // 1. الأولوية الأولى: إذا كانت الفاتورة مسددة بالكامل (حالتها paid أو باقي الدين 0 والمدفوع يغطي الإجمالي)
    if (
      (isPaidStatus && (remaining === undefined || remaining <= 0)) ||
      (remaining === 0 && paid !== undefined && paid >= total && total > 0)
    ) {
      return 'association_cash';
    }

    // 2. إذا كانت الفاتورة مسددة جزئياً (باقي دين ومدفوع جزء نقداً)
    if (
      transaction.settlementType === 'partial_cash' ||
      transaction.paymentStatus === 'partial' ||
      (paid !== undefined && paid > 0 && remaining !== undefined && remaining > 0) ||
      (paid !== undefined && paid > 0 && total > 0 && paid < total && remaining !== 0)
    ) {
      return 'partial_cash';
    }

    // 3. إذا كانت الفاتورة معلقة أو آجلة ديناً على ذمة المشتري
    if (
      isPendingStatus ||
      (remaining !== undefined && total > 0 && remaining >= total) ||
      (paid === 0 && !isPaidStatus) ||
      transaction.settlementType === 'association_credit'
    ) {
      return 'association_credit';
    }

    // 4. الافتراضي
    if (transaction.settlementType) return transaction.settlementType;
    return 'association_cash';
  });
  const [buyerPaidAmountInput, setBuyerPaidAmountInput] = useState<number | string>(() => {
    const isPaidStatus = transaction.paymentStatus === 'paid' || transaction.paymentStatus === 'settled';
    const remaining = typeof transaction.buyerRemainingDebt === 'number' ? transaction.buyerRemainingDebt : undefined;

    if (isPaidStatus && (remaining === undefined || remaining <= 0)) {
      return transaction.totalFromBuyer || transaction.buyerPaidAmount || 0;
    }
    if (typeof transaction.buyerPaidAmount === 'number') {
      return transaction.buyerPaidAmount;
    }
    if (typeof transaction.paidAtPosBuyerAmount === 'number') {
      return transaction.paidAtPosBuyerAmount;
    }
    if (transaction.settlementType === 'association_credit' || transaction.paymentStatus === 'pending') {
      return 0;
    }
    return transaction.totalFromBuyer || 0;
  });
  const [notes, setNotes] = useState(transaction.notes || '');
  const defaultBuyerRate = typeof settings.buyerTaxRate === 'number' ? settings.buyerTaxRate : 0.02;
  const defaultSellerRate = typeof settings.sellerTaxRate === 'number' ? settings.sellerTaxRate : 0.03;

  const [buyerTaxRate, setBuyerTaxRate] = useState<number>(
    transaction.buyerTaxRate !== undefined ? transaction.buyerTaxRate : defaultBuyerRate
  );
  const [sellerTaxRate, setSellerTaxRate] = useState<number>(
    transaction.sellerTaxRate !== undefined ? transaction.sellerTaxRate : defaultSellerRate
  );
  const [sellerPayoutMethod, setSellerPayoutMethod] = useState<'cash' | 'exchange'>(() => {
    if (transaction.sellerPayoutMethod) return transaction.sellerPayoutMethod;
    if (transaction.notes?.includes('عبر الصرافة')) return 'exchange';
    return 'cash';
  });
  const [sellerExchangeName, setSellerExchangeName] = useState<string>(() => {
    if (transaction.sellerExchangeName) return transaction.sellerExchangeName;
    const match = transaction.notes?.match(/عبر الصرافة:?\s*([^\s-,()]+(?:\s+[^\s-,()]+)*)/);
    return match && match[1] ? match[1] : '';
  });

  // Items state
  const [items, setItems] = useState<TransactionItem[]>(
    transaction.items && transaction.items.length > 0
      ? transaction.items.map((it) => ({ ...it }))
      : [
          {
            id: `item-${Date.now()}`,
            fishTypeId: '',
            fishName: 'سمك متنوع',
            quantity: 1,
            unit: 'صندوق',
            unitPrice: transaction.grossAmount || 0,
            totalGross: transaction.grossAmount || 0,
          },
        ]
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Autocomplete states for Seller and Buyer
  const [isSellerDropdownOpen, setIsSellerDropdownOpen] = useState(false);
  const [highlightedSellerIndex, setHighlightedSellerIndex] = useState(-1);
  const sellerContainerRef = useRef<HTMLDivElement>(null);
  const sellerInputRef = useRef<HTMLInputElement>(null);

  const [isBuyerDropdownOpen, setIsBuyerDropdownOpen] = useState(false);
  const [highlightedBuyerIndex, setHighlightedBuyerIndex] = useState(-1);
  const buyerContainerRef = useRef<HTMLDivElement>(null);
  const buyerInputRef = useRef<HTMLInputElement>(null);

  const availableSellers = useMemo(() => {
    return contacts.filter((c) => c.type === 'seller' || c.type === 'both');
  }, [contacts]);

  const availableBuyers = useMemo(() => {
    return contacts.filter((c) => (c.type === 'buyer' || c.type === 'both') && c.type !== 'worker');
  }, [contacts]);

  // Matching Sellers
  const matchingSellers = useMemo(() => {
    const rawQuery = sellerName.trim();
    if (!rawQuery) return availableSellers;
    const query = normalizeArabic(rawQuery);
    const numericQuery = rawQuery.replace(/\D/g, '');

    const filtered = availableSellers.filter((s) => {
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

    return filtered.sort((a, b) => {
      const aStarts = normalizeArabic(a.name).startsWith(query);
      const bStarts = normalizeArabic(b.name).startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [availableSellers, sellerName]);

  const visibleSellers = useMemo(() => {
    return matchingSellers.slice(0, 10);
  }, [matchingSellers]);

  // Matching Buyers
  const matchingBuyers = useMemo(() => {
    const rawQuery = buyerName.trim();
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
  }, [availableBuyers, buyerName]);

  const visibleBuyers = useMemo(() => {
    return matchingBuyers.slice(0, 10);
  }, [matchingBuyers]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        sellerContainerRef.current &&
        !sellerContainerRef.current.contains(e.target as Node)
      ) {
        setIsSellerDropdownOpen(false);
      }
      if (
        buyerContainerRef.current &&
        !buyerContainerRef.current.contains(e.target as Node)
      ) {
        setIsBuyerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSeller = (contact: Contact) => {
    setSellerName(contact.name);
    setSelectedSellerId(contact.id);
    setIsSellerDropdownOpen(false);
    setHighlightedSellerIndex(-1);
  };

  const handleSelectBuyer = (contact: Contact) => {
    setBuyerName(contact.name);
    setSelectedBuyerId(contact.id);
    if (contact.phone) {
      setBuyerPhone(contact.phone);
    }
    setIsBuyerDropdownOpen(false);
    setHighlightedBuyerIndex(-1);
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
        if (highlightedSellerIndex >= 0 && visibleSellers[highlightedSellerIndex]) {
          e.preventDefault();
          handleSelectSeller(visibleSellers[highlightedSellerIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsSellerDropdownOpen(false);
        return;
      }
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
        if (highlightedBuyerIndex >= 0 && visibleBuyers[highlightedBuyerIndex]) {
          e.preventDefault();
          handleSelectBuyer(visibleBuyers[highlightedBuyerIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsBuyerDropdownOpen(false);
        return;
      }
    }
  };

  // Recalculate gross amount dynamically from items
  const currentGross = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.totalGross) || 0), 0);
  }, [items]);

  // Recalculate financial breakdown using standard and active seller rates
  const financials = useMemo(() => {
    return calculateFinancials(
      currentGross,
      buyerTaxRate,
      sellerTaxRate
    );
  }, [currentGross, buyerTaxRate, sellerTaxRate]);

  // Initial seller paid amount from existing transaction
  const initialSellerPaid = useMemo(() => {
    if (typeof transaction.sellerPaidAmount === 'number') {
      return Math.min(transaction.sellerPaidAmount, transaction.netToSeller ?? 0);
    }
    if (typeof transaction.paidAtPosAmount === 'number') {
      return Math.min(transaction.paidAtPosAmount, transaction.netToSeller ?? 0);
    }
    if (transaction.sellerPaidStatus === 'unpaid') {
      return 0;
    }
    return transaction.netToSeller ?? 0;
  }, [transaction]);

  const [sellerPaidMode, setSellerPaidMode] = useState<'full' | 'half' | 'zero' | 'custom'>(() => {
    const net = transaction.netToSeller ?? 0;
    const paid = initialSellerPaid;
    if (paid <= 0) return 'zero';
    if (Math.abs(paid - net) < 0.01) return 'full';
    if (Math.abs(paid - net / 2) < 0.01) return 'half';
    return 'custom';
  });

  const [sellerPaidAmountInput, setSellerPaidAmountInput] = useState<number | string>(initialSellerPaid);

  // Keep sellerPaidAmountInput synchronized if netToSeller changes due to item/rate modifications
  const netSeller = financials.netToSeller;
  React.useEffect(() => {
    if (sellerPaidMode === 'full') {
      setSellerPaidAmountInput(netSeller);
    } else if (sellerPaidMode === 'half') {
      setSellerPaidAmountInput(Math.round((netSeller / 2) * 100) / 100);
    } else if (sellerPaidMode === 'zero') {
      setSellerPaidAmountInput(0);
    } else if (sellerPaidMode === 'custom') {
      if (typeof sellerPaidAmountInput === 'number' && sellerPaidAmountInput > netSeller) {
        setSellerPaidAmountInput(netSeller);
      }
    }
  }, [netSeller, sellerPaidMode]);

  const currentSellerPaidNum =
    sellerPaidAmountInput === ''
      ? 0
      : Math.min(netSeller, Math.max(0, Number(sellerPaidAmountInput) || 0));
  const remainingSellerDebt = Math.max(0, Math.round((netSeller - currentSellerPaidNum) * 100) / 100);

  // Keep buyerPaidAmountInput synchronized if totalFromBuyer changes due to item modifications
  const totalBuyer = financials.totalFromBuyer;
  React.useEffect(() => {
    if (settlementType === 'association_cash') {
      setBuyerPaidAmountInput(totalBuyer);
    } else if (settlementType === 'association_credit') {
      setBuyerPaidAmountInput(0);
    } else if (settlementType === 'partial_cash') {
      if (typeof buyerPaidAmountInput === 'number' && buyerPaidAmountInput > totalBuyer) {
        setBuyerPaidAmountInput(totalBuyer);
      }
    }
  }, [totalBuyer, settlementType]);

  const currentBuyerPaidNum = useMemo(() => {
    if (settlementType === 'association_cash') return totalBuyer;
    if (settlementType === 'association_credit') return 0;
    if (settlementType === 'partial_cash') {
      const p = typeof buyerPaidAmountInput === 'number' ? buyerPaidAmountInput : Number(buyerPaidAmountInput) || 0;
      return Math.min(totalBuyer, Math.max(0, p));
    }
    if (settlementType === 'direct_cash') return financials.harajProfit;
    return typeof transaction.buyerPaidAmount === 'number' ? transaction.buyerPaidAmount : totalBuyer;
  }, [settlementType, buyerPaidAmountInput, totalBuyer, financials.harajProfit, transaction.buyerPaidAmount]);

  const currentBuyerRemainingDebt = Math.max(
    0,
    Math.round(
      (totalBuyer -
        (settlementType === 'direct_cash' ? totalBuyer : currentBuyerPaidNum)) *
        100
    ) / 100
  );

  const netDrawerImpact = currentBuyerPaidNum - (sellerPayoutMethod === 'exchange' ? 0 : currentSellerPaidNum);

  // Handle item change
  const handleItemChange = (
    index: number,
    field: keyof TransactionItem,
    value: string | number
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === 'quantity') {
        const strVal = String(value ?? '').trim();
        const normalizedDigits = strVal.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
        const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
        const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
        const parsedNum = parseQuantityNumber(strVal);
        const finalQty = !isNumeric ? strVal : (isFraction ? strVal : (Number(normalizedDigits) || parsedNum));
        item.quantity = finalQty;
        item.totalGross = !isNumeric ? item.unitPrice : Math.round(parsedNum * item.unitPrice * 100) / 100;
      } else if (field === 'unitPrice') {
        const price = Math.max(0, Number(value) || 0);
        item.unitPrice = price;
        const strQty = String(item.quantity ?? '').trim();
        const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
        const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
        const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
        const parsedQty = parseQuantityNumber(strQty);
        item.totalGross = !isNumeric ? price : Math.round(parsedQty * price * 100) / 100;
      } else if (field === 'totalGross') {
        const gross = Math.max(0, Number(value) || 0);
        item.totalGross = gross;
        const strQty = String(item.quantity ?? '').trim();
        const normalizedDigits = strQty.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
        const isFraction = normalizedDigits.includes('/') && !isNaN(Number(normalizedDigits.split('/')[0])) && !isNaN(Number(normalizedDigits.split('/')[1]));
        const isNumeric = (!isNaN(Number(normalizedDigits)) && normalizedDigits !== '') || isFraction;
        if (!isNumeric) {
          item.unitPrice = gross;
        } else {
          const parsedQty = parseQuantityNumber(strQty);
          if (parsedQty > 0) {
            item.unitPrice = Math.round((gross / parsedQty) * 100) / 100;
          }
        }
      } else if (field === 'fishName') {
        item.fishName = String(value);
      } else if (field === 'unit') {
        item.unit = String(value);
      }

      updated[index] = item;
      return updated;
    });
  };

  // Quick select a fish type for an item
  const handleSelectFishTypeForItem = (index: number, fishTypeId: string) => {
    const matched = fishTypes.find((f) => f.id === fishTypeId);
    if (!matched) return;
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        fishTypeId: matched.id,
        fishName: matched.arabicName || matched.name,
        unit: matched.unitLabel || updated[index].unit,
      };
      return updated;
    });
  };

  // Add new item
  const handleAddItem = () => {
    const defaultFish = fishTypes[0];
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        fishTypeId: defaultFish ? defaultFish.id : '',
        fishName: defaultFish ? defaultFish.arabicName : 'صنف جديد',
        quantity: 1,
        unit: defaultFish ? defaultFish.unitLabel : 'صندوق',
        unitPrice: 0,
        totalGross: 0,
      },
    ]);
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      setErrorMessage('يجب أن تحتوي الفاتورة على صنف سمك واحد على الأقل.');
      return;
    }
    setErrorMessage(null);
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Save transaction
  const handleSubmit = (autoPrint: boolean) => {
    if (!sellerName.trim()) {
      setErrorMessage('يرجى تحديد أو إدخال اسم الصياد');
      return;
    }
    if (!buyerName.trim()) {
      setErrorMessage('يرجى تحديد أو إدخال اسم المشتري');
      return;
    }
    if (items.length === 0 || currentGross <= 0) {
      setErrorMessage('يرجى التأكد من إضافة أصناف بمبلغ إجمالي أكبر من صفر');
      return;
    }
    const actualSellerPaid = editContext === 'buyer'
      ? (typeof transaction.sellerPaidAmount === 'number' ? transaction.sellerPaidAmount : financials.netToSeller)
      : currentSellerPaidNum;
    const actualSellerStatus: 'paid' | 'partial' | 'unpaid' = editContext === 'buyer'
      ? (transaction.sellerPaidStatus || (actualSellerPaid >= financials.netToSeller ? 'paid' : actualSellerPaid > 0 ? 'partial' : 'unpaid'))
      : (actualSellerPaid >= financials.netToSeller
          ? 'paid'
          : actualSellerPaid > 0
          ? 'partial'
          : 'unpaid');
    const finalSellerPayoutMethod = editContext === 'buyer' ? transaction.sellerPayoutMethod : sellerPayoutMethod;
    const finalSellerExchangeName = editContext === 'buyer'
      ? transaction.sellerExchangeName
      : (sellerPayoutMethod === 'exchange' ? (sellerExchangeName.trim() || undefined) : undefined);

    let finalPaymentStatus: 'paid' | 'pending' | 'settled' = 'paid';
    if (editContext === 'seller') {
      finalPaymentStatus = transaction.paymentStatus || 'paid';
    } else if (settlementType === 'association_credit') {
      finalPaymentStatus = 'pending';
    } else if (settlementType === 'partial_cash') {
      finalPaymentStatus = currentBuyerRemainingDebt === 0 ? 'paid' : 'pending';
    } else if (settlementType === 'direct_cash') {
      finalPaymentStatus = 'settled';
    } else {
      finalPaymentStatus = 'paid';
    }

    const finalSettlementType = editContext === 'seller' ? (transaction.settlementType || 'association_cash') : settlementType;
    const finalBuyerPaidAmount = editContext === 'seller' ? (transaction.buyerPaidAmount ?? financials.totalFromBuyer) : currentBuyerPaidNum;
    const finalBuyerRemainingDebt = editContext === 'seller' ? (transaction.buyerRemainingDebt ?? 0) : currentBuyerRemainingDebt;

    const trimmedSeller = sellerName.trim();
    const trimmedBuyer = buyerName.trim();

    // المطابقة التلقائية للصياد من جهات الاتصال المسجلة
    const matchedSeller = selectedSellerId
      ? contacts.find((c) => c.id === selectedSellerId)
      : (contacts.find((c) =>
          (c.type === 'seller' || c.type === 'fisherman') &&
          (c.name.trim().toLowerCase() === trimmedSeller.toLowerCase() ||
           normalizeArabic(c.name) === normalizeArabic(trimmedSeller))
        ) || contacts.find((c) =>
          c.name.trim().toLowerCase() === trimmedSeller.toLowerCase() ||
          normalizeArabic(c.name) === normalizeArabic(trimmedSeller)
        ));

    const finalSellerId = matchedSeller
      ? matchedSeller.id
      : (trimmedSeller === transaction.sellerName?.trim()
          ? (transaction.sellerId || `seller-${Date.now()}`)
          : `seller-${Date.now()}`);

    const finalSellerPhone = matchedSeller?.phone || (trimmedSeller === transaction.sellerName?.trim() ? transaction.sellerPhone : undefined);

    // المطابقة التلقائية للمشتري من جهات الاتصال المسجلة
    const matchedBuyer = selectedBuyerId
      ? contacts.find((c) => c.id === selectedBuyerId)
      : (contacts.find((c) =>
          (c.type === 'buyer' || c.type === 'customer') &&
          (c.name.trim().toLowerCase() === trimmedBuyer.toLowerCase() ||
           normalizeArabic(c.name) === normalizeArabic(trimmedBuyer))
        ) || contacts.find((c) =>
          c.name.trim().toLowerCase() === trimmedBuyer.toLowerCase() ||
          normalizeArabic(c.name) === normalizeArabic(trimmedBuyer)
        ));

    const finalBuyerId = matchedBuyer
      ? matchedBuyer.id
      : (trimmedBuyer === transaction.buyerName?.trim()
          ? (transaction.buyerId || `buyer-${Date.now()}`)
          : `buyer-${Date.now()}`);

    const finalBuyerPhone = buyerPhone.trim() || matchedBuyer?.phone || (trimmedBuyer === transaction.buyerName?.trim() ? transaction.buyerPhone : undefined);

    const finalPaidAtPosBuyerAmount = (() => {
      // يُحدَّث دائماً بالمبلغ النقدي الفعلي المدفوع بحسب نوع التسوية الجديد
      if (finalSettlementType === 'association_credit') return 0;
      if (finalSettlementType === 'association_cash') return financials.totalFromBuyer;
      if (finalSettlementType === 'direct_cash') return financials.harajProfit;
      if (finalSettlementType === 'partial_cash') return finalBuyerPaidAmount;
      return finalBuyerPaidAmount;
    })();

    // إذا تم تسديد كامل المبلغ وأصبح المتبقي 0، يتم ترقية نوع التسوية إلى association_cash تلقائياً لمنع أي التباس
    const normalizedSettlementType: SettlementType =
      finalSettlementType === 'partial_cash' && finalBuyerRemainingDebt <= 0 && finalBuyerPaidAmount >= financials.totalFromBuyer
        ? 'association_cash'
        : finalSettlementType;

    const normalizedPaymentStatus: 'paid' | 'pending' | 'settled' =
      finalBuyerRemainingDebt <= 0 ? 'paid' : finalPaymentStatus;

    const updatedTrx: Transaction = {
      ...transaction,
      sellerId: finalSellerId,
      sellerName: trimmedSeller,
      sellerPhone: finalSellerPhone,
      buyerId: finalBuyerId,
      buyerName: trimmedBuyer,
      buyerPhone: finalBuyerPhone,
      data: {
        ...(transaction.data || {}),
        sellerId: finalSellerId,
        sellerName: trimmedSeller,
        sellerPhone: finalSellerPhone,
        buyerId: finalBuyerId,
        buyerName: trimmedBuyer,
        buyerPhone: finalBuyerPhone,
        dateStr: dateStr.trim() || transaction.dateStr,
        timeStr: timeStr.trim() || transaction.timeStr,
        paymentStatus: normalizedPaymentStatus,
        settlementType: normalizedSettlementType,
        buyerPaidAmount: finalBuyerPaidAmount,
        paidAtPosBuyerAmount: finalPaidAtPosBuyerAmount,
        buyerRemainingDebt: finalBuyerRemainingDebt,
        items,
        grossAmount: financials.grossAmount,
        buyerTaxRate: financials.buyerTaxRate,
        buyerTaxAmount: financials.buyerTaxAmount,
        totalFromBuyer: financials.totalFromBuyer,
        sellerTaxRate: financials.sellerTaxRate,
        sellerTaxAmount: financials.sellerTaxAmount,
        netToSeller: financials.netToSeller,
        harajProfit: financials.harajProfit,
        sellerPaidAmount: actualSellerPaid,
        paidAtPosAmount: actualSellerPaid,
        sellerPaidStatus: actualSellerStatus,
        sellerPayoutMethod: finalSellerPayoutMethod,
        sellerExchangeName: finalSellerExchangeName,
        isEdited: true,
        editedAt: Date.now(),
        editedDateStr: formatGregorianDate(new Date()),
      },
      dateStr: dateStr.trim() || transaction.dateStr,
      timeStr: timeStr.trim() || transaction.timeStr,
      paymentStatus: normalizedPaymentStatus,
      settlementType: normalizedSettlementType,
      buyerPaidAmount: finalBuyerPaidAmount,
      paidAtPosBuyerAmount: finalPaidAtPosBuyerAmount,
      buyerRemainingDebt: finalBuyerRemainingDebt,
      notes: notes.trim() || undefined,
      items,
      grossAmount: financials.grossAmount,
      buyerTaxRate: financials.buyerTaxRate,
      buyerTaxAmount: financials.buyerTaxAmount,
      totalFromBuyer: financials.totalFromBuyer,
      sellerTaxRate: financials.sellerTaxRate,
      sellerTaxAmount: financials.sellerTaxAmount,
      netToSeller: financials.netToSeller,
      harajProfit: financials.harajProfit,
      sellerPaidAmount: actualSellerPaid,
      paidAtPosAmount: actualSellerPaid,
      sellerPaidStatus: actualSellerStatus,
      sellerPayoutMethod: finalSellerPayoutMethod,
      sellerExchangeName: finalSellerExchangeName,
      isEdited: true,
      editedAt: Date.now(),
      editedDateStr: formatGregorianDate(new Date()),
    };

    onSave(updatedTrx, autoPrint);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="bg-white border border-slate-300 rounded-none w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl animate-in fade-in zoom-in-95 text-slate-800 my-auto"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-none bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>
                  {editContext === 'buyer'
                    ? 'تعديل فاتورة المشتري رقم:'
                    : editContext === 'seller'
                    ? 'تعديل فاتورة الصياد رقم:'
                    : 'تعديل الفاتورة رقم:'}
                </span>
                <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-300 text-xs">
                  {transaction.id}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {editContext === 'buyer'
                  ? 'قم بتعديل بيانات المشتري والأصناف وطريقة تحصيل النقدية للدخول في كاش الدرج'
                  : editContext === 'seller'
                  ? 'قم بتعديل بيانات الصياد والأصناف وحالة تسليم وصرف المستحقات'
                  : 'قم بتعديل بيانات العملية والأصناف والمبالغ، ثم احفظ أو اطبع الفاتورة مجدداً'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-none hover:bg-slate-200/50 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-none text-red-700 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Date, Time Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/60 p-3 rounded-none border border-slate-300/70">
            <div>
              <label className="block text-slate-600 mb-1 font-bold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>تاريخ الفاتورة</span>
              </label>
              <input
                type="text"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-2 font-mono font-bold text-slate-900 focus:outline-none focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500"
                placeholder="2026-09-09"
              />
            </div>

            <div>
              <label className="block text-slate-600 mb-1 font-bold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>الوقت</span>
              </label>
              <input
                type="text"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-2 font-mono font-bold text-slate-900 focus:outline-none focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500"
                placeholder="10:30 ص"
              />
            </div>
          </div>

          {/* Parties: Seller and Buyer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Seller */}
            <div className="p-3.5 bg-amber-50/40 rounded-none border border-amber-200/80 space-y-2 relative">
              <div className="flex items-center justify-between">
                <label className="block text-amber-900 font-bold flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>الصياد:</span>
                </label>

                {/* Seller discount options */}
                <div className="flex items-center bg-white p-0.5 rounded-none border border-amber-200 text-[10px] font-bold shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setSellerTaxRate(defaultSellerRate)}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      sellerTaxRate === defaultSellerRate
                        ? 'bg-amber-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title={`الخصم المعتمد في الإعدادات (${Math.round(defaultSellerRate * 100)}%)`}
                  >
                    خصم {Math.round(defaultSellerRate * 100)}% (افتراضي)
                  </button>
                  {Math.round(defaultSellerRate * 100) !== 2 && (
                    <button
                      type="button"
                      onClick={() => setSellerTaxRate(0.02)}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                        sellerTaxRate === 0.02
                          ? 'bg-amber-600 text-white shadow-xs font-black'
                          : 'text-amber-800 hover:bg-amber-100/60'
                      }`}
                      title="خصم 2% (مشتري كـ بائع / عمولة مخفّضة)"
                    >
                      خصم 2%
                    </button>
                  )}
                  {Math.round(defaultSellerRate * 100) !== 1 && (
                    <button
                      type="button"
                      onClick={() => setSellerTaxRate(0.01)}
                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                        sellerTaxRate === 0.01
                          ? 'bg-emerald-600 text-white shadow-xs font-black'
                          : 'text-emerald-700 hover:bg-emerald-100/60'
                      }`}
                      title="خصم مخفض بنسبة 1%"
                    >
                      خصم 1%
                    </button>
                  )}
                </div>
              </div>

              {/* Seller Input with Autocomplete */}
              <div ref={sellerContainerRef} className="relative">
                <div className="relative">
                  <input
                    ref={sellerInputRef}
                    type="text"
                    value={sellerName}
                    onChange={(e) => {
                      setSellerName(e.target.value);
                      setSelectedSellerId(undefined);
                      setIsSellerDropdownOpen(true);
                      setHighlightedSellerIndex(0);
                    }}
                    onFocus={() => {
                      setIsSellerDropdownOpen(true);
                      setHighlightedSellerIndex(0);
                    }}
                    onKeyDown={handleSellerKeyDown}
                    placeholder="اكتب اسم الصياد..."
                    autoComplete="off"
                    className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none py-2 pr-7 pl-12 font-bold text-slate-900 focus:outline-none focus:bg-[#FFFDF0] focus:ring-2 focus:ring-amber-500 text-xs"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-500 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {sellerName && (
                      <button
                        type="button"
                        onClick={() => {
                          setSellerName('');
                          setSelectedSellerId(undefined);
                          setHighlightedSellerIndex(-1);
                          setIsSellerDropdownOpen(false);
                          sellerInputRef.current?.focus();
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        title="مسح الاسم"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSellerDropdownOpen((prev) => !prev);
                        sellerInputRef.current?.focus();
                      }}
                      className="p-0.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                      title="عرض القائمة"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isSellerDropdownOpen ? 'rotate-180 text-amber-600' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isSellerDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-amber-200 rounded-none shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-amber-50">
                    {matchingSellers.length > 0 ? (
                      visibleSellers.map((s, idx) => {
                        const isSelected = sellerName.trim() === s.name.trim();
                        const isHighlighted = highlightedSellerIndex === idx;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleSelectSeller(s)}
                            className={`w-full text-right px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isHighlighted
                                ? 'bg-amber-100 text-amber-950 font-bold'
                                : isSelected
                                ? 'bg-amber-50 text-amber-900 font-bold'
                                : 'hover:bg-amber-50/50 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{s.name}</span>
                            {s.phone && (
                              <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                                {s.phone}
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-2 text-center text-[11px] text-slate-500">
                        لا يوجد صياد مسجل بهذا الاسم
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Buyer */}
            <div className="p-3.5 bg-blue-50/40 rounded-none border border-blue-300/80 space-y-2 relative">
              <div className="flex items-center justify-between">
                <label className="block text-blue-900 font-bold flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                  <span>المشتري:</span>
                </label>

                {/* Buyer commission indicator */}
                <div className="flex items-center bg-white px-2 py-0.5 rounded-none border border-blue-300 text-[10px] font-black text-blue-900 shadow-2xs">
                  <span>عمولة +{Math.round(defaultBuyerRate * 100)}% (افتراضي)</span>
                </div>
              </div>

              {/* Buyer Input with Autocomplete */}
              <div ref={buyerContainerRef} className="relative">
                <div className="relative">
                  <input
                    ref={buyerInputRef}
                    type="text"
                    value={buyerName}
                    onChange={(e) => {
                      setBuyerName(e.target.value);
                      setSelectedBuyerId(undefined);
                      setIsBuyerDropdownOpen(true);
                      setHighlightedBuyerIndex(0);
                    }}
                    onFocus={() => {
                      setIsBuyerDropdownOpen(true);
                      setHighlightedBuyerIndex(0);
                    }}
                    onKeyDown={handleBuyerKeyDown}
                    placeholder="اكتب اسم المشتري..."
                    autoComplete="off"
                    className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none py-2 pr-7 pl-12 font-bold text-slate-900 focus:outline-none focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500 text-xs"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {buyerName && (
                      <button
                        type="button"
                        onClick={() => {
                          setBuyerName('');
                          setSelectedBuyerId(undefined);
                          setBuyerPhone('');
                          setHighlightedBuyerIndex(-1);
                          setIsBuyerDropdownOpen(false);
                          buyerInputRef.current?.focus();
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                        title="مسح الاسم"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setIsBuyerDropdownOpen((prev) => !prev);
                        buyerInputRef.current?.focus();
                      }}
                      className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="عرض القائمة"
                    >
                      <ChevronDown
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          isBuyerDropdownOpen ? 'rotate-180 text-blue-600' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {isBuyerDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-blue-300 rounded-none shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-blue-50">
                    {matchingBuyers.length > 0 ? (
                      visibleBuyers.map((b, idx) => {
                        const isSelected = buyerName.trim() === b.name.trim();
                        const isHighlighted = highlightedBuyerIndex === idx;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleSelectBuyer(b)}
                            className={`w-full text-right px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              isHighlighted
                                ? 'bg-blue-100 text-blue-950 font-bold'
                                : isSelected
                                ? 'bg-blue-50 text-blue-900 font-bold'
                                : 'hover:bg-blue-50/50 text-slate-800'
                            }`}
                          >
                            <span className="truncate">{b.name}</span>
                            {b.phone && (
                              <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                                {b.phone}
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-2 text-center text-[11px] text-slate-500">
                        لا يوجد مشتري مسجل بهذا الاسم
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>رقم جوال المشتري (اختياري)</span>
                </label>
                <input
                  type="text"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  placeholder="مثال: 777123456"
                  className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:bg-[#FFFDF0] focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Buyer Payment & Drawer Inflow Card (تظهر فقط في سياق المشتري أو الشامل) */}
          {editContext !== 'seller' && (
          <div className="bg-blue-50/50 border border-blue-300/90 rounded-none p-3.5 sm:p-4 space-y-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-300/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-none bg-blue-600 text-white flex items-center justify-center">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    طريقة تحصيل المشتري :
                  </h4>
                </div>
              </div>
              <div className="text-left font-mono">
                <span className="text-[11px] text-slate-500 font-semibold block">إجمالي المطلوب من المشتري:</span>
                <span className="text-xs sm:text-sm font-bold text-blue-700 bg-white px-2.5 py-1 rounded-none border border-blue-300">
                  {formatCurrency(financials.totalFromBuyer, settings.currency)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* Full Cash into Drawer */}
              <button
                type="button"
                onClick={() => {
                  setSettlementType('association_cash');
                  setBuyerPaidAmountInput(financials.totalFromBuyer);
                }}
                className={`px-3 py-2.5 rounded-none text-xs sm:text-sm font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  settlementType === 'association_cash'
                    ? 'bg-blue-600 border-blue-700 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                }`}
              >
                {settlementType === 'association_cash' && <Check className="w-4 h-4" />}
                <span>مسدد بالكامل</span>
              </button>

              {/* Credit on Buyer (Association Credit) */}
              <button
                type="button"
                onClick={() => {
                  setSettlementType('association_credit');
                  setBuyerPaidAmountInput(0);
                }}
                className={`px-3 py-2.5 rounded-none text-xs sm:text-sm font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  settlementType === 'association_credit'
                    ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                }`}
              >
                {settlementType === 'association_credit' && <Check className="w-4 h-4" />}
                <span>آجل على المشتري</span>
              </button>

              {/* Partial Cash */}
              <button
                type="button"
                onClick={() => {
                  setSettlementType('partial_cash');
                }}
                className={`px-3 py-2.5 rounded-none text-xs sm:text-sm font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  settlementType === 'partial_cash'
                    ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-indigo-50 hover:border-indigo-300'
                }`}
              >
                {settlementType === 'partial_cash' && <Check className="w-4 h-4" />}
                <span>تحصيل نقدي جزئي + آجل</span>
              </button>
            </div>

            {settlementType === 'partial_cash' && (
              <div className="p-3 bg-white rounded-none border border-blue-300 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <label className="font-bold text-slate-700 text-xs">المبلغ المقبوض نقداً الآن بالدرج:</label>
                  <input
                    type="number"
                    min="0"
                    max={financials.totalFromBuyer}
                    step="any"
                    value={buyerPaidAmountInput}
                    onChange={(e) => setBuyerPaidAmountInput(e.target.value)}
                    className="w-32 font-mono font-bold text-sm bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 text-center text-slate-900 focus:bg-[#FFFDF0] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                  <span className="font-bold text-slate-500 text-xs">{settings.currency}</span>
                </div>
                <div className="text-xs text-amber-800 font-bold bg-amber-50 px-3 py-1.5 rounded-none border border-amber-200">
                  المتبقي ديناً على المشتري: {formatCurrency(Math.max(0, financials.totalFromBuyer - (Number(buyerPaidAmountInput) || 0)), settings.currency)}
                </div>
              </div>
            )}
          </div>
          )}

          {/* Fish Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-900 flex items-center gap-1.5">
                <Fish className="w-4 h-4 text-blue-600" />
                <span>أصناف الأسماك والكميات والمبالغ:</span>
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-none font-bold flex items-center gap-1 transition-colors cursor-pointer text-[11px]"
              >
                <Plus className="w-3 h-3" />
                <span>إضافة صنف</span>
              </button>
            </div>

            <div className="border border-slate-300 rounded-none overflow-hidden shadow-2xs">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <tr>
                    <th className="p-2.5">نوع السمك</th>
                    <th className="p-2.5 w-24">الكمية</th>
                    <th className="p-2.5 w-28">الوحدة</th>
                    <th className="p-2.5 w-28">سعر الوحدة</th>
                    <th className="p-2.5 w-32 text-center">الإجمالي (الأساسي)</th>
                    <th className="p-2.5 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-slate-50/60">
                      {/* Fish Name or Quick Selector */}
                      <td className="p-2">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={it.fishName}
                            onChange={(e) =>
                              handleItemChange(idx, 'fishName', e.target.value)
                            }
                            className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 font-bold text-slate-900 text-xs focus:bg-[#FFFDF0] focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="اسم نوع السمك..."
                          />
                          {fishTypes.length > 0 && (
                            <select
                              value={it.fishTypeId || ''}
                              onChange={(e) =>
                                handleSelectFishTypeForItem(idx, e.target.value)
                              }
                              className="w-full text-[10px] bg-[#FEF9D7] border border-amber-300/80 rounded px-1.5 py-0.5 text-slate-800 focus:outline-none font-bold"
                            >
                              <option value="">-- اختر من دليل الأصناف --</option>
                              {fishTypes.map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.arabicName || f.name} ({f.unitLabel})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>

                      {/* Quantity */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={it.quantity}
                          onChange={(e) =>
                            handleItemChange(idx, 'quantity', e.target.value)
                          }
                          className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 font-mono font-bold text-slate-900 text-xs text-center focus:bg-[#FFFDF0] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>

                      {/* Unit */}
                      <td className="p-2">
                        <select
                          value={it.unit}
                          onChange={(e) =>
                            handleItemChange(idx, 'unit', e.target.value)
                          }
                          className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 font-bold text-slate-900 text-xs focus:bg-[#FFFDF0] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="كيلو">كيلو</option>
                          <option value="صندوق">صندوق</option>
                          <option value="طراد / شلة">طراد / شلة</option>
                          <option value="حبة">حبة</option>
                          <option value="حوت">حوت</option>
                          <option value="سلة">سلة</option>
                        </select>
                      </td>

                      {/* Unit Price */}
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.unitPrice}
                          onChange={(e) =>
                            handleItemChange(idx, 'unitPrice', e.target.value)
                          }
                          className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 font-mono font-bold text-slate-900 text-xs text-center focus:bg-[#FFFDF0] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>

                      {/* Total Item Gross */}
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.totalGross}
                          onChange={(e) =>
                            handleItemChange(idx, 'totalGross', e.target.value)
                          }
                          className="w-full bg-[#FEF9D7] border border-amber-400 rounded-none p-1.5 font-mono font-black text-slate-950 text-xs text-center focus:bg-[#FFFDF0] focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>

                      {/* Remove */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                          className={`p-1.5 rounded-none transition-colors ${
                            items.length <= 1
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer'
                          }`}
                          title="حذف الصنف"
                        >
                          <Trash2 className="w-3.5 h-3.5 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Breakdown Summary Cards */}
          <div className="bg-slate-900 text-white rounded-none p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="font-bold text-slate-300 block">الإجمالي الأساسي (Gross):</span>
                {financials.grossAmount > 0 && (
                  <span className="text-[11px] text-amber-200/80 font-normal block">
                    {tafqeet(financials.grossAmount, settings.currency)}
                  </span>
                )}
              </div>
              <span className="font-mono text-base font-black text-amber-400">
                {formatCurrency(financials.grossAmount, settings.currency)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* Buyer side */}
              <div className="bg-slate-800/90 rounded-none p-2.5 border border-blue-500/30">
                <div className="text-blue-300 font-bold mb-1">
                  المطلوب من المشتري (+{(financials.buyerTaxRate * 100).toFixed(0)}%):
                </div>
                <div className="text-sm font-mono font-black text-blue-400">
                  {formatCurrency(financials.totalFromBuyer, settings.currency)}
                </div>
                {financials.totalFromBuyer > 0 && (
                  <div className="text-[10px] text-blue-200 font-sans mt-0.5 leading-tight">
                    {tafqeet(financials.totalFromBuyer, settings.currency)}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  عمولة: +{formatCurrency(financials.buyerTaxAmount, settings.currency)}
                </div>
              </div>

              {/* Seller side */}
              <div className="bg-slate-800/90 rounded-none p-2.5 border border-emerald-500/30">
                <div className="text-emerald-300 font-bold mb-1">
                  صافي المستحق للصياد (-{(financials.sellerTaxRate * 100).toFixed(0)}%):
                </div>
                <div className="text-sm font-mono font-black text-emerald-400">
                  {formatCurrency(financials.netToSeller, settings.currency)}
                </div>
                {financials.netToSeller > 0 && (
                  <div className="text-[10px] text-emerald-200 font-sans mt-0.5 leading-tight">
                    {tafqeet(financials.netToSeller, settings.currency)}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  خصم: -{formatCurrency(financials.sellerTaxAmount, settings.currency)}
                </div>
              </div>

              {/* Profit side */}
              <div className="bg-slate-800/90 rounded-none p-2.5 border border-indigo-500/30">
                <div className="text-indigo-300 font-bold mb-1">
                  دخل الجمعية المالي (5%):
                </div>
                <div className="text-sm font-mono font-black text-indigo-400">
                  {formatCurrency(financials.harajProfit, settings.currency)}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  (2% مشتري + 3% بائع)
                </div>
              </div>
            </div>
          </div>

          {/* Fisherman Dues & Payout Section (تظهر فقط في سياق الصياد أو الشامل) */}
          {editContext !== 'buyer' && (
          <div className="bg-slate-50 border border-slate-300/80 rounded-none p-4 space-y-3.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/70 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-none bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">
                    مستحقات وحالة تسليم الصياد نقداً:
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    يمكنك تحديد ما تم تسليمه للصياد نقداً، أو إعطائه نصف المبلغ، أو تأجيل الباقي كدين على الحراج
                  </p>
                </div>
              </div>

              <div className="text-left font-mono">
                <span className="text-[10px] text-slate-400 block">صافي المستحق الكلي:</span>
                <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-300">
                  {formatCurrency(netSeller, settings.currency)}
                </span>
              </div>
            </div>

            {/* Quick Selection Buttons */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">
                خيارات سريعة للمبلغ المسلّم نقداً:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 100% Full */}
                <button
                  type="button"
                  onClick={() => {
                    setSellerPaidMode('full');
                    setSellerPaidAmountInput(netSeller);
                  }}
                  className={`px-3 py-2 rounded-none text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    sellerPaidMode === 'full'
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-emerald-50 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {sellerPaidMode === 'full' && <Check className="w-3.5 h-3.5" />}
                    <span>مسلّم بالكامل (100%)</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-90">
                    {formatCurrency(netSeller, settings.currency)}
                  </span>
                </button>

                {/* 50% Half */}
                <button
                  type="button"
                  onClick={() => {
                    setSellerPaidMode('half');
                    setSellerPaidAmountInput(Math.round((netSeller / 2) * 100) / 100);
                  }}
                  className={`px-3 py-2 rounded-none text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    sellerPaidMode === 'half'
                      ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {sellerPaidMode === 'half' && <Check className="w-3.5 h-3.5" />}
                    <span>نصف المبلغ (50%)</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-90">
                    {formatCurrency(Math.round((netSeller / 2) * 100) / 100, settings.currency)}
                  </span>
                </button>

                {/* 0% Unpaid / Deferred - دين كامل على الجمعية */}
                <button
                  type="button"
                  onClick={() => {
                    setSellerPaidMode('zero');
                    setSellerPaidAmountInput(0);
                  }}
                  className={`px-3 py-2 rounded-none text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    sellerPaidMode === 'zero'
                      ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-amber-50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {sellerPaidMode === 'zero' && <Check className="w-3.5 h-3.5" />}
                    <span>دين كامل على الجمعية (0%)</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-90">
                    تبقى الفلوس في الدرج
                  </span>
                </button>

                {/* Custom Amount */}
                <button
                  type="button"
                  onClick={() => {
                    setSellerPaidMode('custom');
                  }}
                  className={`px-3 py-2 rounded-none text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                    sellerPaidMode === 'custom'
                      ? 'bg-blue-600 border-blue-700 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {sellerPaidMode === 'custom' && <Check className="w-3.5 h-3.5" />}
                    <span>مبلغ مخصص</span>
                  </div>
                  <span className="font-mono text-[10px] opacity-90">
                    إدخال يدوي حر
                  </span>
                </button>
              </div>
            </div>

            {/* Input & Real-time balance breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Editable Paid Amount */}
              <div className="bg-white p-3 rounded-none border border-slate-300 shadow-2xs space-y-1.5">
                <label className="block text-slate-700 font-bold text-xs flex items-center justify-between">
                  <span>المبلغ المسلّم نقداً الآن للصياد:</span>
                  {sellerPaidMode === 'full' && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                      مسلّم بالكامل
                    </span>
                  )}
                  {sellerPaidMode === 'half' && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-bold">
                      مسلّم النصف
                    </span>
                  )}
                  {sellerPaidMode === 'zero' && (
                    <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                      دين كامل على الجمعية (0%)
                    </span>
                  )}
                  {sellerPaidMode === 'custom' && (
                    <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-bold">
                      مبلغ مخصص
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2 bg-[#FEF9D7] border border-amber-300/80 rounded-none p-1.5 focus-within:bg-[#FFFDF0] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <input
                    type="number"
                    min="0"
                    max={netSeller}
                    step="any"
                    value={sellerPaidAmountInput}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === '') {
                        setSellerPaidAmountInput('');
                        setSellerPaidMode('custom');
                        return;
                      }
                      const val = Number(valStr);
                      if (isNaN(val)) return;
                      const clamped = Math.max(0, val);
                      setSellerPaidAmountInput(clamped);
                      if (clamped >= netSeller) {
                        setSellerPaidMode('full');
                      } else if (clamped === 0) {
                        setSellerPaidMode('zero');
                      } else if (Math.abs(clamped - netSeller / 2) < 0.01) {
                        setSellerPaidMode('half');
                      } else {
                        setSellerPaidMode('custom');
                      }
                    }}
                    className="w-full font-mono text-sm font-bold text-slate-900 bg-transparent focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0">
                    {settings.currency}
                  </span>
                </div>
                {Number(sellerPaidAmountInput) > netSeller && (
                  <p className="text-[10px] text-amber-600 font-medium">
                    * ملاحظة: المبلغ يتجاوز صافي الفاتورة وسيتم ضبطه على {netSeller}.
                  </p>
                )}
              </div>

              {/* Remaining Debt on Market */}
              <div
                className={`p-3 rounded-none border flex flex-col justify-between ${
                  remainingSellerDebt > 0
                    ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold">المتبقي للصياد ديناً على الحراج:</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      remainingSellerDebt > 0
                        ? 'bg-amber-200/80 text-amber-900'
                        : 'bg-emerald-200/80 text-emerald-900'
                    }`}
                  >
                    {remainingSellerDebt > 0 ? 'دين على الجمعية' : 'خالص'}
                  </span>
                </div>
                <div className="font-mono text-base font-black">
                  {formatCurrency(remainingSellerDebt, settings.currency)}
                </div>
                <p className="text-[10px] opacity-80 mt-1">
                  {remainingSellerDebt > 0
                    ? 'سيظهر في كشف حساب الصياد كدين مستحق له على الجمعية ويمكن صرفه لاحقاً بسند صرف نقدي.'
                    : 'تم تسليم مستحقات الصياد بالكامل ولا يترتب أي دين على الحراج.'}
                </p>
              </div>
            </div>

            {/* Seller Payout Method: Cash vs Exchange */}
            <div className="p-3 bg-white rounded-none border border-slate-300 space-y-2">
              <label className="block text-slate-700 font-bold text-xs">
                طريقة صرف وتسليم مستحقات الصياد:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSellerPayoutMethod('cash')}
                  className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    sellerPayoutMethod === 'cash'
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>نقداً من الصندوق</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSellerPayoutMethod('exchange')}
                  className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                    sellerPayoutMethod === 'exchange'
                      ? 'bg-blue-600 border-blue-700 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>عبر الصرافة</span>
                </button>
              </div>

              {sellerPayoutMethod === 'exchange' && (
                <div className="pt-1">
                  <label className="block text-[11px] font-bold text-blue-900 mb-1">
                    اسم محل الصرافة أو رقم الحوالة:
                  </label>
                  <input
                    type="text"
                    value={sellerExchangeName}
                    onChange={(e) => setSellerExchangeName(e.target.value)}
                    placeholder="مثال: صرافة الكريمي، البسيري، العمقي..."
                    className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-2 text-xs font-bold text-slate-900 focus:bg-[#FFFDF0] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
          )}

          {/* Live Drawer Cash Impact Preview Banner */}
          <div className="bg-slate-900 text-white rounded-none p-4 shadow-xs border border-slate-700 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <span className="font-bold text-xs text-slate-200 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span>الأثر المالي اللحظي على «كاش الدرج» عند حفظ التعديل:</span>
              </span>
              <span
                className={`font-mono text-xs sm:text-sm font-black px-2.5 py-1 rounded-none border flex items-center gap-1.5 ${
                  netDrawerImpact > 0
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : netDrawerImpact < 0
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                    : 'bg-slate-800 text-slate-300 border-slate-600'
                }`}
              >
                {netDrawerImpact > 0 && <ArrowDownRight className="w-4 h-4 text-emerald-400" />}
                {netDrawerImpact < 0 && <ArrowUpRight className="w-4 h-4 text-rose-400" />}
                {netDrawerImpact > 0
                  ? `+${formatCurrency(netDrawerImpact, settings.currency)} (زيادة كاش بالدرج)`
                  : netDrawerImpact < 0
                  ? `-${formatCurrency(Math.abs(netDrawerImpact), settings.currency)} (خروج كاش من الدرج)`
                  : `0 ${settings.currency} (بدون حركة كاش)`}
              </span>
            </div>

            <div className={`grid gap-2 text-[11px] pt-1 ${
              editContext === 'buyer' || editContext === 'seller' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
            }`}>
              {editContext !== 'seller' && (
                <>
                  <div className="bg-slate-800/80 p-2 rounded-none border border-slate-700">
                    <span className="text-slate-400 block text-[10px]">مقبوض كاش من المشتري:</span>
                    <span className="font-mono font-bold text-blue-400">
                      +{formatCurrency(currentBuyerPaidNum, settings.currency)}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-none border border-slate-700">
                    <span className="text-slate-400 block text-[10px]">دين متبقي على المشتري:</span>
                    <span className="font-mono font-bold text-purple-400">
                      {formatCurrency(currentBuyerRemainingDebt, settings.currency)}
                    </span>
                  </div>
                </>
              )}
              {editContext !== 'buyer' && (
                <>
                  <div className="bg-slate-800/80 p-2 rounded-none border border-slate-700">
                    <span className="text-slate-400 block text-[10px]">مسلّم نقداً للصياد:</span>
                    <span className="font-mono font-bold text-rose-400">
                      -{formatCurrency(currentSellerPaidNum, settings.currency)}
                    </span>
                  </div>
                  <div className="bg-slate-800/80 p-2 rounded-none border border-slate-700">
                    <span className="text-slate-400 block text-[10px]">دين على الجمعية للصياد:</span>
                    <span className="font-mono font-bold text-amber-400">
                      {formatCurrency(remainingSellerDebt, settings.currency)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {remainingSellerDebt > 0 && currentBuyerPaidNum > 0 && (
              <div className="p-2.5 rounded-none bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2">
                <Check className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                <span>
                  <strong>المتبقي للصياد ({formatCurrency(remainingSellerDebt, settings.currency)}) يعود ويبقى في كاش الدرج:</strong>
                  {' '}تم تسليم الصياد {formatCurrency(currentSellerPaidNum, settings.currency)} فقط، والمبلغ المتبقي قُيّد كدين له على الجمعية، وبالتالي يستقر المبلغ في الصندوق تلقائياً لحين صرفه له لاحقاً.
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-700 mb-1 font-bold">
              ملاحظات الفاتورة (اختياري)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل أو شروط خاصة بالصفقة..."
              className="w-full bg-[#FEF9D7] border border-amber-300/80 rounded-none p-2 text-slate-900 font-semibold focus:bg-[#FFFDF0] focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Error message banner near action buttons */}
        {errorMessage && (
          <div className="px-5 py-2.5 bg-red-50 border-t border-red-200 text-red-700 flex items-center gap-2 font-bold text-xs animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Footer Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-none transition-colors cursor-pointer"
          >
            إلغاء التعديل
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-none transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>حفظ التعديلات فقط</span>
            </button>

            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-none transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>حفظ وطباعة الفاتورة</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
