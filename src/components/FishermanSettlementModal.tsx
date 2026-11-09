import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Contact, Transaction, MarketSettings, CashEntry } from '../types';
import { formatCurrency, formatNumber, tafqeet, getWeekdayName, formatGregorianDate, formatGregorianTime, formatDisplayDate, isTransferredTransaction } from '../utils/calculations';
import {
  Printer,
  X,
  Fish,
  FileText,
  Receipt,
  User,
  Anchor,
  Phone,
  Calendar,
  CheckCircle2,
  HandCoins,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  Download,
  Loader2,
} from 'lucide-react';
import { exportFishermanSettlementPdfA4, printFishermanSettlementA4Direct, INVOICE_MARGIN_CREDIT_TEXT } from '../utils/invoiceExport';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareFishermanSettlementPdf, ShareTarget } from '../utils/shareUtils';

interface FishermanSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  seller?: Contact;
  transactions: Transaction[];
  contacts?: Contact[];
  settings: MarketSettings;
  timeframe: 'today' | 'week' | 'month' | 'all';
  sellerMetrics: {
    grossTotal: number;
    deductionTotal: number;
    netTotal: number;
    count: number;
  };
  totalPaid?: number;
  remainingBalance?: number;
  payouts?: CashEntry[];
  initialPrintMode?: 'official' | 'thermal' | 'service';
  initialSellerRole?: 'fisherman' | 'seller';
}

export const FishermanSettlementModal: React.FC<FishermanSettlementModalProps> = ({
  isOpen,
  onClose,
  seller,
  transactions,
  contacts = [],
  settings,
  timeframe,
  sellerMetrics,
  totalPaid = 0,
  remainingBalance,
  payouts = [],
  initialPrintMode = 'official',
  initialSellerRole = 'fisherman',
}) => {
  const [printMode, setPrintMode] = useState<'official' | 'thermal' | 'service'>(initialPrintMode);
  const [sellerRole, setSellerRole] = useState<'fisherman' | 'seller'>(initialSellerRole || 'fisherman');

  useEffect(() => {
    if (initialSellerRole) {
      setSellerRole(initialSellerRole);
    }
  }, [initialSellerRole]);

  const isFishermanRole = sellerRole === 'fisherman';
  const sellerRoleLabel = isFishermanRole ? 'الصياد' : 'البائع';
  const sellerRoleTitle = isFishermanRole ? 'الصياد:' : 'البائع:';
  const sellerRolePrep = isFishermanRole ? 'للصياد' : 'للبائع';

  const [employeeName, setEmployeeName] = useState<string>(() => {
    return localStorage.getItem('haraj_preferred_employee') || settings?.employeeName || '';
  });
  const [zoomLevel, setZoomLevel] = useState<number>(85);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const handleEmployeeNameChange = (val: string) => {
    setEmployeeName(val);
    localStorage.setItem('haraj_preferred_employee', val);
  };

  useEffect(() => {
    if (initialPrintMode) {
      setPrintMode(initialPrintMode);
    }
  }, [initialPrintMode]);

  useEffect(() => {
    if (!employeeName) {
      const foundPerformer = transactions.find((t) => t.performedBy)?.performedBy;
      if (foundPerformer) {
        setEmployeeName(foundPerformer);
      } else if (settings?.employeeName) {
        setEmployeeName(settings.employeeName);
      }
    }
  }, [transactions, settings?.employeeName]);

  // Handle ESC and Ctrl+P
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

  const [isPrintingA4, setIsPrintingA4] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handlePrintA4 = async () => {
    try {
      setIsPrintingA4(true);
      setPrintMode('official');
      const res = await printFishermanSettlementA4Direct(
        seller,
        transactions,
        sellerMetrics,
        settings,
        'official',
        timeframeLabels[timeframe],
        totalPaid,
        remainingBalance,
        employeeName || settings?.marketName || '',
        contacts,
        {},
        sellerRole
      );
      if (res && res.message && !res.message.includes('إلغاء')) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Vector fisherman settlement print error:', err);
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

  const handlePrintService = async () => {
    try {
      setIsPrintingA4(true);
      setPrintMode('service');
      const res = await printFishermanSettlementA4Direct(
        seller,
        transactions,
        sellerMetrics,
        settings,
        'service',
        timeframeLabels[timeframe],
        totalPaid,
        remainingBalance,
        employeeName || settings?.marketName || '',
        contacts,
        {},
        sellerRole
      );
      if (res && res.message && !res.message.includes('إلغاء')) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 4000);
      }
    } catch (err: any) {
      console.warn('Vector fisherman settlement service print error:', err);
      window.print();
    } finally {
      setIsPrintingA4(false);
    }
  };

  const handleSmartPrint = () => {
    if (printMode === 'thermal') {
      handlePrintThermal();
    } else if (printMode === 'service') {
      handlePrintService();
    } else {
      handlePrintA4();
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true);
      const res = await exportFishermanSettlementPdfA4(
        seller,
        transactions,
        sellerMetrics,
        settings,
        printMode,
        timeframeLabels[timeframe],
        totalPaid,
        remainingBalance,
        employeeName,
        contacts,
        false,
        sellerRole
      );
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      setExportToast('فشل تحميل ملف PDF: ' + (err?.message || 'حدث خطأ أثناء التصدير'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const [isSharingSettlement, setIsSharingSettlement] = useState(false);

  const handleShareSettlement = async (target: ShareTarget) => {
    try {
      setIsSharingSettlement(true);
      const res = await shareFishermanSettlementPdf(
        seller,
        transactions,
        sellerMetrics,
        settings,
        target,
        printMode,
        {
          timeframeLabel: timeframeLabels[timeframe],
          totalPaid,
          remainingBalance,
          employeeName,
          contacts,
          sellerRole,
        }
      );
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'حدث خطأ أثناء المشاركة'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSharingSettlement(false);
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

  const voucherNumber = `STL-${(seller?.id || 'SLR').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  // Contact map for fast phone number lookup
  const contactsMap = React.useMemo(() => {
    const map = new Map<string, Contact>();
    if (contacts && Array.isArray(contacts)) {
      contacts.forEach((c) => {
        if (c.id) map.set(c.id, c);
        if (c.name) map.set(c.name.trim().toLowerCase(), c);
      });
    }
    return map;
  }, [contacts]);

  // Flatten transactions into service invoice rows
  const serviceInvoiceRows = React.useMemo(() => {
    const list: Array<{
      id: string;
      buyerName: string;
      buyerPhone: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalGross: number;
    }> = [];

    transactions.forEach((t) => {
      const buyerContact = t.buyerId
        ? contactsMap.get(t.buyerId)
        : (t.buyerName ? contactsMap.get(t.buyerName.trim().toLowerCase()) : undefined);
      const buyerPhone = t.buyerPhone || buyerContact?.phone || '';

      if (Array.isArray(t.items) && t.items.length > 0) {
        t.items.forEach((item, idx) => {
          list.push({
            id: `${t.id}-${idx}`,
            buyerName: t.buyerName || '—',
            buyerPhone: buyerPhone,
            description: item.fishName || 'تبوع',
            unit: item.unit || 'حبه',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalGross: item.totalGross || (item.quantity * item.unitPrice),
          });
        });
      } else {
        list.push({
          id: t.id,
          buyerName: t.buyerName || '—',
          buyerPhone: buyerPhone,
          description: t.notes || 'تبوع',
          unit: 'حبه',
          quantity: 1,
          unitPrice: t.grossAmount,
          totalGross: t.grossAmount,
        });
      }
    });

    return list;
  }, [transactions, contactsMap]);

  // Formatted date string with weekday (e.g. السبت 26 / 04 / 2025 م)
  const invoiceDateString = React.useMemo(() => {
    const firstTrx = transactions[0];
    const dateObj = firstTrx?.timestamp ? new Date(firstTrx.timestamp) : new Date();
    const weekday = (firstTrx ? getWeekdayName(firstTrx.timestamp, firstTrx.dateStr) : '') || getWeekdayName(Date.now()) || 'السبت';
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${weekday} ${day} / ${month} / ${year} م`;
  }, [transactions]);

  // Live print timestamp (e.g. 26/04/2025 09:14:36 ص)
  const printTimestamp = React.useMemo(() => {
    const now = new Date();
    const tsDay = String(now.getDate()).padStart(2, '0');
    const tsMonth = String(now.getMonth() + 1).padStart(2, '0');
    const tsYear = now.getFullYear();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    const hoursStr = String(hours).padStart(2, '0');
    return `${tsDay}/${tsMonth}/${tsYear} ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  }, []);

  const totalGrossAmount =
    (sellerMetrics && typeof sellerMetrics.grossTotal === 'number' && sellerMetrics.grossTotal > 0)
      ? sellerMetrics.grossTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.grossAmount) || 0), 0);

  const commissionAmount =
    (sellerMetrics && typeof sellerMetrics.deductionTotal === 'number')
      ? sellerMetrics.deductionTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.sellerTaxAmount ?? (t as any).commissionAmount) || 0), 0);

  const netDueToSeller =
    (sellerMetrics && typeof sellerMetrics.netTotal === 'number' && sellerMetrics.netTotal > 0)
      ? sellerMetrics.netTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.netToSeller ?? ((Number(t.grossAmount) || 0) - (Number(t.sellerTaxAmount) || 0))) || 0), 0);

  const currencyLabel = settings.currency?.includes('ريال') ? 'يمني' : (settings.currency || 'يمني');

  const tafqeetWords = React.useMemo(() => {
    return tafqeet(netDueToSeller, 'يمني')
      .replace(/^فقط\s+/, '')
      .replace(/\s+لا غير$/, '');
  }, [netDueToSeller]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      id="fisherman-settlement-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 print:static print:block print:w-full print:h-auto print:p-0 print:m-0 print:bg-white print:overflow-visible flex flex-col items-center justify-start"
    >
      {/* Top Action Controls Bar - Hidden when printing */}
      <div className="w-full max-w-4xl bg-white/95 backdrop-blur-md rounded-none shadow-xs border border-slate-300 p-3 mb-3 flex flex-wrap items-center justify-between gap-2.5 print:hidden sticky top-2 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-300">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900">{isFishermanRole ? 'إشعار تصفية مستحقات الصياد' : 'إشعار تصفية مستحقات البائع'}</h2>
            <p className="text-[11px] text-slate-500 font-medium">
              {sellerRoleTitle} <span className="font-bold text-slate-800">{seller?.name || 'غير محدد'}</span>
            </p>
          </div>
        </div>

        {/* Mode Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Format Preview Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-none border border-slate-300 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPrintMode('official')}
              className={`px-2.5 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${printMode === 'official'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>معاينة A4</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('thermal')}
              className={`px-2.5 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${printMode === 'thermal'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>معاينة حراري (80mm)</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('service')}
              className={`px-2.5 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${printMode === 'service'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
                }`}
              title="معاينة نموذج الفاتورة الخدمية الرسمية (مطابقة للأصل)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>فاتورة خدمية</span>
            </button>
          </div>

          {/* Party Role Selector: صياد أو بائع */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300 text-xs shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 px-1 select-none">
              مسمى الطرف:
            </span>
            <button
              id="fisherman-settlement-role-fisherman-btn"
              type="button"
              onClick={() => setSellerRole('fisherman')}
              className={`px-3 py-1 text-xs font-black rounded-none transition-all cursor-pointer flex items-center justify-center ${
                isFishermanRole
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="تحديد مسمى 'صياد' في الفاتورة والطباعة"
            >
              <span>صياد</span>
            </button>
            <button
              id="fisherman-settlement-role-seller-btn"
              type="button"
              onClick={() => setSellerRole('seller')}
              className={`px-3 py-1 text-xs font-black rounded-none transition-all cursor-pointer flex items-center justify-center ${
                !isFishermanRole
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
              title="تحديد مسمى 'بائع' في الفاتورة والطباعة"
            >
              <span>بائع</span>
            </button>
          </div>

          {/* Zoom & Fit Controls (for full preview on all screens) */}
          {printMode !== 'thermal' && (
            <div className="flex items-center bg-slate-100 p-1 rounded-none border border-slate-300 text-xs font-bold gap-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(60, prev - 10))}
                className="p-1 rounded-none hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="تصغير المعاينة"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(zoomLevel === 80 ? 100 : 80)}
                className="px-2 py-0.5 rounded-none bg-white text-slate-900 shadow-2xs font-mono text-[11px] font-black cursor-pointer hover:bg-slate-50 transition-colors"
                title="تبديل: ملاءمة الشاشة 80% / الحجم الفعلي 100%"
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(130, prev + 10))}
                className="p-1 rounded-none hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="تكبير المعاينة"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(80)}
                className={`px-2 py-0.5 rounded-none transition-colors cursor-pointer text-[10px] ${zoomLevel === 80 ? 'bg-indigo-600 text-white font-black' : 'hover:bg-white text-slate-600'
                  }`}
                title="ملاءمة الفاتورة بالكامل على مقاس الشاشة"
              >
                ملاءمة
              </button>
            </div>
          )}

          {/* Employee Name Field - User-Defined & Saved */}
          <div className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/60 px-2 py-1 rounded-none border border-slate-300 transition-colors">
            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <label htmlFor="fisherman-employee-name-input" className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
              الموظف:
            </label>
            <input
              id="fisherman-employee-name-input"
              type="text"
              value={employeeName}
              onChange={(e) => handleEmployeeNameChange(e.target.value)}
              placeholder="اكتب اسم الموظف..."
              className="bg-white border border-slate-300 rounded-none px-2 py-0.5 text-xs font-bold text-slate-800 w-28 sm:w-36 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              title="تحديد اسم الموظف المحرر للفاتورة (يُحفظ تلقائياً)"
            />
          </div>

          {/* Direct Print & Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Smart Unified Print Button (A4 / Thermal / Service according to active printMode) */}
            <button
              id="seller-settlement-print-btn"
              type="button"
              disabled={isPrintingA4}
              onClick={handleSmartPrint}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-none text-white shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
                printMode === 'thermal'
                  ? 'bg-blue-600 hover:bg-blue-700 border border-blue-700'
                  : printMode === 'service'
                  ? 'bg-indigo-600 hover:bg-indigo-700 border border-indigo-700'
                  : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700'
              }`}
              title={
                printMode === 'thermal'
                  ? 'طباعة إشعار تصفية الصافي فوراً على الطابعة الحرارية 80mm [Ctrl+P]'
                  : printMode === 'service'
                  ? 'طباعة الفاتورة الخدمية الرسمية فوراً بدقة عالية A4 [Ctrl+P]'
                  : 'طباعة سند تصفية الصافي فوراً بدقة عالية A4 [Ctrl+P]'
              }
            >
              {isPrintingA4 ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>طباعة</span>
            </button>

            <button
              id="seller-settlement-download-pdf-btn"
              type="button"
              disabled={isExportingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 border border-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="تحميل ملف PDF رسمي ومباشر إلى الجهاز"
            >
              {isExportingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جاري التحميل...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>تحميل</span>
                </>
              )}
            </button>

            {/* Three-dots menu (⋮) for Sharing Options (LocalSend, Bluetooth, Apps Share, Copy File) */}
            <ShareOptionsDropdown
              id="seller-settlement-share-menu-btn"
              onShare={handleShareSettlement}
              isSharing={isSharingSettlement}
              buttonLabel="مشاركة ⋮"
              buttonClassName="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              menuTitle={printMode === 'service' ? `مشاركة الفاتورة الخدمية لـ ${sellerRolePrep} (PDF)` : `مشاركة إشعار تصفية ${sellerRoleLabel} (PDF)`}
            />
          </div>

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

      {/* ========================================================================= */}
      {/* 1. OFFICIAL STATEMENT / VOUCHER (Standard A4 Mode)                        */}
      {/* ========================================================================= */}
      {printMode === 'official' && (
        <div
          style={{
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
            transformOrigin: 'top center',
            paddingLeft: '8px',
          }}
          className="printable-statement-area relative w-full max-w-5xl bg-white text-slate-900 rounded-none shadow-xl border border-slate-300 p-4 sm:p-6 mb-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full print:transform-none transition-transform duration-150"
        >
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* Right: Market Info */}
              <div className="text-right leading-tight min-w-0">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">{settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
                <p className="text-xs sm:text-sm text-slate-700 font-extrabold mt-0.5 whitespace-nowrap">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
                {settings.location && (
                  <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-0.5 whitespace-nowrap">{settings.location}{settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}</p>
                )}
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
                  {isFishermanRole ? 'سند إشعار تصفية وصرف مستحقات صياد' : 'سند إشعار تصفية وصرف مستحقات بائع'}
                </div>
              </div>

              {/* Left: Document Box & Time */}
              <div className="text-left font-mono flex flex-col items-end">
                <div className="inline-block border-2 border-slate-900 px-3.5 py-1.5 rounded-none text-center mb-1 bg-slate-50 min-w-[170px]">
                  <span className="text-xs font-bold block text-slate-600">رقم الإشعار / السند</span>
                  <span className="text-sm sm:text-base font-black text-slate-900 font-mono block">{voucherNumber}</span>
                </div>
                <div className="text-xs text-slate-600 space-y-0.5 font-sans text-right" style={{ direction: 'rtl' }}>
                  <div>التاريخ: <span className="font-bold text-slate-900 font-mono">{todayDateStr}</span></div>
                  <div>الوقت: <span className="font-bold text-slate-900 font-mono">{todayTimeStr}</span></div>
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="mt-3 pt-3 border-t border-slate-300 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 px-3.5 py-1.5 rounded-none border border-slate-300">
                الفترة: {timeframeLabels[timeframe]}
              </span>
              <span className="text-xs font-bold text-slate-500">
                {sellerRoleLabel} / المستفيد: <strong className="text-slate-900">{seller?.name || 'غير محدد'}</strong>
              </span>
            </div>
          </div>

          {/* Fisherman Info Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 sm:p-4 bg-slate-50 rounded-none border border-slate-300 mb-5 text-xs sm:text-sm">
            <div>
              <span className="text-slate-500 font-bold block mb-0.5 text-xs">{sellerRoleTitle}</span>
              <span className="font-black text-slate-900 text-sm sm:text-base">{seller?.name || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block mb-0.5 text-xs">رقم الهاتف:</span>
              <span className="font-mono font-bold text-slate-800 text-sm sm:text-base">
                {seller?.phone ? seller.phone : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block mb-0.5 text-xs">عدد الشروات / العمليات الأساسية:</span>
              <span className="font-black text-blue-700 text-sm sm:text-base">
                {sellerMetrics.count} شروة بيع
              </span>
            </div>
          </div>

          {/* Transactions Breakdown Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-right text-xs sm:text-sm border border-slate-300">
              <thead className="bg-slate-100 text-slate-800 font-black border-b border-slate-300">
                <tr>
                  <th className="p-2.5 border-l border-slate-300 w-10 text-center">م</th>
                  <th className="p-2.5 border-l border-slate-300">رقم الفاتورة</th>
                  <th className="p-2.5 border-l border-slate-300">التاريخ والوقت</th>
                  <th className="p-2.5 border-l border-slate-300">المشتري</th>
                  <th className="p-2.5 border-l border-slate-300">الأسماك والكميات</th>
                  <th className="p-2.5 border-l border-slate-300 text-center">إجمالي البيع</th>
                  <th className="p-2.5 border-l border-slate-300 text-center">خصم العمولة (3%)</th>
                  <th className="p-2.5 border-l border-slate-300 text-center bg-slate-200">{isFishermanRole ? 'الصافي للصياد' : 'الصافي للبائع'}</th>
                  <th className="p-2.5 border-l border-slate-300 text-center bg-emerald-100/70">المسلّم نقداً</th>
                  <th className="p-2.5 text-center bg-amber-100/70">المتبقي ديناً على الحراج</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-400 font-medium">
                      لا توجد عمليات بيع مسجلة لهذا {sellerRoleLabel} خلال الفترة المحددة.
                    </td>
                  </tr>
                ) : (
                  transactions.map((t, index) => {
                    const paid = t.sellerPaidStatus === 'paid'
                      ? t.netToSeller
                      : (typeof t.sellerPaidAmount === 'number'
                        ? t.sellerPaidAmount
                        : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0));
                    const rem = Math.max(0, t.netToSeller - paid);
                    return (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="p-2 border-l border-slate-300 text-center font-mono font-bold text-slate-500">
                          {index + 1}
                        </td>
                        <td className="p-2 border-l border-slate-300 font-mono font-bold text-blue-700">
                          <div>{t.id}</div>
                          {isTransferredTransaction(t) ? (
                            <span className="text-[10px] font-bold text-purple-700 block mt-0.5">
                              (محولة)
                            </span>
                          ) : t.isEdited ? (
                            <span className="inline-block mt-0.5 text-[10px] font-bold text-amber-700">
                              تم التعديل
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 border-l border-slate-300 text-slate-600 font-mono text-[11px]">
                          {getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}{formatDisplayDate(t.timestamp, t.dateStr)} {t.timeStr}
                        </td>
                        <td className="p-2 border-l border-slate-300">
                          <div className="font-bold text-slate-800">{t.buyerName}</div>
                          <div className="text-[10px] text-slate-500">
                            {t.settlementType === 'direct_cash'
                              ? 'استلام يد بيد من المشتري'
                              : t.sellerPayoutMethod === 'exchange' || t.sellerExchangeName || t.notes?.includes('عبر الصرافة')
                                ? `صرف عبر الصرافة ${t.sellerExchangeName ? `(${t.sellerExchangeName})` : ''}`
                                : 'صرف عبر صندوق الجمعية'}
                          </div>
                        </td>
                        <td className="p-2 border-l border-slate-300 text-slate-700">
                          {t.items
                            .map((it) => `${it.fishName} (${it.quantity} ${it.unit})`)
                            .join('، ')}
                        </td>
                        <td className="p-2 border-l border-slate-300 text-center font-mono font-bold text-slate-900">
                          {formatCurrency(t.grossAmount, settings.currency)}
                        </td>
                        <td className="p-2 border-l border-slate-300 text-center font-mono font-bold text-red-600">
                          -{formatCurrency(t.sellerTaxAmount, settings.currency)}
                        </td>
                        <td className="p-2 border-l border-slate-300 text-center font-mono font-black text-slate-900 bg-slate-50">
                          {formatCurrency(t.netToSeller, settings.currency)}
                        </td>
                        <td className="p-2 border-l border-slate-300 text-center font-mono font-black text-emerald-800 bg-emerald-50/70">
                          {formatCurrency(paid, settings.currency)}
                        </td>
                        <td className="p-2 text-center font-mono font-bold">
                          {rem > 0 ? (
                            <span className="text-amber-900 font-black">{formatCurrency(rem, settings.currency)}</span>
                          ) : (
                            <span className="text-slate-400 font-normal">0 (خالص)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Payout Receipts Log (If any payouts made to fisherman) */}
          {payouts.length > 0 && (
            <div className="mb-6 p-4 bg-slate-50 border border-slate-300 rounded-none">
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-300 text-xs font-bold text-slate-800">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>سندات الدفعات المسلمة للصياد نقداً:</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {payouts.map((p) => (
                  <div key={p.id} className="p-2 bg-white rounded-none border border-slate-300 text-[11px] flex justify-between items-center">
                    <div>
                      <span className="font-mono font-bold text-emerald-700 block">{p.id}</span>
                      <span className="text-slate-500 text-[10px]">{p.dateStr} {p.timeStr}</span>
                    </div>
                    <span className="font-mono font-black text-slate-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {formatCurrency(p.amount, settings.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Totals Section */}
          <div className="flex justify-end mb-8">
            {/* Numerical Totals Box */}
            <div className="w-full max-w-md p-4 bg-slate-50 rounded-none border border-slate-300 space-y-2">
              <div className="flex justify-between items-center text-xs pb-1.5 border-b border-slate-300">
                <span className="text-slate-600 font-semibold">إجمالي قيمة مبيعات الصيد:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatCurrency(sellerMetrics.grossTotal, settings.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-1.5 border-b border-slate-300">
                <span className="text-red-700 font-semibold">خصم عمولة الحراج والجمعية (3%):</span>
                <span className="font-mono font-bold text-red-600 text-sm">
                  -{formatCurrency(sellerMetrics.deductionTotal, settings.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-1.5 border-b border-slate-300">
                <span className="text-blue-900 font-bold">{isFishermanRole ? 'صافي المستحق الكلي للصياد:' : 'صافي المستحق الكلي للبائع:'}</span>
                <span className="font-mono font-bold text-blue-700 text-sm">
                  {formatCurrency(sellerMetrics.netTotal, settings.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs pb-1.5 border-b border-slate-300">
                <span className="text-emerald-800 font-bold">إجمالي المبالغ المسلمة له:</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">
                  {formatCurrency(totalPaid, settings.currency)}
                </span>
              </div>
              <div className={`flex justify-between items-center p-3 rounded-none shadow-xs ${(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                  ? 'bg-amber-50 border border-amber-300 text-amber-950'
                  : 'bg-emerald-600 text-white'
                }`}>
                <span className="font-black text-sm">
                  {(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                    ? (isFishermanRole ? 'المتبقي للصياد ديناً على الحراج:' : 'المتبقي للبائع ديناً على الحراج:')
                    : (isFishermanRole ? 'صافي المبلغ المصروف للصياد:' : 'صافي المبلغ المصروف للبائع:')}
                </span>
                <span className="font-mono font-black text-lg">
                  {formatCurrency(
                    remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid),
                    settings.currency
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Official Signatures and Stamp Block */}
          <div className="border-t-2 border-slate-900 pt-6 mt-6">
            <div className="grid grid-cols-3 gap-6 text-center text-xs">
              <div>
                <span className="font-bold text-slate-700 block mb-12">توقيع واستلام {sellerRoleLabel} (المستفيد):</span>
                <div className="border-b border-dashed border-slate-400 mx-4"></div>
                <span className="text-[10px] text-slate-600 mt-1 block font-medium">
                  {(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                    ? `أقر باستلام الدفعات المسلمة أعلاه ومتبقي لي ديناً على الحراج مبلغ: ${formatCurrency(
                      remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid),
                      settings.currency
                    )}`
                    : 'أقر باستلام كامل المبلغ الصافي أعلاه وتصفية الحساب بالكامل'}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-12">توقيع المحاسب / أمين الصندوق:</span>
                <div className="border-b border-dashed border-slate-400 mx-4"></div>
                <span className="text-[10px] text-slate-500 mt-1 block">صرف نقداً بموجب الإشعار</span>
              </div>
              <div>
                <span className="font-bold text-slate-700 block mb-12">اعتماد إدارة الحراج والختم الرسمي:</span>
                <div className="w-20 h-20 mx-auto rounded-none border-2 border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                  مكان الختم
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THERMAL RECEIPT SLIP (80mm Thermal Mode)                               */}
      {/* ========================================================================= */}
      {printMode === 'thermal' && (
        <div className="printable-receipt-area relative mx-auto max-w-[380px] w-full bg-white text-black p-5 rounded-none shadow-xl font-mono text-[12px] border border-dashed border-slate-300 mb-8 print:shadow-none print:border-none print:p-1 print:max-w-full">
          {/* Horizontal developer credit at bottom of receipt */}
          <div className="invoice-margin-credit" aria-hidden="true" style={{ fontSize: '7.5px', bottom: '4px', left: 0, right: 0, textAlign: 'center' }}>
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Header */}
          <div className="text-center pb-2 border-b-2 border-black">
            <div className="flex justify-center mb-1.5">
              <img src="/logo.png" alt="الشعار" className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20" />
            </div>
            <h2 className="text-base font-black tracking-tight">{settings.marketName}</h2>
            <p className="text-[11px] font-bold text-gray-700">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
            {settings.location && <p className="text-[10px] text-gray-600">{settings.location}</p>}
            <div className="mt-2 inline-block px-3 py-0.5 border border-black rounded text-[11px] font-black uppercase bg-slate-900 text-white">
              {isFishermanRole ? 'إشعار تصفية وصرف مستحقات صياد' : 'إشعار تصفية وصرف مستحقات بائع'}
            </div>
          </div>

          {/* Metadata */}
          <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="font-bold">رقم الإشعار:</span>
              <span className="font-black font-sans">{voucherNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ والوقت:</span>
              <span dir="ltr" className="font-sans">{todayDateStr} - {todayTimeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">{sellerRoleTitle}</span>
              <span className="font-black">{seller?.name || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between">
              <span>الفترة:</span>
              <span className="font-bold">{timeframeLabels[timeframe]}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد الشروات:</span>
              <span className="font-bold">{sellerMetrics.count} شروة</span>
            </div>
          </div>

          {/* Transactions List */}
          <div className="py-2 border-b border-black">
            <div className="grid grid-cols-12 font-black text-[11px] pb-1 border-b border-gray-300">
              <span className="col-span-5 text-right">رقم العملية / الصنف</span>
              <span className="col-span-3 text-center">البيع</span>
              <span className="col-span-4 text-left">الصافي</span>
            </div>
            <div className="divide-y divide-gray-200 text-[11px] py-1">
              {transactions.map((t) => (
                <div key={t.id} className="py-1.5 space-y-0.5">
                  <div className="flex justify-between text-[10px] text-gray-600">
                    <span className="flex items-center gap-1 font-bold text-black">
                      <span>{t.id}</span>
                      {isTransferredTransaction(t) ? (
                        <span className="text-[9px] font-bold text-purple-700 print:text-black">
                          (محولة)
                        </span>
                      ) : t.isEdited ? (
                        <span className="text-[9px] font-bold text-amber-700 print:text-black">
                          [معدلة]
                        </span>
                      ) : null}
                    </span>
                    <span>{getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}{formatDisplayDate(t.timestamp, t.dateStr)}</span>
                  </div>
                  <div className="text-[10px] text-gray-800">
                    {t.items.map((it) => `${it.fishName} (${it.quantity} ${it.unit})`).join('، ')}
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span>الأساسي: {formatCurrency(t.grossAmount, '')}</span>
                    <span className="text-emerald-800">الصافي: {formatCurrency(t.netToSeller, settings.currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="py-2.5 space-y-1.5 text-[12px]">
            <div className="flex justify-between font-bold">
              <span>إجمالي قيمة المبيعات:</span>
              <span className="font-mono">{formatCurrency(sellerMetrics.grossTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-700">
              <span>خصم عمولة الحراج والجمعية (3%):</span>
              <span className="font-mono">-{formatCurrency(sellerMetrics.deductionTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-blue-900">
              <span>صافي المستحق الكلي:</span>
              <span className="font-mono">{formatCurrency(sellerMetrics.netTotal, settings.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-800">
              <span>إجمالي المسلم له:</span>
              <span className="font-mono">{formatCurrency(totalPaid, settings.currency)}</span>
            </div>
            <div className={`pt-2 border-t-2 border-black flex justify-between items-center text-sm font-black p-1.5 rounded ${(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                ? 'bg-amber-100 text-amber-950'
                : 'bg-gray-100'
              }`}>
              <span>
                {(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                  ? 'المتبقي للصياد ديناً على الحراج:'
                  : 'صافي المسلّم للصياد:'}
              </span>
              <span className="font-mono">
                {formatCurrency(
                  remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid),
                  settings.currency
                )}
              </span>
            </div>
          </div>

          {/* Tafqeet in Thermal */}
          <div className="py-2 text-[10px] text-center font-bold border-y border-dashed border-gray-400">
            {tafqeet(sellerMetrics.netTotal, settings.currency)}
          </div>

          {/* Signatures */}
          <div className="pt-4 space-y-4 text-[10px]">
            <div className="flex justify-between">
              <div>
                <span>توقيع واستلام الصياد:</span>
                <div className="mt-4 border-b border-black w-24"></div>
              </div>
              <div>
                <span>توقيع الصندوق:</span>
                <div className="mt-4 border-b border-black w-24"></div>
              </div>
            </div>
            <div className="text-center text-gray-600 pt-1 font-bold text-[9px]">
              {(remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid)) > 0
                ? `متبقي للصياد ديناً على الحراج: ${formatCurrency(
                  remainingBalance !== undefined ? remainingBalance : Math.max(0, sellerMetrics.netTotal - totalPaid),
                  settings.currency
                )}`
                : 'تمت تصفية كامل المستحقات بالكامل'}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SERVICE INVOICE (فاتورة خدمية - مطابقة للنموذج المعتمد)                 */}
      {/* ========================================================================= */}
      {printMode === 'service' && (
        <div
          style={{
            transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
            transformOrigin: 'top center',
          }}
          className="printable-service-invoice-area w-full max-w-4xl bg-white text-black rounded-none shadow-xl border border-slate-300 p-4 sm:p-6 mb-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full print:transform-none font-sans relative transition-transform duration-150"
        >
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Watermark Logo in Center of Invoice (الشعار في وسط الفاتورة كبير كمسودة / علامة مائية) */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute inset-0 flex items-center justify-center z-0 overflow-hidden rounded-none print:rounded-none"
          >
            <img
              src="/logo.png"
              alt=""
              className="w-64 h-64 sm:w-80 sm:h-80 md:w-[420px] md:h-[420px] object-contain opacity-[0.07] print:opacity-[0.08] filter grayscale"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="relative z-10">
            {/* Header with Bilingual Layout Exactly Matching Buyer Invoice */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                {/* Right: Market Info Arabic */}
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
                    فاتورة خدمية
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
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-300">
                <div className="flex items-center gap-2">
                  <span className="bg-slate-900 text-white px-2.5 py-0.5 rounded text-[11px] font-black font-sans">
                    فاتورة خدمية
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

              {/* Bottom row: Seller details */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">{sellerRoleTitle}</span>
                  <span className="font-black text-slate-900 text-sm">{seller?.name || 'غير محدد'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">العملة:</span>
                  <span className="font-bold text-slate-800">ريال {currencyLabel}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-bold">عدد الشروات / العمليات:</span>
                  <span className="font-bold text-slate-800">{serviceInvoiceRows.length} شروة</span>
                </div>
              </div>
            </div>

            {/* Items & Sales Table */}
            <div className="mb-5 overflow-x-auto">
              <table className="w-full text-right text-xs border border-slate-300">
                <thead className="bg-slate-900 text-white font-black border-b border-slate-900">
                  <tr>
                    <th className="p-2 border border-slate-700 w-10 text-center">م</th>
                    <th className="p-2 border border-slate-700 text-right w-44">اسم المشتري</th>
                    <th className="p-2 border border-slate-700 text-center w-28">رقم الهاتف</th>
                    <th className="p-2 border border-slate-700 text-right">الصنف / البيان</th>
                    <th className="p-2 border border-slate-700 text-center w-16">الوحدة</th>
                    <th className="p-2 border border-slate-700 text-center w-20">الكمية</th>
                    <th className="p-2.5 border border-slate-700 text-left w-32 whitespace-nowrap">سعر الوحدة</th>
                    <th className="p-2.5 border border-slate-700 text-left w-36 whitespace-nowrap">القيمة الإجمالية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {serviceInvoiceRows.map((row, idx) => (
                    <tr key={row.id || idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-slate-100/50 transition-colors`} style={{ minHeight: '30px' }}>
                      <td className="py-2.5 px-2 border-l border-slate-300 text-center font-mono font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 font-black text-slate-900 truncate">{row.buyerName}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 text-center font-mono font-bold text-slate-700" dir="ltr">{row.buyerPhone || '—'}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 font-bold text-slate-800 truncate">{row.description}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 text-center text-slate-600 font-bold">{row.unit}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 text-center font-mono font-bold">{formatNumber(row.quantity)}</td>
                      <td className="py-2.5 px-2 border-l border-slate-300 text-left font-mono font-bold">{formatNumber(row.unitPrice)}</td>
                      <td className="py-2.5 px-2 text-left font-mono font-black text-blue-700">{formatNumber(row.totalGross)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 17 - serviceInvoiceRows.length) }).map((_, emptyIdx) => {
                    const rowNumber = serviceInvoiceRows.length + emptyIdx + 1;
                    return (
                      <tr key={`empty-row-${emptyIdx}`} className={rowNumber % 2 === 0 ? 'bg-slate-50/40' : 'bg-white'} style={{ height: '30px' }}>
                        <td className="py-2 px-2 border-l border-slate-300 text-center font-mono font-bold text-slate-300">{rowNumber}</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2 border-l border-slate-300">&nbsp;</td>
                        <td className="py-2 px-2">&nbsp;</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-bold">
                    <td colSpan={6} rowSpan={3} className="p-3 text-center align-middle bg-slate-50/60 border-l border-slate-300">
                      <div className="text-xs sm:text-sm font-black text-slate-800 leading-relaxed px-2 text-center">
                        {tafqeetWords}
                      </div>
                    </td>
                    <td className="p-3 text-left font-black bg-slate-100 text-slate-900 border-l border-slate-300 text-xs sm:text-sm whitespace-nowrap">
                      الإجمالي:
                    </td>
                    <td className="p-3 text-left font-mono font-black text-xs sm:text-sm bg-slate-50 text-slate-900 whitespace-nowrap">
                      {formatNumber(totalGrossAmount)}
                    </td>
                  </tr>
                  <tr className="font-bold border-t border-slate-300">
                    <td className="p-3 text-left font-bold text-slate-700 bg-slate-50 border-l border-slate-300 text-xs sm:text-sm whitespace-nowrap">
                      مبلغ العمولة:
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-xs sm:text-sm bg-white text-rose-700 whitespace-nowrap">
                      {formatNumber(commissionAmount)}
                    </td>
                  </tr>
                  <tr className="font-black border-t border-slate-300">
                    <td className="p-3 text-left font-black text-emerald-900 bg-emerald-100/70 border-l border-slate-300 text-xs sm:text-sm whitespace-nowrap">
                      المتبقي:
                    </td>
                    <td className="p-3 text-left font-mono font-black text-sm sm:text-base bg-emerald-50 text-emerald-800 whitespace-nowrap">
                      {formatNumber(netDueToSeller)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Signatures & Official Stamp (Exact match to buyer invoice) */}
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
                  {employeeName && (
                    <p className="text-[10px] text-slate-500 font-medium">الموظف: {employeeName}</p>
                  )}
                </div>
              </div>
              <div className="text-center text-[10px] text-slate-500 pt-3 border-t border-slate-300 flex justify-between items-center print:border-black font-sans">
                <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
                <span>شكراً لتعاملكم معنا</span>
                <span className="font-mono">حررت: {todayDateStr} - {todayTimeStr}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Feedback for PDF Export */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900/95 text-white px-5 py-3 rounded-none shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{exportToast}</span>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="p-1 hover:bg-slate-800 rounded-none text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
