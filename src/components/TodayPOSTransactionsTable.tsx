import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Transaction, MarketSettings, Contact } from '../types';
import {
  formatCurrency,
  formatDisplayDate,
  isSameCalendarDay,
  isTransferredTransaction,
  getResoldDetails,
  getTodayLocalYMD,
  normalizeArabic,
  getTransactionBuyerDebt,
} from '../utils/calculations';
import {
  Printer,
  Sparkles,
  CheckCircle2,
  Fish,
  ArrowUpDown,
  MoreVertical,
  Pencil,
  FileText,
  Loader2,
  Share2,
  Calendar,
  Search,
  X,
} from 'lucide-react';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { exportTransactionsDayReportPdfA4, printTransactionsDayReportA4Direct } from '../utils/invoiceExport';
import {
  ShareTarget,
  shareTransactionsDayReportPdf,
  shareInvoicePdf,
} from '../utils/shareUtils';

interface TodayPOSTransactionsTableProps {
  transactions: Transaction[];
  settings: MarketSettings;
  contacts?: Contact[];
  onOpenReceipt?: (trx: Transaction) => void;
  onEditTransaction?: (trx: Transaction) => void;
  onOpenSellerStatement?: (nameOrId: string) => void;
  onOpenBuyerStatement?: (nameOrId: string) => void;
  highlightedTrxId?: string | null;
}

export const TodayPOSTransactionsTable: React.FC<TodayPOSTransactionsTableProps> = ({
  transactions,
  settings,
  contacts = [],
  onOpenReceipt,
  onEditTransaction,
  onOpenSellerStatement,
  onOpenBuyerStatement,
  highlightedTrxId,
}) => {
  // تصفية فواتير اليوم أو تاريخ محدد (يوم/شهر/سنة)
  const [selectedDate, setSelectedDate] = useState<string>(''); // YYYY-MM-DD
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isViewingToday = useMemo(() => {
    if (!selectedDate) return true;
    return isSameCalendarDay(selectedDate, new Date());
  }, [selectedDate]);

  const selectedDateDisplay = useMemo(() => {
    if (!selectedDate) {
      return formatDisplayDate(undefined, getTodayLocalYMD());
    }
    return formatDisplayDate(undefined, selectedDate);
  }, [selectedDate]);

  // تصفية الفواتير بناءً على التاريخ المحدد (أو اليوم افتراضياً) والبحث
  const displayedTransactions = useMemo(() => {
    let list = (transactions || []).filter((t) => {
      if (!selectedDate) {
        const today = new Date();
        return isSameCalendarDay(t.dateStr || t.timestamp, today);
      }
      return isSameCalendarDay(t.dateStr || t.timestamp, selectedDate);
    });

    if (searchQuery.trim()) {
      const q = normalizeArabic(searchQuery.trim().toLowerCase());
      const rawQ = searchQuery.trim().toLowerCase();
      const numQ = searchQuery.trim().replace(/\D/g, '');

      list = list.filter((t) => {
        const idMatch = (t.id || '').toLowerCase().includes(rawQ);
        const buyerMatch = normalizeArabic(t.buyerName || '').includes(q);
        const sellerMatch = normalizeArabic(t.sellerName || '').includes(q);
        const fishMatch = t.items?.some((it) => normalizeArabic(it.fishName || '').includes(q));
        const amountMatch = numQ
          ? String(t.grossAmount || '').includes(numQ) ||
            String(t.totalFromBuyer || '').includes(numQ) ||
            String(t.netToSeller || '').includes(numQ)
          : false;
        return idMatch || buyerMatch || sellerMatch || fishMatch || amountMatch;
      });
    }

    return list;
  }, [transactions, selectedDate, searchQuery]);

  // حساب إجماليات الفواتير المعروضة
  const totals = useMemo(() => {
    let gross = 0;
    let totalBuyer = 0;
    let netSeller = 0;
    let profit = 0;
    displayedTransactions.forEach((t) => {
      gross += t.grossAmount || 0;
      totalBuyer += t.totalFromBuyer || 0;
      netSeller += t.netToSeller || 0;
      profit += t.harajProfit || 0;
    });
    return { gross, totalBuyer, netSeller, profit };
  }, [displayedTransactions]);

  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [actionMenuTrxId, setActionMenuTrxId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isSharingDayReport, setIsSharingDayReport] = useState(false);
  const [isPrintingDayReport, setIsPrintingDayReport] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // تصدير كشف الحركة كملف PDF رسمي (A4) لليوم أو للتاريخ المحدد
  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const employee = localStorage.getItem('haraj_preferred_employee') || '';
      const timeframeLabel = isViewingToday
        ? `حركات اليوم (${selectedDateDisplay})`
        : `حركات يوم (${selectedDateDisplay})`;
      const res = await exportTransactionsDayReportPdfA4(
        displayedTransactions,
        settings,
        timeframeLabel,
        employee,
        contacts
      );
      if (res && res.message) {
        setExportToast(res.message);
        setTimeout(() => setExportToast(null), 5000);
      }
    } catch (err: any) {
      setExportToast('فشل تصدير ملف PDF: ' + (err?.message || 'خطأ أثناء المعالجة'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintDayReport = async () => {
    try {
      setIsPrintingDayReport(true);
      const employee = localStorage.getItem('haraj_preferred_employee') || '';
      const timeframeLabel = isViewingToday
        ? `حركات اليوم (${selectedDateDisplay})`
        : `حركات يوم (${selectedDateDisplay})`;
      const res = await printTransactionsDayReportA4Direct(
        displayedTransactions,
        settings,
        timeframeLabel,
        employee,
        contacts
      );
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشل الطباعة: ' + (err?.message || 'خطأ أثناء المعالجة'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsPrintingDayReport(false);
    }
  };

  // مشاركة تقرير حركة الفواتير عبر الخيارات المتاحة لليوم أو التاريخ المحدد
  const handleShareDayReport = async (target: ShareTarget) => {
    setIsSharingDayReport(true);
    try {
      const employee = localStorage.getItem('haraj_preferred_employee') || '';
      const timeframeLabel = isViewingToday
        ? `حركات اليوم (${selectedDateDisplay})`
        : `حركات يوم (${selectedDateDisplay})`;
      const res = await shareTransactionsDayReportPdf(
        displayedTransactions,
        settings,
        target,
        timeframeLabel,
        employee,
        contacts
      );
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ أثناء المشاركة'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSharingDayReport(false);
    }
  };

  // مشاركة فاتورة فردية كملف PDF
  const handleShareSingleInvoice = async (trx: Transaction, target: ShareTarget) => {
    try {
      const res = await shareInvoicePdf(trx, settings, target, 'both');
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    }
  };

  // إغلاق قائمة الخيارات المنبثقة عند النقر في أي مكان خارجها
  useEffect(() => {
    const handleOutsideClick = () => {
      if (actionMenuTrxId !== null) {
        setActionMenuTrxId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [actionMenuTrxId]);

  // تحديث التحديد تلقائياً عند إضافة فاتورة جديدة
  useEffect(() => {
    if (highlightedTrxId && displayedTransactions.length > 0) {
      const idx = displayedTransactions.findIndex((t) => t.id === highlightedTrxId);
      if (idx !== -1) setSelectedIndex(idx);
    }
  }, [highlightedTrxId, displayedTransactions]);

  // التنقل بأسهم الكيبورد (فوق وتحت) وفتح الفاتورة بـ Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (displayedTransactions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < displayedTransactions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (selectedIndex >= 0 && selectedIndex < displayedTransactions.length) {
        e.preventDefault();
        onOpenReceipt?.(displayedTransactions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setActionMenuTrxId(null);
      setSelectedIndex(-1);
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="mt-2 bg-white rounded-none border border-slate-300 shadow-xs overflow-hidden transition-all focus:outline-none focus:ring-1 focus:ring-blue-600"
      title="انقر هنا أو استخدم أسهم الكيبورد [↓ ↑] للتنقل بين فواتير اليوم واضغط [Enter] للمعاينة والطباعة"
    >
      {/* شريط عنوان الجدول بتنسيق ERP كلاسيكي مع أزرار التصدير والمشاركة وتحديد التاريخ */}
      <div className="bg-[#e9f1fb] border-b border-slate-300 px-3 py-1.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Fish className="w-4 h-4 text-blue-700 shrink-0" />
          <span className="font-bold text-xs text-slate-800">
            {isViewingToday
              ? 'سجل فواتير اليوم المباشرة (حركات الحراج)'
              : `سجل فواتير يوم (${selectedDateDisplay})`}
          </span>
          <span className="text-[11px] font-mono font-bold bg-white text-blue-800 border border-slate-300 px-2 py-0.2">
            {displayedTransactions.length} فاتورة
          </span>
          <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 font-bold hidden sm:inline-flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" />
            <span>التنقل بالأسهم [↓ ↑] | المعاينة [Enter]</span>
          </span>
        </div>

        {/* أزرار خيارات التصدير والمشاركة والبحث وتحديد تاريخ محدد */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* حقل البحث السريع عن الفاتورة */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-2 py-0.5 rounded-none shadow-2xs">
            <Search className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(-1);
              }}
              placeholder="بحث برقم الفاتورة، الصياد، المشتري، السمك..."
              className="bg-transparent text-slate-900 font-bold text-xs outline-none placeholder:text-slate-400 placeholder:font-normal py-0.5 w-36 sm:w-52"
              title="بحث سريع برقم الفاتورة أو اسم الصياد أو المشتري أو نوع السمك أو المبلغ"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedIndex(-1);
                }}
                className="text-slate-400 hover:text-rose-600 font-bold text-xs cursor-pointer px-1"
                title="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* حقل تحديد تاريخ محدد (يوم/شهر/سنة) لاختيار وعرض فواتير أي يوم */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-0.5 rounded-none shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <label htmlFor="pos-table-specific-date" className="font-bold text-xs text-slate-700 whitespace-nowrap cursor-pointer">
              تاريخ محدد:
            </label>
            <input
              id="pos-table-specific-date"
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedIndex(-1);
              }}
              placeholder="يوم/شهر/سنة"
              className="bg-transparent text-slate-900 font-bold text-xs outline-none cursor-pointer font-mono py-0.5"
              title="تحديد يوم/شهر/سنة لعرض فواتيره"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate('');
                  setSelectedIndex(-1);
                }}
                className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-900 font-bold text-[10px] rounded-none cursor-pointer border border-blue-300 transition-colors"
                title="الرجوع إلى فواتير اليوم"
              >
                اليوم
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handlePrintDayReport}
            disabled={isPrintingDayReport || displayedTransactions.length === 0}
            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-900 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shadow-2xs"
            title="طباعة فواتير اليوم أو التاريخ المحدد مباشرة"
          >
            {isPrintingDayReport ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
            ) : (
              <Printer className="w-3.5 h-3.5 text-blue-700" />
            )}
            <span>طباعة الفواتير</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf || displayedTransactions.length === 0}
            className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-900 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shadow-2xs"
            title="تصدير تقرير الحركة كملف PDF رسمي بحجم A4"
          >
            {isExportingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-blue-700" />
            )}
            <span>تصدير PDF (A4)</span>
          </button>

          <ShareOptionsDropdown
            onShare={handleShareDayReport}
            isSharing={isSharingDayReport}
            title="مشاركة تقرير حركة الفواتير كملف PDF رسمي بحجم A4 (LocalSend، بلوتوث، واتساب)"
            buttonClassName="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 shadow-2xs"
            iconClassName="w-3.5 h-3.5 text-blue-700"
            buttonLabel="خيارات المشاركة (PDF)"
            align="left"
            id="today-pos-share-day-report-btn"
          />
        </div>
      </div>

      {/* رسالة إشعار التصدير والمشاركة */}
      {exportToast && (
        <div className="bg-blue-50 border-b border-blue-200 px-3 py-1.5 text-xs text-blue-900 font-bold flex items-center justify-between animate-in fade-in">
          <span>{exportToast}</span>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="text-blue-600 hover:text-blue-800 text-[11px] cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* الجدول مع تطبيق نمط تلوين الصفوف بالتناوب من الصورة المرفقة (Zebra Peach/Cream & White) */}
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs border-collapse">
          <thead>
            <tr className="bg-[#fae8d4] text-slate-900 font-bold border-b border-slate-300">
              <th className="p-2 border border-slate-300 text-center"># الفاتورة</th>
              <th className="p-2 border border-slate-300 text-center">الوقت</th>
              <th className="p-2 border border-slate-300">الصياد</th>
              <th className="p-2 border border-slate-300">المشتري</th>
              <th className="p-2 border border-slate-300">التسوية / الدفع</th>
              <th className="p-2 border border-slate-300">الأسماك</th>
              <th className="p-2 border border-slate-300 text-center">الأساسي (Gross)</th>
              <th className="p-2 border border-slate-300 text-center">المطلوب (+2%)</th>
              <th className="p-2 border border-slate-300 text-center">صافي الصياد (-3%)</th>
              <th className="p-2 border border-slate-300 text-center">دخل الحراج (5%)</th>
              <th className="p-2 border border-slate-300 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {displayedTransactions.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 px-4 text-center border border-slate-300 bg-white">
                  <div className="max-w-md mx-auto flex flex-col items-center justify-center text-slate-400 space-y-2">
                    <div className="w-10 h-10 bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-400">
                      <Fish className="w-5 h-5 stroke-[1.5]" />
                    </div>
                    <div className="font-bold text-slate-600 text-xs">
                      {searchQuery
                        ? `لا توجد نتائج بحث مطابقة لـ "${searchQuery}"`
                        : selectedDate
                        ? `لا توجد فواتير مسجلة في تاريخ (${selectedDateDisplay})`
                        : 'لا توجد فواتير مسجلة اليوم حتى الآن'}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {searchQuery
                        ? 'تأكد من كتابة رقم الفاتورة أو اسم الصياد أو المشتري بشكل صحيح، أو امسح البحث.'
                        : selectedDate
                        ? 'يمكنك اختيار تاريخ آخر أو النقر على "اليوم" للرجوع لفواتير اليوم الحالي.'
                        : 'عند تسجيل الفاتورة من النموذج أعلاه، ستظهر في هذا الجدول مباشرة.'}
                    </p>
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="mt-1 px-3 py-1 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-none cursor-pointer"
                      >
                        مسح البحث وعرض كل الفواتير
                      </button>
                    )}
                    {!searchQuery && selectedDate && (
                      <button
                        type="button"
                        onClick={() => setSelectedDate('')}
                        className="mt-1 px-3 py-1 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-none cursor-pointer"
                      >
                        عرض فواتير اليوم
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              displayedTransactions.map((t, index) => {
                const isSelected = selectedIndex === index;
                const isHighlighted = highlightedTrxId === t.id;
                // أسلوب تلوين الصفوف بالتناوب (Zebra Striping) مطابقة تماماً للصورة:
                // صف بخلفية بيضاء (#ffffff) وصف بخلفية بيج/كريمي دافئ (#FDEBD9)
                const isEvenRow = index % 2 === 1;

                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedIndex(index)}
                    onDoubleClick={() => onOpenReceipt?.(t)}
                    className={`transition-colors duration-100 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-100 ring-2 ring-amber-600 font-bold text-amber-950 shadow-xs'
                        : isHighlighted
                        ? 'bg-emerald-100 ring-1 ring-emerald-500 font-bold'
                        : isEvenRow
                        ? 'bg-[#FDEBD9] hover:bg-[#FCD8BE]'
                        : 'bg-white hover:bg-[#FFF7F0]'
                    }`}
                  >
                    {/* رقم الفاتورة */}
                    <td className="p-2 border border-slate-300 font-mono font-bold text-blue-800 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <span>{t.id}</span>
                        {isHighlighted && (
                          <span className="px-1 py-0.2 text-[9px] font-bold bg-emerald-600 text-white flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            جديد
                          </span>
                        )}
                      </div>
                      {isTransferredTransaction(t) ? (
                        <div className="mt-0.5">
                          <span className="text-[10px] font-bold text-purple-700">
                            (محولة)
                          </span>
                        </div>
                      ) : t.isEdited ? (
                        <div className="mt-0.5 text-[10px] font-bold text-amber-700">
                          تم التعديل
                        </div>
                      ) : null}
                    </td>

                    {/* الوقت */}
                    <td className="p-2 border border-slate-300 text-slate-700 text-center whitespace-nowrap">
                      <div className="font-bold font-mono text-[11px]">{t.timeStr || '--:--'}</div>
                      <div className="text-[9px] text-slate-500">
                        {formatDisplayDate(t.timestamp, t.dateStr)}
                      </div>
                    </td>

                    {/* الصياد */}
                    <td className="p-2 border border-slate-300">
                      <div className="flex items-center gap-1 flex-wrap">
                        {onOpenSellerStatement ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenSellerStatement(t.sellerName || t.sellerId || '');
                            }}
                            className="font-bold text-slate-900 hover:text-emerald-700 hover:underline cursor-pointer flex items-center gap-1 text-right group"
                            title={`انقر لعرض كشف حساب ومستحقات الصياد: ${t.sellerName}`}
                          >
                            <span>{t.sellerName}</span>
                            <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-0.2 opacity-80 group-hover:opacity-100">
                              كشف حساب
                            </span>
                          </button>
                        ) : (
                          <span className="font-bold text-slate-900">{t.sellerName}</span>
                        )}
                        {(t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) && (
                          <span className="text-[9px] font-bold text-purple-800 bg-purple-100 px-1 border border-purple-200">
                            (إعادة بيع)
                          </span>
                        )}
                      </div>
                      {(() => {
                        const sellerPaid =
                          t.sellerPaidStatus === 'paid'
                            ? t.netToSeller
                            : typeof t.sellerPaidAmount === 'number'
                            ? t.sellerPaidAmount
                            : typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid'
                            ? t.paidAtPosAmount
                            : 0;

                        const isResaleTrx = t.isResale || t.notes?.startsWith('إعادة بيع شروة من:');
                        if (isResaleTrx) {
                          const surplusAmount = t.resaleSurplus || 0;
                          return (
                            surplusAmount > 0 && (
                              <div className="text-[10px] font-bold text-emerald-800 mt-0.5">
                                فائض بالدرج: {formatCurrency(surplusAmount, settings.currency)}
                              </div>
                            )
                          );
                        }

                        const sellerRem = Math.max(0, t.netToSeller - sellerPaid);
                        if (sellerRem > 0 && t.settlementType !== 'direct_cash') {
                          return (
                            <div className="text-[10px] font-bold text-amber-800 mt-0.5">
                              دين للصياد: {formatCurrency(sellerRem, settings.currency)}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>

                    {/* المشتري */}
                    <td className="p-2 border border-slate-300">
                      <div className="flex items-center gap-1 flex-wrap">
                        {onOpenBuyerStatement ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenBuyerStatement(t.buyerName || t.buyerId || '');
                            }}
                            className="font-bold text-blue-900 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1 text-right group"
                            title={`انقر لعرض كشف حساب ومطالبة المشتري: ${t.buyerName}`}
                          >
                            <span>{t.buyerName}</span>
                            <span className="text-[9px] text-blue-700 bg-blue-50 border border-blue-200 px-1 py-0.2 opacity-80 group-hover:opacity-100">
                              كشف حساب
                            </span>
                          </button>
                        ) : (
                          <span className="font-bold text-blue-900">{t.buyerName}</span>
                        )}
                      </div>
                      {t.buyerPhone && (
                        <div className="text-[10px] text-slate-500 font-mono">{t.buyerPhone}</div>
                      )}
                    </td>

                    {/* التسوية والدين */}
                    <td className="p-2 border border-slate-300 whitespace-nowrap">
                      {(() => {
                        const resoldInfo = getResoldDetails(t);
                        if (resoldInfo.isResold) {
                          const remainingDebt =
                            typeof t.buyerRemainingDebt === 'number'
                              ? t.buyerRemainingDebt
                              : t.totalFromBuyer;
                          return (
                            <div className="space-y-0.5">
                              {resoldInfo.isSettled ? (
                                <div className="text-[11px] font-bold text-purple-800">
                                  تمت التسوية بإعادة البيع ✓
                                </div>
                              ) : (
                                <div className="text-[11px] font-bold text-amber-800">
                                  إعادة بيع (معلقة)
                                </div>
                              )}
                              {!resoldInfo.isSettled && (
                                <div className="text-[10px] font-bold text-red-700 font-mono">
                                  دين: {formatCurrency(remainingDebt, settings.currency)}
                                </div>
                              )}
                            </div>
                          );
                        }

                        const st = t.settlementType || 'association_cash';
                        const remaining = getTransactionBuyerDebt(t);

                        return (
                          <div className="space-y-0.5">
                            {st === 'association_cash' && (
                              <div className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                كاش بالصندوق
                              </div>
                            )}
                            {st === 'direct_cash' && (
                              <div className="text-[11px] font-bold text-slate-700">
                                مباشر يد بيد
                              </div>
                            )}
                            {st === 'association_credit' && (
                              <div className="text-[11px] font-bold text-rose-700">
                                آجل (دين)
                              </div>
                            )}
                            {st === 'partial_cash' && (
                              <div className="text-[11px] font-bold text-amber-800">
                                دفع جزئي
                              </div>
                            )}

                            {remaining > 0 ? (
                              <div className="text-[10px] font-mono font-bold text-red-700">
                                متبقي: {formatCurrency(remaining, settings.currency)}
                              </div>
                            ) : (
                              (st === 'association_credit' || st === 'partial_cash') && (
                                <div className="text-[10px] font-bold text-emerald-700">
                                  تم السداد بالكامل ✓
                                </div>
                              )
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* الأسماك */}
                    <td className="p-2 border border-slate-300">
                      <div className="space-y-0.5 max-w-[200px]">
                        {t.items.map((it, idx) => (
                          <div key={idx} className="text-slate-800 flex items-center gap-1 text-[11px]">
                            <span className="w-1.5 h-1.5 bg-blue-600 shrink-0"></span>
                            <span className="font-semibold truncate">{it.fishName}:</span>
                            <span className="text-slate-600 font-mono text-[10px] shrink-0">
                              {it.quantity} {it.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* الأساسي (Gross) */}
                    <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                      {formatCurrency(t.grossAmount, settings.currency)}
                    </td>

                    {/* المطلوب من المشتري (+2%) */}
                    <td className="p-2 border border-slate-300 text-center font-mono font-bold text-blue-900 whitespace-nowrap">
                      {formatCurrency(t.totalFromBuyer, settings.currency)}
                      <div className="text-[9px] text-blue-700 font-sans">
                        (+{Math.round(t.buyerTaxAmount)})
                      </div>
                    </td>

                    {/* صافي الصياد (-3%) */}
                    <td className="p-2 border border-slate-300 text-center font-mono font-bold text-emerald-800 whitespace-nowrap">
                      {formatCurrency(t.netToSeller, settings.currency)}
                      <div className="text-[9px] text-red-700 font-sans">
                        (-{Math.round(t.sellerTaxAmount)})
                      </div>
                    </td>

                    {/* دخل الجمعية (5%) */}
                    <td className="p-2 border border-slate-300 text-center font-mono font-black text-indigo-900 whitespace-nowrap">
                      {formatCurrency(t.harajProfit, settings.currency)}
                    </td>

                    {/* إجراءات سريعة: قائمة ثلاث نقاط */}
                    <td className="p-2 border border-slate-300 text-center whitespace-nowrap relative">
                      <div className="relative inline-block text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuTrxId(actionMenuTrxId === t.id ? null : t.id);
                          }}
                          className={`p-1 rounded-none border transition-colors cursor-pointer flex items-center justify-center ${
                            actionMenuTrxId === t.id
                              ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                              : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-300'
                          }`}
                          title="خيارات الفاتورة (طباعة / تعديل)"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* القائمة المنبثقة للخيارات */}
                        {actionMenuTrxId === t.id && (
                          <div
                            className={`absolute left-0 w-44 bg-white border border-slate-300 shadow-xl z-50 py-1 text-right animate-in fade-in zoom-in-95 duration-100 rounded-none ${
                              index >= displayedTransactions.length - 2 && displayedTransactions.length > 2
                                ? 'bottom-full mb-1'
                                : 'top-full mt-1'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {onOpenReceipt && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuTrxId(null);
                                  onOpenReceipt(t);
                                }}
                                className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors cursor-pointer text-right"
                              >
                                <Printer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>معاينة وطباعة الفاتورة</span>
                              </button>
                            )}
                            {onEditTransaction && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuTrxId(null);
                                  onEditTransaction(t);
                                }}
                                className="w-full px-3 py-2 text-xs font-bold text-slate-800 hover:bg-amber-50 hover:text-amber-800 flex items-center gap-2 transition-colors cursor-pointer border-t border-slate-100 text-right"
                              >
                                <Pencil className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>تعديل واسترجاع الفاتورة</span>
                              </button>
                            )}

                            {/* خيارات مشاركة الفاتورة الفردية كـ PDF */}
                            <div className="border-t border-slate-100 pt-1">
                              <div className="px-3 py-1 text-[10px] font-bold text-slate-400">
                                مشاركة الفاتورة كـ PDF:
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuTrxId(null);
                                  handleShareSingleInvoice(t, 'whatsapp');
                                }}
                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2 transition-colors cursor-pointer text-right"
                              >
                                <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>عبر واتساب</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuTrxId(null);
                                  handleShareSingleInvoice(t, 'localsend');
                                }}
                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 flex items-center gap-2 transition-colors cursor-pointer text-right"
                              >
                                <Share2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                                <span>عبر LocalSend</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionMenuTrxId(null);
                                  handleShareSingleInvoice(t, 'bluetooth');
                                }}
                                className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-800 flex items-center gap-2 transition-colors cursor-pointer text-right"
                              >
                                <Share2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>عبر البلوتوث</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {displayedTransactions.length > 0 && (
            <tfoot>
              <tr className="bg-[#fae8d4] text-slate-900 font-bold border-t-2 border-slate-400">
                <td colSpan={6} className="p-2 border border-slate-300 text-center font-bold">
                  الإجمالي العام ({displayedTransactions.length} فاتورة)
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-900">
                  {totals.gross.toLocaleString('en-US')}
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono font-bold text-blue-900">
                  {totals.totalBuyer.toLocaleString('en-US')}
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono font-bold text-emerald-900">
                  {totals.netSeller.toLocaleString('en-US')}
                </td>
                <td className="p-2 border border-slate-300 text-center font-mono font-bold text-amber-900">
                  {totals.profit.toLocaleString('en-US')}
                </td>
                <td className="p-2 border border-slate-300 text-center text-slate-400 text-[10px]">
                  -
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};
