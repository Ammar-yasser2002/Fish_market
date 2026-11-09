import XLSX from 'xlsx-js-style';
import { CashDayCloseRecord, MarketSettings } from '../types';
import {
  formatCurrency,
  formatNumber,
  tafqeet,
  formatGregorianDate,
  formatGregorianTime,
} from './calculations';
import { exportHtmlToPdfA4, getLogoDataUrl, INVOICE_MARGIN_CREDIT_CSS, INVOICE_MARGIN_CREDIT_HTML } from './invoiceExport';

const BORDER_ALL = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const BORDER_DOUBLE_BOTTOM = {
  top: { style: 'thin', color: { rgb: '0F172A' } },
  bottom: { style: 'double', color: { rgb: '0F172A' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

/**
 * تصدير كشف تفاصيل المقبوضات / صرف الصيادين / المصروفات إلى ملف Excel منظم واحترافي
 */
export function exportDrilldownToExcel(
  drilldownData: { title: string; items: any[]; total: number },
  type: 'receipts' | 'seller_payouts' | 'expenses',
  dayName: string,
  settings: MarketSettings
): void {
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
    ws[ref] = {
      v: val ?? '',
      t: cellType,
      s: style || {},
    };
  };

  const colCount = type === 'receipts' ? 7 : type === 'seller_payouts' ? 7 : 6;

  // 1. Trowessah / Header
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

  setCell(
    2,
    0,
    `الموقع: ${settings.location || 'م/شبوه/رضوم/ عين بامعبد'} | جوال: ${settings.contactPhone || '782191112'}`,
    {
      font: { name: 'Arial', sz: 10, color: { rgb: '64748B' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '0284C7' } } },
    }
  );
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } });

  // 2. Report Title
  setCell(4, 0, `${drilldownData.title} - ${dayName}`, {
    font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: {
      fgColor: {
        rgb: type === 'receipts' ? '1D4ED8' : type === 'seller_payouts' ? '4338CA' : 'BE123C',
      },
    },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } });

  // 3. KPI Summary Row
  setCell(6, 0, 'العدد الإجمالي للحركات:', {
    font: { name: 'Arial', sz: 11, bold: true },
    alignment: { horizontal: 'right' },
  });
  setCell(6, 1, `${drilldownData.items.length} حركة`, {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center' },
  });

  setCell(6, colCount - 2, 'إجمالي المبلغ الكلي:', {
    font: { name: 'Arial', sz: 12, bold: true },
    alignment: { horizontal: 'left' },
  });
  setCell(6, colCount - 1, drilldownData.total, {
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center' },
  }, 'n');

  // 4. Table Headers
  const headerRow = 8;
  const thStyle = {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  };

  let headers: string[] = [];
  let colWidths: { wch: number }[] = [];

  if (type === 'receipts') {
    headers = ['#', 'نوع المقبوضات', 'الجهة / المشتري', 'رقم الفاتورة/السند', 'البيان والتفاصيل', 'الوقت', `المبلغ المقبوض (${settings.currency})`];
    colWidths = [{ wch: 6 }, { wch: 18 }, { wch: 24 }, { wch: 16 }, { wch: 32 }, { wch: 12 }, { wch: 20 }];
  } else if (type === 'seller_payouts') {
    headers = ['#', 'اسم الصياد / البائع', 'رقم الفاتورة/السند', 'تفاصيل الصيد والشروة', 'طريقة الصرف والحالة', 'الوقت', `المبلغ المسلّم (${settings.currency})`];
    colWidths = [{ wch: 6 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 20 }];
  } else {
    headers = ['#', 'بند وتصنيف المصروف', 'البيان والشرح التفصيلي', 'المسؤول عن الصرف', 'الوقت', `المبلغ المنصرف (${settings.currency})`];
    colWidths = [{ wch: 6 }, { wch: 22 }, { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 20 }];
  }

  headers.forEach((h, idx) => {
    setCell(headerRow, idx, h, thStyle);
  });

  // 5. Table Data Rows
  let curRow = headerRow + 1;
  const cellStyle = (isEven: boolean) => ({
    font: { name: 'Arial', sz: 10 },
    fill: { fgColor: { rgb: isEven ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
  });

  const centerStyle = (isEven: boolean) => ({
    ...cellStyle(isEven),
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  const numberStyle = (isEven: boolean) => ({
    ...cellStyle(isEven),
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  drilldownData.items.forEach((item, index) => {
    const isEven = index % 2 === 1;
    if (type === 'receipts') {
      setCell(curRow, 0, index + 1, centerStyle(isEven), 'n');
      setCell(curRow, 1, item.source || '', cellStyle(isEven));
      setCell(curRow, 2, item.party || '', cellStyle(isEven));
      setCell(curRow, 3, item.ref || '', centerStyle(isEven));
      setCell(curRow, 4, item.description || '', cellStyle(isEven));
      setCell(curRow, 5, item.time || '', centerStyle(isEven));
      setCell(curRow, 6, item.amount || 0, numberStyle(isEven), 'n');
    } else if (type === 'seller_payouts') {
      setCell(curRow, 0, index + 1, centerStyle(isEven), 'n');
      setCell(curRow, 1, item.sellerName || '', cellStyle(isEven));
      setCell(curRow, 2, item.ref || item.trxId || '', centerStyle(isEven));
      setCell(curRow, 3, item.details || item.fishDetails || '', cellStyle(isEven));
      setCell(curRow, 4, item.disbursedStatus || `${item.status || ''} (${item.payoutMethod || ''})`.trim() || '', centerStyle(isEven));
      setCell(curRow, 5, item.time || '', centerStyle(isEven));
      setCell(curRow, 6, item.paidAmount || 0, numberStyle(isEven), 'n');
    } else {
      setCell(curRow, 0, index + 1, centerStyle(isEven), 'n');
      setCell(curRow, 1, item.category || '', cellStyle(isEven));
      setCell(curRow, 2, item.description || '', cellStyle(isEven));
      setCell(curRow, 3, item.performedBy || '', cellStyle(isEven));
      setCell(curRow, 4, item.time || '', centerStyle(isEven));
      setCell(curRow, 5, item.amount || 0, numberStyle(isEven), 'n');
    }
    curRow++;
  });

  // 6. Total Summary Row
  const totalRowStyle = {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  };

  setCell(curRow, 0, 'الإجمالي الكلي:', totalRowStyle);
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: colCount - 2 } });
  for (let c = 1; c <= colCount - 2; c++) {
    setCell(curRow, c, '', totalRowStyle);
  }
  setCell(curRow, colCount - 1, drilldownData.total, {
    ...totalRowStyle,
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '0F172A' } },
  }, 'n');

  // Sheet configuration & RTL
  ws['!cols'] = colWidths;
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: curRow + 2, c: colCount - 1 } });
  ws['!views'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'كشف تفصيلي');

  const cleanDay = dayName.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 40);
  const fileName = `${drilldownData.title} - ${cleanDay}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * تصدير محضر جرد وإقفال النقدية اليومية إلى ملف Excel محاسبي رسمي
 */
export function exportDailyClosingToExcel(
  record: CashDayCloseRecord,
  settings: MarketSettings
): void {
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
    ws[ref] = {
      v: val ?? '',
      t: cellType,
      s: style || {},
    };
  };

  // Header
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });

  setCell(1, 0, (settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة'), {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '475569' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 3 } });

  setCell(
    2,
    0,
    `الموقع: ${settings.location || 'م/شبوه/رضوم/ عين بامعبد'} | جوال: ${settings.contactPhone || '782191112'}`,
    {
      font: { name: 'Arial', sz: 10, color: { rgb: '64748B' } },
      fill: { fgColor: { rgb: 'F8FAFC' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { bottom: { style: 'medium', color: { rgb: '0F172A' } } },
    }
  );
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 3 } });

  // Title Banner
  setCell(4, 0, 'محضر جرد وإقفال النقدية اليومية', {
    font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 3 } });

  // Meta Info
  setCell(5, 0, `تاريخ اليوم: ${record.dateStr}  |  وقت الإقفال: ${record.timeStr || ''}  |  بواسطة: ${record.closedBy || 'أمين الصندوق'}`, {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '334155' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 3 } });

  let curRow = 7;
  const labelStyle = {
    font: { name: 'Arial', sz: 11, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F1F5F9' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
  };

  const valStyle = {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  };

  const addVoucherRow = (label: string, amount: number, isSub = false) => {
    setCell(curRow, 0, label, { ...labelStyle, font: { ...labelStyle.font, sz: isSub ? 10 : 11 } });
    merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 2 } });
    for (let c = 1; c <= 2; c++) setCell(curRow, c, '', labelStyle);
    setCell(curRow, 3, amount, valStyle, 'n');
    curRow++;
  };

  addVoucherRow('العهدة الافتتاحية للصندوق (رصيد الصباح):', record.openingBalance);
  addVoucherRow('+ إجمالي الإيداعات والتغذية النقدية:', record.totalDeposits);
  addVoucherRow('+ تحصيلات ديون المشترين نقداً:', record.buyerDebtRepayments || 0);

  if (record.harajCashSales && record.harajCashSales > 0) {
    addVoucherRow('+ مبيعات الحراج النقدية المقبوضة:', record.harajCashSales);
  }

  addVoucherRow('- صافي مستحقات الصيادين المصروفة نقداً:', record.harajSellerPayouts || 0);
  addVoucherRow('- إجمالي المصروفات والنثريات التشغيلية:', record.totalExpenses);

  if (record.officeExpenses && record.officeExpenses > 0) {
    addVoucherRow('  منها نثريات ومصروفات المكتب:', record.officeExpenses, true);
  }

  if (record.associationProfits !== undefined) {
    addVoucherRow('عمولات حراج اليوم 5% (للمعلومية):', record.associationProfits, true);
  }

  addVoucherRow('- إجمالي السحوبات والتوريدات من الصندوق:', record.totalWithdrawals);

  // Key Closing Totals
  curRow++;
  const highlightLabel = {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
  };
  const highlightVal = {
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'E2E8F0' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  };

  setCell(curRow, 0, 'الرصيد المحسوب بالنظام (المتوقع بالدرج):', highlightLabel);
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 2 } });
  for (let c = 1; c <= 2; c++) setCell(curRow, c, '', highlightLabel);
  setCell(curRow, 3, record.systemCalculatedBalance, highlightVal, 'n');
  curRow++;

  setCell(curRow, 0, 'الكاش الفعلي في الدرج (المعدود يدوياً):', highlightLabel);
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 2 } });
  for (let c = 1; c <= 2; c++) setCell(curRow, c, '', highlightLabel);
  setCell(curRow, 3, record.actualCountedCash, highlightVal, 'n');
  curRow++;

  // Difference & Status
  const diffLabel = {
    font: { name: 'Arial', sz: 12, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'CBD5E1' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  };
  const diffVal = {
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'CBD5E1' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_DOUBLE_BOTTOM,
  };

  setCell(curRow, 0, 'حالة المطابقة والفارق:', diffLabel);
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 2 } });
  for (let c = 1; c <= 2; c++) setCell(curRow, c, '', diffLabel);

  const diffText = record.difference === 0
    ? 'مطابقة تامة (0)'
    : record.difference > 0
    ? `فائض (+${formatNumber(record.difference)})`
    : `عجز (-${formatNumber(Math.abs(record.difference))})`;

  setCell(curRow, 3, diffText, diffVal);
  curRow += 2;

  // Notes
  if (record.notes) {
    setCell(curRow, 0, `ملاحظات: ${record.notes}`, {
      font: { name: 'Arial', sz: 10, italic: true, color: { rgb: '334155' } },
      alignment: { horizontal: 'right', vertical: 'center' },
    });
    merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 3 } });
    curRow += 2;
  }

  // Signatures
  setCell(curRow, 0, 'توقيع أمين الصندوق: .......................................', {
    font: { name: 'Arial', sz: 11, bold: true },
    alignment: { horizontal: 'center' },
  });
  merges.push({ s: { r: curRow, c: 0 }, e: { r: curRow, c: 1 } });

  setCell(curRow, 2, 'اعتماد المشرف المالي: .......................................', {
    font: { name: 'Arial', sz: 11, bold: true },
    alignment: { horizontal: 'center' },
  });
  merges.push({ s: { r: curRow, c: 2 }, e: { r: curRow, c: 3 } });

  // Widths & layout
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 22 }];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: curRow + 2, c: 3 } });
  ws['!views'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'محضر الجرد اليومي');
  const cleanDate = (record.dateStr || 'يومي').replace(/[/\\?%*:|"<>]/g, '-');
  XLSX.writeFile(wb, `محضر جرد وإقفال النقدية - ${cleanDate}.xlsx`);
}

/**
 * إنشاء صفحة HTML رسمية بحجم A4 لكشف تفاصيل المقبوضات / صرف الصيادين / المصروفات
 */
export async function buildDrilldownHtmlA4(
  drilldownData: { title: string; items: any[]; total: number },
  type: 'receipts' | 'seller_payouts' | 'expenses',
  dayName: string,
  settings: MarketSettings
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const voucherNumber = `VCH-${type.toUpperCase().slice(0, 3)}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const themeColor =
    type === 'receipts' ? '#1d4ed8' : type === 'seller_payouts' ? '#4338ca' : '#be123c';
  const themeBgLight =
    type === 'receipts' ? '#eff6ff' : type === 'seller_payouts' ? '#eef2ff' : '#fff1f2';
  const themeBorder =
    type === 'receipts' ? '#bfdbfe' : type === 'seller_payouts' ? '#c7d2fe' : '#fecdd3';

  let tableHeadersHtml = '';
  let rowsHtml = '';
  const colCount = type === 'receipts' ? 7 : type === 'seller_payouts' ? 7 : 6;

  if (type === 'receipts') {
    tableHeadersHtml = `
      <tr>
        <th style="width:40px;text-align:center;">#</th>
        <th style="width:130px;text-align:right;">نوع المقبوضات</th>
        <th style="width:140px;text-align:right;">الجهة / المشتري</th>
        <th style="width:110px;text-align:center;">رقم السند/الفاتورة</th>
        <th style="text-align:right;">البيان والشرح</th>
        <th style="width:70px;text-align:center;">الوقت</th>
        <th style="width:110px;text-align:center;background:#dbeafe;color:#1e40af;">المبلغ</th>
      </tr>
    `;

    rowsHtml =
      drilldownData.items.length === 0
        ? `<tr><td colspan="${colCount}" style="padding:24px;text-align:center;color:#64748b;font-weight:bold;">لا توجد أي مقبوضات مسجلة في هذا اليوم</td></tr>`
        : drilldownData.items
            .map((item, idx) => `
              <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;">${idx + 1}</td>
                <td style="padding:7px;border:1px solid #cbd5e1;font-weight:bold;">
                  <span style="background:#eff6ff;color:#1e40af;padding:2px 6px;border-radius:4px;border:1px solid #bfdbfe;font-size:10.5px;display:inline-block;">${item.source || ''}</span>
                </td>
                <td style="padding:7px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">${item.party || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:11px;color:#334155;">${item.ref || ''}</td>
                <td style="padding:7px;border:1px solid #cbd5e1;color:#334155;font-size:11px;">${item.description || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:11px;color:#64748b;">${item.time || '—'}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:900;color:#1d4ed8;background:#eff6ff;font-size:12px;">
                  +${formatCurrency(item.amount || 0, settings.currency)}
                </td>
              </tr>
            `)
            .join('');
  } else if (type === 'seller_payouts') {
    tableHeadersHtml = `
      <tr>
        <th style="width:40px;text-align:center;">#</th>
        <th style="width:140px;text-align:right;">اسم الصياد / البائع</th>
        <th style="width:110px;text-align:center;">رقم الفاتورة/السند</th>
        <th style="text-align:right;">تفاصيل الصيد والشروة</th>
        <th style="width:130px;text-align:center;">طريقة الصرف والحالة</th>
        <th style="width:70px;text-align:center;">الوقت</th>
        <th style="width:110px;text-align:center;background:#e0e7ff;color:#3730a3;">المبلغ المسلّم</th>
      </tr>
    `;

    rowsHtml =
      drilldownData.items.length === 0
        ? `<tr><td colspan="${colCount}" style="padding:24px;text-align:center;color:#64748b;font-weight:bold;">لا توجد أي مبالغ منصرفة للصيادين في هذا اليوم</td></tr>`
        : drilldownData.items
            .map((item, idx) => `
              <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;">${idx + 1}</td>
                <td style="padding:7px;border:1px solid #cbd5e1;font-weight:bold;color:#0f172a;">${item.sellerName || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:11px;color:#334155;">${item.ref || item.trxId || ''}</td>
                <td style="padding:7px;border:1px solid #cbd5e1;color:#334155;font-size:11px;">${item.details || item.fishDetails || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-size:11px;">
                  <div style="font-weight:bold;color:#312e81;">${item.status || ''}</div>
                  ${item.payoutMethod ? `<div style="color:#64748b;font-size:10px;">(${item.payoutMethod})</div>` : ''}
                </td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:11px;color:#64748b;">${item.time || '—'}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:900;color:#4338ca;background:#eef2ff;font-size:12px;">
                  -${formatCurrency(item.paidAmount || 0, settings.currency)}
                </td>
              </tr>
            `)
            .join('');
  } else {
    tableHeadersHtml = `
      <tr>
        <th style="width:40px;text-align:center;">#</th>
        <th style="width:140px;text-align:right;">تصنيف المصروف</th>
        <th style="text-align:right;">البيان والشرح التفصيلي</th>
        <th style="width:120px;text-align:center;">المسؤول عن الصرف</th>
        <th style="width:70px;text-align:center;">الوقت</th>
        <th style="width:110px;text-align:center;background:#ffe4e6;color:#9f1239;">المبلغ المنصرف</th>
      </tr>
    `;

    rowsHtml =
      drilldownData.items.length === 0
        ? `<tr><td colspan="${colCount}" style="padding:24px;text-align:center;color:#64748b;font-weight:bold;">لا توجد أي مصروفات مسجلة في هذا اليوم</td></tr>`
        : drilldownData.items
            .map((item, idx) => `
              <tr style="${idx % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:bold;">${idx + 1}</td>
                <td style="padding:7px;border:1px solid #cbd5e1;font-weight:bold;">
                  <span style="background:#fff1f2;color:#be123c;padding:2px 6px;border-radius:4px;border:1px solid #fecdd3;font-size:10.5px;display:inline-block;">${item.category || ''}</span>
                </td>
                <td style="padding:7px;border:1px solid #cbd5e1;color:#334155;font-size:11px;">${item.description || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;color:#0f172a;font-weight:bold;font-size:11px;">${item.performedBy || ''}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:11px;color:#64748b;">${item.time || '—'}</td>
                <td style="padding:7px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-weight:900;color:#be123c;background:#fff1f2;font-size:12px;">
                  -${formatCurrency(item.amount || 0, settings.currency)}
                </td>
              </tr>
            `)
            .join('');
  }

  const signPrefix = type === 'receipts' ? '+' : '-';
  const kpiLabel =
    type === 'receipts'
      ? 'إجمالي المبالغ المقبوضة التي دخلت الصندوق لليوم المحدد:'
      : type === 'seller_payouts'
      ? 'إجمالي صافي مستحقات الصيادين المسلّمة نقداً لليوم المحدد:'
      : 'إجمالي المصروفات والنثريات المنصرفة لليوم المحدد:';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${drilldownData.title} - ${dayName} - ${settings.marketName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      direction: rtl;
      padding: 20px;
    }
    .report-card {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08);
    }
    .top-actions {
      max-width: 860px;
      margin: 0 auto 14px auto;
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
      background: ${themeColor};
      color: #ffffff;
    }
    .header-border {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 14px;
      margin-bottom: 16px;
    }
    .market-title { font-size: 20px; font-weight: 900; color: #0f172a; }
    .market-subtitle { font-size: 12px; font-weight: 700; color: #334155; }
    .meta-box {
      border: 2px solid #0f172a;
      padding: 5px 12px;
      border-radius: 8px;
      background: #f8fafc;
      text-align: center;
    }
    .kpi-banner {
      background: ${themeBgLight};
      border: 1px solid ${themeBorder};
      color: ${themeColor};
      padding: 10px 16px;
      border-radius: 10px;
      font-weight: 900;
      font-size: 12.5px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 11.5px;
    }
    th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px;
      border: 1px solid #0f172a;
      font-weight: 800;
      font-size: 11px;
    }
    .total-box {
      background: ${themeBgLight};
      border: 2px solid ${themeBorder};
      border-radius: 12px;
      padding: 14px;
      text-align: center;
      margin-bottom: 18px;
    }
    .total-amount {
      font-size: 22px;
      font-weight: 900;
      color: ${themeColor};
      font-family: monospace;
      margin: 4px 0;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      text-align: center;
      font-size: 11.5px;
      font-weight: bold;
      border-top: 1px solid #cbd5e1;
      padding-top: 20px;
      margin-top: 20px;
    }
    .sig-line {
      border-bottom: 1px dashed #94a3b8;
      height: 30px;
      margin-top: 6px;
    }
    @media print {
      body { background: #ffffff; padding: 0; }
      .top-actions { display: none !important; }
      .report-card { border: none; box-shadow: none; padding: 0 8px !important; max-width: 100%; width: 100%; page-break-inside: avoid !important; break-inside: avoid !important; }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة الكشف [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">تقرير مالي رسمي معتمد - ${settings.marketName}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div class="header-border">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px;">
        <div style="text-align: right;">
          <h1 class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p class="market-subtitle">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p style="font-size:12px;color:#475569;margin-top:4px;">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}</p>
        </div>
        <div style="text-align: center; display: flex; justify-content: center; align-items: center; padding: 0 10px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 130px; height: 130px; min-width: 130px; min-height: 130px; max-width: 130px; max-height: 130px; object-fit: contain; display: block; margin: 0 auto;" />
        </div>
        <div style="direction: ltr; text-align: left;">
          <div class="meta-box" style="display: inline-block; text-align: center; min-width: 160px; padding: 6px 12px; background: #f8fafc; border: 2px solid #0f172a; border-radius: 8px;">
            <span style="font-size: 11.5px; font-weight: 800; color: ${themeColor}; display: block; direction: rtl; line-height: 1.3; margin-bottom: 2px;">${drilldownData.title}</span>
            <span style="font-size: 13px; font-weight: 900; color: #0f172a; font-family: monospace; display: block; direction: ltr;">${voucherNumber}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 4px; font-family: monospace; direction: rtl; text-align: left;">
            <div>اليوم: <b style="color: #0f172a;">${dayName}</b></div>
            <div>التاريخ: <b style="color: #0f172a;">${todayFormatted}</b></div>
            <div>الوقت: <b style="color: #0f172a;">${nowTime}</b></div>
          </div>
        </div>
      </div>
    </div>

    <div class="kpi-banner">
      <span>📌 ${kpiLabel}</span>
      <span>العدد: <strong>${drilldownData.items.length} ${type === 'seller_payouts' ? 'حركة / صياد' : 'عملية'}</strong></span>
      <span style="font-family:monospace;font-size:14px;font-weight:900;">${signPrefix}${formatCurrency(drilldownData.total, settings.currency)}</span>
    </div>

    <table>
      <thead>
        ${tableHeadersHtml}
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      ${drilldownData.items.length > 0 ? `
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:900;">
            <td colspan="${colCount - 1}" style="padding:10px;text-align:center;border:1px solid #cbd5e1;font-size:12.5px;">
              الإجمالي الكلي:
            </td>
            <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;font-size:14px;color:${themeColor};background:${themeBgLight};">
              ${signPrefix}${formatCurrency(drilldownData.total, settings.currency)}
            </td>
          </tr>
        </tfoot>
      ` : ''}
    </table>

    <div class="total-box">
      <div style="font-size:12.5px;font-weight:bold;color:${themeColor};">المجموع المالي الإجمالي:</div>
      <div class="total-amount">${signPrefix}${formatCurrency(drilldownData.total, settings.currency)}</div>
      <div style="font-size:11.5px;color:#334155;font-weight:bold;">فقط وقدره: ${tafqeet(drilldownData.total, settings.currency).replace(/^فقط\s*/, '')}</div>
    </div>

    <div class="signatures">
      <div>
        <span>المحاسب المسؤول:</span>
        <div class="sig-line"></div>
      </div>
      <div>
        <span>أمين الصندوق:</span>
        <div class="sig-line"></div>
      </div>
      <div>
        <span>الختم المالي المعتمد:</span>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير كشف تفاصيل المقبوضات / صرف الصيادين / المصروفات كملف PDF عالي الجودة
 */
export async function exportDrilldownToPdfA4(
  drilldownData: { title: string; items: any[]; total: number },
  type: 'receipts' | 'seller_payouts' | 'expenses',
  dayName: string,
  settings: MarketSettings
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildDrilldownHtmlA4(drilldownData, type, dayName, settings);
  const cleanDay = dayName.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 40);
  const filename = `${drilldownData.title} - ${cleanDay}.pdf`;
  return await exportHtmlToPdfA4(htmlContent, filename);
}

/**
 * إنشاء صفحة HTML رسمية بحجم A4 لمحضر جرد وإقفال النقدية اليومية
 */
export async function buildDailyClosingHtmlA4(
  record: CashDayCloseRecord,
  settings: MarketSettings
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const voucherNumber = `CLS-${(record.dateStr || '').replace(/-/g, '')}`;

  const diffText =
    record.reconciliationStatus === 'pending'
      ? 'لم يتم المعاينة بعد'
      : record.difference === 0
      ? 'مطابق تماماً بدون أي فارق (0)'
      : record.difference > 0
      ? `فائض / زيادة نقدية (+${formatCurrency(record.difference, settings.currency)})`
      : `عجز نقدي (-${formatCurrency(Math.abs(record.difference), settings.currency)})`;

  const diffColor =
    record.reconciliationStatus === 'pending'
      ? '#d97706'
      : record.difference === 0
      ? '#16a34a'
      : record.difference > 0
      ? '#2563eb'
      : '#dc2626';

  const rows = [
    { label: 'العهدة الافتتاحية للصندوق (رصيد بداية اليوم)', amount: record.openingBalance, color: '#334155', prefix: '' },
    { label: '+ إجمالي الإيداعات والتغذية النقدية', amount: record.totalDeposits, color: '#1d4ed8', prefix: '+' },
    { label: '+ تحصيلات ديون المشترين نقداً بالصندوق', amount: record.buyerDebtRepayments || 0, color: '#059669', prefix: '+' },
    ...(record.harajCashSales && record.harajCashSales > 0
      ? [{ label: '+ مبيعات الحراج النقدية المقبوضة (كاش فوري)', amount: record.harajCashSales, color: '#0d9488', prefix: '+' }]
      : []),
    { label: '- صافي مستحقات الصيادين المصروفة نقداً من الدرج', amount: record.harajSellerPayouts || 0, color: '#4338ca', prefix: '-' },
    { label: '- إجمالي المصروفات والنثريات المنصرفة', amount: record.totalExpenses, color: '#be123c', prefix: '-' },
    ...(record.officeExpenses && record.officeExpenses > 0
      ? [{ label: '   • منها نثريات ومصروفات المكتب', amount: record.officeExpenses, color: '#c2410c', prefix: '' }]
      : []),
    ...(record.associationProfits !== undefined && record.associationProfits > 0
      ? [{ label: '   • عمولات حراج اليوم 5% (للمعلومية فقط)', amount: record.associationProfits, color: '#1e40af', prefix: '' }]
      : []),
    { label: '- إجمالي السحوبات والتوريدات من الصندوق', amount: record.totalWithdrawals, color: '#b45309', prefix: '-' },
  ];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>محضر جرد وإقفال النقدية اليومية - ${record.dateStr} - ${settings.marketName}</title>
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
      font-size: 12px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .report-card {
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px 20px;
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
    .header-border {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .market-title {
      font-size: 18.5px;
      font-weight: 900;
      color: #0f172a;
      margin: 0;
      line-height: 1.25;
      white-space: nowrap;
    }
    .market-subtitle {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
      margin: 3px 0 0 0;
      white-space: nowrap;
    }
    .market-desc {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      margin-top: 3px;
      white-space: nowrap;
    }
    .meta-box {
      border: 2px solid #0f172a;
      padding: 6px 12px;
      border-radius: 8px;
      background: #f8fafc;
      text-align: center;
      display: inline-block;
      min-width: 165px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 12px;
    }
    th {
      background: #0369a1 !important;
      color: #ffffff !important;
      padding: 9px 12px;
      border: 1px solid #0369a1;
      font-weight: 900;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    td {
      padding: 7px 12px;
      border: 1px solid #cbd5e1;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      text-align: center;
      font-size: 12px;
      font-weight: bold;
      border-top: 1px solid #cbd5e1;
      padding-top: 14px;
      margin-top: 14px;
    }
    .sig-line {
      border-bottom: 1px dashed #94a3b8;
      height: 28px;
      margin-top: 6px;
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 8px !important;
        max-width: 100% !important;
        width: 100% !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      table { page-break-inside: avoid; }
      .signatures { page-break-inside: avoid; }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة المحضر [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">محضر جرد نقدية معتمد - ${settings.marketName}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div class="header-border">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px;">
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p class="market-subtitle">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p class="market-desc">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}</p>
        </div>
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 115px; height: 115px; min-width: 115px; min-height: 115px; max-width: 115px; max-height: 115px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; text-align: center; margin-top: 4px; white-space: nowrap;">
            محضر جرد وإقفال اليوم
          </div>
        </div>
        <div style="direction: ltr; text-align: left;">
          <div class="meta-box">
            <span style="font-size: 10.5px; font-weight: 800; color: #0284c7; display: block; direction: rtl; line-height: 1.25; margin-bottom: 2px;">محضر جرد وإقفال اليوم</span>
            <span style="font-size: 12.5px; font-weight: 900; color: #0f172a; font-family: monospace; display: block; direction: ltr;">${voucherNumber}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 4px; font-family: monospace; direction: rtl; text-align: left; line-height: 1.5;">
            <div>تاريخ الجرد: <b style="color: #0f172a;">${record.dateStr}</b></div>
            <div>وقت الإقفال: <b style="color: #0f172a;">${record.timeStr || nowTime}</b></div>
            <div>أمين الصندوق: <b style="color: #0f172a;">${record.closedBy || 'أمين الصندوق'}</b></div>
          </div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr style="background:#0369a1;color:#ffffff;">
          <th style="text-align:right;padding:8px 12px;font-weight:900;background:#0369a1;color:#ffffff;border:1px solid #0369a1;">بيان الحركة المالية بالصندوق</th>
          <th style="width:200px;text-align:center;padding:8px 12px;font-weight:900;background:#0369a1;color:#ffffff;border:1px solid #0369a1;">المبلغ (${settings.currency})</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r, i) => `
          <tr style="${i % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
            <td style="font-weight:bold;color:${r.color};padding:7px 12px;">${r.label}</td>
            <td style="text-align:center;font-family:monospace;font-weight:900;font-size:12.5px;color:${r.color};padding:7px 12px;">
              ${r.prefix}${formatCurrency(r.amount, settings.currency)}
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:900;border-top:2px solid #0369a1;">
          <td style="padding:9px 12px;font-size:12.5px;color:#0f172a;">الرصيد المحسوب بالنظام (المتوقع بالدرج):</td>
          <td style="padding:9px 12px;text-align:center;font-family:monospace;font-size:13.5px;color:#047857;background:#ecfdf5;font-weight:900;">
            ${formatCurrency(record.systemCalculatedBalance, settings.currency)}
          </td>
        </tr>
        <tr style="background:#ffffff;font-weight:900;">
          <td style="padding:9px 12px;font-size:12.5px;color:#0f172a;">الكاش الفعلي في الدرج (المعدود يدوياً):</td>
          <td style="padding:9px 12px;text-align:center;font-family:monospace;font-size:13.5px;color:#1d4ed8;background:#eff6ff;font-weight:900;">
            ${record.reconciliationStatus === 'pending' ? 'بانتظار المعاينة' : formatCurrency(record.actualCountedCash, settings.currency)}
          </td>
        </tr>
        <tr style="background:#fafafa;font-weight:900;">
          <td style="padding:9px 12px;font-size:12.5px;color:#0f172a;">نتيجة المطابقة والفارق:</td>
          <td style="padding:9px 12px;text-align:center;font-weight:900;font-size:12.5px;color:${diffColor};">
            ${diffText}
          </td>
        </tr>
      </tfoot>
    </table>

    ${record.notes ? `
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:11.5px;">
        <span style="font-weight:bold;color:#475569;">ملاحظات الجرد:</span>
        <span style="color:#0f172a;margin-right:6px;">${record.notes}</span>
      </div>
    ` : ''}

    <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;text-align:center;margin-bottom:14px;">
      <div style="font-size:11.5px;font-weight:bold;color:#475569;">الرصيد الفعلي المعتمد بالصندوق كتابةً:</div>
      <div style="font-size:12.5px;color:#0f172a;font-weight:900;margin-top:2px;">
        ${record.reconciliationStatus === 'pending' ? 'بانتظار إتمام العد الفعلي' : `فقط وقدره: ${tafqeet(record.actualCountedCash, settings.currency).replace(/^فقط\s*/, '')}`}
      </div>
    </div>

    <div class="signatures">
      <div>
        <span>أمين الصندوق (المُسلّم):</span>
        <div class="sig-line"></div>
        ${settings.employeeName ? `<div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 4px;">(${settings.employeeName})</div>` : ''}
      </div>
      <div>
        <span>المراجع المالي (المُدقق):</span>
        <div class="sig-line"></div>
      </div>
      <div>
        <span>إدارة الحراج والاعتماد:</span>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير محضر جرد وإقفال النقدية اليومية كملف PDF عالي الجودة
 */
export async function exportDailyClosingToPdfA4(
  record: CashDayCloseRecord,
  settings: MarketSettings
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildDailyClosingHtmlA4(record, settings);
  const cleanDate = (record.dateStr || 'يومي').replace(/[/\\?%*:|"<>]/g, '-');
  const filename = `محضر_جرد_وإقفال_النقدية_${cleanDate}.pdf`;
  return await exportHtmlToPdfA4(htmlContent, filename);
}

export interface MonthlyClosingReportData {
  selectedYear: number;
  selectedMonth: number;
  daysInMonth: number;
  closedDaysCount: number;
  carriedForwardLiquidity: number;
  totalNewCustody: number;
  totalCashIn: number;
  monthBuyerDebtRepayments: number;
  monthHarajCashSales: number;
  monthFishermanPayouts: number;
  totalExpenses: number;
  monthGeneralExpenses: number;
  monthOfficeExpenses: number;
  monthWithdrawals: number;
  totalCashOut: number;
  monthHarajProfit: number;
  netHarajProfit: number;
  outstandingBuyerDebt: number;
  endingActualCash: number;
  monthDifference: number;
}

const ARABIC_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

/**
 * إنشاء صفحة HTML رسمية بحجم A4 لمحضر إقفال وجرد الحسابات الشهري بنظام الجداول المحاسبية
 */
export async function buildMonthlyClosingHtmlA4(
  data: MonthlyClosingReportData,
  settings: MarketSettings
): Promise<string> {
  const logoDataUrl = await getLogoDataUrl();
  const todayFormatted = formatGregorianDate(new Date());
  const nowTime = formatGregorianTime(new Date());
  const monthName = ARABIC_MONTH_NAMES[(data.selectedMonth || 1) - 1] || `${data.selectedMonth}`;
  const reportCode = `MCLS-${data.selectedYear}${String(data.selectedMonth).padStart(2, '0')}`;

  const liquidityRows = [
    {
      index: 1,
      title: '+ إجمالي العُهد الجديدة المضافة',
      desc: 'مجموع عهد الجمعية المضافة خلال الشهر دون تكرار',
      amount: data.totalNewCustody,
      prefix: '+',
      color: '#1d4ed8'
    },
    {
      index: 2,
      title: '+ إجمالي مقبوضات الشهر (Cash In)',
      desc: 'النقد المحصل بالصندوق (تحصيلات ديون المشترين ومبيعات الحراج)',
      amount: data.totalCashIn,
      prefix: '+',
      color: '#059669'
    },
    {
      index: 3,
      title: '- صافي مستحقات الصيادين المصروفة نقداً',
      desc: 'المبالغ النقدية المصروفة لمستحقات الصيادين من الدرج',
      amount: data.monthFishermanPayouts,
      prefix: '-',
      color: '#4338ca'
    },
    {
      index: 4,
      title: '- إجمالي المصروفات التشغيلية والنثريات',
      desc: 'مصروفات ونثريات وتغذية وضيافة المكتب المعتمدة',
      amount: data.totalExpenses,
      prefix: '-',
      color: '#be123c'
    },
    {
      index: 5,
      title: '- إجمالي السحوبات والتوريدات من الصندوق',
      desc: 'سحب نقدية أو توريد للمصرف / البنك',
      amount: data.monthWithdrawals,
      prefix: '-',
      color: '#b45309'
    },
  ];

  const performanceRows = [
    {
      index: 1,
      title: 'أرباح وعمولات الجمعية (5%)',
      desc: 'إجمالي عمولات الحراج المستقطعة بنسبة 5% لصالح الجمعية',
      valStr: formatCurrency(data.monthHarajProfit, settings.currency),
      color: '#1e40af'
    },
    {
      index: 2,
      title: 'صافي ربح الحراج للشهر',
      desc: 'إيراد العمولات مطروحاً منه المصروفات التشغيلية والنثريات',
      valStr: `${data.netHarajProfit > 0 ? '+' : ''}${formatCurrency(data.netHarajProfit, settings.currency)}`,
      color: data.netHarajProfit >= 0 ? '#047857' : '#be123c'
    },
    {
      index: 3,
      title: 'ديون المشترين المعلقة بنهاية الشهر',
      desc: 'المتبقي بذمم المشترين بنهاية الشهر وغير محصلة بعد',
      valStr: formatCurrency(data.outstandingBuyerDebt, settings.currency),
      color: '#b45309'
    },
    {
      index: 4,
      title: 'صافي الفروقات التراكمية للإغلاقات',
      desc: data.monthDifference === 0 ? 'مطابقة تامة لكافة الإغلاقات اليومية' : data.monthDifference > 0 ? 'فائض نقدي تراكمي' : 'عجز نقدي تراكمي',
      valStr: data.monthDifference === 0 ? 'مطابقة تامة (0)' : (data.monthDifference > 0 ? `فائض: +${formatCurrency(data.monthDifference, settings.currency)}` : `عجز: -${formatCurrency(Math.abs(data.monthDifference), settings.currency)}`),
      color: data.monthDifference === 0 ? '#047857' : data.monthDifference > 0 ? '#1d4ed8' : '#be123c'
    },
    {
      index: 5,
      title: 'حالة الأيام المعتمدة خلال الشهر',
      desc: 'عدد الأيام التي تم مطابقتها وإقفالها محاسبياً',
      valStr: `${data.closedDaysCount} من ${data.daysInMonth} يوم (${Math.round((data.closedDaysCount / (data.daysInMonth || 1)) * 100)}%)`,
      color: '#0f172a'
    }
  ];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>محضر إقفال وجرد الحسابات الشهري - شهر ${monthName} ${data.selectedYear} - ${settings.marketName}</title>
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
      font-size: 12px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .report-card {
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px 20px;
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
    .header-border {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .market-title {
      font-size: 18.5px;
      font-weight: 900;
      color: #0f172a;
      margin: 0;
      line-height: 1.25;
      white-space: nowrap;
    }
    .market-subtitle {
      font-size: 12px;
      font-weight: 800;
      color: #334155;
      margin: 3px 0 0 0;
      white-space: nowrap;
    }
    .market-desc {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      margin-top: 3px;
      white-space: nowrap;
    }
    .meta-box {
      border: 2px solid #0f172a;
      padding: 6px 12px;
      border-radius: 8px;
      background: #f8fafc;
      text-align: center;
      display: inline-block;
      min-width: 170px;
    }
    .section-title {
      font-size: 12.5px;
      font-weight: 900;
      color: #0f172a;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 11.5px;
    }
    th {
      padding: 7px 10px;
      font-weight: 900;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    td {
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
    }
    .signatures {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      text-align: center;
      font-size: 11.5px;
      font-weight: bold;
      border-top: 1px solid #cbd5e1;
      padding-top: 14px;
      margin-top: 14px;
    }
    .sig-line {
      border-bottom: 1px dashed #94a3b8;
      height: 26px;
      margin-top: 6px;
    }
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      .top-actions { display: none !important; }
      .report-card {
        border: none !important;
        box-shadow: none !important;
        padding: 0 8px !important;
        max-width: 100% !important;
        width: 100% !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      table { page-break-inside: avoid; }
      .signatures { page-break-inside: avoid; }
    }
  
    ${INVOICE_MARGIN_CREDIT_CSS}
  </style>
</head>
<body>
  <div class="top-actions">
    <button class="btn" onclick="window.print()">🖨️ طباعة المحضر الشهري [Ctrl+P]</button>
    <span style="font-size:12px;color:#64748b;">محضر إقفال وجرد شهري معتمد - شهر ${monthName} ${data.selectedYear}</span>
  </div>

  <div class="report-card" id="a4-invoice-render" style="position: relative;">
    ${INVOICE_MARGIN_CREDIT_HTML}
    <div class="header-border">
      <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px;">
        <div style="text-align: right; line-height: 1.35; min-width: 0;">
          <h1 class="market-title">${settings.marketName || 'سوق عين بامعبد المركزي'}</h1>
          <p class="market-subtitle">${(settings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة')}</p>
          <p class="market-desc">${settings.location || 'م/شبوه/رضوم/ عين بامعبد'}${settings.contactPhone ? ` | جوال: ${settings.contactPhone}` : ''}</p>
        </div>
        <div style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px;">
          <img src="${logoDataUrl}" alt="شعار السوق" style="width: 115px; height: 115px; min-width: 115px; min-height: 115px; max-width: 115px; max-height: 115px; object-fit: contain; display: block; margin: 0 auto;" />
          <div style="font-size: 13.5px; font-weight: 900; color: #0f172a; text-align: center; margin-top: 4px; white-space: nowrap;">
            محضر إقفال وجرد الحسابات الشهري
          </div>
        </div>
        <div style="direction: ltr; text-align: left;">
          <div class="meta-box">
            <span style="font-size: 10.5px; font-weight: 800; color: #0284c7; display: block; direction: rtl; line-height: 1.25; margin-bottom: 2px;">سند إقفال الحسابات الشهري</span>
            <span style="font-size: 12.5px; font-weight: 900; color: #0f172a; font-family: monospace; display: block; direction: ltr;">${reportCode}</span>
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 4px; font-family: monospace; direction: rtl; text-align: left; line-height: 1.5;">
            <div>الشهر المحاسبي: <b style="color: #0f172a;">شهر ${monthName} ${data.selectedYear}</b></div>
            <div>تاريخ الاستخراج: <b style="color: #0f172a;">${todayFormatted} (${nowTime})</b></div>
            <div>حالة الأيام: <b style="color: #0f172a;">${data.closedDaysCount} من ${data.daysInMonth} يوم مقفل</b></div>
          </div>
        </div>
      </div>
    </div>

    {/* الجدول الأول: حركة السيولة والنقدية بالصندوق */}
    <div class="section-title">
      <span style="display:inline-block;width:4px;height:14px;background:#0284c7;border-radius:2px;"></span>
      <span>أولاً: حركة السيولة والنقدية بالصندوق (Cash & Liquidity Movement):</span>
    </div>
    <table>
      <thead>
        <tr style="background:#0284c7;color:#ffffff;">
          <th style="width:36px;text-align:center;padding:7px 8px;background:#0284c7;color:#ffffff;border:1px solid #0284c7;">م</th>
          <th style="text-align:right;padding:7px 10px;background:#0284c7;color:#ffffff;border:1px solid #0284c7;">بيان الحركة المالية والسيولة بالصندوق</th>
          <th style="text-align:right;padding:7px 10px;background:#0284c7;color:#ffffff;border:1px solid #0284c7;">التفاصيل والملاحظات المحاسبية</th>
          <th style="width:170px;text-align:center;padding:7px 10px;background:#0284c7;color:#ffffff;border:1px solid #0284c7;">المبلغ (${settings.currency})</th>
        </tr>
      </thead>
      <tbody>
        ${liquidityRows
          .map(
            (r, i) => `
          <tr style="${i % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
            <td style="text-align:center;font-weight:bold;font-family:monospace;padding:6px 8px;">${r.index}</td>
            <td style="font-weight:bold;color:${r.color};padding:6px 10px;">${r.title}</td>
            <td style="color:#64748b;font-size:11px;padding:6px 10px;">${r.desc}</td>
            <td style="text-align:center;font-family:monospace;font-weight:900;font-size:12px;color:${r.color};padding:6px 10px;">
              ${r.prefix}${formatCurrency(r.amount, settings.currency)}
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f1f5f9;font-weight:900;border-top:2px solid #0284c7;">
          <td colspan="3" style="padding:8px 12px;font-size:12px;color:#0f172a;">الرصيد الفعلي المعتمد بنهاية الشهر (كاش الدرج والخزينة المتبقي):</td>
          <td style="padding:8px 12px;text-align:center;font-family:monospace;font-size:13.5px;color:#047857;background:#ecfdf5;font-weight:900;">
            ${formatCurrency(data.endingActualCash, settings.currency)}
          </td>
        </tr>
      </tfoot>
    </table>

    {/* الجدول الثاني: مؤشرات الأداء والعمولات والذمم المعلقة */}
    <div class="section-title">
      <span style="display:inline-block;width:4px;height:14px;background:#059669;border-radius:2px;"></span>
      <span>ثانياً: مؤشرات الأداء والعمولات والذمم المعلقة (Financial Performance & Inflows):</span>
    </div>
    <table>
      <thead>
        <tr style="background:#059669;color:#ffffff;">
          <th style="width:36px;text-align:center;padding:7px 8px;background:#059669;color:#ffffff;border:1px solid #059669;">م</th>
          <th style="text-align:right;padding:7px 10px;background:#059669;color:#ffffff;border:1px solid #059669;">المؤشر المالي والعمولات</th>
          <th style="text-align:right;padding:7px 10px;background:#059669;color:#ffffff;border:1px solid #059669;">البيان والتوضيح المحاسبي</th>
          <th style="width:170px;text-align:center;padding:7px 10px;background:#059669;color:#ffffff;border:1px solid #059669;">القيمة (${settings.currency})</th>
        </tr>
      </thead>
      <tbody>
        ${performanceRows
          .map(
            (r, i) => `
          <tr style="${i % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafc;'}">
            <td style="text-align:center;font-weight:bold;font-family:monospace;padding:6px 8px;">${r.index}</td>
            <td style="font-weight:bold;color:${r.color};padding:6px 10px;">${r.title}</td>
            <td style="color:#64748b;font-size:11px;padding:6px 10px;">${r.desc}</td>
            <td style="text-align:center;font-family:monospace;font-weight:900;font-size:12px;color:${r.color};padding:6px 10px;">
              ${r.valStr}
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;text-align:center;margin-bottom:14px;">
      <div style="font-size:11.5px;font-weight:bold;color:#475569;">الرصيد الفعلي المعتمد بالصندوق بنهاية الشهر كتابةً:</div>
      <div style="font-size:12.5px;color:#0f172a;font-weight:900;margin-top:2px;">
        فقط وقدره: ${tafqeet(data.endingActualCash, settings.currency).replace(/^فقط\s*/, '')}
      </div>
    </div>

    <div class="signatures">
      <div>
        <span>أمين الصندوق:</span>
        <div class="sig-line"></div>
        ${settings.employeeName ? `<div style="font-size: 10px; font-weight: 800; color: #0f172a; margin-top: 4px;">(${settings.employeeName})</div>` : ''}
      </div>
      <div>
        <span>محاسب الجمعية:</span>
        <div class="sig-line"></div>
      </div>
      <div>
        <span>مشرف الحراج:</span>
        <div class="sig-line"></div>
      </div>
      <div>
        <span>رئيس مجلس الإدارة:</span>
        <div class="sig-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * تصدير محضر إقفال وجرد الحسابات الشهري كملف PDF رسمي بحجم A4
 */
export async function exportMonthlyClosingToPdfA4(
  data: MonthlyClosingReportData,
  settings: MarketSettings
): Promise<{ success: boolean; message: string }> {
  const htmlContent = await buildMonthlyClosingHtmlA4(data, settings);
  const monthName = ARABIC_MONTH_NAMES[(data.selectedMonth || 1) - 1] || `${data.selectedMonth}`;
  const filename = `محضر_إقفال_الحسابات_الشهري_شهر_${monthName}_${data.selectedYear}.pdf`;
  return await exportHtmlToPdfA4(htmlContent, filename);
}

/**
 * تصدير جدول مطابقة وإقفال الشهر كاملاً إلى ملف Excel
 */
export function exportMonthlyInventoryToExcel(
  rows: any[],
  year: number,
  month: number,
  settings: MarketSettings
): void {
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
    ws[ref] = {
      v: val ?? '',
      t: cellType,
      s: style || {},
    };
  };

  const colCount = 11;

  // Header
  setCell(0, 0, settings.marketName || 'سوق عين بامعبد المركزي', {
    font: { name: 'Arial', sz: 16, bold: true, color: { rgb: '0F172A' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } });

  setCell(1, 0, `سجل مطابقة وإقفال نقدية الصندوق لشهر ${month} / ${year} م`, {
    font: { name: 'Arial', sz: 13, bold: true, color: { rgb: '1E293B' } },
    fill: { fgColor: { rgb: 'F8FAFC' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'medium', color: { rgb: '0F172A' } } },
  });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } });

  // Table Headers
  const headerRow = 3;
  const thStyle = {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '0F172A' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: BORDER_ALL,
  };

  const headers = [
    'اليوم والتاريخ',
    'العهدة الجديدة المضافة',
    'صافي العهدة المستهلكة',
    'المقبوضات النقدية',
    'صرف الصيادين',
    'المصروفات',
    'السحوبات',
    'الرصيد المحسوب',
    'الرصيد الفعلي (المعدود)',
    'الفارق والمطابقة',
    'حالة الإقفال',
  ];

  headers.forEach((h, idx) => setCell(headerRow, idx, h, thStyle));

  let curRow = headerRow + 1;
  const cellStyle = (isEven: boolean) => ({
    font: { name: 'Arial', sz: 10 },
    fill: { fgColor: { rgb: isEven ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER_ALL,
  });

  const centerStyle = (isEven: boolean) => ({
    ...cellStyle(isEven),
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  const numStyle = (isEven: boolean) => ({
    ...cellStyle(isEven),
    font: { name: 'Arial', sz: 10, bold: true },
    alignment: { horizontal: 'center', vertical: 'center' },
  });

  rows.forEach((r, idx) => {
    const isEven = idx % 2 === 1;
    const c = r.closing;
    const isFuture = Boolean(r.isFuture);
    const isInactive = Boolean(r.isInactive);
    const dayLabel = r.dayLabel || (r.dayName ? `${r.dayName} (${r.dateStr || r.dayNumber})` : `يوم ${r.dayNumber || idx + 1}`);
    const newCustody = (isFuture || isInactive) ? '—' : (r.newCustody !== undefined ? r.newCustody : (c?.newCustodyAmount !== undefined ? c.newCustodyAmount : 0));
    const receipts = (isFuture || isInactive) ? '—' : (r.receipts !== undefined ? r.receipts : (c ? ((c.harajCashSales || 0) + (c.buyerDebtRepayments || 0)) : 0));
    const sellerPayouts = (isFuture || isInactive) ? '—' : (r.sellerPayouts !== undefined ? r.sellerPayouts : (c ? (c.harajSellerPayouts || 0) : 0));
    const expenses = (isFuture || isInactive) ? '—' : (r.expenses !== undefined ? r.expenses : (c ? c.totalExpenses : 0));
    const withdrawals = (isFuture || isInactive) ? '—' : (r.withdrawals !== undefined ? r.withdrawals : (c ? c.totalWithdrawals : 0));
    const calculatedDrawer = (isFuture || isInactive) ? '—' : (r.calculatedDrawer !== undefined ? r.calculatedDrawer : (c ? c.systemCalculatedBalance : 0));
    const actualCounted = (isFuture || isInactive) ? '—' : (r.actualCounted !== undefined ? r.actualCounted : (c ? (c.reconciliationStatus === 'pending' ? null : c.actualCountedCash) : null));
    const diff = (isFuture || isInactive) ? '—' : (r.diff !== undefined ? r.diff : (c ? (c.reconciliationStatus === 'pending' ? null : c.difference) : null));
    const hasClosing = r.hasClosing !== undefined ? r.hasClosing : Boolean(c);
    const isAutoClosed = r.isAutoClosed !== undefined ? r.isAutoClosed : (c ? c.reconciliationStatus === 'pending' : false);

    const custodyNum = typeof newCustody === 'number' ? newCustody : 0;
    const withdrawalsNum = typeof withdrawals === 'number' ? withdrawals : 0;
    const netConsumed = (isFuture || isInactive) ? '—' : Math.max(0, custodyNum - withdrawalsNum);

    setCell(curRow, 0, dayLabel, cellStyle(isEven));
    setCell(curRow, 1, newCustody, numStyle(isEven), typeof newCustody === 'number' ? 'n' : 's');
    setCell(curRow, 2, netConsumed, numStyle(isEven), typeof netConsumed === 'number' ? 'n' : 's');
    setCell(curRow, 3, receipts, numStyle(isEven), typeof receipts === 'number' ? 'n' : 's');
    setCell(curRow, 4, sellerPayouts, numStyle(isEven), typeof sellerPayouts === 'number' ? 'n' : 's');
    setCell(curRow, 5, expenses, numStyle(isEven), typeof expenses === 'number' ? 'n' : 's');
    setCell(curRow, 6, withdrawals, numStyle(isEven), typeof withdrawals === 'number' ? 'n' : 's');
    setCell(curRow, 7, calculatedDrawer, numStyle(isEven), typeof calculatedDrawer === 'number' ? 'n' : 's');
    setCell(curRow, 8, actualCounted !== null ? actualCounted : (hasClosing ? 0 : '—'), numStyle(isEven), typeof actualCounted === 'number' ? 'n' : 's');
    setCell(curRow, 9, diff !== null ? diff : '—', numStyle(isEven), typeof diff === 'number' ? 'n' : 's');
    setCell(curRow, 10, hasClosing ? (isAutoClosed ? 'إقفال آلي (بانتظار المعاينة)' : 'معتمد ومطابق') : (isFuture || isInactive ? '—' : 'غير مقفل'), centerStyle(isEven));
    curRow++;
  });

  ws['!cols'] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 15 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
  ];
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: curRow + 2, c: colCount - 1 } });
  ws['!views'] = [{ rightToLeft: true }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `جرد شهر ${month}-${year}`);
  XLSX.writeFile(wb, `سجل مطابقة وإقفال نقدية الصندوق - ${month}-${year}.xlsx`);
}
