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
  Eye,
  EyeOff,
  KeyRound,
  ExternalLink,
} from 'lucide-react';
import { Contact, FishType, MarketSettings, Transaction } from '../types';
import { formatGregorianDate, formatNumber } from '../utils/calculations';
import {
  exportAllData,
  exportTransactionsToXlsx,
  triggerDownloadFile,
  importData,
  parseBackupFileContent,
  clearAllMockData,
  ImportResult,
  loadCashEntries,
  loadCashClosings,
} from '../utils/storage';
import {
  syncAllToLocalDb,
  smartMergeLocalDb,
} from '../frontend/localDbClient';
import { useAuth } from '../context/AuthContext';
import { sendBackupEmailNow } from '../services/emailBackupClient';
import { saveBackupToFolder, openLocalFolder, DEFAULT_GOOGLE_DRIVE_FOLDER } from '../services/folderBackupClient';

interface BackupViewProps {
  transactions: Transaction[];
  contacts: Contact[];
  fishTypes: FishType[];
  settings: MarketSettings;
  cloudStatus: 'connected' | 'syncing' | 'offline';
  onDataReload: () => void;
  onClearAllData?: () => void;
}

export const BackupView: React.FC<BackupViewProps> = ({
  transactions,
  contacts,
  fishTypes,
  settings,
  cloudStatus,
  onDataReload,
  onClearAllData,
}) => {
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [wipePinInput, setWipePinInput] = useState<string>('');
  const [wipePinError, setWipePinError] = useState<string | null>(null);
  const [showWipePin, setShowWipePin] = useState<boolean>(false);
  const [isWiping, setIsWiping] = useState<boolean>(false);
  const [overwriteSettingsChoice, setOverwriteSettingsChoice] = useState<boolean>(false);
  const [pendingFilePreview, setPendingFilePreview] = useState<{
    fileContent: string;
    exportDate?: string;
    transactionsCount?: number;
    contactsCount?: number;
    fishTypesCount?: number;
    cashEntriesCount?: number;
    hasSettings?: boolean;
  } | null>(null);

  const { user } = useAuth();
  const [isEmailSending, setIsEmailSending] = useState<boolean>(false);

  const handleSendEmailBackup = async () => {
    const targetEmail = user?.email || settings.smtpUser;
    if (!targetEmail) {
      setErrorNotice('لم يتم العثور على بريد إلكتروني مسجل في النظام. يرجى تسجيل الدخول أولاً في إعدادات النظام.');
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
      const jsonContent = exportAllData(transactions, contacts, fishTypes, settings);
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

  const [isFolderBackupSaving, setIsFolderBackupSaving] = useState<boolean>(false);

  const handleSaveToGoogleDriveFolder = async () => {
    setIsFolderBackupSaving(true);
    setSuccessNotice(null);
    setErrorNotice(null);
    try {
      const jsonString = exportAllData(transactions, contacts, fishTypes, settings, loadCashEntries(), loadCashClosings());
      const targetFolder = settings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER;
      const res = await saveBackupToFolder(targetFolder, jsonString);
      if (res.success) {
        setSuccessNotice(`✓ تم حفظ وتنزيل نسخة النظام الأصلية والفعلية بنجاح في مجلد Google Drive: ${res.savedPath}`);
        setTimeout(() => setSuccessNotice(null), 6000);
      } else {
        setErrorNotice(res.error || 'فشل حفظ النسخة في مجلد Google Drive');
      }
    } catch (err: any) {
      setErrorNotice(err?.message || 'تعذر حفظ النسخة الاحتياطية');
    } finally {
      setIsFolderBackupSaving(false);
    }
  };

  const handleExportJson = () => {
    try {
      const jsonString = exportAllData(transactions, contacts, fishTypes, settings, loadCashEntries(), loadCashClosings());
      const today = new Date().toISOString().slice(0, 10);
      const filename = `haraj_backup_${today}.json`;
      triggerDownloadFile(jsonString, filename, 'application/json');

      // Also automatically save a copy directly to the Google Drive folder
      const targetFolder = settings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER;
      saveBackupToFolder(targetFolder, jsonString).catch(() => {});

      setSuccessNotice('تم تصدير ملف النسخة الاحتياطية JSON بنجاح إلى جهازك ومجلد Google Drive.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error(err);
      setErrorNotice('حدث خطأ أثناء تصدير ملف JSON');
    }
  };

  const handleExportExcel = () => {
    try {
      if (!transactions || transactions.length === 0) {
        setErrorNotice('لا توجد عمليات بيع لتصديرها إلى Excel حالياً');
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const filename = `سجل-فواتير-حراج-الاسماك_${today}.xlsx`;
      exportTransactionsToXlsx(transactions, filename);
      setSuccessNotice('تم تصدير سجل الفواتير والمبيعات إلى ملف Excel (.xlsx) بنجاح');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error(err);
      setErrorNotice('حدث خطأ أثناء إنشاء ملف Excel');
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
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
          setErrorNotice(parseRes.error || 'تعذر قراءة الملف. تأكد من أنه ملف JSON سليم تم تصديره من هذا النظام.');
          setPendingFilePreview(null);
          return;
        }

        const parsed = parseRes.data;
        const cleanContent = parseRes.cleanJsonString || rawContent;

        setOverwriteSettingsChoice(false);
        setPendingFilePreview({
          fileContent: cleanContent,
          exportDate: parsed.exportDateFormatted || parsed.exportDate || 'نسخة احتياطية',
          transactionsCount: parsed.transactions?.length || 0,
          contactsCount: parsed.contacts?.length || 0,
          fishTypesCount: parsed.fishTypes?.length || 0,
          cashEntriesCount: parsed.cashEntries?.length || 0,
          hasSettings: !!parsed.settings,
        });
        setErrorNotice(null);
      } catch (err: any) {
        console.error('File read error:', err);
        setErrorNotice('تعذر قراءة الملف. تأكد من أنه ملف JSON سليم تم تصديره من هذا النظام.');
        setPendingFilePreview(null);
      }
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!pendingFilePreview) return;
    try {
      const res: ImportResult = importData(pendingFilePreview.fileContent, {
        overwriteSettings: overwriteSettingsChoice,
      });
      if (res.success) {
        setSuccessNotice(res.message);
        setPendingFilePreview(null);
        if (res.mergedPayload) {
          await smartMergeLocalDb(res.mergedPayload).catch((e) =>
            console.warn('Local DB smart merge warning:', e)
          );
        }
        onDataReload();
        setTimeout(() => setSuccessNotice(null), 6000);
      } else {
        setErrorNotice(res.message);
      }
    } catch (err) {
      console.error(err);
      setErrorNotice('حدث خطأ غير متوقع أثناء استعادة البيانات');
    }
  };

  const handleOpenClearModal = () => {
    setWipePinInput('');
    setWipePinError(null);
    setShowWipePin(false);
    setShowClearConfirm(true);
  };

  const handleConfirmClearAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const correctPin = (settings.systemPin || '1234').trim();
    if (wipePinInput.trim() !== correctPin) {
      setWipePinError('رمز المرور غير صحيح! يرجى إدخال رمز المرور الرقمي (PIN) للمتابعة.');
      return;
    }

    try {
      setIsWiping(true);
      setWipePinError(null);
      if (onClearAllData) {
        await onClearAllData();
      } else {
        clearAllMockData();
      }
      onDataReload();
      setShowClearConfirm(false);
      setWipePinInput('');
      setSuccessNotice('تم مسح وتصفير كافة البيانات بنجاح، يمكنك الآن البدء من الصفر.');
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error(err);
      setWipePinError('تعذر إتمام مسح البيانات');
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Notifications */}
      {successNotice && (
        <div className="p-4 bg-emerald-500 text-white rounded-none flex items-center gap-3 shadow-xs shadow-emerald-600/20 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
          <span className="font-black text-sm">{successNotice}</span>
        </div>
      )}
      {errorNotice && (
        <div className="p-4 bg-rose-500 text-white rounded-none flex items-center gap-3 shadow-xs shadow-rose-600/20 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-100 shrink-0" />
          <span className="font-black text-sm">{errorNotice}</span>
        </div>
      )}

      {/* KPI Cards: Current System Data Volume */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-none bg-white border border-slate-300/90 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-none border border-blue-300">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">{formatNumber(transactions.length)}</div>
            <div className="text-xs text-slate-500 font-bold">فواتير وصفقات مسجلة</div>
          </div>
        </div>

        <div className="p-4 rounded-none bg-white border border-slate-300/90 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-none border border-emerald-200">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">{formatNumber(contacts.length)}</div>
            <div className="text-xs text-slate-500 font-bold">صيادين ومشترين مسجلين</div>
          </div>
        </div>

        <div className="p-4 rounded-none bg-white border border-slate-300/90 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-none border border-teal-200">
            <Fish className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">{formatNumber(fishTypes.length)}</div>
            <div className="text-xs text-slate-500 font-bold">أصناف أسماك مسجلة</div>
          </div>
        </div>

        <div className="p-4 rounded-none bg-white border border-slate-300/90 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-none border border-purple-200">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm font-black text-slate-900">قاعدة البيانات (PostgreSQL)</div>
            <div
              className={`text-xs font-bold flex items-center gap-1 mt-0.5 ${
                cloudStatus === 'connected' ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  cloudStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span>{cloudStatus === 'connected' ? 'متصلة ونشطة' : 'غير متصلة (وضع محلي)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Backup & Export Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Cloud & Email Backup */}
        <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-xs">
              <MailCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">النسخ الاحتياطي عبر البريد الإلكتروني (SMTP)</h3>
              <p className="text-xs text-slate-400">إرسال ملف النسخة الاحتياطية المشفر إلى بريدك الإلكتروني</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            يتم تجميع كافة فواتير البيع وحركات الصندوق والأسماء في ملف JSON مضغوط ومؤرشف، ثم يُرسل إلى بريدك الإلكتروني ليكون لديك نسخة دائمة في السحابة.
          </p>

          <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-none space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">البريد الإلكتروني المستلم:</span>
              <span className="font-mono font-black text-indigo-700" dir="ltr">
                {user?.email || settings.smtpUser || 'لم يتم تسجيل بريد'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">النسخ اليومي التلقائي:</span>
              <span className={`font-bold ${settings.emailBackupEnabled !== false ? 'text-emerald-700' : 'text-slate-400'}`}>
                {settings.emailBackupEnabled !== false ? 'مفعل (كل 24 ساعة)' : 'معطل'}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isEmailSending}
            onClick={handleSendEmailBackup}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-none text-xs font-black flex items-center justify-center gap-2 shadow-xs shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {isEmailSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري إرسال النسخة الاحتياطية إلى البريد...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>إرسال نسخة احتياطية فورية الآن</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Local JSON Export */}
        <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-300 shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">تصدير وحفظ ملف احتياطي محلي (JSON)</h3>
              <p className="text-xs text-slate-400">حفظ نسخة شاملة لكافة بيانات الحراج على القرص الصلب أو فلاش USB</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            يحتوي ملف JSON على نسخة طبق الأصل من كل بياناتك: الفواتير، الصيادين، المشترين، أصناف الأسماك، الإعدادات، وحركات الصندوق. يمكنك استرجاعه في أي وقت أو نقله لجهاز آخر.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExportJson}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-black flex items-center justify-center gap-2 shadow-xs shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل ملف النسخة الاحتياطية (haraj_backup.json)</span>
            </button>
          </div>
        </div>

        {/* Card 3: Excel XLSX Export */}
        <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">تصدير سجل المبيعات والفواتير إلى Excel (.xlsx)</h3>
              <p className="text-xs text-slate-400">جداول بيانات منظمة جاهزة للطباعة والتحليل المالي</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            تصدير كشف كامل بجميع الصفقات والفواتير مع تفاصيل الصيادين، المشترين، الكميات، الأسعار، العمولات، والأرباح في جدول Excel مهيأ وجاهز لبرامج المحاسبة.
          </p>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none text-xs font-black flex items-center justify-center gap-2 shadow-xs shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير إلى جدول Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Card 4: Import & Restore Backup */}
        <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">استعادة البيانات من ملف نسخة سابقة</h3>
              <p className="text-xs text-slate-400">استرجاع الفواتير والأسماء من ملف JSON محفوظ مسبقاً</p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            اختر ملف نسخة احتياطية من جهازك لاسترجاع كافة البيانات. سيتم عرض معاينة لمحتويات الملف قبل تأكيد الاسترجاع لحماية بياناتك.
          </p>

          <div className="pt-2">
            <label className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-none text-xs font-black flex items-center justify-center gap-2 shadow-xs shadow-amber-600/20 transition-all cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>اختيار ملف النسخة الاحتياطية (JSON) واسترجاعه</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelected}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Card 5: Google Drive Cloud Backup Folder */}
        <div className="lg:col-span-2 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-amber-50/60 border-2 border-blue-300/80 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-300 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-none bg-white text-blue-600 flex items-center justify-center border border-blue-300 shadow-xs">
                <Cloud className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">مجلد النسخ الاحتياطية السحابي (Google Drive)</h3>
                <p className="text-xs text-slate-500 font-bold">تم ربط مجلد النسخ السحابي المخصص على Google Drive بنجاح</p>
              </div>
            </div>

            <span className="px-3 py-1 rounded-none bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black flex items-center gap-1.5 self-start sm:self-center shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              مجلد متصل وجاهز للمزامنة
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white/80 rounded-none border border-slate-300 space-y-2 text-xs text-slate-700 leading-relaxed font-medium">
              <span className="font-black text-slate-900 block flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>المزامنة التلقائية مع Google Drive</span>
              </span>
              <p>
                تم ضبط النظام ليقوم بتنزيل وحفظ النسخ الاحتياطية تلقائياً في هذا المجلد على جهازك، ويقوم برنامج <strong className="text-indigo-800">Google Drive for Desktop</strong> برفعها ومزامنتها فوراً مع السحابة وهاتفك المحمول.
              </p>
              <div className="pt-2 border-t border-slate-300 flex items-center justify-between text-[11px] text-slate-600">
                <span>مسار المجلد:</span>
                <span className="font-mono font-bold text-indigo-700" dir="ltr">
                  {settings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER}
                </span>
              </div>
            </div>

            <div className="p-4 bg-white/80 rounded-none border border-slate-300 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">المجلد المخصص للنسخ الاحتياطية:</span>
                <span className="text-xs font-mono font-black text-blue-900 break-all bg-blue-50/80 p-2 rounded-none block border border-slate-300" dir="ltr">
                  {settings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isFolderBackupSaving}
                  onClick={handleSaveToGoogleDriveFolder}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-none text-xs font-black flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                  title="حفظ وتنزيل نسخة احتياطية فوراً في مجلد معروف على قرص Google Drive"
                >
                  {isFolderBackupSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  <span>حفظ نسخة بالمجلد الآن</span>
                </button>

                <button
                  type="button"
                  onClick={() => openLocalFolder(settings.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER)}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-none text-xs font-black flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
                  title="فتح مجلد النسخ الاحتياطية مباشرة في مستكشف ملفات Windows"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح المجلد في الكمبيوتر</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Import File Confirmation Modal: Smart Merge */}
      {pendingFilePreview && (
        <div className="p-6 bg-gradient-to-br from-blue-50 to-amber-50/50 border-2 border-blue-300 rounded-none space-y-4 shadow-xl animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-300/60 pb-3">
            <div className="flex items-center gap-2.5 text-blue-950 font-black text-base">
              <div className="w-9 h-9 rounded-none bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4>تأكيد الاستعادة بالدمج الذكي (Smart Merge)</h4>
                <p className="text-[11px] text-blue-800 font-medium">إكمال النواقص ودمج السجلات دون مسح الفواتير الحالية وبدون أي تكرار</p>
              </div>
            </div>
            {pendingFilePreview.exportDate && (
              <span className="text-xs text-blue-900 font-mono font-bold bg-white/90 border border-blue-300 px-3 py-1 rounded-none shadow-2xs self-start sm:self-center">
                تاريخ النسخة: {pendingFilePreview.exportDate}
              </span>
            )}
          </div>

          <div className="p-3.5 bg-white/90 border border-blue-300 rounded-none text-xs text-slate-700 leading-relaxed font-medium">
            <span className="font-black text-blue-950">🛡️ آلية الأمان المحاسبي للدمج: </span>
            لن يتم حذف أي فاتورة أو حركة مالية مسجلة حالياً على هذا الجهاز. سيقوم النظام بمطابقة المعرّفات (IDs) وإدخال الشروات والحركات الجديدة فقط، وتخطي أي فاتورة سابقة فوراً لمنع تكرار الحسابات أو مضاعفة الديون، وستستقر جميع السجلات في مكانها الزمني الصحيح تلقائياً.
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 bg-white rounded-none border border-slate-300 shadow-2xs">
              <div className="text-xl font-black text-slate-900 font-mono">{formatNumber(pendingFilePreview.transactionsCount || 0)}</div>
              <div className="text-[11px] text-slate-500 font-bold mt-0.5">فواتير وشروات</div>
            </div>
            <div className="p-3 bg-white rounded-none border border-slate-300 shadow-2xs">
              <div className="text-xl font-black text-slate-900 font-mono">{formatNumber(pendingFilePreview.contactsCount || 0)}</div>
              <div className="text-[11px] text-slate-500 font-bold mt-0.5">صيادين ومشترين</div>
            </div>
            <div className="p-3 bg-white rounded-none border border-slate-300 shadow-2xs">
              <div className="text-xl font-black text-slate-900 font-mono">{formatNumber(pendingFilePreview.fishTypesCount || 0)}</div>
              <div className="text-[11px] text-slate-500 font-bold mt-0.5">أصناف أسماك</div>
            </div>
            <div className="p-3 bg-white rounded-none border border-slate-300 shadow-2xs">
              <div className="text-xl font-black text-slate-900 font-mono">{formatNumber(pendingFilePreview.cashEntriesCount || 0)}</div>
              <div className="text-[11px] text-slate-500 font-bold mt-0.5">حركات نقدية/صندوق</div>
            </div>
          </div>

          {pendingFilePreview.hasSettings && (
            <div className="p-3 bg-white/80 border border-slate-300 rounded-none flex items-center gap-2.5">
              <input
                type="checkbox"
                id="overwriteSettingsCb"
                checked={overwriteSettingsChoice}
                onChange={(e) => setOverwriteSettingsChoice(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="overwriteSettingsCb" className="text-xs text-slate-700 font-bold cursor-pointer select-none">
                تحديث إعدادات السوق بالبيانات الموجودة في الملف (اتركه غير محدد للإبقاء على إعدادات هذا الجهاز الحالية)
              </label>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPendingFilePreview(null)}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-none text-xs font-bold cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-none text-xs font-black shadow-xs shadow-blue-700/20 cursor-pointer transition-all flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>تأكيد الدمج الذكي للبيانات الآن</span>
            </button>
          </div>
        </div>
      )}

      {/* Dangerous Zone: Clear & Reset */}
      <div className="bg-red-50/70 border border-red-200 rounded-none p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-3 border-b border-red-200/60 pb-3">
          <div className="w-10 h-10 rounded-none bg-red-100 text-red-700 flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-red-950">تصفير ومسح كافة البيانات (البدء بسجل فارغ)</h3>
            <p className="text-xs text-red-700/80">حذف كافة الفواتير الوهمية وجهات الاتصال وحركات الصندوق للبدء بإدخال بياناتك الحقيقية</p>
          </div>
        </div>

        {!showClearConfirm ? (
          <button
            type="button"
            onClick={handleOpenClearModal}
            className="px-5 py-2.5 rounded-none bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح وتصفير كافة البيانات الآن</span>
          </button>
        ) : (
          <form onSubmit={handleConfirmClearAll} className="p-4 bg-white border border-red-300 rounded-none space-y-4 animate-in fade-in">
            <div className="space-y-1">
              <p className="text-xs font-black text-red-900 leading-relaxed">
                ⚠️ هل أنت متأكد تماماً من رغبتك في حذف وتصفير كافة البيانات؟
              </p>
              <p className="text-[11px] text-red-700 font-medium">
                ستصبح الفواتير والأسماء وحركات الصندوق فارغة تماماً ولا يمكن التراجع عن هذا الإجراء نهائياً.
              </p>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">
                أدخل رمز المرور الرقمي (PIN) للنظام لتأكيد الحذف:
              </label>
              <div className="relative max-w-xs">
                <input
                  type={showWipePin ? 'text' : 'password'}
                  inputMode="numeric"
                  autoFocus
                  value={wipePinInput}
                  onChange={(e) => {
                    setWipePinInput(e.target.value);
                    if (wipePinError) setWipePinError(null);
                  }}
                  placeholder="رمز المرور الرقمي"
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 pr-10 text-center font-mono font-black text-base tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  type="button"
                  onClick={() => setShowWipePin(!showWipePin)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showWipePin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {wipePinError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-none text-xs font-black text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{wipePinError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isWiping || !wipePinInput.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-none text-xs font-black cursor-pointer transition-colors flex items-center gap-1.5"
              >
                {isWiping ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>جاري المسح...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تأكيد الحذف ومسح البيانات</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={isWiping}
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-none text-xs font-bold cursor-pointer transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
