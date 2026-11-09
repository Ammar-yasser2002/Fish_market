import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction } from '../types';
import { db } from '../firebase/firebaseConfig';

// Use the single Firebase instance configured for desktop authentication.
export { db };

// Test connection as required by Firebase skill
export async function testFirestoreConnection(): Promise<{ connected: boolean; message?: string }> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { connected: true, message: 'متصل بنجاح مع Firestore السحابي' };
  } catch (error: any) {
    if (error?.message?.includes('the client is offline') || error?.code === 'unavailable') {
      console.warn('Firestore client is running in offline-persisted mode.');
      return { connected: false, message: 'جاري العمل في وضع عدم الاتصال / التزامن المحلي' };
    }
    // Document might not exist, but network reachability succeeded
    return { connected: true, message: 'قاعدة البيانات السحابية نشطة' };
  }
}

// -------------------------------------------------------------
// Transactions Cloud Persistence (فواتير الحراج والصفقات)
// -------------------------------------------------------------
export async function saveTransactionToCloud(transaction: Transaction): Promise<void> {
  try {
    const docRef = doc(db, 'transactions', transaction.id);
    await setDoc(docRef, transaction, { merge: true });
  } catch (err) {
    console.error('Failed to save transaction to cloud:', err);
    throw err;
  }
}

export async function deleteTransactionFromCloud(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'transactions', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete transaction from cloud:', err);
    throw err;
  }
}

export async function fetchTransactionsFromCloud(maxCount = 1000): Promise<Transaction[]> {
  try {
    const q = query(
      collection(db, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(maxCount)
    );
    const snapshot = await getDocs(q);
    const list: Transaction[] = [];
    snapshot.forEach((snap) => {
      list.push(snap.data() as Transaction);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch transactions from cloud, using local storage:', err);
    return [];
  }
}

export function subscribeToTransactions(
  onUpdate: (transactions: Transaction[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'transactions'),
    orderBy('timestamp', 'desc'),
    limit(500)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((snap) => {
        list.push(snap.data() as Transaction);
      });
      onUpdate(list);
    },
    (err) => {
      console.warn('Transactions real-time listener error:', err);
    }
  );
}

// -------------------------------------------------------------
// Contacts Cloud Persistence (دليل الصيادين والمراكب والتجار)
// -------------------------------------------------------------
export async function saveContactToCloud(contact: Contact): Promise<void> {
  try {
    const docRef = doc(db, 'contacts', contact.id);
    await setDoc(docRef, contact, { merge: true });
  } catch (err) {
    console.error('Failed to save contact to cloud:', err);
  }
}

export async function deleteContactFromCloud(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'contacts', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete contact from cloud:', err);
  }
}

export async function fetchContactsFromCloud(): Promise<Contact[]> {
  try {
    const snapshot = await getDocs(collection(db, 'contacts'));
    const list: Contact[] = [];
    snapshot.forEach((snap) => {
      list.push(snap.data() as Contact);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch contacts from cloud:', err);
    return [];
  }
}

// -------------------------------------------------------------
// Fish Types Cloud Persistence (أصناف الأسماك والوحدات)
// -------------------------------------------------------------
export async function saveFishTypeToCloud(fishType: FishType): Promise<void> {
  try {
    const docRef = doc(db, 'fishTypes', fishType.id);
    await setDoc(docRef, fishType, { merge: true });
  } catch (err) {
    console.error('Failed to save fish type to cloud:', err);
  }
}

export async function deleteFishTypeFromCloud(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'fishTypes', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete fish type from cloud:', err);
  }
}

export async function fetchFishTypesFromCloud(): Promise<FishType[]> {
  try {
    const snapshot = await getDocs(collection(db, 'fishTypes'));
    const list: FishType[] = [];
    snapshot.forEach((snap) => {
      list.push(snap.data() as FishType);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch fish types from cloud:', err);
    return [];
  }
}

// -------------------------------------------------------------
// Market Settings Cloud Persistence (إعدادات النظام والعمولات)
// -------------------------------------------------------------
export async function saveSettingsToCloud(settings: MarketSettings): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'global');
    await setDoc(docRef, settings, { merge: true });
  } catch (err) {
    console.error('Failed to save settings to cloud:', err);
  }
}

export async function fetchSettingsFromCloud(): Promise<MarketSettings | null> {
  try {
    const docRef = doc(db, 'settings', 'global');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as MarketSettings;
    }
  } catch (err) {
    console.warn('Could not fetch settings from cloud:', err);
  }
  return null;
}

// -------------------------------------------------------------
// Cash Box Persistence (حركات الصندوق واليومية ومحاضر الإقفال)
// -------------------------------------------------------------
export async function saveCashEntryToCloud(entry: CashEntry): Promise<void> {
  try {
    const docRef = doc(db, 'cashEntries', entry.id);
    await setDoc(docRef, entry, { merge: true });
  } catch (err) {
    console.error('Failed to save cash entry to cloud:', err);
    throw err;
  }
}

export async function deleteCashEntryFromCloud(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'cashEntries', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete cash entry from cloud:', err);
    throw err;
  }
}

export async function fetchCashEntriesFromCloud(maxCount = 1000): Promise<CashEntry[]> {
  try {
    const q = query(
      collection(db, 'cashEntries'),
      orderBy('timestamp', 'desc'),
      limit(maxCount)
    );
    const snapshot = await getDocs(q);
    const list: CashEntry[] = [];
    snapshot.forEach((snap) => {
      list.push(snap.data() as CashEntry);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch cash entries from cloud:', err);
    return [];
  }
}

export async function saveCashClosingToCloud(closing: CashDayCloseRecord): Promise<void> {
  try {
    const docRef = doc(db, 'cashClosings', closing.id);
    await setDoc(docRef, closing, { merge: true });
  } catch (err) {
    console.error('Failed to save cash closing to cloud:', err);
    throw err;
  }
}

export async function fetchCashClosingsFromCloud(maxCount = 500): Promise<CashDayCloseRecord[]> {
  try {
    const q = query(
      collection(db, 'cashClosings'),
      orderBy('timestamp', 'desc'),
      limit(maxCount)
    );
    const snapshot = await getDocs(q);
    const list: CashDayCloseRecord[] = [];
    snapshot.forEach((snap) => {
      list.push(snap.data() as CashDayCloseRecord);
    });
    return list;
  } catch (err) {
    console.warn('Could not fetch cash closings from cloud:', err);
    return [];
  }
}

