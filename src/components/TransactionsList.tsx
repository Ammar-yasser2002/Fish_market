import React, { useState, useMemo } from 'react';
import { Transaction, MarketSettings, Contact, FishType } from '../types';
import { formatCurrency, formatDisplayDate, isTransactionResold, getResoldDetails, isTransferredTransaction, isSameCalendarDay, getTransactionBuyerDebt } from '../utils/calculations';
import { exportTransactionsToXlsx } from '../utils/storage';
import { exportTransactionsDayReportPdfA4 } from '../utils/invoiceExport';
import { EditTransactionModal } from './EditTransactionModal';
import { TransferBuyerModal } from './TransferBuyerModal';
import { WhatsAppInvoiceModal } from './WhatsAppInvoiceModal';
import { WhatsAppIcon } from '../utils/whatsapp';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareInvoicePdf, shareTransactionsDayReportPdf, ShareTarget } from '../utils/shareUtils';
import {
  Search,
  Printer,
  Pencil,
  Trash2,
  Calendar,
  Download,
  Filter,
  ArrowUpDown,
  Fish,
  Eye,
  TrendingUp,
  ArrowRightLeft,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';

interface TransactionsListProps {
  transactions: Transaction[];
  settings: MarketSettings;
  contacts?: Contact[];
  fishTypes?: FishType[];
  onOpenReceipt: (trx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onUpdateTransaction?: (updatedTrx: Transaction, autoPrint: boolean) => void;
  onSaveTransaction?: (newTrx: Transaction, autoPrint: boolean, updatedOriginalTrx?: Transaction) => void;
  onQuickAddContact?: (contactData: Partial<Contact>) => Contact;
}

export const TransactionsList: React.FC<TransactionsListProps> = ({
  transactions,
  settings,
  contacts = [],
  fishTypes = [],
  onOpenReceipt,
  onDeleteTransaction,
  onUpdateTransaction,
  onSaveTransaction,
  onQuickAddContact,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | '3days' | '7days' | 'all'>('today');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'debt_only' | 'association_cash' | 'direct_cash' | 'association_credit' | 'partial_cash'>('all');
  const [selectedTrxForDelete, setSelectedTrxForDelete] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transferringTransaction, setTransferringTransaction] = useState<Transaction | null>(null);
  const [whatsAppTrx, setWhatsAppTrx] = useState<Transaction | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [sharingTrxId, setSharingTrxId] = useState<string | null>(null);
  const [isSharingDayReport, setIsSharingDayReport] = useState(false);

  // Timeframe label for reports
  const timeframeLabel = useMemo(() => {
    if (dateFilter === 'today') return 'حركة اليوم';
    if (dateFilter === '3days') return 'حركة آخر 3 أيام';
    if (dateFilter === '7days') return 'حركة الأسبوع (آخر 7 أيام)';
    return 'كافة العمليات المسجلة';
  }, [dateFilter]);

  // Filter logic
  const filtered = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 3600 * 1000;

    return transactions.filter((t) => {
      // Date filter
      if (dateFilter === 'today') {
        if (!isSameCalendarDay(t.dateStr || t.timestamp, new Date())) return false;
      } else if (dateFilter === '3days') {
        if (now - t.timestamp > 3 * oneDay) return false;
      } else if (dateFilter === '7days') {
        if (now - t.timestamp > 7 * oneDay) return false;
      }

      // Settlement filter
      if (settlementFilter === 'debt_only') {
        const debt = t.buyerRemainingDebt ?? (t.paymentStatus === 'debt' || t.paymentStatus === 'partial' ? t.totalFromBuyer : 0);
        if (debt <= 0) return false;
      } else if (settlementFilter !== 'all') {
        if ((t.settlementType || 'association_cash') !== settlementFilter) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesId = t.id.toLowerCase().includes(query);
        const matchesSeller = t.sellerName.toLowerCase().includes(query);
        const matchesBuyer = t.buyerName.toLowerCase().includes(query);
        const matchesFish = t.items.some((it) => it.fishName.toLowerCase().includes(query));
        return matchesId || matchesSeller || matchesBuyer || matchesFish;
      }

      return true;
    });
  }, [transactions, searchTerm, dateFilter, settlementFilter]);

  // Aggregate metrics for filtered list
  const metrics = useMemo(() => {
    return filtered.reduce(
      (acc, t) => {
        acc.totalGross += t.grossAmount;
        acc.totalBuyerTax += t.buyerTaxAmount;
        acc.totalFromBuyers += t.totalFromBuyer;
        acc.totalSellerTax += t.sellerTaxAmount;
        acc.totalToSellers += t.netToSeller;
        acc.totalProfit += (t.harajProfit || 0);
        return acc;
      },
      {
        totalGross: 0,
        totalBuyerTax: 0,
        totalFromBuyers: 0,
        totalSellerTax: 0,
        totalToSellers: 0,
        totalProfit: 0,
      }
    );
  }, [filtered]);

  // Excel Export
  const handleExportExcel = () => {
    try {
      const cleanLabel = timeframeLabel.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
      const filename = `سجل_العمليات_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportTransactionsToXlsx(filtered, filename);
      setExportToast(`تم تصدير ملف Excel بنجاح (${filtered.length} عملية)`);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      console.error('Download Excel error:', err);
      setExportToast('حدث خطأ أثناء تصدير ملف الإكسل: ' + (err?.message || ''));
      setTimeout(() => setExportToast(null), 5000);
    }
  };

  // PDF Export (Calm A4 Daily Movement)
  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      const employee = localStorage.getItem('haraj_preferred_employee') || '';
      const res = await exportTransactionsDayReportPdfA4(
        filtered,
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
      console.error('Download PDF error:', err);
      setExportToast('فشل تصدير ملف PDF: ' + (err?.message || 'حدث خطأ أثناء المعالجة'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Share Single Transaction Invoice
  const handleShareTrx = async (trx: Transaction, target: ShareTarget) => {
    setSharingTrxId(trx.id);
    try {
      const res = await shareInvoicePdf(trx, settings, target, 'both');
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setSharingTrxId(null);
    }
  };

  // Share Day Movement Report A4
  const handleShareDayReport = async (target: ShareTarget) => {
    setIsSharingDayReport(true);
    try {
      const employee = localStorage.getItem('haraj_preferred_employee') || '';
      const res = await shareTransactionsDayReportPdf(
        filtered,
        settings,
        target,
        timeframeLabel,
        employee,
        contacts
      );
      setExportToast(res.message);
      setTimeout(() => setExportToast(null), 5000);
    } catch (err: any) {
      setExportToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setExportToast(null), 5000);
    } finally {
      setIsSharingDayReport(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-white border border-slate-300 p-3 rounded-none shadow-xs">
          <span className="text-xs text-slate-600 block mb-1 font-bold">عدد الشروات</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black font-mono text-slate-900">{filtered.length}</span>
            <span className="text-xs text-slate-500 font-bold">شروة</span>
          </div>
        </div>

        <div className="bg-white border border-slate-300 p-3 rounded-none shadow-xs">
          <span className="text-xs text-slate-600 block mb-1 font-bold">الإجمالي الأساسي</span>
          <span className="text-lg sm:text-xl font-black font-mono text-slate-900">
            {formatCurrency(metrics.totalGross, settings.currency)}
          </span>
        </div>

        <div className="bg-blue-50 border border-blue-300 p-3 rounded-none shadow-xs">
          <span className="text-xs text-blue-950 block mb-1 font-bold">مجموع مبيعات المشترين (+2%)</span>
          <span className="text-lg sm:text-xl font-black font-mono text-blue-900">
            {formatCurrency(metrics.totalFromBuyers, settings.currency)}
          </span>
        </div>

        <div className="text-white p-3 rounded-none shadow-xs border border-blue-950" style={{ backgroundColor: '#030164' }}>
          <span className="text-xs text-blue-100 block mb-1 font-bold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-sky-300" /> ربح وعمولات الجمعية (5%)
          </span>
          <span className="text-lg sm:text-xl font-black font-mono text-white">
            {formatCurrency(metrics.totalProfit, settings.currency)}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#f0f4f9] border border-slate-300 rounded-none p-3 space-y-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Search box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="trx-search-input"
              type="text"
              placeholder="البحث برقم الفاتورة، اسم المشتري، الصياد، أو نوع السمك..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 text-xs rounded-none pr-8 pl-3 py-1.5 focus:outline-none focus:border-blue-900 font-bold placeholder-slate-400"
            />
          </div>

          {/* Date Range Tabs */}
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-none border border-slate-300 text-xs">
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded-none font-bold transition-all cursor-pointer text-xs ${dateFilter === 'today' ? 'text-white' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              style={dateFilter === 'today' ? { backgroundColor: '#030164' } : undefined}
            >
              اليوم
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('3days')}
              className={`px-2.5 py-1 rounded-none font-bold transition-all cursor-pointer text-xs ${dateFilter === '3days' ? 'text-white' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              style={dateFilter === '3days' ? { backgroundColor: '#030164' } : undefined}
            >
              آخر 3 أيام
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('7days')}
              className={`px-2.5 py-1 rounded-none font-bold transition-all cursor-pointer text-xs ${dateFilter === '7days' ? 'text-white' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              style={dateFilter === '7days' ? { backgroundColor: '#030164' } : undefined}
            >
              الأسبوع
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded-none font-bold transition-all cursor-pointer text-xs ${dateFilter === 'all' ? 'text-white' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              style={dateFilter === 'all' ? { backgroundColor: '#030164' } : undefined}
            >
              الكل ({transactions.length})
            </button>
          </div>

          {/* Export Action Buttons: Excel & PDF A4 */}
          <div className="flex items-center gap-1.5">
            <button
              id="trx-export-excel-btn"
              type="button"
              onClick={handleExportExcel}
              className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1 transition-all border border-emerald-400 rounded-none cursor-pointer"
              title="تصدير جدول العمليات كملف Excel (.xlsx) منسق ومفصل"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Excel</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                id="trx-export-pdf-btn"
                type="button"
                disabled={isExportingPdf}
                onClick={handleExportPdf}
                className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-900 text-xs font-bold flex items-center gap-1 transition-all border border-blue-400 rounded-none cursor-pointer disabled:opacity-50"
                title="تصدير تقرير حركة اليوم كاملة بتنسيق A4 (PDF)"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
                    <span>جاري التصدير...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                    <span>PDF (A4)</span>
                  </>
                )}
              </button>
              <ShareOptionsDropdown
                onShare={handleShareDayReport}
                isSharing={isSharingDayReport}
                title="مشاركة تقرير حركة العمليات كملف PDF"
                buttonClassName="p-1 bg-white hover:bg-blue-50 text-blue-900 transition-all border border-blue-400 rounded-none cursor-pointer disabled:opacity-50"
                iconClassName="w-3.5 h-3.5 text-blue-700"
                align="left"
                id="trx-share-day-report-btn"
              />
            </div>
          </div>
        </div>

        {/* Settlement Type Sub-filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-300 text-xs">
          <span className="text-slate-600 font-bold ml-1">طريقة التسوية:</span>
          <button
            type="button"
            onClick={() => setSettlementFilter('all')}
            className={`px-2 py-0.5 rounded-none font-bold transition-all cursor-pointer border ${settlementFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-900'
                : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
              }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setSettlementFilter('debt_only')}
            className={`px-2 py-0.5 rounded-none font-bold transition-all cursor-pointer border ${settlementFilter === 'debt_only'
                ? 'bg-rose-700 text-white border-rose-800'
                : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border-rose-300'
              }`}
          >
            دين غير مسدد
          </button>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto rounded-none border border-slate-300 bg-white shadow-xs">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#f0f4f9] text-slate-800 font-bold border-b border-slate-300">
              <tr>
                <th className="p-2 border-l border-slate-200">رقم الفاتورة</th>
                <th className="p-2 border-l border-slate-200">الوقت / التاريخ</th>
                <th className="p-2 border-l border-slate-200">الصياد</th>
                <th className="p-2 border-l border-slate-200">المشتري</th>
                <th className="p-2 border-l border-slate-200">التسوية / الدين</th>
                <th className="p-2 border-l border-slate-200">الأسماك</th>
                <th className="p-2 text-center border-l border-slate-200">الأساسي (Gross)</th>
                <th className="p-2 text-center border-l border-slate-200">المطلوب (+2%)</th>
                <th className="p-2 text-center border-l border-slate-200">صافي الصياد (-3%)</th>
                <th className="p-2 text-center border-l border-slate-200">دخل الجمعية (5%)</th>
                <th className="p-2 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-400">
                    لا توجد عمليات بيع تطابق البحث المحدد.
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => (
                  <tr
                    key={`${t.id}_${idx}`}
                    className="hover:bg-blue-50/40 transition-colors"
                  >
                    {/* ID */}
                    <td className="p-3.5 font-mono font-bold text-blue-700">
                      <div>{t.id}</div>
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

                    {/* Date/Time */}
                    <td className="p-3.5 text-slate-600">
                      <div className="font-medium">{formatDisplayDate(t.timestamp, t.dateStr)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{t.timeStr}</div>
                    </td>

                    {/* Seller */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900">{t.sellerName}</span>
                        {(t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) && (
                          <span className="text-[10px] font-bold text-purple-700">
                            (إعادة بيع شروة)
                          </span>
                        )}
                      </div>
                      {(() => {
                        const sellerPaid =
                          t.sellerPaidStatus === 'paid'
                            ? t.netToSeller
                            : (typeof t.sellerPaidAmount === 'number'
                              ? t.sellerPaidAmount
                              : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0));
                        const isResaleTrx = t.isResale || t.notes?.startsWith('إعادة بيع شروة من:');
                        if (isResaleTrx) {
                          const surplusAmount = t.resaleSurplus || 0;
                          const commAmount = t.harajProfit || 0;
                          return (
                            <div className="mt-1 space-y-0.5">
                              {surplusAmount > 0 && (
                                <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                  <span>فائض أودع بالدرج:</span>
                                  <span className="font-mono font-black">{formatCurrency(surplusAmount, settings.currency)}</span>
                                </div>
                              )}
                              {commAmount > 0 && (
                                <div className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                                  <span>عمولة أودعت بالدرج:</span>
                                  <span className="font-mono font-black">{formatCurrency(commAmount, settings.currency)}</span>
                                </div>
                              )}
                            </div>
                          );
                        }

                        const sellerRem = Math.max(0, t.netToSeller - sellerPaid);
                        if (sellerRem > 0 && t.settlementType !== 'direct_cash') {
                          return (
                            <div className="mt-1 text-[11px] font-bold text-amber-700 flex items-center gap-1">
                              <span>دين للصياد:</span>
                              <span className="font-mono font-black">{formatCurrency(sellerRem, settings.currency)}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>

                    {/* Buyer */}
                    <td className="p-3.5">
                      <div className="font-bold text-blue-900">{t.buyerName}</div>
                      {t.buyerPhone && (
                        <div className="text-[10px] text-slate-400 font-mono">{t.buyerPhone}</div>
                      )}
                    </td>

                    {/* Settlement & Debt Status */}
                    <td className="p-3.5">
                      {(() => {
                        const resoldInfo = getResoldDetails(t);
                        if (resoldInfo.isResold) {
                          const remainingDebt = typeof t.buyerRemainingDebt === 'number' ? t.buyerRemainingDebt : t.totalFromBuyer;
                          return (
                            <div className="space-y-1">
                              {resoldInfo.isSettled ? (
                                <div className="text-[11px] font-bold text-purple-700">
                                  تمت التسوية بإعادة البيع ✓
                                </div>
                              ) : (
                                <div className="text-[11px] font-bold text-amber-700">
                                  إعادة بيع (معلقة حتى سداد الجديد)
                                </div>
                              )}
                              <div className="text-[10px] font-bold text-slate-800">
                                بيعت لـ: <span className="text-blue-900">{resoldInfo.newBuyerName || 'مشتري آخر'}</span>
                              </div>
                              {resoldInfo.newTransactionId && (
                                <div className="text-[9px] text-slate-500 font-mono">
                                  فاتورة جديدة #{resoldInfo.newTransactionId}
                                </div>
                              )}
                              <div className="text-[9px] font-medium text-slate-600">
                                حالة سداد الجديد:{' '}
                                <b className={resoldInfo.paymentStatus === 'paid' ? 'text-emerald-700' : 'text-amber-700'}>
                                  {resoldInfo.paymentStatus === 'paid' ? 'مدفوع نقداً ✓' : 'آجل (بانتظار السداد)'}
                                </b>
                              </div>
                              {!resoldInfo.isSettled && (
                                <div className="text-[10px] font-bold text-red-600 font-mono pt-0.5 border-t border-slate-100">
                                  دين معلق على {t.buyerName}: {formatCurrency(remainingDebt, settings.currency)}
                                </div>
                              )}
                            </div>
                          );
                        }

                        const st = t.settlementType || 'association_cash';
                        const remaining = getTransactionBuyerDebt(t);

                        return (
                          <div className="space-y-1">
                            {st === 'association_cash' && (
                              <div className="text-[11px] font-bold text-emerald-700">
                                كاش عبر الجمعية
                              </div>
                            )}
                            {st === 'direct_cash' && (
                              <div className="text-[11px] font-bold text-slate-700">
                                مباشر يد بيد
                              </div>
                            )}
                            {st === 'association_credit' && (
                              <div className="text-[11px] font-bold text-rose-600">
                                آجل (دين للجمعية)
                              </div>
                            )}
                            {st === 'partial_cash' && (
                              <div className="text-[11px] font-bold text-amber-700">
                                دفع جزئي
                              </div>
                            )}

                            {remaining > 0 ? (
                              <div className="text-[11px] font-mono font-bold text-red-600 flex items-center gap-1">
                                <span>متبقي:</span>
                                <span>{formatCurrency(remaining, settings.currency)}</span>
                              </div>
                            ) : (
                              (st === 'association_credit' || st === 'partial_cash') && (
                                <div className="text-[10px] font-bold text-emerald-600">
                                  تم السداد بالكامل ✓
                                </div>
                              )
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Fish Items summary */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        {t.items.map((it, idx) => (
                          <div key={idx} className="text-slate-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            <span className="font-medium">{it.fishName}:</span>
                            <span className="text-slate-500 font-mono text-[11px]">
                              {it.quantity} {it.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Gross */}
                    <td className="p-3.5 text-center font-mono font-bold text-slate-900">
                      {formatCurrency(t.grossAmount, settings.currency)}
                    </td>

                    {/* Total from Buyer */}
                    <td className="p-3.5 text-center font-mono font-bold text-blue-700 bg-blue-50/50">
                      {formatCurrency(t.totalFromBuyer, settings.currency)}
                      <div className="text-[10px] text-blue-600/80 font-sans">
                        (+{Math.round(t.buyerTaxAmount)})
                      </div>
                    </td>

                    {/* Net to Seller */}
                    <td className="p-3.5 text-center font-mono font-bold text-emerald-700 bg-emerald-50/40">
                      {formatCurrency(t.netToSeller, settings.currency)}
                      <div className="text-[10px] text-red-600/80 font-sans">
                        (-{Math.round(t.sellerTaxAmount)})
                      </div>
                      {(() => {
                        const sellerPaid =
                          t.sellerPaidStatus === 'paid'
                            ? t.netToSeller
                            : (typeof t.sellerPaidAmount === 'number'
                              ? t.sellerPaidAmount
                              : (typeof t.paidAtPosAmount === 'number' && t.sellerPaidStatus !== 'unpaid' ? t.paidAtPosAmount : 0));
                        const sellerRem = Math.max(0, t.netToSeller - sellerPaid);
                        if (sellerRem > 0 && t.settlementType !== 'direct_cash') {
                          return (
                            <div className="text-[10px] text-amber-700 font-bold font-sans mt-0.5">
                              المسلّم: {formatCurrency(sellerPaid, '')}
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </td>

                    {/* Haraj Profit */}
                    <td className="p-3.5 text-center font-mono font-black text-indigo-700">
                      {formatCurrency(t.harajProfit, settings.currency)}
                    </td>

                    {/* Actions */}
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenReceipt(t)}
                          className="p-1 rounded-none bg-white hover:bg-blue-50 text-blue-800 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          title="معاينة وطباعة الفاتورة (A4 / حراري)"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWhatsAppTrx(t)}
                          className="p-1 rounded-none bg-white hover:bg-emerald-50 text-emerald-700 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          title="إرسال الفاتورة عبر WhatsApp للمشتري أو الصياد"
                        >
                          <WhatsAppIcon size={14} />
                        </button>
                        <ShareOptionsDropdown
                          onShare={(target) => handleShareTrx(t, target)}
                          isSharing={sharingTrxId === t.id}
                          title="خيارات المشاركة المباشرة للفاتورة"
                          buttonClassName="p-1 rounded-none bg-white hover:bg-slate-50 text-slate-700 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          iconClassName="w-3.5 h-3.5 text-slate-700"
                          align="left"
                          id={`trx-share-row-btn-${t.id}`}
                        />
                        <button
                          type="button"
                          onClick={() => setEditingTransaction(t)}
                          className="p-1 rounded-none bg-white hover:bg-amber-50 text-amber-700 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          title="تعديل الفاتورة"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferringTransaction(t)}
                          className="p-1 rounded-none bg-white hover:bg-purple-50 text-purple-700 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          title="تحويل الشروة لمشتري آخر"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTrxForDelete(t.id)}
                          className="p-1 rounded-none bg-white hover:bg-red-50 text-red-600 transition-colors border border-slate-300 cursor-pointer shadow-none"
                          title="حذف العملية"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {selectedTrxForDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-none p-4 max-w-sm w-full space-y-3 shadow-xl text-slate-800">
            <h3 className="font-bold text-slate-900 text-sm">تأكيد حذف العملية</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف العملية رقم{' '}
              <span className="font-mono text-blue-900 font-bold">#{selectedTrxForDelete}</span>؟
              سيتم تعديل الحسابات والتقارير المالية تلقائياً.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedTrxForDelete(null)}
                className="px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-none cursor-pointer font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    if (selectedTrxForDelete) {
                      onDeleteTransaction(selectedTrxForDelete);
                    }
                  } catch (err) {
                    console.error('Error deleting transaction:', err);
                  } finally {
                    setSelectedTrxForDelete(null);
                  }
                }}
                className="px-4 py-1.5 text-xs bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-none border border-rose-800 cursor-pointer shadow-none"
              >
                تأكيد الحذف
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
          onClose={() => setEditingTransaction(null)}
          onSave={(updated, autoPrint) => {
            if (onUpdateTransaction) {
              onUpdateTransaction(updated, autoPrint);
            }
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
          onQuickAddContact={onQuickAddContact}
          onConfirmTransfer={(updated, autoPrint) => {
            if (onUpdateTransaction) {
              onUpdateTransaction(updated, autoPrint);
            }
          }}
          onResellTransaction={(newTrx, autoPrint, updatedOriginalTrx) => {
            if (onSaveTransaction) {
              onSaveTransaction(newTrx, autoPrint, updatedOriginalTrx);
            }
          }}
        />
      )}

      {/* WhatsApp Invoice Modal */}
      {whatsAppTrx && (
        <WhatsAppInvoiceModal
          isOpen={Boolean(whatsAppTrx)}
          onClose={() => setWhatsAppTrx(null)}
          transaction={whatsAppTrx}
          settings={settings}
        />
      )}

      {/* Toast Feedback for Export */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs sm:text-sm font-bold">{exportToast}</span>
          <button
            type="button"
            onClick={() => setExportToast(null)}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
