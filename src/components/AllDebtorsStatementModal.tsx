import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Contact, Transaction, MarketSettings, CashEntry } from '../types';
import { formatCurrency, formatNumber, formatArabicDayOnly, tafqeet, formatGregorianDate, formatGregorianTime, getTodayLocalYMD, isSameCalendarDay, parseLocalDate, getTransactionBuyerDebt, calculateBuyerTotalDebt } from '../utils/calculations';
import { WhatsAppIcon, sendDebtorStatementViaWhatsApp } from '../utils/whatsapp';
import {
  exportAllDebtorsStatementPdfA4,
  exportAllDebtorsToExcel,
  exportDebtorStatementPdfA4,
  printAllDebtorsStatementA4Direct,
  buildDebtorStatementHtmlA4,
  printHtmlA4Direct,
} from '../utils/invoiceExport';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareFileGeneric, ShareTarget } from '../utils/shareUtils';
import {
  Printer,
  X,
  Fish,
  FileText,
  Download,
  Users,
  HandCoins,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  Phone,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Eye,
  ArrowRight,
} from 'lucide-react';

export interface DailyDebtItem {
  dayKey: string;
  dayName: string;
  dateStr: string;
  dayLabel: string;
  remainingDebt: number;
  grossTotal: number;
  paidTotal: number;
  dealsCount: number;
}

export interface DebtorRecord {
  buyerId: string;
  buyerName: string;
  buyerPhone?: string;
  unpaidTransactions: Transaction[];
  dealsCount: number;
  grossTotal: number;
  taxTotal: number;
  finalRequiredTotal: number;
  totalPaid: number;
  todayPaid: number;
  remainingDebt: number;
  lastTrxDate?: string;
  lastTrxTime?: string;
  dailyBreakdown: DailyDebtItem[];
}

interface AllDebtorsStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  contacts: Contact[];
  cashEntries?: CashEntry[];
  settings: MarketSettings;
  defaultTimeframe?: 'today' | 'all';
}

function getDayDetails(dateStr?: string, timestamp?: number) {
  let date: Date | null = null;
  if (dateStr && dateStr.trim()) {
    date = parseLocalDate(dateStr);
  } else if (timestamp) {
    date = new Date(timestamp);
  }

  if (!date || isNaN(date.getTime())) {
    const fallback = dateStr || '—';
    return {
      dayKey: fallback,
      dayName: 'يوم غير محدد',
      dateStr: fallback,
      dayLabel: fallback,
    };
  }

  const dayNameOnly = date.toLocaleDateString('ar-EG', { weekday: 'long' });
  const dayName = `يوم ${dayNameOnly}`;
  const dayKey = getTodayLocalYMD(date);
  const dateStrFormatted = formatGregorianDate(date);
  const dayLabel = `${dayName} (${dateStrFormatted})`;

  return {
    dayKey,
    dayName,
    dateStr: dateStrFormatted,
    dayLabel,
  };
}

function getBuyerDebtAmounts(transaction: Transaction) {
  const remainingDebt = getTransactionBuyerDebt(transaction);

  const paidAtPos = Math.max(0, transaction.paidAtPosBuyerAmount || 0);
  const recordedPaid = Math.max(0, transaction.buyerPaidAmount || 0);
  const paidByBalance = Math.max(0, transaction.totalFromBuyer - remainingDebt);
  const totalPaid = Math.max(paidAtPos, recordedPaid, paidByBalance);

  return { remainingDebt, totalPaid };
}

export const AllDebtorsStatementModal: React.FC<AllDebtorsStatementModalProps> = ({
  isOpen,
  onClose,
  transactions,
  contacts,
  cashEntries = [],
  settings,
  defaultTimeframe = 'all',
}) => {
  const [printMode, setPrintMode] = useState<'official' | 'thermal'>('official');
  const [scope, setScope] = useState<'all' | 'today'>(defaultTimeframe);
  const [paidMode, setPaidMode] = useState<'all' | 'today'>('all');
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [expandedBuyerIds, setExpandedBuyerIds] = useState<Record<string, boolean>>({});
  const [isExportingAllPdf, setIsExportingAllPdf] = useState(false);
  const [isExportingAllExcel, setIsExportingAllExcel] = useState(false);
  const [exportingDebtorId, setExportingDebtorId] = useState<string | null>(null);
  const [sendingWhatsAppDebtorId, setSendingWhatsAppDebtorId] = useState<string | null>(null);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [isPrintingA4, setIsPrintingA4] = useState(false);
  const [isSharingAllDebtors, setIsSharingAllDebtors] = useState(false);
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);

  // Escape and Ctrl+P keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        const printBtn = document.getElementById('all-debtors-print-btn');
        if (printBtn) {
          printBtn.click();
        } else {
          window.print();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Compute debtors list based on scope with daily breakdown
  const debtors = useMemo<DebtorRecord[]>(() => {
    const relevantTransactions = scope === 'today'
      ? transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, new Date()))
      : transactions;

    const map = new Map<string, DebtorRecord>();

    relevantTransactions.forEach((t) => {
      // Calculate remaining debt for this transaction
      const { remainingDebt: debt, totalPaid: paid } = getBuyerDebtAmounts(t);

      if (debt > 0) {
        const contact = contacts.find((c) => c.id === t.buyerId || c.name === t.buyerName);
        const buyerId = t.buyerId || t.buyerName;
        const buyerName = t.buyerName || contact?.name || 'مشتري غير محدد';
        const buyerPhone = t.buyerPhone || contact?.phone;

        const existing = map.get(buyerId) || {
          buyerId,
          buyerName,
          buyerPhone,
          unpaidTransactions: [],
          dealsCount: 0,
          grossTotal: 0,
          taxTotal: 0,
          finalRequiredTotal: 0,
          totalPaid: 0,
          todayPaid: 0,
          remainingDebt: 0,
          lastTrxDate: t.dateStr,
          lastTrxTime: t.timeStr,
          dailyBreakdown: [],
        };

        existing.unpaidTransactions.push(t);
        existing.dealsCount += 1;
        existing.grossTotal += t.grossAmount;
        existing.taxTotal += t.buyerTaxAmount;
        existing.finalRequiredTotal += t.totalFromBuyer;
        existing.remainingDebt += debt;

        if (t.dateStr && (!existing.lastTrxDate || t.dateStr > existing.lastTrxDate)) {
          existing.lastTrxDate = t.dateStr;
          existing.lastTrxTime = t.timeStr;
        }

        map.set(buyerId, existing);
      }
    });

    // Calculate accurate total paid across entire buyer history and daily breakdown
    const result = Array.from(map.values());
    result.forEach((record) => {
      // Find all transactions belonging to this buyer (both paid and unpaid in the relevant timeframe)
      const allBuyerTransactions = (scope === 'today' ? relevantTransactions : transactions).filter((t) => {
        return (
          (t.buyerId && (t.buyerId === record.buyerId)) ||
          (t.buyerName && t.buyerName.trim() === record.buyerName.trim())
        );
      });

      // Sum of payments across all transactions belonging to this buyer
      const trxPaidTotal = allBuyerTransactions.reduce((sum, t) => {
        const { totalPaid } = getBuyerDebtAmounts(t);
        return sum + totalPaid;
      }, 0);

      // Sum of cash debt repayments and advance payments recorded in cash entries
      const cashRepaidTotal = (cashEntries || [])
        .filter((c) => {
          if (c.type !== 'buyer_debt_repayment' && c.type !== 'buyer_advance_in') return false;
          if (scope === 'today' && !isSameCalendarDay(c.dateStr || (c as any).timestamp, new Date())) return false;
          return (
            (c.contactId && c.contactId === record.buyerId) ||
            (c.contactName && c.contactName.trim() === record.buyerName.trim())
          );
        })
        .reduce((sum, c) => sum + (c.amount || 0), 0);

      // Accurate comprehensive total paid for this buyer
      record.totalPaid = Math.max(trxPaidTotal, cashRepaidTotal);

      // حساب صافي دين المشتري المتبقي بدقة عبر المحرك الموحد
      record.remainingDebt = calculateBuyerTotalDebt(allBuyerTransactions, cashEntries, record.buyerId, record.buyerName);

      // Payments made today specifically
      const todayBuyerTransactions = allBuyerTransactions.filter((t) =>
        isSameCalendarDay(t.dateStr || t.timestamp, new Date())
      );
      const trxTodayPaid = todayBuyerTransactions.reduce((sum, t) => {
        const { totalPaid } = getBuyerDebtAmounts(t);
        return sum + totalPaid;
      }, 0);
      const cashTodayPaid = (cashEntries || [])
        .filter((c) => {
          if (c.type !== 'buyer_debt_repayment' && c.type !== 'buyer_advance_in') return false;
          if (!isSameCalendarDay(c.dateStr || (c as any).timestamp, new Date())) return false;
          return (
            (c.contactId && c.contactId === record.buyerId) ||
            (c.contactName && c.contactName.trim() === record.buyerName.trim())
          );
        })
        .reduce((sum, c) => sum + (c.amount || 0), 0);

      record.todayPaid = Math.max(trxTodayPaid, cashTodayPaid);

      const dailyMap = new Map<string, DailyDebtItem>();

      record.unpaidTransactions.forEach((t) => {
        const { remainingDebt: debt, totalPaid: paid } = getBuyerDebtAmounts(t);

        if (debt > 0) {
          const { dayKey, dayName, dateStr, dayLabel } = getDayDetails(t.dateStr, t.timestamp);
          const existingDay = dailyMap.get(dayKey) || {
            dayKey,
            dayName,
            dateStr,
            dayLabel,
            remainingDebt: 0,
            grossTotal: 0,
            paidTotal: 0,
            dealsCount: 0,
          };

          existingDay.remainingDebt += debt;
          existingDay.grossTotal += t.grossAmount;
          existingDay.paidTotal += paid;
          existingDay.dealsCount += 1;

          dailyMap.set(dayKey, existingDay);
        }
      });

      record.dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
    });

    // Sort by largest debt first (فقط من لديهم متبقي دين فعلي أكبر من الصفر)
    return result
      .filter((b) => b.remainingDebt > 0)
      .sort((a, b) => b.remainingDebt - a.remainingDebt);
  }, [transactions, contacts, cashEntries, scope]);

  // Selected single debtor for individual claim preview (Image 2 design)
  const selectedDebtor = useMemo(() => {
    if (!selectedDebtorId) return null;
    return debtors.find((d) => d.buyerId === selectedDebtorId) || null;
  }, [debtors, selectedDebtorId]);

  // Overall totals
  const totals = useMemo(() => {
    return debtors.reduce(
      (acc, d) => {
        acc.totalDebt += d.remainingDebt;
        acc.totalGross += d.grossTotal;
        acc.totalTax += d.taxTotal;
        acc.totalRequired += d.finalRequiredTotal;
        acc.totalPaid += d.totalPaid;
        acc.todayPaid += (d.todayPaid || 0);
        acc.totalInvoices += d.dealsCount;
        return acc;
      },
      {
        totalDebt: 0,
        totalGross: 0,
        totalTax: 0,
        totalRequired: 0,
        totalPaid: 0,
        todayPaid: 0,
        totalInvoices: 0,
      }
    );
  }, [debtors]);

  const handlePrint = async () => {
    if (printMode === 'thermal') {
      window.print();
      return;
    }
    try {
      setIsPrintingA4(true);
      if (selectedDebtor) {
        const html = await buildDebtorStatementHtmlA4(
          {
            buyerName: selectedDebtor.buyerName,
            buyerPhone: selectedDebtor.buyerPhone,
            totalDebt: selectedDebtor.remainingDebt,
            dealsCount: selectedDebtor.dealsCount,
            dailyBreakdown: selectedDebtor.dailyBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: selectedDebtor.unpaidTransactions,
          },
          settings
        );
        await printHtmlA4Direct(html);
      } else {
        const res = await printAllDebtorsStatementA4Direct(debtors, totals, settings, scope, {}, paidMode);
        if (res && res.message && !res.message.includes('إلغاء')) {
          setExportToast(res.message);
          setTimeout(() => setExportToast(null), 4000);
        }
      }
    } catch (err: any) {
      console.warn('Vector all debtors direct print error:', err);
      window.print();
    } finally {
      setIsPrintingA4(false);
    }
  };

  const handleShareAllDebtors = async (target: ShareTarget) => {
    setIsSharingAllDebtors(true);
    try {
      if (selectedDebtor) {
        const res = await exportDebtorStatementPdfA4(
          {
            buyerName: selectedDebtor.buyerName,
            buyerPhone: selectedDebtor.buyerPhone,
            totalDebt: selectedDebtor.remainingDebt,
            dealsCount: selectedDebtor.dealsCount,
            dailyBreakdown: selectedDebtor.dailyBreakdown.map((b) => ({
              dayKey: b.dayKey,
              dayName: b.dayName,
              dateStr: b.dateStr,
              debt: b.remainingDebt,
            })),
            unpaidTransactions: selectedDebtor.unpaidTransactions,
          },
          settings,
          true
        );
        const filename = `كشف_مديونية_${selectedDebtor.buyerName.replace(/\s+/g, '_')}.pdf`;
        const shareRes = await shareFileGeneric(res, target, filename, `كشف مديونية - ${selectedDebtor.buyerName}`);
        setExportToast(shareRes.message);
      } else {
        const res = await exportAllDebtorsStatementPdfA4(debtors, totals, settings, scope, true, paidMode);
        const scopeText = scope === 'today' ? 'ديون_اليوم' : 'كشف_شامل';
        const filename = `كشف_ديون_المشترين_${scopeText}_${new Date().toISOString().slice(0, 10)}.pdf`;
        const shareRes = await shareFileGeneric(res, target, filename, `كشف ديون المشترين - ${settings.marketName}`);
        setExportToast(shareRes.message);
      }
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSharingAllDebtors(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedBuyerIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Export to CSV
  const handleExportCSV = () => {
    const paidHeader = paidMode === 'today' ? 'المسدد في اليوم' : 'المسدد الكلي';
    const headers = [
      'م',
      'اسم المشتري',
      'رقم الهاتف',
      'المبالغ التي عليه باليوم (اليوم - المبلغ)',
      paidHeader,
      'المبلغ المتبقي',
    ];

    const rows = debtors.map((d, index) => {
      const dailyBreakdownStr = d.dailyBreakdown
        .map((b) => `${b.dayName} (${b.dateStr}): ${b.remainingDebt}`)
        .join(' | ');

      const paidVal = paidMode === 'today' ? (d.todayPaid || 0) : (d.totalPaid || 0);

      return [
        index + 1,
        `"${d.buyerName}"`,
        `"${d.buyerPhone || '—'}"`,
        `"${dailyBreakdownStr}"`,
        paidVal,
        d.remainingDebt,
      ];
    });

    const totalPaidVal = paidMode === 'today' ? (totals.todayPaid || 0) : (totals.totalPaid || 0);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.join(',')),
      ['الإجمالي العام', '', '', '', totalPaidVal, totals.totalDebt].join(','),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `كشف_ديون_المشترين_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAllPdf = async () => {
    try {
      setIsExportingAllPdf(true);
      const res = await exportAllDebtorsStatementPdfA4(debtors, totals, settings, scope, false, paidMode);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشل تحميل كشف ديون المشترين: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingAllPdf(false);
    }
  };

  const handleExportAllExcel = async () => {
    try {
      setIsExportingAllExcel(true);
      const res = await exportAllDebtorsToExcel(debtors, totals, settings, scope, paidMode);
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشل تصدير كشف الديون إلى Excel: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingAllExcel(false);
    }
  };

  const handleDownloadSingleDebtorPdf = async (d: DebtorRecord) => {
    try {
      setExportingDebtorId(d.buyerId);
      const res = await exportDebtorStatementPdfA4(
        {
          buyerName: d.buyerName,
          buyerPhone: d.buyerPhone,
          totalDebt: d.remainingDebt,
          dealsCount: d.dealsCount,
          dailyBreakdown: d.dailyBreakdown.map((b) => ({
            dayKey: b.dayKey,
            dayName: b.dayName,
            dateStr: b.dateStr,
            debt: b.remainingDebt,
          })),
          unpaidTransactions: d.unpaidTransactions,
        },
        settings
      );
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشل تحميل كشف المشتري: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setExportingDebtorId(null);
    }
  };

  const todayDateStr = formatGregorianDate(new Date());
  const todayTimeStr = formatGregorianTime(new Date());
  const voucherNumber = `EOD-DEBT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  if (!isOpen) return null;

  const modalContent = (
    <div
      id="all-debtors-modal"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs overflow-y-auto flex justify-center p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:overflow-visible"
    >
      {/* ------------------------------------------------------------- */}
      {/* SCREEN TOP ACTION BAR (HIDDEN IN PRINT) */}
      {/* ------------------------------------------------------------- */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-60 bg-white/95 backdrop-blur-md border border-slate-300 shadow-xl rounded-none px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 max-w-5xl w-[95%] no-print">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-none bg-red-100 text-red-600 flex items-center justify-center shrink-0">
            <HandCoins className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span>{selectedDebtor ? `مطالبة مالية: ${selectedDebtor.buyerName}` : 'كشف ديون المشترين (اسم المشتري والديون باليوم)'}</span>
            </h3>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              {selectedDebtor ? 'معاينة سند المطالبة والمديونية الفردي المعتمد للعميل' : 'كشف واضح يقتصر على أسماء المشترين المديونين وتفاصيل مبالغهم باليوم'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Debtor Selector: All Debtors vs Single Debtor */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-none border border-slate-300 text-xs">
            <select
              value={selectedDebtorId || ''}
              onChange={(e) => setSelectedDebtorId(e.target.value || null)}
              className="bg-white text-slate-800 font-bold px-2 py-1.5 rounded-none border-0 shadow-2xs cursor-pointer outline-none text-xs max-w-[200px] truncate"
              title="اختر مشترياً لمعاينة مطالبته الفردية أو الكشف العام"
            >
              <option value="">📊 كشف كافة المشترين ({debtors.length})</option>
              {debtors.map((d) => (
                <option key={d.buyerId} value={d.buyerId}>
                  👤 {d.buyerName} ({formatCurrency(d.remainingDebt, settings.currency)})
                </option>
              ))}
            </select>
            {selectedDebtor && (
              <button
                type="button"
                onClick={() => setSelectedDebtorId(null)}
                className="px-2 py-1.5 rounded-none bg-blue-100 hover:bg-blue-200 text-blue-800 font-black text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                title="الرجوع لكشف ديون كافة المشترين"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>الكشف العام</span>
              </button>
            )}
          </div>

          {/* Scope Selector: All debt vs Today only */}
          {!selectedDebtor && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-none border border-slate-300 text-xs">
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الرصيد التراكمي
              </button>
              <button
                type="button"
                onClick={() => setScope('today')}
                className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  scope === 'today'
                    ? 'bg-white text-red-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ديون اليوم
              </button>
            </div>
          )}

          {/* Paid Mode Selector: All-time Total Paid vs Today's Paid */}
          {!selectedDebtor && (
            <div className="flex items-center bg-emerald-50/80 p-0.5 rounded-none border border-emerald-200 text-xs">
              <button
                type="button"
                onClick={() => setPaidMode('all')}
                className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  paidMode === 'all'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 hover:text-emerald-950'
                }`}
                title="عرض إجمالي ما تم تسديده كلياً لكافة الفواتير والشروات"
              >
                المسدد الكلي
              </button>
              <button
                type="button"
                onClick={() => setPaidMode('today')}
                className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                  paidMode === 'today'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 hover:text-emerald-950'
                }`}
                title="عرض المبالغ المسددة اليوم فقط"
              >
                المسدد في اليوم
              </button>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-none border border-slate-300 text-xs">
            <button
              type="button"
              onClick={() => setPrintMode('official')}
              className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                printMode === 'official'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              تقرير رسمي A4
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('thermal')}
              className={`px-2.5 py-1.5 rounded-none font-bold transition-all cursor-pointer ${
                printMode === 'thermal'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              إيصال حراري (80mm)
            </button>
          </div>

          {/* Smart Unified Print Button */}
          <button
            id="all-debtors-print-btn"
            type="button"
            disabled={isPrintingA4}
            onClick={handlePrint}
            className={`px-3.5 py-2 rounded-none text-xs font-black text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 ${
              printMode === 'thermal'
                ? 'bg-blue-600 hover:bg-blue-700 border border-blue-700'
                : 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700'
            }`}
            title={
              printMode === 'thermal'
                ? 'طباعة إيصال كشف الديون فوراً على الطابعة الحرارية 80mm [Ctrl+P]'
                : selectedDebtor
                ? `طباعة مطالبة ${selectedDebtor.buyerName} الرسمية A4 [Ctrl+P]`
                : 'طباعة كشف مديونيات المشترين فوراً بدقة المتجهات النقية العالية A4 [Ctrl+P]'
            }
          >
            {isPrintingA4 ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>طباعة</span>
          </button>

          {/* Three Dots (⋮) Share Options */}
          <ShareOptionsDropdown
            id="all-debtors-share-btn"
            onShare={handleShareAllDebtors}
            isSharing={isSharingAllDebtors}
            buttonLabel="مشاركة ⋮"
            buttonClassName="px-3 py-2 rounded-none text-xs font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            menuTitle={selectedDebtor ? `مشاركة مطالبة ${selectedDebtor.buyerName} (A4 PDF)` : 'مشاركة كشف ديون المشترين (A4 PDF)'}
            tooltip="خيارات مشاركة التقرير (تطبيق LocalSend، البلوتوث، تطبيقات ويندوز، نسخ الملف)"
          />

          {/* Close Button */}
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

      {/* Spacer to push content down below floating bar on screen */}
      <div className="h-16 w-full no-print"></div>

      {/* ============================================================= */}
      {/* 1. OFFICIAL A4 MODE (PRINTABLE STATEMENT - EXACT MATCH TO PDF) */}
      {/* ============================================================= */}
      {printMode === 'official' && (
        <div className="printable-statement-area w-full max-w-5xl bg-white text-slate-900 rounded-none shadow-xl border border-slate-300 p-4 sm:p-6 mb-8 mt-16 print:mt-0 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full print:transform-none transition-transform duration-150">
          
          {/* Header Box - Exactly Matching Image 2 */}
          <div className="border-2 border-slate-900 rounded-none p-3 sm:p-4 bg-slate-50/50 mb-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Right: Market Info (Arabic) */}
              <div className="text-right leading-tight">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">
                  {settings.marketName || 'سوق عين بامعبد المركزي'}
                </h1>
                <p className="text-xs font-black text-slate-700 mt-1 whitespace-nowrap">
                  {(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}
                </p>
                <p className="text-[11px] text-slate-500 font-bold mt-1 whitespace-nowrap">
                  {settings.location || 'م/شبوه/رضوم/ عين بامعبد'}{settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}
                </p>
              </div>

              {/* Center: Fixed Size Logo & Document Title */}
              <div className="text-center flex flex-col items-center justify-center px-4">
                <img
                  src="/logo.png"
                  alt="شعار السوق"
                  className="w-[110px] h-[110px] min-w-[110px] min-h-[110px] max-w-[110px] max-h-[110px] object-contain block mx-auto drop-shadow-sm print:w-[110px] print:h-[110px]"
                />
                <div className="text-sm sm:text-base font-black text-slate-900 mt-1 whitespace-nowrap">
                  {selectedDebtor ? 'كشف مديونية ومطالبة مالية' : 'كشف ديون المشترين (اسم المشتري والديون باليوم)'}
                </div>
                {selectedDebtor ? (
                  <div className="text-xs font-black text-slate-700 mt-0.5 whitespace-nowrap">
                    العميل: {selectedDebtor.buyerName}
                  </div>
                ) : (
                  <div className="text-[11px] font-bold text-slate-600 mt-0.5 whitespace-nowrap">
                    {scope === 'all' ? 'الرصيد التراكمي الشامل لكافة المشترين' : 'ديون اليوم فقط'}
                  </div>
                )}
              </div>

              {/* Left: Official Meta Box (Exact Match to Image 2) */}
              <div className="text-left flex flex-col items-end">
                <div className="border-2 border-slate-900 bg-white rounded-none px-4 py-2 text-center min-w-[170px] shadow-2xs">
                  <div className="text-[11px] font-black text-slate-600 mb-0.5">
                    {selectedDebtor ? 'رقم السند / المطالبة' : 'رقم الكشف / المرجع'}
                  </div>
                  <div className="text-sm font-black text-slate-900 font-mono tracking-wider">
                    {selectedDebtor
                      ? `DEBT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(selectedDebtor.buyerId || '0000').slice(-4).toUpperCase()}`
                      : voucherNumber}
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold mt-1">
                    التاريخ: {todayDateStr}
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold">
                    الوقت: {todayTimeStr}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Executive KPI Financial Summary Cards */}
          <div className={`grid gap-2 mb-3 ${selectedDebtor ? 'grid-cols-4' : 'grid-cols-2 md:grid-cols-5'}`}>
            {selectedDebtor ? (
              <>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">المشتري المدين</span>
                  <span className="text-sm font-black text-slate-900 block truncate">{selectedDebtor.buyerName}</span>
                  <span className="text-xs text-black font-mono font-bold block">{selectedDebtor.buyerPhone || '—'}</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">إجمالي صافي المديونية</span>
                  <span className="text-sm font-black text-red-600 font-mono block">
                    {formatCurrency(selectedDebtor.remainingDebt, settings.currency)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold block">مستحق السداد</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">عدد الشروات المعلقة</span>
                  <span className="text-sm font-black text-slate-900 font-mono block">{selectedDebtor.dealsCount}</span>
                  <span className="text-[10px] text-slate-500 font-bold block">شروة / فاتورة</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">حالة الحساب</span>
                  <span className="text-xs font-black text-red-600 block">مطلوب السداد</span>
                  <span className="text-[10px] text-slate-500 font-bold block">آجل غير مسدد</span>
                </div>
              </>
            ) : (
              <>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">عدد المشترين المدينين</span>
                  <span className="text-sm font-black text-slate-900 font-mono block">{debtors.length} مشتري</span>
                  <span className="text-[10px] text-slate-500 font-bold block">{scope === 'all' ? 'رصيد تراكمي' : 'ديون اليوم'}</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">إجمالي صافي المديونية</span>
                  <span className="text-sm font-black text-red-600 font-mono block">
                    {formatNumber(totals.totalDebt)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold block">مستحق السداد</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">
                    {paidMode === 'today' ? 'المسدد في اليوم' : 'إجمالي المسدد'}
                  </span>
                  <span className="text-sm font-black text-emerald-600 font-mono block">
                    {formatNumber(paidMode === 'today' ? totals.todayPaid : totals.totalPaid)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold block">
                    {paidMode === 'today' ? 'سُدد اليوم' : 'تم تسديده كلياً'}
                  </span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">عدد الشروات المعلقة</span>
                  <span className="text-sm font-black text-slate-900 font-mono block">{totals.totalInvoices}</span>
                  <span className="text-[10px] text-slate-500 font-bold block">شروة / فاتورة</span>
                </div>
                <div className="border border-slate-300 bg-slate-50/80 p-2 text-center">
                  <span className="text-[11px] font-bold text-slate-600 block mb-0.5">حالة الحساب</span>
                  <span className="text-xs font-black text-red-600 block">مطلوب السداد</span>
                  <span className="text-[10px] text-slate-500 font-bold block">آجلة غير مسددة</span>
                </div>
              </>
            )}
          </div>

          {/* Table Container - Exact Styling with High-Contrast Black Grid */}
          <div className="overflow-x-auto border-2 border-black mb-3">
            {selectedDebtor ? (
              /* Single Debtor Individual Claim Table */
              <table className="w-full text-right text-sm border-collapse border border-black">
                <thead className="bg-slate-200 text-slate-900 font-black border-b-2 border-black">
                  <tr>
                    <th className="p-2.5 border-l border-black w-14 text-center text-sm">م</th>
                    <th className="p-2.5 border-l border-black text-right text-sm">بيان اليوم والتاريخ</th>
                    <th className="p-2.5 border-l border-black text-center w-40 text-sm">المبلغ المتبقي</th>
                    <th className="p-2.5 text-center w-32 text-sm">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black text-sm">
                  {selectedDebtor.dailyBreakdown && selectedDebtor.dailyBreakdown.length > 0 ? (
                    selectedDebtor.dailyBreakdown.map((b, i) => (
                      <tr key={b.dayKey} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="p-2.5 border-l border-black text-center font-mono font-bold text-slate-700 text-sm">
                          {i + 1}
                        </td>
                        <td className="p-2.5 border-l border-black font-bold text-slate-900 text-sm">
                          {b.dayName} <span className="font-mono text-slate-600 text-xs">({b.dateStr})</span>
                        </td>
                        <td className="p-2.5 border-l border-black text-center font-mono font-black text-red-600 text-base">
                          {formatCurrency(b.remainingDebt, settings.currency)}
                        </td>
                        <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                          آجل / مستحق
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="bg-white">
                      <td className="p-2.5 border-l border-black text-center font-mono font-bold text-slate-700 text-sm">1</td>
                      <td className="p-2.5 border-l border-black font-bold text-slate-900 text-sm">
                        إجمالي الفواتير والشروات الآجلة المعلقة
                      </td>
                      <td className="p-2.5 border-l border-black text-center font-mono font-black text-red-600 text-base">
                        {formatCurrency(selectedDebtor.remainingDebt, settings.currency)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                        آجل / مستحق
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-black border-t-2 border-black text-sm">
                  <tr>
                    <td colSpan={2} className="p-2.5 border-l border-black text-right font-black text-sm">
                      إجمالي صافي المديونية المطلوب سدادها:
                    </td>
                    <td className="p-2.5 border-l border-black text-center font-mono font-black text-red-600 text-base">
                      {formatCurrency(selectedDebtor.remainingDebt, settings.currency)}
                    </td>
                    <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                      مستحق
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              /* All Debtors Collective Table */
              <table className="w-full text-right text-sm border-collapse border border-black">
                <thead className="bg-slate-200 text-slate-900 font-black border-b-2 border-black">
                  <tr>
                    <th className="p-2.5 border-l border-black w-14 text-center text-sm">م</th>
                    <th className="p-2.5 border-l border-black text-right w-64 min-w-[200px] text-sm">اسم المشتري</th>
                    <th className="p-2.5 border-l border-black text-right text-sm">
                      المبالغ المستحقة باليوم (اليوم والتاريخ - المبلغ)
                    </th>
                    <th className="p-2.5 text-center border-l border-black w-40 text-sm bg-emerald-50">
                      {paidMode === 'today' ? 'المسدد في اليوم' : 'المسدد الكلي'}
                    </th>
                    <th className="p-2.5 text-center border-l border-black w-40 text-sm bg-red-50">المبلغ المتبقي</th>
                    <th className="p-2.5 text-center w-28 text-sm">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black text-sm">
                  {debtors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-bold bg-white">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <span className="text-sm">لا توجد أي ديون معلقة على المشترين في هذه الفترة.</span>
                          <span className="text-xs text-emerald-600 font-medium">كافة حسابات المشترين مسددة بالكامل ✓</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    debtors.map((d, index) => (
                      <tr key={d.buyerId} className={`hover:bg-slate-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="p-2.5 border-l border-black text-center font-mono font-bold text-slate-700 text-sm">
                          {index + 1}
                        </td>
                        <td className="p-2.5 border-l border-black align-top">
                          <div className="flex flex-col gap-1.5">
                            <div>
                              <div className="text-base font-black text-slate-900">{d.buyerName}</div>
                              {d.buyerPhone && (
                                <div className="text-xs font-mono font-bold text-black mt-0.5" dir="ltr">{d.buyerPhone}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-wrap no-print pt-0.5">
                              {/* Preview Claim Button (Switches to Image 2 design immediately) */}
                              <button
                                type="button"
                                onClick={() => setSelectedDebtorId(d.buyerId)}
                                className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                                title="معاينة مطالبة هذا المشتري بالتصميم الفردي"
                              >
                                <Eye className="w-3 h-3" />
                                <span>معاينة</span>
                              </button>

                              <button
                                type="button"
                                disabled={exportingDebtorId === d.buyerId}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadSingleDebtorPdf(d);
                                }}
                                className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                title={`تحميل كشف مديونية ${d.buyerName} كملف PDF`}
                              >
                                {exportingDebtorId === d.buyerId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Download className="w-3 h-3" />
                                )}
                                <span>تحميل</span>
                              </button>

                              <button
                                type="button"
                                disabled={sendingWhatsAppDebtorId === d.buyerId}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    setSendingWhatsAppDebtorId(d.buyerId);
                                    await sendDebtorStatementViaWhatsApp(
                                      {
                                        buyerName: d.buyerName,
                                        buyerPhone: d.buyerPhone,
                                        totalDebt: d.remainingDebt,
                                        dealsCount: d.dealsCount,
                                        dailyBreakdown: d.dailyBreakdown.map((b) => ({
                                          dayKey: b.dayKey,
                                          dayName: b.dayName,
                                          dateStr: b.dateStr,
                                          debt: b.remainingDebt,
                                        })),
                                        unpaidTransactions: d.unpaidTransactions,
                                      },
                                      settings
                                    );
                                  } finally {
                                    setSendingWhatsAppDebtorId(null);
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-[#25D366] hover:bg-[#20ba59] text-white text-[10px] font-bold inline-flex items-center gap-1 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                title={`إرسال كشف مديونية ${d.buyerName} عبر واتساب`}
                              >
                                {sendingWhatsAppDebtorId === d.buyerId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <WhatsAppIcon size={12} />
                                )}
                                <span>WhatsApp</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        {/* Daily Debt Breakdown */}
                        <td className="p-2.5 border-l border-black text-right">
                          <div className="space-y-1">
                            {d.dailyBreakdown.map((b) => (
                              <div
                                key={b.dayKey}
                                className="flex items-center justify-between gap-3 px-3 py-1.5 rounded bg-slate-50 border border-slate-300 text-sm"
                              >
                                <span className="font-bold text-slate-900">
                                  {b.dayName} <span className="font-mono text-slate-600 text-xs">({b.dateStr})</span>:
                                </span>
                                <span className="font-black font-mono text-red-600 text-sm">
                                  {formatNumber(b.remainingDebt)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="p-2.5 border-l border-black text-center font-mono font-black text-emerald-600 bg-emerald-50/40 text-base">
                          {formatNumber(paidMode === 'today' ? (d.todayPaid || 0) : (d.totalPaid || 0))}
                        </td>
                        <td className="p-2.5 border-l border-black text-center font-mono font-black text-red-600 bg-red-50/40 text-base">
                          {formatNumber(d.remainingDebt)}
                        </td>
                        <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                          آجل / مستحق
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {debtors.length > 0 && (
                  <tfoot className="bg-slate-100 font-black border-t-2 border-black text-sm">
                    <tr>
                      <td colSpan={3} className="p-2.5 border-l border-black text-right font-black text-sm">
                        إجمالي كافة ديون المشترين المطلوب سدادها:
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-emerald-600 bg-emerald-50/60 text-base border-l border-black">
                        {formatNumber(paidMode === 'today' ? totals.todayPaid : totals.totalPaid)}
                      </td>
                      <td className="p-2.5 text-center font-mono font-black text-red-600 bg-red-50/60 text-base border-l border-black">
                        {formatNumber(totals.totalDebt)}
                      </td>
                      <td className="p-2.5 text-center font-bold text-red-600 text-sm">
                        مستحق
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>

          {/* Bottom Debt Summary Bar (Exact Match to Image 2) */}
          <div className="flex justify-between items-center bg-slate-50 border border-slate-300 p-2.5 mb-2 text-xs font-bold">
            <div className="text-slate-700">
              {selectedDebtor ? (
                <span>العميل: <strong className="text-slate-900 text-sm font-black">{selectedDebtor.buyerName}</strong></span>
              ) : (
                <span>عدد المشترين المدينين: <strong className="text-slate-900 text-sm font-black">{debtors.length} مشتري</strong></span>
              )}
            </div>
            {!selectedDebtor && (
              <div className="text-emerald-700 text-xs font-black">
                <span>{paidMode === 'today' ? 'المسدد في اليوم: ' : 'إجمالي المسدد: '}</span>
                <span className="font-mono text-sm font-black mr-1">
                  {formatNumber(paidMode === 'today' ? totals.todayPaid : totals.totalPaid)}
                </span>
              </div>
            )}
            <div className="text-red-700 text-xs font-black">
              <span>المتبقي (آجل): </span>
              <span className="font-mono text-sm font-black mr-1">
                {formatNumber(selectedDebtor ? selectedDebtor.remainingDebt : totals.totalDebt)}
              </span>
            </div>
          </div>

          {/* Tafqeet (Exact Match to Image 2) */}
          <div className="text-center text-xs font-bold text-slate-600 mb-2">
            فقط وقدره: {tafqeet(selectedDebtor ? selectedDebtor.remainingDebt : totals.totalDebt, settings.currency).replace(/^فقط\s*/, '')} لا غير
          </div>

          {/* Notice / Instructions Box (Exact Match to Image 2) */}
          <div className="text-[11px] text-slate-600 text-center p-2 border border-dashed border-slate-300 mb-4 bg-slate-50/50">
            📌 يُرجى التكرم بسرعة توريد المبلغ المطلوب إلى أمين صندوق الحراج، أو سداده عبر حسابات الصرافة المعتمدة لدى إدارة السوق.
          </div>

          {/* 3-Column Signatures & Official Market Stamp (Exact Match to Image 2) */}
          <div className="pt-3 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-xs font-bold text-slate-700">
            <div>
              <span className="block mb-6">المحاسب / إدارة الحراج والتحصيل:</span>
              <div className="border-b border-dashed border-slate-400 mx-4"></div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <span className="text-[11px] text-slate-500 font-bold mb-1">ختم السوق الرسمي</span>
              <div className="border border-dashed border-slate-400 rounded-none w-14 h-14 flex items-center justify-center text-[10px] text-slate-400 font-bold">
                ختم السوق
              </div>
            </div>
            <div>
              <span className="block mb-6">
                {selectedDebtor ? 'توقيع واستلام العميل (المقر بالدين):' : 'اعتماد إدارة الصندوق والحسابات:'}
              </span>
              <div className="border-b border-dashed border-slate-400 mx-4"></div>
            </div>
          </div>

          {/* Micro Footer (Exact Match to Image 2) */}
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-4 pt-2 border-t border-slate-300">
            <div>نظام إدارة سوق الحراج للأسماك الطازجة والخضروات والفواكة © {new Date().getFullYear()}</div>
            <div>صفحة 1 من 1</div>
            <div dir="ltr">{todayDateStr} - {todayTimeStr}</div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 2. THERMAL RECEIPT MODE (80MM FOR CASH DRAWER CLOSING)         */}
      {/* ============================================================= */}
      {printMode === 'thermal' && (
        <div className="printable-receipt-area mx-auto max-w-[380px] w-full bg-white text-black p-5 rounded-none shadow-xl font-mono text-[12px] border border-dashed border-slate-300 mb-8 mt-16 print:mt-0 print:shadow-none print:border-none print:p-1 print:max-w-full">
          <div className="text-center pb-2 border-b-2 border-black">
            <div className="flex justify-center mb-1.5">
              <img src="/logo.png" alt="الشعار" className="w-20 h-20 object-contain mx-auto print:w-20 print:h-20" />
            </div>
            <h2 className="text-base font-black">{settings.marketName || 'سوق عين بامعبد المركزي'}</h2>
            <p className="text-[10px] text-gray-600">{(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
            <div className="font-bold text-xs mt-1 bg-black text-white py-0.5 px-2 inline-block rounded">
              كشف ديون المشترين (المبالغ باليوم)
            </div>
          </div>

          <div className="py-2 text-[11px] border-b border-dashed border-gray-400 space-y-0.5">
            <div className="flex justify-between">
              <span>المرجع:</span>
              <span>{voucherNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ والوقت:</span>
              <span>{todayDateStr} - {todayTimeStr}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد المشترين المديونين:</span>
              <span className="font-bold">{debtors.length} مشتري</span>
            </div>
          </div>

          <div className="py-2">
            <div className="font-bold border-b border-black pb-1 mb-1 flex justify-between text-[11px]">
              <span>اسم المشتري والمبلغ باليوم</span>
              <span>المتبقي</span>
            </div>
            {debtors.length === 0 ? (
              <div className="text-center py-4 text-gray-500">لا توجد ديون معلقة</div>
            ) : (
              <div className="space-y-2 divide-y divide-dotted divide-gray-300">
                {debtors.map((d, i) => (
                  <div key={d.buyerId} className="pt-2 text-[11px]">
                    <div className="flex justify-between items-start font-black">
                      <span>{i + 1}. {d.buyerName}</span>
                      <span className="font-mono text-right">
                        <span className="text-red-600">{formatCurrency(d.remainingDebt, settings.currency)}</span>
                      </span>
                    </div>
                    {/* Daily Debt Breakdown lines */}
                    <div className="mt-1 pr-2 space-y-0.5 border-r-2 border-black">
                      {d.dailyBreakdown.map((b) => (
                        <div key={b.dayKey} className="flex justify-between text-[10px] text-gray-800 font-bold">
                          <span>• {b.dayName} ({b.dateStr}):</span>
                          <span className="font-mono">{formatCurrency(b.remainingDebt, settings.currency)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="py-2 border-t-2 border-black space-y-1 text-[11px]">
            <div className="flex justify-between items-center text-sm font-black bg-red-100 text-red-900 p-1.5 rounded border border-red-300">
              <span>إجمالي الديون المطلوب سدادها:</span>
              <span>{formatCurrency(totals.totalDebt, settings.currency)}</span>
            </div>
          </div>

          <div className="py-2 text-[10px] text-center font-bold border-y border-dashed border-gray-400">
            {tafqeet(totals.totalDebt, settings.currency)}
          </div>

          <div className="pt-4 text-center text-[10px] space-y-4">
            <div className="flex justify-between px-2">
              <div>
                <span>أمين الصندوق:</span>
                <div className="mt-4 border-b border-black w-24"></div>
              </div>
              <div>
                <span>المحاسب:</span>
                <div className="mt-4 border-b border-black w-24"></div>
              </div>
            </div>
            <p className="text-gray-500 text-[9px]">نظام إدارة المبيعات الأساسية والموانئ السمكية</p>
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
