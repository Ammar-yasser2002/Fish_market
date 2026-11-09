import XLSX from 'xlsx-js-style';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Transaction, MarketSettings, Contact, CashEntry } from '../types';
import {
  formatCurrency,
  formatNumber,
  formatDisplayDate,
  formatGregorianTime,
  getResoldDetails,
  tafqeet,
  formatGregorianDate,
  getWeekdayName,
  formatArabicDayOnly,
  isSameCalendarDay,
  parseLocalDate,
} from './calculations';

// Cached logo Base64 Data URL to prevent image loading issues in PDF and offline
let cachedLogoDataUrl: string | null = null;
export async function getLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const res = await fetch('/logo.png');
    if (res.ok) {
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          cachedLogoDataUrl = (reader.result as string) || '/logo.png';
          resolve(cachedLogoDataUrl);
        };
        reader.onerror = () => resolve('/logo.png');
        reader.readAsDataURL(blob);
      });
    }
  } catch (err) {
    console.warn('Could not load logo as data URL:', err);
  }
  return '/logo.png';
}

// Preload logo immediately in background to eliminate first-print/download latency
if (typeof window !== 'undefined') {
  setTimeout(() => {
    getLogoDataUrl().catch(() => {});
  }, 100);
}
/**
 * Developer & system margin credit for all printed invoices, receipts, and statements
 */
export const INVOICE_MARGIN_CREDIT_TEXT = 'م . عمار للحلول البرمجية الذكية  771071799';

export const INVOICE_MARGIN_CREDIT_CSS = `
    .invoice-margin-credit {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 4px;
      text-align: center;
      direction: rtl;
      font-family: 'Cairo', system-ui, sans-serif;
      font-size: 8px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.5px;
      white-space: nowrap;
      pointer-events: none;
      user-select: none;
      z-index: 9999;
      opacity: 0.65;
    }
    @media print {
      .invoice-margin-credit {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 4px !important;
        top: auto !important;
        text-align: center !important;
        direction: rtl !important;
        writing-mode: horizontal-tb !important;
        font-size: 8px !important;
        font-weight: 700 !important;
        color: #94a3b8 !important;
        opacity: 0.65 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        display: block !important;
      }
    }
`;

export const INVOICE_MARGIN_CREDIT_HTML = `<div class="invoice-margin-credit" aria-hidden="true">${INVOICE_MARGIN_CREDIT_TEXT}</div>`;


/**
 * Friendly Arabic translation for settlement methods
 */
export function getSettlementLabelArabic(type?: string): string {
  switch (type) {
    case 'association_cash':
      return 'نقدي (صندوق الحراج)';
    case 'direct_cash':
      return 'نقدي مباشر يداً بيد';
    case 'association_credit':
      return 'آجل ديناً على المشتري (دين للحراج)';
    case 'partial_cash':
      return 'دفع نقدي جزئي + آجل';
    case 'credit':
      return 'آجل ديناً على المشتري';
    default:
      return type || 'نقدي مباشر';
  }
}

/**
 * Friendly Arabic translation for payment status
 */
export function getPaymentStatusArabic(status?: string, remainingDebt?: number): { text: string; colorHex: string } {
  if (remainingDebt !== undefined && remainingDebt <= 0) {
    return { text: 'مسدد بالكامل ✓', colorHex: '16A34A' };
  }
  switch (status) {
    case 'paid':
    case 'settled':
      return { text: 'مسدد بالكامل ✓', colorHex: '16A34A' };
    case 'pending':
      return { text: 'آجل / معلق', colorHex: 'DC2626' };
    case 'partial':
      return { text: 'سداد جزئي', colorHex: 'D97706' };
    default:
      return { text: status || 'معلق', colorHex: '475569' };
  }
}

/**
 * Saves file to user-selected location via native SaveFileDialog in Electron,
 * or File System Access API in modern browsers, or triggers direct browser download.
 * Not restricted to Desktop!
 */
async function saveToDesktopOrDownload(
  filename: string,
  content: string | Uint8Array,
  mimeType: string,
  isBinary = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  // 1. In Electron: Use native Windows Save File Dialog so user can choose ANY folder or drive!
  if (typeof window !== 'undefined' && (window as any).electronAPI?.saveFileDialog) {
    try {
      let base64 = '';
      if (isBinary && content instanceof Uint8Array) {
        let binaryString = '';
        const len = content.byteLength;
        for (let i = 0; i < len; i++) {
          binaryString += String.fromCharCode(content[i]);
        }
        base64 = btoa(binaryString);
      } else if (typeof content === 'string') {
        base64 = btoa(unescape(encodeURIComponent(content)));
      }

      const ext = filename.split('.').pop() || '';
      const filters = ext
        ? [
            { name: `${ext.toUpperCase()} Files (*.${ext})`, extensions: [ext] },
            { name: 'جميع الملفات (*.*)', extensions: ['*'] },
          ]
        : undefined;

      const res = await (window as any).electronAPI.saveFileDialog({
        filename,
        base64,
        content: typeof content === 'string' ? content : undefined,
        filters,
      });

      if (res) {
        if (res.canceled) {
          return { success: false, canceled: true, message: 'تم إلغاء عملية الحفظ' };
        }
        if (res.success) {
          return {
            success: true,
            message: res.savedPath ? `تم حفظ الملف بنجاح في: ${res.savedPath}` : `تم حفظ الملف بنجاح: ${filename}`,
            savedPath: res.savedPath,
          };
        }
      }
    } catch (err) {
      console.warn('saveFileDialog failed, proceeding to fallback:', err);
    }
  }

  // 2. In modern browsers: File System Access API (showSaveFilePicker)
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || '';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: ext ? [{
          description: `${ext.toUpperCase()} Document`,
          accept: { [mimeType]: ['.' + ext] }
        }] : undefined,
      });
      const writable = await handle.createWritable();
      const blob = new Blob([content as any], { type: mimeType });
      await writable.write(blob);
      await writable.close();
      return {
        success: true,
        message: `تم حفظ الملف بنجاح: ${filename}`,
      };
    } catch (pickerErr: any) {
      if (pickerErr.name === 'AbortError') {
        return { success: false, canceled: true, message: 'تم إلغاء عملية الحفظ' };
      }
      console.warn('showSaveFilePicker error:', pickerErr);
    }
  }

  // 3. Fallback: Browser direct download trigger
  try {
    const blob = new Blob([content as any], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (err) {
    console.warn('Browser download error:', err);
  }

  return {
    success: true,
    message: `تم تنزيل الملف بنجاح: ${filename}`,
  };
}

/**
 * Export invoice as impeccably formatted, highly organized Excel (.xlsx) file
 * with full cell styling, borders, colors, and RTL alignment.
 */
export async function exportInvoiceToExcel(
  transaction: Transaction,
  settings: MarketSettings,
  mode: 'buyer' | 'seller' | 'both' = 'buyer',
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string }> {
  const displayDateStr = formatDisplayDate(transaction.timestamp, transaction.dateStr);
  const displayTimeStr = formatGregorianTime(transaction.timestamp) || transaction.timeStr;
  const resoldInfo = getResoldDetails(transaction);
  const chosenRole = sellerRole || transaction.sellerRole || (transaction.isResale ? 'seller' : 'fisherman');
  const roleLabel = chosenRole === 'seller' ? 'البائع' : 'الصياد';

  const titleMode =
    mode === 'buyer'
      ? 'فاتورة المشتري'
      : mode === 'seller'
      ? `إشعار مستحقات ${roleLabel}`
      : 'فاتورة مبايعة مدمجة';
  const targetName = mode === 'seller' ? transaction.sellerName : transaction.buyerName;
  const filename = `${titleMode}_${transaction.id}_${targetName.replace(/\s+/g, '_')}.xlsx`;

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let currentRow = 0;

  // Helper styles
  const thinBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  };

  const setCell = (
    r: number,
    c: number,
    val: any,
    style?: any,
    type: 's' | 'n' = typeof val === 'number' ? 'n' : 's'
  ) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = {
      v: val ?? '',
      t: type,
      s: style || {},
    };
  };

  // 1. Header Branding (Rows 0 - 2, cols A-F merged)
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } });

  setCell(1, 0, (settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة'), {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '334155' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } });

  setCell(
    2,
    0,
    `الموقع: ${settings.location || 'م/شبوه/رضوم/ عين بامعبد'} | جوال: ${settings.contactPhone || '782191112'}`,
    {
      font: { name: 'Arial', sz: 10, color: { rgb: '64748B' } },
      fill: { fgColor: { rgb: 'F1F5F9' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '0F172A' } } },
    }
  );
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } });

  currentRow = 3; // Empty spacing row

  // 2. Document Title Banner (Row 4)
  currentRow = 4;
  setCell(currentRow, 0, `📄 ${titleMode} - رقم: ${transaction.id}`, {
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 5 } });

  // 3. Metadata Grid (Rows 5 - 8)
  const metaLabelStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
  };
  const metaValStyle = {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
  };

  // Row 5: Document Type & Invoice ID
  currentRow = 5;
  setCell(currentRow, 0, 'نوع المستند:', metaLabelStyle);
  setCell(currentRow, 1, titleMode, metaValStyle);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  setCell(currentRow, 3, 'رقم الفاتورة:', metaLabelStyle);
  setCell(currentRow, 4, transaction.id, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '1E3A8A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  // Row 6: Date & Time
  currentRow = 6;
  setCell(currentRow, 0, 'التاريخ:', metaLabelStyle);
  setCell(currentRow, 1, displayDateStr, metaValStyle);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  setCell(currentRow, 3, 'الوقت:', metaLabelStyle);
  setCell(currentRow, 4, displayTimeStr, {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  // Row 7: Buyer & Seller
  currentRow = 7;
  setCell(currentRow, 0, 'المشتري:', metaLabelStyle);
  setCell(currentRow, 1, transaction.buyerName, {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0284C7' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  setCell(currentRow, 3, 'البائع / الصياد:', metaLabelStyle);
  setCell(currentRow, 4, transaction.sellerName, metaValStyle);
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  // Row 8: Settlement & Payment Status
  currentRow = 8;
  const paymentStatusInfo = getPaymentStatusArabic(transaction.paymentStatus, transaction.buyerRemainingDebt);
  setCell(currentRow, 0, 'طريقة التسوية:', metaLabelStyle);
  setCell(currentRow, 1, getSettlementLabelArabic(transaction.settlementType), metaValStyle);
  merges.push({ s: { r: currentRow, c: 1 }, e: { r: currentRow, c: 2 } });
  setCell(currentRow, 3, 'حالة السداد:', metaLabelStyle);
  setCell(currentRow, 4, paymentStatusInfo.text, {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: paymentStatusInfo.colorHex } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  // 4. Items Table Header (Row 10)
  currentRow = 10;
  const thStyle = {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0284C7' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  };
  setCell(currentRow, 0, 'م', thStyle);
  setCell(currentRow, 1, 'نوع السمك / الصنف', { ...thStyle, alignment: { horizontal: 'right', vertical: 'center' } });
  setCell(currentRow, 2, 'الكمية', thStyle);
  setCell(currentRow, 3, 'الوحدة', thStyle);
  setCell(currentRow, 4, 'سعر الوحدة', { ...thStyle, alignment: { horizontal: 'left', vertical: 'center' } });
  setCell(currentRow, 5, `الإجمالي (${settings.currency})`, { ...thStyle, alignment: { horizontal: 'left', vertical: 'center' } });

  // 5. Items Rows
  transaction.items.forEach((item, idx) => {
    currentRow++;
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? 'FFFFFF' : 'F8FAFC';
    const tdStyle = {
      font: { name: 'Arial', sz: 10 },
      fill: { fgColor: { rgb: rowBg } },
      border: thinBorder,
      alignment: { vertical: 'center' },
    };

    setCell(currentRow, 0, idx + 1, { ...tdStyle, alignment: { horizontal: 'center', vertical: 'center' }, font: { name: 'Arial', bold: true } }, 'n');
    setCell(currentRow, 1, item.fishName, { ...tdStyle, font: { name: 'Arial', bold: true, color: { rgb: '0F172A' } } });
    setCell(currentRow, 2, item.quantity, { ...tdStyle, alignment: { horizontal: 'center', vertical: 'center' }, font: { name: 'Arial', bold: true } }, 'n');
    setCell(currentRow, 3, item.unit, { ...tdStyle, alignment: { horizontal: 'center', vertical: 'center' }, font: { name: 'Arial', color: { rgb: '475569' } } });
    setCell(currentRow, 4, item.unitPrice, { ...tdStyle, alignment: { horizontal: 'left', vertical: 'center' }, numFmt: '#,##0' }, 'n');
    setCell(currentRow, 5, item.totalGross, { ...tdStyle, alignment: { horizontal: 'left', vertical: 'center' }, font: { name: 'Arial', bold: true, color: { rgb: '0F172A' } }, numFmt: '#,##0' }, 'n');
  });

  // 6. Subtotal Row
  currentRow++;
  setCell(currentRow, 0, 'إجمالي قيمة المبيعات الأساسية:', {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  });
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 4 } });
  setCell(currentRow, 5, transaction.grossAmount, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
    numFmt: '#,##0',
  }, 'n');

  // 7. Financial Breakdown
  const sumLabelStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '334155' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: thinBorder,
  };

  if (mode === 'buyer' || mode === 'both') {
    currentRow++;
    setCell(currentRow, 0, `عمولة وضريبة المشتري (+${((transaction.buyerTaxRate ?? 0.02) * 100).toFixed(0)}%):`, sumLabelStyle);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    setCell(currentRow, 4, `+${formatNumber(transaction.buyerTaxAmount)} ${settings.currency}`, {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0284C7' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

    currentRow++;
    setCell(currentRow, 0, 'الإجمالي المطلوب نهائياً من المشتري:', {
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0284C7' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    setCell(currentRow, 4, `${formatNumber(transaction.totalFromBuyer)} ${settings.currency}`, {
      font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0284C7' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

    if (transaction.buyerPaidAmount !== undefined) {
      currentRow++;
      setCell(currentRow, 0, 'المبلغ المسدد من المشتري:', sumLabelStyle);
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
      setCell(currentRow, 4, `${formatNumber(transaction.buyerPaidAmount)} ${settings.currency}`, {
        font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '16A34A' } },
        fill: { fgColor: { rgb: 'F8FAFC' } },
        alignment: { horizontal: 'left', vertical: 'center' },
        border: thinBorder,
      });
      merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

      const debtAmount = transaction.buyerRemainingDebt ?? 0;
      if (debtAmount > 0) {
        currentRow++;
        setCell(currentRow, 0, 'المتبقي ديناً على المشتري:', sumLabelStyle);
        merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
        setCell(currentRow, 4, `${formatNumber(debtAmount)} ${settings.currency}`, {
          font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'DC2626' } },
          fill: { fgColor: { rgb: 'F8FAFC' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: thinBorder,
        });
        merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });
      }
    }
  }

  if (mode === 'seller' || mode === 'both') {
    currentRow++;
    setCell(currentRow, 0, `خصم عمولة الحراج من البائع (-${((transaction.sellerTaxRate ?? 0.03) * 100).toFixed(0)}%):`, sumLabelStyle);
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    setCell(currentRow, 4, `-${formatNumber(transaction.sellerTaxAmount)} ${settings.currency}`, {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'D97706' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

    currentRow++;
    setCell(currentRow, 0, 'صافي المستحق للبائع / الصياد:', {
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 3 } });
    setCell(currentRow, 4, `${formatNumber(transaction.netToSeller)} ${settings.currency}`, {
      font: { name: 'Arial', sz: 12, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '16A34A' } },
      alignment: { horizontal: 'left', vertical: 'center' },
      border: thinBorder,
    });
    merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });
  }

  // 8. Signatures Block
  currentRow += 2;
  const sigHeaderStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: thinBorder,
  };
  setCell(currentRow, 0, 'توقيع واستلام المشتري', sigHeaderStyle);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
  setCell(currentRow, 2, 'توقيع البائع', sigHeaderStyle);
  merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });
  setCell(currentRow, 4, 'إدارة الحراج والختم', sigHeaderStyle);
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  currentRow++;
  const sigBodyStyle = {
    font: { name: 'Arial', sz: 9, color: { rgb: '94A3B8' } },
    alignment: { horizontal: 'center', vertical: 'bottom' },
    border: thinBorder,
  };
  setCell(currentRow, 0, '\n\n__________________________', sigBodyStyle);
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 1 } });
  setCell(currentRow, 2, '\n\n__________________________', sigBodyStyle);
  merges.push({ s: { r: currentRow, c: 2 }, e: { r: currentRow, c: 3 } });
  setCell(currentRow, 4, '\n\n__________________________', sigBodyStyle);
  merges.push({ s: { r: currentRow, c: 4 }, e: { r: currentRow, c: 5 } });

  // 9. Footer
  currentRow++;
  setCell(
    currentRow,
    0,
    `شكراً لتعاملكم معنا | ${settings.marketName || 'سوق عين بامعبد المركزي'} | حررت بتاريخ: ${displayDateStr} - ${displayTimeStr}`,
    {
      font: { name: 'Arial', sz: 9, color: { rgb: '64748B' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'center', vertical: 'center' },
    }
  );
  merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: 5 } });

  // Set Range & Merges
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: currentRow, c: 5 } });
  ws['!merges'] = merges;

  // Set Column widths
  ws['!cols'] = [
    { wch: 6 },  // م
    { wch: 30 }, // نوع السمك / الصنف
    { wch: 12 }, // الكمية
    { wch: 12 }, // الوحدة
    { wch: 18 }, // سعر الوحدة
    { wch: 26 }, // الإجمالي
  ];

  // Set Row Heights
  ws['!rows'] = [
    { hpt: 26 }, // Title 1
    { hpt: 20 }, // Title 2
    { hpt: 18 }, // Title 3
    { hpt: 10 }, // Spacing
    { hpt: 24 }, // Doc Banner
  ];

  // Set RTL Views for Excel
  ws['!views'] = [{ rightToLeft: true }];
  (ws as any)['!sheetViews'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'فاتورة رسمية');

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const uint8 = new Uint8Array(wbout);

  return await saveToDesktopOrDownload(
    filename,
    uint8,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    true
  );
}

/**
 * Builds the standalone HTML string for the official A4 invoice with the LOGO IN THE CENTER.
 */
export async function buildInvoiceHtmlA4(
  transaction: Transaction,
  settings: MarketSettings,
  mode: 'buyer' | 'seller' | 'both' = 'buyer',
  sellerRole?: 'fisherman' | 'seller'
): Promise<string> {
  const displayDateStr = formatDisplayDate(transaction.timestamp, transaction.dateStr);
  const displayTimeStr = formatGregorianTime(transaction.timestamp) || transaction.timeStr;
  const resoldInfo = getResoldDetails(transaction);
  const logoDataUrl = await getLogoDataUrl();

  const isResaleInvoice = Boolean(
    transaction.isResale ||
    transaction.resoldFromTransactionId ||
    (typeof transaction.resaleSurplus === 'number' && transaction.resaleSurplus > 0)
  );

  const chosenRole = sellerRole || transaction.sellerRole || (isResaleInvoice ? 'seller' : 'fisherman');
  const sellerRoleLabel = chosenRole === 'seller' ? 'البائع' : 'الصياد';
  const sellerTitle = `${sellerRoleLabel}:`;
  const sellerPrep = chosenRole === 'seller' ? 'للبائع:' : 'للصياد:';

  const titleMode =
    mode === 'buyer'
      ? 'فاتورة المشتري'
      : mode === 'seller'
      ? (chosenRole === 'seller' ? 'إشعار البائع' : 'إشعار الصياد')
      : 'فاتورة مبايعة مدمجة';
  const subtitleDoc =
    mode === 'seller'
      ? `إشعار مستحقات ${sellerRoleLabel}`
      : 'فاتورة مبيعات المشتري';

  const isBuyerFullyPaid =
    !resoldInfo.isResold &&
    ((transaction.buyerRemainingDebt ?? 0) <= 0 ||
      transaction.paymentStatus === 'paid' ||
      transaction.paymentStatus === 'settled');

  const isBuyerPartiallyPaid = !isBuyerFullyPaid && (transaction.buyerPaidAmount ?? 0) > 0;

  const itemsHtml = transaction.items
    .map(
      (item, idx) => `
      <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
        <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;font-weight:bold;font-family:monospace;">${idx + 1}</td>
        <td style="padding:10px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">${item.fishName}</td>
        <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;font-weight:900;font-family:monospace;">${item.quantity}</td>
        <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;color:#334155;">${item.unit}</td>
        <td style="padding:10px;text-align:left;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;">${formatNumber(item.unitPrice)}</td>
        <td style="padding:10px;text-align:left;border:1px solid #cbd5e1;font-family:monospace;font-weight:900;color:#0f172a;">${formatCurrency(item.totalGross, settings.currency)}</td>
      </tr>
    `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${titleMode} - ${transaction.id} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      direction: rtl;
      padding: 4mm 5mm;
      font-size: 13px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .invoice-card {
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 12px -2px rgba(0,0,0,0.05);
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .top-actions {
      max-width: 100%;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      border: none;
      background: #0284c7;
      color: #ffffff;
    }
    .btn:hover { background: #0369a1; }
    .header-border { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 14px; }
    .flex-between { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .market-title { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; }
    .market-subtitle { font-size: 14px; font-weight: 800; color: #334155; margin: 3px 0 0 0; }
    .meta-box { border: 2px solid #0f172a; padding: 6px 14px; border-radius: 8px; background: #f8fafc; text-align: center; }
    .grid-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #cbd5e1; margin-bottom: 20px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th {
      background: #0f172a !important;
      color: #ffffff !important;
      padding: 10px;
      border: 1px solid #0f172a;
      font-weight: 900;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .finance-box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; font-size: 12px; margin-bottom: 20px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .finance-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .finance-total { display: flex; justify-content: space-between; padding: 8px 12px; background: #f0f9ff !important; border: 1.5px solid #0284c7 !important; border-radius: 8px; font-weight: 900; font-size: 14px; margin-top: 8px; color: #0369a1 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .finance-paid { display: flex; justify-content: space-between; padding: 8px 12px; background: #f0fdf4 !important; border: 1.5px solid #22c55e !important; border-radius: 8px; font-weight: 900; font-size: 14px; margin-top: 8px; color: #15803d !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .finance-debt { display: flex; justify-content: space-between; padding: 8px 12px; background: #fef2f2 !important; border: 1.5px solid #ef4444 !important; border-radius: 8px; font-weight: 900; font-size: 14px; margin-top: 8px; color: #b91c1c !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 13px; font-weight: bold; border-top: 1px solid #cbd5e1; padding-top: 22px; margin-top: 22px; }
    .sig-line { border-bottom: 1px dashed #94a3b8; height: 35px; margin-top: 8px; }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        height: auto !important;
        overflow: hidden !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 8px !important;
        max-width: 100% !important;
        width: 100% !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة الفاتورة [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">فاتورة صادرة رسمياً من ${settings.marketName}</span>
  </div>

  <div class="invoice-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px;">
        <!-- Right: Market Info (Arabic) -->
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 style="font-size: 18.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p style="font-size: 12px; font-weight: 800; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 10.5px; font-weight: 700; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</p>
        </div>

        <!-- Center: Fixed Size Logo Exactly in Dead Center -->
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 95px; height: 95px; min-width: 95px; min-height: 95px; max-width: 95px; max-height: 95px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="margin-top: 3px; font-size: 14px; font-weight: 900; color: #0f172a; text-align: center; letter-spacing: -0.2px; white-space: nowrap;">
            ${titleMode}
          </div>
        </div>

        <!-- Left: English Market Info (LTR) -->
        <div style="text-align: left; direction: ltr; line-height: 1.35; font-family: sans-serif; min-width: 0;">
          <h2 style="font-size: 13px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">Ain Bamaabad Central Market</h2>
          <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">For Fresh Fish, Vegetables & Fruits</p>
          <p style="font-size: 9.5px; font-weight: 600; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
        </div>
      </div>
    </div>

    <!-- Unified Document & Metadata Bar -->
    <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 9px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #0f172a; color: #ffffff; padding: 4px 12px; border-radius: 6px; font-size: 12px; font-weight: 900;">${subtitleDoc}</span>
        <div style="border: 2px solid #0f172a; padding: 2px 10px; border-radius: 6px; background: #ffffff;">
          <span style="font-size: 11px; font-weight: 800; color: #475569; margin-left: 6px;">رقم الفاتورة:</span>
          <span style="font-size: 15px; font-weight: 900; color: #0f172a; font-family: monospace;">${transaction.id}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 14px; font-size: 11.5px; color: #475569; font-weight: 700; font-family: monospace;">
        <div>التاريخ: <b style="color: #0f172a;">${displayDateStr}</b></div>
        <div>الوقت: <b style="color: #0f172a;">${displayTimeStr}</b></div>
        ${settings.employeeName ? `<div>الموظف: <b style="color: #0f172a; font-family: 'Cairo', sans-serif;">${settings.employeeName}</b></div>` : ''}
      </div>
    </div>

    <!-- Status Badges (Only if special flags exist) -->
    ${(transaction.isTransferred || transaction.isEdited || resoldInfo.isResold) ? `
    <div style="display:flex; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:6px;">
      ${transaction.isTransferred ? '<span style="background:#f3e8ff; color:#6b21a8; border:1px solid #d8b4fe; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:bold;">صفقة محولة</span>' : ''}
      ${transaction.isEdited ? '<span style="background:#fef3c7; color:#92400e; border:1px solid #fcd34d; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:bold;">تم التعديل</span>' : ''}
      ${resoldInfo.isResold ? '<span style="background:#e0e7ff; color:#3730a3; border:1px solid #c7d2fe; border-radius:6px; padding:3px 8px; font-size:11px; font-weight:bold;">إعادة بيع</span>' : ''}
    </div>
    ` : ''}

    <div class="grid-info" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #cbd5e1; margin-bottom: 16px; font-size: 12.5px;">
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
        <span style="color: #64748b; font-weight: bold; white-space: nowrap;">المشتري:</span>
        <span style="font-weight: 900; font-size: 13.5px; color: #0f172a; white-space: nowrap;">${transaction.buyerName}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
        <span style="color: #64748b; font-weight: bold; white-space: nowrap;">${sellerTitle}</span>
        <span style="font-weight: 900; font-size: 13.5px; color: #0f172a; white-space: nowrap;">${transaction.sellerName}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
        <span style="color: #64748b; font-weight: bold; white-space: nowrap;">${(mode === 'buyer' || mode === 'both') ? 'حالة الفاتورة:' : 'طريقة التسوية / الدفع:'}</span>
        <span style="font-weight: 900; font-size: 13px; color: ${(mode === 'buyer' || mode === 'both') ? (isBuyerFullyPaid ? '#047857' : isBuyerPartiallyPaid ? '#b45309' : '#b91c1c') : '#1e293b'}; white-space: nowrap;">
          ${(mode === 'buyer' || mode === 'both')
            ? (resoldInfo.isResold
                ? (resoldInfo.isSettled ? 'تمت التسوية بإعادة البيع ✓' : 'معلقة (إعادة بيع)')
                : (isBuyerFullyPaid ? 'مسددة بالكامل ✓' : isBuyerPartiallyPaid ? 'سداد جزئي' : 'دين آجل بالكامل'))
            : getSettlementLabelArabic(transaction.settlementType)}
        </span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:45px;text-align:center;">م</th>
          <th style="text-align:right;">نوع السمك / الصنف</th>
          <th style="width:70px;text-align:center;">الكمية</th>
          <th style="width:65px;text-align:center;">الوحدة</th>
          <th style="width:110px;text-align:left;">سعر الوحدة</th>
          <th style="width:130px;text-align:left;">الإجمالي الأساسي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #0f172a;">
          <td colspan="5" style="padding:7px 10px;text-align:left;font-weight:900;">إجمالي قيمة المبيعات الأساسية:</td>
          <td style="padding:7px 10px;text-align:left;font-family:monospace;font-weight:900;font-size:13px;border-top:2px solid #0f172a;">${formatCurrency(transaction.grossAmount, settings.currency)}</td>
        </tr>
        ${mode === 'buyer' ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0284c7;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;">عمولة وضريبة المشتري (+${((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100).toFixed(0)}%):</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:bold;">+${formatCurrency(transaction.buyerTaxAmount, settings.currency)}</td>
        </tr>
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0369a1;font-weight:900;">
          <td colspan="5" style="padding:7px 10px;text-align:left;font-size:13px;">الإجمالي المطلوب من المشتري:</td>
          <td style="padding:7px 10px;text-align:left;font-family:monospace;font-size:13.5px;font-weight:900;">${formatCurrency(transaction.totalFromBuyer, settings.currency)}</td>
        </tr>
        ${transaction.buyerPaidAmount !== undefined ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;font-size:12.5px;">المبلغ المسدد:</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">
            ${formatCurrency(transaction.buyerPaidAmount, settings.currency)}
            ${isBuyerFullyPaid ? ' <span style="font-size:11px;color:#15803d;font-family:Cairo,sans-serif;">(مسدد بالكامل ✓)</span>' : ''}
          </td>
        </tr>
        ` : ''}
        ${((transaction.buyerRemainingDebt ?? 0) > 0) ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#dc2626;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;font-size:12.5px;">المتبقي ديناً على المشتري:</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">${formatCurrency(transaction.buyerRemainingDebt, settings.currency)}</td>
        </tr>
        ` : ''}
        ` : ''}
        ${mode === 'seller' ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#dc2626;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;">خصم عمولة الحراج من ${sellerRoleLabel} (-${((transaction.sellerTaxRate ?? 0.03) * 100).toFixed(0)}%):</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:bold;">-${formatCurrency(transaction.sellerTaxAmount, settings.currency)}</td>
        </tr>
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:900;">
          <td colspan="5" style="padding:7px 10px;text-align:left;font-size:13px;">صافي المستحق ${sellerPrep}</td>
          <td style="padding:7px 10px;text-align:left;font-family:monospace;font-size:13.5px;font-weight:900;">${formatCurrency(transaction.netToSeller, settings.currency)}</td>
        </tr>
        ${(transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount > 0) ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;font-size:12.5px;">المبلغ المسدد ${sellerPrep}</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">${formatCurrency(transaction.sellerPaidAmount, settings.currency)}</td>
        </tr>
        ` : ''}
        ${(transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount < transaction.netToSeller) ? `
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#dc2626;font-weight:bold;">
          <td colspan="5" style="padding:6px 10px;text-align:left;font-size:12.5px;">المتبقي ديناً على الحراج ${sellerPrep}</td>
          <td style="padding:6px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">${formatCurrency(Math.max(0, transaction.netToSeller - transaction.sellerPaidAmount), settings.currency)}</td>
        </tr>
        ` : ''}
        ` : ''}
      </tfoot>
    </table>

    ${mode === 'both' ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;">
      <!-- Buyer Box -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;font-size:12px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;font-weight:900;">
            <th style="padding:7px 10px;text-align:right;border:none;">حساب المشتري: ${transaction.buyerName}</th>
            <th style="padding:7px 10px;text-align:left;font-family:monospace;border:none;color:#7dd3fc;">عمولة +${((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100).toFixed(0)}%</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f8fafc;border-top:1px solid #cbd5e1;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;color:#475569;">قيمة المبيعات الأساسية:</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:bold;">${formatCurrency(transaction.grossAmount, settings.currency)}</td>
          </tr>
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0284c7;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">عمولة وضريبة المشتري (+${((transaction.buyerTaxRate ?? settings.buyerTaxRate ?? 0.02) * 100).toFixed(0)}%):</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;">+${formatCurrency(transaction.buyerTaxAmount, settings.currency)}</td>
          </tr>
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0369a1;font-weight:900;">
            <td style="padding:7px 10px;text-align:left;border-left:1px solid #cbd5e1;font-size:12.5px;">الإجمالي المطلوب من المشتري:</td>
            <td style="padding:7px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">${formatCurrency(transaction.totalFromBuyer, settings.currency)}</td>
          </tr>
          ${transaction.buyerPaidAmount !== undefined ? `
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">المبلغ المسدد:</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:900;">
              ${formatCurrency(transaction.buyerPaidAmount, settings.currency)}
              ${isBuyerFullyPaid ? ' <span style="font-size:10.5px;color:#15803d;font-family:Cairo,sans-serif;">(مسدد بالكامل ✓)</span>' : ''}
            </td>
          </tr>
          ` : ''}
          ${((transaction.buyerRemainingDebt ?? 0) > 0) ? `
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#dc2626;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">المتبقي ديناً على المشتري:</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:900;">${formatCurrency(transaction.buyerRemainingDebt, settings.currency)}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <!-- Seller Box -->
      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;font-size:12px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;font-weight:900;">
            <th style="padding:7px 10px;text-align:right;border:none;">حساب ${sellerRoleLabel}: ${transaction.sellerName}</th>
            <th style="padding:7px 10px;text-align:left;font-family:monospace;border:none;color:#86efac;">عمولة -${((transaction.sellerTaxRate ?? 0.03) * 100).toFixed(0)}%</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#f8fafc;border-top:1px solid #cbd5e1;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;color:#475569;">قيمة المبيعات الأساسية:</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:bold;">${formatCurrency(transaction.grossAmount, settings.currency)}</td>
          </tr>
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#dc2626;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">خصم عمولة الحراج (-${((transaction.sellerTaxRate ?? 0.03) * 100).toFixed(0)}%):</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;">-${formatCurrency(transaction.sellerTaxAmount, settings.currency)}</td>
          </tr>
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:900;">
            <td style="padding:7px 10px;text-align:left;border-left:1px solid #cbd5e1;font-size:12.5px;">صافي المستحق ${sellerPrep}</td>
            <td style="padding:7px 10px;text-align:left;font-family:monospace;font-size:13px;font-weight:900;">${formatCurrency(transaction.netToSeller, settings.currency)}</td>
          </tr>
          ${(transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount > 0) ? `
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#15803d;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">المبلغ المسدد ${sellerPrep}</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:900;">${formatCurrency(transaction.sellerPaidAmount, settings.currency)}</td>
          </tr>
          ` : ''}
          ${(transaction.sellerPaidAmount !== undefined && transaction.sellerPaidAmount < transaction.netToSeller) ? `
          <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#b45309;font-weight:bold;">
            <td style="padding:6px 10px;text-align:left;border-left:1px solid #cbd5e1;">المتبقي ديناً على الحراج ${sellerPrep}</td>
            <td style="padding:6px 10px;text-align:left;font-family:monospace;font-weight:900;">${formatCurrency(Math.max(0, transaction.netToSeller - transaction.sellerPaidAmount), settings.currency)}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div style="margin-top: 22px; padding-top: 14px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 12px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">توقيع واستلام ${mode === 'seller' ? sellerRoleLabel : 'العميل / المشتري'}:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 11px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span style="display: block; margin-bottom: 4px;">توقيع مسؤول الصندوق / الإدارة:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
        ${settings.employeeName ? `<span style="display:block;margin-top:4px;font-size:11px;color:#475569;">الموظف: ${settings.employeeName}</span>` : ''}
      </div>
    </div>

    <div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;display:flex;justify-content:space-between;font-size:11px;color:#64748b;">
      <span>شكراً لتعاملكم معنا</span>
      <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
      <span>حررت: ${displayDateStr} - ${displayTimeStr}</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Export invoice as genuine PDF document (.pdf)
 * Uses Electron vector PDF engine if available, or high-definition html2canvas + jsPDF.
 */
export async function exportInvoiceToPdfA4(
  transaction: Transaction,
  settings: MarketSettings,
  mode: 'buyer' | 'seller' | 'both' = 'buyer',
  sellerRoleOrSilent?: 'fisherman' | 'seller' | boolean,
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  let isSilent = false;
  let sellerRole: 'fisherman' | 'seller' | undefined = undefined;

  if (typeof sellerRoleOrSilent === 'boolean') {
    isSilent = sellerRoleOrSilent;
  } else if (sellerRoleOrSilent === 'fisherman' || sellerRoleOrSilent === 'seller') {
    sellerRole = sellerRoleOrSilent;
  }
  if (silent === true) {
    isSilent = true;
  }

  const chosenRole = sellerRole || transaction.sellerRole || (transaction.isResale ? 'seller' : 'fisherman');
  const roleLabel = chosenRole === 'seller' ? 'البائع' : 'الصياد';
  const titleMode =
    mode === 'buyer'
      ? 'فاتورة المشتري'
      : mode === 'seller'
      ? `إشعار مستحقات ${roleLabel}`
      : 'فاتورة مبايعة مدمجة';
  const targetName = mode === 'seller' ? transaction.sellerName : transaction.buyerName;
  const filename = `${titleMode}_${transaction.id}_${targetName.replace(/\s+/g, '_')}.pdf`;

  const htmlContent = await buildInvoiceHtmlA4(transaction, settings, mode, sellerRole);
  return await exportHtmlToPdfA4(htmlContent, filename, isSilent);
}

/**
 * دالة عامة لتصدير أي مستند HTML منسق بدقة إلى ملف PDF عالي الجودة وحفظه/تنزيله
 */
export async function exportHtmlToPdfA4(
  htmlContent: string,
  filename: string,
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const isSilent = Boolean(silent);

  // 1. If running in Electron, use Chromium vector printToPDF
  if (typeof window !== 'undefined' && (window as any).electronAPI?.exportPdfInvoice) {
    try {
      const electronRes = await (window as any).electronAPI.exportPdfInvoice({
        html: htmlContent,
        filename,
        silent: isSilent,
        defaultDirectory: isSilent ? 'temp' : undefined,
      });
      if (electronRes) {
        if (electronRes.canceled) {
          return {
            success: false,
            canceled: true,
            message: 'تم إلغاء عملية الحفظ',
          };
        }
        if (electronRes.success) {
          return {
            success: true,
            savedPath: electronRes.savedPath,
            message: electronRes.savedPath
              ? `تم حفظ ملف PDF بنجاح في: ${electronRes.savedPath}`
              : `تم حفظ ملف PDF بنجاح: ${filename}`,
          };
        }
      }
    } catch (e) {
      console.warn('Electron exportPdfInvoice failed, falling back to jsPDF:', e);
    }
  }

  // 1.5. If in modern browser (outside Electron) and NOT silent, prompt Save File Picker IMMEDIATELY while user gesture is active!
  let browserFileHandle: any = null;
  if (!isSilent && typeof window !== 'undefined' && !(window as any).electronAPI?.exportPdfInvoice && 'showSaveFilePicker' in window) {
    try {
      browserFileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'مستند PDF (*.pdf)',
          accept: { 'application/pdf': ['.pdf'] }
        }]
      });
    } catch (pickerErr: any) {
      if (pickerErr.name === 'AbortError') {
        return { success: false, message: 'تم إلغاء عملية الحفظ' };
      }
      console.warn('showSaveFilePicker upfront prompt error:', pickerErr);
    }
  }

  // 2. High-Fidelity Client-side PDF generation via isolated iframe + html2canvas + jsPDF
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-99999px';
  iframe.style.left = '-99999px';
  iframe.style.width = '840px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    throw new Error('تعذر إنشاء بيئة تصدير PDF');
  }

  iframeDoc.open();
  iframeDoc.write(htmlContent);
  iframeDoc.close();

  try {
    // Wait briefly for images and fonts to render inside the isolated iframe
    await new Promise((r) => setTimeout(r, 60));

    const targetEl = (iframeDoc.getElementById('a4-invoice-render') as HTMLElement) || iframeDoc.body;

    const canvas = await html2canvas(targetEl, {
      scale: 2, // High resolution for crisp printing
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 840,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Only add a new page if remaining content genuinely exceeds 5mm (prevents blank trailing page)
    while (heightLeft > 5) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const pdfBlob = pdf.output('blob');
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const uint8 = new Uint8Array(pdfArrayBuffer);

    if (browserFileHandle) {
      try {
        const writable = await browserFileHandle.createWritable();
        await writable.write(pdfBlob);
        await writable.close();
        return {
          success: true,
          message: `تم حفظ ملف PDF بنجاح: ${filename}`,
        };
      } catch (writeErr) {
        console.warn('Writing to browserFileHandle failed, falling back:', writeErr);
      }
    }

    if (isSilent) {
      // In silent mode (e.g. background WhatsApp send), NEVER show any save dialog!
      return {
        success: true,
        message: `تم تجهيز ملف PDF بنجاح: ${filename}`,
      };
    }

    return await saveToDesktopOrDownload(
      filename,
      uint8,
      'application/pdf',
      true
    );
  } finally {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}

/**
 * دالة عامة لطباعة أي مستند HTML منسق بدقة A4 مباشرة بأعلى جودة متجهة (Vector)
 * دون تنقيط الشاشة أو ضياع الدقة، عبر محرك إلكترون المنفصل أو إطار الطباعة المعزول
 */
export async function printHtmlA4Direct(
  htmlContent: string,
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  // 1. If running in Electron, use direct vector printing via isolated worker window
  if (typeof window !== 'undefined' && (window as any).electronAPI?.printHtmlDirect) {
    try {
      const res = await (window as any).electronAPI.printHtmlDirect({
        html: htmlContent,
        silent: options.silent ?? false,
        deviceName: options.deviceName,
        pageSize: 'A4',
      });
      if (res && res.success) {
        return {
          success: true,
          message: options.silent
            ? 'تم إرسال المستند للطباعة الفورية على الطابعة الافتراضية بنجاح ✓'
            : 'تم إرسال المستند للطباعة بنجاح ✓',
        };
      }
      if (res && res.error) {
        const errStr = String(res.error).toLowerCase();
        if (
          errStr.includes('cancel') ||
          res.error.includes('إلغاء') ||
          errStr.includes('abort')
        ) {
          return { success: false, message: 'تم إلغاء أمر الطباعة' };
        }
        return { success: false, message: `تعذر إتمام الطباعة: ${res.error}` };
      }
    } catch (e: any) {
      console.warn('Electron printHtmlDirect failed, falling back to clean iframe print:', e);
    }
  }

  // 2. Fallback for Web browser outside Electron: isolated clean iframe print (avoids modal blur & transforms)
  return new Promise((resolve) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-99999px';
      iframe.style.left = '-99999px';
      iframe.style.width = '840px';
      iframe.style.height = '1200px';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        window.print();
        return resolve({ success: true, message: 'تم استدعاء أمر الطباعة' });
      }

      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 1500);
          resolve({ success: true, message: 'تم إرسال المستند للطباعة بنجاح ✓' });
        } catch (printErr: any) {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          window.print();
          resolve({ success: true, message: 'تم استدعاء أمر الطباعة' });
        }
      }, 70);
    } catch (err: any) {
      window.print();
      resolve({ success: true, message: 'تم استدعاء أمر الطباعة' });
    }
  });
}

/**
 * طباعة فاتورة A4 مباشرة بدقة المتجهات النقية (Vector) العالية
 * باستخدام نفس محرك HTML المنفصل النظيف بدون أي تشويش أو تنقيط شاشة
 */
export async function printInvoiceToPdfA4Direct(
  transaction: Transaction,
  settings: MarketSettings,
  mode: 'buyer' | 'seller' | 'both' = 'buyer',
  options: { silent?: boolean; deviceName?: string; sellerRole?: 'fisherman' | 'seller' } = {}
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildInvoiceHtmlA4(transaction, settings, mode, options.sellerRole);
  return await printHtmlA4Direct(htmlContent, options);
}

/**
 * إنشاء صفحة HTML رسمية A4 لكشف مديونية ومطالبة مالية لمشتري مدين
 */
export async function buildDebtorStatementHtmlA4(
  debtor: {
    buyerName: string;
    buyerPhone?: string;
    totalDebt: number;
    dealsCount: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; debt: number }[];
    unpaidTransactions?: Transaction[];
  },
  settings: MarketSettings
): Promise<string> {
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const weekdayName = new Intl.DateTimeFormat('ar-YE', { weekday: 'long' }).format(new Date());
  const voucherNumber = `DEBT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
  const logoDataUrl = await getLogoDataUrl();

  const breakdownRows = (debtor.dailyBreakdown && debtor.dailyBreakdown.length > 0)
    ? debtor.dailyBreakdown.map((b, i) => `
        <tr>
          <td style="border:1px solid #000000; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#000000; font-size:10px;">${i + 1}</td>
          <td style="border:1px solid #000000; padding:5px 8px; text-align:right; font-weight:bold; color:#0f172a; font-size:10.5px;">${b.dayName} <span style="font-family:monospace; color:#475569; font-size:9.5px;">(${b.dateStr})</span></td>
          <td style="border:1px solid #000000; padding:5px 8px; text-align:center; font-family:monospace; font-weight:900; color:#dc2626; font-size:11.5px;">${formatCurrency(b.debt, settings.currency)}</td>
          <td style="border:1px solid #000000; padding:5px 4px; text-align:center; color:#dc2626; font-weight:bold; font-size:10px;">آجل / مستحق</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td style="border:1px solid #000000; padding:7px 4px; text-align:center; font-family:monospace; color:#000000; font-size:10px;">1</td>
          <td style="border:1px solid #000000; padding:7px 8px; text-align:right; font-weight:bold; color:#0f172a; font-size:10.5px;">إجمالي الفواتير والشروات الآجلة المعلقة</td>
          <td style="border:1px solid #000000; padding:7px 8px; text-align:center; font-family:monospace; font-weight:900; color:#dc2626; font-size:11.5px;">${formatCurrency(debtor.totalDebt, settings.currency)}</td>
          <td style="border:1px solid #000000; padding:7px 4px; text-align:center; color:#dc2626; font-weight:bold; font-size:10px;">آجل / مستحق</td>
        </tr>
      `;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف مديونية ومطالبة مالية - ${debtor.buyerName} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-size: 9.5px;
      line-height: 1.35;
      padding: 4mm 5mm;
    }
    .report-card {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
    }

    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      margin-bottom: 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .print-btn {
      background: #dc2626;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
    }

    .header-box {
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
    }
    .header-right { text-align: right; }
    .header-center {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    .header-logo {
      width: 130px;
      height: 130px;
      min-width: 130px;
      min-height: 130px;
      max-width: 130px;
      max-height: 130px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .market-title {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    .market-sub {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }
    .market-loc {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748b;
      margin-top: 2px;
    }
    .doc-title-text {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 4px;
      line-height: 1.25;
      white-space: nowrap;
    }
    .doc-period {
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      margin-top: 2px;
    }
    .header-left {
      direction: ltr;
      text-align: left;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .meta-tag {
      border: 2px solid #0f172a;
      background: #ffffff;
      border-radius: 8px;
      padding: 6px 14px;
      text-align: center;
      min-width: 165px;
      margin-bottom: 3px;
    }

    .kpi-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .kpi-card {
      border-radius: 0px;
      padding: 6px 8px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #475569;
      display: block;
      margin-bottom: 2px;
    }
    .kpi-val {
      font-size: 13.5px;
      font-weight: 900;
      font-family: 'Segoe UI', monospace;
      color: #0f172a;
      display: block;
      line-height: 1.2;
    }
    .kpi-unit {
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 6px;
      border: 1.5px solid #000000;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #e2e8f0;
      color: #000000;
      font-weight: 800;
      padding: 5px 4px;
      border: 1px solid #000000;
      text-align: center;
      font-size: 10px;
    }
    td {
      border: 1px solid #000000;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    tbody tr:nth-child(odd) {
      background: #ffffff;
    }
    .tfoot-row td {
      background: #f1f5f9;
      font-weight: 900;
      border: 1.5px solid #000000;
      font-size: 10.5px;
      padding: 5px 6px;
      color: #000000;
    }

    .debt-bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0px;
      padding: 6px 12px;
      margin-top: 6px;
      margin-bottom: 6px;
      font-size: 10px;
      font-weight: 800;
    }

    .signatures-box {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 30px;
      text-align: center;
      font-size: 9.5px;
      font-weight: bold;
      color: #1e293b;
      page-break-inside: avoid;
    }
    .sig-line {
      border-bottom: 1px dotted #94a3b8;
      height: 18px;
      margin-top: 3px;
    }

    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card { max-width: 100%; border: none; padding: 0 8px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة كشف المديونية [Ctrl+P]</button>
    <span style="font-size:11px; color:#475569; font-weight:bold;">كشف مديونية ومطالبة مالية - ${settings.marketName}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header -->
    <div class="header-box">
      <div class="header-right" style="line-height: 1.35;">
        <div class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</div>
        <div class="market-sub">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</div>
        <div class="market-loc">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</div>
      </div>
      <div class="header-center">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="header-logo" alt="Logo" style="width: 120px; height: 120px; min-width: 120px; min-height: 120px; max-width: 120px; max-height: 120px; object-fit: contain; display: block; margin: 0 auto;" />` : ''}
        <div class="doc-title-text" style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 4px; text-align: center; white-space: nowrap;">كشف مديونية ومطالبة مالية</div>
      </div>
      <div class="header-left" style="direction: ltr; text-align: left; display: flex; flex-direction: column; align-items: flex-end;">
        <div class="meta-tag" style="border: 2px solid #0f172a; background: #ffffff; border-radius: 8px; padding: 6px 14px; text-align: center; min-width: 165px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #475569; margin-bottom: 2px; direction: rtl;">رقم السند / المطالبة</div>
          <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; font-family: monospace;">${voucherNumber}</div>
          <div style="font-size: 9.5px; color: #475569; font-weight: 700; margin-top: 2px; direction: rtl;">التاريخ: ${weekdayName} ${todayFormatted} م</div>
          <div style="font-size: 9.5px; color: #475569; font-weight: 700; direction: rtl;">الوقت: ${nowTime}</div>
        </div>
      </div>
    </div>

    <!-- Executive KPI Financial Summary Cards (Gray with sharp edges) -->
    <div class="kpi-container">
      <div class="kpi-card">
        <span class="kpi-label">المشتري المدين</span>
        <span class="kpi-val" style="font-size:12px; color:#0f172a;">${debtor.buyerName}</span>
        <span class="kpi-unit" dir="ltr" style="color:#000000; font-weight:bold; font-size:9.5px;">${debtor.buyerPhone || '—'}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">إجمالي صافي المديونية</span>
        <span class="kpi-val" style="color:#dc2626;">${formatCurrency(debtor.totalDebt, settings.currency)}</span>
        <span class="kpi-unit">مستحق السداد</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">عدد الشروات المعلقة</span>
        <span class="kpi-val">${debtor.dealsCount}</span>
        <span class="kpi-unit">شروة / فاتورة</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">حالة الحساب</span>
        <span class="kpi-val" style="font-size:11.5px; color:#dc2626;">مطلوب السداد</span>
        <span class="kpi-unit">آجل غير مسدد</span>
      </div>
    </div>

    <!-- Breakdown Table -->
    <table>
      <thead>
        <tr>
          <th style="width:5%;">م</th>
          <th style="width:55%;">بيان اليوم والتاريخ</th>
          <th style="width:25%;">المبلغ المطلوب سداده</th>
          <th style="width:15%;">الحالة</th>
        </tr>
      </thead>
      <tbody>
        ${breakdownRows}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="2" style="text-align:right; padding-right:8px; font-weight:900; border:1.5px solid #000000;">
            إجمالي صافي المديونية المطلوب سدادها:
          </td>
          <td style="text-align:center; font-family:monospace; font-size:11px; font-weight:900; color:#dc2626; border:1.5px solid #000000;">
            ${formatCurrency(debtor.totalDebt, settings.currency)}
          </td>
          <td style="text-align:center; color:#dc2626; font-weight:bold; border:1.5px solid #000000;">مستحق</td>
        </tr>
      </tfoot>
    </table>

    <!-- Bottom Debt Summary Box -->
    <div class="debt-bottom-bar">
      <div style="color:#334155;">
        <span>العميل: </span><strong style="color:#0f172a;">${debtor.buyerName}</strong>
      </div>
      <div style="color:#dc2626; font-size:11px; font-weight:900;">
        <span>المتبقي (آجل): </span><span style="font-family:'Segoe UI',monospace;">${formatCurrency(debtor.totalDebt, settings.currency)}</span>
      </div>
    </div>

    <div style="text-align:center; font-size:10px; font-weight:bold; color:#475569; margin: 3px 0 6px 0;">
      فقط وقدره: ${tafqeet(debtor.totalDebt, settings.currency).replace(/^فقط\s*/, '')}
    </div>

    <div style="font-size:9px; color:#64748b; text-align:center; padding:4px 8px; border:1px dashed #cbd5e1; margin-bottom:8px;">
      يُرجى التكرم بسرعة توريد المبلغ المطلوب إلى أمين صندوق الحراج، أو سداده عبر حسابات الصرافة المعتمدة لدى إدارة السوق.
    </div>

    <!-- Signatures and Verification -->
    <div style="margin-top: 18px; padding-top: 12px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 11.5px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">توقيع واستلام العميل (المقر بالدين):</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 10.5px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 8.5px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span>المحاسب / إدارة الحراج والتحصيل:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>
        ${settings.employeeName ? `<div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 4px;">(${settings.employeeName})</div>` : ''}
      </div>
    </div>

    <!-- Micro Footer -->
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:8px; color:#64748b; margin-top:6px; padding-top:3px; border-top:1px solid #e2e8f0;">
      <div>نظام إدارة سوق الحراج للأسماك الطازجة والخضروات والفواكة © ${new Date().getFullYear()}</div>
      <div>صفحة 1 من 1</div>
      <div dir="ltr">${nowTime} - ${todayFormatted}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير كشف مديونية ومطالبة مالية لمشتري كملف PDF رسمي بحجم A4
 */
export async function exportDebtorStatementPdfA4(
  debtor: {
    buyerName: string;
    buyerPhone?: string;
    totalDebt: number;
    dealsCount: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; debt: number }[];
    unpaidTransactions?: Transaction[];
  },
  settings: MarketSettings,
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const filename = `كشف_مديونية_${debtor.buyerName.replace(/\s+/g, '_')}.pdf`;
  const htmlContent = await buildDebtorStatementHtmlA4(debtor, settings);
  return await exportHtmlToPdfA4(htmlContent, filename, silent);
}

/**
 * طباعة مباشرة A4 لكشف مديونية ومطالبة مالية لمشتري
 */
export async function printDebtorStatementA4Direct(
  debtor: {
    buyerName: string;
    buyerPhone?: string;
    totalDebt: number;
    dealsCount: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; debt: number }[];
    unpaidTransactions?: Transaction[];
  },
  settings: MarketSettings,
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildDebtorStatementHtmlA4(debtor, settings);
  return await printHtmlA4Direct(htmlContent, options);
}

/**
 * إنشاء صفحة HTML رسمية A4 لكشف ديون كافة المشترين (اسم المشتري والديون باليوم)
 */
export async function buildAllDebtorsStatementHtmlA4(
  debtors: {
    buyerId?: string;
    buyerName: string;
    buyerPhone?: string;
    dealsCount?: number;
    totalPaid?: number;
    todayPaid?: number;
    remainingDebt: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; remainingDebt?: number; debt?: number; paidTotal?: number }[];
  }[],
  totals: { totalDebt: number; totalPaid?: number; todayPaid?: number; totalInvoices?: number },
  settings: MarketSettings,
  scope: 'all' | 'today' = 'all',
  paidMode: 'all' | 'today' = 'all'
): Promise<string> {
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const weekdayName = new Intl.DateTimeFormat('ar-YE', { weekday: 'long' }).format(new Date());
  const voucherNumber = `EOD-DEBT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const logoDataUrl = await getLogoDataUrl();
  const scopeTitle = scope === 'today' ? 'ديون اليوم فقط' : 'الرصيد التراكمي الشامل لكافة المشترين';

  const paidColumnTitle = paidMode === 'today' ? 'المسدد في اليوم' : 'المسدد الكلي';
  const getDebtorPaid = (d: any) => paidMode === 'today' ? (d.todayPaid ?? 0) : (d.totalPaid ?? 0);
  const totalPaidSum = paidMode === 'today' ? (totals.todayPaid ?? 0) : (totals.totalPaid ?? 0);

  const rowsHtml = debtors.length === 0
    ? `<tr><td colspan="5" style="border:1px solid #000000; padding:18px; text-align:center; color:#64748b; font-weight:bold; background:#ffffff;">لا توجد أي ديون معلقة على المشترين في هذه الفترة. كافة الحسابات مسددة بالكامل ✓</td></tr>`
    : debtors.map((d, index) => {
        const dailyItems = (d.dailyBreakdown || []).map(b => {
          const debtAmount = b.remainingDebt ?? (b as any).debt ?? 0;
          return `
            <div style="padding: 1px 0; font-size: 9.5px; line-height: 1.45;">
              <span style="font-weight:bold; color:#0f172a;">${b.dayName}</span>
              <span style="font-family:monospace; color:#475569; font-size:9px;">(${b.dateStr}):</span>
              <span style="font-family:monospace; font-weight:800; color:#dc2626; margin-right:4px;">${formatNumber(debtAmount)}</span>
            </div>
          `;
        }).join('');

        return `
          <tr>
            <td style="border:1px solid #000000; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#000000; font-size:10px;">${index + 1}</td>
            <td style="border:1px solid #000000; padding:5px 8px; text-align:right; font-weight:bold; color:#0f172a;">
              <div style="font-size:11px; font-weight:800;">${d.buyerName}</div>
              ${d.buyerPhone ? `<div style="font-size:9.5px; font-family:monospace; color:#000000; font-weight:bold; margin-top:1px;" dir="ltr">${d.buyerPhone}</div>` : ''}
            </td>
            <td style="border:1px solid #000000; padding:5px 6px; text-align:right;">
              ${dailyItems || '<span style="color:#64748b;">—</span>'}
            </td>
            <td style="border:1px solid #000000; padding:5px 6px; text-align:center; font-family:monospace; font-weight:900; color:#059669; font-size:11px; background:#f0fdf4 !important;">
              ${formatNumber(getDebtorPaid(d))}
            </td>
            <td style="border:1px solid #000000; padding:5px 6px; text-align:center; font-family:monospace; font-weight:900; color:#dc2626; font-size:11.5px; background:#fef2f2 !important;">
              ${formatNumber(d.remainingDebt)}
            </td>
          </tr>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف ديون المشترين - ${scopeTitle} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 5mm 6mm;
    }
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-size: 9.5px;
      line-height: 1.35;
      padding: 4mm 5mm;
    }
    .report-card {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
    }

    /* Top Action Bar (for browser / print preview) */
    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      margin-bottom: 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .print-btn {
      background: #dc2626;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
    }

    /* Header styling - sharp & clean */
    .header-box {
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
    }
    .header-right { text-align: right; }
    .header-center {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    .header-logo {
      width: 130px;
      height: 130px;
      min-width: 130px;
      min-height: 130px;
      max-width: 130px;
      max-height: 130px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .market-title {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .market-sub {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
      white-space: nowrap;
    }
    .market-loc {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748b;
      margin-top: 2px;
      white-space: nowrap;
    }
    .doc-title-text {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 4px;
      line-height: 1.25;
      white-space: nowrap;
    }
    .doc-period {
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      margin-top: 2px;
    }
    .header-left {
      direction: ltr;
      text-align: left;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .meta-tag {
      border: 2px solid #0f172a;
      background: #ffffff;
      border-radius: 8px;
      padding: 6px 14px;
      text-align: center;
      min-width: 165px;
      margin-bottom: 3px;
    }

    /* KPI Summary Cards - Gray tones, sharp edges */
    .kpi-container {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .kpi-card {
      border-radius: 0px;
      padding: 6px 8px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #475569;
      display: block;
      margin-bottom: 2px;
    }
    .kpi-val {
      font-size: 13.5px;
      font-weight: 900;
      font-family: 'Segoe UI', monospace;
      color: #0f172a;
      display: block;
      line-height: 1.2;
    }
    .kpi-unit {
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
    }

    /* Debt Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-bottom: 6px;
      border: 1.5px solid #000000;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #e2e8f0;
      color: #000000;
      font-weight: 800;
      padding: 5px 4px;
      border: 1px solid #000000;
      text-align: center;
      font-size: 10px;
    }
    td {
      border: 1px solid #000000;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    tbody tr:nth-child(odd) {
      background: #ffffff;
    }
    .tfoot-row td {
      background: #f1f5f9;
      font-weight: 900;
      border: 1.5px solid #000000;
      font-size: 10.5px;
      padding: 5px 6px;
      color: #000000;
    }

    /* Bottom Debt Summary Bar */
    .debt-bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0px;
      padding: 6px 12px;
      margin-top: 6px;
      margin-bottom: 6px;
      font-size: 10px;
      font-weight: 800;
    }

    /* Signatures & Accreditation */
    .signatures-box {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 30px;
      text-align: center;
      font-size: 9.5px;
      font-weight: bold;
      color: #1e293b;
      page-break-inside: avoid;
    }
    .sig-line {
      border-bottom: 1px dotted #94a3b8;
      height: 18px;
      margin-top: 3px;
    }

    /* Print media */
    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card { max-width: 100%; border: none; }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة كشف الديون [Ctrl+P]</button>
    <span style="font-size:11px; color:#475569; font-weight:bold;">كشف ديون المشترين - ${settings.marketName}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header -->
    <div class="header-box">
      <div class="header-right" style="line-height: 1.35;">
        <div class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</div>
        <div class="market-sub">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</div>
        <div class="market-loc">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</div>
      </div>
      <div class="header-center">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="header-logo" alt="Logo" style="width: 120px; height: 120px; min-width: 120px; min-height: 120px; max-width: 120px; max-height: 120px; object-fit: contain; display: block; margin: 0 auto;" />` : ''}
        <div class="doc-title-text" style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 4px; text-align: center; white-space: nowrap;">كشف ديون المشترين</div>
        <div class="doc-period" style="font-size: 10px; font-weight: 800; color: #475569; margin-top: 2px;">${scopeTitle}</div>
      </div>
      <div class="header-left" style="direction: ltr; text-align: left; display: flex; flex-direction: column; align-items: flex-end;">
        <div class="meta-tag" style="border: 2px solid #0f172a; background: #ffffff; border-radius: 8px; padding: 6px 14px; text-align: center; min-width: 165px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #475569; margin-bottom: 2px; direction: rtl;">رقم الكشف / المرجع</div>
          <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; font-family: monospace;">${voucherNumber}</div>
          <div style="font-size: 9.5px; color: #475569; font-weight: 700; margin-top: 2px; direction: rtl;">التاريخ: ${weekdayName} ${todayFormatted} م</div>
          <div style="font-size: 9.5px; color: #475569; font-weight: 700; direction: rtl;">الوقت: ${nowTime}</div>
        </div>
      </div>
    </div>

    <!-- Executive KPI Financial Summary Cards (Gray with sharp edges) -->
    <div class="kpi-container">
      <div class="kpi-card">
        <span class="kpi-label">عدد المشترين المدينين</span>
        <span class="kpi-val">${debtors.length}</span>
        <span class="kpi-unit">مشتري مدين</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">إجمالي صافي المديونية</span>
        <span class="kpi-val" style="color:#dc2626;">${formatNumber(totals.totalDebt)}</span>
        <span class="kpi-unit">مستحق السداد</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">${paidColumnTitle}</span>
        <span class="kpi-val" style="color:#059669;">${formatNumber(totalPaidSum)}</span>
        <span class="kpi-unit">${paidMode === 'today' ? 'سُدد اليوم' : 'تم تسديده كلياً'}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">عدد الشروات المعلقة</span>
        <span class="kpi-val">${totals.totalInvoices || 0}</span>
        <span class="kpi-unit">شروة / فاتورة</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">حالة الحساب</span>
        <span class="kpi-val" style="font-size:11.5px; color:#dc2626;">مطلوب السداد</span>
        <span class="kpi-unit">آجلة غير مسددة</span>
      </div>
    </div>

    <!-- Debtors Table -->
    <table>
      <thead>
        <tr>
          <th style="width:4%;">م</th>
          <th style="width:23%;">اسم المشتري</th>
          <th style="width:47%;">المبالغ المستحقة باليوم (اليوم والتاريخ - المبلغ)</th>
          <th style="width:13%;">${paidColumnTitle}</th>
          <th style="width:13%;">المبلغ المتبقي</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      ${debtors.length > 0 ? `
        <tfoot>
          <tr class="tfoot-row">
            <td colspan="3" style="text-align:right; padding-right:8px; font-weight:900; border:1.5px solid #000000;">
              الإجمالي الكلي (${debtors.length} مشتري مدين):
            </td>
            <td style="text-align:center; font-family:monospace; font-size:11px; font-weight:900; color:#059669; border:1.5px solid #000000; background:#f0fdf4 !important;">
              ${formatNumber(totalPaidSum)}
            </td>
            <td style="text-align:center; font-family:monospace; font-size:11px; font-weight:900; color:#dc2626; border:1.5px solid #000000; background:#fef2f2 !important;">
              ${formatNumber(totals.totalDebt)}
            </td>
          </tr>
        </tfoot>
      ` : ''}
    </table>

    <!-- Bottom Debt Summary Box -->
    <div class="debt-bottom-bar">
      <div style="color:#334155;">
        <span>عدد المشترين المدينين: </span><strong style="color:#0f172a;">${debtors.length} مشتري</strong>
      </div>
      <div style="color:#059669; font-size:11px; font-weight:900;">
        <span>${paidColumnTitle}: </span><span style="font-family:'Segoe UI',monospace;">${formatNumber(totalPaidSum)}</span>
      </div>
      <div style="color:#dc2626; font-size:11px; font-weight:900;">
        <span>المتبقي (آجل): </span><span style="font-family:'Segoe UI',monospace;">${formatNumber(totals.totalDebt)}</span>
      </div>
    </div>

    <div style="text-align:center; font-size:10px; font-weight:bold; color:#475569; margin: 3px 0 6px 0;">
      فقط وقدره: ${tafqeet(totals.totalDebt, settings.currency).replace(/^فقط\s*/, '')}
    </div>

    <div style="font-size:9px; color:#64748b; text-align:center; padding:4px 8px; border:1px dashed #cbd5e1; margin-bottom:8px;">
      يُرجى التكرم بسرعة توريد المبلغ المطلوب إلى أمين صندوق الحراج، أو سداده عبر حسابات الصرافة المعتمدة لدى إدارة السوق.
    </div>

    <!-- Signatures and Verification -->
    <div style="margin-top: 18px; padding-top: 12px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 11.5px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">مسؤول الصندوق واليومية:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>
        ${settings.employeeName ? `<div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 4px;">(${settings.employeeName})</div>` : ''}
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 10.5px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 8.5px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span>المحاسب / إدارة الحراج والتحصيل:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>
      </div>
    </div>

    <!-- Micro Footer -->
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:8px; color:#64748b; margin-top:6px; padding-top:3px; border-top:1px solid #e2e8f0;">
      <div>نظام إدارة سوق الحراج للأسماك الطازجة والخضروات والفواكة © ${new Date().getFullYear()}</div>
      <div>صفحة 1 من 1</div>
      <div dir="ltr">${nowTime} - ${todayFormatted}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير كشف ديون المشترين بالكامل كملف PDF رسمي بحجم A4
 */
export async function exportAllDebtorsStatementPdfA4(
  debtors: {
    buyerId?: string;
    buyerName: string;
    buyerPhone?: string;
    dealsCount?: number;
    totalPaid?: number;
    todayPaid?: number;
    remainingDebt: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; remainingDebt?: number; debt?: number; paidTotal?: number }[];
  }[],
  totals: { totalDebt: number; totalPaid?: number; todayPaid?: number; totalInvoices?: number },
  settings: MarketSettings,
  scope: 'all' | 'today' = 'all',
  silent: boolean = false,
  paidMode: 'all' | 'today' = 'all'
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const scopeText = scope === 'today' ? 'ديون_اليوم' : 'كشف_شامل';
  const filename = `كشف_ديون_المشترين_${scopeText}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const htmlContent = await buildAllDebtorsStatementHtmlA4(debtors, totals, settings, scope, paidMode);
  return await exportHtmlToPdfA4(htmlContent, filename, silent);
}

/**
 * طباعة كشف ديون المشترين بالكامل مباشرة بدقة متجهات A4 عالية
 */
export async function printAllDebtorsStatementA4Direct(
  debtors: {
    buyerId?: string;
    buyerName: string;
    buyerPhone?: string;
    dealsCount?: number;
    totalPaid?: number;
    todayPaid?: number;
    remainingDebt: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; remainingDebt?: number; debt?: number; paidTotal?: number }[];
  }[],
  totals: { totalDebt: number; totalPaid?: number; todayPaid?: number; totalInvoices?: number },
  settings: MarketSettings,
  scope: 'all' | 'today' = 'all',
  options: { silent?: boolean; deviceName?: string } = {},
  paidMode: 'all' | 'today' = 'all'
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildAllDebtorsStatementHtmlA4(debtors, totals, settings, scope, paidMode);
  return await printHtmlA4Direct(htmlContent, options);
}

/**
 * تصدير كشف ديون المشترين إلى ملف Excel (.xlsx) منظم ومهيكل
 */
export async function exportAllDebtorsToExcel(
  debtors: {
    buyerName: string;
    buyerPhone?: string;
    dealsCount?: number;
    totalPaid?: number;
    todayPaid?: number;
    remainingDebt: number;
    dailyBreakdown?: { dayKey: string; dayName: string; dateStr: string; remainingDebt?: number; debt?: number }[];
  }[],
  totals: { totalDebt: number; totalPaid?: number; todayPaid?: number },
  settings: MarketSettings,
  scope: 'all' | 'today' = 'all',
  paidMode: 'all' | 'today' = 'all'
): Promise<{ success: boolean; message: string }> {
  const ws: XLSX.WorkSheet = { '!merges': [] };
  const merges = ws['!merges']!;

  const setCell = (
    r: number,
    c: number,
    val: any,
    style?: any,
    cellType: 's' | 'n' = typeof val === 'number' ? 'n' : 's'
  ) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = { v: val ?? '', t: cellType, s: style || {} };
  };

  const colCount = 6;
  const scopeTitle = scope === 'today' ? 'ديون اليوم فقط' : 'الرصيد التراكمي الشامل لكافة المشترين';

  // 1. Market Header
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });

  setCell(1, 0, (settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة'), {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });

  setCell(2, 0, `كشف ديون المشترين (${scopeTitle}) - تاريخ الإصدار: ${formatGregorianDate(new Date())}`, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } });

  // 2. Table Headers
  const paidHeader = paidMode === 'today' ? 'المسدد في اليوم' : 'المسدد الكلي';
  const headers = ['م', 'اسم المشتري', 'رقم الهاتف', 'المبالغ المستحقة باليوم', paidHeader, 'المبلغ المتبقي'];
  headers.forEach((h, colIdx) => {
    setCell(4, colIdx, h, {
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: colIdx === 4 ? '059669' : colIdx === 5 ? 'DC2626' : '0F172A' } },
      alignment: { horizontal: colIdx === 0 ? 'center' : 'right', vertical: 'center' },
      border: { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } },
    });
  });

  // 3. Rows
  let curRow = 5;
  debtors.forEach((d, idx) => {
    const dailyStr = (d.dailyBreakdown || [])
      .map(b => `${b.dayName} (${b.dateStr}): ${formatCurrency(b.remainingDebt ?? (b as any).debt ?? 0, settings.currency)}`)
      .join(' | ');

    const rowFill = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const border = { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } };

    const debtorPaid = paidMode === 'today' ? (d.todayPaid ?? 0) : (d.totalPaid || 0);

    setCell(curRow, 0, idx + 1, { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 1, d.buyerName, { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 2, d.buyerPhone || '—', { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 3, dailyStr || '—', { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 4, debtorPaid, { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '059669' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: 'F0FDF4' } }, border });
    setCell(curRow, 5, d.remainingDebt, { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'DC2626' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: 'FEF2F2' } }, border });
    curRow++;
  });

  // 4. Totals Row
  setCell(curRow, 0, 'الإجمالي العام لكافة ديون المشترين المطلوب سدادها', {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 3 } });

  const totalPaidVal = paidMode === 'today' ? (totals.todayPaid ?? 0) : (totals.totalPaid || 0);

  setCell(curRow, 4, totalPaidVal, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '059669' } },
    fill: { fgColor: { rgb: 'F0FDF4' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: { style: 'medium' }, bottom: { style: 'double' } },
  });

  setCell(curRow, 5, totals.totalDebt, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: { style: 'medium' }, bottom: { style: 'double' } },
  });

  ws['!cols'] = [{ wch: 8 }, { wch: 28 }, { wch: 18 }, { wch: 50 }, { wch: 22 }];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 24 }, { hpt: 10 }, { hpt: 24 }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'ديون المشترين');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const filename = `كشف_ديون_المشترين_${scope === 'today' ? 'اليوم' : 'الشامل'}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return await saveToDesktopOrDownload(
    filename,
    new Uint8Array(out),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    true
  );
}

/**
 * إنشاء صفحة HTML رسمية A4 لكشف حساب ومطالبة مشتري تفصيلي
 * مطابقة 100% لمعاينة كشف الحساب الرسمية داخل النظام بما في ذلك سجل سندات السداد وبراءة الذمة
 */
export async function buildFullBuyerStatementHtmlA4(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  timeframeLabel?: string,
  repayments: CashEntry[] = [],
  advanceEntries: CashEntry[] = [],
  advanceBalance: number = 0,
  salesTransactions: Transaction[] = []
): Promise<string> {
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const voucherNumber = `BYR-${(buyer?.id || 'BUY').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
  const logoDataUrl = await getLogoDataUrl();
  const totalRepayments = (repayments || []).reduce((sum, r) => sum + r.amount, 0);
  const salesCount = (salesTransactions || []).length;
  const isDebtCleared = (debtMetrics.totalRemaining ?? 0) <= 0;

  const rowsHtml = transactions.length === 0
    ? `<tr><td colspan="10" style="padding:16px;text-align:center;color:#64748b;font-weight:bold;font-size:9px;">لا توجد عمليات مسجلة لهذا المشتري في الفترة المحددة.</td></tr>`
    : transactions.map((t, idx) => {
        const resoldInfo = getResoldDetails(t);
        const isResoldSettled = resoldInfo.isResold && resoldInfo.isSettled;
        const rem = isResoldSettled
          ? 0
          : (t.buyerRemainingDebt ?? ((t.paymentStatus as any) === 'debt' || (t.paymentStatus as any) === 'partial' || t.paymentStatus === 'pending' ? t.totalFromBuyer : 0));
        
        const displayDate = formatDisplayDate(t.timestamp, t.dateStr);
        const weekday = getWeekdayName(t.timestamp, t.dateStr);
        const fullDateStr = weekday ? `${weekday}، ${displayDate}` : displayDate;
        const dateKey = t.dateStr || formatGregorianDate(t.timestamp);
        const previousDateKey = idx > 0
          ? (transactions[idx - 1].dateStr || formatGregorianDate(transactions[idx - 1].timestamp))
          : '';
        const showDateSeparator = idx === 0 || dateKey !== previousDateKey;
        const dateSeparatorHtml = showDateSeparator ? `
          <tr>
            <td colspan="10" style="padding:1px 4px; height:13px; line-height:13px; text-align:center; background:#e0f2fe !important; border:1px solid #bae6fd; color:#0369a1; font-size:8px; font-weight:800; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important;">
              ${fullDateStr}
            </td>
          </tr>
        ` : '';

        const items = (t.items && t.items.length > 0) ? t.items : [];
        const hasMultiple = items.length > 1;

        const fishNamesHtml = items.length === 0
          ? '<span style="color:#64748b; font-size:8px;">أسماك منوعة</span>'
          : items.map((it, itemIdx) => `
              <div style="font-weight:800; color:#0f172a; font-size:8.5px; line-height:1.2; ${hasMultiple && itemIdx < items.length - 1 ? 'border-bottom:1px dotted #e2e8f0; padding-bottom:1px; margin-bottom:1px;' : ''}">
                ${it.fishName}
              </div>
            `).join('');

        const quantitiesHtml = items.length === 0
          ? '-'
          : items.map((it, itemIdx) => `
              <div style="font-family:monospace; font-weight:bold; font-size:8.5px; line-height:1.2; ${hasMultiple && itemIdx < items.length - 1 ? 'border-bottom:1px dotted #e2e8f0; padding-bottom:1px; margin-bottom:1px;' : ''}">
                ${it.quantity}
              </div>
            `).join('');

        const unitsHtml = items.length === 0
          ? '-'
          : items.map((it, itemIdx) => `
              <div style="color:#475569; font-size:8px; line-height:1.2; ${hasMultiple && itemIdx < items.length - 1 ? 'border-bottom:1px dotted #e2e8f0; padding-bottom:1px; margin-bottom:1px;' : ''}">
                ${it.unit || 'كجم'}
              </div>
            `).join('');

        const pricesHtml = hasMultiple
          ? items.map((it, itemIdx) => {
              const uPrice = it.unitPrice || (it.quantity ? it.totalGross / it.quantity : it.totalGross);
              return `
                <div style="font-family:monospace; font-weight:bold; font-size:8.5px; line-height:1.2; ${itemIdx < items.length - 1 ? 'border-bottom:1px dotted #e2e8f0; padding-bottom:1px; margin-bottom:1px;' : ''}">
                  ${formatNumber(uPrice)}
                </div>
              `;
            }).join('')
          : `<span style="font-family:monospace; font-weight:bold; font-size:8.5px; color:#0f172a;">${formatNumber(items[0]?.unitPrice || (items[0]?.quantity ? items[0].totalGross / items[0].quantity : t.grossAmount))}</span>`;

        const taxesHtml = hasMultiple
          ? items.map((it, itemIdx) => {
              const taxRate = t.buyerTaxRate !== undefined ? t.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
              const itemTax = it.totalGross * taxRate;
              return `
                <div style="font-family:monospace; font-weight:bold; font-size:8px; color:#0f3b82; line-height:1.2; ${itemIdx < items.length - 1 ? 'border-bottom:1px dotted #e2e8f0; padding-bottom:1px; margin-bottom:1px;' : ''}">
                  +${formatNumber(itemTax)}
                </div>
              `;
            }).join('') + `<div style="font-family:monospace; font-weight:800; font-size:8px; border-top:1px solid #cbd5e1; padding-top:1px; margin-top:1px; color:#0f3b82;">+${formatNumber(t.buyerTaxAmount)}</div>`
          : `<span style="font-family:monospace; font-weight:bold; font-size:8.5px; color:#0f3b82;">+${formatNumber(t.buyerTaxAmount)}</span>`;

        return `
          ${dateSeparatorHtml}
          <tr style="${idx % 2 === 0 ? 'background:#ffffff !important;' : 'background:#f8fafc !important;'} -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1; font-weight:bold; font-family:monospace; font-size:8px; color:#64748b;">${idx + 1}</td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1; font-family:monospace; font-weight:bold; font-size:8.5px; color:#0f3b82; white-space:nowrap;">
              <div>${t.id}</div>
              ${t.isEdited ? '<span style="font-size:7px; color:#d97706; display:block; line-height:1;">معدلة</span>' : ''}
            </td>
            <td style="padding:2.5px 3px; text-align:right; border:1px solid #cbd5e1; font-size:8px; font-weight:bold; color:#1e293b; white-space:nowrap;">
              ${displayDate} <span style="font-family:monospace; font-weight:normal; color:#64748b; font-size:7.5px;">(${t.timeStr || ''})</span>
            </td>
            <td style="padding:2.5px 3px; text-align:right; border:1px solid #cbd5e1; font-weight:bold; color:#0f172a; font-size:8.5px; line-height:1.2;">
              <div>${t.sellerName}</div>
              ${(t.isResale || t.notes?.startsWith('إعادة بيع شروة من:')) ? '<span style="font-size:7px; color:#7e22ce; display:block; line-height:1;">(إعادة بيع)</span>' : ''}
            </td>
            <td style="padding:2.5px 3px; text-align:right; border:1px solid #cbd5e1;">
              ${fishNamesHtml}
            </td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1;">
              ${quantitiesHtml}
            </td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1;">
              ${unitsHtml}
            </td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1;">
              ${pricesHtml}
            </td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1;">
              ${taxesHtml}
            </td>
            <td style="padding:2.5px 2px; text-align:center; border:1px solid #cbd5e1; background:${rem > 0 ? '#fef2f2 !important' : '#f0fdf4 !important'}; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              ${rem > 0 && rem < t.totalFromBuyer ? `
                <div style="font-family:monospace; font-weight:900; font-size:8.5px; color:#dc2626; line-height:1.1;">
                  ${formatNumber(rem)}
                </div>
                <div style="font-size:7px; color:#b45309; line-height:1;" title="إجمالي الفاتورة الأصلية">
                  (أصل: ${formatNumber(t.totalFromBuyer)})
                </div>
              ` : `
                <div style="font-family:monospace; font-weight:900; font-size:8.5px; color:${rem > 0 ? '#dc2626' : '#0f172a'}; line-height:1.1;">
                  ${formatNumber(t.totalFromBuyer)}
                </div>
              `}
              ${t.buyerAdvanceUsed && t.buyerAdvanceUsed > 0 ? `
                <div style="font-size:7px; font-weight:bold; color:#4338ca; line-height:1;">
                  خصم قدمة: -${formatNumber(t.buyerAdvanceUsed)}
                </div>
              ` : ''}
              ${resoldInfo.isResold ? (
                isResoldSettled
                  ? '<div style="font-size:7px; color:#7e22ce; font-weight:bold; line-height:1;">تسوية بيع ✓</div>'
                  : `<div style="font-size:7px; color:#b45309; font-weight:bold; line-height:1;">إعادة بيع</div>`
              ) : rem <= 0 ? (
                '<div style="font-size:7px; color:#15803d; font-weight:bold; line-height:1;">مسدد ✓</div>'
              ) : rem < t.totalFromBuyer ? '' : (
                `<div style="font-size:7px; color:#dc2626; font-weight:bold; line-height:1;">دين آجل</div>`
              )}
            </td>
          </tr>
        `;
      }).join('');

  const repaymentsHtml = (repayments && repayments.length > 0) ? `
    <div style="margin-top:6px; margin-bottom:5px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <div style="font-size:9.5px; font-weight:900; color:#0f172a; display:flex; align-items:center; gap:4px;">
          <span style="color:#059669; font-size:11px;">💳</span>
          <span>سجل وسندات عمليات السداد والتحصيل المالية:</span>
        </div>
        <div style="font-size:9px; font-weight:bold; font-family:monospace; color:#065f46 !important; background:#ecfdf5 !important; border:1px solid #a7f3d0 !important; padding:1px 6px; border-radius:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          إجمالي المسدد: ${formatCurrency(totalRepayments, settings.currency)} (${repayments.length} سندات)
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:8.5px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#ecfdf5 !important; color:#064e3b !important; font-weight:800; border-bottom:1px solid #a7f3d0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="padding:2.5px 2px; border:1px solid #a7f3d0 !important; width:24px; text-align:center; background:#ecfdf5 !important; color:#064e3b !important;">م</th>
            <th style="padding:2.5px 3px; border:1px solid #a7f3d0 !important; width:90px; text-align:right; background:#ecfdf5 !important; color:#064e3b !important;">رقم السند</th>
            <th style="padding:2.5px 3px; border:1px solid #a7f3d0 !important; width:110px; text-align:center; background:#ecfdf5 !important; color:#064e3b !important;">تاريخ ووقت السداد</th>
            <th style="padding:2.5px 3px; border:1px solid #a7f3d0 !important; width:80px; text-align:center; background:#ecfdf5 !important; color:#064e3b !important;">المبلغ المسدد</th>
            <th style="padding:2.5px 3px; border:1px solid #a7f3d0 !important; text-align:right; background:#ecfdf5 !important; color:#064e3b !important;">البيان / الملاحظات</th>
            <th style="padding:2.5px 3px; border:1px solid #a7f3d0 !important; width:95px; text-align:center; background:#ecfdf5 !important; color:#064e3b !important;">المستلم / أمين الصندوق</th>
          </tr>
        </thead>
        <tbody>
          ${repayments.map((r, idx) => `
            <tr style="${idx % 2 === 0 ? 'background:#ffffff !important;' : 'background:#f8fafc !important;'} -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <td style="padding:2.5px 2px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8px; color:#64748b;">${idx + 1}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8.5px; color:#047857;">${r.id}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-size:8px; color:#475569;">${r.dateStr} - ${r.timeStr || ''}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:900; font-size:8.5px; color:#065f46; background:#ecfdf5 !important;">${formatNumber(r.amount)}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; color:#334155; font-size:8px;">${r.description || 'سداد دين مالي لصالح الجمعية'}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; color:#475569; font-size:8px;">${r.performedBy || 'أمين الصندوق'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const advancesHtml = (advanceEntries && advanceEntries.length > 0) ? `
    <div style="margin-top:6px; margin-bottom:5px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <div style="font-size:9.5px; font-weight:900; color:#0f172a; display:flex; align-items:center; gap:4px;">
          <span style="color:#2563eb; font-size:11px;">💼</span>
          <span>سجل حركات وسندات رصيد القدمة والعربون:</span>
        </div>
        <div style="font-size:9px; font-weight:bold; font-family:monospace; color:#1e40af; background:#eff6ff !important; border:1px solid #bfdbfe !important; padding:1px 6px; border-radius:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          رصيد القدمة المتاح حالياً: ${formatCurrency(advanceBalance || 0, settings.currency)}
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:8.5px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#eff6ff !important; color:#1e3a8a !important; font-weight:800; border-bottom:1px solid #bfdbfe !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="padding:2.5px 2px; border:1px solid #bfdbfe; width:24px; text-align:center; background:#eff6ff !important; color:#1e3a8a !important;">م</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; width:90px; text-align:right; background:#eff6ff !important; color:#1e3a8a !important;">رقم السند</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; width:110px; text-align:center; background:#eff6ff !important; color:#1e3a8a !important;">التاريخ والوقت</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; width:80px; text-align:center; background:#eff6ff !important; color:#1e3a8a !important;">نوع الحركة</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; width:80px; text-align:center; background:#eff6ff !important; color:#1e3a8a !important;">المبلغ</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; text-align:right; background:#eff6ff !important; color:#1e3a8a !important;">البيان / الملاحظات</th>
            <th style="padding:2.5px 3px; border:1px solid #bfdbfe; width:95px; text-align:center; background:#eff6ff !important; color:#1e3a8a !important;">المسؤول / الصندوق</th>
          </tr>
        </thead>
        <tbody>
          ${advanceEntries.map((adv, idx) => `
            <tr style="${idx % 2 === 0 ? 'background:#ffffff !important;' : 'background:#f8fafc !important;'} -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <td style="padding:2.5px 2px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8px; color:#64748b;">${idx + 1}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8.5px; color:#0f3b82;">${adv.id}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-size:8px; color:#475569;">${adv.dateStr} - ${adv.timeStr || ''}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-weight:bold; font-size:8px;">
                ${adv.type === 'buyer_advance_deposit' ? '<span style="color:#047857;">قبض دفعة (+)</span>' : adv.type === 'buyer_advance_refund' ? '<span style="color:#b91c1c;">استرداد (-)</span>' : '<span style="color:#92400e;">سداد من القدمة</span>'}
              </td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:900; font-size:8.5px; color:#0f172a;">${formatNumber(adv.amount)}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; color:#334155; font-size:8px;">${adv.description || adv.category || 'حركة رصيد قدمة'}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; color:#475569; font-size:8px;">${adv.performedBy || 'أمين الصندوق'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const salesHtml = (salesTransactions && salesTransactions.length > 0) ? `
    <div style="margin-top:6px; margin-bottom:5px; page-break-inside:avoid;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
        <div style="font-size:9.5px; font-weight:900; color:#065f46; display:flex; align-items:center; gap:4px;">
          <span style="color:#059669; font-size:11px;">🐟</span>
          <span>مبيعات وتوريد الأسماك الخاصة به (مستحقات له كـ بائع / صياد):</span>
        </div>
        <div style="font-size:9px; font-weight:bold; font-family:monospace; color:#065f46 !important; background:#ecfdf5 !important; border:1px solid #a7f3d0 !important; padding:1px 6px; border-radius:4px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          ${salesTransactions.length} بيعات | صافي المستحق له: ${formatCurrency(salesTransactions.reduce((sum, t) => sum + (t.netToSeller || 0), 0), settings.currency)}
        </div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:8.5px; border:1px solid #cbd5e1;">
        <thead>
          <tr style="background:#065f46 !important; color:#ffffff !important; font-weight:800; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
            <th style="padding:2.5px 2px; border:1px solid #047857; width:24px; text-align:center;">م</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:75px; text-align:center;">رقم الفاتورة</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:95px; text-align:center;">التاريخ والوقت</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:100px; text-align:right;">المشتري منه</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; text-align:right;">الأصناف والكميات</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:65px; text-align:center;">القيمة الأساسية</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:55px; text-align:center;">العمولة</th>
            <th style="padding:2.5px 3px; border:1px solid #047857; width:75px; text-align:center; background:#047857 !important;">صافي المستحق</th>
          </tr>
        </thead>
        <tbody>
          ${salesTransactions.map((st, idx) => `
            <tr style="${idx % 2 === 0 ? 'background:#ffffff !important;' : 'background:#f0fdf4 !important;'} -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
              <td style="padding:2.5px 2px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8px; color:#64748b;">${idx + 1}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8.5px; color:#047857;">#${st.id}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-size:8px; color:#475569;">${st.dateStr} ${st.timeStr || ''}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; font-weight:bold; font-size:8.5px; color:#0f172a;">${st.buyerName}</td>
              <td style="padding:2.5px 3px; border:1px solid #e2e8f0; color:#334155; font-size:8px;">
                ${st.items.map(it => `${it.fishName} (${it.quantity} ${it.unit} × ${formatNumber(it.unitPrice)})`).join('، ')}
              </td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8.5px;">${formatNumber(st.grossAmount)}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:bold; font-size:8px; color:#dc2626;">-${formatNumber(st.sellerTaxAmount)}</td>
              <td style="padding:2.5px 3px; text-align:center; border:1px solid #e2e8f0; font-family:monospace; font-weight:900; font-size:8.5px; color:#047857; background:#dcfce7 !important;">
                +${formatNumber(st.netToSeller)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب مشتريات ومطالبة - ${buyer?.name || 'مشتري'} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #0f172a;
      direction: rtl;
      padding: 4mm 5mm;
      font-size: 9px;
      line-height: 1.35;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .invoice-card {
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff !important;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .top-actions { max-width: 100%; margin: 0 auto 6px auto; display: flex; justify-content: space-between; align-items: center; }
    .btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 6px; font-weight: bold; font-size: 10.5px; cursor: pointer; border: none; background: #0284c7; color: #ffffff; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 5px; font-size: 8.5px; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; }
    th { background: #e2e8f0 !important; color: #1e293b !important; padding: 3px 2px; border: 1px solid #cbd5e1; font-weight: 800; font-size: 8.5px; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    td { padding: 2.5px 3px; font-size: 8.5px; }
    tbody tr:nth-child(even) { background: #f8fafc !important; }
    tbody tr:nth-child(odd) { background: #ffffff !important; }

    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة كشف الحساب [Ctrl+P]</button>
    <span style="font-size:10.5px; color:#64748b; font-weight:bold;">كشف حساب مشتري معتمد صادر من ${settings.marketName}</span>
  </div>

  <div class="invoice-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    
    <!-- Header: Compact Balanced 3-Column Grid -->
    <div style="border: 1.5px solid #0f172a; border-radius: 6px; padding: 6px 10px; background: #f8fafc; margin-bottom: 6px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px;">
      <!-- Right: Market Info -->
      <div style="text-align: right; line-height: 1.25;">
        <h1 style="font-size: 16px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; white-space: nowrap;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
        <p style="font-size: 10.5px; font-weight: 800; color: #334155; margin: 2px 0 0 0; white-space: nowrap;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
        <p style="font-size: 9px; font-weight: 700; color: #64748b; margin-top: 2px; white-space: nowrap;">
          ${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}
        </p>
      </div>

      <!-- Center: Logo & Title -->
      <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px;">
        <img src="${logoDataUrl}" alt="شعار السوق" style="width: 75px; height: 75px; min-width: 75px; min-height: 75px; max-width: 75px; max-height: 75px; object-fit: contain; display: block; margin: 0 auto;" />
        <div style="margin-top: 2px; font-size: 13px; font-weight: 900; color: #0f172a; text-align: center; white-space: nowrap;">
          كشف حساب مشتريات ومطالبة سداد
        </div>
      </div>

      <!-- Left: English Market Info -->
      <div style="text-align: left; direction: ltr; line-height: 1.25; font-family: sans-serif;">
        <h2 style="font-size: 11.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.2; white-space: nowrap;">Ain Bamaabad Central Market</h2>
        <p style="font-size: 9.5px; font-weight: 700; color: #334155; margin: 2px 0 0 0; white-space: nowrap;">For Fresh Fish, Vegetables & Fruits</p>
        <p style="font-size: 8.5px; font-weight: 600; color: #64748b; margin: 2px 0 0 0; white-space: nowrap;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
      </div>
    </div>

    <!-- Unified Document & Metadata Bar -->
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 10px; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="background: #0f172a; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 900;">كشف حساب مشتريات ومطالبة سداد</span>
        <div style="border: 1.5px solid #0f172a; padding: 1px 8px; border-radius: 4px; background: #ffffff;">
          <span style="font-size: 9px; font-weight: 800; color: #475569; margin-left: 4px;">رقم الكشف / المطالبة:</span>
          <span style="font-size: 12px; font-weight: 900; color: #0f172a; font-family: monospace;">${voucherNumber}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; font-size: 9.5px; color: #475569; font-weight: 700; font-family: monospace;">
        <div>التاريخ: <b style="color: #0f172a;">${todayFormatted}</b></div>
        <div>الوقت: <b style="color: #0f172a;">${nowTime}</b></div>
        <div style="background: #e2e8f0; padding: 1px 6px; border-radius: 3px; font-family: 'Cairo', sans-serif;">الفترة: <b style="color: #0f172a;">${timeframeLabel || 'كافة العمليات'}</b></div>
      </div>
    </div>

    <!-- Buyer Details Box -->
    <div style="display: grid; grid-template-columns: repeat(${salesCount > 0 ? 4 : 3}, 1fr); gap: 8px; background: #f8fafc; padding: 5px 10px; border-radius: 4px; border: 1px solid #cbd5e1; margin-bottom: 6px; font-size: 9.5px;">
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="color:#64748b; font-weight:bold; white-space:nowrap;">المشتري:</span>
        <span style="font-weight:900; font-size:11.5px; color:#0f172a;">${buyer?.name || 'غير محدد'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="color:#64748b; font-weight:bold; white-space:nowrap;">رقم الهاتف:</span>
        <span style="font-weight:bold; font-family:monospace; font-size:10.5px; color:#1e293b;">${buyer?.phone || '—'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="color:#64748b; font-weight:bold; white-space:nowrap;">عدد الشروات (مشتريات):</span>
        <span style="font-weight:900; font-family:monospace; font-size:10.5px; color:#0f3b82;">${buyerMetrics.count} شروة</span>
      </div>
      ${salesCount > 0 ? `
      <div style="display: flex; align-items: center; gap: 4px;">
        <span style="color:#64748b; font-weight:bold; white-space:nowrap;">عدد البيعات (كمورد/بائع):</span>
        <span style="font-weight:900; font-family:monospace; font-size:10.5px; color:#047857;">${salesCount} بيعة</span>
      </div>` : ''}
    </div>

    <!-- Main Invoices Table (Compact & High Capacity) -->
    <table style="width:100%; border-collapse:collapse; font-size:8.5px; margin-bottom:5px;">
      <thead>
        <tr style="background: #e2e8f0 !important; border-bottom: 1.5px solid #94a3b8; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
          <th style="width:24px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">م</th>
          <th style="width:65px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">رقم الفاتورة</th>
          <th style="width:90px; padding:3px 4px; text-align:right; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">التاريخ واليوم</th>
          <th style="width:110px; min-width:110px; padding:3px 4px; text-align:right; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">الصياد</th>
          <th style="padding:3px 4px; text-align:right; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">الصنف</th>
          <th style="width:36px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">الكمية</th>
          <th style="width:34px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">الوحدة</th>
          <th style="width:58px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">سعر الحبة</th>
          <th style="width:54px; padding:3px 2px; text-align:center; background:#e2e8f0 !important; color:#1e293b; border:1px solid #cbd5e1;">الضريبة (+2%)</th>
          <th style="width:80px; padding:3px 2px; text-align:center; background:#fee2e2 !important; color:#991b1b !important; border:1px solid #f87171 !important;">المطلوب سداده</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <!-- Repayments Section (سجل سندات السداد والتحصيل) -->
    ${repaymentsHtml}

    <!-- Advance Movements Section (سجل حركات رصيد القدمة) -->
    ${advancesHtml}

    <!-- Sales Movements Section (سجل بيعات الأسماك للآخرين) -->
    ${salesHtml}

    <!-- Financial Summary Box: Compact Sharp Box -->
    <div style="width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc !important; padding: 6px 10px; margin-top: 6px; margin-bottom: 4px; font-size: 9.5px; display: flex; flex-direction: column; gap: 3px; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0;">
        <span style="color: #475569; font-weight: 700;">إجمالي قيمة المشتريات الأساسية:</span>
        <span style="font-family: monospace; font-weight: bold; color: #0f172a;">${formatCurrency(buyerMetrics.grossTotal, settings.currency)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0;">
        <span style="color: #0f3b82; font-weight: 700;">ضريبة وعمولة الحراج (+2%):</span>
        <span style="font-family: monospace; font-weight: bold; color: #0f3b82;">+${formatCurrency(buyerMetrics.taxTotal, settings.currency)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0;">
        <span style="color: #0f172a; font-weight: 900;">إجمالي الفواتير الكلي (+2%):</span>
        <span style="font-family: monospace; font-weight: 900; color: #0f172a;">${formatCurrency(buyerMetrics.finalTotal, settings.currency)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0; color: #059669;">
        <span style="font-weight: 700;">المسدد نقداً حتى الآن:</span>
        <span style="font-family: monospace; font-weight: bold;">${formatCurrency(debtMetrics.totalPaid, settings.currency)}</span>
      </div>
      ${advanceBalance > 0 ? `
      <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 2px; border-bottom: 1px solid #e2e8f0; color: #0f3b82;">
        <span style="font-weight: 700;">رصيد القدمة المتاح حالياً:</span>
        <span style="font-family: monospace; font-weight: bold;">${formatCurrency(advanceBalance, settings.currency)}</span>
      </div>` : ''}
      <div style="margin-top: 2px; padding: 4px 8px; border-radius: 3px; display: flex; ${isDebtCleared ? 'justify-content: center;' : 'justify-content: space-between;'} align-items: center; ${isDebtCleared ? 'background: #f0fdf4 !important; border: 1px solid #a7f3d0 !important; color: #15803d !important;' : 'background: #dc2626 !important; color: #ffffff !important;'} -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
        ${!isDebtCleared ? '<span style="font-size: 10px; font-weight: 900;">الرصيد المتبقي ديناً على المشتري:</span>' : ''}
        <span style="font-family: monospace; font-weight: 900; font-size: 11.5px;">
          ${isDebtCleared ? 'مسدد بالكامل ✓' : formatCurrency(debtMetrics.totalRemaining, settings.currency)}
        </span>
      </div>
    </div>

    ${isDebtCleared ? `
    <div style="text-align: center; font-weight: 800; font-size: 10px; padding: 4px 8px; background: #f0fdf4 !important; color: #15803d !important; border: 1px solid #bbf7d0; border-radius: 3px; margin-bottom: 5px; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
      تم سداد وتصفية كامل فواتير وشروات المشتري خالص 100% ✓
    </div>` : `
    <div style="text-align: center; font-weight: bold; font-size: 9.5px; padding: 4px 8px; background: #fef2f2 !important; color: #b91c1c !important; border: 1px solid #fecaca; border-radius: 3px; margin-bottom: 5px; page-break-inside: avoid; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;">
      المبلغ المتبقي ديناً كتابةً: <strong>${tafqeet(debtMetrics.totalRemaining, settings.currency)}</strong>
    </div>`}

    <!-- Official Signatures -->
    <div style="margin-top: 8px; padding-top: 4px; border-top: 1px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; font-size: 9px; font-weight: 800; color: #334155; page-break-inside: avoid;">
      <div>
        <span style="display: block; margin-bottom: 2px;">${isDebtCleared ? 'المستلم / المشتري:' : 'توقيع واستلام المشتري (المقر بالدين):'}</span>
        <div style="border-bottom: 1px dashed #94a3b8; height: 18px; margin: 0 10px;"></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 2px; font-size: 8.5px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1px dashed #94a3b8; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 7.5px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span style="display: block; margin-bottom: 2px;">اعتماد إدارة الحراج والصندوق:</span>
        <div style="border-bottom: 1px dashed #94a3b8; height: 18px; margin: 0 10px;"></div>
        ${settings.employeeName ? `<div style="font-size: 8px; font-weight: 800; color: #0f172a; margin-top: 2px;">(${settings.employeeName})</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function exportFullBuyerStatementPdfA4(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  timeframeLabel?: string,
  repayments: CashEntry[] = [],
  advanceEntries: CashEntry[] = [],
  advanceBalance: number = 0,
  salesTransactions: Transaction[] = [],
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const buyerName = buyer?.name || 'مشتري';
  const filename = `كشف_حساب_${buyerName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const htmlContent = await buildFullBuyerStatementHtmlA4(
    buyer,
    transactions,
    debtMetrics,
    buyerMetrics,
    settings,
    timeframeLabel,
    repayments,
    advanceEntries,
    advanceBalance,
    salesTransactions
  );
  return await exportHtmlToPdfA4(htmlContent, filename, silent);
}

/**
 * طباعة كشف حساب مشتري تفصيلي كامل مباشرة بدقة متجهات A4 عالية
 */
export async function printFullBuyerStatementA4Direct(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  timeframeLabel?: string,
  repayments: CashEntry[] = [],
  advanceEntries: CashEntry[] = [],
  advanceBalance: number = 0,
  salesTransactions: Transaction[] = [],
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildFullBuyerStatementHtmlA4(
    buyer,
    transactions,
    debtMetrics,
    buyerMetrics,
    settings,
    timeframeLabel,
    repayments,
    advanceEntries,
    advanceBalance,
    salesTransactions
  );
  return await printHtmlA4Direct(htmlContent, options);
}

/**
 * تصدير كشف حساب مشتري تفصيلي كامل إلى ملف Excel (.xlsx) منظم
 */
export async function exportFullBuyerStatementToExcel(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  timeframeLabel?: string,
  repayments: CashEntry[] = [],
  advanceEntries: CashEntry[] = [],
  advanceBalance: number = 0,
  salesTransactions: Transaction[] = []
): Promise<{ success: boolean; message: string }> {
  const ws: XLSX.WorkSheet = { '!merges': [] };
  const merges = ws['!merges']!;

  const setCell = (
    r: number,
    c: number,
    val: any,
    style?: any,
    cellType: 's' | 'n' = typeof val === 'number' ? 'n' : 's'
  ) => {
    const ref = XLSX.utils.encode_cell({ r, c });
    ws[ref] = { v: val ?? '', t: cellType, s: style || {} };
  };

  const colCount = 10;
  const buyerName = buyer?.name || 'غير محدد';

  // Header rows
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });

  setCell(1, 0, `كشف حساب ومطالبة المشتري: ${buyerName} | جوال: ${buyer?.phone || '—'} | الفترة: ${timeframeLabel || 'كافة العمليات'}`, {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0284C7' } },
    fill: { fgColor: { rgb: 'F0F9FF' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });

  const headers = ['م', 'رقم الفاتورة', 'التاريخ واليوم', 'الصياد', 'الصنف', 'الكمية', 'الوحدة', 'سعر الحبة', 'الضريبة (+2%)', 'المطلوب سداده'];
  headers.forEach((h, colIdx) => {
    setCell(3, colIdx, h, {
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: colIdx === 9 ? 'DC2626' : '0F172A' } },
      alignment: { horizontal: colIdx === 0 || colIdx === 1 || colIdx === 5 || colIdx === 6 || colIdx === 7 || colIdx === 8 ? 'center' : 'right', vertical: 'center' },
      border: { top: { style: 'thin' }, bottom: { style: 'medium' }, left: { style: 'thin' }, right: { style: 'thin' } },
    });
  });

  let curRow = 4;
  transactions.forEach((t, idx) => {
    const resoldInfo = getResoldDetails(t);
    const isResoldSettled = resoldInfo.isResold && resoldInfo.isSettled;
    const rem = isResoldSettled
      ? 0
      : (t.buyerRemainingDebt ?? ((t.paymentStatus as any) === 'debt' || (t.paymentStatus as any) === 'partial' || t.paymentStatus === 'pending' ? t.totalFromBuyer : 0));
    const fishNames = (t.items || []).map(i => i.fishName).join(' \n');
    const quantities = (t.items || []).map(i => i.quantity).join(' \n');
    const units = (t.items || []).map(i => i.unit || 'كجم').join(' \n');
    const unitPrices = (t.items || []).map(i => i.unitPrice || (i.quantity ? i.totalGross / i.quantity : i.totalGross)).join(' \n');
    const taxRate = t.buyerTaxRate !== undefined ? t.buyerTaxRate : (settings.buyerTaxRate ?? 0.02);
    const taxAmount = t.buyerTaxAmount ?? (t.grossAmount * taxRate);

    const rowFill = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
    const border = { top: { style: 'thin', color: { rgb: 'E2E8F0' } }, bottom: { style: 'thin', color: { rgb: 'E2E8F0' } }, left: { style: 'thin', color: { rgb: 'E2E8F0' } }, right: { style: 'thin', color: { rgb: 'E2E8F0' } } };

    setCell(curRow, 0, idx + 1, { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 1, t.id, { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '0284C7' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 2, formatDisplayDate(t.timestamp, t.dateStr), { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 3, t.sellerName, { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 4, fishNames || 'أسماك منوعة', { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 5, quantities || '-', { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 6, units || '-', { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 7, unitPrices || t.grossAmount, { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 8, taxAmount, { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 9, rem, { font: { name: 'Arial', sz: 11, bold: true, color: { rgb: rem > 0 ? 'DC2626' : '16A34A' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rem > 0 ? 'FEF2F2' : 'F0FDF4' } }, border });
    curRow++;
  });

  // Totals Row
  setCell(curRow, 0, 'إجمالي صافي الرصيد المطلوب سداده', {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 8 } });

  setCell(curRow, 9, debtMetrics.totalRemaining, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '991B1B' } },
    fill: { fgColor: { rgb: 'FEE2E2' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: { style: 'medium' }, bottom: { style: 'double' } },
  });
  curRow += 2;

  // Append Repayments Table if available
  if (repayments && repayments.length > 0) {
    const totalRep = repayments.reduce((s, r) => s + r.amount, 0);
    setCell(curRow, 0, `سجل وسندات عمليات السداد والتحصيل المالية (إجمالي المسدد: ${formatCurrency(totalRep, settings.currency)})`, {
      font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '065F46' } },
      fill: { fgColor: { rgb: 'ECFDF5' } },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
    merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: colCount - 1 } });
    curRow++;

    const repHeaders = ['م', 'رقم السند', 'تاريخ ووقت السداد', 'المبلغ المسدد', 'البيان / الملاحظات', '', '', '', '', 'المستلم / أمين الصندوق'];
    repHeaders.forEach((h, colIdx) => {
      if (h) {
        setCell(curRow, colIdx, h, {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '047857' } },
          alignment: { horizontal: colIdx === 0 || colIdx === 1 ? 'center' : 'right', vertical: 'center' },
        });
      }
    });
    merges.push({ s: { r: curRow, c: 4 }, e: { r: curRow, c: 8 } });
    curRow++;

    repayments.forEach((r, idx) => {
      const rowFill = idx % 2 === 0 ? 'FFFFFF' : 'F0FDF4';
      setCell(curRow, 0, idx + 1, { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 1, r.id, { font: { bold: true, color: { rgb: '047857' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 2, `${r.dateStr} - ${r.timeStr || ''}`, { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 3, r.amount, { font: { bold: true }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 4, r.description || 'سداد مالي', { alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } } });
      merges.push({ s: { r: curRow, c: 4 }, e: { r: curRow, c: 8 } });
      setCell(curRow, 9, r.performedBy || 'أمين الصندوق', { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      curRow++;
    });
  }

  // Sales Transactions (مبيعات الأسماك الخاصة بالعميل كـ بائع / صياد)
  if (salesTransactions && salesTransactions.length > 0) {
    curRow++;
    const totalNetSales = salesTransactions.reduce((s, t) => s + (t.netToSeller || 0), 0);
    setCell(curRow, 0, `مبيعات وتوريد الأسماك الخاصة بالعميل (كبائع / صياد) - إجمالي صافي المستحق: ${formatNumber(totalNetSales)} ${settings.currency || 'ريال'}`, {
      font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '065F46' } },
      fill: { fgColor: { rgb: 'D1FAE5' } },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
    merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: colCount - 1 } });
    curRow++;

    const salesHeaders = ['م', 'رقم الفاتورة', 'التاريخ والوقت', 'المشتري منه', 'الأسماك والكميات', 'القيمة الأساسية', 'خصم العمولة', 'صافي المستحق (له)', 'حالة الصرف', ''];
    salesHeaders.forEach((h, colIdx) => {
      if (h) {
        setCell(curRow, colIdx, h, {
          font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '059669' } },
          alignment: { horizontal: colIdx === 0 || colIdx === 1 ? 'center' : 'right', vertical: 'center' },
        });
      }
    });
    merges.push({ s: { r: curRow, c: 8 }, e: { r: curRow, c: 9 } });
    curRow++;

    salesTransactions.forEach((st, idx) => {
      const rowFill = idx % 2 === 0 ? 'FFFFFF' : 'ECFDF5';
      const itemsStr = st.items.map((it) => `${it.fishName} (${it.quantity} ${it.unit} × ${it.unitPrice})`).join('، ');
      const isPaid = st.sellerPaidStatus === 'paid' || (st.sellerPaidAmount !== undefined && st.sellerPaidAmount >= st.netToSeller);
      setCell(curRow, 0, idx + 1, { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 1, st.id, { font: { bold: true, color: { rgb: '065F46' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 2, `${st.dateStr} ${st.timeStr || ''}`, { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 3, st.buyerName, { font: { bold: true }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 4, itemsStr, { alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 5, st.grossAmount, { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 6, -st.sellerTaxAmount, { font: { color: { rgb: 'DC2626' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      setCell(curRow, 7, st.netToSeller, { font: { bold: true, color: { rgb: '065F46' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: 'D1FAE5' } } });
      setCell(curRow, 8, isPaid ? 'مصروف له ✓' : 'مستحق له (متاح للمقاصة)', { alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } } });
      merges.push({ s: { r: curRow, c: 8 }, e: { r: curRow, c: 9 } });
      curRow++;
    });
  }

  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 18 }, { wch: 25 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 18 }];
  ws['!rows'] = [{ hpt: 26 }, { hpt: 22 }, { hpt: 10 }, { hpt: 24 }];

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'كشف حساب المشتري');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const filename = `كشف_حساب_${buyerName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return await saveToDesktopOrDownload(
    filename,
    new Uint8Array(out),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    true
  );
}

/**
 * Legacy HTML export for backwards compatibility
 */
export async function exportInvoiceToHtmlA4(
  transaction: Transaction,
  settings: MarketSettings,
  mode: 'buyer' | 'seller' | 'both' = 'buyer',
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string }> {
  // Now delegates to genuine PDF export as requested by the user
  return await exportInvoiceToPdfA4(transaction, settings, mode, sellerRole);
}

/**
 * إنشاء صفحة HTML رسمية A4 لفاتورة العبور (سند مبيعات نقدية سمكية) للنقاط المرورية والأمنية
 */
export async function buildTransitInvoiceHtmlA4(
  buyer: Contact | null | undefined,
  transactions: Transaction[],
  purchasedItems: {
    fishName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalGross: number;
  }[],
  buyerMetrics: {
    count?: number;
    grossTotal: number;
    taxTotal?: number;
    finalTotal?: number;
  },
  transitSerial: string,
  settings: MarketSettings
): Promise<string> {
  const todayFormatted = formatGregorianDate(new Date());
  const logoDataUrl = await getLogoDataUrl();
  const buyerName = buyer?.name || 'غير محدد';

  // Fill up to 8 rows minimum like the official booklet
  const padRowsCount = Math.max(0, 8 - purchasedItems.length);

  const itemsRowsHtml = purchasedItems
    .map(
      (it, idx) => `
    <tr style="height: 36px; border-bottom: 1px solid #94a3b8; font-weight: bold;">
      <td style="text-align: center; border-left: 2px solid #0f172a; font-family: monospace; font-size: 13px;">${idx + 1}</td>
      <td style="padding: 6px 12px; text-align: right; border-left: 2px solid #0f172a; font-weight: 900; font-size: 14px; color: #020617;">${it.fishName}</td>
      <td style="padding: 6px 10px; text-align: center; border-left: 2px solid #0f172a; font-family: monospace; font-size: 14px;">${it.quantity} ${it.unit}</td>
      <td style="padding: 6px 10px; text-align: center; border-left: 2px solid #0f172a; font-family: monospace; font-size: 14px; font-weight: 900;">${formatNumber(it.unitPrice)}</td>
      <td style="padding: 6px 10px; text-align: center; font-family: monospace; font-size: 15px; font-weight: 900; color: #030164;">${formatNumber(it.totalGross)}</td>
    </tr>
  `
    )
    .join('');

  const emptyRowsHtml = Array.from({ length: padRowsCount })
    .map(
      (_, i) => `
    <tr style="height: 28px; border-bottom: 1px dotted #cbd5e1; color: #94a3b8;">
      <td style="text-align: center; border-left: 2px solid #0f172a; font-family: monospace; font-size: 11px;">${purchasedItems.length + i + 1}</td>
      <td style="border-left: 2px solid #0f172a;"></td>
      <td style="border-left: 2px solid #0f172a;"></td>
      <td style="border-left: 2px solid #0f172a;"></td>
      <td></td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>سند مبيعات نقدية سمكية - ${transitSerial} - ${buyerName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', system-ui, -apple-system, sans-serif; background: #ffffff; color: #0f172a; direction: rtl; padding: 4mm 5mm; }
    .transit-card { max-width: 100%; margin: 0 auto; border: 2px solid #0f172a; border-radius: 12px; padding: 20px; background: #ffffff; }
    .inner-border { border: 1.5px solid #334155; border-radius: 10px; padding: 18px; background: #ffffff; }
    .header-section { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 14px; gap: 14px; }
    .market-ar { text-align: right; }
    .market-en { text-align: left; direction: ltr; font-family: system-ui, sans-serif; }
    .meta-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 4px 8px 4px; border-bottom: 1.5px solid #94a3b8; }
    .serial-box { color: #dc2626; font-size: 22px; font-weight: 900; font-family: monospace; letter-spacing: 2px; }
    .doc-title { font-size: 20px; font-weight: 900; color: #020617; text-decoration: underline; text-underline-offset: 6px; }
    .buyer-line { margin: 14px 0 16px 0; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: bold; }
    .buyer-name-box { flex: 1; border-bottom: 2px dotted #334155; padding: 0 10px 4px 10px; font-size: 16px; font-weight: 900; color: #030164; }
    table.transit-table { width: 100%; border-collapse: collapse; border: 2px solid #0f172a; border-radius: 8px; overflow: hidden; margin-top: 8px; }
    table.transit-table th { background: #f1f5f9; color: #0f172a; font-weight: 900; font-size: 13px; border-bottom: 2px solid #0f172a; padding: 8px 6px; }
    .total-words { margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .signatures-row { margin-top: 26px; padding-top: 18px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; text-align: center; font-size: 12px; font-weight: bold; }
    .stamp-circle { width: 85px; height: 85px; border: 2px dashed #94a3b8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: #94a3b8; font-size: 11px; font-weight: bold; }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .transit-card { border: 1.5px solid #0f172a; box-shadow: none; padding: 0 8px !important; max-width: 100%; border-radius: 0; page-break-inside: avoid !important; break-inside: avoid !important; }
      .top-print-bar { display: none !important; }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-print-bar" style="max-width:100%;margin:0 auto 12px auto;display:flex;justify-content:space-between;align-items:center;background:#ffffff;padding:10px 16px;border-radius:10px;border:1px solid #e2e8f0;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
    <button onclick="window.print()" style="padding:7px 16px;background:#6d28d9;color:#ffffff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-family:'Cairo',sans-serif;font-size:13px;">🖨️ طباعة سند العبور [Ctrl+P]</button>
    <span style="font-size:12px;font-weight:bold;color:#475569;">سند مبيعات نقدية سمكية - نقاط التفتيش والعبور الأمني والمروري</span>
  </div>

  <div class="transit-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div class="inner-border">
      <!-- Header -->
      <div class="header-section">
        <div class="market-ar">
          <h2 style="font-size: 15px; font-weight: 900; color: #020617;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h2>
          <p style="font-size: 11px; font-weight: 700; color: #334155; margin-top: 2px;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 10px; color: #475569; margin-top: 2px;">${settings.location || 'م/شبوة م/رضوم / عين بامعبد'}</p>
          <p style="font-size: 10px; font-weight: bold; font-family: monospace; color: #0f172a; margin-top: 2px;">جوال: ${settings.contactPhone || '782191112'}</p>
        </div>

        <div style="text-align: center; display: flex; justify-content: center; align-items: center; padding: 0 10px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 130px; height: 130px; min-width: 130px; min-height: 130px; max-width: 130px; max-height: 130px; object-fit: contain; display: block; margin: 0 auto;" />
        </div>

        <div class="market-en">
          <h2 style="font-size: 13px; font-weight: 900; color: #020617;">Ain Ba Ma'abd Central Market</h2>
          <p style="font-size: 10px; font-weight: 700; color: #334155; margin-top: 2px;">For Fresh Fish - vegetables and Fruits</p>
          <p style="font-size: 9px; color: #475569; margin-top: 2px;">Shabwah - Radoom - Ain Ba Ma'abd</p>
          <p style="font-size: 10px; font-weight: bold; font-family: monospace; color: #0f172a; margin-top: 2px;">Mob: ${settings.contactPhone || '782191112'}</p>
        </div>
      </div>

      <!-- Title & Serial Bar -->
      <div class="meta-bar">
        <div class="serial-box">
          ${transitSerial}
        </div>
        <div style="text-align: center;">
          <h1 class="doc-title">سند مبيعات نقدية سمكية</h1>
        </div>
        <div style="font-size: 12px; font-weight: bold; color: #0f172a; font-family: monospace;">
          <span>التاريخ: </span>
          <span style="font-weight: 900; text-decoration: underline; font-size: 13px;">${todayFormatted}</span>
          <span> م</span>
        </div>
      </div>

      <!-- Buyer Line -->
      <div class="buyer-line">
        <span style="color: #334155;">اسم المشتري:</span>
        <div class="buyer-name-box">${buyerName}</div>
        <span style="color: #334155;">المحترم</span>
      </div>

      <!-- Table -->
      <table class="transit-table">
        <thead>
          <tr style="text-align: center;">
            <th style="width: 45px; border-left: 2px solid #0f172a;">
              <div>العدد</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: normal; color: #64748b;">No</div>
            </th>
            <th style="border-left: 2px solid #0f172a; text-align: right; padding-right: 12px;">
              <div>الصنف والتفاصيل</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: normal; color: #64748b;">Description &amp; class</div>
            </th>
            <th style="width: 95px; border-left: 2px solid #0f172a;">
              <div>الكمية</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: normal; color: #64748b;">Qty.</div>
            </th>
            <th style="width: 120px; border-left: 2px solid #0f172a;">
              <div>سعر الوحدة</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: normal; color: #64748b;">Unit Price (Y.R)</div>
            </th>
            <th style="width: 140px;">
              <div>القيمة الإجمالية</div>
              <div style="font-size: 9px; font-family: monospace; font-weight: normal; color: #64748b;">Total Amount (Y.R)</div>
            </th>
          </tr>
        </thead>
        <tbody>
          ${itemsRowsHtml}
          ${emptyRowsHtml}
          <!-- Total Row -->
          <tr style="background: #f8fafc; font-weight: 900; border-top: 2px solid #0f172a; height: 42px;">
            <td colspan="3" style="padding: 0 16px; border-left: 2px solid #0f172a;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 15px; font-weight: 900; color: #020617;">الإجمالي</span>
                <span style="font-size: 12px; font-family: monospace; color: #64748b;">Total</span>
              </div>
            </td>
            <td colspan="2" style="padding: 4px 8px; text-align: center;">
              <div style="height: 34px; border: 2px solid #0f172a; border-radius: 6px; background: #ffffff; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span style="font-family: monospace; font-weight: 900; font-size: 16px; color: #020617; letter-spacing: 1px;">
                  ${formatNumber(buyerMetrics.grossTotal)}
                </span>
                <span style="font-size: 12px; font-weight: bold; color: #334155;">ريال</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Total in Words -->
      <div class="total-words">
        <span style="font-weight: bold; color: #334155;">المبلغ الإجمالي بالحروف:</span>
        <span style="font-weight: 900; color: #030164; font-size: 14px;">
          ${tafqeet(buyerMetrics.grossTotal, settings.currency)}
        </span>
      </div>

      <!-- Signatures -->
      <div class="signatures-row">
        <div>
          <span style="display: block; margin-bottom: 28px; color: #334155;">توقيع المستلم / السائق:</span>
          <div style="border-bottom: 1.5px dashed #64748b; margin: 0 20px;"></div>
        </div>
        <div>
          <div class="stamp-circle">ختم السوق الرسمي</div>
        </div>
        <div>
          <span style="display: block; margin-bottom: 28px; color: #334155;">توقيع المبيعات:</span>
          <div style="border-bottom: 2px solid #0f172a; margin: 0 20px;"></div>
          ${settings.employeeName ? `<div style="font-size: 11px; font-weight: bold; color: #475569; margin-top: 4px; text-align: center;">(${settings.employeeName})</div>` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير سند العبور كملف PDF عالي الجودة وحفظه
 */
export async function exportTransitInvoicePdfA4(
  buyer: Contact | null | undefined,
  transactions: Transaction[],
  purchasedItems: {
    fishName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalGross: number;
  }[],
  buyerMetrics: {
    count?: number;
    grossTotal: number;
    taxTotal?: number;
    finalTotal?: number;
  },
  transitSerial: string,
  settings: MarketSettings,
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const html = await buildTransitInvoiceHtmlA4(
    buyer,
    transactions,
    purchasedItems,
    buyerMetrics,
    transitSerial,
    settings
  );
  const buyerNameSafe = (buyer?.name || 'مشتري').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = `فاتورة_العبور_${transitSerial}_${buyerNameSafe}.pdf`;
  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * إنشاء صفحة HTML كاملة وعالية الدقة لفاتورة المشتري الشاملة (A4)
 * تجمع شروات المشتري مع عمود البائع قبل عمود الصنف لتوضيح كل بائع في حال تعدد البائعين
 */
export async function buildMultiSellerBuyerInvoiceHtmlA4(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  voucherNumber?: string,
  timeframeLabel?: string,
  sellerRole?: 'fisherman' | 'seller'
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const displayDateStr = formatGregorianDate(new Date());
  const displayTimeStr = formatGregorianTime(new Date());
  const docNumber =
    voucherNumber ||
    `INV-${(buyer?.id || 'BUY').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const sellerColumnHeader =
    sellerRole === 'fisherman' ? 'الصياد' : sellerRole === 'seller' ? 'البائع' : 'البائع / الصياد';

  const isBuyerFullyPaid = debtMetrics.totalRemaining <= 0;
  const isBuyerPartiallyPaid = !isBuyerFullyPaid && debtMetrics.totalPaid > 0;
  const statusLabel = isBuyerFullyPaid
    ? 'مسددة بالكامل ✓'
    : isBuyerPartiallyPaid
    ? 'سداد جزئي'
    : 'دين آجل بالكامل';
  const statusColor = isBuyerFullyPaid ? '#047857' : isBuyerPartiallyPaid ? '#b45309' : '#b91c1c';

  // تجميع كافة الأصناف من جميع الصفقات مع اسم البائع لكل صنف
  const itemsWithSeller: {
    sellerName: string;
    fishName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalGross: number;
  }[] = [];

  transactions.forEach((t) => {
    (t.items || []).forEach((it) => {
      itemsWithSeller.push({
        sellerName: t.sellerName || '—',
        fishName: it.fishName,
        quantity: it.quantity,
        unit: it.unit || 'كجم',
        unitPrice: it.unitPrice,
        totalGross: it.totalGross,
      });
    });
  });

  const MIN_TABLE_ROWS = 17;
  const emptyRowsCount = Math.max(0, MIN_TABLE_ROWS - itemsWithSeller.length);

  const realRowsHtml = itemsWithSeller
    .map(
      (item, idx) => `
      <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}height: 29px;">
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; color: #475569;">${idx + 1}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: 800; font-size: 12px; color: #1e293b;">${item.sellerName}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: 900; font-size: 12.5px; color: #0f172a;">${item.fishName}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; font-size: 12px;">${item.quantity}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; color: #475569;">${item.unit}</td>
        <td style="padding: 5px 8px; text-align: left; border: 1px solid #cbd5e1; font-family: monospace; font-size: 12px; font-weight: bold;">${formatNumber(item.unitPrice)}</td>
        <td style="padding: 5px 8px; text-align: left; border: 1px solid #cbd5e1; font-family: monospace; font-size: 12.5px; font-weight: 900; color: #0f172a;">${formatNumber(item.totalGross)}</td>
      </tr>
    `
    )
    .join('');

  const emptyRowsHtml = Array.from({ length: emptyRowsCount })
    .map((_, i) => {
      const rowNum = itemsWithSeller.length + i + 1;
      return `
      <tr style="${rowNum % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}height: 29px;">
        <td style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; color: #cbd5e1;">${rowNum}</td>
        <td style="padding: 4px 8px; border: 1px solid #cbd5e1;">&nbsp;</td>
        <td style="padding: 4px 8px; border: 1px solid #cbd5e1;">&nbsp;</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">&nbsp;</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">&nbsp;</td>
        <td style="padding: 4px 6px; border: 1px solid #cbd5e1;">&nbsp;</td>
        <td style="padding: 4px 8px; border: 1px solid #cbd5e1;">&nbsp;</td>
      </tr>
      `;
    })
    .join('');

  const itemsHtml = realRowsHtml + emptyRowsHtml;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة المشتري - ${buyer?.name || 'مشتري'} - ${docNumber}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      direction: rtl;
      padding: 4mm 5mm;
      font-size: 13px;
      line-height: 1.4;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-card {
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 4px 12px -2px rgba(0,0,0,0.05);
    }
    .top-actions {
      max-width: 100%;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      border: none;
      background: #0284c7;
      color: #ffffff;
    }
    .grid-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      background: #f8fafc;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      margin-bottom: 14px;
      font-size: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 11.5px;
    }
    th {
      background: #0f172a !important;
      color: #ffffff !important;
      padding: 7px 6px;
      border: 1px solid #0f172a;
      font-weight: 800;
      font-size: 11.5px;
    }
    .finance-box {
      margin-bottom: 14px;
      font-size: 12px;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .finance-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 11.5px;
    }
    .finance-total {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      background: #ffffff !important;
      border: 1.5px solid #0284c7 !important;
      border-radius: 8px;
      font-weight: 900;
      font-size: 13.5px;
      margin-top: 6px;
      color: #0369a1 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .finance-paid {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      background: #ffffff !important;
      border: 1.5px solid #22c55e !important;
      border-radius: 8px;
      font-weight: 900;
      font-size: 13.5px;
      margin-top: 6px;
      color: #15803d !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .finance-debt {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      background: #ffffff !important;
      border: 1.5px solid #ef4444 !important;
      border-radius: 8px;
      font-weight: 900;
      font-size: 13.5px;
      margin-top: 6px;
      color: #b91c1c !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .sign-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding: 10px 30px 0 30px;
      border-top: 1.5px solid #0f172a;
      font-size: 11.5px;
      font-weight: bold;
    }
    .sign-line {
      border-bottom: 1px dashed #94a3b8;
      width: 100%;
      margin: 12px auto 0 auto;
    }
    .stamp-circle {
      border: 1.5px dashed #94a3b8;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 4px auto 0 auto;
      font-size: 9px;
      color: #94a3b8;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        height: auto !important;
        overflow: hidden !important;
      }
      .top-actions { display: none !important; }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 8px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      tfoot {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .sign-box {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة الفاتورة [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">فاتورة رسمية صادرة من ${settings.marketName}</span>
  </div>

  <div class="invoice-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px;">
        <!-- Right: Market Info Arabic -->
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 style="font-size: 18.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p style="font-size: 12px; font-weight: 800; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 10.5px; font-weight: 700; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</p>
        </div>

        <!-- Center: Fixed Size Logo Exactly in Dead Center -->
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 95px; height: 95px; min-width: 95px; min-height: 95px; max-width: 95px; max-height: 95px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="margin-top: 3px; font-size: 14px; font-weight: 900; color: #0f172a; text-align: center; letter-spacing: -0.2px; white-space: nowrap;">
            فاتورة المشتري
          </div>
        </div>

        <!-- Left: English Market Info (LTR) -->
        <div style="text-align: left; direction: ltr; line-height: 1.35; font-family: sans-serif; min-width: 0;">
          <h2 style="font-size: 13px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">Ain Bamaabad Central Market</h2>
          <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">For Fresh Fish, Vegetables & Fruits</p>
          <p style="font-size: 9.5px; font-weight: 600; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
        </div>
      </div>
    </div>

    <!-- Unified Document & Parties Card -->
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: #0f172a; color: #ffffff; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 900;">فاتورة مبيعات المشتري</span>
          <span style="font-family: monospace; font-size: 14px; font-weight: 900; color: #0f172a;">${docNumber}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 14px; font-size: 11.5px; color: #475569; font-weight: 700;">
          <div>التاريخ: <b style="color: #0f172a; font-family: monospace;">${displayDateStr}</b></div>
          <div>الوقت: <b style="color: #0f172a; font-family: monospace;">${displayTimeStr}</b></div>
          ${settings.employeeName ? `<div>الموظف: <b style="color: #0f172a; font-family: 'Cairo', sans-serif;">${settings.employeeName}</b></div>` : ''}
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div>
          <span style="color:#64748b;font-weight:bold;">المشتري:</span>
          <span style="font-weight:900;font-size:13.5px;color:#0f172a;margin-right:6px;">${buyer?.name || 'غير محدد'}</span>
        </div>
        <div>
          <span style="color:#64748b;font-weight:bold;">حالة الفاتورة:</span>
          <span style="font-weight:900;font-size:13px;color:${statusColor};margin-right:6px;">${statusLabel}</span>
        </div>
        <div>
          <span style="color:#64748b;font-weight:bold;">عدد الشروات / العمليات:</span>
          <span style="font-weight:bold;font-size:13px;color:#0369a1;margin-right:6px;">${buyerMetrics.count} شروة</span>
        </div>
      </div>
    </div>

    <!-- Items Table (with Seller Column before Fish Name) -->
    <table>
      <thead>
        <tr>
          <th style="width:40px;text-align:center;">م</th>
          <th style="width:160px;text-align:right;">${sellerColumnHeader}</th>
          <th style="text-align:right;">الصنف</th>
          <th style="width:70px;text-align:center;">الكمية</th>
          <th style="width:65px;text-align:center;">الوحدة</th>
          <th style="width:105px;text-align:left;">سعر الوحدة</th>
          <th style="width:130px;text-align:left;">الإجمالي الأساسي</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:bold;border-top:2px solid #0f172a;">
          <td colspan="6" style="padding:6px 8px;text-align:left;font-weight:900;">إجمالي قيمة المبيعات الأساسية:</td>
          <td style="padding:6px 8px;text-align:left;font-family:monospace;font-weight:900;font-size:13px;">${formatCurrency(buyerMetrics.grossTotal, settings.currency)}</td>
        </tr>
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0284c7;font-weight:bold;">
          <td colspan="6" style="padding:5px 8px;text-align:left;">عمولة وضريبة المشتري (+${((settings.buyerTaxRate ?? 0.02) * 100).toFixed(0)}%):</td>
          <td style="padding:5px 8px;text-align:left;font-family:monospace;font-weight:bold;">+${formatCurrency(buyerMetrics.taxTotal, settings.currency)}</td>
        </tr>
        <tr style="background:#ffffff;border-top:1px solid #cbd5e1;color:#0369a1;font-weight:900;">
          <td colspan="6" style="padding:6px 8px;text-align:left;font-size:13px;">الإجمالي المطلوب من المشتري:</td>
          <td style="padding:6px 8px;text-align:left;font-family:monospace;font-size:13.5px;font-weight:900;">${formatCurrency(buyerMetrics.finalTotal, settings.currency)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Signatures & Official Stamp -->
    <div class="sign-box">
      <div style="text-align: center;">
        <p style="color:#64748b; font-size:11px; margin:0 0 4px 0;">ختم السوق الرسمي</p>
        <div class="stamp-circle">ختم السوق</div>
      </div>
      <div style="text-align: center; width: 220px;">
        <p style="color:#334155; margin:0 0 6px 0;">توقيع مسؤول الصندوق / الإدارة</p>
        <div class="sign-line"></div>
        ${settings.employeeName ? `<p style="font-size:11px;color:#475569;font-weight:bold;margin-top:4px;">(${settings.employeeName})</p>` : ''}
      </div>
    </div>

    <div style="text-align:center;font-size:10px;color:#64748b;margin-top:10px;padding-top:6px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
      <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
      <span>شكراً لتعاملكم معنا</span>
      <span style="font-family:monospace;">حررت: ${displayDateStr} - ${displayTimeStr}</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير فاتورة المشتري الشاملة (متعددة البائعين) إلى ملف PDF رسمي
 */
export async function exportMultiSellerBuyerInvoicePdfA4(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  voucherNumber?: string,
  timeframeLabel?: string,
  silent: boolean = false,
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const html = await buildMultiSellerBuyerInvoiceHtmlA4(
    buyer,
    transactions,
    debtMetrics,
    buyerMetrics,
    settings,
    voucherNumber,
    timeframeLabel,
    sellerRole
  );
  const buyerNameSafe = (buyer?.name || 'مشتري').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = `فاتورة_المشتري_${buyerNameSafe}_${new Date().toISOString().slice(2, 10)}.pdf`;
  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * طباعة فاتورة المشتري الشاملة (متعددة البائعين) مباشرة بدقة متجهات A4 عالية
 */
export async function printMultiSellerBuyerInvoiceA4Direct(
  buyer: Contact | undefined,
  transactions: Transaction[],
  debtMetrics: { totalRemaining: number; totalPaid: number },
  buyerMetrics: { grossTotal: number; taxTotal: number; finalTotal: number; count: number },
  settings: MarketSettings,
  voucherNumber?: string,
  timeframeLabel?: string,
  options: { silent?: boolean; deviceName?: string } = {},
  sellerRole?: 'fisherman' | 'seller'
): Promise<{ success: boolean; message: string }> {
  const html = await buildMultiSellerBuyerInvoiceHtmlA4(
    buyer,
    transactions,
    debtMetrics,
    buyerMetrics,
    settings,
    voucherNumber,
    timeframeLabel,
    sellerRole
  );
  return await printHtmlA4Direct(html, options);
}

/**
 * تصدير سند العبور إلى ملف إكسل (.xlsx) أنيق
 */
export async function exportTransitInvoiceToExcel(
  buyer: Contact | null | undefined,
  purchasedItems: {
    fishName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalGross: number;
  }[],
  buyerMetrics: {
    grossTotal: number;
  },
  transitSerial: string,
  settings: MarketSettings
): Promise<{ success: boolean; message: string; savedPath?: string }> {
  const buyerName = buyer?.name || 'مشتري';
  const filename = `فاتورة_عبور_${transitSerial}_${buyerName.replace(/\s+/g, '_')}.xlsx`;

  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];

  const setCell = (r: number, c: number, v: any, style: any = {}) => {
    const cellRef = XLSX.utils.encode_cell({ r, c });
    ws[cellRef] = { v, t: typeof v === 'number' ? 'n' : 's', s: style };
  };

  // Header Title
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 14, bold: true, color: { rgb: '030164' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });

  setCell(1, 0, 'سند مبيعات نقدية سمكية - فاتورة العبور (النقاط الأمنية والمرورية)', {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '334155' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });

  // Serial & Date
  setCell(2, 0, `رقم السند: ${transitSerial}`, {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'DC2626' } },
    alignment: { horizontal: 'right' },
  });
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 1 } });

  setCell(2, 3, `التاريخ: ${formatGregorianDate(new Date())}`, {
    font: { name: 'Arial', sz: 10, bold: true },
    alignment: { horizontal: 'left' },
  });
  merges.push({ s: { r: 2, c: 3 }, e: { r: 2, c: 4 } });

  // Buyer Name
  setCell(3, 0, `اسم المشتري: ${buyerName} المحترم`, {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '020617' } },
    alignment: { horizontal: 'right' },
  });
  merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 4 } });

  // Table Headers
  const headers = ['العدد (No)', 'الصنف والتفاصيل', 'الكمية (Qty)', 'سعر الوحدة (Y.R)', 'القيمة الإجمالية (Y.R)'];
  headers.forEach((h, i) => {
    setCell(5, i, h, {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '0F172A' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      },
    });
  });

  let curRow = 6;
  purchasedItems.forEach((it, idx) => {
    const border = {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    };
    const rowFill = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';

    setCell(curRow, 0, idx + 1, { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 1, it.fishName, { font: { name: 'Arial', sz: 10, bold: true }, alignment: { horizontal: 'right' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 2, `${it.quantity} ${it.unit}`, { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 3, it.unitPrice, { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    setCell(curRow, 4, it.totalGross, { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '030164' } }, alignment: { horizontal: 'center' }, fill: { fgColor: { rgb: rowFill } }, border });
    curRow++;
  });

  // Totals Row
  setCell(curRow, 0, 'الإجمالي Total', {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '020617' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 3 } });

  setCell(curRow, 4, buyerMetrics.grossTotal, {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '020617' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { top: { style: 'medium' }, bottom: { style: 'double' } },
  });
  curRow++;

  // Words
  setCell(curRow, 0, `المبلغ الإجمالي بالحروف: ${tafqeet(buyerMetrics.grossTotal, settings.currency)}`, {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '030164' } },
    alignment: { horizontal: 'right' },
  });
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 4 } });

  ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 22 }];
  ws['!merges'] = merges;

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'فاتورة العبور');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  return await saveToDesktopOrDownload(
    filename,
    new Uint8Array(out),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    true
  );
}

/**
 * إنشاء صفحة HTML للإيصال الحراري لكشف حساب المشتري بصيغة 80mm وتصديره كملف PDF
 */
export async function buildBuyerThermalReceiptHtml(
  buyer: Contact | null | undefined,
  transactions: Transaction[],
  debtMetrics: {
    totalRemaining: number;
    totalPaid: number;
  },
  buyerMetrics: {
    count: number;
    grossTotal: number;
    taxTotal: number;
    finalTotal: number;
  },
  settings: MarketSettings,
  timeframeLabel?: string
): Promise<string> {
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const logoDataUrl = await getLogoDataUrl();
  const voucherNumber = `BYR-${(buyer?.id || 'BUY').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const txRows = transactions
    .map((t) => {
      const itemRows = t.items
        .map(
          (it) => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;">
        <span>${it.fishName} (${it.quantity} ${it.unit})</span>
        <span style="font-family:monospace;font-weight:bold;">${formatNumber(it.totalGross)}</span>
      </div>
    `
        )
        .join('');

      return `
      <div style="padding:6px 0;border-bottom:1px dashed #cbd5e1;">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;font-weight:bold;">
          <span>شروة #${t.id}</span>
          <span>${t.dateStr} ${t.timeStr || ''}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin:2px 0;">
          <span>${t.sellerRole === 'seller' ? 'البائع' : 'الصياد'}: ${t.sellerName}</span>
          <span style="font-family:monospace;">${formatCurrency(t.totalFromBuyer, '')}</span>
        </div>
        ${itemRows}
      </div>
    `;
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>إيصال حراري - ${buyer?.name || 'مشتري'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', monospace, sans-serif; background: #ffffff; color: #000000; direction: rtl; padding: 10px; width: 80mm; margin: 0 auto; }
    .receipt { width: 100%; border: 1px dashed #cbd5e1; padding: 12px; }
    .header { text-align: center; border-bottom: 2px solid #000000; padding-bottom: 8px; margin-bottom: 8px; }
    .title { font-size: 14px; font-weight: 900; }
    .subtitle { font-size: 10px; }
    .badge { display: inline-block; background: #000000; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-top: 4px; }
    .meta { font-size: 11px; border-bottom: 1px dashed #000000; padding-bottom: 6px; margin-bottom: 6px; }
    .meta-row { display: flex; justify-content: space-between; margin: 2px 0; }
    .totals { border-top: 2px solid #000000; padding-top: 6px; margin-top: 6px; font-size: 11px; }
    .totals-row { display: flex; justify-content: space-between; margin: 3px 0; font-weight: bold; }
    .total-big { font-size: 14px; font-weight: 900; }
    .footer { text-align: center; font-size: 10px; color: #475569; margin-top: 10px; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
    @media print {
      body { width: 80mm; padding: 0; }
      .receipt { border: none; padding: 2mm; }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="receipt" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div class="header">
      <img src="${logoDataUrl}" alt="شعار" style="width:45px;height:45px;object-fit:contain;margin:0 auto 4px auto;display:block;" />
      <div class="title">${settings.marketName || 'سوق عين بامعبد المركزي'}</div>
      <div class="subtitle">${settings.subTitle || 'للأسماك الطازجة'}</div>
      <div class="badge">كشف حساب ومطالبة مشتري</div>
    </div>
    <div class="meta">
      <div class="meta-row"><span>رقم الكشف:</span><span style="font-family:monospace;font-weight:bold;">${voucherNumber}</span></div>
      <div class="meta-row"><span>التاريخ:</span><span style="font-family:monospace;">${todayFormatted} ${nowTime}</span></div>
      ${settings.employeeName ? `<div class="meta-row"><span>الموظف:</span><span style="font-weight:bold;">${settings.employeeName}</span></div>` : ''}
      <div class="meta-row"><span>المشتري:</span><span style="font-weight:900;">${buyer?.name || 'غير محدد'}</span></div>
      <div class="meta-row"><span>عدد الشروات:</span><span style="font-weight:bold;">${buyerMetrics.count} شروة</span></div>
      ${timeframeLabel ? `<div class="meta-row"><span>الفترة:</span><span>${timeframeLabel}</span></div>` : ''}
    </div>
    <div>${txRows}</div>
    <div class="totals">
      <div class="totals-row">
        <span>إجمالي المشتريات (+2%):</span>
        <span style="font-family:monospace;">${formatCurrency(buyerMetrics.finalTotal, settings.currency)}</span>
      </div>
      <div class="totals-row">
        <span>المسدد:</span>
        <span style="font-family:monospace;color:#16a34a;">${formatCurrency(debtMetrics.totalPaid, settings.currency)}</span>
      </div>
      <div class="totals-row total-big" style="color:#b91c1c;border-top:1px solid #000000;padding-top:4px;margin-top:4px;">
        <span>المتبقي المطلوب:</span>
        <span style="font-family:monospace;">${formatCurrency(debtMetrics.totalRemaining, settings.currency)}</span>
      </div>
    </div>
    <div class="footer">
      ${settings.employeeName ? `<div style="font-weight:bold;margin-bottom:2px;">الموظف: ${settings.employeeName}</div>` : ''}
      <div>شكراً لتعاملكم معنا</div>
      <div>${settings.location || 'م/شبوة - عين بامعبد'} | ${settings.contactPhone || '782191112'}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير الإيصال الحراري للمشتري كملف PDF
 */
export async function exportBuyerThermalPdf(
  buyer: Contact | null | undefined,
  transactions: Transaction[],
  debtMetrics: {
    totalRemaining: number;
    totalPaid: number;
  },
  buyerMetrics: {
    count: number;
    grossTotal: number;
    taxTotal: number;
    finalTotal: number;
  },
  settings: MarketSettings,
  timeframeLabel?: string
): Promise<{ success: boolean; message: string; savedPath?: string }> {
  const html = await buildBuyerThermalReceiptHtml(
    buyer,
    transactions,
    debtMetrics,
    buyerMetrics,
    settings,
    timeframeLabel
  );
  const buyerNameSafe = (buyer?.name || 'مشتري').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = `إيصال_حراري_${buyerNameSafe}_${new Date().toISOString().slice(2, 10)}.pdf`;
  return await exportHtmlToPdfA4(html, filename);
}

/**
 * إنشاء صفحة HTML كاملة وعالية الدقة لإشعار تصفية مستحقات الصياد (فاتورة خدمية أو سند رسمي)
 */
export async function buildFishermanSettlementHtmlA4(
  seller: Contact | undefined,
  transactions: Transaction[],
  sellerMetrics: { grossTotal: number; deductionTotal: number; netTotal: number; count: number },
  settings: MarketSettings,
  printMode: 'service' | 'official' | 'thermal' = 'service',
  timeframeLabel: string = 'كافة العمليات',
  totalPaid: number = 0,
  remainingBalance?: number,
  employeeName: string = '',
  contacts: Contact[] = [],
  sellerRole: 'fisherman' | 'seller' = 'fisherman'
): Promise<string> {
  const isFishermanRole = sellerRole === 'fisherman';
  const sellerRoleLabel = isFishermanRole ? 'الصياد' : 'البائع';
  const sellerRoleTitle = isFishermanRole ? 'الصياد:' : 'البائع:';
  const sellerRolePrep = isFishermanRole ? 'للصياد' : 'للبائع';

  const logoDataUrl = await getLogoDataUrl();
  const sellerName = seller?.name || 'غير محدد';
  const voucherNumber = `STL-${(seller?.id || 'SLR').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());

  const contactsMap = new Map<string, Contact>();
  if (contacts && Array.isArray(contacts)) {
    contacts.forEach((c) => {
      if (c.id) contactsMap.set(c.id, c);
      if (c.name) contactsMap.set(c.name.trim().toLowerCase(), c);
    });
  }

  const currencyLabel = settings.currency?.includes('ريال') ? 'يمني' : (settings.currency || 'يمني');
  const totalGrossAmount =
    (sellerMetrics && typeof sellerMetrics.grossTotal === 'number' && sellerMetrics.grossTotal > 0)
      ? sellerMetrics.grossTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.grossAmount) || 0), 0);

  const commissionAmount =
    (sellerMetrics && typeof sellerMetrics.deductionTotal === 'number')
      ? sellerMetrics.deductionTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.sellerTaxAmount ?? (t as any).commissionAmount) || 0), 0);

  const netDueToSeller =
    (sellerMetrics && typeof sellerMetrics.netTotal === 'number' && sellerMetrics.netTotal > 0)
      ? sellerMetrics.netTotal
      : (transactions || []).reduce((sum, t) => sum + (Number(t.netToSeller ?? ((Number(t.grossAmount) || 0) - (Number(t.sellerTaxAmount) || 0))) || 0), 0);

  const tafqeetWords = tafqeet(netDueToSeller, 'يمني')
    .replace(/^فقط\s+/, '')
    .replace(/\s+لا غير$/, '');

  const firstTrx = transactions[0];
  const dateObj = firstTrx?.timestamp ? new Date(firstTrx.timestamp) : new Date();
  const weekday = (firstTrx ? getWeekdayName(firstTrx.timestamp, firstTrx.dateStr) : '') || getWeekdayName(Date.now()) || 'السبت';
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const invoiceDateString = `${weekday} ${day} / ${month} / ${year} م`;

  const now = new Date();
  const displayDateStr = formatGregorianDate(now);
  const displayTimeStr = formatGregorianTime(now);
  const settlementDocNumber = `STL-${(seller?.id || 'SLR').slice(-4).toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;

  const tsDay = String(now.getDate()).padStart(2, '0');
  const tsMonth = String(now.getMonth() + 1).padStart(2, '0');
  const tsYear = now.getFullYear();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  const hoursStr = String(hours).padStart(2, '0');
  const printTimestamp = `${tsDay}/${tsMonth}/${tsYear} ${hoursStr}:${minutes}:${seconds} ${ampm}`;

  if (printMode === 'service') {
    const serviceRows: Array<{
      buyerName: string;
      buyerPhone: string;
      description: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      totalGross: number;
    }> = [];

    transactions.forEach((t) => {
      const buyerContact = t.buyerId
        ? contactsMap.get(t.buyerId)
        : (t.buyerName ? contactsMap.get(t.buyerName.trim().toLowerCase()) : undefined);
      const buyerPhone = t.buyerPhone || buyerContact?.phone || '';

      if (Array.isArray(t.items) && t.items.length > 0) {
        t.items.forEach((item) => {
          serviceRows.push({
            buyerName: t.buyerName || '—',
            buyerPhone: buyerPhone,
            description: item.fishName || 'تبوع',
            unit: item.unit || 'حبه',
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalGross: item.totalGross || (item.quantity * item.unitPrice),
          });
        });
      } else {
        serviceRows.push({
          buyerName: t.buyerName || '—',
          buyerPhone: buyerPhone,
          description: t.notes || 'تبوع',
          unit: 'حبه',
          quantity: 1,
          unitPrice: t.grossAmount,
          totalGross: t.grossAmount,
        });
      }
    });

    const MIN_TABLE_ROWS = 17;
    const emptyRowsCount = Math.max(0, MIN_TABLE_ROWS - serviceRows.length);

    const rowsHtml = serviceRows.length === 0
      ? `<tr><td colspan="8" style="border:1px solid #cbd5e1; padding:8px; text-align:center; color:#64748b; font-weight:bold;">لا توجد عمليات بيع مسجلة لهذا الصياد خلال الفترة المحددة.</td></tr>`
      : serviceRows.map((r, idx) => `
        <tr style="height:29px; ${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">${idx + 1}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:right; font-weight:800; color:#0f172a;">${r.buyerName}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:center; font-family:monospace; font-weight:bold;" dir="ltr">${r.buyerPhone || '—'}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:right; font-weight:800; color:#1e293b;">${r.description}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:center; color:#475569;">${r.unit}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:center; font-family:monospace; font-weight:bold;">${formatNumber(r.quantity)}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:left; font-family:monospace; font-weight:bold;">${formatNumber(r.unitPrice)}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:left; font-family:monospace; font-weight:900; color:#0369a1;">${formatNumber(r.totalGross)}</td>
        </tr>
      `).join('');

    let emptyRowsHtml = '';
    for (let i = 0; i < emptyRowsCount; i++) {
      const rowNum = serviceRows.length + i + 1;
      emptyRowsHtml += `
        <tr style="height:29px; background:${rowNum % 2 === 0 ? '#f8fafc' : '#ffffff'};">
          <td style="border:1px solid #cbd5e1; padding:4px 6px; text-align:center; font-family:monospace; font-weight:bold; color:#cbd5e1;">${rowNum}</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
          <td style="border:1px solid #cbd5e1; padding:4px 6px;">&nbsp;</td>
        </tr>
      `;
    }

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>فاتورة خدمية - ${sellerName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #f1f5f9;
      color: #0f172a;
      padding: 12px;
      margin: 0 auto;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    .top-actions {
      max-width: 800px;
      margin: 0 auto 12px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn {
      background: #0f172a;
      color: #ffffff;
      border: none;
      padding: 7px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      font-size: 13px;
      font-family: inherit;
    }
    .invoice-card {
      background: #ffffff;
      max-width: 800px;
      margin: 0 auto;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 16px;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      box-sizing: border-box;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #cbd5e1;
      font-size: 11px;
      table-layout: fixed;
      margin-top: 6px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      word-break: break-word;
    }
    th {
      font-weight: bold;
      background: #0f172a;
      color: #ffffff;
      text-align: center;
    }
    .tafqeet-wrapper {
      padding: 4px 6px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-weight: 900;
      line-height: 1.4;
      text-align: center;
      color: #0f172a;
    }
    .sign-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 20px;
      padding: 16px 40px 0 40px;
      border-top: 1.5px solid #0f172a;
      font-size: 12px;
      font-weight: bold;
    }
    .sign-line {
      border-bottom: 1px dashed #94a3b8;
      width: 100%;
      margin: 20px auto 0 auto;
    }
    .stamp-circle {
      border: 1.5px dashed #94a3b8;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 6px auto 0 auto;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        height: auto !important;
        overflow: hidden !important;
      }
      .top-actions { display: none !important; }
      .invoice-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 8px !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      tr, tfoot, .sign-box {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة الفاتورة [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">فاتورة خدمية صادرة من ${settings.marketName}</span>
  </div>

  <div class="invoice-card" id="a4-service-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header -->
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px;">
        <!-- Right: Market Info Arabic -->
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 style="font-size: 18.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p style="font-size: 12px; font-weight: 800; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 10.5px; font-weight: 700; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</p>
        </div>

        <!-- Center: Fixed Size Logo Exactly in Dead Center -->
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 95px; height: 95px; min-width: 95px; min-height: 95px; max-width: 95px; max-height: 95px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="margin-top: 3px; font-size: 14px; font-weight: 900; color: #0f172a; text-align: center; letter-spacing: -0.2px; white-space: nowrap;">
            فاتورة خدمية
          </div>
        </div>

        <!-- Left: English Market Info (LTR) -->
        <div style="text-align: left; direction: ltr; line-height: 1.35; font-family: sans-serif; min-width: 0;">
          <h2 style="font-size: 13px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">Ain Bamaabad Central Market</h2>
          <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">For Fresh Fish, Vegetables & Fruits</p>
          <p style="font-size: 9.5px; font-weight: 600; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
        </div>
      </div>
    </div>

    <!-- Unified Document & Parties Card -->
    <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="background: #0f172a; color: #ffffff; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 900;">فاتورة خدمية</span>
          <span style="font-family: monospace; font-size: 14px; font-weight: 900; color: #0f172a;">${settlementDocNumber}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 14px; font-size: 11.5px; color: #475569; font-weight: 700;">
          <div>التاريخ: <b style="color: #0f172a; font-family: monospace;">${displayDateStr}</b></div>
          <div>الوقت: <b style="color: #0f172a; font-family: monospace;">${displayTimeStr}</b></div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div>
          <span style="color:#64748b;font-weight:bold;">${isFishermanRole ? 'الصياد:' : 'البائع:'}</span>
          <span style="font-weight:900;font-size:13.5px;color:#0f172a;margin-right:6px;">${sellerName}</span>
        </div>
        <div>
          <span style="color:#64748b;font-weight:bold;">العملة:</span>
          <span style="font-weight:900;font-size:13px;color:#0f172a;margin-right:6px;">ريال ${currencyLabel}</span>
        </div>
        <div>
          <span style="color:#64748b;font-weight:bold;">عدد العمليات / الشروات:</span>
          <span style="font-weight:bold;font-size:13px;color:#0369a1;margin-right:6px;">${serviceRows.length} شروة</span>
        </div>
      </div>
    </div>

    <!-- Table -->
    <table>
      <thead>
        <tr style="background:#0f172a; color:#ffffff;">
          <th style="width:36px; text-align:center; border:1px solid #cbd5e1; color:#ffffff;">م</th>
          <th style="width:20%; text-align:right; border:1px solid #cbd5e1; color:#ffffff;">اسم المشتري</th>
          <th style="width:13%; text-align:center; border:1px solid #cbd5e1; color:#ffffff;">رقم الهاتف</th>
          <th style="text-align:right; border:1px solid #cbd5e1; color:#ffffff;">الصنف / البيان</th>
          <th style="width:7%; text-align:center; border:1px solid #cbd5e1; color:#ffffff;">الوحدة</th>
          <th style="width:8%; text-align:center; border:1px solid #cbd5e1; color:#ffffff;">الكمية</th>
          <th style="width:15%; text-align:left; border:1px solid #cbd5e1; color:#ffffff; white-space:nowrap;">سعر الوحدة</th>
          <th style="width:16%; text-align:left; border:1px solid #cbd5e1; color:#ffffff; white-space:nowrap;">القيمة الإجمالية</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${emptyRowsHtml}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid #0f172a; font-weight:bold;">
          <td colspan="6" rowspan="3" style="border:1px solid #cbd5e1; padding:8px; text-align:center; vertical-align:middle; background:#f8fafc;">
            <div class="tafqeet-wrapper">
              ${tafqeetWords}
            </div>
          </td>
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:900; background:#f1f5f9; font-size:13px; color:#0f172a; white-space:nowrap;">الإجمالي:</td>
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-family:monospace; font-weight:900; font-size:14px; background:#f8fafc; color:#0f172a; white-space:nowrap;">${formatNumber(totalGrossAmount)}</td>
        </tr>
        <tr style="font-weight:bold;">
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:bold; background:#f8fafc; color:#334155; font-size:13px; white-space:nowrap;">مبلغ العمولة:</td>
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-family:monospace; font-weight:bold; font-size:14px; background:#ffffff; color:#b91c1c; white-space:nowrap;">${formatNumber(commissionAmount)}</td>
        </tr>
        <tr style="font-weight:bold;">
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-weight:900; background:#dcfce7; color:#14532d; font-size:13.5px; white-space:nowrap;">المتبقي:</td>
          <td style="border:1px solid #cbd5e1; padding:8px 12px; text-align:left; font-family:monospace; font-weight:900; font-size:14.5px; background:#f0fdf4; color:#166534; white-space:nowrap;">${formatNumber(netDueToSeller)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Signatures & Official Stamp -->
    <div class="sign-box">
      <div style="text-align: center;">
        <p style="color:#64748b; font-size:11px; margin:0 0 6px 0; font-weight:bold;">ختم السوق الرسمي</p>
        <div class="stamp-circle">ختم السوق</div>
      </div>
      <div style="text-align: center; width: 220px;">
        <p style="color:#334155; margin:0 0 10px 0; font-size:12px; font-weight:bold;">توقيع مسؤول الصندوق / الإدارة</p>
        <div class="sign-line"></div>
        ${(employeeName || settings.employeeName) ? `<p style="font-size:10px; color:#64748b; margin-top:4px;">الموظف: ${employeeName || settings.employeeName}</p>` : ''}
      </div>
    </div>

    <div style="text-align:center;font-size:10px;color:#64748b;margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
      <span>نظام حراج الأسماك - نقطة البيع والحسابات</span>
      <span>شكراً لتعاملكم معنا</span>
      <span style="font-family:monospace;">حررت: ${displayDateStr} - ${displayTimeStr}</span>
    </div>
  </div>
</body>
</html>`;
  }

  // Official statement mode:
  const officialRows = transactions.length === 0
    ? `<tr><td colspan="8" style="padding:18px; text-align:center; color:#64748b; font-weight:bold; font-size:14px;">لا توجد عمليات بيع مسجلة لهذا ${sellerRoleLabel} خلال الفترة المحددة.</td></tr>`
    : transactions.map((t, idx) => {
      const itemsText = Array.isArray(t.items) && t.items.length > 0
        ? t.items.map((it) => `${it.fishName} (${formatNumber(it.quantity)} ${it.unit || 'حبه'})`).join('، ')
        : (t.notes || 'تبوع');
      return `
        <tr>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-family:'Cairo',monospace; font-weight:800; font-size:13.5px; color:#475569;">${idx + 1}</td>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-family:'Cairo',monospace; font-weight:900; font-size:14px; color:#1d4ed8; white-space:nowrap;">${t.id}</td>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-size:12.5px; font-weight:700; color:#334155; white-space:nowrap;">${getWeekdayName(t.timestamp, t.dateStr) ? `${getWeekdayName(t.timestamp, t.dateStr)}، ` : ''}${formatDisplayDate(t.timestamp, t.dateStr)}</td>
          <td style="padding:8px 8px; border:1px solid #cbd5e1; text-align:right; font-weight:800; font-size:14px; color:#0f172a;">${t.buyerName || '—'}</td>
          <td style="padding:8px 8px; border:1px solid #cbd5e1; text-align:right; font-size:13.5px; font-weight:700; color:#1e293b; line-height:1.4;">${itemsText}</td>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-family:'Cairo',monospace; font-weight:900; font-size:14.5px; color:#0f172a;">${formatCurrency(t.grossAmount, '')}</td>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-family:'Cairo',monospace; font-weight:900; font-size:14.5px; color:#b91c1c;">${formatCurrency((t as any).deductionAmount ?? t.sellerTaxAmount ?? 0, '')}</td>
          <td style="padding:8px 6px; border:1px solid #cbd5e1; text-align:center; font-family:'Cairo',monospace; font-weight:900; font-size:15px; color:#047857; background:#f0fdf4;">${formatCurrency(t.netToSeller, '')}</td>
        </tr>
      `;
    }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سند تصفية مستحقات ${isFishermanRole ? 'صياد' : 'بائع'} - ${sellerName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      padding: 4mm 5mm;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13.5px; }
    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 9px 8px; font-weight: 900; color: #0f172a; font-size: 13.5px; }
    td { border: 1px solid #cbd5e1; padding: 8px 8px; }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div id="a4-invoice-render" style="position: relative; width:100%; box-sizing:border-box;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header with Dead-centered fixed logo in balanced 3-column grid -->
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 16px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;">
        <!-- Right: Market Info -->
        <div style="text-align: right;">
          <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p style="font-size: 13px; font-weight: 800; color: #334155; margin: 4px 0 0 0;">${(settings.subTitle || 'للخضار والفواكة والأسماك').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 11px; font-weight: 700; color: #64748b; margin: 4px 0 0 0;">${settings.location || 'م/شبوة - م/رضوم - عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}</p>
        </div>

        <!-- Center: Fixed Size Logo Exactly in Dead Center -->
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 8px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 130px; height: 130px; min-width: 130px; min-height: 130px; max-width: 130px; max-height: 130px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="margin-top: 6px; font-size: 16px; font-weight: 900; color: #0f172a; text-align: center; letter-spacing: -0.2px; white-space: nowrap;">
            سند إشعار تصفية وصرف مستحقات ${isFishermanRole ? 'صياد' : 'بائع'}
          </div>
        </div>

        <!-- Left: Document Box & Time -->
        <div style="direction: ltr; text-align: left; display: flex; flex-direction: column; align-items: flex-end;">
          <div style="border: 2px solid #0f172a; padding: 6px 14px; border-radius: 8px; text-align: center; background: #f8fafc; min-width: 165px; margin-bottom: 3px;">
            <span style="font-size: 11px; font-weight: 800; color: #475569; display: block; direction: rtl; line-height: 1.35; margin-bottom: 2px;">رقم الإشعار / السند</span>
            <span style="font-size: 16px; font-weight: 900; color: #0f172a; font-family: monospace; display: block; direction: ltr;">${voucherNumber}</span>
          </div>
          <div style="font-size: 11px; color: #475569; font-family: monospace; direction: rtl; text-align: right; line-height: 1.4;">
            <div>التاريخ: <b style="color: #0f172a;">${todayFormatted}</b></div>
            <div>الوقت: <b style="color: #0f172a;">${nowTime}</b></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Period & Subtitle Bar -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 800; color: #334155;">الفترة: ${timeframeLabel}</span>
      <span style="font-size: 12px; font-weight: 700; color: #64748b;">كشف حساب وتصفية مستحقات رسمي معتمد</span>
    </div>

    <!-- Fisherman Info Box -->
    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px; padding:12px 16px; margin-bottom:12px; font-size:13px;">
      <div>
        <span style="color:#64748b; font-weight:700; display:block; margin-bottom:2px;">${sellerRoleTitle}</span>
        <span style="font-size:16px; font-weight:900; color:#0f172a;">${sellerName}</span>
      </div>
      <div>
        <span style="color:#64748b; font-weight:700; display:block; margin-bottom:2px;">عدد الشروات:</span>
        <span style="font-size:16px; font-weight:900; color:#1d4ed8; font-family:'Cairo',monospace;">${sellerMetrics.count} شروة</span>
      </div>
      <div>
        <span style="color:#64748b; font-weight:700; display:block; margin-bottom:2px;">رقم الهاتف:</span>
        <span style="font-size:14.5px; font-weight:800; font-family:'Cairo',monospace; color:#0f172a;">${seller?.phone || '—'}</span>
      </div>
    </div>

    <!-- Table -->
    <table>
      <thead>
        <tr>
          <th style="width:40px; padding:10px 4px; text-align:center;">م</th>
          <th style="width:120px; padding:10px 6px; text-align:center;">رقم الشروة</th>
          <th style="width:135px; padding:10px 6px; text-align:center;">التاريخ</th>
          <th style="width:130px; padding:10px 8px; text-align:right;">المشتري</th>
          <th style="padding:10px 8px; text-align:right;">البيان والأصناف</th>
          <th style="width:105px; padding:10px 6px; text-align:center;">الأساسي</th>
          <th style="width:95px; padding:10px 6px; text-align:center;">العمولة</th>
          <th style="width:120px; padding:10px 6px; text-align:center; background:#dcfce7; color:#14532d;">صافي ${sellerRoleLabel}</th>
        </tr>
      </thead>
      <tbody>
        ${officialRows}
      </tbody>
    </table>

    <!-- Financial Totals -->
    <div style="margin-top:16px; display:flex; justify-content:flex-end;">
      <div style="border:1.5px solid #cbd5e1; border-radius:8px; overflow:hidden; width:100%; max-width:400px; font-size:13.5px;">
        <div style="display:flex; justify-content:space-between; padding:8px 14px; border-bottom:1px solid #e2e8f0; background:#f8fafc;">
          <span style="font-weight:700; color:#334155;">إجمالي الأساسي:</span>
          <span style="font-weight:900; font-family:'Cairo',monospace; color:#0f172a; font-size:14.5px;">${formatCurrency(totalGrossAmount, settings.currency)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:8px 14px; border-bottom:1px solid #e2e8f0; background:#fef3c7; color:#78350f;">
          <span style="font-weight:700;">إجمالي عمولة الحراج:</span>
          <span style="font-weight:900; font-family:'Cairo',monospace; font-size:14.5px;">${formatCurrency(commissionAmount, settings.currency)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; padding:10px 14px; background:#d1fae5; color:#064e3b; font-weight:900; font-size:15px;">
          <span>صافي مستحق ${sellerRoleLabel}:</span>
          <span style="font-family:'Cairo',monospace; font-size:17px; font-weight:900;">${formatCurrency(netDueToSeller, settings.currency)}</span>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div style="margin-top: 22px; padding-top: 14px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 12px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">توقيع واستلام ${sellerRoleLabel} (المستفيد):</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 11px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span style="display: block; margin-bottom: 4px;">توقيع المحاسب / أمين الصندوق:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير إشعار تصفية مستحقات الصياد كملف PDF رسمي بحجم A4 وحفظه مباشرة للجهاز
 */
export async function exportFishermanSettlementPdfA4(
  seller: Contact | undefined,
  transactions: Transaction[],
  sellerMetrics: { grossTotal: number; deductionTotal: number; netTotal: number; count: number },
  settings: MarketSettings,
  printMode: 'service' | 'official' | 'thermal' = 'service',
  timeframeLabel: string = 'كافة العمليات',
  totalPaid: number = 0,
  remainingBalance?: number,
  employeeName: string = '',
  contacts: Contact[] = [],
  silent: boolean = false,
  sellerRole: 'fisherman' | 'seller' = 'fisherman'
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const html = await buildFishermanSettlementHtmlA4(
    seller,
    transactions,
    sellerMetrics,
    settings,
    printMode,
    timeframeLabel,
    totalPaid,
    remainingBalance,
    employeeName,
    contacts,
    sellerRole
  );

  const defaultRoleName = sellerRole === 'seller' ? 'البائع' : 'الصياد';
  const safeName = (seller?.name || defaultRoleName).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = printMode === 'service'
    ? `فاتورة_خدمية_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`
    : `إشعار_تصفية_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * طباعة إشعار تصفية مستحقات الصياد مباشرة بدقة متجهات A4 عالية
 */
export async function printFishermanSettlementA4Direct(
  seller: Contact | undefined,
  transactions: Transaction[],
  sellerMetrics: { grossTotal: number; deductionTotal: number; netTotal: number; count: number },
  settings: MarketSettings,
  printMode: 'service' | 'official' | 'thermal' = 'service',
  timeframeLabel: string = 'كافة العمليات',
  totalPaid: number = 0,
  remainingBalance?: number,
  employeeName: string = '',
  contacts: Contact[] = [],
  options: { silent?: boolean; deviceName?: string } = {},
  sellerRole: 'fisherman' | 'seller' = 'fisherman'
): Promise<{ success: boolean; message: string }> {
  const html = await buildFishermanSettlementHtmlA4(
    seller,
    transactions,
    sellerMetrics,
    settings,
    printMode,
    timeframeLabel,
    totalPaid,
    remainingBalance,
    employeeName,
    contacts,
    sellerRole
  );
  return await printHtmlA4Direct(html, options);
}

/**
 * إنشاء صفحة HTML رسمية لتقرير وسجل حركة العمليات والمبيعات اليومية بتنسيق A4 أنيق وألوان فاتحة هادئة
 */
export async function buildTransactionsDayReportHtmlA4(
  transactions: Transaction[],
  settings: MarketSettings,
  timeframeLabel: string = 'حركة اليوم',
  employeeName: string = '',
  contacts: Contact[] = []
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const weekdayName = getWeekdayName(Date.now(), todayFormatted);
  const reportNumber = `RPT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

  // ترتيب التقرير المطبوع فقط: تجميع فواتير كل مشتري معاً،
  // وترتيب المشترين تنازلياً حسب عدد الشروات بدون تعديل ترتيب البيانات الأصلي للنظام.
  const normalizeBuyerKey = (transaction: Transaction) => {
    const rawName = (transaction.buyerName || '').trim().replace(/\s+/g, ' ');
    return rawName || transaction.buyerId || '—';
  };
  const buyerTransactionCounts = new Map<string, number>();
  const buyerFirstIndexes = new Map<string, number>();
  transactions.forEach((transaction, index) => {
    const buyerKey = normalizeBuyerKey(transaction);
    buyerTransactionCounts.set(buyerKey, (buyerTransactionCounts.get(buyerKey) || 0) + 1);
    if (!buyerFirstIndexes.has(buyerKey)) buyerFirstIndexes.set(buyerKey, index);
  });

  const buyerRank = new Map<string, number>();
  [...buyerTransactionCounts.entries()]
    .sort((a, b) => {
      const countDifference = b[1] - a[1];
      if (countDifference !== 0) return countDifference;
      return (buyerFirstIndexes.get(a[0]) ?? 0) - (buyerFirstIndexes.get(b[0]) ?? 0);
    })
    .forEach(([buyerKey], index) => buyerRank.set(buyerKey, index));

  const sortedTransactionsForPrint = transactions
    .map((transaction, originalIndex) => ({ transaction, originalIndex }))
    .sort((a, b) => {
      const rankDifference = (buyerRank.get(normalizeBuyerKey(a.transaction)) ?? 0)
        - (buyerRank.get(normalizeBuyerKey(b.transaction)) ?? 0);
      if (rankDifference !== 0) return rankDifference;
      return a.originalIndex - b.originalIndex;
    })
    .map(({ transaction }) => transaction);

  // Aggregate Metrics
  const totalGross = transactions.reduce((sum, t) => sum + (Number(t.grossAmount) || 0), 0);
  const totalBuyerTax = transactions.reduce((sum, t) => sum + (Number(t.buyerTaxAmount) || 0), 0);
  const totalFromBuyers = transactions.reduce((sum, t) => sum + (Number(t.totalFromBuyer) || 0), 0);
  const totalSellerTax = transactions.reduce((sum, t) => sum + (Number(t.sellerTaxAmount) || 0), 0);
  const totalToSellers = transactions.reduce((sum, t) => sum + (Number(t.netToSeller) || 0), 0);
  const totalProfit = transactions.reduce((sum, t) => sum + (Number(t.harajProfit) || 0), 0);
  const trxCount = transactions.length;

  let totalQuantity = 0;
  let totalCashPaid = 0;
  let totalRemainingDebt = 0;

  transactions.forEach((t) => {
    if (t.items && t.items.length > 0) {
      t.items.forEach((it) => {
        totalQuantity += Number(it.quantity) || 0;
      });
    }

    const isDebt = t.settlementType === 'association_credit' || (t.paymentStatus as any) === 'debt' || (t.paymentStatus as any) === 'partial' || t.paymentStatus === 'pending' || ((t.buyerRemainingDebt ?? 0) > 0);
    if (isDebt) {
      totalRemainingDebt += (t.buyerRemainingDebt ?? t.totalFromBuyer ?? 0);
    } else {
      totalCashPaid += (t.totalFromBuyer || 0);
    }
  });

  // Table rows HTML
  const rowsHtml = sortedTransactionsForPrint.length === 0
    ? `<tr><td colspan="11" style="border:1px solid #cbd5e1; padding:18px; text-align:center; color:#64748b; font-weight:bold; background:#ffffff;">لا توجد عمليات مسجلة في هذا النطاق.</td></tr>`
    : sortedTransactionsForPrint.map((t, index) => {
        const timeDisplay = t.timeStr || formatGregorianTime(new Date(t.timestamp || Date.now()));
        const itemsSummary = (t.items && t.items.length > 0)
          ? t.items.map((it) => `${it.fishName} (${formatNumber(it.quantity)} ${it.unit || 'حبه'} × ${formatNumber(it.unitPrice)})`).join(' + ')
          : (t.notes || '—');

        const isDebt = t.settlementType === 'association_credit' || (t.paymentStatus as any) === 'debt' || (t.paymentStatus as any) === 'partial' || t.paymentStatus === 'pending' || ((t.buyerRemainingDebt ?? 0) > 0);
        const settlementStatusBadge = isDebt
          ? `<span style="color:#dc2626; font-weight:bold; font-size:9.5px;">آجل</span>`
          : `<span style="color:#16a34a; font-weight:bold; font-size:9.5px;">نقدي</span>`;

        return `
          <tr>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">${index + 1}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a; white-space:nowrap;">${t.id || '—'}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-size:8.5px; color:#475569;" dir="ltr">${timeDisplay}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 4px; text-align:right; font-weight:bold; color:#0f172a;">${t.sellerName || '—'}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 4px; text-align:right; font-weight:bold; color:#0f172a;">${t.buyerName || '—'}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 4px; text-align:right; font-size:8.5px; color:#334155;">${itemsSummary}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a;">${formatNumber(t.grossAmount)}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#1d4ed8;">${formatNumber(t.totalFromBuyer)}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#15803d;">${formatNumber(t.netToSeller)}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#6d28d9;">${formatNumber(t.harajProfit)}</td>
            <td style="border:1px solid #e2e8f0; padding:3px 3px; text-align:center;">${settlementStatusBadge}</td>
          </tr>
        `;
      }).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>تقرير حركة العمليات والمبيعات - ${timeframeLabel}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-size: 9.5px;
      line-height: 1.35;
      padding: 4mm 5mm;
    }
    .report-card {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
    }

    /* Top Action Bar (for browser / print preview) */
    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px;
      margin-bottom: 8px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .print-btn {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
    }

    /* Header styling - sharp & clean */
    .header-box {
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
    }
    .header-right { text-align: right; }
    .header-center {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    .header-logo {
      width: 130px;
      height: 130px;
      min-width: 130px;
      min-height: 130px;
      max-width: 130px;
      max-height: 130px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .market-title {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    .market-sub {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }
    .market-loc {
      font-size: 9.5px;
      font-weight: 700;
      color: #64748b;
      margin-top: 2px;
    }
    .doc-title-text {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 4px;
      line-height: 1.25;
      white-space: nowrap;
    }
    .doc-period {
      font-size: 10px;
      font-weight: 800;
      color: #475569;
      margin-top: 2px;
    }
    .header-left {
      direction: ltr;
      text-align: left;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .meta-tag {
      border: 2px solid #0f172a;
      background: #ffffff;
      border-radius: 8px;
      padding: 6px 14px;
      text-align: center;
      min-width: 165px;
      margin-bottom: 3px;
    }

    /* KPI Summary Cards - Gray tones, sharp edges */
    .kpi-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 8px;
    }
    .kpi-card {
      border-radius: 0px;
      padding: 6px 8px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #0f172a;
    }
    .kpi-label {
      font-size: 9.5px;
      font-weight: 800;
      color: #475569;
      display: block;
      margin-bottom: 2px;
    }
    .kpi-val {
      font-size: 13.5px;
      font-weight: 900;
      font-family: 'Segoe UI', monospace;
      color: #0f172a;
      display: block;
      line-height: 1.2;
    }
    .kpi-unit {
      font-size: 8px;
      font-weight: 700;
      color: #64748b;
    }

    /* Bottom Debt Summary Bar */
    .debt-bottom-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0px;
      padding: 6px 12px;
      margin-top: 6px;
      margin-bottom: 8px;
      font-size: 10px;
      font-weight: 800;
    }

    /* Transactions Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5px;
      margin-bottom: 6px;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    tr {
      page-break-inside: avoid;
    }
    th {
      background: #e2e8f0;
      color: #1e293b;
      font-weight: 800;
      padding: 4px 2px;
      border: 1px solid #cbd5e1;
      text-align: center;
      font-size: 8.5px;
    }
    tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    tbody tr:nth-child(odd) {
      background: #ffffff;
    }
    .tfoot-row td {
      background: #f1f5f9;
      font-weight: 900;
      border: 1.5px solid #94a3b8;
      font-size: 9px;
      padding: 4px 2px;
      color: #0f172a;
    }

    /* Signatures & Accreditation */
    .signatures-box {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid #cbd5e1;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 30px;
      text-align: center;
      font-size: 9.5px;
      font-weight: bold;
      color: #1e293b;
      page-break-inside: avoid;
    }
    .sig-line {
      border-bottom: 1px dotted #94a3b8;
      height: 18px;
      margin-top: 3px;
    }

    /* Print media */
    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card { max-width: 100%; border: none; }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة تقرير الحركة [Ctrl+P]</button>
    <span style="font-size:11px; color:#475569; font-weight:bold;">تقرير رسمي لحركة العمليات - ${settings.marketName}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header -->
    <div class="header-box">
      <div class="header-right" style="line-height: 1.35;">
        <div class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</div>
        <div class="market-sub">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</div>
        <div class="market-loc">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</div>
      </div>
      <div class="header-center">
        ${logoDataUrl ? `<img src="${logoDataUrl}" class="header-logo" alt="Logo" style="width: 120px; height: 120px; min-width: 120px; min-height: 120px; max-width: 120px; max-height: 120px; object-fit: contain; display: block; margin: 0 auto;" />` : ''}
        <div class="doc-title-text" style="font-size: 15px; font-weight: 900; color: #0f172a; margin-top: 4px; text-align: center; white-space: nowrap;">سجل حركة العمليات والمبيعات</div>
        <div class="doc-period" style="font-size: 10px; font-weight: 800; color: #475569; margin-top: 2px;">${timeframeLabel}</div>
      </div>
      <div class="header-left" style="direction: ltr; text-align: left; line-height: 1.35; font-family: sans-serif;">
        <h2 style="font-size: 13.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25;">Ain Bamaabad Central Market</h2>
        <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 3px 0 0 0;">For Fresh Fish, Vegetables & Fruits</p>
        <p style="font-size: 9.5px; font-weight: 600; color: #64748b; margin: 3px 0 0 0;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
      </div>
    </div>

    <!-- Unified Document & Metadata Bar -->
    <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #0f172a; color: #ffffff; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 900;">تقرير العمليات اليومي</span>
        <div style="border: 1.5px solid #0f172a; padding: 2px 10px; border-radius: 4px; background: #ffffff;">
          <span style="font-size: 10.5px; font-weight: 800; color: #475569; margin-left: 4px;">رقم السجل:</span>
          <span style="font-size: 14px; font-weight: 900; color: #0f172a; font-family: monospace;">${reportNumber}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #475569; font-weight: 700; font-family: monospace;">
        <div>التاريخ: <b style="color: #0f172a;">${weekdayName} ${todayFormatted} م</b></div>
        <div>الوقت: <b style="color: #0f172a;">${nowTime}</b></div>
      </div>
    </div>

    <!-- Executive KPI Financial Summary Cards (Gray with sharp edges) -->
    <div class="kpi-container">
      <div class="kpi-card">
        <span class="kpi-label">الإجمالي الأساسي</span>
        <span class="kpi-val">${formatNumber(totalGross)}</span>
        <span class="kpi-unit">${settings.currency}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">مطلوب المشترين (+2%)</span>
        <span class="kpi-val">${formatNumber(totalFromBuyers)}</span>
        <span class="kpi-unit">${settings.currency}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">صافي الصيادين (-3%)</span>
        <span class="kpi-val">${formatNumber(totalToSellers)}</span>
        <span class="kpi-unit">${settings.currency}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">دخل وعمولة الحراج (5%)</span>
        <span class="kpi-val">${formatNumber(totalProfit)}</span>
        <span class="kpi-unit">${settings.currency}</span>
      </div>
    </div>

    <!-- Itemized Transactions Table -->
    <table>
      <thead>
        <tr>
          <th style="width:3%;">#</th>
          <th style="width:10%;">رقم الفاتورة</th>
          <th style="width:6%;">الوقت</th>
          <th style="width:13%;">الصياد (البائع)</th>
          <th style="width:13%;">المشتري</th>
          <th style="width:18%;">تفاصيل الأصناف والكميات</th>
          <th style="width:8%;">الأساسي</th>
          <th style="width:8%;">المطلوب (+2%)</th>
          <th style="width:8%;">الصافي (-3%)</th>
          <th style="width:7%;">عمولة الحراج</th>
          <th style="width:6%;">التسوية</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="5" style="text-align:right; padding-right:6px;">الإجمالي الكلي (${trxCount} شروة):</td>
          <td style="text-align:center;">—</td>
          <td style="text-align:center; font-family:monospace;">${formatNumber(totalGross)}</td>
          <td style="text-align:center; font-family:monospace; color:#1e40af;">${formatNumber(totalFromBuyers)}</td>
          <td style="text-align:center; font-family:monospace; color:#065f46;">${formatNumber(totalToSellers)}</td>
          <td style="text-align:center; font-family:monospace; color:#6d28d9;">${formatNumber(totalProfit)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>

    <!-- Bottom Debt Summary Box -->
    <div class="debt-bottom-bar">
      <div style="color:#334155;">
        <span>عدد الفواتير / الشروات: </span><strong style="color:#0f172a;">${trxCount} شروة</strong>
      </div>
      <div style="color:#dc2626; font-size:11px; font-weight:900;">
        <span>المتبقي (آجل): </span><span style="font-family:'Segoe UI',monospace;">${formatCurrency(totalRemainingDebt, settings.currency)}</span>
      </div>
    </div>

    <!-- Signatures and Verification -->
    <div style="margin-top: 18px; padding-top: 12px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 11.5px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">المحاسب / مسؤول الحركة:</span>
        <div style="font-weight:900; margin-top:2px; font-size:10px;">${(employeeName || settings.employeeName) ? (employeeName || settings.employeeName) : '<div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>'}</div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 10.5px; color: #64748b;">ختم السوق الرسمي</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 8.5px; margin: 0 auto;">ختم السوق</div>
      </div>
      <div>
        <span>مدير الحراج / اعتماد الإدارة:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 30px; margin: 0 10px;"></div>
      </div>
    </div>

    <!-- Micro Footer -->
    <div style="display:flex; justify-content:space-between; align-items:center; font-size:8px; color:#64748b; margin-top:6px; padding-top:3px; border-top:1px solid #e2e8f0;">
      <div>نظام إدارة سوق الحراج للأسماك الطازجة والخضروات والفواكة © ${new Date().getFullYear()}</div>
      <div>صفحة 1 من 1</div>
      <div dir="ltr">${nowTime} - ${todayFormatted}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير تقرير حركة العمليات والمبيعات اليومية كملف PDF رسمي بحجم A4
 */
export async function exportTransactionsDayReportPdfA4(
  transactions: Transaction[],
  settings: MarketSettings,
  timeframeLabel: string = 'حركة اليوم',
  employeeName: string = '',
  contacts: Contact[] = [],
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string }> {
  const html = await buildTransactionsDayReportHtmlA4(
    transactions,
    settings,
    timeframeLabel,
    employeeName,
    contacts
  );

  const cleanLabel = timeframeLabel.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');
  const filename = `تقرير_حركة_العمليات_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;

  return await exportHtmlToPdfA4(html, filename, silent);
}

export async function printTransactionsDayReportA4Direct(
  transactions: Transaction[],
  settings: MarketSettings,
  timeframeLabel: string = 'حركة اليوم',
  employeeName: string = '',
  contacts: Contact[] = [],
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const html = await buildTransactionsDayReportHtmlA4(
    transactions,
    settings,
    timeframeLabel,
    employeeName,
    contacts
  );
  return await printHtmlA4Direct(html, options);
}
/**
 * إنشاء صفحة HTML رسمية لسند القبض المالي (سداد دين / توريد نقدي) بدقة A4
 * تتضمن نسختين متطابقتين رسميّتين في ورقة واحدة (نسخة المشتري المسدد + نسخة الإدارة والحسابات) مع خط قص
 */
export async function buildReceiptVoucherHtmlA4(
  entry: CashEntry,
  settings: MarketSettings,
  buyerName?: string,
  customTitle: string = 'سند قبض مالي (سداد دين)'
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const payer = buyerName || entry.contactName || 'المشتري';

  function renderSlip(copyTitle: string) {
    return `
    <div class="voucher-slip" style="border: 2px solid #0f172a; border-radius: 10px; padding: 10px 14px; background: #ffffff; position: relative; box-sizing: border-box; font-family: 'Cairo', system-ui, -apple-system, sans-serif;">
      <!-- Watermark Logo -->
      <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; opacity: 0.035; z-index: 0;">
        <img src="${logoDataUrl}" style="width: 180px; height: 180px; object-fit: contain;" alt="" />
      </div>

      <div style="position: relative; z-index: 1;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 8px;">
          <!-- Right side: Identity & Logo -->
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${logoDataUrl}" style="width: 52px; height: 52px; object-fit: contain; flex-shrink: 0;" alt="شعار" />
            <div>
              <h2 style="font-size: 15px; font-weight: 900; margin: 0; color: #0f172a; line-height: 1.2;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h2>
              <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 2px 0 0 0;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
              <p style="font-size: 9px; color: #64748b; margin: 2px 0 0 0;">${settings.location || 'م/شبوة - رضوم - عين بامعبد'}${settings.contactPhone ? ` | هاتف: ${settings.contactPhone}` : ''}</p>
            </div>
          </div>
          
          <!-- Center: Voucher Title Banner -->
          <div style="text-align: center;">
            <div style="background: #0f172a; color: #ffffff; padding: 4px 14px; border-radius: 6px; font-weight: 900; font-size: 13.5px; letter-spacing: 0.5px; display: inline-block;">
              ${customTitle}
            </div>
            <div style="margin-top: 2px; font-size: 9.5px; font-weight: 800; color: #047857;">
              ● ${copyTitle}
            </div>
          </div>

          <!-- Left side: Voucher Meta & Number -->
          <div style="text-align: left; font-family: 'Cairo', monospace; flex-shrink: 0;">
            <div style="border: 1.5px solid #047857; background: #ecfdf5; padding: 3px 8px; border-radius: 6px; text-align: center; margin-bottom: 3px;">
              <span style="font-size: 8.5px; font-weight: 800; color: #065f46; display: block;">رقم السند</span>
              <span style="font-size: 13px; font-weight: 900; color: #047857; letter-spacing: 0.5px;">${entry.id}</span>
            </div>
            <div style="font-size: 9.5px; font-weight: 700; color: #475569; line-height: 1.35; text-align: center;">
              <div>التاريخ: <b style="color: #0f172a;">${entry.dateStr || ''}</b></div>
              <div>الوقت: <b style="color: #0f172a;">${entry.timeStr || ''}</b></div>
              ${settings.employeeName ? `<div>الموظف: <b style="color: #0f172a;">${settings.employeeName}</b></div>` : ''}
            </div>
          </div>
        </div>

        <!-- Amount Box & Tafqeet -->
        <div style="display: flex; gap: 8px; align-items: stretch; margin-bottom: 8px;">
          <!-- Digits Amount Box -->
          <div style="border: 2px solid #059669; background: #ecfdf5; border-radius: 8px; padding: 6px 12px; text-align: center; min-width: 180px; flex-shrink: 0;">
            <span style="font-size: 9px; font-weight: 800; color: #065f46; display: block; margin-bottom: 2px;">المبلغ المقبوض</span>
            <span style="font-size: 19px; font-weight: 900; color: #064e3b; font-family: monospace;">${formatCurrency(entry.amount, settings.currency)}</span>
          </div>
          <!-- Tafqeet Box -->
          <div style="flex: 1; border: 1.5px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 5px 10px; display: flex; flex-direction: column; justify-content: center;">
            <span style="font-size: 9px; font-weight: 700; color: #64748b;">المبلغ كتابة بالحروف:</span>
            <span style="font-size: 11.5px; font-weight: 800; color: #0f172a; line-height: 1.35;">فقط ${tafqeet(entry.amount, settings.currency)}</span>
          </div>
        </div>

        <!-- Receipt Details Table -->
        <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 7px 10px; margin-bottom: 8px; font-size: 11px; line-height: 1.5;">
          <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; margin-bottom: 4px;">
            <div>
              <span style="color: #64748b; font-weight: 700;">استلمنا من الأخ / المشتري:</span>
              <strong style="color: #0f172a; font-size: 12.5px; margin-right: 6px;">${payer}</strong>
            </div>
            <div>
              <span style="color: #64748b; font-weight: 700;">طريقة التحصيل:</span>
              <strong style="color: #065f46; margin-right: 4px;">نقداً (صندوق الإدارة)</strong>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <div>
              <span style="color: #64748b; font-weight: 700;">وذلك مقابل / عن:</span>
              <span style="color: #0f172a; font-weight: 700; margin-right: 6px;">${entry.description || 'سداد دين مالي وقيد دفعة في الحساب'}</span>
            </div>
            <div style="font-size: 9.5px; color: #059669; font-weight: 800;">
              ✓ إشعار قيد مالي معتمد بالخزينة
            </div>
          </div>
        </div>

        <!-- Signatures & Official Stamp -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center; padding-top: 4px; font-size: 10.5px;">
          <div>
            <span style="color: #475569; font-weight: 700; display: block; margin-bottom: 18px;">توقيع المسدد (المشتري):</span>
            <div style="border-bottom: 1.5px dashed #94a3b8; width: 75%; margin: 0 auto;"></div>
          </div>
          <div>
            <span style="color: #475569; font-weight: 700; display: block; margin-bottom: 2px;">أمين الصندوق / المستلم:</span>
            <div style="font-weight: 900; color: #0f172a; margin-bottom: 2px; font-size: 11px;">${settings.employeeName || entry.performedBy || 'أمين الصندوق'}</div>
            <div style="border-bottom: 1.5px dashed #94a3b8; width: 75%; margin: 0 auto;"></div>
          </div>
          <div>
            <span style="color: #475569; font-weight: 700; display: block; margin-bottom: 2px;">اعتماد الإدارة والختم:</span>
            <div style="border: 1px dashed #94a3b8; border-radius: 6px; height: 32px; width: 80px; margin: 0 auto; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 8.5px;">موضع الختم</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${customTitle} - ${entry.id} - ${payer}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 5mm 6mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      padding: 0;
      margin: 0;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media print {
      body {
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print {
        display: none !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div id="a4-invoice-render" style="position: relative; width: 100%; max-width: 100%; box-sizing: border-box; padding: 2mm 0;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Copy 1: Customer Copy (نسخة المشتري المسدد) -->
    ${renderSlip('النسخة الأصلية (المشتري / المسدد)')}

    <!-- Cut Line -->
    <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 8px 0; color: #94a3b8; font-size: 9.5px; font-weight: 700;">
      <span style="flex: 1; border-bottom: 1.5px dashed #94a3b8;"></span>
      <span>✂ قص من هنا (فصل نسخة المشتري عن نسخة الإدارة)</span>
      <span style="flex: 1; border-bottom: 1.5px dashed #94a3b8;"></span>
    </div>

    <!-- Copy 2: Accounts / Archive Copy (نسخة الإدارة والحسابات) -->
    ${renderSlip('نسخة الإدارة والحسابات (الأرشيف)')}
  </div>
</body>
</html>`;
}

/**
 * طباعة سند القبض المالي مباشرة بدقة متجهات A4 عالية (نسختان للورقة)
 */
export async function printReceiptVoucherA4Direct(
  entry: CashEntry,
  settings: MarketSettings,
  buyerName?: string,
  customTitle: string = 'سند قبض مالي (سداد دين)',
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const html = await buildReceiptVoucherHtmlA4(entry, settings, buyerName, customTitle);
  return await printHtmlA4Direct(html, options);
}

/**
 * تصدير سند القبض المالي كملف PDF رسمي بحجم A4
 */
export async function exportReceiptVoucherPdfA4(
  entry: CashEntry,
  settings: MarketSettings,
  buyerName?: string,
  customTitle: string = 'سند قبض مالي (سداد دين)',
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string }> {
  const html = await buildReceiptVoucherHtmlA4(entry, settings, buyerName, customTitle);
  const payer = (buyerName || entry.contactName || 'مشتري').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const filename = `سند_قبض_${entry.id}_${payer}_${entry.dateStr || ''}.pdf`;
  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * إنشاء مستند HTML رسمي عالي الدقة A4 لتقرير وتحليل أرباح الجمعية والحراج
 * يدعم التقرير الشامل لكافة الأيام، أو تقريراً تفصيلياً مخصصاً ليوم محدد
 * مع تضمين الشعار الرسمي في المنتصف وبيانات الحراج وكافة الجداول والعمولات
 */
export async function buildAssociationProfitHtmlA4(
  transactions: Transaction[],
  settings: MarketSettings,
  targetDateStr?: string
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const reportNumber = `PRF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

  const isSpecificDay = Boolean(targetDateStr && targetDateStr !== 'all');

  // Filter transactions if specific day requested
  const filteredTrx = isSpecificDay
    ? transactions.filter(
        (t) =>
          t.dateStr === targetDateStr ||
          isSameCalendarDay(t.dateStr || t.timestamp, targetDateStr!)
      )
    : transactions;

  // Aggregate metrics
  const totalGross = filteredTrx.reduce((sum, t) => sum + (Number(t.grossAmount) || 0), 0);
  const totalBuyerTax = filteredTrx.reduce((sum, t) => sum + (Number(t.buyerTaxAmount) || 0), 0);
  const totalSellerTax = filteredTrx.reduce((sum, t) => sum + (Number(t.sellerTaxAmount) || 0), 0);
  const totalProfit = filteredTrx.reduce((sum, t) => sum + (Number(t.harajProfit) || 0), 0);
  const totalDeals = filteredTrx.length;

  // Fish Species Breakdown
  const speciesMap = new Map<
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

  filteredTrx.forEach((t) => {
    (t.items || []).forEach((item) => {
      const name = item.fishName || 'صنف غير محدد';
      const existing = speciesMap.get(name) || {
        fishName: name,
        dealsCount: 0,
        quantity: 0,
        unit: item.unit || 'حبه',
        totalGross: 0,
        estimatedProfit: 0,
      };
      existing.dealsCount += 1;
      existing.quantity += Number(item.quantity) || 0;
      existing.totalGross += Number(item.totalGross) || 0;
      const profit = (Number(item.totalGross) || 0) * (settings.buyerTaxRate + settings.sellerTaxRate);
      existing.estimatedProfit += profit;
      speciesMap.set(name, existing);
    });
  });
  const speciesList = Array.from(speciesMap.values()).sort(
    (a, b) => b.estimatedProfit - a.estimatedProfit
  );

  // Group Daily History (for multi-day view)
  const dailyMap = new Map<
    string,
    {
      dateStr: string;
      timestamp: number;
      count: number;
      gross: number;
      buyerComm: number;
      sellerComm: number;
      totalProfit: number;
    }
  >();

  transactions.forEach((t) => {
    const dayKey = t.dateStr || 'تاريخ غير محدد';
    const ex = dailyMap.get(dayKey) || {
      dateStr: dayKey,
      timestamp: t.timestamp || 0,
      count: 0,
      gross: 0,
      buyerComm: 0,
      sellerComm: 0,
      totalProfit: 0,
    };
    ex.count += 1;
    ex.gross += Number(t.grossAmount) || 0;
    ex.buyerComm += Number(t.buyerTaxAmount) || 0;
    ex.sellerComm += Number(t.sellerTaxAmount) || 0;
    ex.totalProfit += Number(t.harajProfit) || 0;
    if (t.timestamp && t.timestamp > ex.timestamp) ex.timestamp = t.timestamp;
    dailyMap.set(dayKey, ex);
  });
  const dailyList = Array.from(dailyMap.values()).sort((a, b) => b.timestamp - a.timestamp);

  // Day label if single day
  let dayLabel = '';
  if (isSpecificDay) {
    const sampleTrx = filteredTrx[0];
    dayLabel = formatArabicDayOnly(targetDateStr!, sampleTrx?.timestamp);
  }

  const docTitle = isSpecificDay
    ? `تقرير وتحليل أرباح الجمعية والحراج - ليوم ${dayLabel}`
    : `تقرير وتحليل أرباح الجمعية والحراج (سجل يوماً بيوم)`;

  const docSubTitle = isSpecificDay
    ? `تاريخ اليوم: ${targetDateStr} | عدد الصفقات: ${totalDeals} شروات`
    : `سجل حركة الأرباح اليومية على مدار ${dailyList.length} أيام (${transactions.length} شروة)`;

  // Single Day Transactions Table Rows
  const transactionsRowsHtml = filteredTrx.length === 0
    ? `<tr><td colspan="10" style="border:1px solid #cbd5e1; padding:12px; text-align:center; color:#64748b; font-weight:bold;">لا توجد صفقات مسجلة لهذا اليوم.</td></tr>`
    : filteredTrx.map((t, idx) => {
        const timeDisplay = t.timeStr || formatGregorianTime(t.timestamp) || '—';
        const itemsSummary = (t.items && t.items.length > 0)
          ? t.items.map((it) => `${it.fishName} (${formatNumber(it.quantity)} ${it.unit || 'حبه'})`).join(' + ')
          : (t.notes || '—');

        return `
          <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
            <td style="border:1px solid #e2e8f0; padding:4px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">${idx + 1}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a; white-space:nowrap;">${t.id}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 3px; text-align:center; font-family:monospace; font-size:9px; color:#475569;">${timeDisplay}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 5px; text-align:right; font-weight:bold; color:#0f172a;">${t.sellerName || '—'}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 5px; text-align:right; font-weight:bold; color:#0f172a;">${t.buyerName || '—'}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 5px; text-align:right; font-size:9px; color:#334155;">${itemsSummary}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a;">${formatNumber(t.grossAmount)}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#1d4ed8;">${formatNumber(t.buyerTaxAmount)}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#15803d;">${formatNumber(t.sellerTaxAmount)}</td>
            <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:900; color:#1e40af; background:#eff6ff;">${formatNumber(t.harajProfit)}</td>
          </tr>
        `;
      }).join('');

  // Multi-day Daily History Table Rows
  const dailyHistoryRowsHtml = dailyList.length === 0
    ? `<tr><td colspan="7" style="border:1px solid #cbd5e1; padding:12px; text-align:center; color:#64748b; font-weight:bold;">لا توجد سجلات أرباح مسجلة.</td></tr>`
    : dailyList.map((d, idx) => {
        const dLabel = formatArabicDayOnly(d.dateStr, d.timestamp);
        return `
          <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
            <td style="border:1px solid #e2e8f0; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">${idx + 1}</td>
            <td style="border:1px solid #e2e8f0; padding:5px 6px; text-align:right; font-weight:bold; color:#0f172a;">
              <div>${dLabel}</div>
              <div style="font-size:9px; color:#64748b; font-family:monospace;">${d.dateStr}</div>
            </td>
            <td style="border:1px solid #e2e8f0; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a;">${d.count}</td>
            <td style="border:1px solid #e2e8f0; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a;">${formatCurrency(d.gross, settings.currency)}</td>
            <td style="border:1px solid #e2e8f0; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#1d4ed8;">${formatCurrency(d.buyerComm, settings.currency)}</td>
            <td style="border:1px solid #e2e8f0; padding:5px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#15803d;">${formatCurrency(d.sellerComm, settings.currency)}</td>
            <td style="border:1px solid #e2e8f0; padding:5px 6px; text-align:center; font-family:monospace; font-weight:900; color:#1e40af; background:#eff6ff; font-size:11px;">${formatCurrency(d.totalProfit, settings.currency)}</td>
          </tr>
        `;
      }).join('');

  // Species Table Rows
  const speciesRowsHtml = speciesList.length === 0
    ? `<tr><td colspan="6" style="border:1px solid #cbd5e1; padding:10px; text-align:center; color:#64748b; font-weight:bold;">لا توجد أصناف مسجلة.</td></tr>`
    : speciesList.map((s, idx) => `
        <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
          <td style="border:1px solid #e2e8f0; padding:4px 3px; text-align:center; font-family:monospace; font-weight:bold; color:#64748b;">${idx + 1}</td>
          <td style="border:1px solid #e2e8f0; padding:4px 6px; text-align:right; font-weight:bold; color:#0f172a;">${s.fishName}</td>
          <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold;">${s.dealsCount}</td>
          <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold;">${formatNumber(s.quantity)} ${s.unit}</td>
          <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:bold; color:#0f172a;">${formatCurrency(s.totalGross, settings.currency)}</td>
          <td style="border:1px solid #e2e8f0; padding:4px 4px; text-align:center; font-family:monospace; font-weight:900; color:#1e40af; background:#eff6ff;">${formatCurrency(s.estimatedProfit, settings.currency)}</td>
        </tr>
      `).join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${docTitle} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-size: 10px;
      line-height: 1.35;
      padding: 4mm 5mm;
      -webkit-font-smoothing: antialiased;
    }
    .report-card {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
    }
    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      margin-bottom: 10px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .print-btn {
      background: #0284c7;
      color: #ffffff;
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 11px;
      cursor: pointer;
    }
    .print-btn:hover { background: #0369a1; }

    /* Header styling matching official invoice standard */
    .header-box {
      border: 2px solid #0f172a;
      border-radius: 10px;
      padding: 10px 14px;
      background: #f8fafc;
      margin-bottom: 10px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
    }
    .header-right { text-align: right; }
    .market-title {
      font-size: 20px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    .market-sub {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
    }
    .market-loc {
      font-size: 9.5px;
      font-weight: 600;
      color: #64748b;
      margin-top: 3px;
    }
    .header-center {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    .header-logo {
      width: 130px;
      height: 130px;
      min-width: 130px;
      min-height: 130px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .doc-title-text {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
      margin-top: 4px;
      line-height: 1.3;
    }
    .doc-period {
      font-size: 9.5px;
      font-weight: 700;
      color: #475569;
      margin-top: 1px;
    }
    .header-left {
      direction: ltr;
      text-align: left;
    }
    .meta-box {
      border: 2px solid #0f172a;
      background: #ffffff;
      border-radius: 8px;
      padding: 5px 12px;
      display: inline-block;
      text-align: center;
      min-width: 160px;
    }

    /* KPI Summary Cards */
    .kpi-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 10px;
    }
    .kpi-card {
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
    }
    .kpi-card.highlight {
      background: #eff6ff;
      border: 1.5px solid #3b82f6;
    }
    .kpi-label {
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 3px;
      display: block;
    }
    .kpi-card.highlight .kpi-label { color: #1d4ed8; }
    .kpi-val {
      font-size: 13px;
      font-weight: 900;
      font-family: monospace;
      color: #0f172a;
      display: block;
    }
    .kpi-card.highlight .kpi-val {
      color: #1e40af;
      font-size: 15px;
    }
    .kpi-sub {
      font-size: 8px;
      color: #94a3b8;
      display: block;
      margin-top: 2px;
    }

    /* Section Headings */
    .section-title {
      font-size: 11px;
      font-weight: 900;
      color: #0f172a;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      border-radius: 6px 6px 0 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
    }

    /* Data Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      font-size: 9px;
    }
    th {
      background: #f8fafc;
      color: #334155;
      padding: 5px 4px;
      border: 1px solid #cbd5e1;
      font-weight: 800;
      font-size: 9px;
      text-align: center;
    }
    td {
      padding: 4px;
    }

    /* Signatures Section */
    .signatures-box {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      text-align: center;
      font-size: 10px;
      font-weight: bold;
      border-top: 1px solid #cbd5e1;
      padding-top: 14px;
      margin-top: 12px;
      page-break-inside: avoid;
    }
    .sig-line {
      border-bottom: 1.5px dashed #94a3b8;
      height: 30px;
      margin-top: 4px;
    }

    @media print {
      html, body {
        background: #ffffff !important;
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card { border: none; box-shadow: none; padding: 0 8px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
      *, *::before, *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="print-btn" onclick="window.print()">🖨️ طباعة التقرير [Ctrl+P]</button>
    <span style="font-size:11px; color:#64748b; font-weight:bold;">
      ${settings.marketName || 'سوق عين بامعبد المركزي'} | تقرير الأرباح المعتمد
    </span>
  </div>

    ${INVOICE_MARGIN_CREDIT_HTML}
    <!-- Header matching unified standard -->
    <div style="border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 14px;">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;">
        <!-- Right: Market Info (Arabic) -->
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 style="font-size: 18.5px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p style="font-size: 12px; font-weight: 800; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size: 10.5px; font-weight: 700; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ' | جوال: 782191112'}</p>
        </div>

        <!-- Center: Fixed Size Logo Exactly in Dead Center -->
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 4px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 115px; height: 115px; min-width: 115px; min-height: 115px; max-width: 115px; max-height: 115px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="margin-top: 4px; font-size: 14.5px; font-weight: 900; color: #0f172a; text-align: center; letter-spacing: -0.2px; white-space: nowrap;">
            ${docTitle}
          </div>
        </div>

        <!-- Left: English Market Info (LTR) -->
        <div style="text-align: left; direction: ltr; line-height: 1.35; font-family: sans-serif; min-width: 0;">
          <h2 style="font-size: 13px; font-weight: 900; color: #0f172a; margin: 0; line-height: 1.25; white-space: nowrap;">Ain Bamaabad Central Market</h2>
          <p style="font-size: 10.5px; font-weight: 700; color: #334155; margin: 3px 0 0 0; white-space: nowrap;">For Fresh Fish, Vegetables & Fruits</p>
          <p style="font-size: 9.5px; font-weight: 600; color: #64748b; margin: 3px 0 0 0; white-space: nowrap;">Shabwa'a - Radoum - Ain Bamaabad | Mob: ${settings.contactPhone || '782191112'}</p>
        </div>
      </div>
    </div>

    <!-- Unified Document & Metadata Bar -->
    <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #0f172a; color: #ffffff; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 900;">كشف أرباح الجمعية والحراج</span>
        <div style="border: 1.5px solid #0f172a; padding: 2px 10px; border-radius: 4px; background: #ffffff;">
          <span style="font-size: 10.5px; font-weight: 800; color: #475569; margin-left: 4px;">رقم الكشف:</span>
          <span style="font-size: 14px; font-weight: 900; color: #0f172a; font-family: monospace;">${reportNumber}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; font-size: 11px; color: #475569; font-weight: 700; font-family: monospace;">
        <div>تاريخ الإصدار: <b style="color: #0f172a;">${todayFormatted}</b></div>
        <div>وقت الإصدار: <b style="color: #0f172a;">${nowTime}</b></div>
        ${isSpecificDay ? `<div style="background: #eff6ff; padding: 2px 8px; border-radius: 4px;">يومية: <b style="color: #0284c7;">${targetDateStr}</b></div>` : ''}
      </div>
    </div>

    <!-- KPI Summary Cards -->
    <div class="kpi-container">
      <div class="kpi-card highlight">
        <span class="kpi-label">صافي أرباح الجمعية والحراج</span>
        <span class="kpi-val">${formatCurrency(totalProfit, settings.currency)}</span>
        <span class="kpi-sub">إجمالي نسبة الـ 5% (2% مشتري + 3% بائع)</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">عمولة المشترين (2%)</span>
        <span class="kpi-val">${formatCurrency(totalBuyerTax, settings.currency)}</span>
        <span class="kpi-sub">+2% محصلة من المشترين</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">خصم الصيادين (3%)</span>
        <span class="kpi-val">${formatCurrency(totalSellerTax, settings.currency)}</span>
        <span class="kpi-sub">-3% مستقطعة من مبيعات الصيادين</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">الإجمالي الأساسي</span>
        <span class="kpi-val">${formatCurrency(totalGross, settings.currency)}</span>
        <span class="kpi-sub">${totalDeals} شروات وعمليات</span>
      </div>
    </div>

    ${
      isSpecificDay
        ? `
      <!-- Single Day Specific View -->
      <div class="section-title">
        <span>سجل عمليات وشروات اليوم التفصيلي (${filteredTrx.length} شروات)</span>
        <span style="font-family:monospace; font-size:9.5px; color:#1e40af;">صافي ربح اليوم: ${formatCurrency(totalProfit, settings.currency)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:25px;">م</th>
            <th style="width:65px;">رقم العملية</th>
            <th style="width:45px;">الوقت</th>
            <th>الصياد / البائع</th>
            <th>المشتري</th>
            <th style="width:25%;">بيان الأسماك / الشروة</th>
            <th style="width:70px;">القيمة الأساسية</th>
            <th style="width:65px;">عمولة مشتري 2%</th>
            <th style="width:65px;">خصم صياد 3%</th>
            <th style="width:75px; background:#dbeafe; color:#1e40af;">صافي ربح 5%</th>
          </tr>
        </thead>
        <tbody>
          ${transactionsRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:900;">
            <td colspan="6" style="border:1px solid #cbd5e1; padding:5px 8px; text-align:right;">الإجمالي الكلي لعمليات اليوم:</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace;">${formatCurrency(totalGross, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#1d4ed8;">${formatCurrency(totalBuyerTax, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#15803d;">${formatCurrency(totalSellerTax, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#1e40af; background:#dbeafe; font-size:11px;">${formatCurrency(totalProfit, settings.currency)}</td>
          </tr>
        </tfoot>
      </table>
        `
        : `
      <!-- Multi-Day Comprehensive View (Day by Day) -->
      <div class="section-title">
        <span>سجل توزيع أرباح الجمعية والحراج يوماً بيوم (${dailyList.length} أيام)</span>
        <span style="font-family:monospace; font-size:9.5px; color:#1e40af;">إجمالي الأرباح: ${formatCurrency(totalProfit, settings.currency)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:30px;">م</th>
            <th style="text-align:right;">اليوم والتاريخ</th>
            <th style="width:65px;">عدد الشروات</th>
            <th style="width:110px;">الإجمالي الأساسي</th>
            <th style="width:95px;">عمولة المشترين (2%)</th>
            <th style="width:95px;">خصم الصيادين (3%)</th>
            <th style="width:120px; background:#dbeafe; color:#1e40af;">صافي ربح الجمعية (5%)</th>
          </tr>
        </thead>
        <tbody>
          ${dailyHistoryRowsHtml}
        </tbody>
        <tfoot>
          <tr style="background:#f1f5f9; font-weight:900;">
            <td colspan="2" style="border:1px solid #cbd5e1; padding:6px 8px; text-align:right;">المجموع الإجمالي لكافة الأيام:</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace;">${transactions.length}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace;">${formatCurrency(totalGross, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#1d4ed8;">${formatCurrency(totalBuyerTax, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#15803d;">${formatCurrency(totalSellerTax, settings.currency)}</td>
            <td style="border:1px solid #cbd5e1; text-align:center; font-family:monospace; color:#1e40af; background:#dbeafe; font-size:11px;">${formatCurrency(totalProfit, settings.currency)}</td>
          </tr>
        </tfoot>
      </table>
        `
    }

    <!-- Official Signatures & Seal -->
    <div style="margin-top: 22px; padding-top: 14px; border-top: 1.5px solid #cbd5e1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; text-align: center; font-size: 12px; font-weight: 800; color: #334155;">
      <div>
        <span style="display: block; margin-bottom: 4px;">المحاسب / أمين الصندوق:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
        ${settings.employeeName ? `<div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 4px;">(${settings.employeeName})</div>` : ''}
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <span style="display: block; margin-bottom: 4px; font-size: 11px; color: #64748b;">ختم السوق والجمعية</span>
        <div style="border: 1.5px dashed #94a3b8; border-radius: 50%; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 9px; margin: 0 auto;">ختم الإدارة</div>
      </div>
      <div>
        <span style="display: block; margin-bottom: 4px;">مدير الجمعية والحراج:</span>
        <div style="border-bottom: 1.5px dashed #94a3b8; height: 32px; margin: 0 12px;"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * طباعة تقرير أرباح الجمعية والحراج مباشرة بدقة المتجهات النقية A4
 * (يدعم طباعة التقرير الشامل أو تقرير مخصص ليوم محدد)
 */
export async function printAssociationProfitA4Direct(
  transactions: Transaction[],
  settings: MarketSettings,
  targetDateStr?: string,
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const html = await buildAssociationProfitHtmlA4(transactions, settings, targetDateStr);
  return await printHtmlA4Direct(html, options);
}

/**
 * تصدير تقرير وتحليل أرباح الجمعية والحراج كملف PDF رسمي عالي الدقة A4
 * (يدعم تصدير التقرير الشامل أو تصدير تقرير مخصص ليوم محدد)
 */
export async function exportAssociationProfitPdfA4(
  transactions: Transaction[],
  settings: MarketSettings,
  targetDateStr?: string,
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string }> {
  const html = await buildAssociationProfitHtmlA4(transactions, settings, targetDateStr);
  const dateSuffix = targetDateStr ? `_${targetDateStr}` : `_شامل_${new Date().toISOString().slice(0, 10)}`;
  const filename = `تقرير_ارباح_الجمعية${dateSuffix}.pdf`;
  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * بناء صفحة HTML رسمية لسند صرف نقدية (تسليم مستحقات صياد / بائع) بحجم A4
 */
export async function buildFishermanPayoutVoucherHtmlA4(
  payout: CashEntry,
  settings: MarketSettings,
  context?: {
    seller?: Contact | null;
    allSellerNetTotal?: number;
    totalSellerPayouts?: number;
    remainingSellerBalance?: number;
  }
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const seller = context?.seller;
  const isFishermanRole = (seller?.role || 'fisherman') === 'fisherman';
  const roleLabel = isFishermanRole ? 'الصياد' : 'البائع';
  const beneficiaryName = payout.contactName || seller?.name || 'غير محدد';
  const todayFormatted = payout.dateStr || formatGregorianDate(new Date());
  const nowTime = payout.timeStr || formatGregorianTime(new Date());
  const voucherId = payout.id || `CSH-${Date.now()}`;
  const allNet = context?.allSellerNetTotal ?? payout.amount;
  const totalPaid = context?.totalSellerPayouts ?? payout.amount;
  const remaining = context?.remainingSellerBalance ?? 0;
  const payoutMethodStr =
    payout.payoutMethod === 'exchange' || payout.exchangeName
      ? `عبر الصرافة (${payout.exchangeName || 'حوالة صرافة معتمدة'})`
      : 'نقداً من خزينة صندوق الحراج (كاش)';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>سند صرف نقدية - ${beneficiaryName} - ${voucherId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: 'Cairo', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      background: #ffffff;
      color: #0f172a;
      font-size: 11px;
      line-height: 1.4;
      padding: 6mm 8mm;
    }
    .report-card {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      position: relative;
    }

    .top-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 14px;
      margin-bottom: 12px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
    }
    .print-btn {
      background: #059669;
      color: #ffffff;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11.5px;
      cursor: pointer;
    }

    .header-box {
      border: 2px solid #0f172a;
      border-radius: 8px;
      padding: 12px 16px;
      background: #f8fafc;
      margin-bottom: 12px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 16px;
    }
    .header-right { text-align: right; }
    .header-center {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    .header-logo {
      width: 110px;
      height: 110px;
      min-width: 110px;
      min-height: 110px;
      max-width: 110px;
      max-height: 110px;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }
    .market-title {
      font-size: 19px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.2;
    }
    .market-sub {
      font-size: 11.5px;
      color: #475569;
      font-weight: bold;
    }
    .header-meta-text {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
    }
    .doc-badge {
      display: inline-block;
      margin-top: 5px;
      padding: 4px 14px;
      background: #0f172a;
      color: #ffffff;
      border-radius: 6px;
      font-weight: 900;
      font-size: 13px;
      letter-spacing: 0.3px;
    }
    .header-left {
      direction: ltr;
      text-align: left;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .meta-tag {
      border: 2px solid #0f172a;
      background: #ffffff;
      border-radius: 8px;
      padding: 6px 14px;
      text-align: center;
      min-width: 170px;
      margin-bottom: 4px;
    }
    .meta-tag-label {
      font-size: 10px;
      font-weight: bold;
      color: #64748b;
      display: block;
    }
    .meta-tag-val {
      font-family: monospace;
      font-size: 13.5px;
      font-weight: 900;
      color: #059669;
      display: block;
    }

    /* Payout Receipt Grid */
    .payout-card {
      border: 2px solid #0f172a;
      border-radius: 8px;
      background: #ffffff;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .payout-row {
      display: grid;
      grid-template-columns: 140px 1fr;
      border-bottom: 1px solid #e2e8f0;
      align-items: stretch;
    }
    .payout-row:last-child {
      border-bottom: none;
    }
    .payout-label {
      background: #f8fafc;
      padding: 10px 14px;
      font-weight: 900;
      color: #334155;
      font-size: 11.5px;
      border-left: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
    }
    .payout-val {
      padding: 10px 14px;
      color: #0f172a;
      font-size: 12px;
      display: flex;
      align-items: center;
      font-weight: 700;
    }
    .amount-badge {
      display: inline-flex;
      align-items: baseline;
      gap: 6px;
      background: #ecfdf5;
      border: 1.5px solid #059669;
      padding: 5px 12px;
      border-radius: 6px;
      color: #047857;
      font-family: monospace;
      font-size: 16px;
      font-weight: 900;
    }
    .tafqeet-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7px 12px;
      font-size: 11px;
      font-weight: 800;
      color: #1e293b;
      width: 100%;
    }

    /* Financial Balance Snapshot */
    .balance-box {
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 10px 14px;
      margin-bottom: 12px;
    }
    .balance-title {
      font-size: 11.5px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
    .kpi-item {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 10px;
      text-align: center;
    }
    .kpi-item-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
      display: block;
      margin-bottom: 3px;
    }
    .kpi-item-val {
      font-family: monospace;
      font-size: 13px;
      font-weight: 900;
      color: #0f172a;
      display: block;
    }

    .notice-box {
      border: 1px dashed #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      padding: 8px 12px;
      text-align: center;
      font-size: 10.5px;
      font-weight: bold;
      color: #475569;
      margin-bottom: 16px;
    }

    /* Signatures */
    .signatures-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 24px;
      padding-top: 14px;
      border-top: 2px solid #0f172a;
      text-align: center;
    }
    .sig-col-title {
      font-size: 11.5px;
      font-weight: 900;
      color: #1e293b;
      margin-bottom: 6px;
      display: block;
    }
    .sig-line {
      border-bottom: 1.5px dashed #94a3b8;
      height: 38px;
      margin: 0 10px;
    }
    .stamp-circle {
      border: 1.5px dashed #94a3b8;
      border-radius: 50%;
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      font-size: 9px;
      font-weight: 800;
      margin: 0 auto;
    }

    /* Micro Footer */
    .micro-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #64748b;
      margin-top: 20px;
      padding-top: 6px;
      border-top: 1px solid #e2e8f0;
    }

    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card { max-width: 100% !important; border: none !important; padding: 0 !important; }
    }

    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="report-card">
    <div class="invoice-margin-credit">${INVOICE_MARGIN_CREDIT_TEXT}</div>

    <!-- Top Action Bar (Hidden on Print) -->
    <div class="top-actions">
      <div style="font-weight:900; color:#0f172a; font-size:12px;">معاينة رسمية لسند صرف نقدية بحجم A4 القياسي</div>
      <button class="print-btn" onclick="window.print()">طباعة السند A4</button>
    </div>

    <!-- Header Box -->
    <div class="header-box">
      <div class="header-right">
        <h1 class="market-title">${settings.marketName}</h1>
        <p class="market-sub">${settings.subTitle}</p>
        <div class="header-meta-text">هاتف: ${settings.contactPhone || '782191112'}</div>
        <div class="header-meta-text">العنوان: ${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}</div>
      </div>
      <div class="header-center">
        <img src="${logoDataUrl}" alt="شعار السوق" class="header-logo" />
        <div class="doc-badge">سند صرف نقدية (${roleLabel})</div>
      </div>
      <div class="header-left">
        <div class="meta-tag">
          <span class="meta-tag-label">رقم السند المالي</span>
          <span class="meta-tag-val">${voucherId}</span>
        </div>
        <div style="font-size:10px; font-weight:bold; color:#475569; text-align:right; margin-top:2px;" dir="rtl">
          <div>التاريخ: <strong style="color:#0f172a; font-family:monospace;">${todayFormatted}</strong></div>
          <div>الوقت: <strong style="color:#0f172a; font-family:monospace;">${nowTime}</strong></div>
        </div>
      </div>
    </div>

    <!-- Payout Main Information Card -->
    <div class="payout-card">
      <div class="payout-row">
        <div class="payout-label">صُرف للأخ / ${roleLabel}:</div>
        <div class="payout-val" style="font-size:14px; font-weight:900; color:#0f172a;">
          ${beneficiaryName}
          ${seller?.phone ? `<span style="font-family:monospace; font-size:11px; color:#64748b; margin-right:8px;">(${seller.phone})</span>` : ''}
        </div>
      </div>

      <div class="payout-row">
        <div class="payout-label">مبلغ وقدره:</div>
        <div class="payout-val">
          <div class="amount-badge">
            <span>${formatCurrency(payout.amount, '')}</span>
            <span style="font-size:11px; font-family:'Cairo'; font-weight:bold;">${settings.currency}</span>
          </div>
        </div>
      </div>

      <div class="payout-row">
        <div class="payout-label">فقط وقدره:</div>
        <div class="payout-val">
          <div class="tafqeet-box">
            ${tafqeet(payout.amount, settings.currency)}
          </div>
        </div>
      </div>

      <div class="payout-row">
        <div class="payout-label">البيان وسبب الصرف:</div>
        <div class="payout-val" style="color:#334155; line-height:1.5;">
          ${payout.description || `تسليم وصرف مستحقات مبيعات أسماك بالحراج للأخ ${beneficiaryName}`}
        </div>
      </div>

      <div class="payout-row">
        <div class="payout-label">طريقة الصرف:</div>
        <div class="payout-val" style="font-weight:800; color:#047857;">
          ${payoutMethodStr}
        </div>
      </div>
    </div>

    <!-- Balance Snapshot Box -->
    <div class="balance-box">
      <div class="balance-title">
        <span>كشف وموقف مستحقات ${roleLabel} حتى تاريخ تحرير السند</span>
        <span style="font-size:10px; color:#64748b; font-weight:normal;">مطابقة محاسبية دقيقة</span>
      </div>
      <div class="kpi-grid">
        <div class="kpi-item">
          <span class="kpi-item-label">إجمالي الصافي المستحق</span>
          <span class="kpi-item-val" style="color:#0f172a;">${formatCurrency(allNet, settings.currency)}</span>
        </div>
        <div class="kpi-item" style="background:#ecfdf5; border-color:#059669;">
          <span class="kpi-item-label" style="color:#047857;">المصروف بهذا السند</span>
          <span class="kpi-item-val" style="color:#047857;">${formatCurrency(payout.amount, settings.currency)}</span>
        </div>
        <div class="kpi-item">
          <span class="kpi-item-label">إجمالي المسلم حتى تاريخه</span>
          <span class="kpi-item-val" style="color:#047857;">${formatCurrency(totalPaid, settings.currency)}</span>
        </div>
        <div class="kpi-item" style="background:#fffbeb; border-color:#d97706;">
          <span class="kpi-item-label" style="color:#b45309;">المتبقي المؤجل على الجمعية</span>
          <span class="kpi-item-val" style="color:#b45309;">${formatCurrency(remaining, settings.currency)}</span>
        </div>
      </div>
    </div>

    <!-- Verification Notice -->
    <div class="notice-box">
      يُعتبر هذا السند وثيقة صرف رسمية وإبراء ذمة لإدارة سوق الحراج بالمبلغ الموضح أعلاه، ويحق للمستفيد الاحتفاظ بنسخته.
    </div>

    <!-- Signatures -->
    <div class="signatures-grid">
      <div>
        <span class="sig-col-title">توقيع واستلام ${roleLabel} (المستفيد):</span>
        <div class="sig-line"></div>
        <div style="font-size:10.5px; font-weight:800; color:#0f172a; margin-top:5px;">${beneficiaryName}</div>
      </div>
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <span class="sig-col-title" style="color:#64748b;">ختم السوق الرسمي</span>
        <div class="stamp-circle">ختم الحراج</div>
      </div>
      <div>
        <span class="sig-col-title">أمين الصندوق / الإدارة المالية:</span>
        <div class="sig-line"></div>
        ${settings.employeeName ? `<div style="font-size:10.5px; font-weight:800; color:#0f172a; margin-top:5px;">(${settings.employeeName})</div>` : ''}
      </div>
    </div>

    <!-- Micro Footer -->
    <div class="micro-footer">
      <div>نظام حراج الأسماك ونقطة البيع الإلكترونية © ${new Date().getFullYear()}</div>
      <div>مستند رسمي A4 - صفحة 1 من 1</div>
      <div dir="ltr">${nowTime} - ${todayFormatted}</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير سند صرف نقدية (مستحقات صياد / بائع) كملف PDF رسمي بحجم A4
 */
export async function exportFishermanPayoutVoucherPdfA4(
  payout: CashEntry,
  settings: MarketSettings,
  context?: {
    seller?: Contact | null;
    allSellerNetTotal?: number;
    totalSellerPayouts?: number;
    remainingSellerBalance?: number;
  },
  silent: boolean = false
): Promise<{ success: boolean; message: string; savedPath?: string; canceled?: boolean }> {
  const beneficiary = payout.contactName || context?.seller?.name || 'صياد';
  const filename = `سند_صرف_${beneficiary.replace(/\s+/g, '_')}_${payout.id}.pdf`;
  const html = await buildFishermanPayoutVoucherHtmlA4(payout, settings, context);
  return await exportHtmlToPdfA4(html, filename, silent);
}

/**
 * طباعة سند صرف نقدية (مستحقات صياد / بائع) مباشرة بدقة المتجهات النقية A4
 */
export async function printFishermanPayoutVoucherA4Direct(
  payout: CashEntry,
  settings: MarketSettings,
  context?: {
    seller?: Contact | null;
    allSellerNetTotal?: number;
    totalSellerPayouts?: number;
    remainingSellerBalance?: number;
  },
  options: { silent?: boolean; deviceName?: string } = {}
): Promise<{ success: boolean; message: string }> {
  const html = await buildFishermanPayoutVoucherHtmlA4(payout, settings, context);
  return await printHtmlA4Direct(html, options);
}
