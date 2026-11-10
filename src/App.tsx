import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction } from './types';
import {
  loadCashClosings,
  loadCashEntries,
  loadContacts,
  loadFishTypes,
  loadSettings,
  loadTransactions,
  saveCashClosings,
  saveCashEntries,
  saveContacts,
  saveFishTypes,
  saveSettings,
  saveTransactions,
  clearAllMockData,
  loadLotTransfers,
  saveLotTransfers,
  sanitizeTransactionDates,
  exportAllData,
  normalizeSettings,
} from './utils/storage';
import { LotTransferRecord } from './types';
import { FastEntryPOS } from './components/FastEntryPOS';
import { ReceiptModal } from './components/ReceiptModal';
import { applyTypography } from './utils/typography';
import { Sidebar, NavTabId } from './components/Sidebar';
import { SplashScreen } from './components/SplashScreen';
import { FirebaseLoginScreen } from './components/FirebaseLoginScreen';
import { LoginScreen } from './components/LoginScreen';
import { AuthProvider, useAuth } from './context/AuthContext';

// ── استيراد كافة أقسام وشاشات النظام استيراداً مباشراً لضمان التنقل الفوري اللحظي (0ms) دون أي شاشة بيضاء أو تحميل ──
import { ReportsView } from './components/ReportsView';
import { CashBoxManager } from './components/CashBoxManager';
import { DailyInventoryView } from './components/DailyInventoryView';
import { TransactionsList } from './components/TransactionsList';
import { ContactsManager } from './components/ContactsManager';
import { FishTypesManager } from './components/FishTypesManager';
import { SettingsView } from './components/SettingsView';
import { BackupView } from './components/BackupView';
import { SettingsModal } from './components/SettingsModal';
import { BackupModal } from './components/BackupModal';
import { AssociationProfitModal } from './components/AssociationProfitModal';
import { checkAndTriggerAutoDailyBackup, sendBackupEmailNow } from './services/emailBackupClient';
import { saveBackupToFolder, DEFAULT_GOOGLE_DRIVE_FOLDER } from './services/folderBackupClient';
import { formatCurrency, calculateDrawerCash, reconcileBuyerDebtsWithCashEntries, normalizeBuyerDebtFields, getTransactionBuyerDebt, getCarriedOverBalance, normalizeArabic, formatGregorianDate, formatGregorianTime, calculateDayClosingStats, isSameCalendarDay, getTodayLocalYMD, parseLocalDate } from './utils/calculations';

import {
  Menu,
  Clock,
  Zap,
  Receipt,
  FileText,
  Users,
  Fish,
  Plus,
  Coins,
  TrendingUp,
  Activity,
  Calendar,
  Database,
  Cloud,
  CheckCircle2,
  Download,
  Wallet,
  ClipboardCheck,
  Settings,
  MailCheck,
  Loader2,
} from 'lucide-react';
import {
  testLocalDbConnection,
  saveTransactionToLocalDb,
  deleteTransactionFromLocalDb,
  fetchTransactionsFromLocalDb,
  saveContactToLocalDb,
  deleteContactFromLocalDb,
  fetchContactsFromLocalDb,
  saveFishTypeToLocalDb,
  deleteFishTypeFromLocalDb,
  fetchFishTypesFromLocalDb,
  saveSettingsToLocalDb,
  fetchSettingsFromLocalDb,
  saveCashEntryToLocalDb,
  deleteCashEntryFromLocalDb,
  fetchCashEntriesFromLocalDb,
  saveCashClosingToLocalDb,
  fetchCashClosingsFromLocalDb,
  clearAllLocalDb,
} from './frontend/localDbClient';
import { checkBackendHealth } from './frontend/apiClient';
import {
  executeSaveTransaction,
  executeUpdateTransaction,
  executeDeleteTransaction,
  executeRepayBuyerDebt,
  executePayoutSeller,
  executeDeleteCashEntry,
} from './services/operationsService';
import { dedupeTransactionCashEntries, dedupeTransactionCashEntriesWithRemoved, findUnlinkedRepaymentForTransaction, isTransactionLinkedCashEntry, removeTransactionLinkedCashEntries, reconcileStartupCashEntries } from './utils/cashEntrySync';

const TabLoadingFallback: React.FC = () => null;

// ─── Inner App — يجب أن يكون داخل AuthProvider ───
function AppInner() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<NavTabId>('pos');
  const [cashOpeningRequest, setCashOpeningRequest] = useState(0);

  // Sidebar controls
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const handleToggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  // Core Data State
  const [settings, setSettings] = useState<MarketSettings>(loadSettings);

  // Apply typography (font family and font scaling) across root document
  useEffect(() => {
    applyTypography(settings.fontFamily, settings.fontSizeScale);
  }, [settings.fontFamily, settings.fontSizeScale]);

  const [transactions, setTransactions] = useState<Transaction[]>(loadTransactions);
  const [contacts, setContacts] = useState<Contact[]>(loadContacts);
  const [fishTypes, setFishTypes] = useState<FishType[]>(loadFishTypes);
  const [cashEntries, setCashEntries] = useState<CashEntry[]>(() => {
    const raw = loadCashEntries();
    const cleaned = raw.filter((e) => !e.id.startsWith('CASH-SURP-'));
    if (cleaned.length !== raw.length) {
      saveCashEntries(cleaned);
    }
    return cleaned;
  });
  const [cashClosings, setCashClosings] = useState<CashDayCloseRecord[]>(loadCashClosings);
  const [lotTransfers, setLotTransfers] = useState<LotTransferRecord[]>(loadLotTransfers);
  const [autoCloseDayCheck, setAutoCloseDayCheck] = useState(() => getTodayLocalYMD());

  const cashClosingsRef = useRef(cashClosings);
  useEffect(() => {
    cashClosingsRef.current = cashClosings;
  }, [cashClosings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAutoCloseDayCheck((current) => {
        const today = getTodayLocalYMD();
        return today === current ? current : today;
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Cloud & Backend Status
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'syncing' | 'offline'>('syncing');
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('online');
  // Modals

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptMode, setReceiptMode] = useState<'buyer' | 'seller' | 'both'>('buyer');
  const [selectedTrx, setSelectedTrx] = useState<Transaction | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [associationProfitModalOpen, setAssociationProfitModalOpen] = useState(false);

  // ── Firebase Auth Context ──
  const { user, isAuthenticated, isLoading: isAuthLoading, signOut: firebaseSignOut } = useAuth();

  // ── رمز المرور الرقمي لشاشة البداية وقفل الشاشة (PIN) ──
  const [isPinUnlocked, setIsPinUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('pin_unlocked') === 'true';
  });

  // نمط واجهة الدخول عند قفل الشاشة أو البداية ('pin' أو 'firebase')
  const [authView, setAuthView] = useState<'pin' | 'firebase'>('pin');

  const handlePinSuccess = () => {
    sessionStorage.setItem('pin_unlocked', 'true');
    setIsPinUnlocked(true);
  };

  // Splash screen: show only once per session
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    return sessionStorage.getItem('splash_shown') !== 'true';
  });

  const handleSplashFinish = React.useCallback(() => {
    sessionStorage.setItem('splash_shown', 'true');
    setShowSplash(false);
  }, []);

  // قفل الشاشة والعودة لرمز المرور الرقمي (PIN) دون فقدان جلسة Firebase
  const handleLogout = () => {
    sessionStorage.removeItem('pin_unlocked');
    setIsPinUnlocked(false);
    setAuthView('pin');
  };

  // تسجيل الخروج النهائي من حساب Firebase (اختياري)
  const handleFirebaseSignOut = async () => {
    try {
      await firebaseSignOut();
    } catch (e) {
      console.warn('Logout error:', e);
    }
    sessionStorage.removeItem('pin_unlocked');
    setIsPinUnlocked(false);
    setAuthView('pin');
  };

  // ── الجدولة التلقائية: إرسال نسخة احتياطية دورية عند فتح النظام (كل 24 ساعة) ──
  useEffect(() => {
    if (isAuthenticated && user?.email) {
      checkAndTriggerAutoDailyBackup(user.email, settings, () => {
        return exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings, lotTransfers);
      });
    }
  }, [isAuthenticated, user?.email, settings.emailBackupEnabled]);

  // ── الجدولة التلقائية: إرسال نسخة احتياطية يومياً في الساعة المحددة (مثل 11:00 مساءً) ──
  useEffect(() => {
    const recipient = user?.email || settings.smtpUser;
    if (!recipient || !recipient.includes('@')) return;
    if (settings.emailBackupEnabled === false) return;
    if (settings.emailBackupOnScheduleEnabled === false) return;
    if (!settings.smtpPass?.trim()) return;

    const checkSchedule = () => {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      const targetTimeStr = settings.emailBackupScheduledTime || '23:00';

      const pad = (n: number) => String(n).padStart(2, '0');
      const todayYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const lastScheduledDate = localStorage.getItem('haraj_last_scheduled_email_date');

      // إذا وصلنا للساعة المحددة أو تجاوزناها ولم يتم الإرسال لهذا اليوم بعد
      if (currentTimeStr >= targetTimeStr && lastScheduledDate !== todayYmd) {
        localStorage.setItem('haraj_last_scheduled_email_date', todayYmd);
        const fullBackup = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings, lotTransfers);
        sendBackupEmailNow(
          recipient,
          fullBackup,
          {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            pass: settings.smtpPass,
            secure: settings.smtpSecure,
          },
          {
            subject: `نسخة احتياطية يومية مجدولة (${todayYmd} - الساعة ${targetTimeStr})`,
            triggerReason: `جدولة الإرسال اليومية الثابتة عند الساعة (${targetTimeStr})`,
          }
        ).then(() => {
          console.log(`[AutoEmailBackup] ✓ تم إرسال النسخة اليومية المجدولة بنجاح عند الساعة ${currentTimeStr}`);
        }).catch((err) => {
          console.warn('[AutoEmailBackup] تعذر إرسال النسخة اليومية المجدولة:', err);
        });
      }
    };

    checkSchedule();
    const scheduleInterval = setInterval(checkSchedule, 30000);
    return () => clearInterval(scheduleInterval);
  }, [
    user?.email,
    settings.emailBackupEnabled,
    settings.emailBackupOnScheduleEnabled,
    settings.emailBackupScheduledTime,
    settings.smtpUser,
    settings.smtpPass,
    transactions,
    contacts,
    fishTypes,
    cashEntries,
    cashClosings,
    lotTransfers,
  ]);

  // ── النسخ الاحتياطي التلقائي لمجلد Google Drive / القرص المحلي ──
  useEffect(() => {
    const targetFolder = settings.googleDriveFolderUrl?.trim() || DEFAULT_GOOGLE_DRIVE_FOLDER;

    // 1. حفظ نسخة احتياطية أولية بعد فتح التطبيق بـ 4 ثوانٍ
    const initialTimer = setTimeout(() => {
      if (transactions.length > 0 || contacts.length > 0) {
        const fullBackup = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings, lotTransfers);
        saveBackupToFolder(targetFolder, fullBackup).catch((err) => console.warn('Auto Drive initial backup error:', err));
      }
    }, 4000);

    // 2. تكرار الحفظ تلقائياً في المجلد كل ساعة (60 دقيقة)
    const intervalTimer = setInterval(() => {
      if (transactions.length > 0 || contacts.length > 0) {
        const fullBackup = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings, lotTransfers);
        saveBackupToFolder(targetFolder, fullBackup).catch((err) => console.warn('Auto Drive hourly backup error:', err));
      }
    }, 60 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [settings.googleDriveFolderUrl, transactions.length, contacts.length]);

  // 3. حفظ نسخة تلقائية فورية عند الخروج من النظام / إغلاق النافذة
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        const targetFolder = settings.googleDriveFolderUrl?.trim() || DEFAULT_GOOGLE_DRIVE_FOLDER;
        const blob = new Blob([JSON.stringify({ folderPath: targetFolder })], { type: 'application/json' });
        navigator.sendBeacon('/api/backup/save-to-folder', blob);
      } catch { }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [settings.googleDriveFolderUrl]);

  // ── زر إرسال نسخة الآن إلى البريد الإلكتروني في الشريط العلوي ──
  const [isSendingEmailBackup, setIsSendingEmailBackup] = useState(false);
  const [emailBackupStatus, setEmailBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSendEmailBackup = async () => {
    const targetEmail = settings.smtpToEmail || settings.smtpUser;
    if (!targetEmail) {
      alert('يرجى تحديد البريد الإلكتروني المستلم أولاً من إعدادات النظام');
      setActiveTab('settings');
      return;
    }

    setIsSendingEmailBackup(true);
    setEmailBackupStatus(null);

    try {
      const backupJson = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings);
      const res = await sendBackupEmailNow(targetEmail, backupJson, {
        host: settings.smtpHost,
        port: settings.smtpPort ? Number(settings.smtpPort) : 465,
        user: settings.smtpUser,
        pass: settings.smtpPass,
        secure: settings.smtpSecure,
      });
      setEmailBackupStatus({
        type: 'success',
        message: res.message || 'تم إرسال النسخة للبريد بنجاح!',
      });
      setTimeout(() => setEmailBackupStatus(null), 5000);
    } catch (err: any) {
      setEmailBackupStatus({
        type: 'error',
        message: err.message || 'فشل إرسال النسخة للبريد',
      });
      setTimeout(() => setEmailBackupStatus(null), 6000);
    } finally {
      setIsSendingEmailBackup(false);
    }
  };

  // Navigation to a specific buyer or seller statement from other screens (POS quick search, debtors, etc.)
  const [targetBuyerStatement, setTargetBuyerStatement] = useState<{ buyerId: string; ts: number } | null>(null);
  const [targetSellerStatement, setTargetSellerStatement] = useState<{ sellerId: string; ts: number } | null>(null);

  const handleNavigateToBuyerStatement = (buyerId: string) => {
    setTargetBuyerStatement({ buyerId, ts: Date.now() });
    setActiveTab('reports');
  };

  const handleNavigateToSellerStatement = (sellerId: string) => {
    setTargetSellerStatement({ sellerId, ts: Date.now() });
    setActiveTab('reports');
  };

  const handleNavigateToCustomerStatement = (type: 'buyer' | 'seller', nameOrId: string) => {
    const rawTarget = (nameOrId || '').trim();
    if (type === 'buyer') {
      handleNavigateToBuyerStatement(rawTarget);
    } else {
      handleNavigateToSellerStatement(rawTarget);
    }
  };

  // Online / Offline state
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize Database Sync and Backend check on load
  useEffect(() => {
    let isMounted = true;
    async function initLocalDbSync() {
      setCloudStatus('syncing');
      try {
        const testRes = await testLocalDbConnection();
        if (!isMounted) return;

        if (testRes.connected) {
          setCloudStatus('connected');
          setBackendStatus('online');

          // 1. Hydrate transactions from DB
          const dbTrx = await fetchTransactionsFromLocalDb();
          if (isMounted && dbTrx && dbTrx.length > 0) {
            const sanitized = sanitizeTransactionDates(dbTrx);
            setTransactions(sanitized);
            saveTransactions(sanitized);
          } else {
            // If DB is empty, seed from current storage
            const curTrx = loadTransactions();
            if (curTrx && curTrx.length > 0) {
              for (const t of curTrx) {
                saveTransactionToLocalDb(t).catch(() => { });
              }
            }
          }

          // 2. Hydrate contacts
          const dbContacts = await fetchContactsFromLocalDb();
          const storedContacts = loadContacts();
          const contactsFromDb = dbContacts && dbContacts.length > 0 ? dbContacts : [];
          const mergedContacts = [...contactsFromDb];
          storedContacts.forEach((storedContact) => {
            if (!mergedContacts.some((contact) => contact.id === storedContact.id)) {
              mergedContacts.push(storedContact);
            }
          });
          if (mergedContacts.length > 0) {
            if (isMounted) {
              setContacts(mergedContacts);
              saveContacts(mergedContacts);
              mergedContacts.forEach((contact) => {
                saveContactToLocalDb(contact).catch(() => { });
              });
            }
          }

          // 3. Hydrate fish types
          const dbFish = await fetchFishTypesFromLocalDb();
          if (isMounted && dbFish && dbFish.length > 0) {
            setFishTypes(dbFish);
            saveFishTypes(dbFish);
          } else {
            const curFish = loadFishTypes();
            if (curFish && curFish.length > 0) {
              for (const f of curFish) {
                saveFishTypeToLocalDb(f).catch(() => { });
              }
            }
          }

          // 4. Hydrate settings with safe credential merge
          const dbSettings = await fetchSettingsFromLocalDb();
          const localSettings = loadSettings();
          if (isMounted && dbSettings && Object.keys(dbSettings).length > 0) {
            const mergedSettings = normalizeSettings({
              ...localSettings,
              ...dbSettings,
              // الحفاظ الصارم على كلمة مرور التطبيقات وحساب الإرسال وعدم تركهما يضيعان
              smtpPass: dbSettings.smtpPass || localSettings.smtpPass,
              smtpUser: dbSettings.smtpUser || localSettings.smtpUser,
              emailBackupEnabled: dbSettings.emailBackupEnabled ?? localSettings.emailBackupEnabled ?? true,
              emailBackupOnScheduleEnabled: dbSettings.emailBackupOnScheduleEnabled ?? localSettings.emailBackupOnScheduleEnabled ?? true,
              emailBackupScheduledTime: dbSettings.emailBackupScheduledTime || localSettings.emailBackupScheduledTime || '23:00',
              emailBackupOnDayCloseEnabled: dbSettings.emailBackupOnDayCloseEnabled ?? localSettings.emailBackupOnDayCloseEnabled ?? true,
            });
            mergedSettings.marketName = dbSettings.marketName || localSettings.marketName || 'سوق عين بامعبد المركزي';
            mergedSettings.subTitle = dbSettings.subTitle || localSettings.subTitle || 'للأسماك الطازجة والخضروات والفواكة';
            mergedSettings.location = dbSettings.location || localSettings.location || 'م/شبوه/رضوم/ عين بامعبد';
            mergedSettings.contactPhone = dbSettings.contactPhone || localSettings.contactPhone || '782191112';
            if (!mergedSettings.currency || mergedSettings.currency === 'ر.س' || mergedSettings.currency === 'SAR') {
              mergedSettings.currency = 'ريال يمني';
            }
            if (mergedSettings.subTitle && mergedSettings.subTitle.includes('والفواكه')) {
              mergedSettings.subTitle = mergedSettings.subTitle.replace(/والفواكه/g, 'والفواكة');
            }
            setSettings(mergedSettings);
            saveSettings(mergedSettings);
            saveSettingsToLocalDb(mergedSettings).catch(() => { });
          } else {
            if (localSettings) {
              if (!localSettings.marketName) localSettings.marketName = 'سوق عين بامعبد المركزي';
              if (!localSettings.subTitle || localSettings.subTitle.includes('والفواكه')) {
                localSettings.subTitle = (localSettings.subTitle || 'للأسماك الطازجة والخضروات والفواكة').replace(/والفواكه/g, 'والفواكة');
              }
              if (!localSettings.contactPhone) localSettings.contactPhone = '782191112';
              saveSettings(localSettings);
            }
            setSettings(localSettings);
            // إذا كان التخزين المحلي يحتوي على إعدادات وكلمة مرور، نرسلها لقاعدة البيانات، دون إتلافها إذا كانت فارغة
            if (localSettings && localSettings.smtpPass) {
              saveSettingsToLocalDb(localSettings).catch(() => { });
            }
          }

          // 5. Hydrate cash entries
          const dbCash = await fetchCashEntriesFromLocalDb();
          if (isMounted && dbCash && dbCash.length > 0) {
            const cleanedDb = dbCash.filter((e) => !e.id.startsWith('CASH-SURP-'));
            const { kept: reconciledCash, removed: startupRemoved, recovered: startupRecovered } = reconcileStartupCashEntries(
              cleanedDb,
              dbTrx && dbTrx.length > 0 ? dbTrx : loadTransactions()
            );
            if (startupRemoved.length > 0) {
              startupRemoved.forEach((se) => {
                deleteCashEntryFromLocalDb(se.id).catch(() => { });
              });
            }
            if (startupRecovered.length > 0) {
              startupRecovered.forEach((re) => {
                saveCashEntryToLocalDb(re).catch(() => { });
              });
            }
            setCashEntries(reconciledCash);
            saveCashEntries(reconciledCash);
          } else {
            const curCash = loadCashEntries().filter((e) => !e.id.startsWith('CASH-SURP-'));
            if (curCash && curCash.length > 0) {
              for (const ce of curCash) {
                saveCashEntryToLocalDb(ce).catch(() => { });
              }
            }
          }

          // 6. Hydrate cash closings
          const dbClosings = await fetchCashClosingsFromLocalDb();
          if (isMounted && dbClosings && dbClosings.length > 0) {
            setCashClosings(dbClosings);
            saveCashClosings(dbClosings);
          } else {
            const curClosings = loadCashClosings();
            if (curClosings && curClosings.length > 0) {
              for (const cl of curClosings) {
                saveCashClosingToLocalDb(cl).catch(() => { });
              }
            }
          }

          // 7. Auto-reconciliation pass: Synchronize transactions & cashEntries with contacts
          const finalContacts = (dbContacts && dbContacts.length > 0) ? dbContacts : loadContacts();
          if (finalContacts && finalContacts.length > 0) {
            const contactIdMap = new Map(finalContacts.map((c) => [c.id, c]));

            // Reconcile transactions
            const currentTrx = (dbTrx && dbTrx.length > 0 ? sanitizeTransactionDates(dbTrx) : loadTransactions()) || [];
            let trxNeedsSave = false;
            const syncedTrx = currentTrx.map((t) => {
              let changed = false;
              const newT = { ...t };
              if (newT.buyerId && contactIdMap.has(newT.buyerId)) {
                const c = contactIdMap.get(newT.buyerId)!;
                if (c.name && c.name !== newT.buyerName) {
                  newT.buyerName = c.name;
                  if (c.phone) newT.buyerPhone = c.phone;
                  changed = true;
                }
              }
              if (newT.sellerId && contactIdMap.has(newT.sellerId)) {
                const c = contactIdMap.get(newT.sellerId)!;
                if (c.name && c.name !== newT.sellerName) {
                  newT.sellerName = c.name;
                  if (c.phone) newT.sellerPhone = c.phone;
                  changed = true;
                }
              }
              if (changed) {
                trxNeedsSave = true;
                saveTransactionToLocalDb(newT).catch(() => { });
                return newT;
              }
              return t;
            });

            if (trxNeedsSave && isMounted) {
              setTransactions(syncedTrx);
              saveTransactions(syncedTrx);
            }

            // تطبيع حقول ديون المشترين دون التلاعب بالمبالغ المسددة تلقائياً
            try {
              const activeTrxs = trxNeedsSave ? syncedTrx : (dbTrx && dbTrx.length > 0 ? sanitizeTransactionDates(dbTrx) : transactions);
              const normalized = normalizeBuyerDebtFields(activeTrxs);
              if (normalized.hasChanges && isMounted) {
                setTransactions(normalized.updatedTrxs);
                saveTransactions(normalized.updatedTrxs);
                normalized.updatedTrxs.forEach((t) => {
                  saveTransactionToLocalDb(t).catch(() => { });
                });
              }
            } catch (recErr) {
              console.warn('Error during buyer debts normalization:', recErr);
            }

            // Reconcile cash entries
            const currentCash = (dbCash && dbCash.length > 0 ? dbCash.filter((e) => !e.id.startsWith('CASH-SURP-')) : loadCashEntries().filter((e) => !e.id.startsWith('CASH-SURP-'))) || [];
            let cashNeedsSave = false;
            const syncedCash = currentCash.map((e) => {
              if (e.contactId && contactIdMap.has(e.contactId)) {
                const c = contactIdMap.get(e.contactId)!;
                if (c.name && c.name !== e.contactName) {
                  cashNeedsSave = true;
                  const newE = { ...e, contactName: c.name };
                  saveCashEntryToLocalDb(newE).catch(() => { });
                  return newE;
                }
              }
              return e;
            });

            if (cashNeedsSave && isMounted) {
              setCashEntries(syncedCash);
              saveCashEntries(syncedCash);
            }
          }
        } else {
          setCloudStatus('offline');
          setBackendStatus('offline');
        }
      } catch (err) {
        console.warn('Database sync notice:', err);
        if (isMounted) {
          setCloudStatus('offline');
          setBackendStatus('offline');
        }
      }

      // Check Backend health
      try {
        const bHealth = await checkBackendHealth();
        if (isMounted && bHealth) {
          setBackendStatus('online');
        }
      } catch {
        if (isMounted) setBackendStatus('offline');
      }
    }

    initLocalDbSync();
    return () => {
      isMounted = false;
    };
  }, []);

  // Live periodic database connection check (Heartbeat every 4 seconds)
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const testRes = await testLocalDbConnection();
        if (!isMounted) return;
        setCloudStatus(testRes.connected ? 'connected' : 'offline');
      } catch {
        if (isMounted) setCloudStatus('offline');
      }
    }, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Live Current Time & Date
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setCurrentTime(formatGregorianTime(now, true));
      const weekday = now.toLocaleDateString('ar-EG', { weekday: 'long' });
      setCurrentDate(`${weekday}، ${formatGregorianDate(now)}`);
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Today's summary stats (for the current calendar day)
  const todayStats = useMemo(() => {
    const todayTrxs = transactions.filter((t) => isSameCalendarDay(t.dateStr || t.timestamp, new Date()));

    const totalGross = todayTrxs.reduce((sum, t) => sum + (t.grossAmount || 0), 0);
    const totalProfit = todayTrxs.reduce((sum, t) => sum + (t.harajProfit || 0), 0);

    return {
      count: todayTrxs.length,
      totalGross,
      totalProfit,
    };
  }, [transactions, currentDate]);

  // Live drawer cash calculation matching CashBoxManager today
  const liveDrawerCash = useMemo(() => {
    const carriedOver = getCarriedOverBalance(cashClosings);
    return calculateDrawerCash(
      cashEntries,
      transactions,
      true,
      carriedOver,
      Boolean(settings.separateProfitsFromDrawerCash)
    ).currentDrawerBalance;
  }, [cashEntries, transactions, cashClosings, settings.separateProfitsFromDrawerCash]);


  // Keyboard shortcut listener for fast section switching (Alt+1..6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        setActiveTab('pos');
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        setActiveTab('transactions');
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        setActiveTab('reports');
      } else if (e.altKey && e.key === '4') {
        e.preventDefault();
        setActiveTab('cashBox');
      } else if (e.altKey && e.key === '5') {
        e.preventDefault();
        setActiveTab('contacts');
      } else if (e.altKey && e.key === '6') {
        e.preventDefault();
        setActiveTab('fishTypes');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  // Transaction Actions
  const handleSaveTransaction = (newTrx: Transaction, autoPrint: boolean, updatedOriginalTrx?: Transaction) => {
    try {
      const result = executeSaveTransaction(transactions, cashEntries, newTrx, updatedOriginalTrx);
      setTransactions(result.nextTransactions);
      saveTransactions(result.nextTransactions);
      saveTransactionToLocalDb(newTrx).catch((e) => console.warn('Local DB save error:', e));

      if (result.updatedOriginalTrxToPersist) {
        saveTransactionToLocalDb(result.updatedOriginalTrxToPersist).catch((e) => console.warn('Local DB save original update error:', e));
      }

      if (result.newCashEntriesToPersist.length > 0) {
        setCashEntries(result.nextCashEntries);
        saveCashEntries(result.nextCashEntries);
        result.newCashEntriesToPersist.forEach((entry) => {
          saveCashEntryToLocalDb(entry).catch((e) => console.warn('Local DB cash save error:', e));
        });
      }

      if (autoPrint) {
        setSelectedTrx(newTrx);
        setReceiptMode('buyer');
        setJustSaved(true);
        setReceiptModalOpen(true);
        setTimeout(() => {
          window.print();
        }, 500);
      }
    } catch (err) {
      console.error('Error saving transaction:', err);
    }
  };

  const handleUpdateTransaction = (updatedTrx: Transaction, autoPrint = false) => {
    try {
      const result = executeUpdateTransaction(transactions, cashEntries, updatedTrx);
      setTransactions(result.nextTransactions);
      saveTransactions(result.nextTransactions);
      saveTransactionToLocalDb(result.finalUpdatedTrx).catch((e) => console.warn('Local DB update error:', e));

      if (result.settledOriginalTrx) {
        saveTransactionToLocalDb(result.settledOriginalTrx).catch((e) => console.warn('Local DB orig update error:', e));
      }

      setLotTransfers(loadLotTransfers());

      if (result.cashEntriesToPersist.length > 0 || result.cashEntryIdsToDelete.length > 0) {
        setCashEntries(result.nextCashEntries);
        saveCashEntries(result.nextCashEntries);
        result.cashEntriesToPersist.forEach((ce) => {
          saveCashEntryToLocalDb(ce).catch(() => { });
        });
        result.cashEntryIdsToDelete.forEach((id) => {
          deleteCashEntryFromLocalDb(id).catch(() => { });
        });
      }

      if (autoPrint) {
        setSelectedTrx(result.finalUpdatedTrx);
        setReceiptMode('buyer');
        setJustSaved(false);
        setReceiptModalOpen(true);
        setTimeout(() => {
          window.print();
        }, 500);
      }
    } catch (err) {
      console.error('Error updating transaction:', err);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    try {
      const result = executeDeleteTransaction(transactions, cashEntries, id);
      setTransactions(result.nextTransactions);
      saveTransactions(result.nextTransactions);
      deleteTransactionFromLocalDb(id).catch((e) => console.warn('Local DB delete error:', e));

      if (result.removedCashEntryIds.length > 0) {
        setCashEntries(result.nextCashEntries);
        saveCashEntries(result.nextCashEntries);
        result.removedCashEntryIds.forEach((entryId) => {
          deleteCashEntryFromLocalDb(entryId).catch(() => { });
        });
      }
    } catch (err) {
      console.error('Error during transaction deletion:', err);
    }
  };

  // Contacts Actions
  const handleAddContact = (contactData: Partial<Contact>): Contact => {
    const newContact: Contact = {
      id: `contact-${Date.now()}`,
      name: contactData.name || 'بدون اسم',
      type: contactData.type || 'seller',
      phone: contactData.phone,
      notes: contactData.notes,
      role: contactData.role,
      dailyWage: contactData.dailyWage,
      createdAt: getTodayLocalYMD(),
    };
    const updated = [...contacts, newContact];
    setContacts(updated);
    saveContacts(updated);
    saveContactToLocalDb(newContact).catch((e) => console.warn('Local DB contact save error:', e));
    return newContact;
  };

  const handleUpdateContact = (updatedContact: Contact) => {
    const oldContact = contacts.find((c) => c.id === updatedContact.id);
    const updated = contacts.map((c) => (c.id === updatedContact.id ? updatedContact : c));
    setContacts(updated);
    saveContacts(updated);
    saveContactToLocalDb(updatedContact).catch((e) => console.warn('Local DB contact update error:', e));

    if (oldContact && (oldContact.name !== updatedContact.name || oldContact.phone !== updatedContact.phone)) {
      const oldNameNorm = normalizeArabic(oldContact.name);

      // 1. Cascade update to all transactions linked to this contact
      let trxChanged = false;
      const updatedTrx = transactions.map((t) => {
        let modified = false;
        const newT = { ...t };

        // Buyer check
        const tBuyerNorm = normalizeArabic(t.buyerName);
        if (
          (t.buyerId && t.buyerId === updatedContact.id) ||
          (!t.buyerId && oldNameNorm && (tBuyerNorm === oldNameNorm || t.buyerName?.trim().toLowerCase() === oldContact.name.trim().toLowerCase()))
        ) {
          newT.buyerName = updatedContact.name;
          if (updatedContact.phone) newT.buyerPhone = updatedContact.phone;
          newT.buyerId = updatedContact.id;
          modified = true;
        }

        // Seller check
        const tSellerNorm = normalizeArabic(t.sellerName);
        if (
          (t.sellerId && t.sellerId === updatedContact.id) ||
          (!t.sellerId && oldNameNorm && (tSellerNorm === oldNameNorm || t.sellerName?.trim().toLowerCase() === oldContact.name.trim().toLowerCase()))
        ) {
          newT.sellerName = updatedContact.name;
          if (updatedContact.phone) newT.sellerPhone = updatedContact.phone;
          newT.sellerId = updatedContact.id;
          modified = true;
        }

        // Resold from buyer check
        const tResoldNorm = normalizeArabic(t.resoldFromBuyerName);
        if (oldNameNorm && (tResoldNorm === oldNameNorm || t.resoldFromBuyerName?.trim().toLowerCase() === oldContact.name.trim().toLowerCase())) {
          newT.resoldFromBuyerName = updatedContact.name;
          modified = true;
        }

        if (modified) {
          trxChanged = true;
          saveTransactionToLocalDb(newT).catch((e) => console.warn('Error cascading transaction update:', e));
          return newT;
        }
        return t;
      });

      if (trxChanged) {
        setTransactions(updatedTrx);
        saveTransactions(updatedTrx);
      }

      // 2. Cascade update to all cash entries linked to this contact
      let cashChanged = false;
      const updatedCash = cashEntries.map((c) => {
        const cNorm = normalizeArabic(c.contactName);
        if (
          (c.contactId && c.contactId === updatedContact.id) ||
          (!c.contactId && oldNameNorm && (cNorm === oldNameNorm || c.contactName?.trim().toLowerCase() === oldContact.name.trim().toLowerCase()))
        ) {
          cashChanged = true;
          const newC = {
            ...c,
            contactName: updatedContact.name,
            contactId: updatedContact.id,
          };
          saveCashEntryToLocalDb(newC).catch((e) => console.warn('Error cascading cash update:', e));
          return newC;
        }
        return c;
      });

      if (cashChanged) {
        setCashEntries(updatedCash);
        saveCashEntries(updatedCash);
      }
    }
  };

  const handleDeleteContact = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    setContacts(updated);
    saveContacts(updated);
    deleteContactFromLocalDb(id).catch((e) => console.warn('Local DB contact delete error:', e));
  };

  // Fish Types Actions
  const handleAddFishType = (fishData: Partial<FishType>) => {
    const newFish: FishType = {
      id: `fish-${Date.now()}`,
      name: fishData.name || fishData.arabicName || 'سمك',
      arabicName: fishData.arabicName || 'سمك',
      defaultUnit: fishData.defaultUnit || 'kg',
      unitLabel: fishData.unitLabel || 'كيلو',
      estimatedPricePerUnit: fishData.estimatedPricePerUnit || 0,
      popular: true,
    };
    const updated = [...fishTypes, newFish];
    setFishTypes(updated);
    saveFishTypes(updated);
    saveFishTypeToLocalDb(newFish).catch((e) => console.warn('Local DB fish save error:', e));
  };

  const handleUpdateFishType = (updatedFish: FishType) => {
    const updated = fishTypes.map((f) => (f.id === updatedFish.id ? updatedFish : f));
    setFishTypes(updated);
    saveFishTypes(updated);
    saveFishTypeToLocalDb(updatedFish).catch((e) => console.warn('Local DB fish update error:', e));
  };

  const handleDeleteFishType = (id: string) => {
    const updated = fishTypes.filter((f) => f.id !== id);
    setFishTypes(updated);
    saveFishTypes(updated);
    deleteFishTypeFromLocalDb(id).catch((e) => console.warn('Local DB fish delete error:', e));
  };

  // Cash Box Actions
  const handleAddCashEntry = (entryData: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>) => {
    const now = new Date();
    const newEntry: CashEntry = {
      ...entryData,
      id: `CASH-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
    };
    const updated = [newEntry, ...cashEntries];
    setCashEntries(updated);
    saveCashEntries(updated);
    saveCashEntryToLocalDb(newEntry).catch((e) => console.warn('Local DB cash entry save error:', e));
  };

  const handleDeleteCashEntry = (id: string) => {
    const result = executeDeleteCashEntry(transactions, cashEntries, id);
    setCashEntries(result.nextCashEntries);
    saveCashEntries(result.nextCashEntries);
    deleteCashEntryFromLocalDb(id).catch((e) => console.warn('Local DB cash entry delete error:', e));

    if (result.modifiedTransactions.length > 0) {
      setTransactions(result.nextTransactions);
      saveTransactions(result.nextTransactions);
      result.modifiedTransactions.forEach((updatedT) => {
        saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx revert debt error:', e));
      });
    }
  };

  const handleUpdateCashEntry = (updatedEntry: CashEntry) => {
    const existing = cashEntries.find((e) => e.id === updatedEntry.id);
    if (!existing) return;
    const oldAmount = existing.amount || 0;
    const newAmount = updatedEntry.amount || 0;
    const diff = newAmount - oldAmount;

    const updated = cashEntries.map((e) => (e.id === updatedEntry.id ? updatedEntry : e));
    setCashEntries(updated);
    saveCashEntries(updated);
    saveCashEntryToLocalDb(updatedEntry).catch((e) => console.warn('Local DB cash entry update error:', e));

    // إذا كان السند سداد دين مشتري وتغير المبلغ:
    if (
      diff !== 0 &&
      (updatedEntry.type === 'buyer_debt_repayment' || updatedEntry.type === 'buyer_advance_repayment')
    ) {
      const buyerId = updatedEntry.contactId;
      const buyerName = updatedEntry.contactName;
      const targetTrxId = updatedEntry.transactionId || updatedEntry.referenceId;
      const now = new Date();
      let nextTransactions = [...transactions];
      let trxsChanged = false;

      if (diff < 0) {
        // تم تخفيض مبلغ السداد -> نعيد الفارق ديناً على المشتري
        let remainingToRevert = Math.abs(diff);

        // 1. إذا كان السند مرتبطاً بفاتورة معينة
        if (targetTrxId) {
          const trxIndex = nextTransactions.findIndex((t) => t.id === targetTrxId);
          if (trxIndex !== -1) {
            const t = nextTransactions[trxIndex];
            const curPaid = t.buyerPaidAmount || 0;
            const curDebt = t.buyerRemainingDebt || 0;
            const maxInvoiceAmount = t.totalFromBuyer || 0;
            const revertOnThis = Math.min(remainingToRevert, curPaid > 0 ? curPaid : maxInvoiceAmount);

            if (revertOnThis > 0) {
              remainingToRevert -= revertOnThis;
              const newPaid = Math.max(0, curPaid - revertOnThis);
              const newDebt = curDebt + revertOnThis;
              const newStatus = newDebt >= maxInvoiceAmount ? 'pending' : (newPaid > 0 ? 'partial' : 'pending');
              const newSettlement = newPaid <= 0 ? 'association_credit' : t.settlementType;
              const updatedT: Transaction = {
                ...t,
                settlementType: newSettlement,
                buyerPaidAmount: newPaid,
                buyerRemainingDebt: newDebt,
                paidAtPosBuyerAmount: newSettlement === 'association_credit' ? 0 : Math.min(t.paidAtPosBuyerAmount || 0, newPaid),
                paymentStatus: newStatus as any,
                isEdited: true,
                editedAt: Date.now(),
                editedDateStr: formatGregorianDate(now),
              };
              nextTransactions[trxIndex] = updatedT;
              saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx revert debt error:', e));
              trxsChanged = true;
            }
          }
        }

        // 2. إذا تبقّى مبلغ، يتم توزيعه على باقي فواتير المشتري (من الأحدث للأقدم)
        if (remainingToRevert > 0 && (buyerId || buyerName)) {
          const isBuyerMatch = (t: Transaction) => {
            if (buyerId && t.buyerId && t.buyerId === buyerId) return true;
            if (buyerName && t.buyerName && t.buyerName.trim().toLowerCase() === buyerName.trim().toLowerCase()) return true;
            return false;
          };

          const matchingIndices = nextTransactions
            .map((t, idx) => ({ t, idx }))
            .filter(({ t }) => isBuyerMatch(t) && (!targetTrxId || t.id !== targetTrxId) && (t.buyerPaidAmount || 0) > 0)
            .sort((a, b) => (Number(b.t.timestamp) || 0) - (Number(a.t.timestamp) || 0));

          for (const { t, idx } of matchingIndices) {
            if (remainingToRevert <= 0) break;
            const curPaid = t.buyerPaidAmount || 0;
            const curDebt = t.buyerRemainingDebt || 0;
            const maxInvoiceAmount = t.totalFromBuyer || 0;
            const revertOnThis = Math.min(remainingToRevert, curPaid);

            if (revertOnThis > 0) {
              remainingToRevert -= revertOnThis;
              const newPaid = Math.max(0, curPaid - revertOnThis);
              const newDebt = curDebt + revertOnThis;
              const newStatus = newDebt >= maxInvoiceAmount ? 'pending' : (newPaid > 0 ? 'partial' : 'pending');
              const newSettlement = newPaid <= 0 ? 'association_credit' : t.settlementType;
              const updatedT: Transaction = {
                ...t,
                settlementType: newSettlement,
                buyerPaidAmount: newPaid,
                buyerRemainingDebt: newDebt,
                paidAtPosBuyerAmount: newSettlement === 'association_credit' ? 0 : Math.min(t.paidAtPosBuyerAmount || 0, newPaid),
                paymentStatus: newStatus as any,
                isEdited: true,
                editedAt: Date.now(),
                editedDateStr: formatGregorianDate(now),
              };
              nextTransactions[idx] = updatedT;
              saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx revert debt error:', e));
              trxsChanged = true;
            }
          }
        }
      } else {
        // تم زيادة مبلغ السداد (diff > 0) -> نسدد ديون إضافية عن المشتري
        let remainingToPay = diff;

        // 1. إذا كان السند مرتبطاً بفاتورة معينة وفيها دين غير مسدد
        if (targetTrxId) {
          const trxIndex = nextTransactions.findIndex((t) => t.id === targetTrxId);
          if (trxIndex !== -1) {
            const t = nextTransactions[trxIndex];
            const curDebt = t.buyerRemainingDebt || 0;
            const curPaid = t.buyerPaidAmount || 0;
            const payOnThis = Math.min(remainingToPay, curDebt);

            if (payOnThis > 0) {
              remainingToPay -= payOnThis;
              const newDebt = Math.max(0, curDebt - payOnThis);
              const newPaid = curPaid + payOnThis;
              const newStatus = newDebt <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
              const newSettlement = newDebt <= 0 ? 'association_cash' : (newPaid > 0 ? 'partial_cash' : t.settlementType);
              const updatedT: Transaction = {
                ...t,
                settlementType: newSettlement,
                buyerPaidAmount: newPaid,
                buyerRemainingDebt: newDebt,
                paidAtPosBuyerAmount: newPaid,
                paymentStatus: newStatus as any,
                isEdited: true,
                editedAt: Date.now(),
                editedDateStr: formatGregorianDate(now),
              };
              nextTransactions[trxIndex] = updatedT;
              saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx pay debt error:', e));
              trxsChanged = true;
            }
          }
        }

        // 2. إذا تبقّى مبلغ للسداد، نوزعه على الفواتير المتبقية للمشتري (من الأقدم للأحدث)
        if (remainingToPay > 0 && (buyerId || buyerName)) {
          const isBuyerMatch = (t: Transaction) => {
            if (buyerId && t.buyerId && t.buyerId === buyerId) return true;
            if (buyerName && t.buyerName && t.buyerName.trim().toLowerCase() === buyerName.trim().toLowerCase()) return true;
            return false;
          };

          const matchingIndices = nextTransactions
            .map((t, idx) => ({ t, idx }))
            .filter(({ t }) => isBuyerMatch(t) && (!targetTrxId || t.id !== targetTrxId) && (t.buyerRemainingDebt || 0) > 0)
            .sort((a, b) => (Number(a.t.timestamp) || 0) - (Number(b.t.timestamp) || 0));

          for (const { t, idx } of matchingIndices) {
            if (remainingToPay <= 0) break;
            const curDebt = t.buyerRemainingDebt || 0;
            const curPaid = t.buyerPaidAmount || 0;
            const payOnThis = Math.min(remainingToPay, curDebt);

            if (payOnThis > 0) {
              remainingToPay -= payOnThis;
              const newDebt = Math.max(0, curDebt - payOnThis);
              const newPaid = curPaid + payOnThis;
              const newStatus = newDebt <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
              const newSettlement = newDebt <= 0 ? 'association_cash' : (newPaid > 0 ? 'partial_cash' : t.settlementType);
              const updatedT: Transaction = {
                ...t,
                settlementType: newSettlement,
                buyerPaidAmount: newPaid,
                buyerRemainingDebt: newDebt,
                paidAtPosBuyerAmount: newPaid,
                paymentStatus: newStatus as any,
                isEdited: true,
                editedAt: Date.now(),
                editedDateStr: formatGregorianDate(now),
              };
              nextTransactions[idx] = updatedT;
              saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx pay debt error:', e));
              trxsChanged = true;
            }
          }
        }
      }

      if (trxsChanged) {
        setTransactions(nextTransactions);
        saveTransactions(nextTransactions);
      }
    }
  };

  const handleCloseCashDay = (
    closingData: Partial<CashDayCloseRecord> & {
      openingBalance: number;
      totalDeposits: number;
      totalExpenses: number;
      totalWithdrawals: number;
      systemCalculatedBalance: number;
      actualCountedCash: number;
      difference: number;
    }
  ) => {
    const now = new Date();
    const todayIso = getTodayLocalYMD();
    const targetDateIso = closingData.dateStr || todayIso;
    const timeFormatted = closingData.timeStr || formatGregorianTime(now);

    // البحث عن سجل الجرد لنفس التاريخ أو بنفس المعرف
    const existingIndex = cashClosings.findIndex(
      (c) =>
        (closingData.id && c.id === closingData.id) ||
        isSameCalendarDay(c.dateStr || c.timestamp, targetDateIso)
    );

    let updated: CashDayCloseRecord[];
    if (existingIndex >= 0) {
      const existing = cashClosings[existingIndex];
      const isNowReconciled = closingData.reconciliationStatus === 'reconciled';
      let correctTimestamp = existing.timestamp || Date.now();
      if (targetDateIso < todayIso) {
        const pd = parseLocalDate(targetDateIso) || new Date();
        pd.setHours(23, 59, 0, 0);
        correctTimestamp = pd.getTime();
      }
      const updatedClosing: CashDayCloseRecord = {
        ...existing,
        ...closingData,
        timestamp: correctTimestamp,
        dateStr: targetDateIso,
        timeStr: timeFormatted,
        isAutoClosed: closingData.isAutoClosed ?? existing.isAutoClosed ?? false,
        reconciliationStatus: closingData.reconciliationStatus ?? (isNowReconciled ? 'reconciled' : existing.reconciliationStatus ?? 'reconciled'),
        reconciledAt: closingData.reconciledAt ?? (isNowReconciled ? Date.now() : existing.reconciledAt),
        reconciledBy: closingData.reconciledBy ?? existing.reconciledBy,
      };
      updated = [...cashClosings];
      updated[existingIndex] = updatedClosing;
      setCashClosings(updated);
      saveCashClosings(updated);
      saveCashClosingToLocalDb(updatedClosing).catch((e) => console.warn('Local DB cash closing update error:', e));
    } else {
      let recordTimestamp = Date.now();
      if (targetDateIso < todayIso) {
        const pd = parseLocalDate(targetDateIso) || new Date();
        pd.setHours(23, 59, 0, 0);
        recordTimestamp = pd.getTime();
      }
      const newClosing: CashDayCloseRecord = {
        ...closingData,
        id: closingData.id || `CLOSE-${Date.now().toString().slice(-6)}`,
        timestamp: recordTimestamp,
        dateStr: targetDateIso,
        timeStr: timeFormatted,
        isAutoClosed: closingData.isAutoClosed ?? false,
        reconciliationStatus: closingData.reconciliationStatus ?? 'reconciled',
      };
      updated = [newClosing, ...cashClosings];
      setCashClosings(updated);
      saveCashClosings(updated);
      saveCashClosingToLocalDb(newClosing).catch((e) => console.warn('Local DB cash closing save error:', e));
    }

    // ── حفظ نسخة احتياطية فورية في مجلد النسخ الاحتياطية عند إقفال اليومية والدرج ──
    try {
      const targetFolder = settings.googleDriveFolderUrl?.trim() || DEFAULT_GOOGLE_DRIVE_FOLDER;
      const fullBackup = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, updated, lotTransfers);
      saveBackupToFolder(targetFolder, fullBackup).catch((err) => console.warn('Auto Drive day close backup error:', err));
    } catch (e) {
      console.warn('Day close folder backup error:', e);
    }

    // ── إرسال نسخة احتياطية فورية للبريد عند إغلاق اليومية إذا كان الخيار مفعلاً ──
    if (
      settings.emailBackupEnabled !== false &&
      settings.emailBackupOnDayCloseEnabled !== false &&
      Boolean(settings.smtpPass?.trim())
    ) {
      const recipient = user?.email || settings.smtpUser;
      if (recipient && recipient.includes('@')) {
        const fullBackup = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, updated, lotTransfers);
        sendBackupEmailNow(
          recipient,
          fullBackup,
          {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            pass: settings.smtpPass,
            secure: settings.smtpSecure,
          },
          {
            subject: `نسخة احتياطية - إغلاق اليومية والجرد بتاريخ (${targetDateIso})`,
            triggerReason: `اعتماد إغلاق اليومية والجرد اليومي بتاريخ (${targetDateIso}) - توقيت: ${timeFormatted}`,
          }
        ).then(() => {
          console.log(`[AutoEmailBackup] ✓ تم إرسال النسخة الاحتياطية تلقائياً لإغلاق اليومية (${targetDateIso})`);
        }).catch((err) => {
          console.warn('[AutoEmailBackup] تعذر إرسال نسخة إغلاق اليومية بالبريد:', err);
        });
      }
    }
  };

  // ── الفحص التلقائي للأيام السابقة غير المقفلة وإجراء جرد آلي معلق (Auto-Close with Pending Reconciliation) ──
  useEffect(() => {
    if (!transactions.length && !cashEntries.length) return;

    const todayYmd = getTodayLocalYMD();
    const pastDatesSet = new Set<string>();

    transactions.forEach((t) => {
      const d = t.dateStr || '';
      if (d && d < todayYmd) {
        pastDatesSet.add(d);
      } else if (t.timestamp) {
        const dIso = getTodayLocalYMD(new Date(t.timestamp));
        if (dIso < todayYmd) pastDatesSet.add(dIso);
      }
    });

    cashEntries.forEach((e) => {
      const d = e.dateStr || '';
      if (d && d < todayYmd) {
        pastDatesSet.add(d);
      } else if (e.timestamp) {
        const dIso = getTodayLocalYMD(new Date(e.timestamp));
        if (dIso < todayYmd) pastDatesSet.add(dIso);
      }
    });

    const newAutoClosings: CashDayCloseRecord[] = [];

    let hasChanges = false;
    let updatedClosings = (cashClosingsRef.current || []).map((c) => {
      // If this is a pending auto-closing, refresh its system-calculated stats from actual entries
      if (c.isAutoClosed && c.reconciliationStatus === 'pending') {
        const dayStats = calculateDayClosingStats(c.dateStr, cashEntries, transactions, cashClosingsRef.current);
        const carriedOver = c.carriedOverBalance !== undefined ? c.carriedOverBalance : (dayStats.carriedOverBalance || 0);
        const autoCustody = dayStats.newCustodyAmount !== undefined ? dayStats.newCustodyAmount : ((dayStats.openingBalance || 0) + (dayStats.totalDeposits || 0));

        if (
          c.openingBalance !== (carriedOver + autoCustody) ||
          c.newCustodyAmount !== autoCustody ||
          c.totalDeposits !== dayStats.totalDeposits ||
          c.buyerDebtRepayments !== dayStats.buyerDebtRepayments ||
          c.sellerAdvanceRepayments !== dayStats.sellerAdvanceRepayments ||
          c.totalExpenses !== dayStats.totalExpenses ||
          c.exchangeExpenses !== dayStats.exchangeExpenses ||
          c.totalWithdrawals !== dayStats.totalWithdrawals ||
          c.harajCashSales !== dayStats.harajCashSales ||
          c.harajSellerPayouts !== dayStats.harajSellerPayouts ||
          c.systemCalculatedBalance !== dayStats.systemCalculatedBalance
        ) {
          hasChanges = true;
          return {
            ...c,
            openingBalance: carriedOver + autoCustody,
            carriedOverBalance: carriedOver,
            newCustodyAmount: autoCustody,
            totalDeposits: dayStats.totalDeposits,
            totalExpenses: dayStats.totalExpenses,
            exchangeExpenses: dayStats.exchangeExpenses,
            officeExpenses: dayStats.officeExpenses,
            totalWithdrawals: dayStats.totalWithdrawals,
            harajCashSales: dayStats.harajCashSales,
            harajSellerPayouts: dayStats.harajSellerPayouts,
            buyerDebtRepayments: dayStats.buyerDebtRepayments,
            buyerDebtExchangeRepayments: dayStats.buyerDebtExchangeRepayments,
            sellerExchangePayouts: dayStats.sellerExchangePayouts,
            sellerAdvanceRepayments: dayStats.sellerAdvanceRepayments,
            associationProfits: dayStats.associationProfits,
            systemCalculatedBalance: dayStats.systemCalculatedBalance,
          };
        }
      }
      return c;
    });

    pastDatesSet.forEach((pastDate) => {
      const alreadyHasClosing = updatedClosings.some((c) =>
        isSameCalendarDay(c.dateStr || c.timestamp, pastDate)
      );

      if (!alreadyHasClosing) {
        const dayStats = calculateDayClosingStats(pastDate, cashEntries, transactions, cashClosingsRef.current);
        const autoCustody = dayStats.newCustodyAmount !== undefined ? dayStats.newCustodyAmount : ((dayStats.openingBalance || 0) + (dayStats.totalDeposits || 0));
        if (
          dayStats.transactionsCount > 0 ||
          autoCustody > 0 ||
          dayStats.totalExpenses > 0 ||
          dayStats.totalWithdrawals > 0
        ) {
          const dayDate = parseLocalDate(pastDate) || new Date();
          dayDate.setHours(23, 59, 0, 0);
          const autoTimestamp = dayDate.getTime();

          const autoRecord: CashDayCloseRecord = {
            id: `CLOSE-AUTO-${pastDate.replace(/[-/]/g, '')}`,
            timestamp: autoTimestamp,
            dateStr: pastDate,
            timeStr: '11:59 م',
            openingBalance: (dayStats.carriedOverBalance || 0) + autoCustody,
            carriedOverBalance: dayStats.carriedOverBalance || 0,
            newCustodyAmount: autoCustody,
            totalDeposits: dayStats.totalDeposits,
            totalExpenses: dayStats.totalExpenses,
            exchangeExpenses: dayStats.exchangeExpenses,
            officeExpenses: dayStats.officeExpenses,
            totalWithdrawals: dayStats.totalWithdrawals,
            harajCashSales: dayStats.harajCashSales,
            harajSellerPayouts: dayStats.harajSellerPayouts,
            buyerDebtRepayments: dayStats.buyerDebtRepayments,
            buyerDebtExchangeRepayments: dayStats.buyerDebtExchangeRepayments,
            sellerExchangePayouts: dayStats.sellerExchangePayouts,
            sellerAdvanceRepayments: dayStats.sellerAdvanceRepayments,
            associationProfits: dayStats.associationProfits,
            systemCalculatedBalance: dayStats.systemCalculatedBalance,
            actualCountedCash: 0,
            difference: 0,
            isAutoClosed: true,
            reconciliationStatus: 'pending', // لم تتم المعاينة بعد
            notes: 'إقفال آلي بواسطة النظام لانتهاء اليوم (بانتظار المعاينة والجرد الفعلي للكاش)',
          };
          newAutoClosings.push(autoRecord);
        }
      }
    });

    if (newAutoClosings.length > 0 || hasChanges) {
      const merged = [...newAutoClosings, ...updatedClosings].sort(
        (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
      );
      setCashClosings(merged);
      saveCashClosings(merged);
      [...newAutoClosings, ...(hasChanges ? updatedClosings.filter((c) => c.isAutoClosed && c.reconciliationStatus === 'pending') : [])].forEach((rec) => {
        saveCashClosingToLocalDb(rec).catch((e) => console.warn('Local DB auto-close save error:', e));
      });
    }
  }, [transactions.length, cashEntries.length, autoCloseDayCheck]);

  // Buyer Debt Repayment to the Association Cash Box (نقداً أو عبر الصرافة)
  // دالة مساعدة لتسوية وتخفيض دين الشروة الأصلية تلقائياً بمجرد سداد المشتري الجديد لفاتورة إعادة البيع
  const cascadeResaleSettlements = (
    currentTrxs: Transaction[],
    repaidResaleList: { resaleTrxId: string; debtPaid: number; isFullyPaid: boolean; newBuyerName: string }[]
  ): Transaction[] => {
    if (!repaidResaleList || repaidResaleList.length === 0) return currentTrxs;

    const resaleMap = new Map<string, { debtPaid: number; isFullyPaid: boolean; newBuyerName: string; resaleTrxId: string }>();
    currentTrxs.forEach((t) => {
      if (t.isResale && t.resoldFromTransactionId) {
        const item = repaidResaleList.find((r) => r.resaleTrxId === t.id);
        if (item) {
          resaleMap.set(t.resoldFromTransactionId, {
            debtPaid: item.debtPaid,
            isFullyPaid: item.isFullyPaid,
            newBuyerName: item.newBuyerName || t.buyerName || 'المشتري الجديد',
            resaleTrxId: t.id,
          });
        }
      }
    });

    if (resaleMap.size === 0) return currentTrxs;

    return currentTrxs.map((t) => {
      const info = resaleMap.get(t.id);
      if (info) {
        const curDebt = t.buyerRemainingDebt !== undefined
          ? t.buyerRemainingDebt
          : (t.paymentStatus === 'pending' ? t.totalFromBuyer : 0);
        const newDebt = info.isFullyPaid ? 0 : Math.max(0, curDebt - info.debtPaid);
        const newStatus = (info.isFullyPaid || newDebt === 0) ? 'settled' : (t.paymentStatus === 'paid' ? 'paid' : 'pending');
        const audit = `[تمت تسوية الشروة آلياً بسداد المشتري الجديد (${info.newBuyerName}) للفاتورة #${info.resaleTrxId}]`;
        const updatedOrig: Transaction = {
          ...t,
          buyerRemainingDebt: newDebt,
          paymentStatus: newStatus as any,
          resoldPaymentStatus: (info.isFullyPaid || newDebt === 0) ? 'paid' : t.resoldPaymentStatus,
          notes: t.notes && !t.notes.includes(info.resaleTrxId) ? `${t.notes}\n${audit}` : (t.notes || audit),
          isEdited: true,
          editedAt: Date.now(),
        };
        saveTransactionToLocalDb(updatedOrig).catch((e) => console.warn('Local DB orig update error:', e));
        return updatedOrig;
      }
      return t;
    });
  };

  const handleRepayBuyerDebt = (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string,
    repaymentMethod: 'cash' | 'exchange' = 'cash',
    exchangeName?: string,
    targetTransactionId?: string
  ) => {
    if (amount <= 0) return;

    const result = executeRepayBuyerDebt(
      transactions,
      cashEntries,
      buyerId,
      buyerName,
      amount,
      settings.currency,
      notes,
      repaymentMethod,
      exchangeName,
      targetTransactionId
    );

    setTransactions(result.nextTransactions);
    saveTransactions(result.nextTransactions);

    setCashEntries(result.nextCashEntries);
    saveCashEntries(result.nextCashEntries);

    saveCashEntryToLocalDb(result.newCashEntry).catch((e) => console.warn('Local DB cash entry save error:', e));
    result.modifiedTransactions.forEach((t) => {
      saveTransactionToLocalDb(t).catch((e) => console.warn('Local DB trx update error on debt repayment:', e));
    });
  };

  const handleSettleResoldTransaction = (trxId: string, notes?: string) => {
    const now = new Date();
    const updated = transactions.map((t) => {
      if (t.id === trxId) {
        const audit = `[تمت تصفية وتسوية دين الشروة الأصلية بإعادة البيع للمشتري (${t.resoldToBuyerName || 'الجديد'})]`;
        const settledTrx: Transaction = {
          ...t,
          paymentStatus: 'settled',
          buyerRemainingDebt: 0,
          resoldPaymentStatus: 'paid',
          notes: t.notes && !t.notes.includes('تمت تصفية') ? `${t.notes}\n${audit}` : (t.notes || audit),
          isEdited: true,
          editedAt: Date.now(),
          editedDateStr: formatGregorianDate(now),
        };
        saveTransactionToLocalDb(settledTrx).catch((e) => console.warn('Local DB settle resold error:', e));
        return settledTrx;
      }
      return t;
    });

    setTransactions(updated);
    saveTransactions(updated);
    setLotTransfers(loadLotTransfers());
  };

  // Seller / Fisherman Payout from the Cash Box (تسليم وصرف مستحقات صياد) with optional Advance Settlement (تسوية ومقاصة سلفة)
  const handlePayoutSeller = (
    sellerId: string,
    sellerName: string,
    amount: number, // Net cash/exchange to disburse
    notes?: string,
    settleAdvanceAmount: number = 0, // Amount to offset against fisherman's advance
    targetTransactionId?: string, // Optional specific transaction ID to settle
    payoutMethod: 'cash' | 'exchange' = 'cash',
    exchangeName?: string
  ): { payoutEntry?: CashEntry; settlementEntry?: CashEntry } | CashEntry => {
    const result = executePayoutSeller(
      transactions,
      cashEntries,
      sellerId,
      sellerName,
      amount,
      notes,
      settleAdvanceAmount,
      targetTransactionId,
      payoutMethod,
      exchangeName
    );

    setTransactions(result.nextTransactions);
    saveTransactions(result.nextTransactions);

    setCashEntries(result.nextCashEntries);
    saveCashEntries(result.nextCashEntries);

    result.newCashEntriesToPersist.forEach((ce) => {
      saveCashEntryToLocalDb(ce).catch((e) => console.warn('Local DB cash entry save error on payout/settle:', e));
    });

    result.modifiedTransactions.forEach((updatedT) => {
      saveTransactionToLocalDb(updatedT).catch((e) => console.warn('Local DB trx update error on seller payout:', e));
    });

    return { payoutEntry: result.payoutEntry, settlementEntry: result.settlementEntry };
  };

  // Seller Advance Cash Out (صرف سلفة نقدية جانبية للصياد بدون ضريبة)
  const handleSaveSellerAdvance = (
    sellerId: string,
    sellerName: string,
    amount: number,
    notes?: string
  ): CashEntry => {
    if (amount <= 0) return {} as CashEntry;
    const now = new Date();
    const newEntry: CashEntry = {
      id: `S-ADV-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'seller_advance',
      category: 'سلفة صياد',
      amount,
      description: `سلفة نقدية للصياد: ${sellerName}${notes ? ` - ${notes}` : ''}`,
      performedBy: 'أمين الصندوق',
      contactId: sellerId,
      contactName: sellerName,
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) =>
      console.warn('Local DB cash entry save error on seller advance:', e)
    );

    return newEntry;
  };

  // Repay Seller Advance in Cash (سداد سلفة الصياد نقداً إلى الصندوق)
  const handleRepaySellerAdvanceCash = (
    sellerId: string,
    sellerName: string,
    amount: number,
    notes?: string
  ): CashEntry => {
    if (amount <= 0) return {} as CashEntry;
    const now = new Date();
    const newEntry: CashEntry = {
      id: `S-REP-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'seller_advance_repayment',
      category: 'سداد سلفة صياد نقداً',
      amount,
      description: `سداد سلفة صياد نقداً إلى الصندوق: ${sellerName}${notes ? ` - ${notes}` : ''}`,
      performedBy: 'أمين الصندوق',
      contactId: sellerId,
      contactName: sellerName,
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) =>
      console.warn('Local DB cash entry save error on seller advance repayment:', e)
    );

    return newEntry;
  };

  // Buyer Advance Loan Cash Out (المشتري يستلف نقدية من الصندوق)
  const handleSaveBuyerLoan = (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string
  ): CashEntry => {
    if (amount <= 0) return {} as CashEntry;
    const now = new Date();
    const newEntry: CashEntry = {
      id: `B-ADV-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'buyer_advance',
      category: 'سلفة مشتري',
      amount,
      description: `صرف سلفة نقدية للمشتري (مسحوبات من الصندوق): ${buyerName}${notes ? ` - ${notes}` : ''}`,
      performedBy: 'أمين الصندوق',
      contactId: buyerId,
      contactName: buyerName,
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) =>
      console.warn('Local DB cash entry save error on buyer advance loan:', e)
    );

    return newEntry;
  };

  // Repay Buyer Advance Loan in Cash (سداد سلفة المشتري نقداً إلى الصندوق)
  const handleRepayBuyerLoanCash = (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string
  ): CashEntry => {
    if (amount <= 0) return {} as CashEntry;
    const now = new Date();
    const newEntry: CashEntry = {
      id: `B-REP-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'buyer_advance_repayment',
      category: 'سداد سلفة مشتري نقداً',
      amount,
      description: `سداد سلفة مشتري نقداً إلى الصندوق: ${buyerName}${notes ? ` - ${notes}` : ''}`,
      performedBy: 'أمين الصندوق',
      contactId: buyerId,
      contactName: buyerName,
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) =>
      console.warn('Local DB cash entry save error on buyer advance loan repayment:', e)
    );

    return newEntry;
  };

  // Save Buyer Advance Deposit or Refund (قبض دفعة مقدمة / قدمة أو استرداد)
  const handleSaveBuyerAdvanceEntry = (
    entryData: Omit<CashEntry, 'id' | 'timestamp' | 'dateStr' | 'timeStr'>
  ): CashEntry => {
    const now = new Date();
    const newEntry: CashEntry = {
      ...entryData,
      id: `ADV-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) => console.warn('Local DB cash entry save error on advance:', e));
    return newEntry;
  };

  // Settle Buyer Debt directly from their Available Advance Balance (سداد دين من رصيد القدمة)
  const handleSettleBuyerDebtFromAdvance = (
    buyerId: string,
    buyerName: string,
    amount: number,
    notes?: string,
    targetTransactionId?: string
  ) => {
    if (amount <= 0) return;

    const normTargetId = (buyerId || '').trim().toLowerCase();
    const normTargetName = (buyerName || '').trim().toLowerCase();
    const hasSpecificTarget = Boolean(targetTransactionId && targetTransactionId !== 'ALL');
    const isTargetAll = targetTransactionId === 'ALL';

    let remainingToRepay = amount;
    const affectedTransactions: { id: string; advanceUsed?: number; debtPaid: number; remainingAfter: number }[] = [];
    const updatedMap = new Map<string, Transaction>();

    const isBuyerMatch = (t: Transaction) => {
      const normTrxId = (t.buyerId || '').trim().toLowerCase();
      const normTrxName = (t.buyerName || '').trim().toLowerCase();
      return (
        (normTargetId && (normTrxId === normTargetId || normTrxName === normTargetId)) ||
        (normTargetName && (normTrxId === normTargetName || normTrxName === normTargetName))
      );
    };

    const getTrxDebt = (t: Transaction) => {
      return getTransactionBuyerDebt(t);
    };

    const unpaidBuyerTrxs = transactions
      .filter((t) => isBuyerMatch(t) && getTrxDebt(t) > 0)
      .sort((a, b) => {
        const aTs = Number(a.timestamp) || (a.dateStr ? new Date(a.dateStr.replace(/\//g, '-')).getTime() : 0);
        const bTs = Number(b.timestamp) || (b.dateStr ? new Date(b.dateStr.replace(/\//g, '-')).getTime() : 0);
        return aTs - bTs;
      });

    const totalInvoiceDebt = unpaidBuyerTrxs.reduce((sum, t) => sum + getTrxDebt(t), 0);
    const priorGeneralRepayments = cashEntries
      .filter((c) => {
        if (c.type !== 'buyer_debt_repayment' && c.type !== 'buyer_advance_repayment') return false;
        const cId = (c.contactId || '').trim().toLowerCase();
        const cName = (c.contactName || '').trim().toLowerCase();
        const match =
          (normTargetId && (cId === normTargetId || cName === normTargetId)) ||
          (normTargetName && (cId === normTargetName || cName === normTargetName));
        if (!match) return false;
        return !c.transactionId && !c.referenceId;
      })
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const netRemainingDebtBefore = Math.max(0, totalInvoiceDebt - priorGeneralRepayments);
    const isPayingFullRemainingDebt = amount >= (netRemainingDebtBefore - 0.5);

    // 1. إذا تم استهداف فاتورة محددة
    if (hasSpecificTarget) {
      const targetTrx = transactions.find((t) => t.id === targetTransactionId);
      if (targetTrx && remainingToRepay > 0) {
        const currentDebt = getTrxDebt(targetTrx);
        if (currentDebt > 0) {
          const deduct = Math.min(remainingToRepay, currentDebt);
          remainingToRepay -= deduct;
          const newDebt = Math.max(0, currentDebt - deduct);
          const newPaid = (targetTrx.buyerPaidAmount || 0) + deduct;
          const newStatus: 'paid' | 'pending' | 'settled' | 'partial' =
            newDebt === 0 ? 'paid' : 'partial';

          affectedTransactions.push({
            id: targetTrx.id,
            advanceUsed: (targetTrx.buyerAdvanceUsed || 0) + deduct,
            debtPaid: deduct,
            remainingAfter: newDebt,
          });

          updatedMap.set(targetTrx.id, {
            ...targetTrx,
            buyerPaidAmount: newPaid,
            buyerAdvanceUsed: (targetTrx.buyerAdvanceUsed || 0) + deduct,
            buyerRemainingDebt: newDebt,
            paymentStatus: newStatus as any,
          });
        }
      }
    } else if (isPayingFullRemainingDebt || isTargetAll) {
      // 2. سداد إجمالي الدين بالكامل خصماً من القدمة: إغلاق وتصفية كافة الفواتير المعلقة فوراً
      for (const t of unpaidBuyerTrxs) {
        const debt = getTrxDebt(t);
        affectedTransactions.push({
          id: t.id,
          advanceUsed: (t.buyerAdvanceUsed || 0) + debt,
          debtPaid: debt,
          remainingAfter: 0,
        });

        updatedMap.set(t.id, {
          ...t,
          buyerPaidAmount: t.totalFromBuyer || (t.buyerPaidAmount || 0) + debt,
          buyerAdvanceUsed: (t.buyerAdvanceUsed || 0) + debt,
          buyerRemainingDebt: 0,
          paidAtPosBuyerAmount:
            t.settlementType === 'association_credit'
              ? t.paidAtPosBuyerAmount
              : (t.totalFromBuyer || t.paidAtPosBuyerAmount),
          paymentStatus: 'paid',
          isEdited: true,
          editedAt: Date.now(),
        });
      }
    } else {
      // 3. سداد جزئي: تسوية الفواتير التي تمت تغطيتها بالكامل 100% فقط
      let availableToSettle = priorGeneralRepayments + amount;
      for (const t of unpaidBuyerTrxs) {
        const debt = getTrxDebt(t);
        if (debt > 0 && availableToSettle >= (debt - 0.5)) {
          availableToSettle -= debt;
          affectedTransactions.push({
            id: t.id,
            advanceUsed: (t.buyerAdvanceUsed || 0) + debt,
            debtPaid: debt,
            remainingAfter: 0,
          });

          updatedMap.set(t.id, {
            ...t,
            buyerPaidAmount: t.totalFromBuyer || (t.buyerPaidAmount || 0) + debt,
            buyerAdvanceUsed: (t.buyerAdvanceUsed || 0) + debt,
            buyerRemainingDebt: 0,
            paidAtPosBuyerAmount:
              t.settlementType === 'association_credit'
                ? t.paidAtPosBuyerAmount
                : (t.totalFromBuyer || t.paidAtPosBuyerAmount),
            paymentStatus: 'paid',
            isEdited: true,
            editedAt: Date.now(),
          });
        }
      }
    }

    const updatedTrxs = transactions.map((t) => {
      const modified = updatedMap.get(t.id);
      if (modified) {
        saveTransactionToLocalDb(modified).catch((e) =>
          console.warn('Local DB trx update error on debt advance repayment:', e)
        );
        return modified;
      }
      return t;
    });

    // إذا تم سداد فاتورة إعادة بيع من رصيد القدمة، نقوم بتسوية الشروة الأصلية تلقائياً
    const repaidResaleList = updatedTrxs
      .filter((t) => t.isResale && t.resoldFromTransactionId)
      .map((t) => {
        const at = affectedTransactions.find((a) => a.id === t.id);
        if (at && at.debtPaid > 0) {
          return {
            resaleTrxId: t.id,
            debtPaid: at.debtPaid,
            isFullyPaid: t.paymentStatus === 'paid' || (t.buyerRemainingDebt !== undefined && t.buyerRemainingDebt <= 0),
            newBuyerName: t.buyerName || '',
          };
        }
        return null;
      })
      .filter(Boolean) as { resaleTrxId: string; debtPaid: number; isFullyPaid: boolean; newBuyerName: string }[];

    const finalTrxs = cascadeResaleSettlements(updatedTrxs, repaidResaleList);

    setTransactions(finalTrxs);
    saveTransactions(finalTrxs);

    let autoDesc = `سداد دين المشتري: ${buyerName} خصماً من رصيد القدمة`;
    if (hasSpecificTarget) {
      autoDesc += ` (سداد فاتورة/شروة #${targetTransactionId})`;
    } else if (isTargetAll) {
      autoDesc += ` (سداد كافة الشروات المعلقة)`;
    } else {
      autoDesc += ` (دفعة على الحساب من إجمالي الدين)`;
    }
    const advanceBreakdown = affectedTransactions
      .filter((at) => at.advanceUsed && at.advanceUsed > 0)
      .map((at) => `فاتورة #${at.id} (خصم سابق من القدمة: ${formatCurrency(at.advanceUsed!, settings.currency)}، وسداد متبقي: ${formatCurrency(at.debtPaid, settings.currency)}${at.remainingAfter === 0 ? ' - تم تصفيتها بالكامل' : ''})`)
      .join(' | ');

    if (advanceBreakdown) {
      autoDesc += ` [${advanceBreakdown}]`;
    }
    if (notes) {
      autoDesc += ` - ${notes}`;
    }

    const now = new Date();
    const newEntry: CashEntry = {
      id: `ADV-SET-${Date.now().toString().slice(-6)}`,
      timestamp: Date.now(),
      dateStr: getTodayLocalYMD(now),
      timeStr: formatGregorianTime(now),
      type: 'advance_debt_settlement',
      category: 'سداد دين من رصيد القدمة',
      amount,
      description: autoDesc,
      performedBy: 'أمين الصندوق',
      contactId: buyerId,
      contactName: buyerName,
    };

    const updatedCash = [newEntry, ...cashEntries];
    setCashEntries(updatedCash);
    saveCashEntries(updatedCash);
    saveCashEntryToLocalDb(newEntry).catch((e) =>
      console.warn('Local DB cash entry save error on advance debt settlement:', e)
    );

    return newEntry;
  };

  // Automatic Financial Offset between Buyer Unpaid Purchases Debt and Sales Dues (المقاصة المالية بين الشروات والبيعات)
  const handleOffsetBuyerSalesWithDebt = (
    buyerId: string,
    buyerName: string,
    surplusAction?: 'payout_cash' | 'deposit_advance',
    notes?: string
  ) => {
    const normTargetId = (buyerId || '').trim().toLowerCase();
    const normTargetName = (buyerName || '').trim().toLowerCase();

    const isContactMatch = (cId?: string, cName?: string) => {
      const tId = (cId || '').trim().toLowerCase();
      const tName = (cName || '').trim().toLowerCase();
      return (
        (normTargetId && (tId === normTargetId || tName === normTargetId)) ||
        (normTargetName && (tId === normTargetName || tName === normTargetName))
      );
    };

    // 1. Calculate buyer's total unpaid purchase debt (D)
    let totalPurchaseDebt = 0;
    const purchaseTrxsToUpdate: { trx: Transaction; debt: number }[] = [];

    // 2. Calculate buyer's total unpaid sales receivables (C)
    let totalSalesReceivables = 0;
    const salesTrxsToUpdate: { trx: Transaction; receivable: number }[] = [];

    transactions.forEach((t) => {
      // Is buyer purchase?
      if (isContactMatch(t.buyerId, t.buyerName)) {
        const debt =
          t.buyerRemainingDebt !== undefined
            ? t.buyerRemainingDebt
            : t.paymentStatus === 'pending' || t.settlementType === 'association_credit'
              ? t.totalFromBuyer
              : t.settlementType === 'partial_cash' || t.paymentStatus === 'partial'
                ? Math.max(0, t.totalFromBuyer - (t.buyerPaidAmount || 0))
                : 0;

        if (debt > 0) {
          totalPurchaseDebt += debt;
          purchaseTrxsToUpdate.push({ trx: t, debt });
        }
      }

      // Is buyer sales (as seller)?
      if (isContactMatch(t.sellerId, t.sellerName)) {
        const netReceivable = t.netToSeller || 0;
        const paidSoFar = typeof t.sellerPaidAmount === 'number'
          ? t.sellerPaidAmount
          : typeof t.paidAtPosAmount === 'number'
            ? t.paidAtPosAmount
            : t.sellerPaidStatus === 'paid'
              ? netReceivable
              : 0;
        const rem = Math.max(0, netReceivable - paidSoFar);

        if (rem > 0 && t.sellerPaidStatus !== 'paid') {
          totalSalesReceivables += rem;
          salesTrxsToUpdate.push({ trx: t, receivable: rem });
        }
      }
    });

    if (totalPurchaseDebt <= 0 && totalSalesReceivables <= 0) return;

    const offsetAmount = Math.min(totalPurchaseDebt, totalSalesReceivables);
    const surplus = Math.max(0, totalSalesReceivables - totalPurchaseDebt);
    const shouldClearSurplusFromSales = surplus > 0 && !!surplusAction;

    // If there is no debt to offset and no surplus action to take, return
    if (offsetAmount <= 0 && !shouldClearSurplusFromSales) return;

    // Apply offset to purchase transactions
    let remainingPurchaseOffset = offsetAmount;
    const purchaseIdsPaid: string[] = [];
    const updatedTrxMap = new Map<string, Transaction>();

    purchaseTrxsToUpdate.forEach(({ trx, debt }) => {
      if (remainingPurchaseOffset > 0) {
        const deduct = Math.min(remainingPurchaseOffset, debt);
        remainingPurchaseOffset -= deduct;
        const newDebt = Math.max(0, debt - deduct);
        const newPaid = (trx.buyerPaidAmount || 0) + deduct;
        const newStatus = newDebt === 0 ? 'paid' : 'partial';

        purchaseIdsPaid.push(`#${trx.id}`);

        const updated: Transaction = {
          ...trx,
          buyerPaidAmount: newPaid,
          buyerRemainingDebt: newDebt,
          paymentStatus: newStatus as any,
          notes: trx.notes
            ? `${trx.notes}\n[مقاصة بيعات: تم تسديد ${formatCurrency(deduct, settings.currency)} من مستحقات البيعات]`
            : `[مقاصة بيعات: تم تسديد ${formatCurrency(deduct, settings.currency)} من مستحقات البيعات]`,
        };
        updatedTrxMap.set(trx.id, updated);
      }
    });

    // Apply offset to sales transactions (and any surplus if surplusAction is chosen)
    let remainingSalesDeduction = offsetAmount + (shouldClearSurplusFromSales ? surplus : 0);
    const salesIdsDeducted: string[] = [];

    salesTrxsToUpdate.forEach(({ trx, receivable }) => {
      if (remainingSalesDeduction > 0) {
        const deduct = Math.min(remainingSalesDeduction, receivable);
        remainingSalesDeduction -= deduct;
        const newPaidAmount = (trx.sellerPaidAmount || 0) + deduct;
        const newRemainingDebt = Math.max(0, (trx.netToSeller || 0) - newPaidAmount);
        const newPaidStatus = newRemainingDebt === 0 ? 'paid' : 'partial';

        salesIdsDeducted.push(`#${trx.id}`);

        const actionNote = shouldClearSurplusFromSales && surplusAction === 'payout_cash'
          ? `صرف نقدي للفائض: ${formatCurrency(deduct, settings.currency)}`
          : shouldClearSurplusFromSales && surplusAction === 'deposit_advance'
            ? `إيداع الفائض في القدمة: ${formatCurrency(deduct, settings.currency)}`
            : `مقاصة مع شروات: تم خصم ${formatCurrency(deduct, settings.currency)} لسداد شروات المشتري`;

        const updated: Transaction = {
          ...trx,
          sellerPaidAmount: newPaidAmount,
          sellerRemainingDebt: newRemainingDebt,
          sellerPaidStatus: newPaidStatus as any,
          notes: trx.notes
            ? `${trx.notes}\n[${actionNote}]`
            : `[${actionNote}]`,
        };
        updatedTrxMap.set(trx.id, updated);
      }
    });

    // Merge updated transactions with existing transactions
    let nextTransactions = transactions.map((t) => updatedTrxMap.get(t.id) || t);

    // إذا كانت إحدى الشروات المسددة بالمقاصة هي شروة معاد بيعها، تسوى الشروة الأصلية تلقائياً
    const repaidResaleList = Array.from(updatedTrxMap.values())
      .filter((t) => t.isResale && t.resoldFromTransactionId)
      .map((t) => {
        const origTrx = transactions.find((ot) => ot.id === t.id);
        const debtPaid = Math.max(0, (origTrx?.buyerRemainingDebt ?? t.totalFromBuyer) - (t.buyerRemainingDebt ?? 0));
        return {
          resaleTrxId: t.id,
          debtPaid,
          isFullyPaid: t.paymentStatus === 'paid' || (t.buyerRemainingDebt !== undefined && t.buyerRemainingDebt <= 0),
          newBuyerName: t.buyerName || '',
        };
      });

    nextTransactions = cascadeResaleSettlements(nextTransactions, repaidResaleList);
    setTransactions(nextTransactions);
    saveTransactions(nextTransactions);
    updatedTrxMap.forEach((updatedT) => {
      saveTransactionToLocalDb(updatedT).catch((e) =>
        console.warn('Local DB error updating trx on offset:', e)
      );
    });

    const now = new Date();
    const newCashEntries: CashEntry[] = [];

    // Record the offset entry only if there was an actual offset between purchases and sales
    if (offsetAmount > 0) {
      const offsetDesc = `مقاصة مالية بين شروات وبيعات: ${buyerName} بمبلغ ${formatCurrency(offsetAmount, settings.currency)} (شروات: ${purchaseIdsPaid.join(', ')} مقابل بيعات: ${salesIdsDeducted.join(', ')})${notes ? ` - ${notes}` : ''}`;

      const offsetCashEntry: CashEntry = {
        id: `CASH-OFF-${Date.now().toString().slice(-6)}`,
        timestamp: Date.now(),
        dateStr: getTodayLocalYMD(now),
        timeStr: formatGregorianTime(now),
        type: 'buyer_debt_repayment',
        category: 'مقاصة بيعات مع شروات',
        payoutMethod: 'cash',
        repaymentMethod: 'offset',
        amount: offsetAmount,
        description: offsetDesc,
        performedBy: 'أمين الصندوق (مقاصة آلية)',
        contactId: buyerId,
        contactName: buyerName,
      };
      newCashEntries.push(offsetCashEntry);
    }

    // Handle surplus if applicable
    if (surplus > 0 && surplusAction) {
      if (surplusAction === 'payout_cash') {
        const payoutDesc = `صرف نقدي لفائض مقاصة البيعات للمشتري/البائع: ${buyerName} بمبلغ ${formatCurrency(surplus, settings.currency)}`;
        const payoutEntry: CashEntry = {
          id: `CASH-SURP-${Date.now().toString().slice(-6)}`,
          timestamp: Date.now() + 1,
          dateStr: getTodayLocalYMD(now),
          timeStr: formatGregorianTime(now),
          type: 'seller_payout',
          category: 'صرف فائض مقاصة بيعات نقداً',
          payoutMethod: 'cash',
          amount: surplus,
          description: payoutDesc,
          performedBy: 'أمين الصندوق',
          contactId: buyerId,
          contactName: buyerName,
        };
        newCashEntries.push(payoutEntry);
      } else if (surplusAction === 'deposit_advance') {
        const advDesc = `إيداع فائض مقاصة البيعات في رصيد القدمة للمشتري: ${buyerName} بمبلغ ${formatCurrency(surplus, settings.currency)}`;
        const advEntry: CashEntry = {
          id: `CASH-ADV-${Date.now().toString().slice(-6)}`,
          timestamp: Date.now() + 1,
          dateStr: getTodayLocalYMD(now),
          timeStr: formatGregorianTime(now),
          type: 'buyer_advance_deposit',
          category: 'إيداع فائض مقاصة بيعات',
          amount: surplus,
          description: advDesc,
          performedBy: 'أمين الصندوق',
          contactId: buyerId,
          contactName: buyerName,
        };
        newCashEntries.push(advEntry);
      }
    }

    const nextCash = [...newCashEntries, ...cashEntries];
    setCashEntries(nextCash);
    saveCashEntries(nextCash);
    newCashEntries.forEach((entry) => {
      saveCashEntryToLocalDb(entry).catch((e) => console.warn('Local DB save cash entry error:', e));
    });
  };

  // Reload data from storage (e.g. after import or reset)
  const handleDataReload = () => {
    setTransactions(loadTransactions());
    setContacts(loadContacts());
    setFishTypes(loadFishTypes());
    setSettings(loadSettings());
    setCashEntries(loadCashEntries());
    setCashClosings(loadCashClosings());
  };

  // Clear all mock data (transactions, contacts, cash entries)
  const handleClearAllData = async () => {
    clearAllMockData();
    setTransactions([]);
    setContacts([]);
    setCashEntries([]);
    setCashClosings([]);

    try {
      await clearAllLocalDb();
    } catch (e) {
      console.warn('Local DB clear warning:', e);
    }
  };

  // Open Receipt
  const handleOpenReceipt = (trx: Transaction, mode: 'buyer' | 'seller' | 'both' = 'buyer') => {
    setSelectedTrx(trx);
    setReceiptMode(mode);
    setJustSaved(false);
    setReceiptModalOpen(true);
  };

  // Tab metadata headers
  const activeTabMeta = {
    pos: {
      title: 'تسجيل فاتورة',
      description: 'تسجيل الفواتير المباشرة وحساب عمولة المشتري 2% وخصم الصياد 3% وأرباح الجمعية',
      icon: Zap,
    },
    transactions: {
      title: 'سجل العمليات والفواتير المحررة',
      description: 'أرشيف صفقات الحراج وإمكانية إعادة الطباعة، التصدير إلى Excel/CSV، وإدارة الفواتير',
      icon: Receipt,
    },
    reports: {
      title: 'كشف حساب العملاء',
      description: 'كشف حساب المشتري، كشف مستحقات الصيادين، وتحليل أرباح الجمعية (5%) حسب الأصناف',
      icon: FileText,
    },
    cashBox: {
      title: 'صندوق النقدية واليومية',
      description: 'إدارة العهدة الصباحية، المصروفات التشغيلية والنثريات، الإيداعات والسحوبات، ومطابقة وجرد الدرج',
      icon: Wallet,
    },
    dailyInventory: {
      title: 'الجرد اليومي ومطابقة الصندوق',
      description: 'مطابقة العهدة الافتتاحية والمتحصلات والمصروفات والعمولات مع النقد الفعلي بالدرج وإقفال اليومية',
      icon: ClipboardCheck,
    },
    contacts: {
      title: 'قسم الصياد والمشترين',
      description: 'إدارة جهات الاتصال الخاصة بالصيادين وأصحاب المراكب والمشترين وسجلاتهم',
      icon: Users,
    },
    fishTypes: {
      title: 'دليل أصناف الأسماك والأسعار',
      description: 'إدارة قائمة الأسماك ووحدات القياس (كيلو، صندوق، طراد، حبة) وأسعارها التقديرية',
      icon: Fish,
    },
    settings: {
      title: 'إعدادات النظام والنسب المالية',
      description: 'بيانات الحراج، نسب العمولات، حساب Firebase، والنسخ الاحتياطي التلقائي',
      icon: Settings,
    },
    backup: {
      title: 'مركز النسخ الاحتياطي والأرشيف',
      description: 'حفظ واستعادة البيانات محلياً وسحابياً وتصدير ملفات Excel وJSON',
      icon: Database,
    },
  }[activeTab] || {
    title: 'نظام حراج الأسماك',
    description: '',
    icon: Zap,
  };

  const MetaIcon = activeTabMeta.icon || Zap;

  // ── انتظار التحقق من حالة Firebase Auth عند أول تشغيل ──
  if (showSplash || isAuthLoading) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // ── شاشة تسجيل الدخول وقفل الشاشة ──
  // ليس من الضروري الدخول للنظام فقط بوجود بريد إلكتروني: يظهر للمستخدم واجهة تسجيل كلمة المرور / رمز PIN
  // مع إمكانية التبديل لواجهة Google والبريد الإلكتروني متى شاء
  if (!isPinUnlocked) {
    if (authView === 'firebase') {
      return (
        <FirebaseLoginScreen
          onContinueWithPin={() => setAuthView('pin')}
        />
      );
    }
    return (
      <LoginScreen
        settings={settings}
        onLoginSuccess={handlePinSuccess}
        currentUserEmail={user?.email}
        onFirebaseLogout={handleFirebaseSignOut}
        onSwitchToFirebase={() => setAuthView('firebase')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-800 flex flex-row font-['Cairo',system-ui,sans-serif]">
      {/* ------------------------------------------------------------- */}
      {/* SIDEBAR NAVIGATION */}
      {/* ------------------------------------------------------------- */}
      <div className="no-print shrink-0 lg:sticky lg:top-0 lg:h-screen z-40">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          settings={settings}
          transactionsCount={transactions.length}
          contactsCount={contacts.length}
          fishTypesCount={fishTypes.length}
          cashEntriesCount={cashEntries.length}
          isOnline={isOnline}
          isDbConnected={cloudStatus === 'connected'}
          onOpenSettings={() => setActiveTab('settings')}
          onOpenBackup={() => setActiveTab('backup')}
          onLogout={handleLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleSidebarCollapse}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MAIN CONTENT WRAPPER */}
      {/* ------------------------------------------------------------- */}
      <div
        id="main-app-shell"
        className={`flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden ${receiptModalOpen || associationProfitModalOpen ? 'print:hidden' : ''
          }`}
      >
        {/* TOP BAR / HEADER */}
        <header className="no-print sticky top-0 z-30 bg-white/95 border-b border-blue-100 backdrop-blur-md px-4 sm:px-6 py-1.5 shadow-xs transition-all">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Right: Hamburger button & Section Title */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-blue-600 border border-slate-200"
                title="فتح القائمة الجانبية"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 items-center justify-center shadow-xs">
                  <MetaIcon className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>{activeTabMeta.title}</span>
                  </h1>
                </div>
              </div>
            </div>

            {/* Left: Quick Metrics, Clock, and Quick POS Action */}
            <div className="flex items-center gap-3">
              {/* Daily Metrics Pill */}
              <div className="hidden xl:flex items-center gap-4 bg-blue-50/70 border border-blue-100 px-3.5 py-1.5 rounded-2xl text-xs shadow-xs">
                <div className="flex items-center gap-2">
                  <Coins className="w-3.5 h-3.5 text-blue-600" />
                  <div>
                    <span className="text-slate-500 block text-[10px]">تداول اليوم:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(todayStats.totalGross, settings.currency)}
                    </span>
                  </div>
                </div>

                <div className="w-px h-6 bg-blue-200" />

                <button
                  type="button"
                  onClick={() => setAssociationProfitModalOpen(true)}
                  className="flex items-center gap-2 text-right hover:opacity-80 transition-opacity cursor-pointer"
                  title="انقر هنا لعرض تفاصيل وتحليل أرباح الجمعية والحراج يوماً بيوم وشروة بشروة (بيعة)"
                >
                  <TrendingUp className="w-3.5 h-3.5 text-blue-700" />
                  <div>
                    <span className="text-blue-800 block text-[10px] font-bold flex items-center gap-1">
                      <span>أرباح الجمعية والحراج:</span>
                      <span className="text-[9px] text-blue-600 font-normal underline">(تفاصيل)</span>
                    </span>
                    <span className="font-mono font-black text-blue-700">
                      {formatCurrency(todayStats.totalProfit, settings.currency)}
                    </span>
                  </div>
                </button>

                <div className="w-px h-6 bg-blue-200" />

                {/* Live Cash Drawer Pill */}
                <button
                  type="button"
                  onClick={() => setActiveTab('cashBox')}
                  className="flex items-center gap-2 text-right hover:opacity-85 transition-opacity cursor-pointer"
                  title={settings.separateProfitsFromDrawerCash
                    ? "كاش الدرج الصافي (مفصول منه أرباح وعمولات الحراج 5%) - انقر للانتقال للصندوق"
                    : "كاش الدرج الإجمالي - انقر للانتقال للصندوق"}
                >
                  <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                  <div>
                    <span className="text-emerald-800 block text-[10px] font-bold">
                      {settings.separateProfitsFromDrawerCash ? 'كاش الدرج (صافي):' : 'كاش الدرج:'}
                    </span>
                    <span className="font-mono font-black text-emerald-700">
                      {formatCurrency(liveDrawerCash, settings.currency)}
                    </span>
                  </div>
                </button>

                <div className="w-px h-6 bg-blue-200" />

                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-sky-600" />
                  <div>
                    <span className="text-slate-500 block text-[10px]">الصفقات:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {todayStats.count} صفقات
                    </span>
                  </div>
                </div>
              </div>



              {/* Live Time Badge */}
              <div className="hidden sm:flex items-center gap-2 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-mono text-slate-700 shadow-xs">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>{currentTime}</span>
              </div>

              {/* Shortcut Button to New Deal if not on POS */}
              {activeTab !== 'pos' && (
                <button
                  id="header-quick-new-deal-btn"
                  type="button"
                  onClick={() => setActiveTab('pos')}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>صفقة جديدة</span>
                </button>
              )}

              {/* زر إرسال نسخة الآن إلى البريد في أعلى الشاشة (يسار الشاشة) */}
              <button
                id="header-email-backup-btn"
                type="button"
                disabled={isSendingEmailBackup}
                onClick={handleSendEmailBackup}
                className={`flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all shadow-2xs cursor-pointer border ${isSendingEmailBackup
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200 cursor-wait'
                  : emailBackupStatus?.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : emailBackupStatus?.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border-indigo-200'
                  }`}
                title="إرسال نسخة احتياطية فوراً إلى البريد الإلكتروني"
              >
                {isSendingEmailBackup ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />
                ) : (
                  <MailCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                )}
                <span>
                  {isSendingEmailBackup
                    ? 'جاري الإرسال...'
                    : emailBackupStatus
                      ? emailBackupStatus.message
                      : 'إرسال نسخة الآن إلى البريد'}
                </span>
              </button>
            </div>
          </div>
        </header>

        {/* MAIN BODY VIEW */}
        <main className={`flex-1 w-full ${activeTab === 'pos' ? 'p-2 sm:p-3.5 max-w-[1920px] mx-auto' : 'p-2 sm:p-3.5 max-w-[1600px] mx-auto'}`}>
          {/* Keep POS mounted in the DOM so form inputs, items, fisherman and buyer data are preserved when switching tabs */}
          <div className={activeTab === 'pos' ? 'block' : 'hidden'}>
            <FastEntryPOS
              isActive={activeTab === 'pos'}
              contacts={contacts}
              fishTypes={fishTypes}
              settings={settings}
              transactionsCount={transactions.length}
              currentDrawerCash={liveDrawerCash}
              cashEntries={cashEntries}
              transactions={transactions}
              onOpenReceipt={handleOpenReceipt}
              onOpenCashBox={() => {
                setCashOpeningRequest(Date.now());
                setActiveTab('cashBox');
              }}
              onAddCashEntry={handleAddCashEntry}
              onSaveTransaction={handleSaveTransaction}
              onUpdateTransaction={handleUpdateTransaction}
              onQuickAddContact={handleAddContact}
              onUpdateContact={handleUpdateContact}
              onNavigateToCustomerStatement={handleNavigateToCustomerStatement}
            />
          </div>

          <React.Suspense fallback={<TabLoadingFallback />}>
            {activeTab === 'transactions' && (
              <TransactionsList
                transactions={transactions}
                settings={settings}
                contacts={contacts}
                fishTypes={fishTypes}
                onOpenReceipt={handleOpenReceipt}
                onDeleteTransaction={handleDeleteTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onSaveTransaction={handleSaveTransaction}
                onQuickAddContact={handleAddContact}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                transactions={transactions}
                contacts={contacts}
                cashEntries={cashEntries}
                fishTypes={fishTypes}
                settings={settings}
                lotTransfers={lotTransfers}
                onOpenReceipt={handleOpenReceipt}
                onDeleteTransaction={handleDeleteTransaction}
                onUpdateTransaction={handleUpdateTransaction}
                onSaveTransaction={handleSaveTransaction}
                onOffsetBuyerSalesDebt={handleOffsetBuyerSalesWithDebt}
                onSettleResoldTransaction={handleSettleResoldTransaction}
                onRepayBuyerDebt={handleRepayBuyerDebt}
                onPayoutSeller={handlePayoutSeller}
                onSaveSellerAdvance={handleSaveSellerAdvance}
                onRepaySellerAdvanceCash={handleRepaySellerAdvanceCash}
                onSaveBuyerLoan={handleSaveBuyerLoan}
                onRepayBuyerLoanCash={handleRepayBuyerLoanCash}
                onSaveBuyerAdvanceEntry={handleSaveBuyerAdvanceEntry}
                onSettleBuyerDebtFromAdvance={handleSettleBuyerDebtFromAdvance}
                targetBuyerStatement={targetBuyerStatement}
                targetSellerStatement={targetSellerStatement}
                onAddContact={handleAddContact}
                onAddCashEntry={handleAddCashEntry}
                onDeleteCashEntry={handleDeleteCashEntry}
                onUpdateCashEntry={handleUpdateCashEntry}
                onNavigateToSettings={() => setActiveTab('settings')}
                onNavigateToBackup={() => setActiveTab('backup')}
                onLogout={handleLogout}
              />
            )}

            {activeTab === 'cashBox' && (
              <CashBoxManager
                cashEntries={cashEntries}
                cashClosings={cashClosings}
                transactions={transactions}
                contacts={contacts}
                settings={settings}
                onAddCashEntry={handleAddCashEntry}
                onDeleteCashEntry={handleDeleteCashEntry}
                onUpdateCashEntry={handleUpdateCashEntry}
                onCloseDay={handleCloseCashDay}
                onRepayBuyerDebt={handleRepayBuyerDebt}
                onOffsetBuyerSalesDebt={handleOffsetBuyerSalesWithDebt}
                onSaveSellerAdvance={handleSaveSellerAdvance}
                onRepaySellerAdvanceCash={handleRepaySellerAdvanceCash}
                onNavigateToBuyerStatement={handleNavigateToBuyerStatement}
                onCashEntrySaved={() => setActiveTab('pos')}
                openOpeningRequest={cashOpeningRequest}
              />
            )}

            {activeTab === 'dailyInventory' && (
              <DailyInventoryView
                cashEntries={cashEntries}
                cashClosings={cashClosings}
                transactions={transactions}
                contacts={contacts}
                settings={settings}
                onSaveClosing={handleCloseCashDay}
                onAddCashEntry={handleAddCashEntry}
                onNavigateToCashBox={() => setActiveTab('cashBox')}
              />
            )}

            {activeTab === 'contacts' && (
              <ContactsManager
                contacts={contacts}
                onAddContact={handleAddContact}
                onUpdateContact={handleUpdateContact}
                onDeleteContact={handleDeleteContact}
              />
            )}

            {activeTab === 'fishTypes' && (
              <FishTypesManager
                fishTypes={fishTypes}
                currency={settings.currency}
                onAddFishType={handleAddFishType}
                onUpdateFishType={handleUpdateFishType}
                onDeleteFishType={handleDeleteFishType}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                onSaveSettings={(newSettings) => {
                  setSettings(newSettings);
                  saveSettings(newSettings);
                  saveSettingsToLocalDb(newSettings).catch((e) => console.warn('Local DB settings save error:', e));
                }}
                onDataReload={handleDataReload}
                onClearAllData={handleClearAllData}
                cloudStatus={cloudStatus}
                onOpenBackup={() => setActiveTab('backup')}
                transactions={transactions}
                contacts={contacts}
                fishTypes={fishTypes}
                cashEntries={cashEntries}
                cashClosings={cashClosings}
                lotTransfers={lotTransfers}
              />
            )}

            {activeTab === 'backup' && (
              <BackupView
                transactions={transactions}
                contacts={contacts}
                fishTypes={fishTypes}
                settings={settings}
                cloudStatus={cloudStatus}
                onDataReload={handleDataReload}
                onClearAllData={handleClearAllData}
              />
            )}
          </React.Suspense>
        </main>

        {/* BOTTOM MINIMAL FOOTER */}
        <footer className="no-print mt-auto border-t border-slate-200 bg-white py-3 px-4 sm:px-6 text-xs text-slate-600">
          <div className="max-w-[1600px] mx-auto flex items-center justify-center text-center">
            <span className="font-bold text-slate-800 text-sm">
              سوق عين بامعبد المركزي - للأسماك الطازجة والخضروات والفواكة
            </span>
          </div>
        </footer>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MODALS */}
      {/* ------------------------------------------------------------- */}
      <ReceiptModal
        transaction={selectedTrx}
        settings={settings}
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        justSaved={justSaved}
        mode={receiptMode}
      />

      <React.Suspense fallback={null}>
        {settingsModalOpen && (
          <SettingsModal
            settings={settings}
            isOpen={settingsModalOpen}
            onClose={() => setSettingsModalOpen(false)}
            onSaveSettings={(newSettings) => {
              setSettings(newSettings);
              saveSettings(newSettings);
              saveSettingsToLocalDb(newSettings).catch((e) => console.warn('Local DB settings save error:', e));
            }}
            onDataReload={handleDataReload}
            onClearAllData={handleClearAllData}
            cloudStatus={cloudStatus}
            onOpenBackup={() => setBackupModalOpen(true)}
            transactions={transactions}
            contacts={contacts}
            fishTypes={fishTypes}
            cashEntries={cashEntries}
            cashClosings={cashClosings}
            lotTransfers={lotTransfers}
          />
        )}

        {backupModalOpen && (
          <BackupModal
            isOpen={backupModalOpen}
            onClose={() => setBackupModalOpen(false)}
            transactions={transactions}
            contacts={contacts}
            fishTypes={fishTypes}
            settings={settings}
            cashEntries={cashEntries}
            cashClosings={cashClosings}
            cloudStatus={cloudStatus}
            onDataReload={handleDataReload}
            onClearAllData={handleClearAllData}
          />
        )}

        {associationProfitModalOpen && (
          <AssociationProfitModal
            isOpen={associationProfitModalOpen}
            onClose={() => setAssociationProfitModalOpen(false)}
            transactions={transactions}
            settings={settings}
          />
        )}
      </React.Suspense>
    </div>
  );
}

// ─── App الخارجي: يغلف كل شيء بـ AuthProvider ───
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
