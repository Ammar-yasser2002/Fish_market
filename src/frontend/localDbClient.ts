import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction } from '../types';

export interface LocalDbStats {
  type: string;
  file?: string;
  fileSize?: string;
  journalMode?: string;
  status: string;
  isLocal: boolean;
  counts?: {
    transactions: number;
    contacts: number;
    fishTypes: number;
    cashEntries: number;
    cashClosings: number;
  };
  features?: string[];
}

export interface LocalDbConnectionResult {
  connected: boolean;
  isLocal: boolean;
  stats?: LocalDbStats;
  message: string;
}

// -------------------------------------------------------------
// Connectivity & Health
// -------------------------------------------------------------
export async function testLocalDbConnection(): Promise<LocalDbConnectionResult> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) throw new Error('API server returned error');
    const data = await res.json();
    const isDbConnected = data.status === 'online' && data.database?.status === 'active_postgresql_ready';
    return {
      connected: Boolean(isDbConnected),
      isLocal: true,
      stats: data.database,
      message: isDbConnected
        ? 'متصل بنجاح بقاعدة البيانات (PostgreSQL)'
        : 'قاعدة البيانات غير متصلة (وضع التخزين الاحتياطي المحلي)',
    };
  } catch (error: any) {
    return {
      connected: false,
      isLocal: true,
      message: 'الخادم المحلي غير متصل حالياً (يعمل التطبيق في وضع التخزين الاحتياطي المحلي)',
    };
  }
}

// -------------------------------------------------------------
// Transactions (فواتير الحراج والصفقات)
// -------------------------------------------------------------
export async function fetchTransactionsFromLocalDb(): Promise<Transaction[]> {
  try {
    const res = await fetch('/api/transactions');
    if (!res.ok) throw new Error('Failed to fetch transactions');
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch transactions from local SQLite backend, falling back to cache:', err);
    return [];
  }
}

export async function saveTransactionToLocalDb(transaction: Transaction): Promise<void> {
  try {
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    });
  } catch (err) {
    console.warn('Failed to persist transaction to local SQLite DB:', err);
  }
}

export async function deleteTransactionFromLocalDb(id: string): Promise<void> {
  try {
    await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Failed to delete transaction from local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Contacts (دليل الصيادين والمراكب والتجار)
// -------------------------------------------------------------
export async function fetchContactsFromLocalDb(): Promise<Contact[]> {
  try {
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error('Failed to fetch contacts');
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch contacts from local SQLite DB:', err);
    return [];
  }
}

export async function saveContactToLocalDb(contact: Contact): Promise<void> {
  try {
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact),
    });
  } catch (err) {
    console.warn('Failed to persist contact to local SQLite DB:', err);
  }
}

export async function deleteContactFromLocalDb(id: string): Promise<void> {
  try {
    await fetch(`/api/contacts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Failed to delete contact from local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Fish Types (أصناف الأسماك والوحدات)
// -------------------------------------------------------------
export async function fetchFishTypesFromLocalDb(): Promise<FishType[]> {
  try {
    const res = await fetch('/api/fish-types');
    if (!res.ok) throw new Error('Failed to fetch fish types');
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch fish types from local SQLite DB:', err);
    return [];
  }
}

export async function saveFishTypeToLocalDb(fishType: FishType): Promise<void> {
  try {
    await fetch('/api/fish-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fishType),
    });
  } catch (err) {
    console.warn('Failed to persist fish type to local SQLite DB:', err);
  }
}

export async function deleteFishTypeFromLocalDb(id: string): Promise<void> {
  try {
    await fetch(`/api/fish-types/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Failed to delete fish type from local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Market Settings (إعدادات النظام والعمولات)
// -------------------------------------------------------------
export async function fetchSettingsFromLocalDb(): Promise<MarketSettings | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    const data = await res.json();
    return data && Object.keys(data).length > 0 ? data : null;
  } catch (err) {
    console.warn('Could not fetch settings from local SQLite DB:', err);
    return null;
  }
}

export async function saveSettingsToLocalDb(settings: MarketSettings): Promise<void> {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch (err) {
    console.warn('Failed to persist settings to local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Cash Box (حركات الصندوق واليومية)
// -------------------------------------------------------------
export async function fetchCashEntriesFromLocalDb(): Promise<CashEntry[]> {
  try {
    const res = await fetch('/api/cash-entries');
    if (!res.ok) throw new Error('Failed to fetch cash entries');
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch cash entries from local SQLite DB:', err);
    return [];
  }
}

export async function saveCashEntryToLocalDb(entry: CashEntry): Promise<void> {
  try {
    await fetch('/api/cash-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.warn('Failed to persist cash entry to local SQLite DB:', err);
  }
}

export async function deleteCashEntryFromLocalDb(id: string): Promise<void> {
  try {
    await fetch(`/api/cash-entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Failed to delete cash entry from local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Cash Closings (محاضر إقفال اليومية)
// -------------------------------------------------------------
export async function fetchCashClosingsFromLocalDb(): Promise<CashDayCloseRecord[]> {
  try {
    const res = await fetch('/api/cash-closings');
    if (!res.ok) throw new Error('Failed to fetch cash closings');
    return await res.json();
  } catch (err) {
    console.warn('Could not fetch cash closings from local SQLite DB:', err);
    return [];
  }
}

export async function saveCashClosingToLocalDb(closing: CashDayCloseRecord): Promise<void> {
  try {
    await fetch('/api/cash-closings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(closing),
    });
  } catch (err) {
    console.warn('Failed to persist cash closing to local SQLite DB:', err);
  }
}

// -------------------------------------------------------------
// Bulk Sync & Reset
// -------------------------------------------------------------
export async function syncAllToLocalDb(payload: {
  transactions?: Transaction[];
  contacts?: Contact[];
  fishTypes?: FishType[];
  cashEntries?: CashEntry[];
  cashClosings?: CashDayCloseRecord[];
  settings?: MarketSettings;
}): Promise<{ success: boolean; stats?: any }> {
  try {
    const res = await fetch('/api/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to mass-sync to local SQLite DB:', err);
    throw err;
  }
}

export async function smartMergeLocalDb(payload: {
  transactions?: Transaction[];
  contacts?: Contact[];
  fishTypes?: FishType[];
  cashEntries?: CashEntry[];
  cashClosings?: CashDayCloseRecord[];
  settings?: MarketSettings;
  importSettings?: boolean;
}): Promise<{ success: boolean; mode?: string; stats?: any }> {
  try {
    const res = await fetch('/api/backup/smart-merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('فشل دمج البيانات في قاعدة البيانات المحلية');
    return await res.json();
  } catch (err) {
    console.error('Failed to smart-merge with local SQLite DB:', err);
    throw err;
  }
}

export async function clearAllLocalDb(): Promise<boolean> {
  try {
    const res = await fetch('/api/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.error('Failed to clear local SQLite DB:', err);
    return false;
  }
}
