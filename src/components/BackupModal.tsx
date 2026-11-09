import React, { useState } from 'react';
import {
  Download,
  Upload,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  X,
  FileText,
  Users,
  Fish,
  ShieldCheck,
  Calendar,
  Layers,
  Trash2,
  Mail,
  Send,
  Loader2,
  MailCheck,
} from 'lucide-react';
import { CashDayCloseRecord, CashEntry, Contact, FishType, MarketSettings, Transaction } from '../types';
import { formatGregorianDate, formatNumber } from '../utils/calculations';
import {
  exportAllData,
  exportTransactionsToXlsx,
  triggerDownloadFile,
  importData,
  parseBackupFileContent,
  clearAllMockData,
  ImportResult,
} from '../utils/storage';
import {
  syncAllToLocalDb,
  smartMergeLocalDb,
} from '../frontend/localDbClient';
import { useAuth } from '../context/AuthContext';
import { sendBackupEmailNow } from '../services/emailBackupClient';


interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  contacts: Contact[];
  fishTypes: FishType[];
  settings: MarketSettings;
  cashEntries?: CashEntry[];
  cashClosings?: CashDayCloseRecord[];
  cloudStatus: 'connected' | 'syncing' | 'offline';
  onDataReload: () => void;
  onClearAllData?: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  transactions,
  contacts,
  fishTypes,
  settings,
  cashEntries = [],
  cashClosings = [],
  cloudStatus,
  onDataReload,
  onClearAllData,
}) => {
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [pendingFilePreview, setPendingFilePreview] = useState<{
    fileContent: string;
    exportDate?: string;
    marketName?: string;
    transactionsCount?: number;
    contactsCount?: number;
    fishTypesCount?: number;
    cashEntriesCount?: number;
    cashClosingsCount?: number;
    hasSettings?: boolean;
  } | null>(null);

  const { user } = useAuth();
  const [isEmailSending, setIsEmailSending] = useState<boolean>(false);

  const handleSendEmailBackup = async () => {
    const targetEmail = user?.email || settings.smtpUser;
    if (!targetEmail) {
      setErrorNotice('لم يتم العثور على بريد إلكتروني مسجل في النظام. يرجى تسجيل الدخول أولاً.');
      return;
    }

    if (!settings.smtpPass?.trim()) {
      setErrorNotice('لم يتم ضبط كلمة مرور التطبيقات (App Password) في الإعدادات بعد. يرجى فتح "الإعدادات > إعدادات خادم البريد (SMTP)" لإدخالها.');
      return;
    }

    setIsEmailSending(true);
    setSuccessNotice(null);
    setErrorNotice(null);

    try {
      const jsonContent = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings);
      const res = await sendBackupEmailNow(targetEmail, jsonContent, {
        host: settings.smtpHost || 'smtp.gmail.com',
        port: settings.smtpPort ? Number(settings.smtpPort) : 465,
        user: settings.smtpUser || targetEmail,
        pass: settings.smtpPass,
        secure: settings.smtpSecure !== false,
      });
      setSuccessNotice(`تم إرسال النسخة الاحتياطية بنجاح إلى: ${targetEmail}`);
      setTimeout(() => setSuccessNotice(null), 5000);
    } catch (err: any) {
      console.error('Email backup error:', err);
      setErrorNotice(err.message || 'تعذر إرسال النسخة الاحتياطية إلى البريد الإلكتروني.');
    } finally {
      setIsEmailSending(false);
    }
  };

  if (!isOpen) return null;

  const getFormattedTimestamp = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
  };

  // 1. Download Full JSON Backup
  const handleDownloadFullBackup = () => {
    try {
      const jsonContent = exportAllData(transactions, contacts, fishTypes, settings, cashEntries, cashClosings);
      const filename = `نسخة-احتياطية-حراج-الاسماك_${getFormattedTimestamp()}.json`;
      triggerDownloadFile(jsonContent, filename, 'application/json');

      setSuccessNotice(`تم تنزيل النسخة الاحتياطية بنجاح باسم: ${filename}`);
      setErrorNotice(null);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error('Download backup error:', err);
      setErrorNotice('حدث خطأ أثناء إعداد ملف النسخة الاحتياطية.');
    }
  };

  // 2. Download Excel / CSV Transactions
  const handleDownloadExcel = () => {
    try {
      const filename = `سجل-فواتير-حراج-الاسماك_${getFormattedTimestamp()}.xlsx`;
      exportTransactionsToXlsx(transactions, filename);

      setSuccessNotice(`تم تنزيل سجل الفواتير كملف Excel بنجاح باسم: ${filename}`);
      setErrorNotice(null);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error('Download Excel error:', err);
      setErrorNotice('حدث خطأ أثناء تصدير ملف الإكسل.');
    }
  };

  // 3. Sync to Database (PostgreSQL)
  const handleForceLocalDbSync = async () => {
    setIsCloudSyncing(true);
    setSuccessNotice(null);
    setErrorNotice(null);

    try {
      await syncAllToLocalDb({
        transactions,
        contacts,
        fishTypes,
        settings,
      });

      setIsCloudSyncing(false);
      setSuccessNotice(
        `تمت المزامنة وحفظ النسخة في قاعدة البيانات (PostgreSQL) بنجاح! (${transactions.length} فاتورة، ${contacts.length} جهة اتصال)`
      );
      setTimeout(() => setSuccessNotice(null), 5000);
    } catch (err) {
      console.error('Local DB sync error:', err);
      setIsCloudSyncing(false);
      setErrorNotice('تعذر إكمال الحفظ في قاعدة البيانات، تأكد من تشغيل الخادم.');
    }
  };

  // 4. Handle file selection for Restore
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      setErrorNotice('الملف المحدد فارغ تماماً (حجمه 0 بايت). يرجى اختيار ملف نسخة احتياطية صالح يحتوي على بيانات، مثل: haraj_latest_backup.json.');
      setPendingFilePreview(null);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawContent = (event.target?.result as string) || '';
        const parseRes = parseBackupFileContent(rawContent);

        if (!parseRes.success || !parseRes.data) {
          setErrorNotice(parseRes.error || 'الملف المرفوع غير صالح، يجب أن يكون ملف JSON خاص بنظام حراج الأسماك.');
          setPendingFilePreview(null);
          return;
        }

        const parsed = parseRes.data;
        const cleanContent = parseRes.cleanJsonString || rawContent;

        setPendingFilePreview({
          fileContent: cleanContent,
          exportDate: parsed.exportDateFormatted || parsed.exportDate || 'غير محدد',
          marketName: parsed.settings?.marketName || '',
          transactionsCount: Array.isArray(parsed.transactions) ? parsed.transactions.length : 0,
          contactsCount: Array.isArray(parsed.contacts) ? parsed.contacts.length : 0,
          fishTypesCount: Array.isArray(parsed.fishTypes) ? parsed.fishTypes.length : 0,
          cashEntriesCount: Array.isArray(parsed.cashEntries) ? parsed.cashEntries.length : 0,
          cashClosingsCount: Array.isArray(parsed.cashClosings) ? parsed.cashClosings.length : 0,
          hasSettings: Boolean(parsed.settings),
        });
        setErrorNotice(null);
      } catch (err) {
        console.error('Parse backup error:', err);
        setErrorNotice('الملف المرفوع غير صالح، يجب أن يكون ملف JSON خاص بنظام حراج الأسماك.');
        setPendingFilePreview(null);
      }
    };
    reader.readAsText(file, 'utf-8');
    // Reset file input so re-selecting same file works
    e.target.value = '';
  };

  // 5. Confirm Restore
  const handleConfirmRestore = async () => {
    if (!pendingFilePreview) return;

    try {
      const res: ImportResult = importData(pendingFilePreview.fileContent, { overwriteSettings: true });
      if (res.success) {
        setSuccessNotice(
          `تمت استعادة البيانات بنجاح! (${res.stats?.transactionsCount || 0} فاتورة، ${res.stats?.contactsCount || 0} جهة اتصال)`
        );
        setPendingFilePreview(null);
        if (res.mergedPayload) {
          await smartMergeLocalDb(res.mergedPayload).catch((e) =>
            console.warn('Local DB smart merge warning:', e)
          );
        }
        onDataReload();
        setTimeout(() => {
          setSuccessNotice(null);
          onClose();
        }, 2000);
      } else {
        setErrorNotice(res.message);
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      setErrorNotice('حدث خطأ أثناء استعادة البيانات');
    }
  };

  const handleConfirmClearAll = () => {
    if (onClearAllData) {
      onClearAllData();
    } else {
      clearAllMockData();
      onDataReload();
    }
    setShowClearConfirm(false);
    setSuccessNotice('تم مسح وتصفير كافة البيانات بنجاح! يمكنك الآن إدخال بياناتك الجديدة.');
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  const totalGrossValue = transactions.reduce((acc, t) => acc + (t.grossAmount || 0), 0);
  const totalHarajProfit = transactions.reduce((acc, t) => acc + (t.harajProfit || 0), 0);

  return (
    <div
      id="backup-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div
        id="backup-modal-container"
        className="bg-white border border-slate-300 rounded-none max-w-2xl w-full overflow-hidden shadow-xl animate-in fade-in zoom-in-95 my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-300 bg-linear-to-r from-blue-900 via-blue-800 to-indigo-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-white/10 flex items-center justify-center border border-white/20">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-white">
                النسخ الاحتياطي وحفظ البيانات
              </h3>
              <p className="text-xs text-blue-200">
                تنزيل نسخة آمنة على جهازك أو مزامنتها مع خوادم Google Cloud
              </p>
            </div>
          </div>
          <button
            id="close-backup-modal-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-none text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Notifications */}
          {successNotice && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-none flex items-center gap-2.5 text-emerald-900 text-xs sm:text-sm font-bold animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {errorNotice && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-none flex items-center gap-2.5 text-rose-900 text-xs sm:text-sm font-bold animate-in fade-in">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* Current Database Summary Statistics */}
          <div className="bg-slate-50 border border-slate-300 rounded-none p-3.5 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-xs sm:text-sm">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>محتويات النسخة الاحتياطية الحالية</span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-none border border-slate-300">
                {formatGregorianDate(new Date())}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white p-3 rounded-none border border-slate-300 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>الفواتير</span>
                </div>
                <div className="font-extrabold text-base sm:text-lg text-slate-900">
                  {transactions.length}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  إجمالي: {formatNumber(totalGrossValue)} ريال
                </div>
              </div>

              <div className="bg-white p-3 rounded-none border border-slate-300 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  <span>جهات الاتصال</span>
                </div>
                <div className="font-extrabold text-base sm:text-lg text-slate-900">
                  {contacts.length}
                </div>
                <div className="text-[10px] text-slate-400">صيادين وتجار</div>
              </div>

              <div className="bg-white p-3 rounded-none border border-slate-300 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                  <Fish className="w-3.5 h-3.5 text-amber-500" />
                  <span>أنواع الأسماك</span>
                </div>
                <div className="font-extrabold text-base sm:text-lg text-slate-900">
                  {fishTypes.length}
                </div>
                <div className="text-[10px] text-slate-400">أصناف مسجلة</div>
              </div>

              <div className="bg-white p-3 rounded-none border border-slate-300 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                  <span>عمولات الحراج</span>
                </div>
                <div className="font-extrabold text-base sm:text-lg text-indigo-900">
                  {formatNumber(totalHarajProfit)}
                </div>
                <div className="text-[10px] text-slate-400">أرباح 5% المسجلة</div>
              </div>
            </div>
          </div>

          {/* Section 1: Instant Download Backup (JSON) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Download className="w-4 h-4 text-blue-600" />
              <span>تنزيل النسخة الاحتياطية على جهازك (حفظ محلي)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary JSON Full Backup */}
              <button
                id="btn-download-full-json"
                type="button"
                onClick={handleDownloadFullBackup}
                className="p-4 rounded-none bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold flex items-start gap-3 text-right shadow-xs hover:shadow-xs transition-all cursor-pointer group"
              >
                <div className="p-2.5 rounded-none bg-white/20 shrink-0 group-hover:scale-110 transition-transform">
                  <Download className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-extrabold text-sm sm:text-base mb-0.5">
                    تحميل نسخة احتياطية كاملة (.json)
                  </div>
                  <div className="text-xs text-blue-100 leading-relaxed">
                    تحتوي على كافة الفواتير، الصيادين، المشترين، الأسعار، والإعدادات بدقة
                  </div>
                </div>
              </button>

              {/* Excel Export */}
              <button
                id="btn-download-excel"
                type="button"
                onClick={handleDownloadExcel}
                className="p-4 rounded-none bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold flex items-start gap-3 text-right shadow-xs hover:shadow-xs transition-all cursor-pointer group"
              >
                <div className="p-2.5 rounded-none bg-white/20 shrink-0 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-extrabold text-sm sm:text-base mb-0.5">
                    تصدير سجل الفواتير كـ Excel (.xlsx)
                  </div>
                  <div className="text-xs text-emerald-100 leading-relaxed">
                    ملف جداول احترافي مفصل يشمل كافة الصنف والتواريخ والأسماء
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 2: Database Sync */}
          <div className="p-4 bg-linear-to-r from-emerald-50/90 to-teal-50/90 border border-emerald-200 rounded-none space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>قاعدة البيانات المركزية (PostgreSQL)</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    cloudStatus === 'connected'
                      ? 'bg-emerald-500 ring-2 ring-emerald-300'
                      : 'bg-amber-500'
                  }`}
                />
                <span className="text-emerald-800">
                  {cloudStatus === 'connected' ? 'قاعدة البيانات متصلة ونشطة' : 'وضع غير متصل'}
                </span>
              </div>
            </div>

            <p className="text-xs text-emerald-900 leading-relaxed">
              يقوم النظام بحفظ ومزامنة الفواتير والمعاملات تلقائياً داخل قاعدة بيانات PostgreSQL لضمان أعلى مستويات الأمان والسرعة.
            </p>

            <div className="pt-1">
              <button
                id="btn-sync-cloud-backup"
                type="button"
                onClick={handleForceLocalDbSync}
                disabled={isCloudSyncing}
                className="w-full sm:w-auto px-4 py-2.5 rounded-none bg-white hover:bg-emerald-50 text-emerald-900 font-bold text-xs sm:text-sm border border-emerald-300 shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-600 ${isCloudSyncing ? 'animate-spin' : ''}`} />
                <span>
                  {isCloudSyncing ? 'جاري مزامنة وحفظ السجلات في قاعدة البيانات...' : 'تحديث ومزامنة البيانات فورياً في قاعدة البيانات'}
                </span>
              </button>
            </div>
          </div>

          {/* Section 2.5: Email Backup */}
          <div className="p-4 bg-linear-to-r from-blue-50/90 to-indigo-50/90 border border-blue-300 rounded-none space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                <MailCheck className="w-4 h-4 text-blue-600" />
                <span>إرسال نسخة احتياطية إلى البريد الإلكتروني (Single Thread)</span>
              </div>
              <span className="text-[11px] font-bold text-blue-800 bg-white px-2.5 py-0.5 rounded-none border border-blue-300" dir="ltr">
                {user?.email || settings.smtpUser || 'البريد المسجل'}
              </span>
            </div>

            <p className="text-xs text-blue-950 leading-relaxed">
              يقوم النظام بتجميع بيانات الفواتير وجهات الاتصال والأسماك والخزينة في ملف <code className="bg-white text-blue-900 px-1.5 py-0.5 rounded font-mono text-[11px] border border-blue-300">backup_latest.json</code> وإرسالها بموضوع ثابت <span className="font-bold">[نسخة احتياطية يومية - نظام الحراج]</span> لتُجمع تلقائياً في خيط محادثة واحد دون فوضى.
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={handleSendEmailBackup}
                disabled={isEmailSending}
                className="w-full sm:w-auto px-4 py-2.5 rounded-none bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {isEmailSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري تجميع وإرسال النسخة إلى بريدك...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>إرسال نسخة احتياطية إلى بريدي الآن</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Section 3: Restore Backup */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Upload className="w-4 h-4 text-amber-600" />
              <span>استعادة نسخة احتياطية من ملف سابق (Restore)</span>
            </div>

            {!pendingFilePreview ? (
              <label
                id="upload-backup-file-label"
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 rounded-none p-5 text-center cursor-pointer transition-all group"
              >
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-600 transition-colors mb-2" />
                <span className="font-bold text-xs sm:text-sm text-slate-700 group-hover:text-blue-900">
                  انقر هنا لاختيار ملف النسخة الاحتياطية (.json)
                </span>
                <span className="text-[11px] text-slate-400 mt-1">
                  يمكنك استرجاع جميع الصفقات والأسماء في ثوانٍ معدودة
                </span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="bg-amber-50/80 border border-amber-300 rounded-none p-4 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>تم التعرف على ملف النسخة الاحتياطية بنجاح</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPendingFilePreview(null)}
                    className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
                  >
                    إلغاء واختيار ملف آخر
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-amber-950 bg-white p-3.5 rounded-none border border-amber-200 shadow-2xs">
                  <div className="col-span-2 sm:col-span-3 pb-2 border-b border-amber-100 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 font-semibold text-[11px]">تاريخ النسخة: </span>
                      <strong className="text-amber-950 font-bold">{pendingFilePreview.exportDate}</strong>
                    </div>
                    {pendingFilePreview.marketName && (
                      <span className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-none border border-blue-300">
                        {pendingFilePreview.marketName}
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80">
                    <span className="block text-[11px] text-slate-500">الفواتير والشروات:</span>
                    <strong className="text-sm text-blue-950">{pendingFilePreview.transactionsCount} فاتورة</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80">
                    <span className="block text-[11px] text-slate-500">جهات الاتصال:</span>
                    <strong className="text-sm text-emerald-950">{pendingFilePreview.contactsCount} اسم</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80">
                    <span className="block text-[11px] text-slate-500">أنواع الأسماك:</span>
                    <strong className="text-sm text-indigo-950">{pendingFilePreview.fishTypesCount} صنف</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80">
                    <span className="block text-[11px] text-slate-500">حركات الخزينة والصندوق:</span>
                    <strong className="text-sm text-amber-950">{pendingFilePreview.cashEntriesCount || 0} حركة</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80">
                    <span className="block text-[11px] text-slate-500">إقفالات الصندوق:</span>
                    <strong className="text-sm text-slate-900">{pendingFilePreview.cashClosingsCount || 0} إقفال</strong>
                  </div>
                  <div className="bg-slate-50 p-2 rounded-none border border-slate-300/80 flex items-center justify-between">
                    <div>
                      <span className="block text-[11px] text-slate-500">إعدادات النظام:</span>
                      <strong className="text-xs text-emerald-700">
                        {pendingFilePreview.hasSettings ? '✓ متضمنة بالكامل' : 'غير متوفرة'}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPendingFilePreview(null)}
                    className="px-3.5 py-2 rounded-none text-slate-600 hover:text-slate-800 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    id="btn-confirm-restore"
                    type="button"
                    onClick={handleConfirmRestore}
                    className="px-4 py-2 rounded-none bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تأكيد واستعادة هذه النسخة الآن</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Clear / Reset all data */}
          <div className="p-4 bg-red-50/70 border border-red-200 rounded-none space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>تصفير ومسح كافة البيانات (البدء بسجل فارغ)</span>
              </div>
            </div>
            <p className="text-xs text-red-800 leading-relaxed">
              لحذف جميع الفواتير الوهمية وجهات الاتصال وحركات الصندوق والبدء بإدخال بياناتك الحقيقية من الصفر.
            </p>
            {!showClearConfirm ? (
              <button
                id="btn-open-clear-confirm"
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="px-4 py-2 rounded-none bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح وتصفير كافة البيانات الآن</span>
              </button>
            ) : (
              <div className="p-3 bg-white border border-red-300 rounded-none space-y-2 animate-in fade-in">
                <div className="text-xs font-bold text-red-900">
                  هل أنت متأكد من رغبتك في حذف وتصفير كافة البيانات؟ ستصبح الفواتير والأسماء والصندوق فارغة تماماً.
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    id="btn-execute-clear-all"
                    type="button"
                    onClick={handleConfirmClearAll}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-none text-xs font-bold cursor-pointer transition-colors"
                  >
                    نعم، احذف كل البيانات وابدأ فارغاً
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-none text-xs font-bold cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>نظام التخزين المزدوج (محلي + سحابي)</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-none bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
