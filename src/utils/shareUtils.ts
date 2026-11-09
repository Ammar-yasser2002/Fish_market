import { Transaction, MarketSettings, Contact, CashEntry } from '../types';
import {
  exportInvoiceToPdfA4,
  exportHtmlToPdfA4,
  exportFullBuyerStatementPdfA4,
  exportTransitInvoicePdfA4,
  exportMultiSellerBuyerInvoicePdfA4,
  exportDebtorStatementPdfA4,
  exportFishermanSettlementPdfA4,
  exportTransactionsDayReportPdfA4,
  exportReceiptVoucherPdfA4,
  exportAssociationProfitPdfA4,
} from './invoiceExport';

export type ShareTarget = 'localsend' | 'bluetooth' | 'open-with' | 'copy' | 'show-folder' | 'whatsapp';

/**
 * دالة عامة لتنفيذ عملية المشاركة لأي ملف PDF تم توليده
 */
export async function shareFileGeneric(
  pdfRes: { success: boolean; message: string; savedPath?: string; canceled?: boolean; base64?: string },
  target: ShareTarget,
  fileName: string,
  title?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfData = pdfRes as any;
    if (!pdfRes || (!pdfRes.savedPath && !pdfData?.base64)) {
      throw new Error(pdfRes?.message || 'تعذر إنشاء وتجهيز ملف PDF');
    }

    // 0. إرسال PDF مباشرة عبر واتساب سطح المكتب
    if (target === 'whatsapp') {
      if (pdfRes.savedPath && typeof window !== 'undefined' && (window as any).electronAPI?.sendWhatsAppFile) {
        await (window as any).electronAPI.sendWhatsAppFile({
          filePath: pdfRes.savedPath,
        });
        return { success: true, message: 'تم فتح واتساب وإرفاق ملف PDF مباشرة في المحادثة!' };
      }
      // بديل: نسخ الملف للحافظة وفتح واتساب
      if (pdfRes.savedPath && typeof window !== 'undefined') {
        try {
          if ((window as any).electronAPI?.copyFileToClipboard) {
            await (window as any).electronAPI.copyFileToClipboard(pdfRes.savedPath);
          }
          if ((window as any).electronAPI?.openExternal) {
            await (window as any).electronAPI.openExternal('whatsapp://');
          }
        } catch (e) {
          console.warn('WhatsApp fallback error:', e);
        }
        return { success: true, message: 'تم نسخ ملف PDF للحافظة. افتح واتساب والصق الملف في المحادثة.' };
      }
      return { success: true, message: 'تم تجهيز ملف PDF. افتح واتساب وأرفق الملف يدوياً.' };
    }

    // 1. في بيئة سطح المكتب (Electron)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.shareFile && pdfRes.savedPath) {
      const res = await (window as any).electronAPI.shareFile({
        filePath: pdfRes.savedPath,
        target,
      });
      return res;
    }

    // 2. بديل في بيئة المتصفح العادي (Browser Fallback)
    if (target === 'copy') {
      return {
        success: true,
        message: 'تم تجهيز ملف PDF بنجاح. يمكنك تحميله وحفظه على جهازك.',
      };
    }

    if (target === 'open-with' && typeof navigator !== 'undefined' && (navigator as any).share) {
      if (pdfData?.base64) {
        try {
          const byteCharacters = atob(pdfData.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
          const file = new File([blob], fileName, { type: 'application/pdf' });

          if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
            await (navigator as any).share({
              files: [file],
              title: title || fileName,
            });
            return { success: true, message: 'تم فتح نافذة المشاركة بنجاح' };
          }
        } catch (e: any) {
          if (e?.name !== 'AbortError') {
            console.warn('Web Share API error:', e);
          }
        }
      }
    }

    return {
      success: true,
      message: pdfRes.message || 'تم تجهيز الملف للمشاركة بنجاح',
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, message: 'تم إلغاء عملية المشاركة' };
    }
    console.error('shareFileGeneric error:', err);
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة الفاتورة بصيغة PDF الرسمية A4
 */
export async function shareInvoicePdf(
  transaction: Transaction,
  settings: MarketSettings,
  target: ShareTarget,
  mode: 'buyer' | 'seller' | 'both' = 'both',
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfRes = await exportInvoiceToPdfA4(transaction, settings, mode, sellerRole, true);
    const fileName = `فاتورة_${transaction.id}.pdf`;
    return await shareFileGeneric(pdfRes, target, fileName, `فاتورة رقم ${transaction.id} - ${settings.marketName}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة أي محتوى HTML كملف PDF صامت
 */
export async function shareHtmlAsPdf(
  htmlContent: string,
  filename: string,
  target: ShareTarget,
  title?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfRes = await exportHtmlToPdfA4(htmlContent, filename, true);
    return await shareFileGeneric(pdfRes, target, filename, title);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة كشف حساب ومطالبة المشتري A4
 */
export async function shareBuyerStatementPdf(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  target: ShareTarget,
  printMode: 'official' | 'transit' | 'invoice' | 'debtor' | 'thermal' = 'official',
  options?: {
    timeframeLabel?: string;
    purchasedItems?: any[];
    transitSerial?: string;
    repayments?: CashEntry[];
    advanceEntries?: CashEntry[];
    advanceBalance?: number;
    salesTransactions?: Transaction[];
    sellerRole?: 'fisherman' | 'seller';
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const buyerName = buyer?.name || 'مشتري';
    let pdfRes: any;

    if (printMode === 'transit') {
      const items = options?.purchasedItems || [];
      const serial = options?.transitSerial || 'TR-001';
      pdfRes = await exportTransitInvoicePdfA4(buyer, transactions, items, buyerMetrics, serial, settings, true);
    } else if (printMode === 'invoice') {
      pdfRes = await exportMultiSellerBuyerInvoicePdfA4(
        buyer,
        transactions,
        debtMetrics,
        buyerMetrics,
        settings,
        undefined,
        options?.timeframeLabel,
        true,
        options?.sellerRole
      );
    } else if (printMode === 'debtor') {
      pdfRes = await exportDebtorStatementPdfA4(
        {
          buyerName,
          buyerPhone: buyer?.phone,
          totalDebt: debtMetrics.totalRemaining,
          dealsCount: buyerMetrics.count || transactions.length,
          unpaidTransactions: transactions.filter(
            (t) => (t.buyerRemainingDebt ?? 0) > 0 || (t as any).paymentStatus === 'pending' || (t as any).paymentStatus === 'partial'
          ),
        },
        settings,
        true
      );
    } else {
      // Default: 'official' A4
      pdfRes = await exportFullBuyerStatementPdfA4(
        buyer,
        transactions,
        debtMetrics,
        buyerMetrics,
        settings,
        options?.timeframeLabel,
        options?.repayments || [],
        options?.advanceEntries || [],
        options?.advanceBalance || 0,
        options?.salesTransactions || [],
        true
      );
    }

    const fileName = `كشف_حساب_${buyerName.replace(/\s+/g, '_')}.pdf`;
    return await shareFileGeneric(pdfRes, target, fileName, `كشف حساب ${buyerName} - ${settings.marketName}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة كشف حساب وإشعار تصفية مستحقات الصياد A4 / فاتورة خدمية
 */
export async function shareFishermanSettlementPdf(
  seller: Contact | undefined,
  transactions: Transaction[],
  sellerMetrics: { grossTotal: number; deductionTotal: number; netTotal: number; count: number },
  settings: MarketSettings,
  target: ShareTarget,
  printMode: 'service' | 'official' | 'thermal' = 'service',
  options?: {
    timeframeLabel?: string;
    totalPaid?: number;
    remainingBalance?: number;
    employeeName?: string;
    contacts?: Contact[];
    sellerRole?: 'fisherman' | 'seller';
  }
): Promise<{ success: boolean; message: string }> {
  try {
    const roleDefault = options?.sellerRole === 'seller' ? 'البائع' : 'الصياد';
    const sellerName = seller?.name || roleDefault;
    const pdfRes = await exportFishermanSettlementPdfA4(
      seller,
      transactions,
      sellerMetrics,
      settings,
      printMode,
      options?.timeframeLabel || 'كافة العمليات',
      options?.totalPaid || 0,
      options?.remainingBalance,
      options?.employeeName || settings?.employeeName || '',
      options?.contacts || [],
      true,
      options?.sellerRole || 'fisherman'
    );

    const fileName = printMode === 'service'
      ? `فاتورة_خدمية_${sellerName.replace(/\s+/g, '_')}.pdf`
      : `إشعار_تصفية_${sellerName.replace(/\s+/g, '_')}.pdf`;

    return await shareFileGeneric(pdfRes, target, fileName, `${fileName.replace('.pdf', '')} - ${settings.marketName}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة تقرير حركة العمليات والمبيعات اليومية A4
 */
export async function shareTransactionsDayReportPdf(
  transactions: Transaction[],
  settings: MarketSettings,
  target: ShareTarget,
  timeframeLabel: string = 'حركة اليوم',
  employeeName: string = '',
  contacts: Contact[] = []
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfRes = await exportTransactionsDayReportPdfA4(
      transactions,
      settings,
      timeframeLabel,
      employeeName || settings?.employeeName || '',
      contacts,
      true
    );
    const cleanLabel = timeframeLabel.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
    const fileName = `تقرير_حركة_العمليات_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;
    return await shareFileGeneric(pdfRes, target, fileName, `تقرير حركة العمليات (${cleanLabel}) - ${settings.marketName}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة سند القبض المالي (سداد دين / توريد نقدي) A4
 */
export async function shareReceiptVoucherPdf(
  entry: CashEntry,
  settings: MarketSettings,
  target: ShareTarget,
  buyerName?: string,
  customTitle: string = 'سند قبض مالي (سداد دين)'
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfRes = await exportReceiptVoucherPdfA4(
      entry,
      settings,
      buyerName,
      customTitle,
      true
    );
    const payer = (buyerName || entry.contactName || 'مشتري').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
    const fileName = `سند_قبض_${entry.id}_${payer}_${entry.dateStr || ''}.pdf`;
    return await shareFileGeneric(pdfRes, target, fileName, `${customTitle} - ${payer}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}

/**
 * مشاركة تقرير أرباح الجمعية والحراج A4
 */
export async function shareAssociationProfitPdf(
  transactions: Transaction[],
  settings: MarketSettings,
  target: ShareTarget,
  targetDateStr?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const pdfRes = await exportAssociationProfitPdfA4(
      transactions,
      settings,
      targetDateStr,
      true
    );
    const dateSuffix = targetDateStr ? `_${targetDateStr}` : `_شامل_${new Date().toISOString().slice(0, 10)}`;
    const fileName = `تقرير_ارباح_الجمعية${dateSuffix}.pdf`;
    return await shareFileGeneric(pdfRes, target, fileName, `تقرير أرباح الجمعية والحراج - ${settings.marketName}`);
  } catch (err: any) {
    return {
      success: false,
      message: 'فشلت المشاركة: ' + (err?.message || 'خطأ غير متوقع'),
    };
  }
}
