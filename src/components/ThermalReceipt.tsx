import React, { useMemo } from 'react';
import { Transaction, MarketSettings } from '../types';
import { formatCurrency, formatNumber, formatGregorianDate, formatGregorianTime, formatDisplayDate, isTransactionResold, getResoldDetails, isTransferredTransaction } from '../utils/calculations';
import { Printer, Share2, Copy, Check, Scissors, Fish, FileText, Download, ChevronDown, CheckCircle2, Loader2, User, MoreVertical, Bluetooth, FolderOpen } from 'lucide-react';
import { exportInvoiceToPdfA4, printInvoiceToPdfA4Direct, INVOICE_MARGIN_CREDIT_TEXT } from '../utils/invoiceExport';
import { WhatsAppIcon, sendInvoiceViaWhatsApp } from '../utils/whatsapp';
import { WhatsAppInvoiceModal } from './WhatsAppInvoiceModal';
import { shareInvoicePdf, ShareTarget } from '../utils/shareUtils';
import { LocalSendIcon } from './LocalSendIcon';

interface ThermalReceiptProps {
  transaction: Transaction;
  settings: MarketSettings;
  mode?: 'buyer' | 'seller' | 'both';
  showControls?: boolean;
  onClose?: () => void;
  onFormatChange?: (format: 'thermal' | 'a4') => void;
  initialFormat?: 'thermal' | 'a4';
  initialSellerRole?: 'fisherman' | 'seller';
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  transaction,
  settings,
  mode = 'buyer',
  showControls = true,
  onClose,
  onFormatChange,
  initialFormat = 'a4',
  initialSellerRole,
}) => {
  const [activeTab, setActiveTab] = React.useState<'buyer' | 'seller' | 'both'>(mode || 'buyer');
  const [paperFormat, setPaperFormat] = React.useState<'thermal' | 'a4'>(initialFormat);
  const [copied, setCopied] = React.useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = React.useState(false);

  React.useEffect(() => {
    setActiveTab(mode || 'buyer');
  }, [mode]);

  React.useEffect(() => {
    if (initialFormat) {
      setPaperFormat(initialFormat);
    }
  }, [initialFormat]);

  // Handle ESC and Ctrl+P keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        if (paperFormat === 'a4') {
          handlePrintA4({ silent: false });
        } else {
          window.print();
        }
      }
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, paperFormat, transaction, settings, activeTab]);

  // Resold details for original transaction
  const resoldInfo = getResoldDetails(transaction);

  // Gregorian date and time formatting
  const displayDateStr = formatDisplayDate(transaction.timestamp, transaction.dateStr);
  const displayTimeStr = formatGregorianTime(transaction.timestamp) || transaction.timeStr;

  // Resale check: when a buyer sells the sharoa to another buyer as seller
  const isResaleInvoice = Boolean(
    transaction.isResale ||
    Boolean(transaction.resoldFromTransactionId) ||
    Boolean(typeof transaction.resaleSurplus === 'number' && transaction.resaleSurplus > 0) ||
    (transaction.notes && (
      transaction.notes.includes('إعادة بيع شروة') ||
      transaction.notes.includes('إعادة بيع')
    )) ||
    (transaction.sellerId && transaction.sellerId.startsWith('buyer-'))
  );

  // إمكانية تحديد مسمى الطرف (صياد أو بائع) في المعاينة قبل الطباعة
  const defaultRole: 'fisherman' | 'seller' =
    transaction.sellerRole || initialSellerRole || (isResaleInvoice ? 'seller' : 'fisherman');

  const [sellerRole, setSellerRole] = React.useState<'fisherman' | 'seller'>(defaultRole);

  React.useEffect(() => {
    setSellerRole(transaction.sellerRole || initialSellerRole || (isResaleInvoice ? 'seller' : 'fisherman'));
  }, [transaction.id, transaction.sellerRole, initialSellerRole, isResaleInvoice]);

  const isFishermanRole = sellerRole === 'fisherman';
  const sellerRoleLabel = isFishermanRole ? 'الصياد' : 'البائع';
  const sellerTitle = `${sellerRoleLabel}:`;
  const sellerPrepLabel = isFishermanRole ? 'للصياد:' : 'للبائع:';
  const sellerPrepNoColon = isFishermanRole ? 'للصياد' : 'للبائع';

  // Filter out internal technical/accounting logs from the customer-printed notes
  const printableNotes = useMemo(() => {
    if (!transaction.notes) return '';
    let n = transaction.notes;
    if (n.includes('إعادة بيع شروة من:')) {
      const parts = n.split(' - ');
      const userParts = parts.filter(
        (p) =>
          !p.startsWith('إعادة بيع شروة من:') &&
          !p.includes('السعر الجديد:') &&
          !p.includes('سعر الشروة الأصلي:') &&
          !p.includes('الفائض لدرج الكاش:') &&
          !p.includes('العمولة بالكامل لدرج الكاش:') &&
          !p.includes('شروة أصلية رقم')
      );
      n = userParts.join(' - ').trim();
    }
    n = n.replace(/\[تمت إعادة بيع الشروة لمشتري آخر[^\]]*\]/g, '').trim();
    return n;
  }, [transaction.notes]);

  // Buyer financial and payment status calculation
  const totalFromBuyer = transaction.totalFromBuyer;
  const buyerAdvanceUsed = transaction.buyerAdvanceUsed || 0;

  let effectiveRemainingDebt: number;
  let effectivePaidAmount: number;

  if (transaction.buyerRemainingDebt !== undefined) {
    effectiveRemainingDebt = Math.max(0, transaction.buyerRemainingDebt);
    if (typeof transaction.buyerPaidAmount === 'number') {
      effectivePaidAmount = Math.max(0, transaction.buyerPaidAmount);
    } else {
      effectivePaidAmount = Math.max(0, totalFromBuyer - effectiveRemainingDebt);
    }
  } else if (transaction.paymentStatus === 'paid' || transaction.paymentStatus === 'settled') {
    effectiveRemainingDebt = 0;
    effectivePaidAmount = typeof transaction.buyerPaidAmount === 'number' ? transaction.buyerPaidAmount : totalFromBuyer;
  } else if (transaction.paymentStatus === 'pending') {
    if (typeof transaction.buyerPaidAmount === 'number') {
      effectivePaidAmount = Math.max(0, transaction.buyerPaidAmount);
      effectiveRemainingDebt = Math.max(0, totalFromBuyer - effectivePaidAmount);
    } else {
      effectivePaidAmount = 0;
      effectiveRemainingDebt = totalFromBuyer;
    }
  } else {
    effectivePaidAmount = typeof transaction.buyerPaidAmount === 'number' ? transaction.buyerPaidAmount : totalFromBuyer;
    effectiveRemainingDebt = Math.max(0, totalFromBuyer - effectivePaidAmount);
  }

  const isBuyerFullyPaid =
    !resoldInfo.isResold &&
    (effectiveRemainingDebt <= 0 ||
      transaction.paymentStatus === 'paid' ||
      transaction.paymentStatus === 'settled');

  const isBuyerPartiallyPaid = !isBuyerFullyPaid && effectivePaidAmount > 0;
  const isBuyerUnpaid = !isBuyerFullyPaid && effectivePaidAmount <= 0;
  const buyerCashPaid = Math.max(0, effectivePaidAmount - buyerAdvanceUsed);
  const displayBuyerPaid = isBuyerFullyPaid && effectivePaidAmount === 0 ? totalFromBuyer : effectivePaidAmount;

  const handlePrintThermal = () => {
    setPaperFormat('thermal');
    onFormatChange?.('thermal');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const [isPrintingA4, setIsPrintingA4] = React.useState(false);

  const handlePrintA4 = async (options: { silent?: boolean } = {}) => {
    try {
      setIsPrintingA4(true);
      setPaperFormat('a4');
      onFormatChange?.('a4');
      const res = await printInvoiceToPdfA4Direct(transaction, settings, activeTab, { ...options, sellerRole });
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Vector A4 direct print error, falling back:', err);
      window.print();
    } finally {
      setIsPrintingA4(false);
    }
  };

  const switchFormat = (fmt: 'thermal' | 'a4') => {
    setPaperFormat(fmt);
    onFormatChange?.(fmt);
    try {
      localStorage.setItem('preferred_invoice_paper_format', fmt);
    } catch {}
  };

  const copySummaryText = () => {
    const text = `
🐟 *${settings.marketName}* ${isTransferredTransaction(transaction) ? '[محولة]' : transaction.isEdited ? '[تم التعديل]' : ''}
رقم العملية: ${transaction.id} ${isTransferredTransaction(transaction) ? '(محولة)' : transaction.isEdited ? '(معدلة)' : ''}
التاريخ: ${displayDateStr} - ${displayTimeStr}
-------------------------
👤 ${sellerTitle} ${transaction.sellerName}
🛒 المشتري: ${transaction.buyerName}
-------------------------
الأسماك:
${transaction.items.map((it) => `• ${it.fishName}: ${it.quantity} ${it.unit} × ${it.unitPrice} = ${formatCurrency(it.totalGross, settings.currency)}`).join('\n')}
-------------------------
💰 القيمة الإجمالية: ${formatCurrency(transaction.grossAmount, settings.currency)}
${
  activeTab === 'buyer' || activeTab === 'both'
    ? `➕ عمولة/ضريبة المشتري (+2%): ${formatCurrency(transaction.buyerTaxAmount, settings.currency)}
🔴 المطلوب من المشتري: ${formatCurrency(transaction.totalFromBuyer, settings.currency)}
${
  resoldInfo.isResold
    ? resoldInfo.isSettled
      ? `🔄 حالة الفاتورة: تمت تسويتها بإعادة البيع لمشتري آخر (${resoldInfo.newBuyerName || 'مشتري آخر'})${resoldInfo.newTransactionId ? ` برقم #${resoldInfo.newTransactionId}` : ''} - تم السداد بالكامل ✓`
      : `🔄 حالة الفاتورة: إعادة بيع معلقة لمشتري آخر (${resoldInfo.newBuyerName || 'مشتري آخر'})${resoldInfo.newTransactionId ? ` برقم #${resoldInfo.newTransactionId}` : ''} - دين معلق على المشتري حتى سداد الجديد: ${formatCurrency(effectiveRemainingDebt, settings.currency)}`
    : isBuyerFullyPaid
    ? `🟢 حالة الفاتورة: مسدد بالكامل ✓ (${formatCurrency(displayBuyerPaid, settings.currency)})`
    : isBuyerPartiallyPaid
    ? `💵 المسدد من المشتري: ${formatCurrency(displayBuyerPaid, settings.currency)}
🔴 المتبقي ديناً على المشتري: ${formatCurrency(effectiveRemainingDebt, settings.currency)} (سداد جزئي)`
    : `🔴 المتبقي ديناً على المشتري: ${formatCurrency(effectiveRemainingDebt, settings.currency)} (آجل بالكامل)`
}`
    : ''
}
${
  activeTab === 'seller' || activeTab === 'both'
    ? `➖ خصم عمولة ${sellerRoleLabel} (-3%): ${formatCurrency(transaction.sellerTaxAmount, settings.currency)}
🟢 الصافي المستحق ${sellerPrepNoColon}: ${formatCurrency(transaction.netToSeller, settings.currency)}${
        transaction.sellerPayoutMethod === 'exchange' || transaction.sellerExchangeName || transaction.notes?.includes('عبر الصرافة')
          ? `\n🏦 طريقة الصرف: عبر الصرافة (${transaction.sellerExchangeName || 'حوالة صرافة'})`
          : ''
      }`
    : ''
}
-------------------------
✅ نظام الحراج السريع
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const [isExporting, setIsExporting] = React.useState(false);
  const [exportToast, setExportToast] = React.useState<string | null>(null);

  const [whatsAppMenuOpen, setWhatsAppMenuOpen] = React.useState(false);
  const [whatsAppSending, setWhatsAppSending] = React.useState<'buyer' | 'seller' | null>(null);
  const whatsAppMenuRef = React.useRef<HTMLDivElement>(null);

  const [moreMenuOpen, setMoreMenuOpen] = React.useState(false);
  const [isSharingPdf, setIsSharingPdf] = React.useState(false);
  const moreMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (whatsAppMenuRef.current && !whatsAppMenuRef.current.contains(e.target as Node)) {
        setWhatsAppMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    if (whatsAppMenuOpen || moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [whatsAppMenuOpen, moreMenuOpen]);

  const handleShare = async (target: ShareTarget) => {
    setMoreMenuOpen(false);
    setIsSharingPdf(true);
    try {
      const res = await shareInvoicePdf(transaction, settings, target, activeTab, sellerRole);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 6000);
    } catch (err: any) {
      setExportToast('فشلت عملية المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 6000);
    } finally {
      setIsSharingPdf(false);
    }
  };

  const handleSmartPrint = () => {
    if (paperFormat === 'a4') {
      handlePrintA4({ silent: false });
    } else {
      handlePrintThermal();
    }
  };

  const handleExportPdfA4 = async () => {
    try {
      setIsExporting(true);
      const res = await exportInvoiceToPdfA4(transaction, settings, activeTab, sellerRole);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشل تصدير فاتورة PDF: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id={`receipt-wrapper-${transaction.id}`} className="space-y-4">
      {/* Toast Feedback for Desktop Export */}
      {exportToast && (
        <div className="no-print p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{exportToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="text-emerald-700 hover:text-emerald-950 font-black cursor-pointer px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Controls Bar for screen view */}
      {showControls && (
        <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
          {/* Tabs on Left */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                id="receipt-tab-buyer"
                type="button"
                onClick={() => setActiveTab('buyer')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  activeTab === 'buyer'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                فاتورة المشتري (+2%)
              </button>
              <button
                id="receipt-tab-seller"
                type="button"
                onClick={() => setActiveTab('seller')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  activeTab === 'seller'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                {isFishermanRole ? 'إشعار الصياد (-3%)' : 'إشعار البائع (-3%)'}
              </button>
              <button
                id="receipt-tab-both"
                type="button"
                onClick={() => setActiveTab('both')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  activeTab === 'both'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                فاتورة مدمجة (الطرفين)
              </button>
            </div>

            {/* Paper Size Preview Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs">
              <button
                id="receipt-preview-thermal-btn"
                type="button"
                onClick={() => switchFormat('thermal')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  paperFormat === 'thermal'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="معاينة الإيصال بتنسيق الطابعة الحرارية 80mm"
              >
                حراري (80mm)
              </button>
              <button
                id="receipt-preview-a4-btn"
                type="button"
                onClick={() => switchFormat('a4')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  paperFormat === 'a4'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="معاينة الفاتورة بتنسيق ورقة A4 كاملة"
              >
                فاتورة A4
              </button>
            </div>

            {/* Seller Role Selector: صياد أو بائع */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs shadow-2xs">
              <span className="text-[11px] font-bold text-slate-600 px-1 select-none">
                مسمى الطرف:
              </span>
              <button
                id="receipt-role-fisherman-btn"
                type="button"
                onClick={() => setSellerRole('fisherman')}
                className={`px-3 py-1 text-xs font-black rounded-md transition-all cursor-pointer flex items-center justify-center ${
                  isFishermanRole
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="تحديد مسمى 'صياد' في الفاتورة والطباعة"
              >
                <span>صياد</span>
              </button>
              <button
                id="receipt-role-seller-btn"
                type="button"
                onClick={() => setSellerRole('seller')}
                className={`px-3 py-1 text-xs font-black rounded-md transition-all cursor-pointer flex items-center justify-center ${
                  !isFishermanRole
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="تحديد مسمى 'بائع' في الفاتورة والطباعة"
              >
                <span>بائع</span>
              </button>
            </div>
          </div>

          {/* Action Print & Copy & Export Buttons on Right */}
          <div className="flex items-center gap-2">
            {/* WhatsApp Send Button with Dropdown for 1-Click Direct Sending */}
            <div className="relative">
              <button
                id="receipt-whatsapp-modal-btn"
                type="button"
                onClick={() => setWhatsAppMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black rounded-lg bg-[#25D366] hover:bg-[#20ba59] active:scale-95 text-white shadow-xs transition-all cursor-pointer border border-emerald-600"
                title="إرسال الفاتورة عبر WhatsApp مباشرة بنقرة واحدة"
              >
                {whatsAppSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <WhatsAppIcon size={16} />
                )}
                <span>WhatsApp</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-80" />
              </button>

              {whatsAppMenuOpen && (
                <div
                  ref={whatsAppMenuRef}
                  className="absolute right-0 sm:left-0 sm:right-auto mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-100 text-right"
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 border-b border-slate-100 flex items-center justify-between">
                    <span>اختر الشخص للإرسال المباشر:</span>
                    <WhatsAppIcon size={14} />
                  </div>

                  <div className="py-1 space-y-1">
                    <button
                      type="button"
                      disabled={whatsAppSending !== null}
                      onClick={async () => {
                        setWhatsAppMenuOpen(false);
                        setWhatsAppSending('buyer');
                        try {
                          const res = await sendInvoiceViaWhatsApp(transaction, settings, 'buyer', undefined, true, sellerRole);
                          setExportToast(res.message);
                          setTimeout(() => setExportToast(null), 5000);
                        } finally {
                          setWhatsAppSending(null);
                        }
                      }}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 text-slate-800 hover:text-emerald-900 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-emerald-200"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-emerald-700" />
                        </div>
                        <div>
                          <span className="font-black block text-xs">المشتري: {transaction.buyerName}</span>
                          <span className="text-[10px] text-slate-500 font-bold font-mono">
                            {formatCurrency(transaction.totalFromBuyer, settings.currency)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        إرسال PDF
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={whatsAppSending !== null}
                      onClick={async () => {
                        setWhatsAppMenuOpen(false);
                        setWhatsAppSending('seller');
                        try {
                          const res = await sendInvoiceViaWhatsApp(transaction, settings, 'seller', undefined, true, sellerRole);
                          setExportToast(res.message);
                          setTimeout(() => setExportToast(null), 5000);
                        } finally {
                          setWhatsAppSending(null);
                        }
                      }}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-teal-50 active:bg-teal-100 text-slate-800 hover:text-teal-900 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-teal-200"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-teal-700" />
                        </div>
                        <div>
                          <span className="font-black block text-xs">{sellerTitle} {transaction.sellerName}</span>
                          <span className="text-[10px] text-slate-500 font-bold font-mono">
                            {formatCurrency(transaction.netToSeller, settings.currency)}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                        إرسال PDF
                      </span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setWhatsAppMenuOpen(false);
                        setIsWhatsAppModalOpen(true);
                      }}
                      className="w-full text-center py-1.5 px-2 rounded-lg hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition-colors cursor-pointer"
                    >
                      تعديل رقم الهاتف وخيارات أخرى...
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              id="receipt-copy-btn"
              type="button"
              onClick={copySummaryText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 transition-colors border border-slate-300 shadow-xs cursor-pointer"
              title="نسخ ملخص للإرسال عبر واتساب"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-blue-600" />}
              <span>{copied ? 'تم النسخ' : 'نسخ لواتساب'}</span>
            </button>
            {/* Smart Unified Print Button (Thermal or A4 according to active paperFormat) */}
            <button
              id="receipt-print-btn"
              type="button"
              disabled={isPrintingA4}
              onClick={handleSmartPrint}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-black rounded-lg text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 ${
                paperFormat === 'a4'
                  ? 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700 border border-blue-700'
              }`}
              title={
                paperFormat === 'a4'
                  ? 'طباعة الفاتورة بدقة المتجهات النقية العالية A4 [Ctrl+P]'
                  : 'طباعة إيصال حراري سريع للطابعة الحرارية 80mm [Ctrl+P]'
              }
            >
              {isPrintingA4 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span>طباعة</span>
            </button>

            {/* Direct Download PDF Button */}
            <button
              id="receipt-download-pdf-btn"
              type="button"
              disabled={isExporting}
              onClick={handleExportPdfA4}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black rounded-lg bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer border border-rose-700 disabled:opacity-50"
              title="تحميل فاتورة PDF رسمية وحفظها مباشرة"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>تحميل</span>
            </button>

            {/* Three-dots menu (⋮) for Sharing Options (LocalSend, Bluetooth, Apps Share, Copy File) */}
            <div className="relative" ref={moreMenuRef}>
              <button
                id="receipt-more-share-options-btn"
                type="button"
                disabled={isSharingPdf}
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black rounded-lg border transition-all cursor-pointer shadow-xs disabled:opacity-50 ${
                  moreMenuOpen
                    ? 'bg-indigo-700 text-white border-indigo-800 shadow-md ring-2 ring-indigo-500/30'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                }`}
                title="خيارات المشاركة (تطبيق LocalSend، البلوتوث، تطبيقات ويندوز، نسخ الملف)"
              >
                {isSharingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                ) : (
                  <MoreVertical className="w-4 h-4" />
                )}
                <span>مشاركة ⋮</span>
              </button>

              {moreMenuOpen && (
                <div
                  className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 p-2 text-xs animate-in fade-in zoom-in-95 duration-100 text-right divide-y divide-slate-100"
                >
                  <div className="px-3 py-2 text-[11px] font-black text-slate-500 flex items-center justify-between">
                    <span>مشاركة الفاتورة (A4 PDF)</span>
                    <Share2 className="w-3.5 h-3.5 text-blue-600" />
                  </div>

                  <div className="py-1.5 space-y-1">
                    {/* LocalSend Option */}
                    <button
                      id="receipt-share-localsend-btn"
                      type="button"
                      disabled={isSharingPdf}
                      onClick={() => handleShare('localsend')}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-emerald-50 active:bg-emerald-100 text-slate-800 hover:text-emerald-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-emerald-200 group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                          <LocalSendIcon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <span className="font-black block text-xs text-slate-900 group-hover:text-teal-700">تطبيق LocalSend</span>
                          <span className="text-[10px] text-slate-500 block">إرسال سريع ومباشر للأجهزة المجاورة</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                        LocalSend
                      </span>
                    </button>

                    {/* Bluetooth Option */}
                    <button
                      id="receipt-share-bluetooth-btn"
                      type="button"
                      disabled={isSharingPdf}
                      onClick={() => handleShare('bluetooth')}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-blue-50 active:bg-blue-100 text-slate-800 hover:text-blue-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-blue-200 group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                          <Bluetooth className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-black block text-xs text-slate-900 group-hover:text-blue-700">إرسال عبر البلوتوث</span>
                          <span className="text-[10px] text-slate-500 block">معالج نقل الملفات في ويندوز</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                        Bluetooth
                      </span>
                    </button>

                    {/* Windows Share Apps Option */}
                    <button
                      id="receipt-share-apps-btn"
                      type="button"
                      disabled={isSharingPdf}
                      onClick={() => handleShare('open-with')}
                      className="w-full text-right p-2.5 rounded-xl hover:bg-purple-50 active:bg-purple-100 text-slate-800 hover:text-purple-950 transition-colors flex items-center justify-between cursor-pointer border border-transparent hover:border-purple-200 group disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0 group-hover:scale-105 transition-transform">
                          <Share2 className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-black block text-xs text-slate-900 group-hover:text-purple-700">تطبيقات المشاركة</span>
                          <span className="text-[10px] text-slate-500 block">فتح بواسطة أي تطبيق في ويندوز</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                        Windows
                      </span>
                    </button>
                  </div>

                  <div className="pt-1.5 space-y-0.5">
                    {/* Copy PDF File */}
                    <button
                      id="receipt-share-copy-file-btn"
                      type="button"
                      disabled={isSharingPdf}
                      onClick={() => handleShare('copy')}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-100 text-[11px] font-bold text-slate-700 transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        نسخ ملف PDF للحافظة (جاهز للصق Ctrl+V)
                      </span>
                    </button>

                    {/* Show File in Folder */}
                    <button
                      id="receipt-share-folder-btn"
                      type="button"
                      disabled={isSharingPdf}
                      onClick={() => handleShare('show-folder')}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-slate-100 text-[11px] font-bold text-slate-700 transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                        إظهار ملف الفاتورة في المجلد
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actual Printable Receipt Container (Thermal or A4) */}
      {paperFormat === 'a4' ? (
        /* OFFICIAL A4 INVOICE CONTAINER */
        <div
          className="printable-statement-area relative w-full max-w-4xl mx-auto bg-white text-slate-900 rounded-2xl shadow-xl border border-slate-300 p-6 sm:p-10 font-sans print:shadow-none print:border-none print:p-2 print:max-w-full"
          style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif" }}
        >
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>

          {/* A4 Header matching unified official standard with dead-centered fixed logo */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* Right: Market Info (Arabic) */}
              <div className="text-right leading-tight min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                  {settings?.marketName || 'سوق عين بامعبد المركزي'}
                </h1>
                <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-1 whitespace-nowrap">
                  {(settings?.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                  {settings?.location || 'م/شبوه/رضوم/ عين بامعبد'}
                  {settings?.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}
                </p>
              </div>

              {/* Center: Fixed Size Logo Exactly in Dead Center */}
              <div className="text-center flex flex-col items-center justify-center px-1">
                <img
                  src="/logo.png"
                  alt="شعار السوق"
                  className="w-[115px] h-[115px] min-w-[115px] min-h-[115px] max-w-[115px] max-h-[115px] object-contain block mx-auto drop-shadow-md print:w-[115px] print:h-[115px]"
                  style={{ width: '115px', height: '115px', minWidth: '115px', minHeight: '115px', maxWidth: '115px', maxHeight: '115px' }}
                />
                <div className="mt-1 text-sm sm:text-base font-black text-slate-900 text-center tracking-tight whitespace-nowrap">
                  {activeTab === 'buyer'
                    ? 'فاتورة المشتري'
                    : activeTab === 'seller'
                    ? (isFishermanRole ? 'إشعار الصياد' : 'إشعار البائع')
                    : 'فاتورة شاملة للطرفين'}
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
                  Shabwa'a - Radoum - Ain Bamaabad | Mob: {settings?.contactPhone || '782191112'}
                </p>
              </div>
            </div>
          </div>

          {/* Unified Document & Metadata Bar */}
          <div className="bg-slate-50 rounded-xl border border-slate-300 p-3 mb-4 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-slate-900 text-white px-3 py-1 rounded-md font-black text-xs">
                {activeTab === 'seller'
                  ? (isFishermanRole ? 'إشعار مستحقات الصياد' : 'إشعار مستحقات البائع')
                  : 'فاتورة مبيعات المشتري'}
              </span>
              <div className="border-2 border-slate-900 px-3 py-1 rounded-md bg-white">
                <span className="text-xs font-bold text-slate-600 ml-1.5">رقم الفاتورة:</span>
                <span className="font-mono font-black text-slate-900 text-sm">{transaction.id}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-600 flex-wrap">
              <div>التاريخ: <span className="font-black text-slate-900">{displayDateStr}</span></div>
              <div>الوقت: <span className="font-black text-slate-900">{displayTimeStr}</span></div>
              {Boolean(settings?.employeeName) && (
                <div>الموظف: <span className="font-black text-slate-900 font-sans">{settings.employeeName}</span></div>
              )}
            </div>

            {/* Sub-header Badges (Only shown if special transaction flags exist) */}
            {(isTransferredTransaction(transaction) || transaction.isEdited || resoldInfo.isResold) && (
              <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-2 flex-wrap">
                {isTransferredTransaction(transaction) && (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300 rounded-md">
                    صفقة محولة
                  </span>
                )}
                {transaction.isEdited && (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded-md">
                    تم التعديل
                  </span>
                )}
                {resoldInfo.isResold && (
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 rounded-md">
                    إعادة بيع
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Parties & Transaction Details Row - Clean flat layout without capsule frames */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-300 mb-5 text-xs">
            {/* 1. المشتري */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500 font-bold whitespace-nowrap">المشتري:</span>
              <span className="font-black text-slate-900 text-sm whitespace-nowrap">{transaction.buyerName}</span>
            </div>

            {/* 2. الصياد / البائع */}
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 font-bold whitespace-nowrap">{sellerTitle}</span>
                <span className="font-black text-slate-900 text-sm whitespace-nowrap">{transaction.sellerName}</span>
              </div>
              <button
                type="button"
                onClick={() => setSellerRole((r) => (r === 'fisherman' ? 'seller' : 'fisherman'))}
                className="no-print text-[10px] font-bold px-1.5 py-0.5 rounded text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="انقر للتبديل السريع بين صياد وبائع"
              >
                تبديل إلى {isFishermanRole ? 'بائع' : 'صياد'}
              </button>
            </div>

            {/* 3. حالة الفاتورة / طريقة التسوية */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-slate-500 font-bold whitespace-nowrap">
                {activeTab === 'buyer' || activeTab === 'both' ? 'حالة الفاتورة:' : 'طريقة الدفع:'}
              </span>
              <span className="font-bold whitespace-nowrap">
                {activeTab === 'buyer' || activeTab === 'both' ? (
                  resoldInfo.isResold ? (
                    resoldInfo.isSettled ? (
                      <span className="text-purple-700 font-black">تمت التسوية بإعادة البيع ✓</span>
                    ) : (
                      <span className="text-amber-700 font-black">معلقة (إعادة بيع)</span>
                    )
                  ) : isBuyerFullyPaid ? (
                    <span className="text-emerald-700 font-black">مسددة بالكامل ✓</span>
                  ) : isBuyerPartiallyPaid ? (
                    <span className="text-amber-700 font-black">سداد جزئي</span>
                  ) : (
                    <span className="text-red-700 font-black">دين آجل بالكامل</span>
                  )
                ) : (
                  transaction.settlementType === 'direct_cash'
                    ? 'نقدي مباشر (صندوق الحراج)'
                    : transaction.settlementType === 'association_cash'
                    ? 'نقدي (حساب الجمعية)'
                    : transaction.settlementType === 'association_credit' || transaction.settlementType === 'credit'
                    ? 'آجل ديناً على المشتري (دين للحراج)'
                    : transaction.settlementType === 'partial_cash'
                    ? 'دفع نقدي جزئي + آجل'
                    : transaction.settlementType === 'buyer_advance'
                    ? 'خصم من رصيد القدمة'
                    : 'خصم / تسوية رصيد'
                )}
              </span>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-900 text-white font-black border-b border-slate-900">
                <tr>
                  <th className="p-2.5 w-12 text-center border-l border-slate-800">م</th>
                  <th className="p-2.5 border-l border-slate-800">نوع السمك / الصنف</th>
                  <th className="p-2.5 text-center border-l border-slate-800">الكمية</th>
                  <th className="p-2.5 text-center border-l border-slate-800">الوحدة</th>
                  <th className="p-2.5 text-left font-mono border-l border-slate-800">سعر الوحدة</th>
                  <th className="p-2.5 text-left font-mono">الإجمالي الأساسي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transaction.items.map((item, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                    <td className="p-2.5 text-center font-bold font-mono border-l border-slate-300">{idx + 1}</td>
                    <td className="p-2.5 font-bold text-slate-900 border-l border-slate-300">{item.fishName}</td>
                    <td className="p-2.5 text-center font-black font-mono border-l border-slate-300">{item.quantity}</td>
                    <td className="p-2.5 text-center text-slate-700 border-l border-slate-300">{item.unit}</td>
                    <td className="p-2.5 text-left font-mono font-bold border-l border-slate-300">{formatNumber(item.unitPrice)}</td>
                    <td className="p-2.5 text-left font-mono font-black text-slate-900">{formatCurrency(item.totalGross, settings.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-black border-t-2 border-slate-900">
                <tr className="bg-slate-100 border-b border-slate-300">
                  <td colSpan={5} className="p-2 text-left text-slate-900 font-black border-l border-slate-300">
                    إجمالي قيمة المبيعات الأساسية:
                  </td>
                  <td className="p-2 text-left font-mono font-black text-slate-950 text-sm">
                    {formatCurrency(transaction.grossAmount, settings.currency)}
                  </td>
                </tr>

                {/* ── تفاصيل مالية المشتري مدمجة في تذييل الجدول بنفس نمط فاتورة المشتري بكامل مبيعاته ── */}
                {activeTab === 'buyer' && (
                  <>
                    <tr className="bg-white border-b border-slate-300 text-sky-800 font-bold">
                      <td colSpan={5} className="p-2 text-left border-l border-slate-300">
                        عمولة وضريبة المشتري (+{Math.round((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100)}%):
                      </td>
                      <td className="p-2 text-left font-mono font-bold text-sm">
                        +{formatCurrency(transaction.buyerTaxAmount, settings.currency)}
                      </td>
                    </tr>
                    <tr className="bg-white border-b border-slate-300 text-sky-900 font-black">
                      <td colSpan={5} className="p-2 text-left font-black text-sm border-l border-slate-300">
                        الإجمالي المطلوب من المشتري:
                      </td>
                      <td className="p-2 text-left font-mono font-black text-sm text-sky-800">
                        {formatCurrency(transaction.totalFromBuyer, settings.currency)}
                      </td>
                    </tr>
                    {buyerAdvanceUsed > 0 && (
                      <tr className="bg-purple-50/60 border-b border-purple-200 text-purple-900 font-bold">
                        <td colSpan={5} className="p-2 text-left border-l border-slate-300">
                          المخصوم من العربون المسبق:
                        </td>
                        <td className="p-2 text-left font-mono font-bold text-sm">
                          -{formatCurrency(buyerAdvanceUsed, settings.currency)}
                        </td>
                      </tr>
                    )}
                    <tr className="bg-white border-b border-slate-300 text-emerald-900 font-black">
                      <td colSpan={5} className="p-2 text-left font-black text-xs border-l border-slate-300">
                        المبلغ المسدد:
                      </td>
                      <td className="p-2 text-left font-mono font-black text-sm text-emerald-800">
                        {formatCurrency(displayBuyerPaid, settings.currency)}
                        {isBuyerFullyPaid && (
                          <span className="mr-2 text-xs font-bold text-emerald-700 font-sans">(مسدد بالكامل ✓)</span>
                        )}
                      </td>
                    </tr>
                    {effectiveRemainingDebt > 0 && (
                      <tr className="bg-white border-b border-slate-300 text-red-700 font-black">
                        <td colSpan={5} className="p-2 text-left font-black text-xs border-l border-slate-300">
                          المتبقي ديناً على المشتري:
                        </td>
                        <td className="p-2 text-left font-mono font-black text-sm text-red-700">
                          {formatCurrency(effectiveRemainingDebt, settings.currency)}
                        </td>
                      </tr>
                    )}
                  </>
                )}

                {/* ── تفاصيل مستحقات الصياد / البائع مدمجة في تذييل الجدول ── */}
                {activeTab === 'seller' && (
                  <>
                    <tr className="bg-white border-b border-slate-300 text-red-700 font-bold">
                      <td colSpan={5} className="p-2 text-left border-l border-slate-300">
                        خصم عمولة الحراج من {sellerRoleLabel} (-{Math.round((transaction.sellerTaxRate ?? 0.03) * 100)}%):
                      </td>
                      <td className="p-2 text-left font-mono font-bold text-sm">
                        -{formatCurrency(transaction.sellerTaxAmount, settings.currency)}
                      </td>
                    </tr>
                    <tr className="bg-white border-b border-slate-300 text-emerald-950 font-black">
                      <td colSpan={5} className="p-2 text-left font-black text-sm border-l border-slate-300">
                        صافي المستحق {sellerPrepLabel}
                      </td>
                      <td className="p-2 text-left font-mono font-black text-sm text-emerald-900">
                        {formatCurrency(transaction.netToSeller, settings.currency)}
                      </td>
                    </tr>
                    {transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount > 0 && (
                      <tr className="bg-white border-b border-slate-300 text-emerald-900 font-black">
                        <td colSpan={5} className="p-2 text-left font-black text-xs border-l border-slate-300">
                          المبلغ المسدد {sellerPrepLabel}
                        </td>
                        <td className="p-2 text-left font-mono font-black text-sm text-emerald-800">
                          {formatCurrency(transaction.sellerPaidAmount, settings.currency)}
                        </td>
                      </tr>
                    )}
                    {transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount < transaction.netToSeller && (
                      <tr className="bg-white border-b border-slate-300 text-amber-900 font-black">
                        <td colSpan={5} className="p-2 text-left font-black text-xs border-l border-slate-300">
                          المتبقي ديناً على الحراج {sellerPrepLabel}
                        </td>
                        <td className="p-2 text-left font-mono font-black text-sm text-amber-800">
                          {formatCurrency(Math.max(0, transaction.netToSeller - transaction.sellerPaidAmount), settings.currency)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tfoot>
            </table>
          </div>

          {/* في حالة الفاتورة الشاملة للطرفين معاً (both): إظهار بطاقتي التسوية كجداول محاسبية بنمط فاتورة المشتري */}
          {activeTab === 'both' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-xs">
              {/* Buyer Side Financials Table */}
              <div className="overflow-hidden border border-slate-300 rounded-lg">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-black">
                    <tr>
                      <th className="p-2 text-right">حساب المشتري: {transaction.buyerName}</th>
                      <th className="p-2 text-left font-mono text-[11px] text-blue-200">عمولة +{Math.round((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100)}%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr className="bg-slate-100 font-black">
                      <td className="p-2 text-left text-slate-900 border-l border-slate-200">قيمة المبيعات الأساسية:</td>
                      <td className="p-2 text-left font-mono font-black text-slate-900">{formatCurrency(transaction.grossAmount, settings.currency)}</td>
                    </tr>
                    <tr className="bg-white font-bold text-sky-800">
                      <td className="p-2 text-left border-l border-slate-200">عمولة وضريبة المشتري (+{Math.round((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100)}%):</td>
                      <td className="p-2 text-left font-mono font-bold">+{formatCurrency(transaction.buyerTaxAmount, settings.currency)}</td>
                    </tr>
                    <tr className="bg-white font-black text-sky-900">
                      <td className="p-2 text-left border-l border-slate-200 text-sm">الإجمالي المطلوب من المشتري:</td>
                      <td className="p-2 text-left font-mono font-black text-sm text-sky-800">{formatCurrency(transaction.totalFromBuyer, settings.currency)}</td>
                    </tr>
                    {buyerAdvanceUsed > 0 && (
                      <tr className="bg-purple-50/60 font-bold text-purple-900">
                        <td className="p-2 text-left border-l border-slate-200">المخصوم من العربون المسبق:</td>
                        <td className="p-2 text-left font-mono font-bold">-{formatCurrency(buyerAdvanceUsed, settings.currency)}</td>
                      </tr>
                    )}
                    <tr className="bg-white font-black text-emerald-900">
                      <td className="p-2 text-left border-l border-slate-200">المبلغ المسدد:</td>
                      <td className="p-2 text-left font-mono font-black text-sm text-emerald-800">
                        {formatCurrency(displayBuyerPaid, settings.currency)}
                        {isBuyerFullyPaid && <span className="mr-1 text-xs font-sans font-bold">(مسدد بالكامل ✓)</span>}
                      </td>
                    </tr>
                    {effectiveRemainingDebt > 0 && (
                      <tr className="bg-white font-black text-red-700">
                        <td className="p-2 text-left border-l border-slate-200">المتبقي ديناً على المشتري:</td>
                        <td className="p-2 text-left font-mono font-black text-sm text-red-700">{formatCurrency(effectiveRemainingDebt, settings.currency)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Seller Side Financials Table */}
              <div className="overflow-hidden border border-slate-300 rounded-lg">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-900 text-white font-black">
                    <tr>
                      <th className="p-2 text-right">حساب {sellerTitle} {transaction.sellerName}</th>
                      <th className="p-2 text-left font-mono text-[11px] text-emerald-200">عمولة -{Math.round((transaction.sellerTaxRate ?? 0.03) * 100)}%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    <tr className="bg-slate-100 font-black">
                      <td className="p-2 text-left text-slate-900 border-l border-slate-200">قيمة المبيعات الأساسية:</td>
                      <td className="p-2 text-left font-mono font-black text-slate-900">{formatCurrency(transaction.grossAmount, settings.currency)}</td>
                    </tr>
                    <tr className="bg-white font-bold text-red-700">
                      <td className="p-2 text-left border-l border-slate-200">خصم عمولة الحراج (-{Math.round((transaction.sellerTaxRate ?? 0.03) * 100)}%):</td>
                      <td className="p-2 text-left font-mono font-bold">-{formatCurrency(transaction.sellerTaxAmount, settings.currency)}</td>
                    </tr>
                    <tr className="bg-white font-black text-emerald-950">
                      <td className="p-2 text-left border-l border-slate-200 text-sm">صافي المستحق {sellerPrepLabel}</td>
                      <td className="p-2 text-left font-mono font-black text-sm text-emerald-900">{formatCurrency(transaction.netToSeller, settings.currency)}</td>
                    </tr>
                    {transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount > 0 && (
                      <tr className="bg-white font-black text-emerald-900">
                        <td className="p-2 text-left border-l border-slate-200">المبلغ المسدد {sellerPrepLabel}</td>
                        <td className="p-2 text-left font-mono font-black text-sm text-emerald-800">{formatCurrency(transaction.sellerPaidAmount, settings.currency)}</td>
                      </tr>
                    )}
                    {transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount < transaction.netToSeller && (
                      <tr className="bg-white font-black text-amber-900">
                        <td className="p-2 text-left border-l border-slate-200">المتبقي ديناً على الحراج {sellerPrepLabel}</td>
                        <td className="p-2 text-left font-mono font-black text-sm text-amber-800">{formatCurrency(Math.max(0, transaction.netToSeller - transaction.sellerPaidAmount), settings.currency)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes if present */}
          {printableNotes && (
            <div className="mb-6 p-3 bg-amber-50/50 rounded-lg border border-amber-200 text-xs text-amber-950">
              <span className="font-bold block mb-0.5">ملاحظات العملية:</span>
              <span>{printableNotes}</span>
            </div>
          )}

          {/* Signatures & Official Stamp */}
          <div className="pt-6 border-t-2 border-slate-800 text-xs">
            <div className="grid grid-cols-3 gap-6 text-center font-bold mb-4">
              <div className="space-y-4">
                <p className="text-slate-700 text-xs">توقيع واستلام {activeTab === 'seller' ? sellerRoleLabel : 'العميل / المشتري'}</p>
                <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pt-6"></div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <span className="text-[11px] text-slate-500 font-bold mb-1">ختم السوق الرسمي</span>
                <div className="border border-dashed border-slate-400 rounded-full w-14 h-14 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  ختم السوق
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-slate-700 text-xs">توقيع مسؤول الصندوق / الإدارة</p>
                <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pt-6"></div>
                {Boolean(settings?.employeeName) && (
                  <p className="text-[11px] text-slate-600 font-bold mt-1">الموظف: {settings.employeeName}</p>
                )}
              </div>
            </div>
            <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-slate-200 flex justify-between items-center print:border-black">
              <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
              <span>شكراً لتعاملكم معنا</span>
              <span className="font-mono">حررت: {displayDateStr} - {displayTimeStr}</span>
            </div>
          </div>
        </div>
      ) : (
        /* Actual Printable Thermal Receipt Container */
        <div className="printable-receipt-area relative mx-auto max-w-[380px] bg-white text-black p-5 rounded-lg shadow-2xl font-mono text-[13px] border border-dashed border-slate-300 print:shadow-none print:border-none print:p-1 print:max-w-full">
          {/* Horizontal developer credit at bottom of receipt */}
          <div className="invoice-margin-credit" aria-hidden="true" style={{ fontSize: '7.5px', bottom: '4px', left: 0, right: 0, textAlign: 'center' }}>
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>

        {/* BUYER RECEIPT SECTION */}
        {(activeTab === 'buyer' || activeTab === 'both') && (
          <div className="receipt-section mb-6">
            {/* Header */}
            <div className="text-center pb-2 border-b-2 border-black">
              <div className="flex justify-center mb-1.5">
                <img
                  src="/logo.png"
                  alt="شعار سوق عين بامعبد المركزي"
                  className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20"
                />
              </div>
              <h2 className="text-base font-black tracking-tight">{settings?.marketName || 'سوق عين بامعبد المركزي'}</h2>
              <p className="text-[11px] font-bold text-gray-700">{(settings?.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
              <p className="text-[10px] text-gray-600">{settings?.location || 'م/شبوه/رضوم/ عين بامعبد'}</p>
              <p className="text-[10px] text-gray-600 font-mono">جوال: {settings?.contactPhone || '782191112'}</p>
              <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                <div className="inline-block px-3 py-0.5 border border-black rounded text-[11px] font-black uppercase bg-black text-white">
                  فاتورة المشتري
                </div>
                {!resoldInfo.isResold && (
                  isBuyerFullyPaid ? (
                    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-black bg-emerald-600 text-white border border-emerald-700 shadow-2xs print:border-black print:bg-white print:text-black">
                      مسدد بالكامل ✓
                    </span>
                  ) : isBuyerPartiallyPaid ? (
                    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-black bg-amber-600 text-white border border-amber-700 shadow-2xs print:border-black print:bg-white print:text-black">
                      سداد جزئي
                    </span>
                  ) : (
                    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-black bg-red-600 text-white border border-red-700 shadow-2xs print:border-black print:bg-white print:text-black">
                      دين آجل
                    </span>
                  )
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold">رقم الفاتورة:</span>
                <div className="flex items-center gap-1">
                  {isTransferredTransaction(transaction) ? (
                    <span className="text-[10px] font-bold text-purple-700 print:text-black">
                      (محولة)
                    </span>
                  ) : transaction.isEdited ? (
                    <span className="text-[10px] font-bold text-amber-700 print:text-black">
                      [تم التعديل]
                    </span>
                  ) : null}
                  <span className="font-black font-sans">{transaction.id}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span dir="ltr" className="font-sans font-bold">{displayDateStr} - {displayTimeStr}</span>
              </div>
              {Boolean(settings?.employeeName) && (
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-bold">الموظف:</span>
                  <span className="font-black font-sans">{settings.employeeName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="font-bold">المشتري:</span>
                <span className="font-black">{transaction.buyerName}</span>
              </div>
              {transaction.buyerPhone && (
                <div className="flex justify-between">
                  <span>هاتف المشتري:</span>
                  <span dir="ltr">{transaction.buyerPhone}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <span>{sellerTitle}</span>
                  <button
                    type="button"
                    onClick={() => setSellerRole((r) => (r === 'fisherman' ? 'seller' : 'fisherman'))}
                    className="no-print text-[9px] font-bold px-1 py-0.2 rounded bg-gray-100 text-blue-700 hover:bg-gray-200 border border-gray-300 transition-colors cursor-pointer"
                    title="التبديل بين صياد وبائع"
                  >
                    تبديل
                  </button>
                </span>
                <span className="font-black">{transaction.sellerName}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2 border-b border-black">
              <div className="grid grid-cols-12 font-black text-[11px] pb-1 border-b border-gray-300">
                <span className="col-span-4 text-right">نوع السمك</span>
                <span className="col-span-2 text-center">الكمية</span>
                <span className="col-span-3 text-center">سعر الحبة</span>
                <span className="col-span-3 text-left">الإجمالي</span>
              </div>
              <div className="divide-y divide-gray-200 text-[11px] py-1">
                {(() => {
                  const bTaxRate = transaction.buyerTaxRate !== undefined ? transaction.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
                  return transaction.items.map((item, i) => {
                    const itemTax = item.totalGross * bTaxRate;
                    const itemTotalWithTax = item.totalGross + itemTax;
                    return (
                      <div key={i} className="py-1">
                        <div className="grid grid-cols-12 items-center">
                          <span className="col-span-4 font-bold truncate">{item.fishName}</span>
                          <span className="col-span-2 text-center font-mono">
                            {item.quantity} {item.unit}
                          </span>
                          <span className="col-span-3 text-center font-mono font-bold text-gray-700">
                            {formatNumber(item.unitPrice)}
                          </span>
                          <span className="col-span-3 text-left font-black font-sans">
                            {formatNumber(item.totalGross)}
                          </span>
                        </div>
                        {transaction.items.length > 1 && (
                          <div className="flex justify-between text-[9px] text-gray-600 px-1 pt-0.5 mt-0.5 bg-gray-50 rounded">
                            <span>ضريبة (+{Math.round(bTaxRate * 100)}%): +{formatNumber(itemTax)}</span>
                            <span>المجموع: {formatNumber(itemTotalWithTax)}</span>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Financials for Buyer */}
            <div className="py-2 space-y-1.5 border-b-2 border-black text-[12px]">
              <div className="flex justify-between text-gray-700">
                <span>قيمة المبيعات الأساسية:</span>
                <span className="font-bold font-sans">{formatCurrency(transaction.grossAmount, settings.currency)}</span>
              </div>
              <div className="flex justify-between text-blue-900 font-bold bg-blue-50/70 p-1 rounded">
                <span>ضريبة / عمولة المشتري (+{Math.round((transaction.buyerTaxRate !== undefined ? transaction.buyerTaxRate : (settings.buyerTaxRate ?? 0.02)) * 100)}%):</span>
                <span className="font-sans">+{formatCurrency(transaction.buyerTaxAmount, settings.currency)}</span>
              </div>
              <div className="flex justify-between text-base font-black pt-1 border-t border-black">
                <span>إجمالي الفاتورة المطلوب:</span>
                <span className="font-sans text-lg">{formatCurrency(transaction.totalFromBuyer, settings.currency)}</span>
              </div>
              {transaction.isResale && transaction.resaleSurplus && transaction.resaleSurplus > 0 && (
                <div className="flex justify-between text-xs font-bold text-emerald-900 bg-emerald-50/80 p-1.5 rounded border border-emerald-300 mt-1">
                  <span>فائض إعادة بيع الشروة:</span>
                  <span className="font-sans font-black text-emerald-950">+{formatCurrency(transaction.resaleSurplus, settings.currency)}</span>
                </div>
              )}

              {/* تفاصيل السداد والمتبقي على المشتري */}
              {resoldInfo.isResold ? (
                resoldInfo.isSettled ? (
                  /* حالة الشروة المعاد بيعها: تمت التسوية بإعادة بيعها وسداد المشتري الجديد */
                  <div className="mt-2 pt-2 border-t-2 border-purple-500 bg-purple-50 text-purple-950 p-2.5 rounded-lg border border-purple-300 font-sans print:bg-white print:border-black print:text-black">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-600 print:bg-black"></span>
                        حالة الفاتورة:
                      </span>
                      <span className="text-purple-700 font-black text-xs print:text-black">
                        تمت التسوية بإعادة البيع ✓
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-purple-900 mt-1.5 pt-1 border-t border-purple-200 print:border-gray-300 space-y-1">
                      <div className="flex justify-between">
                        <span>أعيد بيع الشروة إلى:</span>
                        <span className="font-black text-purple-950">{resoldInfo.newBuyerName || 'مشتري آخر'}</span>
                      </div>
                      {resoldInfo.newTransactionId && (
                        <div className="flex justify-between font-mono">
                          <span>رقم الفاتورة الجديدة:</span>
                          <span>#{resoldInfo.newTransactionId}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>حالة سداد المشتري الجديد:</span>
                        <span className="text-emerald-700 font-black">
                          تم السداد بالكامل ✓
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs font-black mt-1.5 pt-1 border-t border-purple-200 text-purple-900 print:border-black print:text-black">
                      <span>المتبقي ديناً على هذا المشتري:</span>
                      <span className="font-sans text-sm font-black text-emerald-700">0 {settings.currency} (تمت التسوية)</span>
                    </div>
                  </div>
                ) : (
                  /* حالة الشروة المعاد بيعها وهي معلقة بانتظار سداد المشتري الجديد */
                  <div className="mt-2 pt-2 border-t-2 border-amber-500 bg-amber-50 text-amber-950 p-2.5 rounded-lg border border-amber-300 font-sans print:bg-white print:border-black print:text-black">
                    <div className="flex justify-between items-center text-xs font-black">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600 print:bg-black"></span>
                        حالة الفاتورة:
                      </span>
                      <span className="bg-amber-600 text-white px-2.5 py-0.5 rounded text-[11px] font-black shadow-2xs print:bg-black print:text-white">
                        إعادة بيع (دين معلق)
                      </span>
                    </div>

                    <div className="text-[11px] font-bold text-amber-900 mt-1.5 pt-1 border-t border-amber-200 print:border-gray-300 space-y-1">
                      <div className="flex justify-between">
                        <span>أعيد بيع الشروة إلى:</span>
                        <span className="font-black text-amber-950">{resoldInfo.newBuyerName || 'مشتري آخر'}</span>
                      </div>
                      {resoldInfo.newTransactionId && (
                        <div className="flex justify-between font-mono">
                          <span>رقم الفاتورة الجديدة:</span>
                          <span>#{resoldInfo.newTransactionId}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>حالة سداد المشتري الجديد:</span>
                        <span className="text-amber-800 font-black">
                          آجل (بانتظار السداد)
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs font-black mt-1.5 pt-1 border-t border-amber-200 text-amber-900 print:border-black print:text-black">
                      <span>المتبقي ديناً على هذا المشتري:</span>
                      <span className="font-sans text-sm font-black text-red-600">{formatCurrency(effectiveRemainingDebt, settings.currency)}</span>
                    </div>
                  </div>
                )
              ) : isBuyerFullyPaid ? (
                /* حالة السداد بالكامل: تظهر باللون الأخضر المميز مسدد بالكامل */
                <div className="mt-2 pt-2 border-t-2 border-emerald-500 bg-emerald-50 text-emerald-950 p-2.5 rounded-lg border border-emerald-300 font-sans print:bg-white print:border-black print:text-black">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600 print:bg-black"></span>
                      حالة الفاتورة:
                    </span>
                    <span className="bg-emerald-600 text-white px-2.5 py-0.5 rounded text-[11px] font-black shadow-2xs print:bg-black print:text-white">
                      مسدد بالكامل ✓
                    </span>
                  </div>

                  {buyerAdvanceUsed > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-900 font-bold mt-1.5 pt-1 border-t border-emerald-200 print:border-gray-300">
                      <span>خصم من رصيد القدمة:</span>
                      <span className="font-sans font-black">-{formatCurrency(buyerAdvanceUsed, settings.currency)}</span>
                    </div>
                  )}

                  {buyerCashPaid > 0 && buyerAdvanceUsed > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-900 font-bold mt-0.5">
                      <span>المسدد نقداً (كاش):</span>
                      <span className="font-sans font-black">+{formatCurrency(buyerCashPaid, settings.currency)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-xs font-black mt-1.5 pt-1 border-t border-emerald-200 text-emerald-900 print:border-black print:text-black">
                    <span>إجمالي المبلغ المسدد:</span>
                    <span className="font-sans text-sm font-black">{formatCurrency(displayBuyerPaid, settings.currency)}</span>
                  </div>
                </div>
              ) : isBuyerPartiallyPaid ? (
                /* حالة السداد الجزئي: يظهر بوضوح المبلغ المسدد المعين والمتبقي ديناً */
                <div className="mt-2 pt-2 border-t-2 border-amber-500 bg-amber-50 text-amber-950 p-2.5 rounded-lg border border-amber-300 font-sans print:bg-white print:border-black print:text-black">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 print:bg-black"></span>
                      حالة الفاتورة:
                    </span>
                    <span className="bg-amber-600 text-white px-2.5 py-0.5 rounded text-[11px] font-black shadow-2xs print:bg-black print:text-white">
                      سداد جزئي
                    </span>
                  </div>

                  {buyerAdvanceUsed > 0 && (
                    <div className="flex justify-between text-[11px] font-bold mt-1.5 pt-1 border-t border-amber-200 print:border-gray-300">
                      <span>خصم من رصيد القدمة:</span>
                      <span className="font-sans font-black">-{formatCurrency(buyerAdvanceUsed, settings.currency)}</span>
                    </div>
                  )}

                  {buyerCashPaid > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-800 font-bold mt-1">
                      <span>المسدد نقداً من المشتري:</span>
                      <span className="font-sans font-black">+{formatCurrency(buyerCashPaid, settings.currency)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-xs font-black mt-1.5 pt-1 border-t border-amber-200 text-emerald-900 print:border-black print:text-black">
                    <span>إجمالي المسدد:</span>
                    <span className="font-sans text-sm font-black">+{formatCurrency(displayBuyerPaid, settings.currency)}</span>
                  </div>

                  <div className="flex justify-between text-xs font-black mt-2 pt-1.5 border-t border-dashed border-red-300 bg-red-100/90 text-red-900 p-1.5 rounded print:bg-white print:border-black print:text-black">
                    <span className="font-black">المتبقي ديناً على المشتري:</span>
                    <span className="font-sans text-sm font-black">{formatCurrency(effectiveRemainingDebt, settings.currency)}</span>
                  </div>
                </div>
              ) : (
                /* حالة الآجل بالكامل (غير مسدد): يظهر المبلغ المسدد 0 والمتبقي ديناً كامل الفاتورة */
                <div className="mt-2 pt-2 border-t-2 border-red-500 bg-red-50 text-red-950 p-2.5 rounded-lg border border-red-300 font-sans print:bg-white print:border-black print:text-black">
                  <div className="flex justify-between items-center text-xs font-black">
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 print:bg-black"></span>
                      حالة الفاتورة:
                    </span>
                    <span className="bg-red-600 text-white px-2.5 py-0.5 rounded text-[11px] font-black shadow-2xs print:bg-black print:text-white">
                      آجل (غير مسدد)
                    </span>
                  </div>

                  <div className="flex justify-between text-[11px] font-bold mt-1.5 pt-1 border-t border-red-200 text-gray-700 print:border-gray-300 print:text-black">
                    <span>المبلغ المسدد:</span>
                    <span className="font-sans font-bold">0 {settings.currency}</span>
                  </div>

                  <div className="flex justify-between text-xs font-black mt-1.5 pt-1.5 border-t border-dashed border-red-300 text-red-900 print:border-black print:text-black">
                    <span className="font-black">المتبقي ديناً على المشتري:</span>
                    <span className="font-sans text-sm font-black">{formatCurrency(effectiveRemainingDebt, settings.currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Buyer footer */}
            <div className="pt-2 text-center text-[10px] space-y-1">
              <p className="font-bold">شكراً لتعاملكم مع سوق عين بامعبد المركزي</p>
              <div className="flex justify-center items-center gap-1 font-mono tracking-widest text-[9px] text-gray-500">
                |||||| | |||||||| |||| | ||||| |||||||
              </div>
              <p className="text-gray-500">يرجى الاحتفاظ بالإيصال لمطابقة خروج البضاعة</p>
            </div>
          </div>
        )}

        {/* DOTTED CUT LINE SEPARATOR FOR DUAL MODE */}
        {activeTab === 'both' && (
          <div className="my-4 pt-2 border-t-2 border-dashed border-gray-500 text-center relative print:my-4">
            <span className="bg-white px-3 text-[10px] text-gray-500 font-bold inline-flex items-center gap-1">
              <Scissors className="w-3 h-3 rotate-90 inline" /> قص الإيصال / تسليم إشعار الصافي {sellerPrepNoColon}
            </span>
          </div>
        )}

        {/* SELLER SETTLEMENT SECTION */}
        {(activeTab === 'seller' || activeTab === 'both') && (
          <div className="receipt-section">
            {/* Header */}
            <div className="text-center pb-2 border-b-2 border-black">
              <div className="flex justify-center mb-1.5">
                <img
                  src="/logo.png"
                  alt="شعار سوق عين بامعبد المركزي"
                  className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20"
                />
              </div>
              <h2 className="text-base font-black tracking-tight">{settings?.marketName || 'سوق عين بامعبد المركزي'}</h2>
              <p className="text-[11px] font-bold text-gray-700">{(settings?.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
              <p className="text-[10px] text-gray-600">{settings?.location || 'م/شبوه/رضوم/ عين بامعبد'}</p>
              <p className="text-[10px] text-gray-600 font-mono">جوال: {settings?.contactPhone || '782191112'}</p>
              <div className="mt-2 flex items-center justify-center gap-1.5 flex-wrap">
                <div className="inline-block px-3 py-0.5 border border-black rounded text-[11px] font-black uppercase bg-slate-900 text-white">
                  {isFishermanRole ? 'إشعار صرف الصياد' : 'إشعار صرف البائع'}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold">رقم العملية:</span>
                <div className="flex items-center gap-1">
                  {isTransferredTransaction(transaction) ? (
                    <span className="text-[10px] font-bold text-purple-700 print:text-black">
                      (محولة)
                    </span>
                  ) : transaction.isEdited ? (
                    <span className="text-[10px] font-bold text-amber-700 print:text-black">
                      [تم التعديل]
                    </span>
                  ) : null}
                  <span className="font-black font-sans">{transaction.id}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span dir="ltr" className="font-sans font-bold">{displayDateStr} - {displayTimeStr}</span>
              </div>
              {Boolean(settings?.employeeName) && (
                <div className="flex justify-between items-center text-gray-700">
                  <span className="font-bold">الموظف:</span>
                  <span className="font-black font-sans">{settings.employeeName}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <span>{sellerTitle}</span>
                  <button
                    type="button"
                    onClick={() => setSellerRole((r) => (r === 'fisherman' ? 'seller' : 'fisherman'))}
                    className="no-print text-[9px] font-bold px-1 py-0.2 rounded bg-gray-100 text-blue-700 hover:bg-gray-200 border border-gray-300 transition-colors cursor-pointer"
                    title="التبديل بين صياد وبائع"
                  >
                    تبديل
                  </button>
                </span>
                <span className="font-black">{transaction.sellerName}</span>
              </div>
              <div className="flex justify-between">
                <span>المشتري:</span>
                <span>{transaction.buyerName}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-2 border-b border-black">
              <div className="grid grid-cols-12 font-black text-[11px] pb-1 border-b border-gray-300">
                <span className="col-span-4 text-right">{isFishermanRole ? 'نوع الصيد' : 'نوع السمك'}</span>
                <span className="col-span-2 text-center">الكمية</span>
                <span className="col-span-3 text-center">سعر الحبة</span>
                <span className="col-span-3 text-left">قيمة البيع</span>
              </div>
              <div className="divide-y divide-gray-200 text-[11px] py-1">
                {transaction.items.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 py-1 items-center">
                    <span className="col-span-4 font-bold truncate">{item.fishName}</span>
                    <span className="col-span-2 text-center font-mono">
                      {item.quantity} {item.unit}
                    </span>
                    <span className="col-span-3 text-center font-mono font-bold text-gray-700">
                      {formatNumber(item.unitPrice)}
                    </span>
                    <span className="col-span-3 text-left font-black font-sans">
                      {formatNumber(item.totalGross)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financials for Seller */}
            <div className="py-2 space-y-1.5 border-b-2 border-black text-[12px]">
              <div className="flex justify-between text-gray-700">
                <span>إجمالي الأساسي (البيع):</span>
                <span className="font-bold font-sans">{formatCurrency(transaction.grossAmount, settings.currency)}</span>
              </div>
              {transaction.isResale && (transaction.sellerTaxRate === 0 || !transaction.sellerTaxAmount) ? (
                <div className="flex justify-between text-emerald-800 font-bold bg-emerald-50/70 p-1 rounded">
                  <span>عمولة الحراج والجمعية (0% - بيع بنفس السعر):</span>
                  <span className="font-sans">0 {settings.currency} (معفى)</span>
                </div>
              ) : (
                <div className="flex justify-between text-red-700 font-bold bg-red-50/70 p-1 rounded">
                  <span>خصم عمولة الحراج والجمعية من {sellerRoleLabel} (-{Math.round((transaction.sellerTaxRate !== undefined ? transaction.sellerTaxRate : (settings.sellerTaxRate ?? 0.03)) * 100)}%):</span>
                  <span className="font-sans">-{formatCurrency(transaction.sellerTaxAmount, settings.currency)}</span>
                </div>
              )}
              {transaction.isResale ? (
                <div className="space-y-1.5 pt-1 border-t border-black">
                  <div className="flex justify-between text-xs font-bold text-emerald-900 bg-emerald-50/80 p-1 rounded">
                    <span>فائض الشروة (أودع بالدرج):</span>
                    <span className="font-sans font-black text-emerald-950">+{formatCurrency(transaction.resaleSurplus || 0, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-blue-900 bg-blue-50/80 p-1 rounded">
                    <span>عمولة الحراج بالكامل (أودعت بالدرج):</span>
                    <span className="font-sans font-black text-blue-950">+{formatCurrency(transaction.harajProfit || 0, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black bg-amber-50 p-1.5 rounded border border-amber-300">
                    <span className="text-amber-950">إجمالي المودع بالدرج من البيعة:</span>
                    <span className="font-sans text-base text-amber-950 font-black">+{formatCurrency((transaction.resaleSurplus || 0) + (transaction.harajProfit || 0), settings.currency)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between text-base font-black pt-1 border-t border-black bg-emerald-50/50 p-1 rounded">
                  <span className="text-emerald-950">صافي المستحق {sellerPrepLabel}</span>
                  <span className="font-sans text-lg text-emerald-900 font-black">{formatCurrency(transaction.netToSeller, settings.currency)}</span>
                </div>
              )}
              {/* تفاصيل الصرف عبر الصرافة تحت نص صافي المستحق للصياد */}
              {(transaction.sellerPayoutMethod === 'exchange' ||
                Boolean(transaction.sellerExchangeName && transaction.sellerExchangeName.trim() !== '') ||
                Boolean(transaction.notes && transaction.notes.includes('عبر الصرافة'))) && (
                <div className="flex justify-between items-center text-xs font-bold text-blue-950 bg-blue-50/90 p-1.5 rounded border border-blue-300 mt-1 print:bg-white print:border-black print:text-black">
                  <div className="flex items-center gap-1 font-black">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-600 print:bg-black"></span>
                    <span>طريقة الصرف:</span>
                    <span className="text-blue-900 print:text-black">عبر الصرافة</span>
                  </div>
                  <span className="font-black text-blue-950 print:text-black">
                    {transaction.sellerExchangeName && transaction.sellerExchangeName.trim() !== ''
                      ? transaction.sellerExchangeName
                      : (() => {
                          const match = transaction.notes?.match(/عبر الصرافة:?\s*([^\s-,()]+(?:\s+[^\s-,()]+)*)/);
                          return match && match[1] ? match[1] : 'حوالة صرافة';
                        })()}
                  </span>
                </div>
              )}
              {transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount < transaction.netToSeller && (
                <div className="space-y-1 pt-1.5 border-t border-dashed border-gray-400">
                  <div className="flex justify-between text-xs font-bold text-blue-900 bg-blue-50 p-1 rounded">
                    <span>
                      {transaction.sellerPayoutMethod === 'exchange' ? 'المبلغ المحول عبر الصرافة:' : 'المبلغ المسلم نقداً (الجمعية):'}
                    </span>
                    <span className="font-sans">{formatCurrency(transaction.sellerPaidAmount, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-black text-amber-900 bg-amber-50 p-1 rounded border border-amber-300">
                    <span>المتبقي ديناً على الحراج {sellerPrepLabel}</span>
                    <span className="font-sans">{formatCurrency(Math.max(0, transaction.netToSeller - transaction.sellerPaidAmount), settings.currency)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signatures & Seller footer */}
            <div className="pt-4 text-[10px] space-y-6">
              <div className="grid grid-cols-2 gap-4 text-center font-bold">
                <div className="border-t border-gray-400 pt-1">
                  <p>توقيع مسؤول الصندوق الأساسي</p>
                  {Boolean(settings?.employeeName) && (
                    <p className="text-[9px] text-gray-700 font-bold mt-0.5">({settings.employeeName})</p>
                  )}
                </div>
                <div className="border-t border-gray-400 pt-1">
                  <p>{isFishermanRole ? 'استلام الصياد / الوكيل' : 'استلام وتوقيع البائع'}</p>
                </div>
              </div>
              <p className="text-center text-gray-500 text-[9px]">تم تسوية الصافي بموجب أنظمة حراج الميناء</p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* WhatsApp Invoice & PDF Send Modal */}
      <WhatsAppInvoiceModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        transaction={transaction}
        settings={settings}
        defaultTarget={activeTab === 'seller' ? 'seller' : 'buyer'}
        sellerRole={sellerRole}
      />
    </div>
  );
};

