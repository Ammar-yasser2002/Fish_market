import React, { useState, useEffect } from 'react';
import { Contact, MarketSettings, CashEntry } from '../types';
import { formatCurrency, formatNumberWithDots, tafqeet } from '../utils/calculations';
import {
  Wallet,
  X,
  Printer,
  CheckCircle2,
  AlertCircle,
  ArrowDownRight,
  ArrowUpLeft,
  ShoppingBag,
  HandCoins,
  ShieldCheck,
  Check,
} from 'lucide-react';

interface BuyerAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  buyer: Contact;
  currentAdvanceBalance: number;
  availableSurplus?: number;
  currentDebt?: number;
  currentDrawerCash?: number;
  loanBalance?: number;
  initialTab?: 'advance' | 'loan';
  settings: MarketSettings;
  onSaveAdvanceEntry?: (
    buyerId: string,
    buyerName: string,
    amount: number,
    type: 'buyer_advance_deposit' | 'buyer_advance_refund',
    notes?: string,
    category?: string
  ) => CashEntry | void;
  onSaveBuyerLoan?: (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string
  ) => CashEntry | void;
  onRepayBuyerLoanCash?: (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string
  ) => CashEntry | void;
}

export const BuyerAdvanceModal: React.FC<BuyerAdvanceModalProps> = ({
  isOpen,
  onClose,
  buyer,
  currentAdvanceBalance,
  availableSurplus = 0,
  currentDebt = 0,
  currentDrawerCash = 0,
  loanBalance = 0,
  initialTab = 'advance',
  settings,
  onSaveAdvanceEntry,
  onSaveBuyerLoan,
  onRepayBuyerLoanCash,
}) => {
  const [mainTab, setMainTab] = useState<'advance' | 'loan'>(initialTab);

  // Advance state
  const [operationType, setOperationType] = useState<'deposit' | 'refund' | 'surplus_refund'>('deposit');
  const [amount, setAmount] = useState<number | ''>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [printedEntry, setPrintedEntry] = useState<CashEntry | null>(null);

  // Loan state
  const [loanTab, setBuyerLoanTab] = useState<'give' | 'repay'>('give');
  const [loanAmount, setBuyerLoanAmount] = useState<number | ''>('');
  const [loanNotes, setBuyerLoanNotes] = useState<string>('');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState<boolean>(false);
  const [loanErrorMessage, setLoanErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMainTab(initialTab || (loanBalance > 0 && currentAdvanceBalance <= 0 ? 'loan' : 'advance'));
      setAmount('');
      setNotes('');
      setErrorMessage(null);
      setPrintedEntry(null);
      setOperationType('deposit');

      setBuyerLoanTab(loanBalance > 0 ? 'repay' : 'give');
      setBuyerLoanAmount(loanBalance > 0 ? loanBalance : '');
      setBuyerLoanNotes('');
      setLoanErrorMessage(null);
      setIsSubmittingLoan(false);
    }
  }, [isOpen, initialTab, loanBalance, currentAdvanceBalance]);

  // Handle ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const numAmount = typeof amount === 'number' ? amount : 0;
  const numLoanAmount = typeof loanAmount === 'number' ? loanAmount : 0;

  const newBalanceAfter =
    operationType === 'deposit'
      ? currentAdvanceBalance + numAmount
      : operationType === 'refund'
      ? Math.max(0, currentAdvanceBalance - numAmount)
      : currentAdvanceBalance;

  const newSurplusAfter = Math.max(0, availableSurplus - numAmount);

  // Projected loan balance
  const projectedLoanAfter =
    loanTab === 'give'
      ? loanBalance + numLoanAmount
      : Math.max(0, loanBalance - numLoanAmount);

  const handleAdvanceSubmit = (andPrint: boolean) => {
    if (!numAmount || numAmount <= 0) {
      setErrorMessage('يرجى كتابة مبلغ صحيح أكبر من صفر');
      return;
    }

    if (operationType === 'refund' && numAmount > currentAdvanceBalance) {
      setErrorMessage(
        `المبلغ المراد استرداده (${formatCurrency(numAmount, settings.currency)}) أكبر من رصيد القدمة المتاح حالياً (${formatCurrency(currentAdvanceBalance, settings.currency)})!`
      );
      return;
    }

    if (operationType === 'surplus_refund' && numAmount > availableSurplus) {
      setErrorMessage(
        `المبلغ المراد استرداده (${formatCurrency(numAmount, settings.currency)}) أكبر من فائض الشروات المتاح حالياً (${formatCurrency(availableSurplus, settings.currency)})!`
      );
      return;
    }

    if ((operationType === 'refund' || operationType === 'surplus_refund') && currentDrawerCash !== undefined && numAmount > currentDrawerCash) {
      setErrorMessage(
        `المبلغ المراد استرداده نقداً (${formatCurrency(numAmount, settings.currency)}) يتجاوز رصيد الصندوق المتوفر حالياً (${formatCurrency(currentDrawerCash, settings.currency)})! لا يمكن إتمام العملية حتى لا يصبح الصندوق سالباً.`
      );
      return;
    }

    setErrorMessage(null);

    const entryType = operationType === 'deposit' ? 'buyer_advance_deposit' : 'buyer_advance_refund';
    const finalCategory = operationType === 'surplus_refund'
      ? 'استرداد فائض شروات'
      : (operationType === 'deposit' ? 'قبض دفعة مقدمة (قدمة)' : 'استرداد دفعة مقدمة');
    const defaultNote = operationType === 'surplus_refund'
      ? `استرداد فائض أرباح شروات معاد بيعها نقداً للمشتري (${buyer.name})`
      : (operationType === 'deposit' ? 'استلام قدمة / دفعة مسبقة من المشتري' : 'استرداد متبقي قدمة للمشتري نقداً');
    const finalNotes = notes.trim() || defaultNote;

    let createdEntry: CashEntry | null = null;
    if (typeof onSaveAdvanceEntry === 'function') {
      const res = onSaveAdvanceEntry(
        buyer.id,
        buyer.name,
        numAmount,
        entryType,
        finalNotes,
        finalCategory
      );
      if (res && res.id) {
        createdEntry = res;
      }
    }

    if (andPrint) {
      if (createdEntry) {
        setPrintedEntry(createdEntry);
        setTimeout(() => {
          window.print();
          onClose();
        }, 300);
      } else {
        window.print();
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleLoanSubmit = (andPrint: boolean) => {
    if (!numLoanAmount || numLoanAmount <= 0) {
      setLoanErrorMessage('يرجى كتابة مبلغ صحيح أكبر من صفر');
      return;
    }

    if (loanTab === 'give' && currentDrawerCash !== undefined && numLoanAmount > currentDrawerCash) {
      setLoanErrorMessage(
        `المبلغ المطلوب (${formatCurrency(numLoanAmount, settings.currency)}) يتجاوز رصيد الصندوق المتوفر حالياً (${formatCurrency(currentDrawerCash, settings.currency)})!`
      );
      return;
    }

    setLoanErrorMessage(null);
    setIsSubmittingLoan(true);

    try {
      let resEntry: CashEntry | null = null;
      if (loanTab === 'give') {
        if (onSaveBuyerLoan) {
          const res = onSaveBuyerLoan(
            buyer.id,
            buyer.name,
            numLoanAmount,
            loanNotes.trim() || undefined
          );
          if (res) resEntry = res;
        }
      } else {
        if (onRepayBuyerLoanCash) {
          const res = onRepayBuyerLoanCash(
            buyer.id,
            buyer.name,
            numLoanAmount,
            loanNotes.trim() || 'سداد سلفة مشتري نقداً'
          );
          if (res) resEntry = res;
        }
      }

      if (andPrint && resEntry) {
        setPrintedEntry(resEntry);
        setTimeout(() => {
          window.print();
          onClose();
        }, 300);
      } else {
        onClose();
      }
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  return (
    <div
      id="buyer-advance-modal"
      className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white border border-slate-300 rounded-none w-[96vw] max-w-6xl shadow-xl animate-in fade-in zoom-in-95 text-slate-800 my-auto max-h-[92vh] overflow-y-auto" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-none flex items-center justify-center border shrink-0 ${
              mainTab === 'advance'
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-amber-100 text-amber-700 border-amber-200'
            }`}>
              {mainTab === 'advance' ? <Wallet className="w-5 h-5" /> : <HandCoins className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>إدارة القدمة وسلف المشتري</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                المشتري: <strong className="text-slate-800">{buyer.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-none transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Unified Top Tabs: حساب القدمة vs سلف المشتري */}
        <div className="flex items-center border-b border-slate-300 bg-slate-100/60 px-5 pt-2 pb-0 gap-2">
          <button
            type="button"
            onClick={() => {
              setMainTab('advance');
              setErrorMessage(null);
            }}
            className={`pb-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
              mainTab === 'advance'
                ? 'border-emerald-600 text-emerald-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>حساب القدمة (دفعة مقدمة / استرداد)</span>
            {currentAdvanceBalance > 0 && (
              <span className="px-1.5 py-0.5 rounded-none bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                {formatCurrency(currentAdvanceBalance, '')}
              </span>
            )}
            {availableSurplus > 0 && (
              <span className="px-1.5 py-0.5 rounded-none bg-purple-100 text-purple-800 text-[10px] font-mono font-bold" title="فائض شروات متاح">
                +{formatCurrency(availableSurplus, '')}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setMainTab('loan');
              setLoanErrorMessage(null);
            }}
            className={`pb-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 cursor-pointer transition-all ${
              mainTab === 'loan'
                ? 'border-amber-600 text-amber-800 bg-white rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>سلف المشتري (صرف / سداد)</span>
            {loanBalance > 0 && (
              <span className="px-1.5 py-0.5 rounded-none bg-amber-100 text-amber-800 text-[10px] font-mono font-bold">
                {formatCurrency(loanBalance, '')}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: ADVANCE MANAGEMENT */}
        {mainTab === 'advance' && (
          <div className="p-5 space-y-4">
            {/* Current Status Cards */}
            <div className={`grid gap-3 ${availableSurplus > 0 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-none">
                <span className="text-[11px] font-bold text-emerald-900 block mb-0.5">
                  رصيد القدمة المتاح حالياً (دائن):
                </span>
                <span className="text-lg font-black font-mono text-emerald-800 block">
                  {formatCurrency(currentAdvanceBalance, settings.currency)}
                </span>
                {currentAdvanceBalance > 0 && (
                  <span className="text-[10px] font-mono font-bold text-emerald-700/80 block mt-0.5">
                    ({formatNumberWithDots(currentAdvanceBalance)})
                  </span>
                )}
              </div>
              {availableSurplus > 0 && (
                <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-none">
                  <span className="text-[11px] font-bold text-purple-900 block mb-0.5 flex items-center justify-between">
                    <span>فائض الشروات المستحق:</span>
                    <ShoppingBag className="w-3.5 h-3.5 text-purple-700" />
                  </span>
                  <span className="text-lg font-black font-mono text-purple-800 block">
                    {formatCurrency(availableSurplus, settings.currency)}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-purple-700/80 block mt-0.5">
                    ({formatNumberWithDots(availableSurplus)})
                  </span>
                </div>
              )}
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-none">
                <span className="text-[11px] font-bold text-slate-600 block mb-0.5">
                  ديون المشتري القائمة:
                </span>
                <span className={`text-lg font-black font-mono block ${currentDebt > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                  {formatCurrency(currentDebt, settings.currency)}
                </span>
                {currentDebt > 0 && (
                  <span className="text-[10px] font-mono font-bold text-amber-800/80 block mt-0.5">
                    ({formatNumberWithDots(currentDebt)})
                  </span>
                )}
              </div>
            </div>

            {/* Operation Type Selector: Deposit, Refund, or Surplus Refund */}
            <div className={`grid gap-2 p-1 bg-slate-100 rounded-none border border-slate-300 ${availableSurplus > 0 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
              <button
                type="button"
                onClick={() => {
                  setOperationType('deposit');
                  setErrorMessage(null);
                }}
                className={`py-2 px-3 rounded-none text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  operationType === 'deposit'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ArrowDownRight className="w-4 h-4" />
                <span>قبض قدمة (إيداع)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setOperationType('refund');
                  setErrorMessage(null);
                }}
                disabled={currentAdvanceBalance <= 0}
                className={`py-2 px-3 rounded-none text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  operationType === 'refund'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                <ArrowUpLeft className="w-4 h-4" />
                <span>استرداد متبقي قدمة</span>
              </button>

              {availableSurplus > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOperationType('surplus_refund');
                    setAmount(availableSurplus);
                    setErrorMessage(null);
                  }}
                  className={`py-2 px-3 rounded-none text-xs font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    operationType === 'surplus_refund'
                      ? 'bg-purple-700 text-white shadow-xs'
                      : 'text-purple-900 bg-purple-100/70 hover:bg-purple-200/80 border border-purple-300'
                  }`}
                  title="صرف واسترداد أرباح وفائض الشروات المعاد بيعها نقداً للمشتري"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>استرداد فائض الشروات (صرف)</span>
                </button>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-800 flex items-center justify-between">
                <span>
                  {operationType === 'deposit'
                    ? 'مبلغ القدمة المستلم نقدياً:'
                    : operationType === 'surplus_refund'
                    ? 'مبلغ فائض الشروات المراد صرفه واسترداده نقداً للمشتري:'
                    : 'مبلغ الاسترداد المصروف للمشتري:'}
                </span>
                <span className="text-[11px] text-slate-500 font-sans font-normal">
                  {settings.currency}
                </span>
              </label>

              {/* In refund mode: display available advance balance and quick full-refund button */}
              {operationType === 'refund' && (
                <div className="flex items-center justify-between p-2.5 bg-amber-50/80 border border-amber-200 rounded-none text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-amber-900">رصيد القدمة المتاح حالياً:</span>
                    <span className="font-black font-mono text-amber-800">
                      {formatCurrency(currentAdvanceBalance, settings.currency)}
                    </span>
                  </div>
                  {currentAdvanceBalance > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(currentAdvanceBalance);
                        setErrorMessage(null);
                      }}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-none text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      title="تحديد كامل الرصيد المتاح للاسترداد"
                    >
                      استرداد كامل المبلغ
                    </button>
                  )}
                </div>
              )}

              {/* In surplus_refund mode: display available surplus and quick full-refund button */}
              {operationType === 'surplus_refund' && (
                <div className="flex items-center justify-between p-2.5 bg-purple-50 border border-purple-200 rounded-none text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-purple-900">فائض الشروات المتاح للاسترداد:</span>
                    <span className="font-black font-mono text-purple-800">
                      {formatCurrency(availableSurplus, settings.currency)}
                    </span>
                  </div>
                  {availableSurplus > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAmount(availableSurplus);
                        setErrorMessage(null);
                      }}
                      className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-none text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                      title="تحديد كامل الفائض المتاح للاسترداد"
                    >
                      استرداد كامل الفائض
                    </button>
                  )}
                </div>
              )}

              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="any"
                  placeholder={
                    operationType === 'surplus_refund'
                      ? `أدخل المبلغ أو اضغط استرداد كامل الفائض (${formatCurrency(availableSurplus, '')})`
                      : operationType === 'refund'
                      ? `أدخل المبلغ أو اضغط استرداد كامل المبلغ (${formatCurrency(currentAdvanceBalance, '')})`
                      : "أدخل المبلغ..."
                  }
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setAmount(val);
                  }}
                  className={`w-full px-3 py-2.5 bg-slate-50 border rounded-none text-lg font-mono font-black text-slate-900 focus:bg-white focus:outline-none ${
                    operationType === 'surplus_refund'
                      ? 'border-purple-300 focus:ring-2 focus:ring-purple-500/40'
                      : 'border-slate-300 focus:ring-2 focus:ring-emerald-500/40'
                  }`}
                />
              </div>
              {numAmount > 0 && (
                <div className={`text-[11px] font-bold p-2.5 rounded-none leading-snug border space-y-1 ${
                  operationType === 'surplus_refund'
                    ? 'text-purple-900 bg-purple-50/80 border-purple-200'
                    : 'text-emerald-800 bg-emerald-50/70 border-emerald-200/60'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">المبلغ بالأرقام المنظمة:</span>
                    <span className="font-mono font-black text-xs">
                      {formatNumberWithDots(numAmount)} {settings.currency}
                      <span className="text-[10px] opacity-75 mr-1 font-normal">({formatCurrency(numAmount, '')})</span>
                    </span>
                  </div>
                  <div className="pt-1 border-t border-current/15">
                    <span className="text-slate-500 font-normal">كتابةً: </span>
                    {tafqeet(numAmount, settings.currency)}
                  </div>
                </div>
              )}
            </div>

            {/* Notes / Purpose */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">البيان والملاحظات:</label>
              <input
                type="text"
                placeholder={
                  operationType === 'surplus_refund'
                    ? `مثال: استرداد أرباح وفائض بيع الشروات نقداً للمشتري (${buyer.name})`
                    : operationType === 'deposit'
                    ? 'مثال: عربون مسبق لشروات حراج الغد'
                    : 'مثال: استرجاع متبقي رصيد القدمة نقداً'
                }
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* Projected Balance Preview */}
            {numAmount > 0 && (
              <div className="p-3 rounded-none bg-slate-50 border border-slate-300 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">
                  {operationType === 'surplus_refund' ? 'متبقي فائض الشروات بعد هذا الصرف:' : 'رصيد القدمة بعد هذه الحركة:'}
                </span>
                <span className={`font-mono font-black text-sm ${operationType === 'surplus_refund' ? 'text-purple-800' : 'text-emerald-700'}`}>
                  {formatCurrency(operationType === 'surplus_refund' ? newSurplusAfter : newBalanceAfter, settings.currency)}
                </span>
              </div>
            )}

            {errorMessage && (
              <div className="p-2.5 rounded-none bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleAdvanceSubmit(true)}
                className={`py-2.5 px-3 rounded-none text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                  operationType === 'surplus_refund'
                    ? 'bg-purple-700 hover:bg-purple-800 active:scale-98'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة السند</span>
              </button>
              <button
                type="button"
                onClick={() => handleAdvanceSubmit(false)}
                className="py-2.5 px-3 rounded-none bg-slate-800 hover:bg-slate-900 active:scale-98 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ السند فقط</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: LOAN MANAGEMENT */}
        {mainTab === 'loan' && (
          <div className="p-5 space-y-4">
            {/* Current Status Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-none">
                <span className="text-[11px] font-bold text-amber-900 block mb-0.5">
                  السلفة القائمة بذمة المشتري:
                </span>
                <span className="text-lg font-black font-mono text-amber-800 block">
                  {formatCurrency(loanBalance, settings.currency)}
                </span>
                {loanBalance > 0 && (
                  <span className="text-[10px] font-mono font-bold text-amber-700/80 block mt-0.5">
                    ({formatNumberWithDots(loanBalance)})
                  </span>
                )}
              </div>
              <div className="p-3 bg-slate-50 border border-slate-300 rounded-none">
                <span className="text-[11px] font-bold text-slate-600 block mb-0.5">
                  سيولة الصندوق المتوفرة:
                </span>
                <span className="text-lg font-black font-mono text-slate-800 block">
                  {formatCurrency(currentDrawerCash, settings.currency)}
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-500 block mt-0.5">
                  ({formatNumberWithDots(currentDrawerCash)})
                </span>
              </div>
            </div>

            {/* Sub-Tabs: Give vs Repay */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-none border border-slate-300">
              <button
                type="button"
                onClick={() => {
                  setBuyerLoanTab('give');
                  setLoanErrorMessage(null);
                }}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  loanTab === 'give'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>🔻 صرف سلفة (استلاف)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setBuyerLoanTab('repay');
                  setLoanErrorMessage(null);
                }}
                className={`py-2 px-3 rounded-none text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  loanTab === 'repay'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>🔺 سداد سلفة نقداً</span>
              </button>
            </div>

            {/* Info notice */}
            {loanTab === 'give' ? (
              <div className="p-3 bg-amber-50 rounded-none border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-bold">💡 المشتري يستلف نقدية من الصندوق:</p>
                <p className="text-[11px] text-amber-800">
                  سيتم صرف المبلغ نقداً من الصندوق وتقييده ديناً (سلفة قائمة) بذمة المشتري.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 rounded-none border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <p className="font-bold">💡 المشتري يورد نقدية للصندوق لسداد سلفته:</p>
                <p className="text-[11px] text-emerald-800">
                  سيتم إيداع المبلغ في الصندوق وتخفيض السلفة القائمة بذمة المشتري.
                </p>
              </div>
            )}

            {/* Loan Amount Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  {loanTab === 'give' ? 'مبلغ السلفة المطلوب صرفه:' : 'المبلغ المسدد نقداً للصندوق:'}
                </label>
                {loanTab === 'repay' && loanBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setBuyerLoanAmount(loanBalance)}
                    className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>سداد كامل السلفة</span>
                    <span className="font-mono">({formatNumberWithDots(loanBalance)})</span>
                  </button>
                )}
              </div>
              <input
                type="number"
                step="any"
                min="0.01"
                max={loanTab === 'give' && currentDrawerCash > 0 ? currentDrawerCash : undefined}
                value={loanAmount}
                onChange={(e) => setBuyerLoanAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-none text-sm font-black font-mono focus:bg-white focus:ring-2 focus:ring-amber-500"
              />

              {numLoanAmount > 0 && (
                <div className={`mt-2 p-2.5 rounded-none space-y-1 border text-xs ${
                  loanTab === 'give'
                    ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                    : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold">المبلغ بالأرقام المنظمة:</span>
                    <span className="font-black font-mono text-sm">
                      {formatNumberWithDots(numLoanAmount)} {settings.currency}
                      <span className="text-[10px] font-normal mr-1.5">({formatCurrency(numLoanAmount, '')})</span>
                    </span>
                  </div>
                  <div className="text-[11px] font-bold pt-1 border-t border-current/15">
                    <span className="text-slate-500 font-normal">المبلغ كتابةً: </span>
                    {tafqeet(numLoanAmount, settings.currency)}
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold pt-1 border-t border-current/15">
                    <span>{loanTab === 'give' ? 'إجمالي سلفة المشتري بعد الصرف:' : 'المتبقي من السلفة بعد السداد:'}</span>
                    <span className="font-mono font-black">
                      {formatCurrency(projectedLoanAfter, settings.currency)} ({formatNumberWithDots(projectedLoanAfter)})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-800">البيان والملاحظات (اختياري):</label>
              <input
                type="text"
                value={loanNotes}
                onChange={(e) => setBuyerLoanNotes(e.target.value)}
                placeholder={loanTab === 'give' ? 'مثال: سلفة نقدية شخصية للمشتري...' : 'مثال: سداد سلفة مشتري نقداً للصندوق...'}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-none text-xs focus:bg-white focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {loanErrorMessage && (
              <div className="p-2.5 rounded-none bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{loanErrorMessage}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isSubmittingLoan || !loanAmount || (loanTab === 'give' && Number(loanAmount) > currentDrawerCash)}
                onClick={() => handleLoanSubmit(true)}
                className={`py-2.5 px-3 rounded-none text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 ${
                  loanTab === 'give'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <Printer className="w-4 h-4" />
                <span>{loanTab === 'give' ? 'صرف وطباعة السند' : 'سداد وطباعة السند'}</span>
              </button>
              <button
                type="button"
                disabled={isSubmittingLoan || !loanAmount || (loanTab === 'give' && Number(loanAmount) > currentDrawerCash)}
                onClick={() => handleLoanSubmit(false)}
                className="py-2.5 px-3 rounded-none bg-slate-800 hover:bg-slate-900 active:scale-98 text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{loanTab === 'give' ? 'تأكيد الصرف فقط' : 'تأكيد السداد فقط'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Printable Voucher Section (Hidden on screen, prints when triggered) */}
        {printedEntry && (
          <div className="hidden print:block p-6 text-slate-900 font-sans" dir="rtl">
            <div className="text-center pb-4 border-b-2 border-slate-900 space-y-1">
              <img src="/logo.png" alt="الشعار" className="w-28 h-28 object-contain mx-auto mb-2" />
              <h2 className="text-lg font-black">{settings.marketName || 'سوق عين بامعبد المركزي للأسماك'}</h2>
              <p className="text-xs font-bold text-slate-600">
                {printedEntry.type === 'buyer_advance'
                  ? 'سند صرف سلفة نقدية لمشتري'
                  : printedEntry.type === 'buyer_advance_repay'
                  ? 'سند قبض سداد سلفة مشتري'
                  : printedEntry.category === 'استرداد فائض شروات' || printedEntry.description?.includes('فائض')
                  ? 'سند صرف واسترداد فائض شروات معاد بيعها'
                  : printedEntry.type === 'buyer_advance_deposit'
                  ? 'سند قبض دفعة نقدية مقدمة (قدمة مشتري)'
                  : 'سند صرف استرداد رصيد قدمة'}
              </p>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="flex justify-between font-mono font-bold">
                <span>رقم السند: {printedEntry.id}</span>
                <span>التاريخ والوقت: {printedEntry.dateStr} - {printedEntry.timeStr}</span>
              </div>
              <div className="flex justify-between border-b border-slate-300 pb-2">
                <span className="font-bold">
                  {printedEntry.type === 'buyer_advance_deposit' || printedEntry.type === 'buyer_advance_repay'
                    ? 'اسم المشتري (المودع / المسدد):'
                    : 'اسم المستلم (المشتري):'}
                </span>
                <span className="font-black text-sm">{buyer.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-300 pb-2">
                <span className="font-bold">
                  {printedEntry.type === 'buyer_advance_deposit' || printedEntry.type === 'buyer_advance_repay'
                    ? 'المبلغ المسلم / المسدد:'
                    : 'المبلغ المصروف:'}
                </span>
                <span className="font-mono font-black text-base text-emerald-800">
                  {formatCurrency(printedEntry.amount, settings.currency)}
                </span>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-none font-bold border border-slate-300">
                <span>المبلغ كتابةً: </span>
                <span>{tafqeet(printedEntry.amount, settings.currency)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-300 pb-2">
                <span className="font-bold">البيان:</span>
                <span>{printedEntry.description}</span>
              </div>
            </div>

            <div className="pt-8 grid grid-cols-2 gap-6 text-center text-xs font-bold">
              <div>
                <p className="mb-8">توقيع واستلام المشتري:</p>
                <div className="border-b border-dashed border-slate-500 mx-6"></div>
              </div>
              <div>
                <p className="mb-1">توقيع وختم أمين الصندوق:</p>
                {settings.employeeName ? (
                  <p className="text-xs font-black text-slate-900 mb-1">({settings.employeeName})</p>
                ) : (
                  <div className="h-6"></div>
                )}
                <div className="border-b border-dashed border-slate-500 mx-6"></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
