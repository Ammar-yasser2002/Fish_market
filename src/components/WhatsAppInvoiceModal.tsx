import React, { useState } from 'react';
import { Transaction, MarketSettings } from '../types';
import { WhatsAppIcon, openWhatsAppChat, sendInvoiceViaWhatsApp } from '../utils/whatsapp';
import { formatCurrency } from '../utils/calculations';
import { X, FileText, User, Phone, CheckCircle2, Loader2, ExternalLink, ArrowRight } from 'lucide-react';

interface WhatsAppInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  settings: MarketSettings;
  defaultTarget?: 'buyer' | 'seller';
  sellerRole?: 'fisherman' | 'seller';
}

export const WhatsAppInvoiceModal: React.FC<WhatsAppInvoiceModalProps> = ({
  isOpen,
  onClose,
  transaction,
  settings,
  sellerRole,
}) => {
  const isFisherman = (sellerRole || transaction.sellerRole || (transaction.isResale ? 'seller' : 'fisherman')) === 'fisherman';
  const sellerRoleLabel = isFisherman ? 'الصياد' : 'البائع';
  const sellerPrep = isFisherman ? 'للصياد' : 'للبائع';

  const [buyerPhone, setBuyerPhone] = useState(transaction.buyerPhone || '');
  const [sellerPhone, setSellerPhone] = useState(transaction.sellerPhone || '');
  const [isProcessing, setIsProcessing] = useState<'buyer' | 'seller' | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    setBuyerPhone(transaction.buyerPhone || '');
    setSellerPhone(transaction.sellerPhone || '');
    setFeedbackMsg(null);
    setIsProcessing(null);
  }, [transaction, isOpen]);

  if (!isOpen) return null;

  // إرسال مباشر وفوري للشخص المختار بنقرة واحدة عبر WhatsApp Desktop
  const handleSendTo = async (target: 'buyer' | 'seller') => {
    setIsProcessing(target);
    setFeedbackMsg(null);
    const phone = target === 'buyer' ? buyerPhone : sellerPhone;
    try {
      const res = await sendInvoiceViaWhatsApp(transaction, settings, target, phone, true, sellerRole);
      if (res.success) {
        setFeedbackMsg({
          type: 'success',
          text: res.message,
        });
      } else {
        setFeedbackMsg({
          type: 'error',
          text: res.message || 'حدث خطأ أثناء فتح واتساب سطح المكتب',
        });
      }
    } catch (e: any) {
      console.error('WhatsApp send error:', e);
      setFeedbackMsg({ type: 'error', text: 'حدث خطأ أثناء إرسال الفاتورة عبر واتساب' });
    } finally {
      setIsProcessing(null);
    }
  };

  const handleOpenChatOnly = (target: 'buyer' | 'seller') => {
    const phone = target === 'buyer' ? buyerPhone : sellerPhone;
    openWhatsAppChat(phone, '');
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-none shadow-xl border border-slate-300 overflow-hidden text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-emerald-50/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-none bg-white shadow-xs border border-emerald-200 flex items-center justify-center shrink-0">
              <WhatsAppIcon size={24} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                <span>إرسال الفاتورة عبر WhatsApp (ملف PDF)</span>
              </h3>
              <p className="text-xs text-slate-500 font-bold font-mono">
                فاتورة رقم: <span className="text-blue-700">#{transaction.id}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Feedback Toast */}
          {feedbackMsg && (
            <div
              className={`p-3.5 rounded-none text-xs font-bold flex items-start gap-2.5 animate-in fade-in duration-150 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-xs'
                  : 'bg-rose-100 text-rose-950 border border-rose-300 shadow-xs'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <div className="leading-relaxed">{feedbackMsg.text}</div>
            </div>
          )}

          {/* Quick Notice */}
          <div className="text-center">
            <span className="inline-block px-3 py-1 rounded-none bg-slate-100 text-slate-700 font-black text-xs border border-slate-300">
              اختر الشخص للإرسال إليه مباشرة بنقرة واحدة:
            </span>
          </div>

          {/* Top Quick 1-Click Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Quick 1-Click Send to Buyer */}
            <button
              type="button"
              disabled={Boolean(isProcessing)}
              onClick={() => handleSendTo('buyer')}
              className="p-4 rounded-none bg-gradient-to-br from-[#25D366] to-emerald-600 hover:from-[#20ba59] hover:to-emerald-700 active:scale-[0.98] text-white font-black flex flex-col items-center justify-center gap-1.5 shadow-xs shadow-emerald-600/25 transition-all cursor-pointer border border-emerald-500 disabled:opacity-50"
              title="فتح محادثة واتساب المشتري مباشرة مع تفاصيل الفاتورة جاهزة للإرسال"
            >
              <div className="flex items-center gap-2">
                {isProcessing === 'buyer' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <WhatsAppIcon size={22} />
                )}
                <span className="text-sm">إرسال PDF للمشتري مباشرة</span>
              </div>
              <span className="text-xs font-bold text-emerald-100 truncate max-w-full">
                {transaction.buyerName} ({formatCurrency(transaction.totalFromBuyer, settings.currency)})
              </span>
            </button>

            {/* Quick 1-Click Send to Fisherman */}
            <button
              type="button"
              disabled={Boolean(isProcessing)}
              onClick={() => handleSendTo('seller')}
              className="p-4 rounded-none bg-gradient-to-br from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 active:scale-[0.98] text-white font-black flex flex-col items-center justify-center gap-1.5 shadow-xs shadow-teal-600/25 transition-all cursor-pointer border border-teal-500 disabled:opacity-50"
              title={`فتح محادثة واتساب ${sellerRoleLabel} مباشرة مع تفاصيل الفاتورة جاهزة للإرسال`}
            >
              <div className="flex items-center gap-2">
                {isProcessing === 'seller' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <WhatsAppIcon size={22} />
                )}
                <span className="text-sm">إرسال PDF {sellerPrep} مباشرة</span>
              </div>
              <span className="text-xs font-bold text-teal-100 truncate max-w-full">
                {transaction.sellerName} ({formatCurrency(transaction.netToSeller, settings.currency)})
              </span>
            </button>
          </div>

          {/* Detailed Cards with Editable Phone Numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* Buyer Card */}
            <div className="p-3.5 rounded-none bg-slate-50 border border-slate-300 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-600" />
                    <span className="font-black text-xs text-slate-800">بيانات المشتري:</span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 truncate max-w-[120px]">
                    {transaction.buyerName}
                  </span>
                </div>

                <div className="mt-2 text-xs flex items-center justify-between text-slate-600">
                  <span>المبلغ المطلوب:</span>
                  <span className="font-black text-slate-900 font-mono">
                    {formatCurrency(transaction.totalFromBuyer, settings.currency)}
                  </span>
                </div>

                <div className="mt-2.5">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    رقم الواتساب (للتعديل قبل الإرسال):
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      dir="ltr"
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="771234567"
                      className="w-full pr-8 pl-2 py-1.5 rounded-none bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 space-y-1">
                <button
                  type="button"
                  disabled={Boolean(isProcessing)}
                  onClick={() => handleSendTo('buyer')}
                  className="w-full py-2 px-3 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <WhatsAppIcon size={15} />
                  <span>إرسال الفاتورة (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenChatOnly('buyer')}
                  className="w-full py-1 text-center text-[10px] text-slate-500 hover:text-emerald-700 font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>فتح محادثة واتساب فقط</span>
                </button>
              </div>
            </div>

            {/* Fisherman Card */}
            <div className="p-3.5 rounded-none bg-slate-50 border border-slate-300 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-amber-600" />
                    <span className="font-black text-xs text-slate-800">بيانات {sellerRoleLabel}:</span>
                  </div>
                  <span className="text-[11px] font-bold text-amber-700 truncate max-w-[120px]">
                    {transaction.sellerName}
                  </span>
                </div>

                <div className="mt-2 text-xs flex items-center justify-between text-slate-600">
                  <span>صافي المستحق:</span>
                  <span className="font-black text-slate-900 font-mono">
                    {formatCurrency(transaction.netToSeller, settings.currency)}
                  </span>
                </div>

                <div className="mt-2.5">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    رقم الواتساب (للتعديل قبل الإرسال):
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      dir="ltr"
                      value={sellerPhone}
                      onChange={(e) => setSellerPhone(e.target.value)}
                      placeholder="771234567"
                      className="w-full pr-8 pl-2 py-1.5 rounded-none bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-1 space-y-1">
                <button
                  type="button"
                  disabled={Boolean(isProcessing)}
                  onClick={() => handleSendTo('seller')}
                  className="w-full py-2 px-3 rounded-none bg-teal-600 hover:bg-teal-700 text-white font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <WhatsAppIcon size={15} />
                  <span>إرسال الفاتورة (PDF)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenChatOnly('seller')}
                  className="w-full py-1 text-center text-[10px] text-slate-500 hover:text-teal-700 font-bold transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>فتح محادثة واتساب فقط</span>
                </button>
              </div>
            </div>
          </div>

          {/* Informational Guidance */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/90 rounded-none flex items-start gap-2.5 text-xs text-emerald-950 font-medium">
            <FileText className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-emerald-900 font-black">إرفاق فوري لملف PDF:</strong> بمجرد النقر على زر الإرسال، يتم تجهيز ملف الفاتورة PDF في الخلفية ويفتح تطبيق <strong>واتساب سطح المكتب (WhatsApp Desktop)</strong> مع إرفاق ملف الفاتورة PDF مباشرة داخل المحادثة جاهزاً للإرسال دون حفظه على جهازك!
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium px-5">
          <span>الفاتورة مطابقة لقياس ورقة A4 الرسمية لسوق الحراج.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition-colors cursor-pointer"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
