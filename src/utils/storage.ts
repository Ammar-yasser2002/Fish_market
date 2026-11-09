import XLSX from 'xlsx-js-style';
import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction, LotTransferRecord } from '../types';
import { formatGregorianDate, formatGregorianTime, formatDisplayDate } from './calculations';
import {
  DEFAULT_SETTINGS,
  INITIAL_CASH_CLOSINGS,
  INITIAL_CASH_ENTRIES,
  INITIAL_CONTACTS,
  INITIAL_FISH_TYPES,
  INITIAL_TRANSACTIONS,
} from '../data/initialData';

const KEYS = {
  TRANSACTIONS: 'haraj_transactions_v2',
  CONTACTS: 'haraj_contacts_v2',
  FISH_TYPES: 'haraj_fish_types_v2',
  SETTINGS: 'haraj_settings_v2',
  CASH_ENTRIES: 'haraj_cash_entries_v2',
  CASH_CLOSINGS: 'haraj_cash_closings_v2',
  LOT_TRANSFERS: 'haraj_lot_transfers_v1',
};

// One-time cleanup to wipe any old mock data & old settings from previous sessions
if (typeof window !== 'undefined') {
  const PURGE_FLAG = 'haraj_mock_purged_v4_settings_flag';
  if (!localStorage.getItem(PURGE_FLAG)) {
    localStorage.removeItem(KEYS.SETTINGS);
    localStorage.setItem(PURGE_FLAG, 'true');
  }
}

export function normalizeSettings(settings?: Partial<MarketSettings> | null): MarketSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
  } as MarketSettings;

  merged.marketName = settings?.marketName || 'سوق عين بامعبد المركزي';
  merged.subTitle = settings?.subTitle || 'للأسماك الطازجة والخضروات والفواكة';
  merged.location = settings?.location || 'م/شبوه/رضوم/ عين بامعبد';
  merged.contactPhone = settings?.contactPhone || merged.contactPhone || '782191112';
  merged.employeeName = settings?.employeeName !== undefined ? settings.employeeName : (merged.employeeName || 'أمين الصندوق');

  if (!merged.currency || merged.currency === 'ر.س' || merged.currency === 'SAR') {
    merged.currency = 'ريال يمني';
  }

  if (!merged.systemPin) {
    merged.systemPin = '1234';
  }

  // المحافظة على نسب العمولات والضرائب المحتسبة للمشتري والصياد بدقة
  if (merged.buyerTaxRate !== undefined && !isNaN(Number(merged.buyerTaxRate))) {
    merged.buyerTaxRate = Number(merged.buyerTaxRate);
  } else {
    merged.buyerTaxRate = DEFAULT_SETTINGS.buyerTaxRate;
  }

  if (merged.sellerTaxRate !== undefined && !isNaN(Number(merged.sellerTaxRate))) {
    merged.sellerTaxRate = Number(merged.sellerTaxRate);
  } else {
    merged.sellerTaxRate = DEFAULT_SETTINGS.sellerTaxRate;
  }

  if (merged.enableBuyerFishSalesAndOffset === undefined) {
    merged.enableBuyerFishSalesAndOffset = settings?.enableBuyerFishSalesAndOffset !== undefined ? settings.enableBuyerFishSalesAndOffset : false;
  }

  if (merged.showBuyerResaleButton === undefined) {
    merged.showBuyerResaleButton = settings?.showBuyerResaleButton !== undefined ? settings.showBuyerResaleButton : true;
  }

  if (merged.showSurplusInCashCards === undefined) {
    merged.showSurplusInCashCards = true;
  }

  // المحافظة على بيانات SMTP والنسخ الاحتياطي عند أي إعادة تحميل أو تنظيف جزئي
  if (merged.smtpHost === undefined) merged.smtpHost = DEFAULT_SETTINGS.smtpHost;
  if (merged.smtpPort === undefined) merged.smtpPort = DEFAULT_SETTINGS.smtpPort;
  if (merged.smtpSecure === undefined) merged.smtpSecure = DEFAULT_SETTINGS.smtpSecure;
  if (merged.emailBackupEnabled === undefined) merged.emailBackupEnabled = true;
  if (merged.emailBackupOnScheduleEnabled === undefined) merged.emailBackupOnScheduleEnabled = true;
  if (!merged.emailBackupScheduledTime) merged.emailBackupScheduledTime = '23:00';
  if (merged.emailBackupOnDayCloseEnabled === undefined) merged.emailBackupOnDayCloseEnabled = true;
  if (!merged.backupFrequency || !['daily', 'weekly', 'monthly'].includes(merged.backupFrequency)) {
    merged.backupFrequency = 'daily';
  }
  // الحفاظ الدائم على كلمة مرور التطبيقات وحساب الإرسال لمنع تصفيرهما
  if (settings?.smtpPass !== undefined && settings.smtpPass !== null) {
    merged.smtpPass = settings.smtpPass;
  }
  if (settings?.smtpUser !== undefined && settings.smtpUser !== null) {
    merged.smtpUser = settings.smtpUser;
  }
  if (!merged.googleDriveFolderUrl || merged.googleDriveFolderUrl.includes('drive.google.com') || merged.googleDriveFolderUrl.includes('1uxxnT7lJVlgpi8KWsG9PCBTyG_23Mx__')) {
    merged.googleDriveFolderUrl = DEFAULT_SETTINGS.googleDriveFolderUrl;
  }

  // المحافظة على إعدادات الخط وحجمه واعتماد الحجم الموصى به 112%
  if (!merged.fontFamily) merged.fontFamily = DEFAULT_SETTINGS.fontFamily || 'Cairo';

  // ترحيل تلقائي لمرة واحدة لاعتماد حجم 112% الموصى به للنظام
  const migrationKey = 'fishe_font_112_adopted';
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      if (!localStorage.getItem(migrationKey)) {
        if (!merged.fontSizeScale || Number(merged.fontSizeScale) === 100) {
          merged.fontSizeScale = 112;
        }
        localStorage.setItem(migrationKey, 'true');
      }
    } catch {}
  }

  if (!merged.fontSizeScale || isNaN(Number(merged.fontSizeScale))) {
    merged.fontSizeScale = DEFAULT_SETTINGS.fontSizeScale || 112;
  } else {
    merged.fontSizeScale = Number(merged.fontSizeScale);
  }

  return merged;
}

export function loadSettings(): MarketSettings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      const updated = normalizeSettings(parsed);
      localStorage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    }
  } catch (e) {
    console.warn('Error reading settings from localStorage', e);
  }

  const defaultSettings = normalizeSettings(DEFAULT_SETTINGS);
  saveSettings(defaultSettings);
  return defaultSettings;
}

export function saveSettings(settings: MarketSettings): void {
  try {
    const safeSettings = normalizeSettings(settings);
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(safeSettings));
  } catch (e) {
    console.error('Error saving settings', e);
  }
}

export function sanitizeTransactionDates(transactions: Transaction[]): Transaction[] {
  let modified = false;
  const sanitized = transactions.map((t) => {
    const gregDate = formatDisplayDate(t.timestamp, t.dateStr);
    const gregTime = t.timeStr && !t.timeStr.includes('هـ') ? t.timeStr : formatGregorianTime(t.timestamp || new Date());
    if (t.dateStr !== gregDate || t.timeStr !== gregTime) {
      modified = true;
      return { ...t, dateStr: gregDate, timeStr: gregTime };
    }
    return t;
  });
  if (modified) {
    try {
      localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(sanitized));
    } catch {}
  }
  return sanitized;
}

export function deduplicateTransactionsList(transactions: Transaction[]): Transaction[] {
  if (!Array.isArray(transactions)) return [];
  const seenIds = new Set<string>();
  const result: Transaction[] = [];
  for (const t of transactions) {
    if (!t || !t.id) continue;
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    result.push(t);
  }
  return result;
}

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(KEYS.TRANSACTIONS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = sanitizeTransactionDates(parsed);
        const deduped = deduplicateTransactionsList(sanitized);
        if (deduped.length !== parsed.length) {
          try {
            localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(deduped));
          } catch {}
        }
        return deduped;
      }
    }
  } catch (e) {
    console.warn('Error reading transactions from localStorage', e);
  }
  return [];
}

export function saveTransactions(transactions: Transaction[]): void {
  try {
    const deduped = deduplicateTransactionsList(transactions);
    localStorage.setItem(KEYS.TRANSACTIONS, JSON.stringify(deduped));
  } catch (e) {
    console.error('Error saving transactions', e);
  }
}

export function deduplicateContactsList(contacts: Contact[]): Contact[] {
  if (!Array.isArray(contacts)) return [];
  const seenIds = new Set<string>();
  const seenNameType = new Set<string>();
  const result: Contact[] = [];

  for (const c of contacts) {
    if (!c || !c.name) continue;
    const normName = c.name.trim().replace(/\s+/g, ' ').toLowerCase();
    const typeKey = `${normName}_${c.type || 'buyer'}`;

    if (c.id && seenIds.has(c.id)) continue;
    if (seenNameType.has(typeKey)) continue;

    if (c.id) seenIds.add(c.id);
    seenNameType.add(typeKey);
    result.push(c);
  }
  return result;
}

export function deduplicateFishTypesList(fishList: FishType[]): FishType[] {
  if (!Array.isArray(fishList)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: FishType[] = [];

  for (const f of fishList) {
    if (!f || !f.name) continue;
    const normName = f.name.trim().replace(/\s+/g, ' ').toLowerCase();
    if (f.id && seenIds.has(f.id)) continue;
    if (seenNames.has(normName)) continue;

    if (f.id) seenIds.add(f.id);
    seenNames.add(normName);
    result.push(f);
  }
  return result;
}

export function loadContacts(): Contact[] {
  try {
    const raw = localStorage.getItem(KEYS.CONTACTS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = deduplicateContactsList(parsed);
        if (cleaned.length !== parsed.length) {
          saveContacts(cleaned);
        }
        return cleaned;
      }
    }
  } catch (e) {
    console.warn('Error reading contacts from localStorage', e);
  }
  return [];
}

export function saveContacts(contacts: Contact[]): void {
  try {
    const cleaned = deduplicateContactsList(contacts);
    localStorage.setItem(KEYS.CONTACTS, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving contacts', e);
  }
}

export function loadFishTypes(): FishType[] {
  try {
    const raw = localStorage.getItem(KEYS.FISH_TYPES);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = deduplicateFishTypesList(parsed);
        if (cleaned.length !== parsed.length) {
          saveFishTypes(cleaned);
        }
        return cleaned;
      }
    }
  } catch (e) {
    console.warn('Error reading fish types from localStorage', e);
  }
  saveFishTypes(INITIAL_FISH_TYPES);
  return INITIAL_FISH_TYPES;
}

export function saveFishTypes(fishTypes: FishType[]): void {
  try {
    const cleaned = deduplicateFishTypesList(fishTypes);
    localStorage.setItem(KEYS.FISH_TYPES, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving fish types', e);
  }
}

export function loadCashEntries(): CashEntry[] {
  try {
    const raw = localStorage.getItem(KEYS.CASH_ENTRIES);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading cash entries from localStorage', e);
  }
  return [];
}

export function saveCashEntries(entries: CashEntry[]): void {
  try {
    localStorage.setItem(KEYS.CASH_ENTRIES, JSON.stringify(entries));
  } catch (e) {
    console.error('Error saving cash entries', e);
  }
}

export function loadCashClosings(): CashDayCloseRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.CASH_CLOSINGS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading cash closings from localStorage', e);
  }
  return [];
}

export function saveCashClosings(closings: CashDayCloseRecord[]): void {
  try {
    localStorage.setItem(KEYS.CASH_CLOSINGS, JSON.stringify(closings));
  } catch (e) {
    console.error('Error saving cash closings', e);
  }
}

export function loadLotTransfers(): LotTransferRecord[] {
  try {
    const raw = localStorage.getItem(KEYS.LOT_TRANSFERS);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading lot transfers from localStorage', e);
  }
  return [];
}

export function saveLotTransfers(transfers: LotTransferRecord[]): void {
  try {
    localStorage.setItem(KEYS.LOT_TRANSFERS, JSON.stringify(transfers));
  } catch (e) {
    console.error('Error saving lot transfers', e);
  }
}

export function clearAllMockData(): void {
  saveTransactions([]);
  saveContacts([]);
  saveCashEntries([]);
  saveCashClosings([]);
  saveLotTransfers([]);
}

export function exportAllData(
  overrideTransactions?: Transaction[],
  overrideContacts?: Contact[],
  overrideFishTypes?: FishType[],
  overrideSettings?: MarketSettings,
  overrideCashEntries?: CashEntry[],
  overrideCashClosings?: CashDayCloseRecord[],
  overrideLotTransfers?: LotTransferRecord[]
): string {
  const data = {
    exportDate: new Date().toISOString(),
    exportDateFormatted: `${formatGregorianDate(new Date())} ${formatGregorianTime(new Date())}`,
    system: 'سوق حراج الأسماك - نظام إدارة المبيعات والعمليات الأساسية والخزينة',
    version: '2.5',
    settings: overrideSettings || loadSettings(),
    transactions: overrideTransactions || loadTransactions(),
    contacts: overrideContacts || loadContacts(),
    fishTypes: overrideFishTypes || loadFishTypes(),
    cashEntries: overrideCashEntries || loadCashEntries(),
    cashClosings: overrideCashClosings || loadCashClosings(),
    lotTransfers: overrideLotTransfers || loadLotTransfers(),
  };
  return JSON.stringify(data, null, 2);
}


export function exportTransactionsToXlsx(transactions: Transaction[], filename: string): void {
  const headers = [
    'رقم الفاتورة',
    'التاريخ',
    'الوقت',
    'الصياد',
    'هاتف البائع',
    'المشتري',
    'هاتف المشتري',
    'الصنف',
    'الكمية',
    'الوحدة',
    'سعر الوحدة',
    'إجمالي الصنف',
    'إجمالي الفاتورة الأساسي',
    'عمولة المشتري',
    'المطلوب من المشتري',
    'عمولة البائع',
    'الصافي للصياد',
    'عمولة الحراج',
    'حالة الدفع',
    'الملاحظات',
  ];

  const rows: (string | number)[][] = [headers];
  const merges: XLSX.Range[] = [];
  const rowBgMap: Record<number, string> = {};
  let currentRow = 1;

  transactions.forEach((t, tIndex) => {
    const items =
      t.items && t.items.length > 0
        ? t.items
        : [{ fishName: '-', quantity: 0, unit: '-', unitPrice: 0, totalGross: 0 }];
    const rowSpan = items.length;
    const startRow = currentRow;
    const isAlt = tIndex % 2 === 1;
    const rowBg = isAlt ? 'F8FAFC' : 'FFFFFF';

    const pStatus =
      t.paymentStatus === 'paid'
        ? 'مدفوع'
        : t.paymentStatus === 'settled'
        ? 'تمت التسوية'
        : 'معلق';

    items.forEach((item) => {
      rowBgMap[currentRow] = rowBg;
      const rowData: (string | number)[] = [
        t.id || '-',
        t.dateStr || '-',
        t.timeStr || '-',
        t.sellerName || '-',
        t.sellerPhone || '-',
        t.buyerName || '-',
        t.buyerPhone || '-',
        item.fishName || '-',
        Number(item.quantity) || 0,
        item.unit || '-',
        Number(item.unitPrice) || 0,
        Number(item.totalGross) || 0,
        Number(t.grossAmount) || 0,
        Number(t.buyerTaxAmount) || 0,
        Number(t.totalFromBuyer) || 0,
        Number(t.sellerTaxAmount) || 0,
        Number(t.netToSeller) || 0,
        Number(t.harajProfit) || 0,
        pStatus,
        t.notes || '-',
      ];
      rows.push(rowData);
      currentRow++;
    });

    if (rowSpan > 1) {
      const colsToMerge = [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 15, 16, 17, 18, 19];
      colsToMerge.forEach((col) => {
        merges.push({
          s: { r: startRow, c: col },
          e: { r: startRow + rowSpan - 1, c: col },
        });
      });
    }
  });

  // Overall totals row at the bottom
  if (transactions.length > 0) {
    const totalQty = transactions.reduce(
      (sum, t) => sum + (t.items?.reduce((isum, it) => isum + (Number(it.quantity) || 0), 0) || 0),
      0
    );
    const totalItemGross = transactions.reduce(
      (sum, t) => sum + (t.items?.reduce((isum, it) => isum + (Number(it.totalGross) || 0), 0) || (Number(t.grossAmount) || 0)),
      0
    );
    const totalGrossSum = transactions.reduce((sum, t) => sum + (Number(t.grossAmount) || 0), 0);
    const totalBuyerTaxSum = transactions.reduce((sum, t) => sum + (Number(t.buyerTaxAmount) || 0), 0);
    const totalFromBuyerSum = transactions.reduce((sum, t) => sum + (Number(t.totalFromBuyer) || 0), 0);
    const totalSellerTaxSum = transactions.reduce((sum, t) => sum + (Number(t.sellerTaxAmount) || 0), 0);
    const totalNetSellerSum = transactions.reduce((sum, t) => sum + (Number(t.netToSeller) || 0), 0);
    const totalHarajProfitSum = transactions.reduce((sum, t) => sum + (Number(t.harajProfit) || 0), 0);

    const totalRowIndex = currentRow;
    rowBgMap[totalRowIndex] = 'E2E8F0';

    const totalsRow: (string | number)[] = [
      'الإجمالي الكلي',
      '',
      '',
      '',
      '',
      '',
      '',
      `العدد: ${transactions.length} شروة`,
      totalQty,
      '',
      '',
      totalItemGross,
      totalGrossSum,
      totalBuyerTaxSum,
      totalFromBuyerSum,
      totalSellerTaxSum,
      totalNetSellerSum,
      totalHarajProfitSum,
      '',
      '',
    ];
    rows.push(totalsRow);
    currentRow++;

    merges.push({
      s: { r: totalRowIndex, c: 0 },
      e: { r: totalRowIndex, c: 6 },
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  if (merges.length > 0) {
    ws['!merges'] = merges;
  }

  // Right-to-Left sheet view for Arabic
  ws['!views'] = [{ RTL: true }];

  // Auto-fit / set column widths
  ws['!cols'] = [
    { wch: 16 }, // رقم الفاتورة
    { wch: 13 }, // التاريخ
    { wch: 10 }, // الوقت
    { wch: 22 }, // الصياد
    { wch: 15 }, // هاتف البائع
    { wch: 22 }, // المشتري
    { wch: 15 }, // هاتف المشتري
    { wch: 18 }, // الصنف
    { wch: 10 }, // الكمية
    { wch: 10 }, // الوحدة
    { wch: 13 }, // سعر الوحدة
    { wch: 14 }, // إجمالي الصنف
    { wch: 16 }, // إجمالي الفاتورة الأساسي
    { wch: 14 }, // عمولة المشتري
    { wch: 17 }, // المطلوب من المشتري
    { wch: 14 }, // عمولة البائع
    { wch: 17 }, // الصافي للصياد
    { wch: 15 }, // عمولة الحراج
    { wch: 14 }, // حالة الدفع
    { wch: 26 }, // الملاحظات
  ];

  // Apply Styling to Match Previous Table Design
  const headerBorder = {
    top: { style: 'medium', color: { rgb: '0F172A' } },
    bottom: { style: 'medium', color: { rgb: '0F172A' } },
    left: { style: 'thin', color: { rgb: '64748B' } },
    right: { style: 'thin', color: { rgb: '64748B' } },
  };

  const cellBorder = {
    top: { style: 'thin', color: { rgb: 'CBD5E1' } },
    bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
    left: { style: 'thin', color: { rgb: 'CBD5E1' } },
    right: { style: 'thin', color: { rgb: 'CBD5E1' } },
  };

  // 1. Style Header Row (Row 0)
  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: headers[c] };
    ws[addr].s = {
      fill: { fgColor: { rgb: '1E3A8A' } }, // Deep Navy Blue
      font: { name: 'Segoe UI', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: headerBorder,
    };
  }

  // 2. Style Data Rows (Rows 1 to currentRow - 1)
  for (let r = 1; r < currentRow; r++) {
    const rowBg = rowBgMap[r] || 'FFFFFF';
    for (let c = 0; c < headers.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) {
        ws[addr] = { t: 's', v: '' };
      }

      let fontColor = '0F172A';
      let isBold = (r === currentRow - 1 && transactions.length > 0);
      let numFmt: string | undefined = undefined;

      if (c === 8) {
        // الكمية
        numFmt = '#,##0.##';
      } else if (c === 10 || c === 11 || c === 12 || c === 13 || c === 15) {
        // أسعار وإجماليات
        isBold = c === 11 || c === 12;
        numFmt = '#,##0.00';
      } else if (c === 14) {
        // المطلوب من المشتري (.text-red)
        isBold = true;
        fontColor = 'B91C1C';
        numFmt = '#,##0.00';
      } else if (c === 16) {
        // الصافي للصياد (.text-green)
        isBold = true;
        fontColor = '15803D';
        numFmt = '#,##0.00';
      } else if (c === 17) {
        // عمولة الحراج (.text-blue)
        isBold = true;
        fontColor = '4338CA';
        numFmt = '#,##0.00';
      } else if (c === 18) {
        // حالة الدفع
        isBold = true;
        const val = String(ws[addr].v || '');
        if (val === 'مدفوع') fontColor = '15803D';
        else if (val === 'تمت التسوية') fontColor = '1D4ED8';
        else fontColor = 'B45309';
      }

      ws[addr].s = {
        fill: { fgColor: { rgb: rowBg } },
        font: { name: 'Segoe UI', sz: 10, bold: isBold, color: { rgb: fontColor } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: cellBorder,
      };

      if (numFmt && typeof ws[addr].v === 'number') {
        ws[addr].z = numFmt;
      }
    }
  }

  // Row heights
  ws['!rows'] = [{ hpt: 30 }];
  for (let r = 1; r < currentRow; r++) {
    ws['!rows'].push({ hpt: 22 });
  }

  const wb = XLSX.utils.book_new();
  wb.Workbook = {
    Views: [{ RTL: true }],
  };
  XLSX.utils.book_append_sheet(wb, ws, 'سجل العمليات');

  const safeFilename = filename.replace(/\.xlsx?$/i, '') + '.xlsx';

  try {
    XLSX.writeFile(wb, safeFilename);
  } catch (err) {
    console.warn('XLSX.writeFile fallback to manual Blob download:', err);
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export function exportTransactionsExcel(transactions: Transaction[]): string {
  let html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <style>
        table { border-collapse: collapse; width: 100%; direction: rtl; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
        th { background-color: #1e3a8a; color: white; font-weight: bold; border: 1px solid #94a3b8; padding: 10px; text-align: center; }
        td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; vertical-align: middle; }
        .row-alt { background-color: #f8fafc; }
        .row-main { background-color: #ffffff; }
        .money { font-weight: bold; }
        .text-red { color: #b91c1c; }
        .text-green { color: #15803d; }
        .text-blue { color: #4338ca; }
      </style>
    </head>
    <body>
      <table>
        <thead>
          <tr>
            <th>رقم الفاتورة</th>
            <th>التاريخ</th>
            <th>الوقت</th>
            <th>الصياد</th>
            <th>هاتف البائع</th>
            <th>المشتري</th>
            <th>هاتف المشتري</th>
            <th>الصنف</th>
            <th>الكمية</th>
            <th>الوحدة</th>
            <th>سعر الوحدة</th>
            <th>إجمالي الصنف</th>
            <th>إجمالي الفاتورة الأساسي</th>
            <th>عمولة المشتري</th>
            <th>المطلوب من المشتري</th>
            <th>عمولة البائع</th>
            <th>الصافي للصياد</th>
            <th>عمولة الحراج</th>
            <th>حالة الدفع</th>
            <th>الملاحظات</th>
          </tr>
        </thead>
        <tbody>
  `;

  transactions.forEach((t, i) => {
    const rowClass = i % 2 === 0 ? 'row-main' : 'row-alt';
    const items = t.items && t.items.length > 0 ? t.items : [{ fishName: '-', quantity: 0, unit: '-', unitPrice: 0, totalGross: 0 }];
    const rowSpan = items.length;
    
    items.forEach((item, index) => {
      html += `<tr class="${rowClass}">`;
      
      // Transaction details only on the first row of this transaction
      if (index === 0) {
        html += `<td rowspan="${rowSpan}">${t.id || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.dateStr || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.timeStr || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.sellerName || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.sellerPhone || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.buyerName || '-'}</td>`;
        html += `<td rowspan="${rowSpan}">${t.buyerPhone || '-'}</td>`;
      }
      
      // Item specifics
      html += `<td>${item.fishName || '-'}</td>`;
      html += `<td>${item.quantity || 0}</td>`;
      html += `<td>${item.unit || '-'}</td>`;
      html += `<td>${item.unitPrice || 0}</td>`;
      html += `<td class="money">${item.totalGross || 0}</td>`;
      
      // Totals only on the first row
      if (index === 0) {
        html += `<td rowspan="${rowSpan}" class="money">${t.grossAmount || 0}</td>`;
        html += `<td rowspan="${rowSpan}">${t.buyerTaxAmount || 0}</td>`;
        html += `<td rowspan="${rowSpan}" class="money text-red">${t.totalFromBuyer || 0}</td>`;
        html += `<td rowspan="${rowSpan}">${t.sellerTaxAmount || 0}</td>`;
        html += `<td rowspan="${rowSpan}" class="money text-green">${t.netToSeller || 0}</td>`;
        html += `<td rowspan="${rowSpan}" class="money text-blue">${t.harajProfit || 0}</td>`;
        
        const pStatus = t.paymentStatus === 'paid' ? 'مدفوع' : t.paymentStatus === 'settled' ? 'تمت التسوية' : 'معلق';
        html += `<td rowspan="${rowSpan}">${pStatus}</td>`;
        html += `<td rowspan="${rowSpan}">${t.notes || '-'}</td>`;
      }
      
      html += `</tr>`;
    });
  });

  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;
  
  return html;
}

export function triggerDownloadFile(content: string, filename: string, mimeType: string = 'application/json'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats?: {
    transactionsCount: number;
    transactionsAdded?: number;
    transactionsSkipped?: number;
    contactsCount: number;
    contactsAdded?: number;
    contactsSkipped?: number;
    fishTypesCount: number;
    fishTypesAdded?: number;
    fishTypesSkipped?: number;
    cashEntriesCount?: number;
    cashEntriesAdded?: number;
    cashEntriesSkipped?: number;
    settingsIncluded: boolean;
    settingsUpdated?: boolean;
  };
  mergedPayload?: {
    transactions: Transaction[];
    contacts: Contact[];
    fishTypes: FishType[];
    cashEntries: CashEntry[];
    cashClosings: CashDayCloseRecord[];
    lotTransfers?: LotTransferRecord[];
    settings?: MarketSettings;
    importSettings?: boolean;
  };
}

export interface ParsedBackupResult {
  success: boolean;
  error?: string;
  data?: {
    exportDate?: string;
    exportDateFormatted?: string;
    system?: string;
    version?: string;
    settings?: MarketSettings;
    transactions?: Transaction[];
    contacts?: Contact[];
    fishTypes?: FishType[];
    cashEntries?: CashEntry[];
    cashClosings?: CashDayCloseRecord[];
    lotTransfers?: LotTransferRecord[];
  };
  cleanJsonString?: string;
}

/**
 * تحليل ذكي فائق المرونة لمحتوى ملف النسخة الاحتياطية:
 * - يدعم ملفات UTF-8 مع أو بدون BOM (\uFEFF)
 * - يتجاهل وسوم الماركداون (```json) في حال نُسخ النص من بيئة أخرى
 * - يدعم فك الأغلفة المتعددة (data, payload, backupData, default)
 * - يدعم الملفات التي تحتوي على مصفوفة فواتير مباشرة [ { ... } ]
 * - يكتشف الملفات الفارغة أو غير المتوافقة ويوجه المستخدم برسالة واضحة
 */
export function parseBackupFileContent(rawContent: string): ParsedBackupResult {
  if (!rawContent || !rawContent.trim()) {
    return {
      success: false,
      error: 'ملف النسخة الاحتياطية فارغ تماماً (حجمه 0 بايت). يرجى اختيار ملف نسخة احتياطية صالح يحتوي على بيانات.',
    };
  }

  // 1. إزالة BOM والمسافات والرموز غير المرئية من البداية
  let text = rawContent.replace(/^\uFEFF/, '').trim();

  // 2. إزالة وسوم الكود البرمجي (Markdown code fences) إن وُجدت
  if (text.startsWith('```json')) {
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
  } else if (text.startsWith('```')) {
    text = text.replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
  }

  // 3. التحقق إن كان الملف بصيغة أخرى بالخطأ (مثل ملف إكسل مضغوط PK)
  if (text.startsWith('PK\x03\x04') || text.startsWith('PK')) {
    return {
      success: false,
      error: 'الملف المحدد هو ملف Excel مضغوط (.xlsx) وليس ملف نسخة احتياطية (.json). يرجى اختيار ملف النسخة الاحتياطية الصحيح.',
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err1) {
    // محاولة فك التشفير في حال كان النص مُشفر مرتين (double-stringified)
    try {
      parsed = JSON.parse(JSON.parse(text));
    } catch {
      return {
        success: false,
        error: 'تعذر قراءة صيغة الملف؛ محتوى الملف ليس بصيغة JSON صحيحة أو تالف. يرجى التأكد من اختيار ملف .json سليم.',
      };
    }
  }

  // فك التشفير إذا كان الناتج نصاً
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {}
  }

  // 4. فك الأغلفة المتعددة الشائعة (backupData, payload, data, default)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (parsed.backupData && typeof parsed.backupData === 'object') {
      parsed = parsed.backupData;
    } else if (parsed.payload && typeof parsed.payload === 'object') {
      parsed = parsed.payload;
    } else if (parsed.data && typeof parsed.data === 'object' && !parsed.transactions && !parsed.contacts) {
      parsed = parsed.data;
    }
  }

  // 5. دعم استيراد مصفوفة فواتير مباشرة
  if (Array.isArray(parsed)) {
    parsed = {
      transactions: parsed,
      exportDate: new Date().toISOString(),
      exportDateFormatted: 'نسخة مستوردة مباشرة',
    };
  }

  // 6. دعم التسميات القديمة أو البديلة (invoices, orders, records, clients, products)
  if (parsed && typeof parsed === 'object') {
    if (!parsed.transactions && (parsed.invoices || parsed.orders || parsed.records || parsed.txs)) {
      parsed.transactions = parsed.invoices || parsed.orders || parsed.records || parsed.txs;
    }
    if (!parsed.contacts && (parsed.customers || parsed.clients || parsed.parties)) {
      parsed.contacts = parsed.customers || parsed.clients || parsed.parties;
    }
    if (!parsed.fishTypes && (parsed.categories || parsed.products || parsed.items_list)) {
      parsed.fishTypes = parsed.categories || parsed.products || parsed.items_list;
    }
  }

  const hasTransactions = Array.isArray(parsed?.transactions) && parsed.transactions.length > 0;
  const hasContacts = Array.isArray(parsed?.contacts) && parsed.contacts.length > 0;
  const hasFishTypes = Array.isArray(parsed?.fishTypes) && parsed.fishTypes.length > 0;
  const hasCashEntries = Array.isArray(parsed?.cashEntries) && parsed.cashEntries.length > 0;
  const hasCashClosings = Array.isArray(parsed?.cashClosings) && parsed.cashClosings.length > 0;
  const hasSettings = Boolean(parsed?.settings);

  if (!parsed || (!hasTransactions && !hasContacts && !hasFishTypes && !hasCashEntries && !hasCashClosings && !hasSettings)) {
    return {
      success: false,
      error: 'ملف النسخة الاحتياطية فارغ أو لا يحتوي على أي فواتير أو جهات اتصال أو أصناف صالحة.',
    };
  }

  return {
    success: true,
    data: parsed,
    cleanJsonString: JSON.stringify(parsed),
  };
}

/**
 * دالة الدمج الذكي للنسخ الاحتياطي (Smart Merge Backup)
 * - لا تمسح أي بيان موجود مسبقاً
 * - تمنع تكرار السجلات (ON CONFLICT IGNORE / DO NOTHING) بناءً على المعرّف id
 * - ترتب السجلات زمنياً حسب الطابع الزمني timestamp
 * - تحافظ على إعدادات الجهاز الحالية ما لم يطلب المستخدم تحديثها
 */
export function importData(jsonStringOrData: string | any, options?: { overwriteSettings?: boolean }): ImportResult {
  try {
    let data: any;
    if (typeof jsonStringOrData === 'string') {
      const parseRes = parseBackupFileContent(jsonStringOrData);
      if (!parseRes.success || !parseRes.data) {
        return {
          success: false,
          message: parseRes.error || 'الملف غير صالح، تأكد من اختيار ملف نسخة احتياطية بصيغة JSON صحيحة',
        };
      }
      data = parseRes.data;
    } else if (jsonStringOrData && typeof jsonStringOrData === 'object') {
      data = jsonStringOrData;
    } else {
      return {
        success: false,
        message: 'البيانات الممررة للاستعادة غير صالحة',
      };
    }

    // 1. الدمج الذكي للفواتير والشروات
    let transactionsAdded = 0;
    let transactionsSkipped = 0;
    const currentTransactions = loadTransactions();
    const existingTxMap = new Map<string, Transaction>();
    for (const t of currentTransactions) {
      if (t && t.id) existingTxMap.set(t.id, t);
    }

    if (data.transactions && Array.isArray(data.transactions)) {
      for (const t of data.transactions) {
        if (!t || !t.id) continue;
        if (existingTxMap.has(t.id)) {
          transactionsSkipped++;
        } else {
          existingTxMap.set(t.id, t);
          transactionsAdded++;
        }
      }
    }
    // الترتيب الزمني التنازلي: الفواتير القديمة والجديدة تأخذ مكانها الزمني الدقيق
    const mergedTransactions = Array.from(existingTxMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    saveTransactions(mergedTransactions);

    // 2. الدمج الذكي لجهات الاتصال (صيادين / مشترين)
    let contactsAdded = 0;
    let contactsSkipped = 0;
    const currentContacts = deduplicateContactsList(loadContacts());
    const existingContactsById = new Map<string, Contact>();
    const existingContactsByKey = new Map<string, Contact>();

    for (const c of currentContacts) {
      if (c && c.id) existingContactsById.set(c.id, c);
      if (c && c.name) {
        const key = `${c.name.trim().replace(/\s+/g, ' ').toLowerCase()}_${c.type || 'buyer'}`;
        existingContactsByKey.set(key, c);
      }
    }

    if (data.contacts && Array.isArray(data.contacts)) {
      for (const c of data.contacts) {
        if (!c || !c.name) continue;
        const normName = c.name.trim().replace(/\s+/g, ' ').toLowerCase();
        const typeKey = `${normName}_${c.type || 'buyer'}`;

        if ((c.id && existingContactsById.has(c.id)) || existingContactsByKey.has(typeKey)) {
          contactsSkipped++;
          const existing = (c.id && existingContactsById.get(c.id)) || existingContactsByKey.get(typeKey);
          if (existing) {
            if (!existing.phone && c.phone) existing.phone = c.phone;
            if (!existing.notes && c.notes) existing.notes = c.notes;
          }
        } else {
          const contactId = c.id || `contact-${Date.now()}-${Math.random().toString().slice(-4)}`;
          const newContact = { ...c, id: contactId };
          existingContactsById.set(contactId, newContact);
          existingContactsByKey.set(typeKey, newContact);
          contactsAdded++;
        }
      }
    }
    // 2.1 استخراج جهات الاتصال (صيادين / مشترين) المذكورة في الفواتير لضمان عدم ضياعهم
    if (data.transactions && Array.isArray(data.transactions)) {
      for (const t of data.transactions) {
        if (t.sellerName) {
          const sNorm = t.sellerName.trim().replace(/\s+/g, ' ').toLowerCase();
          const sKey = `${sNorm}_seller`;
          const bKey = `${sNorm}_buyer`;
          if (!existingContactsByKey.has(sKey) && !existingContactsByKey.has(bKey) && (!t.sellerId || !existingContactsById.has(t.sellerId))) {
            const sContact: Contact = {
              id: t.sellerId || `contact-${Date.now()}-${Math.random().toString().slice(-4)}`,
              name: t.sellerName.trim(),
              phone: t.sellerPhone || '',
              type: 'seller',
              createdAt: t.dateStr || new Date().toISOString().slice(0, 10),
            };
            existingContactsById.set(sContact.id, sContact);
            existingContactsByKey.set(sKey, sContact);
            contactsAdded++;
          }
        }
        if (t.buyerName) {
          const bNorm = t.buyerName.trim().replace(/\s+/g, ' ').toLowerCase();
          const bKey = `${bNorm}_buyer`;
          if (!existingContactsByKey.has(bKey) && (!t.buyerId || !existingContactsById.has(t.buyerId))) {
            const bContact: Contact = {
              id: t.buyerId || `contact-${Date.now()}-${Math.random().toString().slice(-4)}`,
              name: t.buyerName.trim(),
              phone: t.buyerPhone || '',
              type: 'buyer',
              createdAt: t.dateStr || new Date().toISOString().slice(0, 10),
            };
            existingContactsById.set(bContact.id, bContact);
            existingContactsByKey.set(bKey, bContact);
            contactsAdded++;
          }
        }
      }
    }

    const mergedContacts = Array.from(existingContactsByKey.values()).sort(
      (a, b) => (a.name || '').localeCompare(b.name || '', 'ar')
    );
    saveContacts(mergedContacts);

    // 3. الدمج الذكي لأصناف الأسماك
    let fishTypesAdded = 0;
    let fishTypesSkipped = 0;
    const currentFishTypes = deduplicateFishTypesList(loadFishTypes());
    const existingFishById = new Map<string, FishType>();
    const existingFishByName = new Map<string, FishType>();

    for (const f of currentFishTypes) {
      if (f && f.id) existingFishById.set(f.id, f);
      if (f && f.name) {
        existingFishByName.set(f.name.trim().replace(/\s+/g, ' ').toLowerCase(), f);
      }
    }

    if (data.fishTypes && Array.isArray(data.fishTypes)) {
      for (const f of data.fishTypes) {
        if (!f || !f.name) continue;
        const normName = f.name.trim().replace(/\s+/g, ' ').toLowerCase();
        if ((f.id && existingFishById.has(f.id)) || existingFishByName.has(normName)) {
          fishTypesSkipped++;
        } else {
          const fishId = f.id || `fish-${Date.now()}-${Math.random().toString().slice(-4)}`;
          const newFish = { ...f, id: fishId };
          existingFishById.set(fishId, newFish);
          existingFishByName.set(normName, newFish);
          fishTypesAdded++;
        }
      }
    }
    const mergedFishTypes = Array.from(existingFishByName.values()).sort(
      (a, b) => (a.name || '').localeCompare(b.name || '', 'ar')
    );
    saveFishTypes(mergedFishTypes);

    // 4. الدمج الذكي لقيود الخزينة (سندات القبض والصرف)
    let cashEntriesAdded = 0;
    let cashEntriesSkipped = 0;
    const currentCashEntries = loadCashEntries();
    const existingCashMap = new Map<string, CashEntry>();
    for (const ce of currentCashEntries) {
      if (ce && ce.id) existingCashMap.set(ce.id, ce);
    }

    if (data.cashEntries && Array.isArray(data.cashEntries)) {
      for (const ce of data.cashEntries) {
        if (!ce || !ce.id) continue;
        if (existingCashMap.has(ce.id)) {
          cashEntriesSkipped++;
        } else {
          existingCashMap.set(ce.id, ce);
          cashEntriesAdded++;
        }
      }
    }
    const mergedCashEntries = Array.from(existingCashMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    saveCashEntries(mergedCashEntries);

    // 5. الدمج الذكي لإقفالات الصندوق
    const currentClosings = loadCashClosings();
    const existingClosingsMap = new Map<string, CashDayCloseRecord>();
    for (const cc of currentClosings) {
      if (cc && cc.id) existingClosingsMap.set(cc.id, cc);
    }

    if (data.cashClosings && Array.isArray(data.cashClosings)) {
      for (const cc of data.cashClosings) {
        if (!cc || !cc.id) continue;
        if (!existingClosingsMap.has(cc.id)) {
          existingClosingsMap.set(cc.id, cc);
        }
      }
    }
    const mergedCashClosings = Array.from(existingClosingsMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    saveCashClosings(mergedCashClosings);

    // 5.5 الدمج الذكي لسجلات تحويل الشروات بين المشترين (Lot Transfers)
    const currentLotTransfers = loadLotTransfers();
    const existingTransfersMap = new Map<string, LotTransferRecord>();
    for (const lt of currentLotTransfers) {
      if (lt && lt.id) existingTransfersMap.set(lt.id, lt);
    }
    if (data.lotTransfers && Array.isArray(data.lotTransfers)) {
      for (const lt of data.lotTransfers) {
        if (!lt || !lt.id) continue;
        if (!existingTransfersMap.has(lt.id)) {
          existingTransfersMap.set(lt.id, lt);
        }
      }
    }
    const mergedLotTransfers = Array.from(existingTransfersMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    saveLotTransfers(mergedLotTransfers);

    // 6. الإعدادات: الحفاظ على إعدادات الجهاز الحالي إلا إذا طُلب صراحة تحديثها
    let settingsUpdated = false;
    const currentSettings = loadSettings();
    let finalSettings = currentSettings;
    if (options?.overwriteSettings && data.settings) {
      saveSettings(data.settings);
      finalSettings = data.settings;
      settingsUpdated = true;
    }

    return {
      success: true,
      message: `تم الدمج الذكي بنجاح: أُضيفت ${transactionsAdded} شروة جديدة، وتجاوز النظام ${transactionsSkipped} شروة موجودة مسبقاً لمنع التكرار.`,
      stats: {
        transactionsCount: mergedTransactions.length,
        transactionsAdded,
        transactionsSkipped,
        contactsCount: mergedContacts.length,
        contactsAdded,
        contactsSkipped,
        fishTypesCount: mergedFishTypes.length,
        fishTypesAdded,
        fishTypesSkipped,
        cashEntriesCount: mergedCashEntries.length,
        cashEntriesAdded,
        cashEntriesSkipped,
        settingsIncluded: !!data.settings,
        settingsUpdated,
      },
      mergedPayload: {
        transactions: mergedTransactions,
        contacts: mergedContacts,
        fishTypes: mergedFishTypes,
        cashEntries: mergedCashEntries,
        cashClosings: mergedCashClosings,
        lotTransfers: mergedLotTransfers,
        settings: finalSettings,
        importSettings: settingsUpdated,
      },
    };
  } catch (e) {
    console.error('Failed to smart-merge data', e);
    return {
      success: false,
      message: 'الملف غير صالح أو تالف، تأكد من اختيار ملف نسخة احتياطية بصيغة JSON صحيحة',
    };
  }
}

export function resetAllDataToDefault(): void {
  saveTransactions([]);
  saveContacts([]);
  saveCashEntries([]);
  saveCashClosings([]);
  localStorage.setItem('haraj_user_cleared_all', 'true');
}

export function wipeAllSystemData(): void {
  resetAllDataToDefault();
}

