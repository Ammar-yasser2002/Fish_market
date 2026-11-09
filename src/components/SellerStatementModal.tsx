import React, { useMemo, useState } from 'react';
import { Contact, Transaction, MarketSettings, CashEntry } from '../types';
import {
  formatCurrency,
  formatNumber,
  formatDisplayDate,
  getWeekdayName,
  normalizeArabic,
  fuzzyMatchArabic,
  isSameCalendarDay,
} from '../utils/calculations';
import {
  X,
  Fish,
  Printer,
  Calendar,
  AlertCircle,
  TrendingDown,
  Coins,
  CheckCircle2,
  Clock,
  User,
  Search,
} from 'lucide-react';

interface SellerStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  seller: Contact | null;
  transactions: Transaction[];
  cashEntries?: CashEntry[];
  settings: MarketSettings;
  onOpenReceipt?: (trx: Transaction) => void;
}

export const SellerStatementModal: React.FC<SellerStatementModalProps> = ({
  isOpen,
  onClose,
  seller,
  transactions,
  cashEntries = [],
  settings,
  onOpenReceipt,
}) => {
  if (!isOpen || !seller) return null;

  // فواتير مبيعات الصياد المحددة
  const sellerTransactions = useMemo(() => {
    return (transactions || [])
      .filter((t) => {
        if (t.sellerId && seller.id) return t.sellerId === seller.id;
        return (t.sellerName || '').trim().toLowerCase() === (seller.name || '').trim().toLowerCase();
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [transactions, seller]);

  const [statementSearchQuery, setStatementSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [specificDate, setSpecificDate] = useState('');

  // فواتير مبيعات الصياد المحددة بعد التصفية والبحث الذكي
  const displayedSellerTransactions = useMemo(() => {
    let list = sellerTransactions;

    if (specificDate) {
      list = list.filter((t) => (t.dateStr === specificDate || isSameCalendarDay(t.dateStr || t.timestamp, specificDate)));
    }

    if (statusFilter !== 'all') {
      list = list.filter((t) => {
        const isPaid =
          t.sellerPaidStatus === 'paid' ||
          (t.sellerPaidAmount !== undefined && t.sellerPaidAmount >= t.netToSeller);
        return statusFilter === 'paid' ? isPaid : !isPaid;
      });
    }

    if (statementSearchQuery.trim()) {
      const q = statementSearchQuery.trim();
      const numQ = q.replace(/\D/g, '');
      list = list.filter((t) => {
        const idMatch = (t.id || '').toLowerCase().includes(q.toLowerCase());
        const buyerMatch = fuzzyMatchArabic(t.buyerName, q);
        const fishMatch = t.items?.some((it) => fuzzyMatchArabic(it.fishName, q));
        const amountMatch = numQ ? String(t.grossAmount || '').includes(numQ) || String(t.netToSeller || '').includes(numQ) : false;
        return idMatch || buyerMatch || fishMatch || amountMatch;
      });
    }

    return list;
  }, [sellerTransactions, specificDate, statusFilter, statementSearchQuery]);

  // سندات الصرف النقدي المدفوعة للصياد (Cash Out)
  const sellerPayoutEntries = useMemo(() => {
    return (cashEntries || [])
      .filter((c) => {
        if (c.type !== 'expense' && c.type !== 'payout' && c.type !== 'seller_payout') return false;
        if (c.contactId && seller.id) return c.contactId === seller.id;
        return (c.contactName || c.recipient || '').trim().toLowerCase() === (seller.name || '').trim().toLowerCase();
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [cashEntries, seller]);

  // الحسابات المالية الإجمالية للصياد
  const totals = useMemo(() => {
    let grossTotal = 0;
    let taxTotal = 0;
    let netTotal = 0;
    let paidFromInvoices = 0;

    sellerTransactions.forEach((t) => {
      grossTotal += Number(t.grossAmount) || 0;
      taxTotal += Number(t.sellerTaxAmount) || 0;
      netTotal += Number(t.netToSeller) || 0;
      if (t.sellerPaidStatus === 'paid') {
        paidFromInvoices += Number(t.netToSeller) || 0;
      } else if (t.sellerPaidAmount !== undefined) {
        paidFromInvoices += Number(t.sellerPaidAmount) || 0;
      }
    });

    const payoutsCashTotal = sellerPayoutEntries.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const totalDisbursed = paidFromInvoices + payoutsCashTotal;
    const remainingBalance = Math.max(0, netTotal - totalDisbursed);

    return {
      grossTotal,
      taxTotal,
      netTotal,
      totalDisbursed,
      remainingBalance,
      invoicesCount: sellerTransactions.length,
    };
  }, [sellerTransactions, sellerPayoutEntries]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-none border border-slate-300 shadow-xl flex flex-col overflow-hidden text-right">
        {/* Header */}
        <div className="bg-[#030164] text-white px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Fish className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-black text-sm sm:text-base">
                كشف حساب ومستحقات الصياد: {seller.name}
              </h3>
              <p className="text-[11px] text-blue-200">
                {seller.phone ? `هاتف: ${seller.phone} | ` : ''}
                إجمالي {totals.invoicesCount} فاتورة مبيعات مسجلة
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-none border border-white/30 text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="طباعة كشف الحساب"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/20 text-white rounded-none cursor-pointer"
              title="إغلاق [Esc]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Financial Summary Badges */}
        <div className="p-3 bg-[#e9f1fb] border-b border-slate-300 grid grid-cols-2 sm:grid-cols-5 gap-2 shrink-0">
          <div className="bg-white p-2 border border-slate-300 text-center">
            <span className="text-[10px] text-slate-500 font-bold block">إجمالي المبيعات (Gross)</span>
            <span className="font-mono font-black text-xs sm:text-sm text-slate-900">
              {formatCurrency(totals.grossTotal, settings.currency)}
            </span>
          </div>

          <div className="bg-white p-2 border border-slate-300 text-center">
            <span className="text-[10px] text-rose-600 font-bold block">خصم الحراج (-3%)</span>
            <span className="font-mono font-black text-xs sm:text-sm text-rose-800">
              -{formatCurrency(totals.taxTotal, settings.currency)}
            </span>
          </div>

          <div className="bg-white p-2 border border-slate-300 text-center">
            <span className="text-[10px] text-blue-700 font-bold block">صافي مستحقاته الكلية</span>
            <span className="font-mono font-black text-xs sm:text-sm text-blue-950">
              {formatCurrency(totals.netTotal, settings.currency)}
            </span>
          </div>

          <div className="bg-white p-2 border border-slate-300 text-center">
            <span className="text-[10px] text-emerald-700 font-bold block">إجمالي المصروف له نقداً</span>
            <span className="font-mono font-black text-xs sm:text-sm text-emerald-800">
              {formatCurrency(totals.totalDisbursed, settings.currency)}
            </span>
          </div>

          <div className="bg-emerald-50 p-2 border-2 border-emerald-600 text-center col-span-2 sm:col-span-1">
            <span className="text-[10px] text-emerald-900 font-black block">المتبقي له بذمة السوق</span>
            <span className="font-mono font-black text-xs sm:text-sm text-emerald-950">
              {formatCurrency(totals.remainingBalance, settings.currency)}
            </span>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-[#e9f1fb] border-b border-slate-300 px-3 py-1.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-0.5 rounded-none shadow-2xs">
              <Search className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <input
                type="text"
                value={statementSearchQuery}
                onChange={(e) => setStatementSearchQuery(e.target.value)}
                placeholder="بحث برقم الفاتورة، المشتري، نوع السمك..."
                className="bg-transparent text-slate-900 font-bold text-xs outline-none placeholder:text-slate-400 placeholder:font-normal py-0.5 w-44 sm:w-56"
              />
              {statementSearchQuery && (
                <button
                  type="button"
                  onClick={() => setStatementSearchQuery('')}
                  className="text-slate-400 hover:text-rose-600 font-bold text-xs cursor-pointer px-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white border border-slate-300 px-2 py-0.5 rounded-none shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <label className="font-bold text-slate-700 text-xs">تاريخ:</label>
              <input
                type="date"
                value={specificDate}
                onChange={(e) => setSpecificDate(e.target.value)}
                className="bg-transparent text-slate-900 font-bold text-xs outline-none cursor-pointer font-mono py-0.5"
              />
              {specificDate && (
                <button
                  type="button"
                  onClick={() => setSpecificDate('')}
                  className="text-slate-400 hover:text-rose-600 font-bold text-xs cursor-pointer px-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-300 text-slate-900 font-bold rounded-none px-2 py-1 text-xs outline-none cursor-pointer"
            >
              <option value="all">كافة الفواتير</option>
              <option value="paid">تم الصرف</option>
              <option value="pending">مؤجل بذمة السوق</option>
            </select>
          </div>

          <div className="font-bold text-slate-600 text-xs font-mono">
            عرض {displayedSellerTransactions.length} من أصل {sellerTransactions.length} فاتورة
          </div>
        </div>

        {/* Transactions Table */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-2 bg-white border border-slate-300 px-3 py-2 text-sm font-black text-slate-900">
            اسم الصياد: {seller.name}
          </div>
          <div className="bg-white border border-slate-300 rounded-none overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-[#dbeafe] text-slate-900 font-bold border-b border-slate-300">
                  <th className="p-2 border border-slate-300 text-center w-12"># الفاتورة</th>
                  <th className="p-2 border border-slate-300 text-center w-28">التاريخ والوقت</th>
                  <th className="p-2 border border-slate-300">المشتري</th>
                  <th className="p-2 border border-slate-300">أصناف الأسماك</th>
                  <th className="p-2 border border-slate-300 text-center">الإجمالي الأساسي</th>
                  <th className="p-2 border border-slate-300 text-center">عمولة الحراج (-3%)</th>
                  <th className="p-2 border border-slate-300 text-center">الصافي للصياد</th>
                  <th className="p-2 border border-slate-300 text-center">حالة الصرف</th>
                  <th className="p-2 border border-slate-300 text-center">معاينة</th>
                </tr>
              </thead>
              <tbody>
                {displayedSellerTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400 bg-white">
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-bold">
                        {statementSearchQuery || specificDate || statusFilter !== 'all'
                          ? 'لا توجد فواتير مطابقة لخيارات البحث والتصفية المحددة'
                          : 'لا توجد فواتير مبيعات مسجلة لهذا الصياد'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  displayedSellerTransactions.map((t, idx) => {
                    const isEven = idx % 2 === 1;
                    const isPaid =
                      t.sellerPaidStatus === 'paid' ||
                      (t.sellerPaidAmount !== undefined && t.sellerPaidAmount >= t.netToSeller);
                    return (
                      <tr
                        key={t.id}
                        className={isEven ? 'bg-[#dce8f9] hover:bg-[#c6dbf6]' : 'bg-white hover:bg-[#eaf1fb]'}
                      >
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold text-blue-900">
                          {t.id}
                        </td>
                        <td className="p-2 border border-slate-300 text-center text-slate-600 font-mono text-[11px]">
                          <div>{formatDisplayDate(t.timestamp, t.dateStr)}</div>
                          <div className="text-[9px] text-slate-400">{t.timeStr || '--:--'}</div>
                        </td>
                        <td className="p-2 border border-slate-300 font-bold text-slate-800">
                          {t.buyerName}
                        </td>
                        <td className="p-2 border border-slate-300 text-slate-700">
                          {t.items?.map((it, i) => (
                            <span key={i} className="inline-block bg-white/80 px-1 border border-slate-300 ml-1 mb-0.5 text-[10px]">
                              {it.fishName} ({it.quantity} {it.unit})
                            </span>
                          ))}
                        </td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold text-slate-900">
                          {formatNumber(t.grossAmount)}
                        </td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold text-rose-800">
                          -{formatNumber(t.sellerTaxAmount)}
                        </td>
                        <td className="p-2 border border-slate-300 text-center font-mono font-bold text-emerald-900 bg-emerald-50/50">
                          {formatCurrency(t.netToSeller, settings.currency)}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          {isPaid ? (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 flex items-center justify-center gap-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                              تم الصرف
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300">
                              مؤجل بذمة السوق
                            </span>
                          )}
                        </td>
                        <td className="p-2 border border-slate-300 text-center">
                          {onOpenReceipt && (
                            <button
                              type="button"
                              onClick={() => onOpenReceipt(t)}
                              className="px-2 py-0.5 bg-white hover:bg-blue-100 text-blue-900 border border-slate-300 text-[11px] font-bold cursor-pointer"
                            >
                              فاتورة
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#f0f4f9] border-t border-slate-300 px-4 py-2 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-600 font-bold">
            صافي المستحق للصياد: {formatCurrency(totals.netTotal, settings.currency)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-none cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
