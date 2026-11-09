import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Contact, MarketSettings } from '../types';
import { formatCurrency, formatNumber, tafqeet, formatGregorianDate, formatGregorianTime } from '../utils/calculations';
import { Printer, X, Receipt, FileText, User, Phone, Calendar, CheckCircle2, Wallet, Scale, ArrowDownLeft, Loader2 } from 'lucide-react';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';
import { shareHtmlAsPdf, ShareTarget } from '../utils/shareUtils';
import { INVOICE_MARGIN_CREDIT_TEXT } from '../utils/invoiceExport';

export interface FishermanDisbursementItem {
  id: string;
  timestamp: number;
  dateStr: string;
  timeStr: string;
  sourceType: 'pos_sale' | 'payout_voucher' | 'advance_settlement' | 'advance_cash_repay';
  typeLabel: string;
  amount: number;
  totalDue?: number;
  remainingForTrx?: number;
  description: string;
  officer: string;
}

interface FishermanDisbursementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  seller?: Contact;
  disbursements: FishermanDisbursementItem[];
  filterTitle: string;
  totalPaid: number;
  remainingBalance: number;
  settings: MarketSettings;
  initialPrintMode?: 'official' | 'thermal';
}

export const FishermanDisbursementsModal: React.FC<FishermanDisbursementsModalProps> = ({
  isOpen,
  onClose,
  seller,
  disbursements,
  filterTitle,
  totalPaid,
  remainingBalance,
  settings,
  initialPrintMode = 'official',
}) => {
  const [printMode, setPrintMode] = useState<'official' | 'thermal'>(initialPrintMode);
  const [isSharingDisbursements, setIsSharingDisbursements] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (initialPrintMode) {
      setPrintMode(initialPrintMode);
    }
  }, [initialPrintMode, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrintA4 = () => {
    setPrintMode('official');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handlePrintThermal = () => {
    setPrintMode('thermal');
    setTimeout(() => {
      window.print();
    }, 120);
  };

  const handleShareDisbursements = async (target: ShareTarget) => {
    setIsSharingDisbursements(true);
    try {
      const el = document.querySelector('.printable-statement-area');
      if (!el) throw new Error('تعذر العثور على محتوى الكشف');
      const safeName = (seller?.name || 'الصياد').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
      const filename = `كشف_مسلمات_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;
      const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>${filename}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; direction: rtl; margin: 0; padding: 20px; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 11px; }
    th { background-color: #f1f5f9; font-weight: bold; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .font-bold { font-weight: bold; }
  </style>
</head>
<body>
  ${el.innerHTML}
</body>
</html>`;
      const res = await shareHtmlAsPdf(fullHtml, filename, target, `كشف مسلّمات ${seller?.name || ''}`);
      setToast(res.message);
      setTimeout(() => setToast(null), 5000);
    } catch (err: any) {
      setToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsSharingDisbursements(false);
    }
  };

  const todayDateStr = formatGregorianDate(new Date());
  const todayTimeStr = formatGregorianTime(new Date());
  const voucherNumber = `DISB-${(seller?.id || 'SLR').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const currentTotalAmount = disbursements.reduce((sum, d) => sum + d.amount, 0);

  if (!isOpen) return null;

  const modalContent = (
    <div
      id="fisherman-disbursements-modal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 print:p-0 print:bg-white print:fixed print:inset-0 print:z-50 print:overflow-visible flex flex-col items-center justify-start"
    >
      {/* Top Action Controls Bar */}
      <div className="w-full max-w-4xl bg-white rounded-none shadow-xl border border-slate-300 p-4 mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-none bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">سجل مسلّمات ودفعات الصياد المالية</h2>
            <p className="text-xs text-slate-500 font-medium">
              معاينة وطباعة سجل المبالغ المسلّمة للصياد: {seller?.name || 'غير محدد'} ({filterTitle})
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Format Preview Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-none border border-slate-300 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPrintMode('official')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'official'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>معاينة A4</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintMode('thermal')}
              className={`px-3 py-1.5 rounded-none flex items-center gap-1.5 transition-all cursor-pointer ${
                printMode === 'thermal'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>معاينة حراري (80mm)</span>
            </button>
          </div>

          {/* Direct Print Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="disbursements-print-thermal-btn"
              type="button"
              onClick={handlePrintThermal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-none bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all cursor-pointer active:scale-95"
              title="طباعة سجل المسلّمات فوراً على الطابعة الحرارية 80mm [Ctrl+P]"
            >
              <Receipt className="w-4 h-4" />
              <span>طباعة حرارية (80mm)</span>
            </button>

            <button
              id="disbursements-print-a4-btn"
              type="button"
              onClick={handlePrintA4}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-black rounded-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 border border-emerald-700"
              title="طباعة كشف المسلّمات فوراً بتنسيق ورقة A4 رسمية كاملة"
            >
              <FileText className="w-4 h-4" />
              <span>طباعة كشف A4</span>
            </button>

            {/* Three-dots menu (⋮) for Sharing Options */}
            <ShareOptionsDropdown
              id="disbursements-share-menu-btn"
              onShare={handleShareDisbursements}
              isSharing={isSharingDisbursements}
              buttonLabel="مشاركة ⋮"
              buttonClassName="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black rounded-none bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              menuTitle="مشاركة كشف مسلّمات الصياد (PDF)"
            />

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

        {/* Share Toast */}
        {toast && (
          <div className="w-full max-w-4xl mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold rounded-none flex items-center justify-between gap-2 shadow-xs no-print">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{toast}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-emerald-700 hover:text-emerald-950 font-black cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. OFFICIAL A4 DISBURSEMENT STATEMENT                                     */}
      {/* ========================================================================= */}
      {printMode === 'official' && (
        <div
          className="printable-statement-area relative w-full max-w-5xl bg-white text-slate-900 rounded-none shadow-xl border border-slate-300 p-4 sm:p-6 mb-8 print:shadow-none print:border-none print:rounded-none print:p-0 print:m-0 print:w-full print:max-w-full print:transform-none transition-transform duration-150"
          style={{ fontFamily: "'Cairo', system-ui, -apple-system, sans-serif", paddingLeft: '8px' }}
        >
          {/* Faint vertical developer margin credit */}
          <div className="invoice-margin-credit" aria-hidden="true">
            {INVOICE_MARGIN_CREDIT_TEXT}
          </div>
          {/* Header */}
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
                  سجل المبالغ المسلّمة للصياد ({filterTitle})
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
                سجل المبالغ المسلّمة للصياد
              </span>
              <div className="border-2 border-slate-900 px-3 py-1 rounded-none bg-white">
                <span className="text-xs font-bold text-slate-600 ml-1.5">رقم الكشف / المرجع:</span>
                <span className="font-mono font-black text-slate-900 text-sm">{voucherNumber}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono font-bold text-slate-600">
              <div>التاريخ: <span className="font-black text-slate-900">{todayDateStr}</span></div>
              <div>الوقت: <span className="font-black text-slate-900">{todayTimeStr}</span></div>
            </div>
          </div>

          {/* Seller Profile Card */}
          <div className="bg-slate-50 border border-slate-300 rounded-none p-4 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 font-bold block mb-0.5">اسم الصياد:</span>
              <span className="text-sm font-black text-slate-900">{seller?.name || 'غير محدد'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block mb-0.5">رقم الهاتف:</span>
              <span className="font-mono text-slate-700">{seller?.phone || 'لا يوجد'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block mb-0.5">عدد الحركات بالكشف:</span>
              <span className="font-mono font-bold text-slate-800">{disbursements.length} حركة</span>
            </div>
            <div>
              <span className="text-slate-500 font-bold block mb-0.5">تصنيف العرض:</span>
              <span className="font-bold text-emerald-800">{filterTitle}</span>
            </div>
          </div>

          {/* Itemized Disbursements Table */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-right text-xs border border-slate-300">
              <thead className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3 border-l border-slate-300 text-center w-10">م</th>
                  <th className="py-2.5 px-3 border-l border-slate-300">رقم الحركة / السند</th>
                  <th className="py-2.5 px-3 border-l border-slate-300">التاريخ والوقت</th>
                  <th className="py-2.5 px-3 border-l border-slate-300 text-center">نوع الحركة</th>
                  <th className="py-2.5 px-3 border-l border-slate-300 text-center">المبلغ المسلّم</th>
                  <th className="py-2.5 px-3 border-l border-slate-300">البيان والتفاصيل</th>
                  <th className="py-2.5 px-3 text-center">أمين الصندوق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {disbursements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                      لا توجد حركات تسليم مسجلة لهذا الصياد في هذا التصنيف.
                    </td>
                  </tr>
                ) : (
                  disbursements.map((d, idx) => (
                    <tr key={`${d.sourceType}-${d.id}`} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 border-l border-slate-300 text-center font-mono text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 border-l border-slate-300 font-mono font-bold text-slate-800">
                        {d.id}
                      </td>
                      <td className="py-2.5 px-3 border-l border-slate-300 font-mono text-slate-600 whitespace-nowrap">
                        {d.dateStr} - {d.timeStr}
                      </td>
                      <td className="py-2.5 px-3 border-l border-slate-300 text-center whitespace-nowrap font-bold">
                        {d.typeLabel}
                      </td>
                      <td className="py-2.5 px-3 border-l border-slate-300 text-center font-mono font-black text-slate-900 bg-slate-50/50 whitespace-nowrap">
                        {formatCurrency(d.amount, settings.currency)}
                      </td>
                      <td className="py-2.5 px-3 border-l border-slate-300 text-slate-700">
                        {d.description}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 whitespace-nowrap">
                        {d.officer}
                      </td>
                    </tr>
                  ))
                )}

                {/* Grand Total Row */}
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-900">
                  <td colSpan={4} className="py-3 px-4 border-l border-slate-300 text-right">
                    إجمالي المبالغ المسلّمة للصياد في هذا الكشف:
                  </td>
                  <td className="py-3 px-3 border-l border-slate-300 text-center font-mono text-sm text-emerald-800 bg-emerald-50">
                    {formatCurrency(currentTotalAmount, settings.currency)}
                  </td>
                  <td colSpan={2} className="py-3 px-4 text-xs font-bold text-slate-600">
                    {remainingBalance > 0 ? (
                      <span className="text-amber-800">المتبقي ديناً له على الحراج: {formatCurrency(remainingBalance, settings.currency)}</span>
                    ) : (
                      <span className="text-emerald-700">تمت تصفية كامل المستحقات ✓</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Amount in Words */}
          <div className="p-3 bg-slate-50 rounded-none border border-slate-300 mb-8 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-600">المبلغ الإجمالي المسلّم بالحروف:</span>
            <span className="font-black text-slate-900 text-sm">{tafqeet(currentTotalAmount, settings.currency)}</span>
          </div>

          {/* Signatures & Stamps Footer */}
          <div className="pt-8 border-t border-slate-300 flex justify-between items-end text-xs font-bold text-slate-900">
            <div className="text-center w-1/3">
              <span className="block mb-8 text-slate-700">توقيع واستلام الصياد:</span>
              <div className="border-b border-dashed border-slate-400 mx-4"></div>
            </div>

            <div className="text-center w-1/3 pb-1">
              <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-none flex items-center justify-center mx-auto text-[10px] text-slate-400 select-none">
                ختم السوق الرسمي
              </div>
            </div>

            <div className="text-center w-1/3">
              <span className="block mb-8 text-slate-700">توقيع مسؤول الصندوق:</span>
              <div className="border-b-2 border-slate-800 mx-4"></div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THERMAL (80mm) DISBURSEMENT RECEIPT                                    */}
      {/* ========================================================================= */}
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
              سجل مسلّمات الصياد
            </div>
          </div>

          <div className="py-2 border-b border-dashed border-gray-400 text-[11px] space-y-1">
            <div className="flex justify-between">
              <span className="font-bold">رقم الكشف:</span>
              <span className="font-black font-sans">{voucherNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>التاريخ:</span>
              <span dir="ltr" className="font-sans">{todayDateStr} {todayTimeStr}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-bold">الصياد:</span>
              <span className="font-black">{seller?.name || 'غير محدد'}</span>
            </div>
            <div className="flex justify-between">
              <span>التصنيف:</span>
              <span className="font-bold">{filterTitle}</span>
            </div>
            <div className="flex justify-between">
              <span>عدد الحركات:</span>
              <span className="font-bold">{disbursements.length} حركة</span>
            </div>
          </div>

          {/* Disbursements List */}
          <div className="py-2 border-b border-black divide-y divide-gray-300 text-[11px]">
            {disbursements.length === 0 ? (
              <div className="py-4 text-center text-gray-500 font-bold">لا توجد حركات مسلّمة مسجلة</div>
            ) : (
              disbursements.map((d, idx) => (
                <div key={`${d.sourceType}-${d.id}`} className="py-2 space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-600 font-bold">
                    <span>#{idx + 1} - سند/حركة: {d.id}</span>
                    <span dir="ltr">{d.dateStr} {d.timeStr}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-gray-700">{d.typeLabel}</span>
                    <span className="font-black text-black font-sans">{formatCurrency(d.amount, settings.currency)}</span>
                  </div>
                  <div className="text-[10px] text-gray-600 leading-tight">
                    {d.description}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Financial Summary */}
          <div className="py-2.5 border-b-2 border-black space-y-1.5 text-xs font-bold">
            <div className="flex justify-between text-sm font-black bg-gray-100 p-1.5 rounded">
              <span>إجمالي المسلّم:</span>
              <span className="font-sans font-black">{formatCurrency(currentTotalAmount, settings.currency)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-gray-700 pt-1">
              <span>المتبقي ديناً له:</span>
              <span className="font-sans font-bold">{formatCurrency(remainingBalance, settings.currency)}</span>
            </div>
          </div>

          {/* Footer & Signatures */}
          <div className="pt-4 text-[10px] space-y-5 text-center font-bold">
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="border-t border-gray-400 pt-1">
                <span>توقيع الصياد</span>
              </div>
              <div className="border-t border-gray-400 pt-1">
                <span>أمين الصندوق</span>
              </div>
            </div>
            <p className="text-gray-500 text-[9px]">تم تسليم المبالغ بموجب أنظمة حراج الميناء والجمعية</p>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
