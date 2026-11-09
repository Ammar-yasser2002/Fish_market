import React from 'react';
import { createPortal } from 'react-dom';
import { Transaction, MarketSettings } from '../types';
import { ThermalReceipt } from './ThermalReceipt';
import { isTransferredTransaction } from '../utils/calculations';
import { X, CheckCircle2 } from 'lucide-react';
import { shareInvoicePdf, ShareTarget } from '../utils/shareUtils';
import { ShareOptionsDropdown } from './ShareOptionsDropdown';

interface ReceiptModalProps {
  transaction: Transaction | null;
  settings: MarketSettings;
  isOpen: boolean;
  onClose: () => void;
  justSaved?: boolean;
  mode?: 'buyer' | 'seller' | 'both';
  initialSellerRole?: 'fisherman' | 'seller';
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  transaction,
  settings,
  isOpen,
  onClose,
  justSaved = false,
  mode = 'buyer',
  initialSellerRole,
}) => {
  const [paperFormat, setPaperFormat] = React.useState<'thermal' | 'a4'>(() => {
    try {
      const saved = localStorage.getItem('preferred_invoice_paper_format');
      if (saved === 'thermal' || saved === 'a4') return saved;
    } catch {}
    return 'a4';
  });

  const handleFormatChange = (fmt: 'thermal' | 'a4') => {
    setPaperFormat(fmt);
    try {
      localStorage.setItem('preferred_invoice_paper_format', fmt);
    } catch {}
  };

  React.useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem('preferred_invoice_paper_format');
        if (saved === 'thermal' || saved === 'a4') {
          setPaperFormat(saved);
          return;
        }
      } catch {}
      setPaperFormat('a4');
    }
  }, [isOpen, transaction?.id]);

  const [isSharingHeader, setIsSharingHeader] = React.useState(false);
  const [headerToast, setHeaderToast] = React.useState<string | null>(null);

  const handleHeaderShare = async (target: ShareTarget) => {
    if (!transaction) return;
    setIsSharingHeader(true);
    try {
      const res = await shareInvoicePdf(transaction, settings, target, mode as 'buyer' | 'seller' | 'both', initialSellerRole);
      setHeaderToast(res.message);
      setTimeout(() => setHeaderToast(null), 5000);
    } catch (err: any) {
      setHeaderToast('فشلت المشاركة: ' + (err?.message || 'خطأ'));
      setTimeout(() => setHeaderToast(null), 5000);
    } finally {
      setIsSharingHeader(false);
    }
  };

  if (!isOpen || !transaction) return null;

  const modalContent = (
    <div
      id="receipt-modal-root"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:p-0 print:bg-white print:fixed print:inset-0 print:z-[9999] print:overflow-visible print:block print:w-full print:h-auto"
    >
      <div
        className={`relative w-full ${paperFormat === 'a4' ? 'max-w-4xl print:max-w-none' : 'max-w-xl print:max-w-[80mm]'} bg-white border border-slate-300 rounded-none shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 transition-all print:border-none print:shadow-none print:w-full print:max-w-none print:rounded-none print:m-0 print:p-0`}
      >
        {/* Toast for header sharing */}
        {headerToast && (
          <div className="no-print p-3 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{headerToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setHeaderToast(null)}
              className="text-emerald-700 hover:text-emerald-950 font-black cursor-pointer px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Header */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3.5 sm:p-4 border-b border-slate-300 bg-blue-50/60">
          <div className="flex items-center gap-2">
            {justSaved && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-none shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> تم تسجيل الصفقة بنجاح
              </span>
            )}
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>إيصال العملية:</span>
              <span className="font-mono text-blue-700 font-bold">{transaction.id}</span>
              {isTransferredTransaction(transaction) ? (
                <span className="text-xs font-bold text-purple-700">
                  (محولة)
                </span>
              ) : transaction.isEdited ? (
                <span className="text-xs font-bold text-amber-700">
                  تم التعديل
                </span>
              ) : null}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {/* Header Three Dots (⋮) Share Button */}
            <ShareOptionsDropdown
              onShare={handleHeaderShare}
              isSharing={isSharingHeader}
              title="خيارات المشاركة (تطبيق LocalSend، البلوتوث، تطبيقات ويندوز، نسخ الملف)"
              buttonClassName="p-1.5 rounded-none bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 shadow-2xs transition-all cursor-pointer flex items-center justify-center"
              iconClassName="w-4 h-4"
              align="left"
              id="receipt-modal-header-more-btn"
            />

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-none text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="إغلاق [Esc]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 max-h-[80vh] overflow-y-auto bg-slate-50 print:p-0 print:max-h-none print:overflow-visible print:bg-white">
          <ThermalReceipt
            transaction={transaction}
            settings={settings}
            mode={mode}
            showControls={true}
            onClose={onClose}
            onFormatChange={handleFormatChange}
            initialFormat={paperFormat}
            initialSellerRole={initialSellerRole}
          />
        </div>

        {/* Modal Footer */}
        <div className="no-print p-3.5 border-t border-slate-300 bg-white flex justify-between items-center text-xs text-slate-500">
          <span>يمكنك إغلاق النافذة للمتابعة [Esc] أو استخدام [Ctrl+P] للطباعة المباشرة</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-none bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer border border-slate-300"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
