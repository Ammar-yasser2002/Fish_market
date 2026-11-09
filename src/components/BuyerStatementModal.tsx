import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Contact, Transaction, MarketSettings, CashEntry } from '../types';
import { formatCurrency, formatNumber, formatArabicDayOnly, getWeekdayName, tafqeet, formatGregorianDate, formatGregorianTime, formatDisplayDate, isTransactionResold, getResoldDetails, isTransferredTransaction, getTransactionBuyerDebt } from '../utils/calculations';
import { WhatsAppIcon, openWhatsAppChat, sendDebtorStatementViaWhatsApp, prepareFileForWhatsApp } from '../utils/whatsapp';
import {
  exportFullBuyerStatementPdfA4,
  exportFullBuyerStatementToExcel,
  exportTransitInvoicePdfA4,
  exportTransitInvoiceToExcel,
  exportBuyerThermalPdf,
  printFullBuyerStatementA4Direct,
  exportMultiSellerBuyerInvoicePdfA4,
  printMultiSellerBuyerInvoiceA4Direct,
  exportDebtorStatementPdfA4,
  printDebtorStatementA4Direct,
  INVOICE_MARGIN_CREDIT_TEXT,
} from '../utils/invoiceExport';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareBuyerStatementPdf, ShareTarget } from '../utils/shareUtils';
import {
  Printer,
  X,
  Fish,
  FileText,
  Receipt,
  ReceiptText,
  User,
  Users,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  HandCoins,
  Truck,
  Wallet,
  ShoppingBag,
  Download,
  FileSpreadsheet,
  Loader2,
  ArrowRightLeft,
  Trash2,
} from 'lucide-react';

interface BuyerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenAllDebtorsModal?: () => void;
  onOpenAdvanceModal?: () => void;
  onOpenLoanModal?: () => void;
  onOpenOffsetModal?: () => void;
  onOpenServiceInvoice?: () => void;
  onDeleteCashEntry?: (id: string) => void;
  buyer?: Contact;
  transactions: Transaction[];
  salesTransactions?: Transaction[];
  repayments?: CashEntry[];
  advanceEntries?: CashEntry[];
  advanceBalance?: number;
  loanBalance?: number;
  settings: MarketSettings;
  timeframe: 'today' | 'week' | 'month' | 'all';
  customFilterLabel?: string;
  buyerMetrics: {
    grossTotal: number;
    taxTotal: number;
    finalTotal: number;
    count: number;
  };
  initialPrintMode?: 'official' | 'invoice' | 'transit' | 'thermal' | 'debt-claim';
  initialSellerRole?: 'fisherman' | 'seller';
}

export const BuyerStatementModal: React.FC<BuyerStatementModalProps> = ({
  isOpen,
  onClose,
  onOpenAllDebtorsModal,
  onOpenAdvanceModal,
  onOpenLoanModal,
  onOpenOffsetModal,
  onOpenServiceInvoice,
  buyer,
  transactions,
  salesTransactions = [],
  repayments = [],
  advanceEntries = [],
  advanceBalance = 0,
  loanBalance = 0,
  settings,
  timeframe,
  customFilterLabel,
  buyerMetrics,
  initialPrintMode = 'invoice',
  initialSellerRole = 'fisherman',
  onDeleteCashEntry,
}) => {
  const [printMode, setPrintMode] = useState<'official' | 'invoice' | 'transit' | 'thermal' | 'debt-claim'>(initialPrintMode || 'invoice');
  const [sellerRole, setSellerRole] = useState<'fisherman' | 'seller'>(initialSellerRole || 'fisherman');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [isPrintingA4, setIsPrintingA4] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    setPrintMode(initialPrintMode || 'invoice');
  }, [initialPrintMode, isOpen]);

  useEffect(() => {
    if (initialSellerRole) {
      setSellerRole(initialSellerRole);
    }
  }, [initialSellerRole, isOpen]);

  const totalRepayments = useMemo(() => {
    return repayments.reduce((sum, r) => sum + r.amount, 0);
  }, [repayments]);

  const debtMetrics = useMemo(() => {
    const raw = transactions.reduce(
      (acc, t) => {
        const resoldInfo = getResoldDetails(t);
        // لا تسقط الشروة من دين المشتري إلا إذا تمت تسويتها فعلياً بسداد المشتري الجديد
        if (resoldInfo.isResold && resoldInfo.isSettled) return acc;
        const remaining = getTransactionBuyerDebt(t);
        const paid =
          t.buyerPaidAmount ??
          (t.paymentStatus === 'paid' ? t.totalFromBuyer : 0);
        acc.totalRemaining += remaining;
        acc.totalPaid += paid;
        return acc;
      },
      { totalRemaining: 0, totalPaid: 0 }
    );

    // إذا توفرت سندات قبض وسداد مسجلة للمشتري في الصندوق، نضمن مطابقة الحساب رياضياً ومحاسبياً
    if (totalRepayments > 0) {
      const finalTotal = buyerMetrics?.finalTotal ?? transactions.reduce((sum, t) => sum + (t.totalFromBuyer || 0), 0);
      const effectivePaid = Math.max(raw.totalPaid, totalRepayments);
      const effectiveRemaining = Math.max(0, finalTotal - effectivePaid);
      return {
        totalPaid: effectivePaid,
        totalRemaining: Math.min(raw.totalRemaining, effectiveRemaining),
      };
    }

    return raw;
  }, [transactions, totalRepayments, buyerMetrics]);

  // الشروات المعلقة وغير المسددة للمشتري نفسه
  const buyerUnpaidTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const resoldInfo = getResoldDetails(t);
      if (resoldInfo.isResold && resoldInfo.isSettled) return false;
      const debt = getTransactionBuyerDebt(t);
      return debt > 0;
    });
  }, [transactions]);

  // إجمالي عدد الشروات المعلقة للمشتري نفسه
  const pendingDealsCount = useMemo(() => {
    return buyerUnpaidTransactions.length > 0
      ? buyerUnpaidTransactions.length
      : (debtMetrics.totalRemaining > 0 ? (buyerMetrics.count || transactions.length) : 0);
  }, [buyerUnpaidTransactions.length, debtMetrics.totalRemaining, buyerMetrics.count, transactions.length]);

  // إجمالي صافي المديونية للمشتري بعد خصم السدادات
  const buyerTotalRemainingDebt = useMemo(() => {
    return Math.max(0, debtMetrics.totalRemaining - totalRepayments);
  }, [debtMetrics.totalRemaining, totalRepayments]);

  // التوزيع اليومي للمديونية للمشتري نفسه
  const buyerDailyDebtBreakdown = useMemo(() => {
    const dailyMap = new Map<string, { dayKey: string; dayName: string; dateStr: string; remainingDebt: number; dealsCount: number }>();

    buyerUnpaidTransactions.forEach((t) => {
      const debt = getTransactionBuyerDebt(t);

      if (debt > 0) {
        let dDate: Date;
        if (t.dateStr) {
          dDate = new Date(t.dateStr);
          if (isNaN(dDate.getTime()) && t.timestamp) {
            dDate = new Date(t.timestamp);
          }
        } else if (t.timestamp) {
          dDate = new Date(t.timestamp);
        } else {
          dDate = new Date();
        }
        if (isNaN(dDate.getTime())) dDate = new Date();

        const dayKey = dDate.toISOString().slice(0, 10);
        const dayName = new Intl.DateTimeFormat('ar-YE', { weekday: 'long' }).format(dDate);
        const dateStr = formatGregorianDate(dDate);

        const existing = dailyMap.get(dayKey) || {
          dayKey,
          dayName,
          dateStr,
          remainingDebt: 0,
          dealsCount: 0,
        };

        existing.remainingDebt += debt;
        existing.dealsCount += 1;
        dailyMap.set(dayKey, existing);
      }
    });

    const list = Array.from(dailyMap.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));

    if (list.length === 0 && buyerTotalRemainingDebt > 0) {
      const today = new Date();
      list.push({
        dayKey: today.toISOString().slice(0, 10),
        dayName: new Intl.DateTimeFormat('ar-YE', { weekday: 'long' }).format(today),
        dateStr: formatGregorianDate(today),
        remainingDebt: buyerTotalRemainingDebt,
        dealsCount: pendingDealsCount || 1,
      });
    }

    return list;
  }, [buyerUnpaidTransactions, buyerTotalRemainingDebt, pendingDealsCount]);

  const salesMetrics = useMemo(() => {
    return (salesTransactions || []).reduce(
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
  }, [salesTransactions]);

  // إجمالي فائض شروات المشتري (من بيعاته للآخرين كـ بائع فقط)
  const totalSurplus = useMemo(() => {
    return (salesTransactions || []).reduce((sum, t) => sum + (t.resaleSurplus && t.resaleSurplus > 0 ? t.resaleSurplus : 0), 0);
  }, [salesTransactions]);

  const purchasedItems = useMemo(() => {
    const items: {
      fishName: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalGross: number;
    }[] = [];

    transactions.forEach((t) => {
      if (t.items && t.items.length > 0) {
        t.items.forEach((it) => {
          items.push({
            fishName: it.fishName,
            quantity: it.quantity,
            unit: it.unit || 'كجم',
            unitPrice: it.unitPrice,
            totalGross: it.totalGross,
          });
        });
      }
    });

    return items;
  }, [transactions]);

  // قائمة الأصناف مع اسم البائع لكل صنف لفاتورة المشتري الشاملة (متعددة البائعين)
  const purchasedItemsWithSeller = useMemo(() => {
    const items: {
      transactionId: string;
      sellerName: string;
      sellerRole?: 'fisherman' | 'seller';
      fishName: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      totalGross: number;
    }[] = [];

    transactions.forEach((t) => {
      if (t.items && t.items.length > 0) {
        t.items.forEach((it) => {
          items.push({
            transactionId: t.id,
            sellerName: t.sellerName || '—',
            sellerRole: t.sellerRole,
            fishName: it.fishName,
            quantity: it.quantity,
            unit: it.unit || 'كجم',
            unitPrice: it.unitPrice,
            totalGross: it.totalGross,
          });
        });
      }
    });

    return items;
  }, [transactions]);

  const transitSerial = useMemo(() => {
    const raw = transactions[0]?.id?.replace(/\D/g, '') || '27';
    return raw.slice(-5).padStart(5, '0');
  }, [transactions]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        window.print();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrint = () => {
    window.print();
  };

  const handlePrintA4 = async () => {
    try {
      setIsPrintingA4(true);
      setPrintMode('official');
      const res = await printFullBuyerStatementA4Direct(
        buyer,
        transactions,
        debtMetrics,
        buyerMetrics,
        settings,
        customFilterLabel || timeframeLabels[timeframe],
        repayments,
        advanceEntries,
        advanceBalance,
        salesTransactions
      );
      if (res && res.message && !res.message.includes('إلغاء')) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Vector statement direct print error:', err);
      window.print();
    } finally {
      setIsPrintingA4(false);
    }
  };

  const handlePrintThermal = () => {
    setPrintMode('thermal');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handlePrintTransit = () => {
    setPrintMode('transit');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handlePrintInvoice = () => {
    setIsPrintingA4(true);
    setPrintMode('invoice');
    printMultiSellerBuyerInvoiceA4Direct(
      buyer,
      transactions,
      debtMetrics,
      buyerMetrics,
      settings,
      voucherNumber,
      customFilterLabel || timeframeLabels[timeframe],
      {},
      sellerRole
    )
      .then((res) => {
        if (res && res.message && !res.message.includes('إلغاء')) {
          setExportToast(res.message);
          setTimeout(() => setExportToast(null), 4000);
        }
      })
      .catch((err) => {
        console.warn('Vector multi-seller buyer invoice print error:', err);
        window.print();
      })
      .finally(() => {
        setIsPrintingA4(false);
      });
  };

  const handlePrintDebtorClaim = async () => {
    try {
      setIsPrintingA4(true);
      setPrintMode('debt-claim');
      const res = await printDebtorStatementA4Direct(
        {
          buyerName: buyer?.name || 'العميل',
          buyerPhone: buyer?.phone,
          totalDebt: buyerTotalRemainingDebt,
          dealsCount: pendingDealsCount,
          dailyBreakdown: buyerDailyDebtBreakdown.map((b) => ({
            dayKey: b.dayKey,
            dayName: b.dayName,
            dateStr: b.dateStr,
            debt: b.remainingDebt,
          })),
          unpaidTransactions: buyerUnpaidTransactions,
        },
        settings
      );
      if (res && res.message && !res.message.includes('إلغاء')) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Debtor claim direct print error:', err);
      window.print();
    } finally {
      setIsPrintingA4(false);
    }
  };

  const handleSmartPrint = () => {
    if (printMode === 'thermal') {
      handlePrintThermal();
    } else if (printMode === 'transit') {
      handlePrintTransit();
    } else if (printMode === 'invoice') {
      handlePrintInvoice();
    } else if (printMode === 'debt-claim') {
      handlePrintDebtorClaim();
    } else {
      handlePrintA4();
    }
  };

  const handleSendWhatsAppStatement = async () => {
    try {
      setIsSendingWhatsApp(true);
      const buyerName = buyer?.name || 'العميل';

      // 1. فتح محادثة واتساب فوراً دون أي تأخير لضمان استجابة لحظية في 0 مللي ثانية
      if (buyer?.phone) {
        openWhatsAppChat(buyer.phone, '').catch(() => {});
      }

      let res: { success: boolean; message: string; savedPath?: string; canceled?: boolean };

      if (printMode === 'debt-claim') {
        res = await exportDebtorStatementPdfA4(
          {
            buyerName,
            buyerPhone: buyer?.phone,
            totalDebt: buyerTotalRemainingDebt,
            dealsCount: pendingDealsCount,
            dailyBreakdown: buyerDailyDebtBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: buyerUnpaidTransactions,
          },
          settings,
          true // silent = true
        );
      } else if (printMode === 'official') {
        res = await exportFullBuyerStatementPdfA4(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          customFilterLabel || timeframeLabels[timeframe],
          repayments,
          advanceEntries,
          advanceBalance,
          salesTransactions,
          true // silent = true -> isolated temp folder
        );
      } else if (printMode === 'invoice') {
        res = await exportMultiSellerBuyerInvoicePdfA4(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          voucherNumber,
          customFilterLabel || timeframeLabels[timeframe],
          true // silent = true
        );
      } else if (printMode === 'transit') {
        res = await exportTransitInvoicePdfA4(
          buyer,
          transactions,
          purchasedItems,
          buyerMetrics,
          transitSerial,
          settings,
          true // silent = true
        );
      } else {
        res = await exportDebtorStatementPdfA4(
          {
            buyerName,
            buyerPhone: buyer?.phone,
            totalDebt: buyerTotalRemainingDebt,
            dealsCount: pendingDealsCount,
            dailyBreakdown: buyerDailyDebtBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: buyerUnpaidTransactions,
          },
          settings,
          true // silent = true
        );
      }

      if (res && res.success && res.savedPath && typeof window !== 'undefined' && (window as any).electronAPI?.sendWhatsAppFile) {
        await (window as any).electronAPI.sendWhatsAppFile({
          filePath: res.savedPath,
          phone: buyer?.phone,
        });
        setExportToast(`تم فتح محادثة WhatsApp وإرفاق كشف المديونية (${buyerName}) كملف PDF مباشرة!`);
        setTimeout(() => setExportToast(null), 5000);
      } else {
        const sendRes = await sendDebtorStatementViaWhatsApp(
          {
            buyerName,
            buyerPhone: buyer?.phone,
            totalDebt: buyerTotalRemainingDebt,
            dealsCount: pendingDealsCount,
            dailyBreakdown: buyerDailyDebtBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: buyerUnpaidTransactions,
          },
          settings
        );
        setExportToast(sendRes.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      console.error('handleSendWhatsAppStatement error:', err);
      setExportToast('حدث خطأ أثناء فتح واتساب: ' + (err?.message || ''));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      let res;
      if (printMode === 'debt-claim') {
        res = await exportDebtorStatementPdfA4(
          {
            buyerName: buyer?.name || 'العميل',
            buyerPhone: buyer?.phone,
            totalDebt: buyerTotalRemainingDebt,
            dealsCount: pendingDealsCount,
            dailyBreakdown: buyerDailyDebtBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: buyerUnpaidTransactions,
          },
          settings,
          false
        );
      } else if (printMode === 'transit') {
        res = await exportTransitInvoicePdfA4(
          buyer,
          transactions,
          purchasedItems,
          buyerMetrics,
          transitSerial,
          settings
        );
      } else if (printMode === 'thermal') {
        res = await exportBuyerThermalPdf(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          customFilterLabel || timeframeLabels[timeframe]
        );
      } else if (printMode === 'invoice') {
        res = await exportMultiSellerBuyerInvoicePdfA4(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          voucherNumber,
          customFilterLabel || timeframeLabels[timeframe],
          false,
          sellerRole
        );
      } else {
        res = await exportFullBuyerStatementPdfA4(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          customFilterLabel || timeframeLabels[timeframe],
          repayments,
          advanceEntries,
          advanceBalance,
          salesTransactions
        );
      }
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      setExportToast('فشل تحميل الفاتورة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleShareStatement = async (target: ShareTarget) => {
    setIsSharing(true);
    try {
      const res = await shareBuyerStatementPdf(
        buyer,
        transactions,
        debtMetrics,
        buyerMetrics,
        settings,
        target,
        printMode,
        {
          timeframeLabel: timeframeLabels[timeframe],
          purchasedItems,
          transitSerial,
          repayments,
          advanceEntries,
          advanceBalance,
          salesTransactions,
          sellerRole,
        }
      );
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSharing(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      let res;
      if (printMode === 'transit') {
        res = await exportTransitInvoiceToExcel(
          buyer,
          purchasedItems,
          buyerMetrics,
          transitSerial,
          settings
        );
      } else {
        res = await exportFullBuyerStatementToExcel(
          buyer,
          transactions,
          debtMetrics,
          buyerMetrics,
          settings,
          customFilterLabel || timeframeLabels[timeframe],
          repayments,
          advanceEntries,
          advanceBalance,
          salesTransactions
        );
      }
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      setExportToast('فشل تصدير البيانات إلى Excel: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingExcel(false);
    }
  };

  const timeframeLabels: Record<string, string> = {
    today: 'عمليات اليوم',
    week: 'الأسبوع الحالي (آخر 7 أيام)',
    month: 'الشهر الحالي (آخر 30 يوم)',
    all: 'كافة العمليات المسجلة',
  };

  const todayDateStr = formatGregorianDate(new Date());
  const todayTimeStr = formatGregorianTime(new Date());

  const voucherNumber = `BYR-${(buyer?.id || 'BUY').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  if (!isOpen) return null;

  const modalContent = (
    <div
      id="buyer-statement-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 print:p-0 print:bg-white print:fixed print:inset-0 print:z-50 print:overflow-visible flex flex-col items-center justify-start"
    >
      {/* Top Action Controls Bar */}
      <div className="w-full max-w-4xl bg-white rounded-none shadow-xl border border-slate-300 p-4 mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-300">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">كشف حساب المشتري</h2>
            <p className="text-xs text-slate-500 font-medium">
              معاينة وطباعة كشف حساب ومطالبة المشتري: {buyer?.name || 'غير محدد'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Format Preview Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-none border border-slate-300 text-xs font-bold">
            <button
              id="buyer-statement-invoice-tab-btn"
              type="button"
              onClick={() => setPrintMode('invoice')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'invoice'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={printMode === 'invoice' ? { backgroundColor: '#059669' } : undefined}
              title="فاتورة مبيعات المشتري مع عمود البائع قبل الصنف"
            >
              <ReceiptText className="w-3.5 h-3.5" />
              <span>فاتورة المشتري</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('official')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'official'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={printMode === 'official' ? { backgroundColor: '#030164' } : undefined}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>معاينة A4</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('transit')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'transit'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={printMode === 'transit' ? { backgroundColor: '#030164' } : undefined}
              title="سند مبيعات نقدية سمكية لعبور النقاط المرورية والأمنية"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>فاتورة العبور</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('thermal')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'thermal'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={printMode === 'thermal' ? { backgroundColor: '#030164' } : undefined}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>معاينة حراري (80mm)</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('debt-claim')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'debt-claim'
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              style={printMode === 'debt-claim' ? { backgroundColor: '#030164' } : undefined}
              title="كشف المديونية - معاينة كشف مديونية ومطالبة مالية للمشتري نفسه"
            >
              <Users className="w-3.5 h-3.5" />
              <span>كشف المديونية</span>
            </button>
          </div>

          {/* Party Role Selector: صياد أو بائع */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300 text-xs shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 px-1 select-none">
              مسمى الطرف:
            </span>
            <button
              id="buyer-statement-role-fisherman-btn"
              type="button"
              onClick={() => setSellerRole('fisherman')}
              className={`px-3 py-1 text-xs font-black rounded-none transition-all cursor-pointer flex items-center justify-center ${
                sellerRole === 'fisherman'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="تحديد مسمى 'صياد' في الفاتورة والطباعة"
            >
              <span>صياد</span>
            </button>
            <button
              id="buyer-statement-role-seller-btn"
              type="button"
              onClick={() => setSellerRole('seller')}
              className={`px-3 py-1 text-xs font-black rounded-none transition-all cursor-pointer flex items-center justify-center ${
                sellerRole === 'seller'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="تحديد مسمى 'بائع' في الفاتورة والطباعة"
            >
              <span>بائع</span>
            </button>
          </div>

          {onOpenAllDebtorsModal && (
            <button
              type="button"
              onClick={onOpenAllDebtorsModal}
              className="px-2.5 py-1.5 rounded-none border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold inline-flex items-center gap-1 transition-all cursor-pointer"
              title="فتح كشف ديون كافة المشترين في نافذة مستقلة"
            >
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>كافة المشترين ↗</span>
            </button>
          )}

          {/* Dedicated Direct Print & Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Smart Unified Print Button (A4 / Thermal / Transit / Invoice / Debt-claim according to printMode) */}
            <button
              id="buyer-statement-print-btn"
              type="button"
              disabled={isPrintingA4}
              onClick={handleSmartPrint}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                printMode === 'transit'
                  ? 'bg-purple-700 hover:bg-purple-800 border border-purple-800'
                  : printMode === 'thermal'
                  ? 'bg-blue-600 hover:bg-blue-700 border border-blue-700'
                  : printMode === 'invoice'
                  ? 'bg-blue-600 hover:bg-blue-700 border border-blue-700'
                  : printMode === 'debt-claim'
                  ? 'bg-red-700 hover:bg-red-800 border border-red-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700'
              }`}
              title={
                printMode === 'debt-claim'
                  ? 'طباعة كشف مديونية ومطالبة مالية للمشتري بدقة عالية A4 [Ctrl+P]'
                  : printMode === 'transit'
                  ? 'طباعة فاتورة العبور وسند مبيعات النقاط المرورية والأمنية [Ctrl+P]'
                  : printMode === 'thermal'
                  ? 'طباعة كشف حساب المشتري فوراً على الطابعة الحرارية 80mm [Ctrl+P]'
                  : printMode === 'invoice'
                  ? 'طباعة فاتورة المشتري الرسمية الشاملة بدقة عالية A4 [Ctrl+P]'
                  : 'طباعة كشف حساب ومطالبة المشتري فوراً بدقة عالية A4 [Ctrl+P]'
              }
            >
              {isPrintingA4 ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>طباعة</span>
            </button>

            {/* Dynamic PDF Download Button according to active printMode */}
            <button
              id="buyer-statement-download-pdf-btn"
              type="button"
              disabled={isDownloadingPdf}
              onClick={handleDownloadPdf}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                printMode === 'debt-claim'
                  ? 'bg-red-700 hover:bg-red-800 border border-red-800'
                  : printMode === 'transit'
                  ? 'bg-purple-700 hover:bg-purple-800 border border-purple-800'
                  : printMode === 'thermal'
                  ? 'bg-blue-700 hover:bg-blue-800 border border-blue-800'
                  : 'bg-indigo-600 hover:bg-indigo-700 border border-indigo-700'
              }`}
              title={
                printMode === 'debt-claim'
                  ? 'تحميل كشف مديونية ومطالبة مالية للمشتري بصيغة PDF واختيار مكان الحفظ'
                  : printMode === 'transit'
                  ? 'تحميل فاتورة العبور (سند مبيعات نقدية سمكية) بصيغة PDF واختيار مكان الحفظ'
                  : printMode === 'thermal'
                  ? 'تحميل إيصال المشتري الحراري بصيغة PDF واختيار مكان الحفظ'
                  : printMode === 'invoice'
                  ? 'تحميل فاتورة المشتري الرسمية الشاملة بصيغة PDF واختيار مكان الحفظ'
                  : 'تحميل كشف حساب ومطالبة المشتري بصيغة PDF واختيار مكان الحفظ'
              }
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : printMode === 'transit' ? (
                <Truck className="w-4 h-4" />
              ) : printMode === 'thermal' ? (
                <Receipt className="w-4 h-4" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>تحميل</span>
            </button>

            {/* WhatsApp Send Statement Button */}
            <button
              id="buyer-statement-whatsapp-btn"
              type="button"
              disabled={isSendingWhatsApp}
              onClick={handleSendWhatsAppStatement}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-[#25D366] hover:bg-[#20ba59] text-white shadow-xs transition-all cursor-pointer active:scale-95 border border-emerald-600 disabled:opacity-50"
              title="إرسال كشف حساب ومطالبة المشتري كملف PDF رسمي مباشرة عبر WhatsApp"
            >
              {isSendingWhatsApp ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <WhatsAppIcon size={16} />
              )}
              <span>WhatsApp</span>
            </button>

            {/* Three Dots (⋮) Share Options (LocalSend, Bluetooth, Apps, Copy) */}
            <ShareOptionsDropdown
              id="buyer-statement-share-menu-btn"
              onShare={handleShareStatement}
              isSharing={isSharing}
              buttonLabel="مشاركة ⋮"
              buttonClassName="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              menuTitle="مشاركة كشف حساب المشتري (PDF)"
            />

            {/* Quick Service Invoice Button (فاتورة خدمية رسمية لمبيعات الأسماك) */}
            {salesTransactions && salesTransactions.length > 0 && onOpenServiceInvoice && (
              <button
                type="button"
                onClick={onOpenServiceInvoice}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-indigo-700 hover:bg-indigo-800 text-white shadow-xs transition-all cursor-pointer active:scale-95 border border-indigo-800"
                title="معاينة وطباعة الفاتورة الخدمية الرسمية لمبيعات هذا العميل من الأسماك كبائع"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>فاتورة خدمية</span>
              </button>
            )}

            {/* Quick Manual Clearing Button (مقاصة وتسوية بيعات المشتري) */}
            {salesTransactions && salesTransactions.length > 0 && onOpenOffsetModal && (
              <button
                type="button"
                onClick={onOpenOffsetModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-purple-700 hover:bg-purple-800 text-white shadow-xs transition-all cursor-pointer active:scale-95 border border-purple-800"
                title="إجراء مقاصة يدوية بين ديون الشروات ومستحقات بيعات الأسماك"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>إجراء مقاصة بيعات</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="إغلاق [Esc]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Official A4 Mode */}
      {printMode === 'official' && (
        <div
          className="printable-statement-area relative w-full max-w-5xl bg-white text-slate-900 rounded-none shadow-xl border border-slate-300 p-4 sm:p-6 mb-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full print:transform-none transition-transform duration-150"
          style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif", paddingLeft: '8px' }}
        >
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* Right: Market Info (Arabic) */}
              <div className="text-right leading-tight min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">{settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
                <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-1 whitespace-nowrap">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                  {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}{settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}
                </p>
              </div>

              {/* Center: Fixed Size Logo Exactly in Dead Center */}
              <div className="text-center flex flex-col items-center justify-center px-2">
                <img
                  src="/logo.png"
                  alt="شعار السوق"
                  className="w-[115px] h-[115px] min-w-[115px] min-h-[115px] max-w-[115px] max-h-[115px] object-contain block mx-auto drop-shadow-xs print:w-[115px] print:h-[115px]"
                  style={{ width: '115px', height: '115px', minWidth: '115px', minHeight: '115px', maxWidth: '115px', maxHeight: '115px' }}
                />
                <div className="mt-1 text-sm sm:text-base font-black text-slate-900 text-center tracking-tight whitespace-nowrap">
                  كشف حساب مشتريات ومطالبة سداد
                </div>
              </div>

              {/* Left: English Market Info (LTR) */}
              <div className="text-left leading-tight font-sans min-w-0" dir="ltr">
                <h2 className="text-xs sm:text-sm md:text-base font-black tracking-tight text-slate-900 whitespace-nowrap">
                  Ain Bamaabad Central Market
                </h2>
                <p className="text-[10px] sm:text-xs text-slate-700 font-bold mt-1 whitespace-nowrap">
                  For Fresh Fish, Vegetables & Fruits
                </p>
                <p className="text-[9px] sm:text-[11px] text-slate-500 font-semibold mt-1 whitespace-nowrap">
                  Shabwa'a - Radoum - Ain Bamaabad | Mob: {settings.contactPhone || '782191112'}
                </p>
              </div>
            </div>
          </div>

          {/* Unified Document & Metadata Bar */}
          <div className="bg-slate-50 rounded-none border border-slate-300 p-3 mb-5 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-slate-900 text-white px-3 py-1 rounded-none font-black text-xs">
                كشف حساب مشتريات ومطالبة سداد
              </span>
              <div className="border-2 border-slate-900 px-3 py-1 rounded-none bg-white">
                <span className="text-xs font-bold text-slate-600 ml-1.5">رقم الكشف / المطالبة:</span>
                <span className="font-mono font-black text-slate-900 text-sm">{voucherNumber}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-600">
              <div>التاريخ: <span className="font-black text-slate-900">{todayDateStr}</span></div>
              <div>الوقت: <span className="font-black text-slate-900">{todayTimeStr}</span></div>
              <div className="bg-slate-200/80 px-2.5 py-0.5 rounded text-slate-800 font-sans font-bold">
                الفترة: {customFilterLabel || timeframeLabels[timeframe]}
              </div>
            </div>
          </div>

          <div className={`grid gap-3 p-3 bg-slate-50 border border-slate-300 rounded-none mb-6 text-xs ${
            salesMetrics.count > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
          }`}>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold whitespace-nowrap">المشتري:</span>
              <span className="font-black text-slate-900 text-sm">{buyer?.name || 'غير محدد'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold whitespace-nowrap">رقم الهاتف:</span>
              <span className="font-mono font-bold text-slate-800 text-sm">{buyer?.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold whitespace-nowrap">عدد الشروات (مشتريات):</span>
              <span className="font-black text-blue-700 text-sm">{buyerMetrics.count} شروة</span>
            </div>
            {salesMetrics.count > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold whitespace-nowrap">عدد البيعات (كمورد/بائع):</span>
                <span className="font-black text-emerald-700 text-sm">{salesMetrics.count} بيعة</span>
              </div>
            )}
          </div>

          <div className="mb-3 overflow-x-auto">
            <table className="w-full table-fixed text-right text-[11px] leading-tight border border-slate-300">
              <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                <tr>
                  <th className="p-1 border-l border-slate-300 w-8 text-center">م</th>
                  <th className="p-1 border-l border-slate-300 w-20 text-center">رقم الفاتورة</th>
                  <th className="p-1 border-l border-slate-300 w-24">التاريخ واليوم</th>
                  <th className="p-1 border-l border-slate-300 w-32">الصياد</th>
                  <th className="p-1 border-l border-slate-300">الصنف</th>
                  <th className="p-1 border-l border-slate-300 w-12 text-center">الكمية</th>
                  <th className="p-1 border-l border-slate-300 w-12 text-center">الوحدة</th>
                  <th className="p-1 border-l border-slate-300 w-20 text-center">سعر الحبة</th>
                  <th className="p-1 border-l border-slate-300 w-20 text-center">الضريبة (+2%)</th>
                  <th className="p-1 text-center bg-red-100 text-red-800 w-24">المطلوب سداده</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-400 font-medium">
                      لا توجد عمليات مسجلة لهذا المشتري في الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t, index) => {
                    const resoldInfo = getResoldDetails(t);
                    const isResoldSettled = resoldInfo.isResold && resoldInfo.isSettled;
                    const rem = isResoldSettled ? 0 : getTransactionBuyerDebt(t);
                    const dateKey = t.dateStr || formatGregorianDate(t.timestamp);
                    const previousDateKey = index > 0
                      ? (transactions[index - 1].dateStr || formatGregorianDate(transactions[index - 1].timestamp))
                      : '';
                    const showDateSeparator = index === 0 || dateKey !== previousDateKey;
                    const weekday = getWeekdayName(t.timestamp, t.dateStr);
                    const dateLabel = `${weekday ? `${weekday}، ` : ''}${formatDisplayDate(t.timestamp, t.dateStr)}`;

                    return (
                      <React.Fragment key={t.id}>
                        {showDateSeparator && (
                          <tr>
                            <td colSpan={10} className="bg-blue-100 border-y border-blue-300 p-0.5 text-center">
                              <span className="text-[10px] font-black text-blue-900 leading-none">{dateLabel}</span>
                            </td>
                          </tr>
                        )}
                        <tr className="hover:bg-slate-50">
                        <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-500">
                          {index + 1}
                        </td>
                        <td className="p-1 border-l border-slate-300 font-mono font-bold text-blue-700">
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
                        <td className="p-1 border-l border-slate-300 text-slate-700 font-bold text-xs">
                          {getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}{formatDisplayDate(t.timestamp, t.dateStr)} <span className="font-mono font-normal text-slate-400 text-[10px]">({t.timeStr})</span>
                        </td>
                        <td className="p-1 border-l border-slate-300 font-bold text-slate-800 min-w-[170px] leading-tight">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{t.sellerName}</span>
                            {(t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) && (
                              <span className="text-[10px] font-bold text-purple-700">
                                (إعادة بيع شروة)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-1 border-l border-slate-300 font-bold text-slate-900">
                          {t.items && t.items.length > 0 ? (
                            t.items.length === 1 ? (
                              <span className="font-black text-slate-950 text-xs">{t.items[0].fishName}</span>
                            ) : (
                              <div className="space-y-0.5">
                                {t.items.map((it, idx) => (
                                  <div key={idx} className="font-black text-slate-950 text-xs border-b border-slate-100 last:border-0 pb-0.5">
                                    {it.fishName}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 font-normal">أسماك منوعة</span>
                          )}
                        </td>
                        <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-900">
                          {t.items && t.items.length > 0 ? (
                            t.items.length === 1 ? (
                              <span>{t.items[0].quantity}</span>
                            ) : (
                              <div className="space-y-0.5">
                                {t.items.map((it, idx) => (
                                  <div key={idx} className="border-b border-slate-100 last:border-0 pb-0.5">
                                    {it.quantity}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="p-1 border-l border-slate-300 text-center text-slate-600 font-medium">
                          {t.items && t.items.length > 0 ? (
                            t.items.length === 1 ? (
                              <span>{t.items[0].unit || 'كجم'}</span>
                            ) : (
                              <div className="space-y-0.5">
                                {t.items.map((it, idx) => (
                                  <div key={idx} className="border-b border-slate-100 last:border-0 pb-0.5">
                                    {it.unit || 'كجم'}
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (
                            <span>-</span>
                          )}
                        </td>
                        <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-900">
                          {t.items && t.items.length > 1 ? (
                            <div className="space-y-0.5 py-0.5">
                              {t.items.map((it, idx) => {
                                const unitPrice = it.unitPrice || (it.quantity ? it.totalGross / it.quantity : it.totalGross);
                                return (
                                  <div key={idx} className="border-b border-slate-100 last:border-0 pb-0.5 font-bold">
                                    {formatNumber(unitPrice)}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span>
                              {formatNumber(
                                t.items?.[0]?.unitPrice ||
                                (t.items?.[0]?.quantity ? t.items[0].totalGross / t.items[0].quantity : t.grossAmount)
                              )}
                            </span>
                          )}
                        </td>
                        <td className="p-1 border-l border-slate-300 text-center">
                          {t.items && t.items.length > 1 ? (
                            <div className="space-y-0.5 py-0.5">
                              {t.items.map((it, idx) => {
                                const taxRate = t.buyerTaxRate !== undefined ? t.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
                                const itemTax = it.totalGross * taxRate;
                                return (
                                  <div key={idx} className="border-b border-slate-100 last:border-0 pb-0.5 font-mono font-bold text-blue-800 text-xs">
                                    +{formatNumber(itemTax)}
                                  </div>
                                );
                              })}
                              <div className="pt-0.5 border-t border-blue-300 font-mono font-black text-blue-950 text-xs">
                                +{formatNumber(t.buyerTaxAmount)}
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono font-bold text-blue-700 text-xs">
                              +{formatNumber(t.buyerTaxAmount)}
                            </span>
                          )}
                        </td>
                        <td className={`p-2 text-center ${resoldInfo.isResold ? (isResoldSettled ? 'bg-purple-50/40' : 'bg-amber-50/70') : rem <= 0 ? 'bg-emerald-50/40' : rem < t.totalFromBuyer ? 'bg-amber-50/60' : 'bg-red-50/70'}`}>
                          {resoldInfo.isResold ? (
                            <div className="space-y-0.5">
                              <div className={`font-mono font-black ${isResoldSettled ? 'text-purple-900' : 'text-amber-900'}`}>
                                {formatNumber(t.totalFromBuyer)}
                              </div>
                              {isResoldSettled ? (
                                <div className="text-[9px] font-bold text-purple-700 mt-0.5 space-y-0.5">
                                  <div>تمت التسوية بسداد إعادة البيع ✓</div>
                                  {resoldInfo.newBuyerName && <div className="text-[8px] text-purple-900">لـ ({resoldInfo.newBuyerName})</div>}
                                </div>
                              ) : (
                                <div className="text-[9px] font-bold text-amber-800 mt-0.5 space-y-0.5">
                                  <div>إعادة بيع (معلقة حتى سداد الجديد)</div>
                                  {resoldInfo.newBuyerName && <div className="text-[8px] text-slate-700">لـ ({resoldInfo.newBuyerName})</div>}
                                  <div className="text-red-600 font-black">متبقي ديناً: {formatNumber(rem)}</div>
                                </div>
                              )}
                            </div>
                          ) : rem <= 0 ? (
                            <div className="space-y-0.5">
                              <div className="font-mono font-black text-slate-800">
                                {formatNumber(t.totalFromBuyer)}
                              </div>
                              {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                <div className="text-[9px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 mt-0.5 font-sans">
                                  خصم من القدمة: -{formatNumber(t.buyerAdvanceUsed)}
                                </div>
                              )}
                              <div className="text-[9px] font-bold text-emerald-700 mt-0.5">
                                {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && t.buyerAdvanceUsed < t.totalFromBuyer
                                  ? 'تم سداد ما تبقى بالكامل ✓'
                                  : 'تم السداد بالكامل ✓'}
                              </div>
                            </div>
                          ) : rem < t.totalFromBuyer ? (
                            <div className="space-y-0.5">
                              {/* المبلغ المتبقي ديناً واضح وبارز */}
                              <div className="inline-block px-2 py-0.5 rounded-none bg-red-100/90 border border-red-300 text-red-700 font-mono font-black text-[11px] shadow-2xs">
                                متبقي: {formatNumber(rem)}
                              </div>
                              {/* إجمالي الفاتورة الأساسية بلون خافت وهادئ */}
                              <div className="text-[10px] font-medium text-slate-500 font-mono" title="إجمالي الفاتورة الأصلية">
                                الأصل: {formatNumber(t.totalFromBuyer)}
                              </div>
                              {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                <div className="text-[9px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 font-sans">
                                  خصم من القدمة: -{formatNumber(t.buyerAdvanceUsed)}
                                </div>
                              )}
                              <div className="text-[9px] font-bold text-amber-700">
                                سداد جزئي
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="font-mono font-black text-red-600">
                                {formatNumber(t.totalFromBuyer)}
                              </div>
                              {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                                <div className="text-[9px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 mt-0.5 font-sans">
                                  خصم من القدمة: -{formatNumber(t.buyerAdvanceUsed)}
                                </div>
                              )}
                              <div className="text-[9px] font-bold text-red-600 mt-0.5">
                                دين آجل بالكامل
                              </div>
                            </div>
                          )}
                        </td>
                        </tr>
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* جدول بيعات هذا المشتري للآخرين كـ بائع */}
          {salesTransactions && salesTransactions.length > 0 && (
            <div className="mb-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  <span>مبيعات {buyer?.name || ''}</span>
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-emerald-800 font-mono bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    {salesMetrics.count} بيعات | صافي المستحق: {formatCurrency(salesMetrics.netTotal, settings.currency)} {salesMetrics.surplusTotal > 0 ? `| إجمالي الفائض: +${formatCurrency(salesMetrics.surplusTotal, settings.currency)}` : ''}
                  </span>
                </div>
              </div>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-emerald-50 text-slate-800 font-black border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center">م</th>
                    <th className="p-2 border-l border-slate-300">رقم الفاتورة</th>
                    <th className="p-2 border-l border-slate-300">التاريخ واليوم</th>
                    <th className="p-2 border-l border-slate-300">المشتري منه</th>
                    <th className="p-2 border-l border-slate-300">الأسماك والكميات</th>
                    <th className="p-2 border-l border-slate-300 text-center">القيمة الأساسية</th>
                    <th className="p-2 border-l border-slate-300 text-center">خصم العمولة (2%-)</th>
                    <th className="p-2 border-l border-slate-300 text-center bg-teal-50 text-teal-900">الفائض</th>
                    <th className="p-2 text-center bg-emerald-100 text-emerald-900">صافي المستحق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {salesTransactions.map((t, idx) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-2 border-l border-slate-300 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-2 border-l border-slate-300 font-mono font-bold text-slate-900">
                        <div>{t.id}</div>
                        {t.resaleSurplus && t.resaleSurplus > 0 ? (
                          <div className="text-[10px] text-teal-800 font-bold font-sans">
                            فائض: +{formatCurrency(t.resaleSurplus, settings.currency)}
                          </div>
                        ) : null}
                      </td>
                      <td className="p-2 border-l border-slate-300 text-slate-700">
                        <div>{formatDisplayDate(t.dateStr)}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{t.timeStr || ''}</div>
                      </td>
                      <td className="p-2 border-l border-slate-300 font-bold text-slate-900">{t.buyerName}</td>
                      <td className="p-2 border-l border-slate-300">
                        {t.items.map((it, i) => (
                          <div key={i} className="text-[11px]">
                            {it.fishName} ({it.quantity} {it.unit} × {formatCurrency(it.unitPrice, '')})
                          </div>
                        ))}
                      </td>
                      <td className="p-2 border-l border-slate-300 text-center font-mono font-bold text-slate-800">
                        {formatNumber(t.grossAmount)}
                      </td>
                      <td className="p-2 border-l border-slate-300 text-center font-mono font-bold text-rose-600 bg-rose-50/50">
                        -{formatNumber(t.sellerTaxAmount)}
                      </td>
                      <td className="p-2 border-l border-slate-300 text-center font-mono font-bold">
                        {t.resaleSurplus && t.resaleSurplus > 0 ? (
                          <span className="text-emerald-700 font-black">
                            +{formatNumber(t.resaleSurplus)}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">-</span>
                        )}
                      </td>
                      <td className="p-2 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                        {formatNumber(t.netToSeller)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* جدول سندات وعمليات السداد والتحصيل */}
          {repayments.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <HandCoins className="w-4 h-4 text-emerald-600" />
                  <span>سجل وسندات عمليات السداد والتحصيل المالية:</span>
                </h4>
                <span className="text-[11px] font-bold text-emerald-800 font-mono bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  إجمالي المسدد: {formatCurrency(totalRepayments, settings.currency)} ({repayments.length} سندات)
                </span>
              </div>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-emerald-50 text-emerald-950 font-black border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center">م</th>
                    <th className="p-2 border-l border-slate-300">رقم السند</th>
                    <th className="p-2 border-l border-slate-300">تاريخ ووقت السداد</th>
                    <th className="p-2 border-l border-slate-300 text-center">المبلغ المسدد</th>
                    <th className="p-2 border-l border-slate-300">البيان / الملاحظات</th>
                    <th className="p-2 border-l border-slate-300 text-center">المستلم / أمين الصندوق</th>
                    {onDeleteCashEntry && <th className="p-2 text-center no-print w-16">إجراء</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {repayments.map((r, idx) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="p-1 border-l border-slate-300 font-mono font-bold text-emerald-700">
                        {r.id}
                      </td>
                      <td className="p-1 border-l border-slate-300 font-mono text-slate-600 text-[11px]">
                        {r.dateStr} - {r.timeStr}
                      </td>
                      <td className="p-1 border-l border-slate-300 text-center font-mono font-black text-emerald-800 bg-emerald-50/50">
                        {formatNumber(r.amount)}
                      </td>
                      <td className="p-1 border-l border-slate-300 text-slate-700">
                        {r.description || 'سداد دين مالي لصالح الجمعية'}
                      </td>
                      <td className="p-1 text-center text-slate-600 font-medium">
                        {r.performedBy || 'أمين الصندوق'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* جدول حركات وسندات رصيد القدمة والعربون */}
          {advanceEntries.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-blue-600" />
                  <span>سجل حركات وسندات رصيد القدمة والعربون:</span>
                </h4>
                <span className="text-[11px] font-bold text-blue-800 font-mono bg-blue-50 border border-blue-300 px-2 py-0.5 rounded">
                  رصيد القدمة المتاح حالياً: {formatCurrency(advanceBalance, settings.currency)}
                </span>
              </div>
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-blue-50 text-blue-950 font-black border-b border-slate-300">
                  <tr>
                    <th className="p-2 border-l border-slate-300 w-10 text-center whitespace-nowrap">م</th>
                    <th className="p-2 border-l border-slate-300 whitespace-nowrap">رقم السند</th>
                    <th className="p-2 border-l border-slate-300 whitespace-nowrap">التاريخ والوقت</th>
                    <th className="p-2 border-l border-slate-300 whitespace-nowrap">نوع الحركة</th>
                    <th className="p-2 border-l border-slate-300 text-center whitespace-nowrap">المبلغ</th>
                    <th className="p-2 border-l border-slate-300">البيان / التفاصيل</th>
                    <th className="p-2 text-center whitespace-nowrap">المستلم / المحصل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {advanceEntries.map((adv, idx) => (
                    <tr key={adv.id} className="hover:bg-slate-50">
                      <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-500 whitespace-nowrap">
                        {idx + 1}
                      </td>
                      <td className="p-1 border-l border-slate-300 font-mono font-bold text-blue-700 whitespace-nowrap">
                        {adv.id}
                      </td>
                      <td className="p-1 border-l border-slate-300 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                        {adv.dateStr} - {adv.timeStr}
                      </td>
                      <td className="p-1 border-l border-slate-300 font-bold whitespace-nowrap text-xs">
                        {adv.type === 'buyer_advance_deposit' ? (
                          <span className="text-emerald-700">قبض دفعة مقدمة (+)</span>
                        ) : adv.type === 'buyer_advance_refund' ? (
                          <span className="text-rose-700">استرداد دفعة مقدمة (-)</span>
                        ) : adv.type === 'advance_debt_settlement' ? (
                          <span className="text-amber-800">سداد دين من القدمة</span>
                        ) : (
                          <span className="text-slate-700">{adv.category || 'حركة قدمة'}</span>
                        )}
                      </td>
                      <td className="p-1 border-l border-slate-300 text-center font-mono font-black text-slate-900 whitespace-nowrap">
                        {formatNumber(adv.amount)}
                      </td>
                      <td className="p-1 border-l border-slate-300 text-slate-700">
                        {adv.description || adv.category || 'حركة رصيد قدمة'}
                      </td>
                      <td className="p-1 text-center text-slate-600 font-medium whitespace-nowrap">
                        {adv.performedBy || 'أمين الصندوق'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* صندوق ملخص الحساب المالي - على كامل عرض الفاتورة بحواف حادة */}
          <div className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 mb-2 space-y-0.5 text-xs">
            <div className="flex justify-between items-center pb-1 border-b border-slate-300">
              <span className="text-slate-700 font-bold">إجمالي قيمة المشتريات الأساسية:</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {formatCurrency(buyerMetrics.grossTotal, settings.currency)}
              </span>
            </div>
            <div className="flex justify-between items-center pb-1 border-b border-slate-300">
              <span className="text-blue-700 font-bold">ضريبة وعمولة الحراج (+2%):</span>
              <span className="font-mono font-bold text-blue-700 text-sm">
                +{formatCurrency(buyerMetrics.taxTotal, settings.currency)}
              </span>
            </div>
            <div className="flex justify-between items-center pb-1 border-b border-slate-300">
              <span className="text-slate-900 font-black">إجمالي الفواتير الكلي (+2%):</span>
              <span className="font-mono font-black text-slate-900 text-sm">
                {formatCurrency(buyerMetrics.finalTotal, settings.currency)}
              </span>
            </div>
            {salesMetrics.count > 0 && (
              <div className="flex justify-between items-center pb-1 border-b border-slate-300 text-emerald-800 bg-emerald-50/60 px-2 py-1">
                <span className="font-bold">صافي مبيعاته للآخرين (كـ بائع بعد خصم 2%):</span>
                <span className="font-mono font-black text-sm">
                  +{formatCurrency(salesMetrics.netTotal, settings.currency)}
                </span>
              </div>
            )}
            {salesMetrics.surplusTotal > 0 && (
              <div className="flex justify-between items-center pb-1 border-b border-slate-300 text-teal-800 bg-teal-50/60 px-2 py-1">
                <span className="font-bold">إجمالي الفائض المحقق من البيعات:</span>
                <span className="font-mono font-black text-sm">
                  +{formatCurrency(salesMetrics.surplusTotal, settings.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pb-1 border-b border-slate-300 text-emerald-700">
              <span className="font-bold">المسدد نقداً حتى الآن:</span>
              <span className="font-mono font-bold text-sm">
                {formatCurrency(debtMetrics.totalPaid, settings.currency)}
              </span>
            </div>
            {advanceBalance > 0 && (
              <div className="flex justify-between items-center pb-1 border-b border-slate-300 text-blue-800">
                <span className="font-bold">رصيد القدمة المتاح حالياً:</span>
                <span className="font-mono font-bold text-sm">
                  {formatCurrency(advanceBalance, settings.currency)}
                </span>
              </div>
            )}
            <div className={`flex ${debtMetrics.totalRemaining > 0 ? 'justify-between' : 'justify-center'} items-center p-2 rounded-none ${
              debtMetrics.totalRemaining > 0
                ? 'bg-rose-600 text-white'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
            }`}>
              {debtMetrics.totalRemaining > 0 && (
                <span className="font-black text-sm">
                  الرصيد المتبقي ديناً على المشتري:
                </span>
              )}
              <span className="font-mono font-black text-base">
                {debtMetrics.totalRemaining > 0
                  ? formatCurrency(debtMetrics.totalRemaining, settings.currency)
                  : 'مسدد بالكامل ✓'}
              </span>
            </div>
            {(advanceBalance > 0 || totalSurplus > 0) && (
              <div className={`flex justify-between items-center p-2 rounded-none border text-xs font-bold ${
                advanceBalance >= debtMetrics.totalRemaining
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span>صافي المركز المالي للمشتري (بعد احتساب رصيد القدمة):</span>
                  {totalSurplus > 0 && (
                    <span className="text-emerald-950 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded text-[11px] font-black">
                      فائض الشروات: +{formatCurrency(totalSurplus, settings.currency)}
                    </span>
                  )}
                </div>
                <span className="font-mono font-black text-sm">
                  {advanceBalance >= debtMetrics.totalRemaining
                    ? `دائن بفائض: ${formatCurrency(advanceBalance - debtMetrics.totalRemaining, settings.currency)}`
                    : `مدين بمتبقي: ${formatCurrency(debtMetrics.totalRemaining - advanceBalance, settings.currency)}`}
                </span>
              </div>
            )}
          </div>

          {/* حالة التصفية أو التفقيط أسفل المربع بحواف حادة ولون أخضر خافت */}
          {debtMetrics.totalRemaining <= 0 ? (
            <div className="text-center font-extrabold text-xs sm:text-sm py-2 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-none mb-6">
              تم سداد وتصفية كامل فواتير وشروات المشتري خالص 100% ✓
            </div>
          ) : (
            <div className="text-center font-bold text-xs py-2 px-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-none mb-6">
              <span>المبلغ المتبقي ديناً كتابةً: <strong>{tafqeet(debtMetrics.totalRemaining, settings.currency)}</strong></span>
              <span className="block mt-0.5 text-[11px] text-rose-600">* يرجى سرعة سداد الرصيد المتبقي لصندوق الحراج لتسوية الحساب المالي.</span>
            </div>
          )}

          <div className="border-t-2 border-slate-900 pt-6 mt-6">
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-10">توقيع واستلام المشتري:</span>
                <div className="border-b border-dashed border-slate-400 mx-4"></div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-500 font-bold mb-1">ختم السوق الرسمي</span>
                <div className="border border-dashed border-slate-400 rounded-none w-14 h-14 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  ختم السوق
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-10">اعتماد إدارة الحراج والتحصيل:</span>
                <div className="border-b border-dashed border-slate-400 mx-4"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. MULTI-SELLER BUYER INVOICE A4 MODE (فاتورة المشتري الشاملة بتفاصيل البائعين) */}
      {printMode === 'invoice' && (
        <div className="printable-statement-area w-full max-w-4xl bg-white text-slate-900 rounded-none shadow-xl border border-slate-300 p-4 sm:p-8 mb-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full font-['Cairo',system-ui,sans-serif]">
          {/* Header */}
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* Right: Market Info Arabic */}
              <div className="text-right leading-tight min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">{settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
                <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-1 whitespace-nowrap">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                  {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}{settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}
                </p>
              </div>

              {/* Center: Fixed Size Logo Exactly in Dead Center */}
              <div className="text-center flex flex-col items-center justify-center px-2">
                <img
                  src="/logo.png"
                  alt="شعار السوق"
                  className="w-[95px] h-[95px] min-w-[95px] min-h-[95px] max-w-[95px] max-h-[95px] object-contain block mx-auto drop-shadow-xs print:w-[95px] print:h-[95px]"
                  style={{ width: '95px', height: '95px', minWidth: '95px', minHeight: '95px', maxWidth: '95px', maxHeight: '95px' }}
                />
                <div className="mt-1 text-sm sm:text-base font-black text-slate-900 text-center tracking-tight whitespace-nowrap">
                  فاتورة المشتري
                </div>
              </div>

              {/* Left: English Market Info (LTR) */}
              <div className="text-left leading-tight font-sans min-w-0" dir="ltr">
                <h2 className="text-xs sm:text-sm md:text-base font-black tracking-tight text-slate-900 whitespace-nowrap">
                  Ain Bamaabad Central Market
                </h2>
                <p className="text-[10px] sm:text-xs text-slate-700 font-bold mt-1 whitespace-nowrap">
                  For Fresh Fish, Vegetables & Fruits
                </p>
                <p className="text-[9px] sm:text-[11px] text-slate-500 font-semibold mt-1 whitespace-nowrap">
                  Shabwa'a - Radoum - Ain Bamaabad | Mob: 782191112
                </p>
              </div>
            </div>
          </div>

          {/* Unified Document & Parties Card */}
          <div className="bg-slate-50 rounded-none border border-slate-300 p-3 mb-4 text-xs">
            {/* Top row: Voucher details */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-slate-300">
              <div className="flex items-center gap-2">
                <span className="bg-slate-900 text-white px-2.5 py-0.5 rounded text-[11px] font-black font-sans">
                  فاتورة مبيعات المشتري
                </span>
                <span className="font-mono font-black text-sm text-slate-900 tracking-wider">
                  {voucherNumber}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-600 font-bold">
                <div>
                  <span>التاريخ:</span> <span className="font-mono text-slate-900 font-bold">{todayDateStr}</span>
                </div>
                <div>
                  <span>الوقت:</span> <span className="font-mono text-slate-900 font-bold">{todayTimeStr}</span>
                </div>
              </div>
            </div>

            {/* Bottom row: Buyer details */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">المشتري:</span>
                <span className="font-black text-slate-900 text-sm">{buyer?.name || 'غير محدد'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">حالة الفاتورة:</span>
                <span className={`font-black text-xs ${
                  debtMetrics.totalRemaining <= 0
                    ? 'text-emerald-700'
                    : debtMetrics.totalPaid > 0
                    ? 'text-amber-700'
                    : 'text-red-700'
                }`}>
                  {debtMetrics.totalRemaining <= 0
                    ? 'مسددة بالكامل ✓'
                    : debtMetrics.totalPaid > 0
                    ? 'سداد جزئي'
                    : 'دين آجل بالكامل'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-bold">عدد الشروات / العمليات:</span>
                <span className="font-bold text-slate-800">{buyerMetrics.count} شروة</span>
              </div>
            </div>
          </div>

          {/* Table with Seller column BEFORE fish name: م | البائع / الصياد | الصنف | الكمية | الوحدة | سعر الوحدة | الإجمالي الأساسي */}
          <div className="mb-5 overflow-x-auto">
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-900 text-white font-black border-b border-slate-900">
                <tr>
                  <th className="p-2 border border-slate-700 w-10 text-center">م</th>
                  <th className="p-2 border border-slate-700 w-44 text-right">{sellerRole === 'fisherman' ? 'الصياد' : 'البائع'}</th>
                  <th className="p-2 border border-slate-700 text-right">الصنف</th>
                  <th className="p-2 border border-slate-700 w-20 text-center">الكمية</th>
                  <th className="p-2 border border-slate-700 w-16 text-center">الوحدة</th>
                  <th className="p-2 border border-slate-700 w-28 text-left">سعر الوحدة</th>
                  <th className="p-2 border border-slate-700 w-32 text-left">الإجمالي الأساسي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {purchasedItemsWithSeller.map((it, idx) => (
                  <tr key={`${it.transactionId}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                    <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                    <td className="p-1 border-l border-slate-300 font-bold text-slate-800">{it.sellerName}</td>
                    <td className="p-1 border-l border-slate-300 font-black text-slate-900">{it.fishName}</td>
                    <td className="p-1 border-l border-slate-300 text-center font-mono font-bold">{it.quantity}</td>
                    <td className="p-1 border-l border-slate-300 text-center text-slate-600">{it.unit}</td>
                    <td className="p-1 border-l border-slate-300 text-left font-mono font-bold">{formatNumber(it.unitPrice)}</td>
                    <td className="p-2 text-left font-mono font-black text-slate-900">{formatNumber(it.totalGross)}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, 17 - purchasedItemsWithSeller.length) }).map((_, emptyIdx) => {
                  const rowNumber = purchasedItemsWithSeller.length + emptyIdx + 1;
                  return (
                    <tr key={`empty-row-${emptyIdx}`} className={rowNumber % 2 === 0 ? 'bg-slate-50/40' : 'bg-white'} style={{ height: '30px' }}>
                      <td className="p-1 border-l border-slate-300 text-center font-mono font-bold text-slate-300">{rowNumber}</td>
                      <td className="p-1 border-l border-slate-300">&nbsp;</td>
                      <td className="p-1 border-l border-slate-300">&nbsp;</td>
                      <td className="p-1 border-l border-slate-300">&nbsp;</td>
                      <td className="p-1 border-l border-slate-300">&nbsp;</td>
                      <td className="p-1 border-l border-slate-300">&nbsp;</td>
                      <td className="p-2">&nbsp;</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black border-t-2 border-slate-900">
                  <td colSpan={6} className="p-2 text-left text-slate-900 font-black">إجمالي قيمة المبيعات الأساسية:</td>
                  <td className="p-2 text-left font-mono font-black text-slate-900 text-sm">{formatCurrency(buyerMetrics.grossTotal, settings.currency)}</td>
                </tr>
                <tr className="bg-white font-bold border-t border-slate-300 text-sky-800">
                  <td colSpan={6} className="p-2 text-left">عمولة وضريبة المشتري (+{Math.round((settings.buyerTaxRate ?? 0.02) * 100)}%):</td>
                  <td className="p-2 text-left font-mono font-bold text-sm">+{formatCurrency(buyerMetrics.taxTotal, settings.currency)}</td>
                </tr>
                <tr className="bg-white font-black border-t border-slate-300 text-sky-900">
                  <td colSpan={6} className="p-2 text-left font-black text-sm">الإجمالي المطلوب من المشتري:</td>
                  <td className="p-2 text-left font-mono font-black text-sm text-sky-800">{formatCurrency(buyerMetrics.finalTotal, settings.currency)}</td>
                </tr>
              </tfoot>
            </table>
          </div>


          {/* Signatures & Official Stamp */}
          <div className="pt-4 border-t-2 border-slate-900 text-xs">
            <div className="flex items-center justify-between px-10 mb-4 font-bold">
              <div className="flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-500 font-bold mb-1">ختم السوق الرسمي</span>
                <div className="border border-dashed border-slate-400 rounded-none w-14 h-14 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  ختم السوق
                </div>
              </div>
              <div className="space-y-3 text-center w-64">
                <p className="text-slate-700 text-xs font-bold">توقيع مسؤول الصندوق / الإدارة:</p>
                <div className="border-b border-dashed border-slate-400 w-full mx-auto pt-4"></div>
              </div>
            </div>
            <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-slate-300 flex justify-between items-center print:border-black font-sans">
              <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
              <span>شكراً لتعاملكم معنا</span>
              <span className="font-mono">حررت: {todayDateStr} - {todayTimeStr}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. TRANSIT INVOICE MODE (فاتورة العبور - سند مبيعات نقدية سمكية) */}
      {printMode === 'transit' && (
        <div className="printable-statement-area w-full max-w-3xl bg-white text-slate-900 rounded-none shadow-xl border-2 border-slate-800 p-5 sm:p-8 mb-8 print:shadow-none print:border-none print:p-2 print:max-w-full relative font-['Cairo',system-ui,sans-serif]" style={{ paddingLeft: '8px' }}>
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Official Voucher Outer Border */}
          <div className="border border-slate-700 p-4 sm:p-6 rounded-none bg-white">
            {/* Header: Right Arabic, Center Logo, Left English */}
            <div className="flex justify-between items-center pb-3 border-b-2 border-slate-900 gap-2">
              {/* Right: Arabic Info */}
              <div className="text-right text-xs leading-tight w-1/3">
                <h2 className="text-sm sm:text-base font-black text-slate-950">
                  {settings.marketName || 'سوق عين بامعبد المركزي'}
                </h2>
                <p className="text-[10px] sm:text-[11px] font-bold text-slate-800 mt-0.5">
                  {(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-700 mt-0.5">
                  {settings.location || 'م/شبوة م/رضوم / عين بامعبد'}
                </p>
                <p className="text-[10px] text-slate-800 font-mono font-bold mt-0.5">
                  جوال: {settings.contactPhone || '782191112'}
                </p>
              </div>

              {/* Center: Official Seal Logo */}
              <div className="w-1/3 flex flex-col items-center justify-center">
                <img
                  src="/logo.png"
                  alt="شعار سوق عين بامعبد المركزي"
                  className="w-[130px] h-[130px] min-w-[130px] min-h-[130px] max-w-[130px] max-h-[130px] object-contain block mx-auto drop-shadow-sm print:w-[130px] print:h-[130px]"
                  style={{ width: '130px', height: '130px', minWidth: '130px', minHeight: '130px', maxWidth: '130px', maxHeight: '130px' }}
                />
              </div>

              {/* Left: English Info */}
              <div dir="ltr" className="text-left text-xs leading-tight w-1/3 font-sans">
                <h2 className="text-xs sm:text-sm font-black text-slate-950">
                  Ain Ba Ma'abd Central Market
                </h2>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-800 mt-0.5">
                  For Fresh Fish - vegetables and Fruits
                </p>
                <p className="text-[9px] sm:text-[10px] text-slate-700 mt-0.5">
                  Shabwah - Radoom - Ain Ba Ma'abd
                </p>
                <p className="text-[10px] text-slate-800 font-mono font-bold mt-0.5">
                  Mob: {settings.contactPhone || '782191112'}
                </p>
              </div>
            </div>

            {/* Title & Metadata Bar */}
            <div className="pt-3 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300">
              {/* Red Serial Number */}
              <div className="flex items-center gap-1 font-mono">
                <span className="text-rose-600 font-black text-lg tracking-widest print:text-red-700">
                  {transitSerial}
                </span>
              </div>

              {/* Document Title */}
              <div className="text-center">
                <h1 className="text-base sm:text-xl font-black text-slate-950 underline underline-offset-4 decoration-2 decoration-slate-900 tracking-wide">
                  سند مبيعات نقدية سمكية
                </h1>
              </div>

              {/* Date */}
              <div className="text-left text-xs font-bold text-slate-800 font-mono">
                <span>التاريخ: </span>
                <span className="underline decoration-dotted font-black text-sm">
                  {formatGregorianDate(new Date())}
                </span>
                <span> م</span>
              </div>
            </div>

            {/* Buyer Name Line */}
            <div className="py-2.5 flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-900">
              <span className="shrink-0 text-slate-800">اسم المشتري:</span>
              <span className="flex-1 font-black text-blue-950 border-b-2 border-dotted border-slate-700 pb-0.5 px-2 text-sm sm:text-base">
                {buyer?.name || '...................................................'}
              </span>
              <span className="shrink-0 text-slate-800">المحترم</span>
            </div>

            {/* Structured Table */}
            <div className="mt-2 border-2 border-slate-800 rounded-none overflow-hidden text-xs">
              <table className="w-full border-collapse text-right">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-950 font-black border-b-2 border-slate-800 text-center">
                    <th className="py-2 px-1 border-l border-slate-800 w-10">
                      <div>العدد</div>
                      <div className="text-[10px] font-mono font-normal">No</div>
                    </th>
                    <th className="py-2 px-2 border-l border-slate-800 text-right">
                      <div>الصنف والتفاصيل</div>
                      <div className="text-[10px] font-mono font-normal">Description &amp; class</div>
                    </th>
                    <th className="py-2 px-2 border-l border-slate-800 w-24">
                      <div>الكمية</div>
                      <div className="text-[10px] font-mono font-normal">Qty.</div>
                    </th>
                    <th className="py-2 px-2 border-l border-slate-800 w-28 text-center">
                      <div>سعر الوحدة</div>
                      <div className="text-[10px] font-mono font-normal">Unit Price (Y.R)</div>
                    </th>
                    <th className="py-2 px-2 border-slate-800 w-32 text-center">
                      <div>القيمة الإجمالية</div>
                      <div className="text-[10px] font-mono font-normal">Total Amount (Y.R)</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 font-sans">
                  {purchasedItems.map((it, idx) => (
                    <tr key={idx} className="h-9 hover:bg-slate-50 text-slate-900 font-bold">
                      <td className="text-center border-l border-slate-800 font-mono text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-2.5 border-l border-slate-800 font-black text-slate-950 text-sm">
                        {it.fishName}
                      </td>
                      <td className="px-2 text-center border-l border-slate-800 font-mono text-sm">
                        {it.quantity} {it.unit}
                      </td>
                      <td className="border-l border-slate-800 font-mono text-center px-2 text-sm">
                        <span className="font-black">{formatNumber(it.unitPrice)}</span>
                      </td>
                      <td className="font-mono text-center px-2 text-sm">
                        <span className="font-black text-blue-950">{formatNumber(it.totalGross)}</span>
                      </td>
                    </tr>
                  ))}

                  {/* Empty padded rows to mirror the paper booklet */}
                  {Array.from({ length: Math.max(0, 8 - purchasedItems.length) }).map((_, i) => (
                    <tr key={`empty-${i}`} className="h-7 text-slate-300">
                      <td className="text-center border-l border-slate-800 font-mono text-[10px]">
                        {purchasedItems.length + i + 1}
                      </td>
                      <td className="border-l border-slate-800 border-b border-dotted border-slate-300"></td>
                      <td className="border-l border-slate-800 border-b border-dotted border-slate-300"></td>
                      <td className="border-l border-slate-800 border-b border-dotted border-slate-300"></td>
                      <td className="border-b border-dotted border-slate-300"></td>
                    </tr>
                  ))}

                  {/* Total Row (مطابق للنموذج الورقي مع خانة مريحة وواضحة للإجمالي) */}
                  <tr className="bg-slate-100 font-black text-slate-950 border-t-2 border-slate-800 h-11">
                    <td colSpan={3} className="px-4 border-l border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-sm sm:text-base font-black text-slate-950">الإجمالي</span>
                        <span className="text-xs font-mono font-bold text-slate-600">Total</span>
                      </div>
                    </td>
                    <td colSpan={2} className="p-1.5 text-center">
                      <div className="h-9 border-2 border-slate-900 rounded-none bg-white flex items-center justify-center gap-1.5 px-3 shadow-2xs">
                        <span
                          dir="ltr"
                          className="font-mono font-black text-sm sm:text-base text-slate-950 tracking-wider"
                        >
                          {formatNumber(buyerMetrics.grossTotal)}
                        </span>
                        <span className="text-[11px] font-sans font-bold text-slate-700">
                          ريال
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Total Written Out in Words */}
            <div className="mt-3 p-2.5 rounded-none border border-slate-300 bg-slate-50 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">المبلغ الإجمالي بالحروف:</span>
              <span className="font-black text-blue-950 text-sm">
                {tafqeet(buyerMetrics.grossTotal, settings.currency)}
              </span>
            </div>

            {/* Signatures & Stamps Footer */}
            <div className="pt-6 mt-4 border-t border-slate-400 flex justify-between items-end text-xs font-bold text-slate-900">
              <div className="text-center w-1/3">
                <span className="block mb-8 text-slate-700">توقيع المستلم / السائق:</span>
                <div className="border-b border-dashed border-slate-500 mx-4"></div>
              </div>

              <div className="text-center w-1/3 pb-1">
                <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-none flex items-center justify-center mx-auto text-[10px] text-slate-400 select-none">
                  ختم السوق الرسمي
                </div>
              </div>

              <div className="text-center w-1/3">
                <span className="block mb-8 text-slate-700">توقيع المبيعات:</span>
                <div className="border-b-2 border-slate-800 mx-4"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thermal Mode */}
      {printMode === 'thermal' && (
        <div className="printable-receipt-area relative mx-auto max-w-[380px] w-full bg-white text-black p-5 rounded-none shadow-xl font-mono text-[12px] border border-dashed border-slate-300 mb-8 print:shadow-none print:border-none print:p-1 print:max-w-full">
          {/* Horizontal developer credit at bottom of receipt */}
          <div className="invoice-margin-credit" aria-hidden="true" style={{ fontSize: '7.5px', bottom: '4px', left: 0, right: 0, textAlign: 'center' }}>
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          <div className="text-center pb-2 border-b-2 border-black">
            <div className="flex justify-center mb-1.5">
              <img src="/logo.png" alt="الشعار" className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20" />
            </div>
            <h2 className="text-base font-black tracking-tight">{settings.marketName}</h2>
            <p className="text-[11px] font-bold text-gray-700">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
            <div className="mt-2 inline-block px-3 py-0.5 border border-black rounded text-[11px] font-black uppercase bg-black text-white">
              كشف حساب ومطالبة مشتري
            </div>
          </div>

          <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-0.5">
            <div className="flex justify-between">
              <span className="font-bold">رقم الكشف:</span>
              <span className="font-black font-sans">{voucherNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ:</span>
              <span dir="ltr" className="font-sans">{todayDateStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">المشتري:</span>
              <span className="font-black">{buyer?.name || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد الشروات:</span>
              <span className="font-bold">{buyerMetrics.count} شروة</span>
            </div>
          </div>

          <div className="py-2 border-b border-black divide-y divide-gray-300 text-[11px]">
            {transactions.map((t) => (
              <div key={t.id} className="py-2 space-y-0.5">
                <div className="flex justify-between text-[10px] text-gray-600 font-bold">
                  <span className="flex items-center gap-1">
                    <span>شروة: #{t.id}</span>
                    {isTransferredTransaction(t) ? (
                      <span className="text-[9px] font-bold text-purple-700 print:text-black">
                        (محولة)
                      </span>
                    ) : t.isEdited ? (
                      <span className="text-[9px] font-bold text-amber-800 print:text-black">
                        [معدلة]
                      </span>
                    ) : null}
                  </span>
                  <span>{getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}{t.dateStr} {t.timeStr}</span>
                </div>
                <div className="flex justify-between text-[11px] bg-gray-100 p-1 rounded font-bold">
                  <span className="text-gray-700">
                    {t.isResale || Boolean(t.resoldFromTransactionId) || t.notes?.startsWith('إعادة بيع شروة من:') ? 'البائع:' : 'الصياد:'}
                  </span>
                  <span className="font-black text-black">{t.sellerName}</span>
                </div>
                <div className="grid grid-cols-12 font-black text-[10px] pt-1 border-b border-gray-200 text-gray-700">
                  <span className="col-span-4 text-right">نوع السمك</span>
                  <span className="col-span-2 text-center">الكمية</span>
                  <span className="col-span-3 text-center">سعر الحبة</span>
                  <span className="col-span-3 text-left">الإجمالي</span>
                </div>
                {t.items.map((it, idx) => {
                  const taxRate = t.buyerTaxRate !== undefined ? t.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
                  const itemTax = it.totalGross * taxRate;
                  const itemTotalWithTax = it.totalGross + itemTax;
                  const hasMultiple = t.items.length > 1;

                  return (
                    <div key={idx} className="py-1 border-b border-gray-100 last:border-0">
                      <div className="grid grid-cols-12 text-[10px] items-center">
                        <span className="col-span-4 font-bold truncate">{it.fishName}</span>
                        <span className="col-span-2 text-center font-mono">{it.quantity} {it.unit}</span>
                        <span className="col-span-3 text-center font-mono font-bold text-gray-700">{formatCurrency(it.unitPrice, '')}</span>
                        <span className="col-span-3 text-left font-black font-mono">{formatCurrency(it.totalGross, '')}</span>
                      </div>
                      {hasMultiple && (
                        <div className="flex justify-between text-[9px] text-gray-700 px-1 pt-0.5 bg-gray-50 rounded mt-0.5 font-sans">
                          <span>ضريبة (+{Math.round(taxRate * 100)}%): +{formatCurrency(itemTax, '')}</span>
                          <span className="font-bold">المجموع: {formatCurrency(itemTotalWithTax, '')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-gray-200">
                  <span>إجمالي الشروة (+2%):</span>
                  <span className="font-mono text-black">{formatCurrency(t.totalFromBuyer, settings.currency)}</span>
                </div>
                {(() => {
                  const resoldInfo = getResoldDetails(t);
                  if (resoldInfo.isResold) {
                    if (resoldInfo.isSettled) {
                      return (
                        <div className="text-[9px] text-purple-800 bg-purple-50 p-1 rounded mt-0.5 font-bold text-center border border-purple-200">
                          🔄 تمت التسوية بإعادة البيع {resoldInfo.newBuyerName ? `لـ (${resoldInfo.newBuyerName})` : ''} ✓
                        </div>
                      );
                    } else {
                      const curDebt = getTransactionBuyerDebt(t);
                      return (
                        <div className="text-[9px] text-amber-900 bg-amber-50 p-1 rounded mt-0.5 font-bold text-center border border-amber-300 space-y-0.5">
                          <div>🔄 إعادة بيع معلقة {resoldInfo.newBuyerName ? `لـ (${resoldInfo.newBuyerName})` : ''}</div>
                          <div className="text-red-700">المتبقي ديناً: {formatCurrency(curDebt, settings.currency)}</div>
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
                {t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 && (
                  <div className="text-[9px] text-gray-700 bg-gray-50 p-1 rounded space-y-0.5 mt-0.5 font-sans">
                    <div className="flex justify-between text-indigo-900 font-bold">
                      <span>خصم من رصيد القدمة:</span>
                      <span className="font-mono">-{formatCurrency(t.buyerAdvanceUsed, settings.currency)}</span>
                    </div>
                    {(() => {
                      const resoldInfo = getResoldDetails(t);
                      if (resoldInfo.isResold) {
                        return (
                          <div className="text-purple-700 font-bold text-center">
                            تمت التسوية بإعادة البيع {resoldInfo.newBuyerName ? `لـ (${resoldInfo.newBuyerName})` : ''}
                          </div>
                        );
                      }
                      const isPaid = t.paymentStatus === 'paid' || t.paymentStatus === 'settled' || getTransactionBuyerDebt(t) <= 0;
                      const remDebt = getTransactionBuyerDebt(t);
                      if (isPaid || remDebt <= 0) {
                        return (
                          <div className="text-emerald-700 font-bold text-center">
                            تم سداد ما تبقى على المشتري بالكامل ✓
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex justify-between text-red-700 font-bold">
                            <span>المتبقي ديناً:</span>
                            <span className="font-mono">{formatCurrency(remDebt, settings.currency)}</span>
                          </div>
                        );
                      }
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* بيعات المشتري للآخرين في الإيصال الحراري */}
          {salesTransactions && salesTransactions.length > 0 && (
            <div className="py-2 border-b border-black">
              <div className="font-black text-[10px] uppercase mb-1 bg-gray-100 p-0.5 text-center">
                بيعات هذا المشتري للآخرين (كـ بائع):
              </div>
              {salesTransactions.map((st) => (
                <div key={st.id} className="py-1 border-b border-gray-100 last:border-0 text-[10px]">
                  <div className="flex justify-between font-bold">
                    <span>فاتورة #{st.id} ({st.buyerName})</span>
                    <span className="font-mono text-emerald-800">{formatCurrency(st.netToSeller, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-500">
                    <span>إجمالي: {formatCurrency(st.grossAmount, '')} (خصم 2%-)</span>
                    <span>{st.dateStr}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {repayments.length > 0 && (
            <div className="py-2 border-b border-black text-[11px]">
              <div className="font-black text-[10px] uppercase mb-1">سندات السداد والدفعات:</div>
              {repayments.map((r) => (
                <div key={r.id} className="flex justify-between py-0.5 text-[10px]">
                  <span>{r.id} ({r.dateStr})</span>
                  <span className="font-bold text-emerald-800">{formatCurrency(r.amount, settings.currency)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="py-2.5 space-y-0.5 text-[12px]">
            <div className="flex justify-between font-bold">
              <span>قيمة المشتريات:</span>
              <span className="font-mono">{formatCurrency(buyerMetrics.grossTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-800">
              <span>عمولة وضريبة الحراج (2%):</span>
              <span className="font-mono">+{formatCurrency(buyerMetrics.taxTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>إجمالي المطلوب (+2%):</span>
              <span className="font-mono">{formatCurrency(buyerMetrics.finalTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-800">
              <span>المسدد نقداً:</span>
              <span className="font-mono">{formatCurrency(debtMetrics.totalPaid, settings.currency)}</span>
            </div>
            {loanBalance > 0 && (
              <div className="flex justify-between font-bold text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[11px]">
                <span>سلف قائمة بذمة المشتري (استلاف):</span>
                <span className="font-mono font-black">{formatCurrency(loanBalance, settings.currency)}</span>
              </div>
            )}
            {advanceBalance > 0 && (
              <div className="flex justify-between font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                <span>رصيد القدمة المتاح (دائن للمشتري):</span>
                <span className="font-mono font-black">{formatCurrency(advanceBalance, settings.currency)}</span>
              </div>
            )}
            <div className={`pt-2 border-t-2 border-black flex ${debtMetrics.totalRemaining + loanBalance > 0 ? 'justify-between' : 'justify-center'} items-center text-sm font-black p-2 rounded-none ${debtMetrics.totalRemaining + loanBalance > 0
                ? 'bg-rose-100 text-rose-950 border border-rose-300'
                : 'bg-emerald-100 text-emerald-950 border border-emerald-400'
              }`}>
              {debtMetrics.totalRemaining + loanBalance > 0 && (
                <span>إجمالي ديون وسلف المشتري:</span>
              )}
              <span className={`font-mono text-sm font-black ${debtMetrics.totalRemaining + loanBalance > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                {debtMetrics.totalRemaining + loanBalance > 0
                  ? formatCurrency(debtMetrics.totalRemaining + loanBalance, settings.currency)
                  : 'مسدد بالكامل ✓'}
              </span>
            </div>
            {advanceBalance > 0 && (
              <div className="flex justify-between text-[11px] font-bold py-1 border-t border-dashed border-gray-400">
                <span>الصافي بعد خصم القدمة:</span>
                <span className="font-mono">
                  {advanceBalance >= (debtMetrics.totalRemaining + loanBalance)
                    ? `دائن (له): ${formatCurrency(advanceBalance - (debtMetrics.totalRemaining + loanBalance), settings.currency)}`
                    : `مدين (عليه): ${formatCurrency((debtMetrics.totalRemaining + loanBalance) - advanceBalance, settings.currency)}`}
                </span>
              </div>
            )}
          </div>

          <div className={`py-2 text-[10px] text-center font-black border-y border-dashed ${debtMetrics.totalRemaining > 0
              ? 'border-gray-400 text-slate-800'
              : 'border-emerald-400 bg-emerald-50 text-emerald-900'
            }`}>
            {debtMetrics.totalRemaining > 0
              ? tafqeet(debtMetrics.totalRemaining, settings.currency)
              : 'تم سداد وتصفية كامل فواتير وشروات المشتري بنجاح (الحساب خالص 100% ✓)'}
          </div>
        </div>
      )}

      {/* 5. DEBT CLAIM STATEMENT MODE (كشف إجمالي المشترين / كشف مديونية ومطالبة مالية للمشتري نفسه - مطابقة للمستند الرسمي) */}
      {printMode === 'debt-claim' && (
        <div id="printable-debt-claim-area" className="printable-claim-area relative mx-auto max-w-[850px] w-full bg-white text-slate-900 p-6 sm:p-8 rounded-none shadow-xl border border-slate-300 font-sans mb-8 print:shadow-none print:border-none print:p-0 print:max-w-full print:m-0" style={{ paddingLeft: '8px' }}>
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Header (Exact Match to User's Document) */}
          <div className="border-2 border-slate-900 rounded-none p-3 sm:p-4 bg-slate-50/50 mb-3 grid grid-cols-1 md:grid-cols-3 items-center gap-3">
            {/* Right: Market Info */}
            <div className="text-right leading-tight">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 mb-0.5">
                {settings.marketName || 'سوق عين بامعبد المركزي'}
              </h1>
              <div className="text-xs sm:text-sm font-bold text-slate-700">
                {(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
              </div>
              <div className="text-[11px] font-bold text-slate-500 mt-1">
                {settings.location || 'م/شبوه/رضوم/ عين بامعبد'} | جوال: {settings.contactPhone || '782191112'}
              </div>
            </div>

            {/* Center: Official Logo & Title */}
            <div className="text-center flex flex-col items-center justify-center">
              <img
                src={settings.logoUrl || '/logo.png'}
                alt="شعار السوق"
                className="w-[110px] h-[110px] min-w-[110px] min-h-[110px] max-w-[110px] max-h-[110px] object-contain block mx-auto drop-shadow-sm print:w-[110px] print:h-[110px]"
              />
              <h2 className="text-sm sm:text-base font-black text-slate-900 mt-1.5 whitespace-nowrap">
                كشف مديونية ومطالبة مالية
              </h2>
            </div>

            {/* Left: Boxed Voucher & Date/Time (Exact Arabic Box) */}
            <div className="flex flex-col items-end">
              <div className="border-2 border-slate-900 bg-white rounded-none p-2.5 text-center min-w-[175px] shadow-2xs">
                <div className="text-xs font-black text-slate-900 mb-0.5">
                  كشف مديونية ومطالبة
                </div>
                <div className="text-xs font-mono font-bold text-slate-800">
                  رقم السند: {voucherNumber.replace(/^BYR-/, 'DEBT-')}
                </div>
                <div className="text-[11px] font-bold text-slate-600 mt-0.5">
                  التاريخ: {getWeekdayName(Date.now())} {todayDateStr} م
                </div>
                <div className="text-[11px] font-bold text-slate-600">
                  الوقت: {todayTimeStr}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Sharp KPI Cards (Gray tones with sharp edges - Exact Match to Image) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="border border-slate-300 bg-slate-50/80 p-2.5 text-center">
              <span className="text-[11px] font-bold text-slate-600 block mb-0.5">المشتري المدين</span>
              <span className="text-sm font-black text-slate-900 block truncate">{buyer?.name || 'غير محدد'}</span>
              <span className="text-xs text-black font-mono font-bold block mt-0.5" dir="ltr">{buyer?.phone || '—'}</span>
            </div>

            <div className="border border-slate-300 bg-slate-50/80 p-2.5 text-center">
              <span className="text-[11px] font-bold text-slate-600 block mb-0.5">إجمالي صافي المديونية</span>
              <span className="text-sm font-black text-red-600 font-mono block">
                {formatCurrency(buyerTotalRemainingDebt, settings.currency)}
              </span>
              <span className="text-[10px] text-slate-500 font-bold block">مستحق السداد</span>
            </div>

            <div className="border border-slate-300 bg-slate-50/80 p-2.5 text-center">
              <span className="text-[11px] font-bold text-slate-600 block mb-0.5">عدد الشروات المعلقة</span>
              <span className="text-sm font-black text-slate-900 font-mono block">{pendingDealsCount}</span>
              <span className="text-[10px] text-slate-500 font-bold block">شروة / فاتورة</span>
            </div>

            <div className="border border-slate-300 bg-slate-50/80 p-2.5 text-center">
              <span className="text-[11px] font-bold text-slate-600 block mb-0.5">حالة الحساب</span>
              <span className="text-xs font-black text-red-600 block">
                {buyerTotalRemainingDebt > 0 ? 'مطلوب السداد' : 'مسدد بالكامل'}
              </span>
              <span className="text-[10px] text-slate-500 font-bold block">
                {buyerTotalRemainingDebt > 0 ? 'آجل غير مسدد' : 'لا توجد مديونية'}
              </span>
            </div>
          </div>

          {/* Table Container - Exact Styling to Image */}
          <div className="overflow-x-auto border border-slate-300 mb-3">
            <table className="w-full text-right text-sm border-collapse">
              <thead className="bg-slate-200 text-slate-900 font-black border-b border-slate-300">
                <tr>
                  <th className="p-2.5 border-l border-slate-300 w-14 text-center text-sm">م</th>
                  <th className="p-2.5 border-l border-slate-300 text-right text-sm">بيان اليوم والتاريخ</th>
                  <th className="p-2.5 border-l border-slate-300 text-center w-52 text-sm">المبلغ المطلوب سداده</th>
                  <th className="p-2.5 text-center w-32 text-sm">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {buyerDailyDebtBreakdown.length > 0 ? (
                  buyerDailyDebtBreakdown.map((b, i) => (
                    <tr key={b.dayKey} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2.5 border-l border-slate-300 text-center font-mono font-bold text-slate-700 text-sm">
                        {i + 1}
                      </td>
                      <td className="p-2.5 border-l border-slate-300 font-bold text-slate-900 text-sm">
                        {b.dayName} <span className="font-mono text-slate-600 text-xs">({b.dateStr})</span>
                      </td>
                      <td className="p-2.5 border-l border-slate-300 text-center font-mono font-black text-red-600 text-base">
                        {formatCurrency(b.remainingDebt, settings.currency)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                        آجل / مستحق
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="bg-white">
                    <td className="p-2.5 border-l border-slate-300 text-center font-mono font-bold text-slate-700 text-sm">1</td>
                    <td className="p-2.5 border-l border-slate-300 font-bold text-slate-900 text-sm">
                      إجمالي الفواتير والشروات الآجلة المعلقة
                    </td>
                    <td className="p-2.5 border-l border-slate-300 text-center font-mono font-black text-red-600 text-base">
                      {formatCurrency(buyerTotalRemainingDebt, settings.currency)}
                    </td>
                    <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                      {buyerTotalRemainingDebt > 0 ? 'آجل / مستحق' : 'مسدد'}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-black border-t border-slate-300 text-sm">
                <tr>
                  <td colSpan={2} className="p-2.5 border-l border-slate-300 text-right font-black text-sm">
                    إجمالي صافي المديونية المطلوب سدادها:
                  </td>
                  <td className="p-2.5 border-l border-slate-300 text-center font-mono font-black text-red-600 text-base">
                    {formatCurrency(buyerTotalRemainingDebt, settings.currency)}
                  </td>
                  <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                    {buyerTotalRemainingDebt > 0 ? 'مستحق' : 'خالص'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Bottom Debt Summary Bar */}
          <div className="flex justify-between items-center bg-slate-50 border border-slate-300 p-2.5 mb-2 text-xs font-bold">
            <div className="text-slate-700">
              <span>العميل: <strong className="text-slate-900 text-sm font-black">{buyer?.name || 'غير محدد'}</strong></span>
            </div>
            <div className="text-red-700 text-xs font-black">
              <span>المتبقي (آجل): </span>
              <span className="font-mono text-sm font-black mr-1">
                {formatCurrency(buyerTotalRemainingDebt, settings.currency)}
              </span>
            </div>
          </div>

          {/* Tafqeet */}
          <div className="text-center text-xs font-bold text-slate-600 mb-2">
            فقط وقدره: {tafqeet(buyerTotalRemainingDebt, settings.currency).replace(/^فقط\s*/, '')} لا غير
          </div>

          {/* Notice Box */}
          <div className="text-[11px] text-slate-600 text-center p-2 border border-dashed border-slate-300 mb-4 bg-slate-50/50">
            📌 يُرجى التكرم بسرعة توريد المبلغ المطلوب إلى أمين صندوق الحراج، أو سداده عبر حسابات الصرافة المعتمدة لدى إدارة السوق.
          </div>

          {/* 3-Column Signatures & Official Market Stamp */}
          <div className="pt-3 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs font-bold text-slate-700">
            <div>
              <span className="block mb-6">المحاسب / إدارة الحراج والتحصيل:</span>
              <div className="border-b border-dashed border-slate-400 mx-4"></div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="block mb-1 text-[11px] text-slate-500">ختم السوق الرسمي</span>
              <div className="w-14 h-14 rounded-none border-2 border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                ختم السوق
              </div>
            </div>
            <div>
              <span className="block mb-6">توقيع واستلام العميل (المقر بالدين):</span>
              <div className="border-b border-dashed border-slate-400 mx-4"></div>
            </div>
          </div>

          {/* Micro Footer */}
          <div className="mt-4 pt-2 border-t border-slate-300 flex justify-between items-center text-[10px] text-slate-400">
            <span>نظام إدارة سوق الحراج للأسماك الطازجة والخضروات والفواكة © {new Date().getFullYear()}</span>
            <span>صفحة 1 من 1</span>
            <span dir="ltr">{todayTimeStr} - {todayDateStr}</span>
          </div>
        </div>
      )}
      {/* Toast Feedback for PDF & Excel export */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-70 no-print p-3.5 rounded-none bg-slate-900 text-white border border-slate-700 text-xs font-bold flex items-center gap-3 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{exportToast}</span>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="text-slate-400 hover:text-white cursor-pointer px-1 mr-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
