import React from 'react';
import { Transaction, MarketSettings } from '../types';
import {
  formatCurrency,
  formatNumber,
  formatDisplayDate,
  formatGregorianDate,
  formatGregorianTime,
  getResoldDetails,
  isTransferredTransaction,
} from './calculations';
import { exportInvoiceToPdfA4, exportDebtorStatementPdfA4 } from './invoiceExport';

export { WhatsAppIcon } from '../components/WhatsAppIcon';

/**
 * تنظيف وتنسيق رقم الهاتف ليتناسب مع روابط واتساب العالمية (wa.me)
 * يدعم الأرقام اليمنية تلقائياً (7xxxxxxx أو 07xxxxxxx -> 9677xxxxxxx)
 * ويدعم الأرقام الدولية الأخرى
 */
export function cleanWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  // إزالة كل الحروف والرموز والمسافات
  let digits = phone.replace(/\D/g, '');

  // إذا بدأ بـ 00 نستبدله
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // إذا بدأ بصفر محلي يمني مثل 07xxxxxxx
  if (digits.startsWith('0') && digits.length === 10) {
    digits = `967${digits.slice(1)}`;
  } else if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    // رقم يمني من 9 خانات يبدأ بـ 7 أو 1
    digits = `967${digits}`;
  }

  return digits;
}

/**
 * إنشاء نص منسق واحترافي لفاتورة المشتري أو إشعار الصياد
 */
export function buildWhatsAppInvoiceText(
  transaction: Transaction,
  settings: MarketSettings,
  target: 'buyer' | 'seller' = 'buyer',
  sellerRole?: 'fisherman' | 'seller'
): string {
  const displayDateStr = formatDisplayDate(transaction.timestamp, transaction.dateStr);
  const displayTimeStr = formatGregorianTime(transaction.timestamp) || transaction.timeStr || '';
  const resoldInfo = getResoldDetails(transaction);

  const isResaleInvoice = Boolean(
    transaction.isResale ||
    transaction.resoldFromTransactionId ||
    Boolean(typeof transaction.resaleSurplus === 'number' && transaction.resaleSurplus > 0)
  );
  const chosenRole = sellerRole || transaction.sellerRole || (isResaleInvoice ? 'seller' : 'fisherman');
  const sellerTitle = chosenRole === 'seller' ? 'البائع' : 'الصياد';
  const sellerPrep = chosenRole === 'seller' ? 'للبائع' : 'للصياد';

  const isBuyerFullyPaid =
    !resoldInfo.isResold &&
    ((transaction.buyerRemainingDebt ?? 0) <= 0 ||
      transaction.paymentStatus === 'paid' ||
      transaction.paymentStatus === 'settled');

  const buyerRemainingDebt = transaction.buyerRemainingDebt ?? 0;
  const buyerPaidAmount = transaction.buyerPaidAmount ?? (isBuyerFullyPaid ? transaction.totalFromBuyer : 0);

  const itemsList = transaction.items
    .map(
      (it, idx) =>
        `${idx + 1}. *${it.fishName}*: ${it.quantity} ${it.unit} × ${formatNumber(it.unitPrice)} = ${formatCurrency(
          it.totalGross,
          settings.currency
        )}`
    )
    .join('\n');

  if (target === 'buyer') {
    // ── رسالة فاتورة المشتري ──
    const statusText = resoldInfo.isResold
      ? resoldInfo.isSettled
        ? 'تمت تسويتها بإعادة البيع ✓'
        : 'إعادة بيع معلقة'
      : isBuyerFullyPaid
      ? 'مسددة بالكامل ✓'
      : buyerPaidAmount > 0
      ? 'مسددة جزئياً'
      : 'آجلة (دين)';

    return `🐟 *فاتورة مبيعات - ${settings.marketName}*
📄 *رقم الفاتورة:* ${transaction.id}
📅 *التاريخ:* ${displayDateStr} ${displayTimeStr ? `(${displayTimeStr})` : ''}
━━━━━━━━━━━━━━━━━━
👤 *المشتري:* ${transaction.buyerName}
👤 *${sellerTitle}:* ${transaction.sellerName}
━━━━━━━━━━━━━━━━━━
📦 *تفاصيل الأسماك:*
${itemsList}
━━━━━━━━━━━━━━━━━━
💰 *الإجمالي الأساسي:* ${formatCurrency(transaction.grossAmount, settings.currency)}
➕ *عمولة الحراج (+2%):* ${formatCurrency(transaction.buyerTaxAmount, settings.currency)}
🔴 *المطلوب من المشتري:* ${formatCurrency(transaction.totalFromBuyer, settings.currency)}
💵 *المسدد:* ${formatCurrency(buyerPaidAmount, settings.currency)}
${buyerRemainingDebt > 0 ? `⚠️ *المتبقي ديناً:* ${formatCurrency(buyerRemainingDebt, settings.currency)}\n` : ''}📌 *حالة السداد:* ${statusText}
━━━━━━━━━━━━━━━━━━
${settings.employeeName ? `✍️ *المحرر / أمين الصندوق:* ${settings.employeeName}\n` : ''}${settings.location ? `📍 *الموقع:* ${settings.location}\n` : ''}${settings.contactPhone ? `📞 *للتواصل:* ${settings.contactPhone}\n` : ''}✨ *شكراً لتعاملكم معنا!*`;
  } else {
    // ── رسالة إشعار الصياد / البائع ──
    const exchangeInfo =
      transaction.sellerPayoutMethod === 'exchange' || transaction.sellerExchangeName
        ? `\n🏦 *طريقة التسليم:* حوالة صرافة (${transaction.sellerExchangeName || 'عبر الصرافة'})`
        : transaction.sellerPaidStatus === 'unpaid'
        ? '\n⏳ *حالة المستحق:* آجل / بانتظار الصرف'
        : '\n💵 *طريقة التسليم:* نقداً من الصندوق';

    return `📄 *إشعار مستحقات ${sellerTitle} - ${settings.marketName}*
📄 *رقم العملية:* ${transaction.id}
📅 *التاريخ:* ${displayDateStr} ${displayTimeStr ? `(${displayTimeStr})` : ''}
━━━━━━━━━━━━━━━━━━
👤 *${sellerTitle}:* ${transaction.sellerName}
🛒 *المشتري:* ${transaction.buyerName}
━━━━━━━━━━━━━━━━━━
📦 *تفاصيل الأسماك المباعة:*
${itemsList}
━━━━━━━━━━━━━━━━━━
💰 *إجمالي قيمة الحراج:* ${formatCurrency(transaction.grossAmount, settings.currency)}
➖ *خصم عمولة الحراج (-3%):* ${formatCurrency(transaction.sellerTaxAmount, settings.currency)}
🟢 *الصافي المستحق ${sellerPrep}:* ${formatCurrency(transaction.netToSeller, settings.currency)}${exchangeInfo}
━━━━━━━━━━━━━━━━━━
${settings.employeeName ? `✍️ *المحرر / أمين الصندوق:* ${settings.employeeName}\n` : ''}${settings.location ? `📍 *الموقع:* ${settings.location}\n` : ''}${settings.contactPhone ? `📞 *للتواصل:* ${settings.contactPhone}\n` : ''}✨ *نسعد دائماً بخدمتكم!*`;
  }
}

/**
 * فتح تطبيق أو ويب واتساب مع رقم الهاتف (بدون إجبار على إرسال نصوص)
/**
 * فتح تطبيق واتساب سطح المكتب (WhatsApp Desktop) مباشرة على ويندوز مع رقم الهاتف
 * ويدعم التراجع التلقائي لواتساب ويب wa.me في حال عدم توفر تطبيق سطح المكتب
 */
export async function openWhatsAppChat(phone?: string, message: string = ''): Promise<boolean> {
  const cleanPhone = cleanWhatsAppPhone(phone);
  const textEncoded = message && message.trim() ? encodeURIComponent(message.trim()) : '';

  // 1. رابط بروتوكول تطبيق واتساب سطح المكتب الرسمي لنظام ويندوز (WhatsApp Desktop)
  const desktopProtocolUrl = cleanPhone
    ? `whatsapp://send?phone=${cleanPhone}${textEncoded ? `&text=${textEncoded}` : ''}`
    : `whatsapp://send${textEncoded ? `?text=${textEncoded}` : ''}`;

  // 2. رابط واتساب ويب البديل في حال عدم توفر التطبيق
  const webUrl = cleanPhone
    ? `https://web.whatsapp.com/send?phone=${cleanPhone}${textEncoded ? `&text=${textEncoded}` : ''}`
    : `https://wa.me/${textEncoded ? `?text=${textEncoded}` : ''}`;

  // 3. في بيئة تطبيق سطح المكتب (Electron):
  if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
    try {
      // فتح تطبيق واتساب سطح المكتب مباشرة عبر بروتوكول whatsapp://
      const res = await (window as any).electronAPI.openExternal(desktopProtocolUrl);
      if (res !== false) {
        return true;
      }
    } catch (err) {
      console.warn('Error launching WhatsApp Desktop protocol, trying fallback:', err);
    }

    try {
      // بديل إلكترون: فتح واتساب ويب في المتصفح الخارجي
      await (window as any).electronAPI.openExternal(webUrl);
      return true;
    } catch (err) {
      console.warn('Error opening web WhatsApp fallback via openExternal:', err);
    }
  }

  // 4. في المتصفح العادي (Browser):
  try {
    window.open(desktopProtocolUrl, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }
  return true;
}

/**
 * نسخ ملف إلى الحافظة وإظهاره في مستكشف ملفات ويندوز (Windows Explorer)
 */
export async function prepareFileForWhatsApp(savedPath?: string): Promise<void> {
  if (!savedPath || typeof window === 'undefined') return;

  try {
    if ((window as any).electronAPI?.copyFileToClipboard) {
      await (window as any).electronAPI.copyFileToClipboard(savedPath);
    }
  } catch (err) {
    console.warn('copyFileToClipboard error:', err);
  }

  try {
    if ((window as any).electronAPI?.showItemInFolder) {
      await (window as any).electronAPI.showItemInFolder(savedPath);
    }
  } catch (err) {
    console.warn('showItemInFolder error:', err);
  }
}

/**
 * إنشاء نص منسق واحترافي لكشف حساب ومديونية المشتري لإرساله مباشرة عبر واتساب
 */
export function buildWhatsAppDebtorStatementText(
  debtor: {
    buyerName: string;
    buyerPhone?: string;
    totalDebt: number;
    dealsCount: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; debt?: number; remainingDebt?: number }[];
    unpaidTransactions?: Transaction[];
    totalInvoices?: number;
    totalPaid?: number;
  },
  settings: MarketSettings
): string {
  const todayStr = formatGregorianDate(new Date());
  const breakdownText = (debtor.dailyBreakdown || [])
    .filter((b) => (b.debt || b.remainingDebt || 0) > 0)
    .map((b) => `• *${b.dayName} (${b.dateStr}):* ${formatCurrency(b.debt ?? b.remainingDebt ?? 0, settings.currency)}`)
    .join('\n');

  const isZeroDebt = (debtor.totalDebt || 0) <= 0;
  const debtLine = isZeroDebt
    ? `🟢 *حالة الحساب:* مسدد بالكامل وخالص 100% ✓ (لا توجد مديونية)`
    : `🔴 *إجمالي المديونية المستحقة:* ${formatCurrency(debtor.totalDebt, settings.currency)}`;

  const totalsSummary =
    debtor.totalInvoices !== undefined && debtor.totalPaid !== undefined
      ? `💰 *إجمالي قيمة المشتريات:* ${formatCurrency(debtor.totalInvoices, settings.currency)}\n💵 *المسدد نقداً:* ${formatCurrency(debtor.totalPaid, settings.currency)}\n`
      : '';

  return `📄 *كشف حساب - ${settings.marketName}*
📅 *تاريخ الكشف:* ${todayStr}
━━━━━━━━━━━━━━━━━━
👤 *المشتري المحترم:* ${debtor.buyerName}
${debtor.dealsCount > 0 ? `📊 *عدد العمليات:* ${debtor.dealsCount} عملية\n` : ''}━━━━━━━━━━━━━━━━━━
${totalsSummary}${debtLine}
━━━━━━━━━━━━━━━━━━
${breakdownText ? `📅 *تفاصيل الديون بحسب الأيام:*\n${breakdownText}\n━━━━━━━━━━━━━━━━━━\n` : ''}${
    isZeroDebt
      ? '✨ خالص الشكر والتقدير لالتزامكم الدائم بسداد مستحقاتكم!'
      : 'يرجى التكرم بسرعة سداد وتصفية المبلغ المستحق أعلاه.'
  }
${settings.employeeName ? `✍️ *المحاسب المسؤول:* ${settings.employeeName}\n` : ''}${settings.location ? `📍 *الموقع:* ${settings.location}\n` : ''}${settings.contactPhone ? `📞 *للتواصل:* ${settings.contactPhone}\n` : ''}✨ *شاكرين ومقدرين حسن تعاونكم الدائم معنا!*`;
}

/**
 * إرسال الفاتورة مباشرة عبر واتساب سطح المكتب (WhatsApp Desktop):
 * يقوم النظام بفتح محادثة واتساب سطح المكتب مباشرة مع المشتري أو الصياد
 * ومعه النص المنسق الكامل للفاتورة (الأصناف والأسعار والعمولة والصافي) جاهزاً للإرسال فوراً بنقرة واحدة
 * دون الحاجة لحفظ أو تنزيل أي ملفات على الجهاز!
 */
export async function sendInvoiceViaWhatsApp(
  transaction: Transaction,
  settings: MarketSettings,
  target: 'buyer' | 'seller',
  customPhone?: string,
  withPdf = true,
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string }> {
  try {
    const isFisherman = (sellerRole || transaction.sellerRole || (transaction.isResale ? 'seller' : 'fisherman')) === 'fisherman';
    const targetLabel = target === 'buyer' ? 'المشتري' : isFisherman ? 'الصياد' : 'البائع';
    const targetName = target === 'buyer' ? transaction.buyerName : transaction.sellerName;
    const phoneToUse = customPhone !== undefined ? customPhone : target === 'buyer' ? transaction.buyerPhone : transaction.sellerPhone;

    // 1. فتح محادثة WhatsApp للشخص فوراً في 0 مللي ثانية دون أي انتظار لتوفير استجابة خارقة السرعة
    if (phoneToUse) {
      openWhatsAppChat(phoneToUse, '').catch(() => {});
    }

    // 2. توليد ملف الفاتورة PDF في المجلد المؤقت بالنظام
    let pdfSavedPath: string | undefined;
    if (withPdf) {
      try {
        const pdfRes = await exportInvoiceToPdfA4(transaction, settings, target, sellerRole, true);
        if (pdfRes && pdfRes.savedPath) {
          pdfSavedPath = pdfRes.savedPath;
        }
      } catch (err) {
        console.warn('Silent PDF generation failed, will fallback to text:', err);
      }
    }

    // 3. إذا كنا في تطبيق سطح المكتب وتوفر ملف الـ PDF: إرساله مباشرة لواتساب
    if (pdfSavedPath && typeof window !== 'undefined' && (window as any).electronAPI?.sendWhatsAppFile) {
      // إرسال الملف دون تعليق واجهة المستخدم
      (window as any).electronAPI.sendWhatsAppFile({
        filePath: pdfSavedPath,
        phone: phoneToUse,
      }).catch((err: any) => console.warn('sendWhatsAppFile background error:', err));

      return {
        success: true,
        message: `تم فتح محادثة WhatsApp وإرفاق فاتورة PDF (${targetLabel}: ${targetName}) مباشرة!`,
      };
    }

    // 4. بديل في حال عدم توفر تطبيق سطح المكتب: إرسال النص المنظم للفاتورة
    const invoiceText = buildWhatsAppInvoiceText(transaction, settings, target, sellerRole);
    await openWhatsAppChat(phoneToUse, invoiceText);

    return {
      success: true,
      message: `تم فتح محادثة WhatsApp وتجهيز فاتورة (${targetLabel}: ${targetName})!`,
    };
  } catch (err: any) {
    console.error('WhatsApp invoice send error:', err);
    return {
      success: false,
      message: 'تعذر فتح واتساب سطح المكتب',
    };
  }
}

/**
 * إرسال كشف حساب ومديونية المشتري كملف PDF رسمي مباشرة عبر واتساب سطح المكتب
 */
export async function sendDebtorStatementViaWhatsApp(
  debtor: {
    buyerName: string;
    buyerPhone?: string;
    totalDebt: number;
    dealsCount: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; debt?: number; remainingDebt?: number }[];
    unpaidTransactions?: Transaction[];
    totalInvoices?: number;
    totalPaid?: number;
  },
  settings: MarketSettings,
  customPhone?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const phoneToUse = customPhone !== undefined ? customPhone : debtor.buyerPhone;

    // 1. فتح محادثة WhatsApp للمشتري فوراً في 0 مللي ثانية
    if (phoneToUse) {
      openWhatsAppChat(phoneToUse, '').catch(() => {});
    }

    // 2. توليد ملف كشف الحساب PDF في المجلد المؤقت
    let pdfSavedPath: string | undefined;
    try {
      const pdfRes = await exportDebtorStatementPdfA4(debtor as any, settings, true);
      if (pdfRes && pdfRes.savedPath) {
        pdfSavedPath = pdfRes.savedPath;
      }
    } catch (err) {
      console.warn('Silent debtor PDF generation failed, will fallback to text:', err);
    }

    // 3. إرسال ملف الـ PDF إلى واتساب سطح المكتب مباشرة
    if (pdfSavedPath && typeof window !== 'undefined' && (window as any).electronAPI?.sendWhatsAppFile) {
      (window as any).electronAPI.sendWhatsAppFile({
        filePath: pdfSavedPath,
        phone: phoneToUse,
      }).catch((err: any) => console.warn('sendWhatsAppFile background error:', err));

      return {
        success: true,
        message: `تم فتح محادثة WhatsApp وإرفاق كشف الحساب PDF (${debtor.buyerName}) مباشرة!`,
      };
    }

    // 4. بديل: فتح واتساب مع نص الكشف
    const statementText = buildWhatsAppDebtorStatementText(debtor, settings);
    await openWhatsAppChat(phoneToUse, statementText);

    return {
      success: true,
      message: `تم فتح محادثة WhatsApp وتجهيز كشف حساب (${debtor.buyerName})!`,
    };
  } catch (err: any) {
    console.error('WhatsApp debtor statement send error:', err);
    return {
      success: false,
      message: 'تعذر فتح واتساب سطح المكتب',
    };
  }
}
