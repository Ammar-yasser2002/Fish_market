import React, { useState, useMemo, useEffect } from 'react';
import { Transaction, MarketSettings } from '../types';
import { formatCurrency, formatArabicDayOnly, isSameCalendarDay } from '../utils/calculations';
import {
  TrendingUp,
  X,
  Printer,
  Calendar,
  Zap,
  Fish,
  DollarSign,
  PieChart,
  CheckCircle2,
  FileText,
  Activity,
  Coins,
  Download,
  Loader2,
  Search,
} from 'lucide-react';
import {
  printAssociationProfitA4Direct,
  exportAssociationProfitPdfA4,
} from '../utils/invoiceExport';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareAssociationProfitPdf, ShareTarget } from '../utils/shareUtils';

const toStandardYmd = (dateInput?: string | number | Date): string => {
  if (!dateInput) return '';
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  if (dateInput instanceof Date) {
    if (!isNaN(dateInput.getTime())) {
      const y = dateInput.getFullYear();
      const m = String(dateInput.getMonth() + 1).padStart(2, '0');
      const day = String(dateInput.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    const matchYMD = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (matchYMD) {
      return `${matchYMD[1]}-${matchYMD[2].padStart(2, '0')}-${matchYMD[3].padStart(2, '0')}`;
    }
    const matchDMY = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (matchDMY) {
      return `${matchDMY[3]}-${matchDMY[2].padStart(2, '0')}-${matchDMY[1].padStart(2, '0')}`;
    }
    const d = new Date(trimmed.replace(/-/g, '/'));
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return '';
};

interface AssociationProfitModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  settings: MarketSettings;
}

export const AssociationProfitModal: React.FC<AssociationProfitModalProps> = ({
  isOpen,
  onClose,
  transactions,
  settings,
}) => {
  const [activeTab, setActiveTab] = useState<'dailyHistory' | 'fishSpecies'>('dailyHistory');
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [printingDay, setPrintingDay] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);

  // ── حالات البحث وتصفية الأيام بالتاريخ ──
  const [searchDate, setSearchDate] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [searchDayQuery, setSearchDayQuery] = useState<string>('');
  const [activeDatePreset, setActiveDatePreset] = useState<'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth'>('all');

  // Today's date string in YYYY-MM-DD
  const todayDateStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // حدود الفترات الزمنية للبحث السريع
  const dateBoundaries = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const todayStr = toYmd(now);

    const yDate = new Date(now);
    yDate.setDate(now.getDate() - 1);
    const yesterdayStr = toYmd(yDate);

    // آخر 7 أيام (أسبوع)
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const weekAgoStr = toYmd(weekAgo);

    // بداية الشهر الحالي
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = toYmd(monthStart);

    return {
      todayStr,
      yesterdayStr,
      weekAgoStr,
      monthStartStr,
    };
  }, []);

  // Handle keyboard ESC and Print
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrintAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, transactions, settings]);

  // 1. Today's Transactions & Profits (current calendar day)
  const todayTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const tYmd = toStandardYmd(t.dateStr) || toStandardYmd(t.timestamp);
      return tYmd === dateBoundaries.todayStr || isSameCalendarDay(t.dateStr || t.timestamp, new Date());
    });
  }, [transactions, dateBoundaries.todayStr]);

  const todaySummary = useMemo(() => {
    let gross = 0;
    let buyerComm = 0;
    let sellerComm = 0;
    let totalProfit = 0;

    todayTransactions.forEach((t) => {
      gross += t.grossAmount || 0;
      buyerComm += t.buyerTaxAmount || 0;
      sellerComm += t.sellerTaxAmount || 0;
      totalProfit += t.harajProfit || 0;
    });

    return {
      gross,
      buyerComm,
      sellerComm,
      totalProfit,
      count: todayTransactions.length,
    };
  }, [todayTransactions]);

  // 2. Daily History Breakdown (Grouped day by day)
  const dailyHistory = useMemo(() => {
    const map = new Map<
      string,
      {
        dateStr: string;
        canonicalYmd: string;
        timestamp: number;
        count: number;
        gross: number;
        buyerComm: number;
        sellerComm: number;
        totalProfit: number;
      }
    >();

    transactions.forEach((t) => {
      const dayYmd = toStandardYmd(t.dateStr) || toStandardYmd(t.timestamp) || 'unknown';
      const dayDisplay = t.dateStr || (dayYmd !== 'unknown' ? dayYmd : 'تاريخ غير محدد');
      const existing = map.get(dayYmd) || {
        dateStr: dayDisplay,
        canonicalYmd: dayYmd,
        timestamp: t.timestamp || 0,
        count: 0,
        gross: 0,
        buyerComm: 0,
        sellerComm: 0,
        totalProfit: 0,
      };

      existing.count += 1;
      existing.gross += t.grossAmount || 0;
      existing.buyerComm += t.buyerTaxAmount || 0;
      existing.sellerComm += t.sellerTaxAmount || 0;
      existing.totalProfit += t.harajProfit || 0;
      if (t.timestamp && t.timestamp > existing.timestamp) {
        existing.timestamp = t.timestamp;
      }
      map.set(dayYmd, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  // تصفية الأيام وفق معايير البحث بالتاريخ
  const filteredDailyHistory = useMemo(() => {
    return dailyHistory.filter((day) => {
      const dayYmd = day.canonicalYmd || toStandardYmd(day.dateStr) || toStandardYmd(day.timestamp);

      // 1. الفلتر السريع
      if (activeDatePreset === 'today') {
        if (dayYmd !== dateBoundaries.todayStr) return false;
      } else if (activeDatePreset === 'yesterday') {
        if (dayYmd !== dateBoundaries.yesterdayStr) return false;
      } else if (activeDatePreset === 'thisWeek') {
        if (dayYmd < dateBoundaries.weekAgoStr || dayYmd > dateBoundaries.todayStr) return false;
      } else if (activeDatePreset === 'thisMonth') {
        if (dayYmd < dateBoundaries.monthStartStr || dayYmd > dateBoundaries.todayStr) return false;
      }

      // 2. تاريخ محدد
      if (searchDate) {
        if (dayYmd !== searchDate) return false;
      }

      // 3. من تاريخ
      if (dateFrom && dayYmd < dateFrom) {
        return false;
      }

      // 4. إلى تاريخ
      if (dateTo && dayYmd > dateTo) {
        return false;
      }

      // 5. البحث بالنص (اسم اليوم أو جزء من التاريخ)
      if (searchDayQuery.trim()) {
        const q = searchDayQuery.trim().toLowerCase();
        const dayLabel = formatArabicDayOnly(day.dateStr, day.timestamp).toLowerCase();
        const dateMatch = day.dateStr.toLowerCase().includes(q) || dayYmd.includes(q);
        const nameMatch = dayLabel.includes(q);
        if (!dateMatch && !nameMatch) return false;
      }

      return true;
    });
  }, [dailyHistory, activeDatePreset, searchDate, dateFrom, dateTo, searchDayQuery, dateBoundaries]);

  // هل يوجد فلتر نشط حالياً؟
  const isFilterActive = Boolean(
    activeDatePreset !== 'all' || searchDate || dateFrom || dateTo || searchDayQuery.trim()
  );

  const handleResetFilters = () => {
    setActiveDatePreset('all');
    setSearchDate('');
    setDateFrom('');
    setDateTo('');
    setSearchDayQuery('');
  };

  // إجماليات الأيام المفلترة
  const filteredTotals = useMemo(() => {
    return filteredDailyHistory.reduce(
      (acc, d) => ({
        count: acc.count + d.count,
        gross: acc.gross + d.gross,
        buyerComm: acc.buyerComm + d.buyerComm,
        sellerComm: acc.sellerComm + d.sellerComm,
        totalProfit: acc.totalProfit + d.totalProfit,
      }),
      { count: 0, gross: 0, buyerComm: 0, sellerComm: 0, totalProfit: 0 }
    );
  }, [filteredDailyHistory]);

  // صفقات الأيام المفلترة للطباعة
  const filteredTransactions = useMemo(() => {
    if (!isFilterActive) return transactions;
    const allowedDates = new Set(filteredDailyHistory.map((d) => d.dateStr));
    const allowedYmds = new Set(filteredDailyHistory.map((d) => d.canonicalYmd));
    return transactions.filter((t) => {
      const tYmd = toStandardYmd(t.dateStr) || toStandardYmd(t.timestamp);
      return (t.dateStr && allowedDates.has(t.dateStr)) || allowedYmds.has(tYmd);
    });
  }, [transactions, filteredDailyHistory, isFilterActive]);

  // All-days grand totals
  const allDaysTotals = useMemo(() => {
    return dailyHistory.reduce(
      (acc, d) => ({
        count: acc.count + d.count,
        gross: acc.gross + d.gross,
        buyerComm: acc.buyerComm + d.buyerComm,
        sellerComm: acc.sellerComm + d.sellerComm,
        totalProfit: acc.totalProfit + d.totalProfit,
      }),
      { count: 0, gross: 0, buyerComm: 0, sellerComm: 0, totalProfit: 0 }
    );
  }, [dailyHistory]);

  // 3. Fish Species Profit Breakdown (for today)
  const fishSpeciesBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        fishName: string;
        dealsCount: number;
        quantity: number;
        unit: string;
        totalGross: number;
        estimatedProfit: number;
      }
    >();

    todayTransactions.forEach((t) => {
      (t.items || []).forEach((item) => {
        const name = item.fishName || 'صنف غير محدد';
        const existing = map.get(name) || {
          fishName: name,
          dealsCount: 0,
          quantity: 0,
          unit: item.unit || 'حبه',
          totalGross: 0,
          estimatedProfit: 0,
        };

        existing.dealsCount += 1;
        existing.quantity += item.quantity || 0;
        existing.totalGross += item.totalGross || 0;
        const profit = (item.totalGross || 0) * (settings.buyerTaxRate + settings.sellerTaxRate);
        existing.estimatedProfit += profit;
        map.set(name, existing);
      });
    });

    return Array.from(map.values()).sort((a, b) => b.estimatedProfit - a.estimatedProfit);
  }, [todayTransactions, settings]);

  // Print Report (All or Filtered)
  const handlePrintAll = async () => {
    try {
      setIsPrinting(true);
      const singleTargetDate = isFilterActive && filteredDailyHistory.length === 1
        ? filteredDailyHistory[0].dateStr
        : undefined;
      const res = await printAssociationProfitA4Direct(filteredTransactions, settings, singleTargetDate);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشل بدء الطباعة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsPrinting(false);
    }
  };

  // Export PDF (All or Filtered)
  const handleExportAllPdf = async () => {
    try {
      setIsExporting(true);
      const singleTargetDate = isFilterActive && filteredDailyHistory.length === 1
        ? filteredDailyHistory[0].dateStr
        : undefined;
      const res = await exportAssociationProfitPdfA4(filteredTransactions, settings, singleTargetDate);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشل تصدير PDF: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // Print Specific Day
  const handlePrintDay = async (dateStr: string) => {
    try {
      setPrintingDay(dateStr);
      const res = await printAssociationProfitA4Direct(transactions, settings, dateStr);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشل طباعة أرباح اليوم: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setPrintingDay(null);
    }
  };

  // Export Specific Day PDF
  const handleExportDayPdf = async (dateStr: string) => {
    try {
      setPrintingDay(dateStr);
      const res = await exportAssociationProfitPdfA4(transactions, settings, dateStr);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشل تصدير PDF لليوم: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setPrintingDay(null);
    }
  };

  // Share All Days PDF
  const handleShareAll = async (target: ShareTarget) => {
    try {
      setIsExporting(true);
      const singleTargetDate = isFilterActive && filteredDailyHistory.length === 1
        ? filteredDailyHistory[0].dateStr
        : undefined;
      const res = await shareAssociationProfitPdf(filteredTransactions, settings, target, singleTargetDate);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // Share Specific Day PDF
  const handleShareDay = async (dateStr: string, target: ShareTarget) => {
    try {
      setPrintingDay(dateStr);
      const res = await shareAssociationProfitPdf(transactions, settings, target, dateStr);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 4000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة لليوم: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setPrintingDay(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-white rounded-none max-w-5xl w-full shadow-xl border border-slate-100 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Toast Alert Feedback */}
        {exportToast && (
          <div className="no-print bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{exportToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setExportToast(null)}
              className="text-emerald-200 hover:text-white cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Top Header (Screen View) */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-none bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-blue-200 shadow-inner shrink-0">
              <TrendingUp className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  تقرير وتحليل أرباح الجمعية والحراج
                </h3>
                <span className="px-2 py-0.5 rounded-none bg-blue-500/30 text-blue-200 text-[10px] font-bold border border-blue-400/30">
                  5% إجمالي الأرباح
                </span>
              </div>
              <p className="text-xs text-blue-200/90 mt-0.5">
                تفكيك وتحليل العمولات والأرباح اليومية (2% عمولة المشتري + 3% خصم البائع)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Print Today's Profit Button */}
            <button
              type="button"
              disabled={isPrinting || Boolean(printingDay)}
              onClick={() => handlePrintDay(todayDateStr)}
              className="px-3.5 py-2 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border border-emerald-500 disabled:opacity-50"
              title="طباعة تقرير أرباح اليوم الحالي بدقة A4 عالية مع الشعار الرسمي"
            >
              {printingDay === todayDateStr ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>طباعة</span>
            </button>

            {/* Print Comprehensive Report Button */}
            <button
              type="button"
              disabled={isPrinting}
              onClick={handlePrintAll}
              className="px-3.5 py-2 rounded-none bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs border border-blue-500 disabled:opacity-50"
              title="طباعة التقرير الشامل يوماً بيوم بدقة A4 عالية مع الشعار"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5 text-blue-200" />
              )}
              <span className="hidden sm:inline">طباعة</span>
            </button>

            {/* Download PDF Button */}
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExportAllPdf}
              className="px-3 py-2 rounded-none bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-colors cursor-pointer border border-white/20 shadow-xs disabled:opacity-50"
              title="تحميل التقرير كملف PDF رسمي بحجم A4"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5 text-blue-200" />
              )}
              <span>تحميل</span>
            </button>

            {/* Share Options Dropdown */}
            <ShareOptionsDropdown
              onShare={handleShareAll}
              isSharing={isExporting}
              title="مشاركة تقرير أرباح الجمعية والحراج A4 (LocalSend، بلوتوث، ويندوز)"
              buttonClassName="p-2 rounded-none bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer border border-white/20 shadow-xs disabled:opacity-50"
              iconClassName="w-4 h-4 text-blue-200"
              align="left"
              id="association-profit-share-all-btn"
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-none bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official Invoice-Style Header (Visible in print preview / Ctrl+P) */}
        <div
          className="hidden print:block border-b-2 border-slate-900 pb-4 mb-4 p-4"
          style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif" }}
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Right: Market Info (Arabic) */}
            <div className="text-right leading-tight min-w-0">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                {settings?.marketName || 'سوق عين بامعبد المركزي'}
              </h1>
              <p className="text-xs sm:text-sm font-bold text-slate-700 mt-1 whitespace-nowrap">
                {(settings?.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
              </p>
              <p className="text-[11px] sm:text-xs text-slate-500 font-bold mt-1 whitespace-nowrap">
                {settings?.location || 'م/شبوه/رضوم/ عين بامعبد'}
                {settings?.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}
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
                تقرير وتحليل أرباح الجمعية والحراج
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

          {/* Unified Document & Metadata Bar */}
          <div className="bg-slate-50 rounded-none border border-slate-300 p-3 mt-4 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-slate-900 text-white px-3 py-1 rounded-none font-black text-xs">
                كشف أرباح وعمولات معتمد
              </span>
              <div className="border-2 border-slate-900 px-3 py-1 rounded-none bg-white">
                <span className="text-xs font-bold text-slate-600 ml-1.5">رقم التقرير:</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  PRF-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-600">
              <div>تاريخ الإصدار: <span className="font-black text-slate-900">{new Date().toLocaleDateString('ar-YE')}</span></div>
              <div>وقت الإصدار: <span className="font-black text-slate-900">{new Date().toLocaleTimeString('ar-YE')}</span></div>
            </div>
          </div>
        </div>

        {/* Top Summary Banner */}
        <div className="bg-blue-50/80 border-b border-slate-300 p-4 sm:px-6 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
          <div className="bg-white rounded-none p-3 border border-blue-300/70 shadow-2xs">
            <span className="text-[11px] font-bold text-blue-700 block">صافي أرباح الجمعية اليوم</span>
            <span className="text-xl font-black font-mono text-blue-900 block mt-0.5">
              {formatCurrency(todaySummary.totalProfit, settings.currency)}
            </span>
            <span className="text-[10px] text-blue-600 font-bold block mt-0.5">مجموع الـ 5% اليومية</span>
          </div>

          <div className="bg-white rounded-none p-3 border border-blue-300/70 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 block">عمولة المشترين اليوم (2%)</span>
            <span className="text-lg font-black font-mono text-slate-800 block mt-0.5">
              {formatCurrency(todaySummary.buyerComm, settings.currency)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">+2% يدفعه المشتري</span>
          </div>

          <div className="bg-white rounded-none p-3 border border-blue-300/70 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 block">خصم الصيادين اليوم (3%)</span>
            <span className="text-lg font-black font-mono text-slate-800 block mt-0.5">
              {formatCurrency(todaySummary.sellerComm, settings.currency)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">-3% يخصم من الصياد</span>
          </div>

          <div className="bg-white rounded-none p-3 border border-blue-300/70 shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 block">الإجمالي الأساسي اليوم</span>
            <span className="text-lg font-black font-mono text-slate-900 block mt-0.5">
              {formatCurrency(todaySummary.gross, settings.currency)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">{todaySummary.count} شروات</span>
          </div>
        </div>

        {/* Sub-Tabs Switcher (Hidden in Print) */}
        <div className="p-3 sm:px-6 border-b border-slate-300 bg-white flex items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('dailyHistory')}
              className={`px-3.5 py-1.5 rounded-none transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dailyHistory'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>سجل توزيع الأرباح يوماً بيوم ({dailyHistory.length} أيام)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fishSpecies')}
              className={`px-3.5 py-1.5 rounded-none transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'fishSpecies'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Fish className="w-3.5 h-3.5" />
              <span>الأرباح حسب الأصناف اليوم</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium hidden md:block">
            يمكنك طباعة أرباح أي يوم بشكل مستقل من زر الطباعة في الجدول أدناه
          </div>
        </div>

        {/* Modal Body / Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">

          {/* TAB 1: Daily History Breakdown (Day by Day) */}
          {activeTab === 'dailyHistory' && (
            <div className="space-y-3">

              {/* ══ شريط البحث وتصفية الأيام بالتاريخ ══ */}
              <div className="bg-white rounded-none border border-slate-300 p-3.5 shadow-2xs space-y-3 no-print">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-none bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-300 shadow-2xs">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-900 block">
                        البحث وتصفية الأيام بالتاريخ
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        حدد يوماً معيناً أو نطاق تواريخ للوصول المباشر لأرباح وعمولات أي فترة
                      </span>
                    </div>
                  </div>

                  {/* أزرار الفلترة السريعة */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { key: 'all', label: 'كافة الأيام' },
                      { key: 'today', label: 'اليوم' },
                      { key: 'yesterday', label: 'أمس' },
                      { key: 'thisWeek', label: 'هذا الأسبوع' },
                      { key: 'thisMonth', label: 'هذا الشهر' },
                    ].map((p) => {
                      const isActive = activeDatePreset === p.key && !searchDate && !dateFrom && !dateTo;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setActiveDatePreset(p.key as any);
                            setSearchDate('');
                            setDateFrom('');
                            setDateTo('');
                          }}
                          className={`px-2.5 py-1 rounded-none text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* حقول الإدخال والبحث بالتاريخ */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
                  {/* تاريخ محدد */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-700">تاريخ محدد:</span>
                    <input
                      type="date"
                      value={searchDate}
                      onChange={(e) => {
                        setSearchDate(e.target.value);
                        if (e.target.value) {
                          setActiveDatePreset('all');
                          setDateFrom('');
                          setDateTo('');
                        }
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-none px-2.5 py-1 text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                  {/* نطاق: من تاريخ .. إلى تاريخ */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-700">من:</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        if (e.target.value) {
                          setActiveDatePreset('all');
                          setSearchDate('');
                        }
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-none px-2 py-1 text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white shadow-2xs"
                    />
                    <span className="font-bold text-slate-700">إلى:</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        if (e.target.value) {
                          setActiveDatePreset('all');
                          setSearchDate('');
                        }
                      }}
                      className="bg-slate-50 border border-slate-300 rounded-none px-2 py-1 text-slate-900 font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white shadow-2xs"
                    />
                  </div>

                  <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                  {/* بحث بالاسم أو النص */}
                  <div className="flex-1 min-w-[190px] flex items-center gap-1.5">
                    <div className="relative w-full">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchDayQuery}
                        onChange={(e) => setSearchDayQuery(e.target.value)}
                        placeholder="ابحث باليوم أو التاريخ (مثلاً: السبت، 10-22...)"
                        className="w-full bg-slate-50 border border-slate-300 rounded-none pr-8 pl-3 py-1 text-slate-900 font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* زر إلغاء التصفية عند التفعيل */}
                  {isFilterActive && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-none font-bold text-xs border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                      title="إعادة تعيين وإلغاء التصفية"
                    >
                      <X className="w-3 h-3" />
                      <span>إلغاء التصفية</span>
                    </button>
                  )}
                </div>

                {/* إشعار ملخص التصفية */}
                {isFilterActive && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-none bg-blue-100 text-blue-900 font-black text-[11px] border border-blue-300">
                        تم حصر: {filteredDailyHistory.length} من أصل {dailyHistory.length} أيام
                      </span>
                      <span className="text-slate-600 font-bold text-[11px]">
                        صافي أرباح الفترة المحددة: <strong className="font-mono text-blue-900 text-xs">{formatCurrency(filteredTotals.totalProfit, settings.currency)}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-bold">
                      <span>الإجمالي الأساسي:</span>
                      <span className="font-mono font-black text-slate-800">{formatCurrency(filteredTotals.gross, settings.currency)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ══ جدول سجل توزيع الأرباح يوماً بيوم ══ */}
              <div className="bg-white rounded-none border border-slate-300 overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-100/80 border-b border-slate-300 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>سجل توزيع أرباح الجمعية والحراج يوماً بيوم مع إمكانية طباعة أي يوم</span>
                  </span>
                  <span className="font-mono text-blue-700 font-black">
                    {isFilterActive ? `${filteredDailyHistory.length} / ${dailyHistory.length} أيام` : `${dailyHistory.length} أيام مسجلة`}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 border-b border-slate-300 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3 text-right">اليوم والتاريخ</th>
                        <th className="p-3 text-center">عدد الشروات</th>
                        <th className="p-3 text-center">الإجمالي الأساسي</th>
                        <th className="p-3 text-center text-blue-700">عمولة مشتري (+2%)</th>
                        <th className="p-3 text-center text-emerald-700">خصم صياد (-3%)</th>
                        <th className="p-3 text-center text-blue-900 bg-blue-50/80 font-black text-sm">
                          صافي ربح الجمعية (5%)
                        </th>
                        <th className="p-3 text-center no-print">طباعة اليوم / تصدير</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDailyHistory.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                            {isFilterActive ? 'لا توجد أرباح مسجلة مطابقة لمعايير التاريخ المحددة.' : 'لا توجد أرباح مسجلة حتى الآن.'}
                          </td>
                        </tr>
                      ) : (
                        filteredDailyHistory.map((day) => {
                          const dayLabel = formatArabicDayOnly(day.dateStr, day.timestamp);
                          const isCurrentDay = day.dateStr === todayDateStr;
                          const isProcessingThisDay = printingDay === day.dateStr;

                          return (
                            <tr
                              key={day.dateStr}
                              className={`hover:bg-blue-50/30 transition-colors ${
                                isCurrentDay ? 'bg-blue-50/20' : ''
                              }`}
                            >
                              <td className="p-3 font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black">{dayLabel}</span>
                                  {isCurrentDay && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-600 text-white font-bold">
                                      اليوم
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400 font-mono font-normal block mt-0.5">
                                  {day.dateStr}
                                </span>
                              </td>

                              <td className="p-3 text-center font-mono font-bold text-slate-700">
                                {day.count}
                              </td>

                              <td className="p-3 text-center font-mono font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(day.gross, settings.currency)}
                              </td>

                              <td className="p-3 text-center font-mono font-bold text-blue-700 whitespace-nowrap">
                                {formatCurrency(day.buyerComm, settings.currency)}
                              </td>

                              <td className="p-3 text-center font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {formatCurrency(day.sellerComm, settings.currency)}
                              </td>

                              <td className="p-3 text-center font-mono font-black text-blue-900 bg-blue-50/60 whitespace-nowrap text-sm">
                                {formatCurrency(day.totalProfit, settings.currency)}
                              </td>

                              {/* Print & PDF Actions per day */}
                              <td className="p-3 text-center whitespace-nowrap no-print">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={Boolean(printingDay)}
                                    onClick={() => handlePrintDay(day.dateStr)}
                                    className="px-2.5 py-1.5 rounded-none bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-300 hover:border-blue-600 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                    title={`طباعة تقرير أرباح يوم ${dayLabel} (${day.dateStr}) بتنسيق الفاتورة الرسمي A4`}
                                  >
                                    {isProcessingThisDay ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Printer className="w-3.5 h-3.5" />
                                    )}
                                    <span>طباعة اليوم</span>
                                  </button>

                                  <button
                                    type="button"
                                    disabled={Boolean(printingDay)}
                                    onClick={() => handleExportDayPdf(day.dateStr)}
                                    className="px-2 py-1.5 rounded-none bg-slate-100 hover:bg-slate-800 text-slate-700 hover:text-white border border-slate-300 hover:border-slate-800 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                    title={`تحميل تقرير أرباح يوم ${dayLabel} (${day.dateStr}) بصيغة PDF`}
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>PDF</span>
                                  </button>

                                  <ShareOptionsDropdown
                                    onShare={(target) => handleShareDay(day.dateStr, target)}
                                    isSharing={printingDay === day.dateStr}
                                    title={`مشاركة تقرير أرباح يوم ${dayLabel} (LocalSend، بلوتوث، ويندوز)`}
                                    buttonClassName="p-1.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                    iconClassName="w-3.5 h-3.5 text-slate-700"
                                    align="left"
                                    id={`share-day-profit-${day.dateStr}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredDailyHistory.length > 0 && (
                      <tfoot className="bg-slate-100/90 font-black border-t-2 border-slate-300">
                        <tr>
                          <td className="p-3 text-slate-900 font-black">
                            {isFilterActive
                              ? `مجموع الأيام المحددة (${filteredDailyHistory.length} أيام):`
                              : `المجموع الإجمالي (${dailyHistory.length} أيام):`}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-900 font-black">
                            {filteredTotals.count}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-900 font-black whitespace-nowrap">
                            {formatCurrency(filteredTotals.gross, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono text-blue-800 font-black whitespace-nowrap">
                            {formatCurrency(filteredTotals.buyerComm, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono text-emerald-800 font-black whitespace-nowrap">
                            {formatCurrency(filteredTotals.sellerComm, settings.currency)}
                          </td>
                          <td className="p-3 text-center font-mono text-blue-900 bg-blue-100/70 font-black whitespace-nowrap text-base">
                            {formatCurrency(filteredTotals.totalProfit, settings.currency)}
                          </td>
                          <td className="p-3 text-center no-print">
                            <button
                              type="button"
                              onClick={handlePrintAll}
                              className="text-[11px] text-blue-700 hover:underline font-black cursor-pointer"
                            >
                              {isFilterActive ? 'طباعة الفترة المحددة A4' : 'طباعة الكل A4'}
                            </button>
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Profit by Fish Species (Today) */}
          {activeTab === 'fishSpecies' && (
            <div className="space-y-3">
              {fishSpeciesBreakdown.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-none border border-slate-300 p-6 space-y-2">
                  <Fish className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">لا توجد بيانات صنف مسجلة اليوم</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {fishSpeciesBreakdown.map((item) => (
                    <div
                      key={item.fishName}
                      className="bg-white border border-slate-300 rounded-none p-4 space-y-2 shadow-2xs hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                          <Fish className="w-4 h-4 text-blue-600" />
                          <span>{item.fishName}</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-none bg-blue-50 text-blue-700 font-mono text-[10px] font-bold">
                          {item.dealsCount} شروات
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-semibold">إجمالي الكمية المباعة:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {item.quantity} {item.unit}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-semibold">إجمالي قيمة الحراج:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(item.totalGross, settings.currency)}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs">
                        <span className="text-blue-900 font-black">أرباح الجمعية والحراج:</span>
                        <span className="font-mono font-black text-blue-700 text-sm">
                          {formatCurrency(item.estimatedProfit, settings.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer (Hidden in Print) */}
        <div className="p-4 sm:px-6 bg-white border-t border-slate-300 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          <div className="text-xs text-slate-500 font-medium">
            💡 يتم احتساب الأرباح تلقائياً: <strong>2% عمولة مشتري + 3% خصم بائع = 5% إجمالي أرباح الجمعية</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAll}
              className="px-4 py-2 rounded-none bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold transition-all cursor-pointer border border-blue-300 flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-blue-700" />
              <span>طباعة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-none bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
            >
              إغلاق النافذة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
