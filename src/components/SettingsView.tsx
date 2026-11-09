import React, { useState, useEffect } from 'react';
import { MarketSettings, Transaction, Contact, FishType, CashEntry, CashDayCloseRecord, LotTransferRecord } from '../types';
import {
  Settings,
  Download,
  Upload,
  Check,
  Save,
  Database,
  KeyRound,
  Trash2,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Server,
  MailCheck,
  Percent,
  Building2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Cloud,
  ExternalLink,
  Type,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Clock,
} from 'lucide-react';
import { exportAllData, importData, resetAllDataToDefault } from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { sendBackupEmailNow, testSmtpSettings } from '../services/emailBackupClient';
import { saveBackupToFolder, openLocalFolder, DEFAULT_GOOGLE_DRIVE_FOLDER } from '../services/folderBackupClient';
import { ARABIC_FONTS, FONT_SIZE_OPTIONS, applyTypography } from '../utils/typography';

interface SettingsViewProps {
  settings: MarketSettings;
  onSaveSettings: (settings: MarketSettings) => void;
  onDataReload: () => void;
  onClearAllData?: () => Promise<void> | void;
  cloudStatus?: 'connected' | 'syncing' | 'offline';
  onOpenBackup?: () => void;
  transactions?: Transaction[];
  contacts?: Contact[];
  fishTypes?: FishType[];
  cashEntries?: CashEntry[];
  cashClosings?: CashDayCloseRecord[];
  lotTransfers?: LotTransferRecord[];
}

export type SettingsTab = 'appearance' | 'general' | 'taxes' | 'backup' | 'security' | 'account';

export const SETTINGS_TABS: { id: SettingsTab; label: string; icon: any; desc: string }[] = [
  { id: 'appearance', label: 'المظهر والخطوط', icon: Type, desc: 'تكبير الخط والخطوط العربية' },
  { id: 'general', label: 'بيانات الحراج', icon: Building2, desc: 'الاسم والترويسة والعملة' },
  { id: 'taxes', label: 'العمولات والضرائب', icon: Percent, desc: 'نسب الجمعية والحراج' },
  { id: 'backup', label: 'النسخ الاحتياطي', icon: MailCheck, desc: 'البريد وGoogle Drive' },
  { id: 'security', label: 'أمان النظام (PIN)', icon: KeyRound, desc: 'رمز المرور وتصفير السجلات' },
  { id: 'account', label: 'المزامنة والحساب', icon: User, desc: 'Firebase والربط السحابي' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onDataReload,
  onClearAllData,
  cloudStatus = 'connected',
  onOpenBackup,
  transactions,
  contacts,
  fishTypes,
  cashEntries,
  cashClosings,
  lotTransfers,
}) => {
  const [formData, setFormData] = useState<MarketSettings>({ ...settings });
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [msg, setMsg] = useState<string | null>(null);
  const [isWiping, setIsWiping] = useState(false);

  // ── نافذة تأكيد تصفير البيانات برمز المرور (PIN Protection) ──
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);
  const [wipePinInput, setWipePinInput] = useState('');
  const [wipePinError, setWipePinError] = useState<string | null>(null);
  const [showWipePin, setShowWipePin] = useState(false);
  const [showSystemPin, setShowSystemPin] = useState(false);

  // ── حساب المستخدم والمصادقة (Firebase Auth) ──
  const { user, signIn, signInWithGoogle, register, signOut: firebaseSignOut } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailUpdateLoading, setEmailUpdateLoading] = useState(false);
  const [emailUpdateMsg, setEmailUpdateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // تسجيل الدخول / إنشاء حساب جديد من داخل الإعدادات
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerName, setRegisterName] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false);
  const [authMsg, setAuthMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSwitchAccountForm, setShowSwitchAccountForm] = useState(false);

  // ── خدمة النسخ الاحتياطي عبر البريد (SMTP) ──
  const [isSendingEmailBackup, setIsSendingEmailBackup] = useState(false);
  const [emailBackupResult, setEmailBackupResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSmtpConfig, setShowSmtpConfig] = useState(() => Boolean(settings?.smtpPass || settings?.smtpUser));
  const [showSmtpPassInput, setShowSmtpPassInput] = useState(false);
  const [isTestingFolderBackup, setIsTestingFolderBackup] = useState(false);
  const [folderBackupResult, setFolderBackupResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const accountName = user?.displayName?.trim() || 'مستخدم النظام';
  const accountInitials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const [buyerTaxInput, setBuyerTaxInput] = useState<string>(() =>
    String(Math.round(((settings?.buyerTaxRate ?? 0.02) * 100) * 10) / 10)
  );
  const [sellerTaxInput, setSellerTaxInput] = useState<string>(() =>
    String(Math.round(((settings?.sellerTaxRate ?? 0.03) * 100) * 10) / 10)
  );

  // Sync form data whenever settings change
  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        contactPhone: settings.contactPhone || '782191112',
        smtpHost: settings.smtpHost || 'smtp.gmail.com',
        smtpPort: settings.smtpPort || 465,
        smtpUser: settings.smtpUser || user?.email || '',
        smtpPass: settings.smtpPass || '',
        smtpSecure: settings.smtpSecure !== false,
        emailBackupEnabled: settings.emailBackupEnabled !== false,
        emailBackupOnScheduleEnabled: settings.emailBackupOnScheduleEnabled !== false,
        emailBackupScheduledTime: settings.emailBackupScheduledTime || '23:00',
        emailBackupOnDayCloseEnabled: settings.emailBackupOnDayCloseEnabled !== false,
      });
      if (settings.smtpPass || settings.smtpUser) {
        setShowSmtpConfig(true);
      }
      setBuyerTaxInput(String(Math.round(((settings.buyerTaxRate ?? 0.02) * 100) * 10) / 10));
      setSellerTaxInput(String(Math.round(((settings.sellerTaxRate ?? 0.03) * 100) * 10) / 10));
    }
  }, [settings, user?.email]);

  // تحديث البريد الإلكتروني للحساب الحالي
  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) {
      setEmailUpdateMsg({ type: 'error', text: 'يرجى إدخال البريد الإلكتروني الجديد' });
      return;
    }
    setEmailUpdateLoading(true);
    setEmailUpdateMsg(null);
    try {
      await authService.updateEmail(newEmail.trim(), currentPasswordForEmail);
      setEmailUpdateMsg({
        type: 'success',
        text: 'تم إرسال رابط تأكيد التغيير إلى بريدك الإلكتروني الجديد. يرجى مراجعة صندوق الوارد وتأكيد الرابط لتفعيل التغيير.',
      });
      setNewEmail('');
      setCurrentPasswordForEmail('');
    } catch (err: any) {
      setEmailUpdateMsg({
        type: 'error',
        text: err.message || 'فشل تحديث البريد الإلكتروني',
      });
    } finally {
      setEmailUpdateLoading(false);
    }
  };

  // تسجيل الدخول أو إنشاء حساب عبر البريد وكلمة المرور من داخل الإعدادات
  const handleSettingsEmailAuth = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setAuthMsg({ type: 'error', text: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
      return;
    }
    setAuthLoading(true);
    setAuthMsg(null);
    try {
      if (authTab === 'login') {
        await signIn(loginEmail.trim(), loginPassword);
        setAuthMsg({ type: 'success', text: 'تم تسجيل الدخول وربط الحساب بنجاح!' });
        setShowSwitchAccountForm(false);
      } else {
        await register(loginEmail.trim(), loginPassword, registerName.trim() || undefined);
        setAuthMsg({ type: 'success', text: 'تم إنشاء الحساب بنجاح وربطه بالنظام!' });
        setShowSwitchAccountForm(false);
      }
      setLoginEmail('');
      setLoginPassword('');
      setRegisterName('');
    } catch (err: any) {
      setAuthMsg({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء المصادقة',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  // تسجيل الدخول السريع عبر Google من داخل الإعدادات
  const handleSettingsGoogleSignIn = async () => {
    setIsGoogleAuthLoading(true);
    setAuthMsg(null);
    try {
      await signInWithGoogle();
      setAuthMsg({ type: 'success', text: 'تم تسجيل الدخول بحساب Google بنجاح!' });
      setShowSwitchAccountForm(false);
    } catch (err: any) {
      setAuthMsg({
        type: 'error',
        text: err.message || 'فشل تسجيل الدخول عبر Google',
      });
    } finally {
      setIsGoogleAuthLoading(false);
    }
  };

  // تسجيل الخروج من حساب Firebase
  const handleFirebaseSignOut = async () => {
    try {
      await firebaseSignOut();
      setAuthMsg({ type: 'success', text: 'تم تسجيل الخروج من حساب Firebase.' });
      setShowSwitchAccountForm(false);
    } catch (err: any) {
      setAuthMsg({ type: 'error', text: err.message || 'فشل تسجيل الخروج' });
    }
  };

  // إرسال نسخة احتياطية فورية إلى البريد
  const handleManualEmailBackup = async () => {
    const targetEmail = user?.email || formData.smtpUser;
    if (!targetEmail) {
      setEmailBackupResult({
        type: 'error',
        text: 'يرجى تسجيل الدخول بحسابك أولاً أو إدخال بريد إلكتروني لإرسال النسخة إليه.',
      });
      return;
    }

    if (!formData.smtpUser?.trim() || !formData.smtpPass?.trim()) {
      setShowSmtpConfig(true);
      setEmailBackupResult({
        type: 'error',
        text: 'لم يتم ضبط إعدادات بريد الإرسال (SMTP). تم فتح قسم الإعدادات أدناه؛ يرجى إدخال البريد وكلمة مرور التطبيقات (App Password) والضغط على حفظ.',
      });
      return;
    }

    setIsSendingEmailBackup(true);
    setEmailBackupResult(null);

    try {
      const backupJson = exportAllData(transactions, contacts, fishTypes, formData, cashEntries, cashClosings, lotTransfers);
      const res = await sendBackupEmailNow(
        targetEmail,
        backupJson,
        {
          host: formData.smtpHost,
          port: formData.smtpPort ? Number(formData.smtpPort) : 465,
          user: formData.smtpUser,
          pass: formData.smtpPass,
          secure: formData.smtpSecure,
        },
        {
          subject: `نسخة احتياطية يدوية فورية - سوق عين بامعبد`,
          triggerReason: `إرسال يدوي فوري من شاشة الإعدادات`,
        }
      );
      setEmailBackupResult({
        type: 'success',
        text: res.message || 'تم إرسال النسخة الاحتياطية بنجاح إلى بريدك الإلكتروني!',
      });
      const updated = {
        ...formData,
        lastEmailBackupAt: Date.now(),
      };
      setFormData(updated);
      onSaveSettings(updated);
    } catch (err: any) {
      setEmailBackupResult({
        type: 'error',
        text: err.message || 'فشل إرسال النسخة الاحتياطية إلى البريد الإلكتروني.',
      });
    } finally {
      setIsSendingEmailBackup(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!formData.smtpUser || !formData.smtpPass) {
      setSmtpTestResult({
        type: 'error',
        text: 'يرجى إدخال البريد الإلكتروني وكلمة مرور التطبيق (App Password) أولاً لاختبار الاتصال.',
      });
      return;
    }

    setIsTestingSmtp(true);
    setSmtpTestResult(null);

    try {
      const res = await testSmtpSettings({
        host: formData.smtpHost || 'smtp.gmail.com',
        port: formData.smtpPort ? Number(formData.smtpPort) : 465,
        user: formData.smtpUser,
        pass: formData.smtpPass,
        secure: formData.smtpSecure,
      });
      setSmtpTestResult({
        type: 'success',
        text: res.message || 'تم الاتصال بخادم البريد بنجاح! الإعدادات سليمة وتم حفظ كلمة المرور تلقائياً.',
      });
      // حفظ فوري لكلمة المرور في التخزين وقاعدة البيانات
      onSaveSettings({
        ...formData,
      });
    } catch (err: any) {
      setSmtpTestResult({
        type: 'error',
        text: err.message || 'فشل الاتصال بخادم البريد.',
      });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const bTax = parseFloat(buyerTaxInput);
    const sTax = parseFloat(sellerTaxInput);
    const finalSettings: MarketSettings = {
      ...formData,
      buyerTaxRate: !isNaN(bTax) && bTax >= 0 ? Math.round(bTax * 10) / 1000 : (formData.buyerTaxRate ?? 0.02),
      sellerTaxRate: !isNaN(sTax) && sTax >= 0 ? Math.round(sTax * 10) / 1000 : (formData.sellerTaxRate ?? 0.03),
    };
    onSaveSettings(finalSettings);
    applyTypography(finalSettings.fontFamily, finalSettings.fontSizeScale);
    setMsg('تم حفظ كافة إعدادات النظام بنجاح 100%');
    setTimeout(() => {
      setMsg(null);
    }, 3000);
  };

  const handleExportBackup = () => {
    const dataStr = exportAllData();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haraj_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const res = importData(content);
      if (res.success) {
        setMsg(res.message);
        onDataReload();
        setTimeout(() => setMsg(null), 2500);
      } else {
        alert(res.message);
      }
    };
    reader.readAsText(file);
  };

  const handleOpenWipeModal = () => {
    setWipePinInput('');
    setWipePinError(null);
    setShowWipePin(false);
    setIsWipeModalOpen(true);
  };

  const handleConfirmWipeWithPin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const correctPin = (formData.systemPin || '1234').trim();
    if (wipePinInput.trim() !== correctPin) {
      setWipePinError('رمز المرور غير صحيح! يرجى إدخال رمز المرور الرقمي (PIN) الخاص بالنظام للمتابعة.');
      return;
    }

    try {
      setIsWiping(true);
      setWipePinError(null);
      if (onClearAllData) {
        await onClearAllData();
      } else {
        resetAllDataToDefault();
      }
      onDataReload();
      setIsWipeModalOpen(false);
      setMsg('تم مسح وتصفير كافة بيانات النظام بنجاح 100%');
      setTimeout(() => {
        setMsg(null);
        setIsWiping(false);
      }, 1500);
    } catch (err) {
      console.error('Error clearing data:', err);
      setIsWiping(false);
      setWipePinError('حدث خطأ أثناء مسح البيانات، يرجى المحاولة مرة أخرى.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Notification */}
      {msg && (
        <div className="p-4 bg-emerald-500 text-white rounded-none flex items-center justify-between shadow-xs shadow-emerald-600/20 animate-in fade-in">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-emerald-100" />
            <span className="font-black text-sm">{msg}</span>
          </div>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Modern Tab Navigation Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-slate-100 p-2 rounded-none border border-slate-300 shadow-2xs">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center sm:flex-col sm:items-center text-right sm:text-center gap-2 p-2.5 rounded-none font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-300 ring-2 ring-blue-500/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <div className={`p-2 rounded-none shrink-0 ${isActive ? 'bg-blue-50 text-blue-700' : 'bg-slate-200/70 text-slate-500'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black truncate">{tab.label}</div>
                  <div className="text-[10px] text-slate-400 truncate hidden sm:block font-normal">{tab.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section 1: User Account & Firebase Cloud Auth */}
        {activeTab === 'account' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-none bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-300 shadow-xs">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  حساب المستخدم والمصادقة والمزامنة السحابية (Firebase)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ربط الحساب بالمزامنة السحابية التلقائية والنسخ الاحتياطي المشفر
                </p>
              </div>
            </div>
            {user && (
              <button
                type="button"
                onClick={handleFirebaseSignOut}
                className="px-3.5 py-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-none transition-colors cursor-pointer flex items-center gap-1.5 self-start sm:self-center"
                title="تسجيل الخروج من حساب Firebase"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل خروج من الحساب</span>
              </button>
            )}
          </div>

          {/* Auth Result Notifications */}
          {authMsg && (
            <div
              className={`p-3.5 rounded-none flex items-start gap-2.5 text-xs font-semibold ${
                authMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}
            >
              {authMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              )}
              <span>{authMsg.text}</span>
            </div>
          )}

          {user && !showSwitchAccountForm ? (
            /* Current Connected Account Profile Card */
            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-r from-blue-50/80 via-white to-blue-50/50 border border-blue-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-none bg-blue-900 text-white border-2 border-white shadow-xs shrink-0 flex items-center justify-center overflow-hidden">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={`صورة حساب ${accountName}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-base font-black">{accountInitials || <User className="w-6 h-6" />}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-xs" />
                      <p className="text-xs text-emerald-800 font-black">متصل سحابياً بحساب Firebase</p>
                    </div>
                    <p className="text-sm font-black text-slate-900 truncate mt-0.5" dir="ltr">{user.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">الاسم الكامل: {accountName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSwitchAccountForm(true);
                      setAuthMsg(null);
                    }}
                    className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-none transition-colors cursor-pointer shadow-2xs"
                  >
                    تبديل الحساب
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmailForm(!showEmailForm);
                      setEmailUpdateMsg(null);
                      setNewEmail('');
                      setCurrentPasswordForEmail('');
                    }}
                    className="px-3.5 py-2 text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-none transition-colors cursor-pointer shadow-2xs"
                  >
                    {showEmailForm ? 'إلغاء' : 'تغيير البريد'}
                  </button>
                </div>
              </div>

              {/* Email Update Form */}
              {showEmailForm && (
                <div className="p-4 bg-slate-50 border border-slate-300 rounded-none space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    أدخل البريد الإلكتروني الجديد. ستصلك رسالة تحقق وتأكيد على العنوان الجديد لتثبيت التغيير:
                  </p>
                  {emailUpdateMsg && (
                    <div
                      className={`p-3 rounded-none text-xs font-bold ${
                        emailUpdateMsg.type === 'success'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}
                    >
                      {emailUpdateMsg.text}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 text-xs font-bold mb-1">البريد الإلكتروني الجديد:</label>
                      <input
                        type="email"
                        dir="ltr"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="new-email@domain.com"
                        className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 text-xs font-bold mb-1">كلمة المرور الحالية للتأكيد:</label>
                      <div className="relative">
                        <input
                          type={showEmailPassword ? 'text' : 'password'}
                          dir="ltr"
                          value={currentPasswordForEmail}
                          onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                          placeholder="كلمة المرور الحالية"
                          className="w-full bg-white border border-slate-300 rounded-none p-2.5 pr-8 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEmailPassword(!showEmailPassword)}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showEmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={emailUpdateLoading}
                      onClick={handleUpdateEmail}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-none text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {emailUpdateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      <span>تأكيد وإرسال رابط التغيير</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Login & Register Options inside Settings */
            <div className="p-4 bg-slate-50 border border-slate-300 rounded-none space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {user ? 'تبديل الحساب أو الدخول بحساب آخر:' : 'تسجيل الدخول أو إنشاء حساب جديد للنسخ السحابي:'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    يمكنك الدخول مباشرة بحساب Google بنقرة واحدة أو استخدام البريد وكلمة المرور
                  </p>
                </div>
                {user && (
                  <button
                    type="button"
                    onClick={() => setShowSwitchAccountForm(false)}
                    className="text-xs text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
                  >
                    إلغاء والعودة للحساب الحالي
                  </button>
                )}
              </div>

              {/* Fast Google Login Button */}
              <button
                type="button"
                onClick={handleSettingsGoogleSignIn}
                disabled={isGoogleAuthLoading || authLoading}
                className="w-full max-w-md mx-auto py-2.5 px-4 bg-white hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 text-slate-800 border-2 border-slate-300 hover:border-slate-300 font-black text-xs rounded-none flex items-center justify-center gap-3 transition-all cursor-pointer shadow-xs"
              >
                {isGoogleAuthLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>جاري تسجيل الدخول عبر Google...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>تسجيل الدخول المباشر بنقرة واحدة عبر Google</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 max-w-md mx-auto">
                <div className="h-px bg-slate-200 flex-1" />
                <span className="text-[10px] text-slate-400 font-bold">أو باستخدام البريد وكلمة المرور</span>
                <div className="h-px bg-slate-200 flex-1" />
              </div>

              {/* Sub-tabs: Login / Register */}
              <div className="max-w-md mx-auto space-y-3">
                <div className="flex p-1 bg-white border border-slate-300 rounded-none">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('login');
                      setAuthMsg(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-black rounded-none transition-all cursor-pointer ${
                      authTab === 'login' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('register');
                      setAuthMsg(null);
                    }}
                    className={`flex-1 py-1.5 text-xs font-black rounded-none transition-all cursor-pointer ${
                      authTab === 'register' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    إنشاء حساب جديد
                  </button>
                </div>

                {authTab === 'register' && (
                  <div>
                    <label className="block text-slate-700 text-xs font-bold mb-1">اسم المستخدم الكامل:</label>
                    <input
                      type="text"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      placeholder="أحمد المحضار"
                      disabled={authLoading}
                      className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-700 text-xs font-bold mb-1">البريد الإلكتروني:</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="user@example.com"
                    dir="ltr"
                    disabled={authLoading}
                    className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 text-xs font-bold mb-1">كلمة المرور:</label>
                  <div className="relative">
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      dir="ltr"
                      disabled={authLoading}
                      className="w-full bg-white border border-slate-300 rounded-none p-2.5 pr-8 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword(!showAuthPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showAuthPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSettingsEmailAuth}
                  disabled={authLoading || isGoogleAuthLoading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 text-white font-black text-xs rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
                >
                  {authLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري المعالجة...</span>
                    </>
                  ) : authTab === 'login' ? (
                    <span>تسجيل الدخول إلى الحساب</span>
                  ) : (
                    <span>إنشاء الحساب الجديد والربط</span>
                  )}
                </button>
              </div>
            </div>
          )}
          </div>
        )}

        {/* Section 2: Market & System Identity */}
        {activeTab === 'general' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-200 shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">بيانات الحراج والجمعية والفواتير</h3>
              <p className="text-xs text-slate-400">تظهر هذه البيانات في ترويسة سندات القبض والطباعة الحرارية</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الحراج أو الجمعية</label>
              <input
                type="text"
                value={formData.marketName || ''}
                onChange={(e) => setFormData({ ...formData, marketName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-sm text-slate-900 font-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">العنوان الفرعي للترويسة</label>
              <input
                type="text"
                value={formData.subTitle || ''}
                onChange={(e) => setFormData({ ...formData, subTitle: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">موقع ومقر الحراج</label>
              <input
                type="text"
                value={formData.location || ''}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-xs text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم هاتف / جوال الحراج (المطبوع في الفاتورة والترويسة)</label>
              <input
                type="text"
                dir="ltr"
                value={formData.contactPhone ?? '782191112'}
                placeholder="782191112"
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-sm text-slate-900 font-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-right"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                <span>اسم الموظف / المحاسب (المطبوع في الفواتير وسندات القبض)</span>
                <span className="text-[11px] font-normal text-blue-600">يظهر تلقائياً في خانة المحرر / أمين الصندوق بالفواتير</span>
              </label>
              <input
                type="text"
                value={formData.employeeName || ''}
                placeholder="مثال: أمين الصندوق / سالم باحاج"
                onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-sm text-slate-900 font-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">العملة الأساسية للنظام</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.currency || 'ريال يمني'}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 text-xs text-slate-900 font-black focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, currency: 'ريال يمني' })}
                  className="shrink-0 px-3 py-3 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-300 rounded-none hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  ريال يمني
                </button>
              </div>
            </div>

            {/* إعدادات طريقة عرض رصيد صندوق النقدية والدرج */}
            <div className="md:col-span-2 pt-4 border-t border-slate-100">
              <label className="block text-xs font-black text-slate-800 mb-1">
                طريقة عرض بطاقة رصيد الصندوق الفعلي
              </label>
              <p className="text-[11px] text-slate-500 mb-3">
                تحديد القيمة التي تظهر في بطاقة "رصيد الصندوق الفعلي" في شاشة صندوق النقدية لتجنب ارتباك المستخدم:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cashDrawerDisplayMode: 'today_only' })}
                  className={`p-3.5 rounded-none border-2 text-right transition-all cursor-pointer ${
                    (formData.cashDrawerDisplayMode || 'today_only') === 'today_only'
                      ? 'bg-emerald-50/80 border-emerald-500 shadow-xs ring-1 ring-emerald-400/30'
                      : 'bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-emerald-950">
                      رصيد درج اليوم والعهدة (المعتمد والموصى به)
                    </span>
                    {(formData.cashDrawerDisplayMode || 'today_only') === 'today_only' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    يعرض المبلغ النقدي المتوفر حالياً بالدرج لليوم الحالي فقط (العهدة الصباحية + مبيعات اليوم - المصاريف)، لمنع ارتباك المستخدم بالأرقام التراكمية التاريخية.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cashDrawerDisplayMode: 'cumulative' })}
                  className={`p-3.5 rounded-none border-2 text-right transition-all cursor-pointer ${
                    formData.cashDrawerDisplayMode === 'cumulative'
                      ? 'bg-amber-50/80 border-amber-500 shadow-xs ring-1 ring-amber-400/30'
                      : 'bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-amber-950">
                      الرصيد التراكمي الشامل (كافة الحركات التاريخية)
                    </span>
                    {formData.cashDrawerDisplayMode === 'cumulative' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    يعرض إجمالي الرصيد التراكمي الشامل لكافة العمليات النقدية في تاريخ النظام كاملاً دون عزل لليوم الحالي.
                  </p>
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Section: Typography & Display Customization */}
        {activeTab === 'appearance' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shadow-xs">
                <Type className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">مظهر النظام، حجم الخط، والخطوط العربية</h3>
                <p className="text-xs text-slate-400">تخصيص نوع الخط العربي المفضل وتكبير أو تصغير حجم نصوص النظام في كافة الشاشات</p>
              </div>
            </div>

            {/* Quick Reset Button */}
            <button
              type="button"
              onClick={() => {
                const nextSettings = { ...formData, fontFamily: 'Cairo', fontSizeScale: 112 };
                setFormData(nextSettings);
                applyTypography('Cairo', 112);
              }}
              className="px-3 py-1.5 rounded-none text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer self-start sm:self-center"
            >
              استعادة الخط والحجم المعتمد (Cairo 112%)
            </button>
          </div>

          {/* 1. Font Size Scaling Controller */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <ZoomIn className="w-4 h-4 text-purple-600" />
                  <span>تكبير حجم خط النظام:</span>
                  <span className="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-none border border-purple-200 text-xs">
                    {formData.fontSizeScale || 112}%
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  يتم تكبير أو تصغير جميع نصوص الشاشات والجداول والفواتير والقوائم بتناسق متكامل وفوري
                </p>
              </div>

              {/* Fast +/- buttons */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto bg-slate-50 p-1 rounded-none border border-slate-300">
                <button
                  type="button"
                  onClick={() => {
                    const current = formData.fontSizeScale || 112;
                    const next = Math.max(88, current - 4);
                    setFormData({ ...formData, fontSizeScale: next });
                    applyTypography(formData.fontFamily, next);
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 rounded-none border border-slate-300 shadow-2xs cursor-pointer flex items-center gap-1"
                  title="تصغير الخط 4%"
                >
                  <ZoomOut className="w-3.5 h-3.5 text-slate-600" />
                  <span>A- تصغير</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const current = formData.fontSizeScale || 112;
                    const next = Math.min(135, current + 4);
                    setFormData({ ...formData, fontSizeScale: next });
                    applyTypography(formData.fontFamily, next);
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 rounded-none border border-slate-300 shadow-2xs cursor-pointer flex items-center gap-1"
                  title="تكبير الخط 4%"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-purple-700" />
                  <span>A+ تكبير</span>
                </button>
              </div>
            </div>

            {/* Scale Options Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {FONT_SIZE_OPTIONS.map((opt) => {
                const isSelected = (formData.fontSizeScale || 112) === opt.scale;
                return (
                  <button
                    key={opt.scale}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, fontSizeScale: opt.scale });
                      applyTypography(formData.fontFamily, opt.scale);
                    }}
                    className={`p-3 rounded-none border-2 text-right transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-purple-50/80 border-purple-500 shadow-xs ring-1 ring-purple-400/30'
                        : 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-black ${isSelected ? 'text-purple-900' : 'text-slate-800'}`}>
                        {opt.label}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-purple-600" />
                      )}
                    </div>
                    <p className={`text-[10px] leading-tight ${isSelected ? 'text-purple-700' : 'text-slate-400'}`}>
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Arabic Font Families Selection Grid with Live Previews */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>اختر نوع الخط العربي المفضل للنظام:</span>
              </label>
              <p className="text-[11px] text-slate-500 mt-0.5">
                انقر على أي خط لتفعيله وتجربته فوراً في كافة شاشات البرنامج
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {ARABIC_FONTS.map((font) => {
                const isSelected = (formData.fontFamily || 'Cairo') === font.id;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, fontFamily: font.id });
                      applyTypography(font.id, formData.fontSizeScale);
                    }}
                    style={{ fontFamily: font.id }}
                    className={`p-3.5 rounded-none border-2 text-right transition-all cursor-pointer relative group flex flex-col justify-between min-h-[110px] ${
                      isSelected
                        ? 'bg-purple-50/90 border-purple-600 shadow-xs ring-2 ring-purple-400/20'
                        : 'bg-white hover:bg-slate-50/90 border-slate-300 hover:border-purple-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className={`text-sm font-black truncate ${isSelected ? 'text-purple-950 font-black' : 'text-slate-800'}`}>
                          {font.nameArabic}
                        </span>
                        {isSelected ? (
                          <span className="shrink-0 p-1 bg-purple-600 text-white rounded-none">
                            <Check className="w-3 h-3" />
                          </span>
                        ) : font.recommended ? (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            موصى به
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-1 mb-2 font-sans">
                        {font.category}
                      </p>
                    </div>

                    <div className={`pt-2 border-t text-xs font-bold ${isSelected ? 'border-purple-200 text-purple-900' : 'border-slate-100 text-slate-700'}`}>
                      {font.sampleText}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Box */}
          <div
            style={{ fontFamily: formData.fontFamily || 'Cairo' }}
            className="p-4 bg-gradient-to-r from-purple-50/70 to-blue-50/70 border-2 border-purple-200 rounded-none space-y-2 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-purple-950 flex items-center gap-1.5 font-sans">
                <span>معاينة حية مباشرة بالخط والحجم المختارين:</span>
                <span className="font-mono text-[11px] bg-white px-2 py-0.5 rounded border border-purple-200 font-bold text-purple-800">
                  {formData.fontFamily || 'Cairo'} ({formData.fontSizeScale || 112}%)
                </span>
              </span>
              <span className="text-[10px] text-purple-800 font-bold font-sans">معاينة تفاعلية</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white p-3 rounded-none border border-purple-100 shadow-2xs">
                <span className="text-[11px] text-slate-400 block font-normal">نموذج صنف وسعر:</span>
                <span className="text-sm font-black text-slate-900 block mt-0.5">
                  ديرك كنعد طازج - 50 كجم
                </span>
                <span className="text-xs font-mono font-bold text-blue-700 block mt-0.5">
                  السعر: 185,000 ريال يمني
                </span>
              </div>

              <div className="bg-white p-3 rounded-none border border-purple-100 shadow-2xs">
                <span className="text-[11px] text-slate-400 block font-normal">نموذج حساب وعمولات:</span>
                <span className="text-sm font-black text-slate-900 block mt-0.5">
                  عمولة الجمعية 2% + عمولة الحراج 3%
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700 block mt-0.5">
                  الصافي للصياد: 179,450 ريال
                </span>
              </div>

              <div className="bg-white p-3 rounded-none border border-purple-100 shadow-2xs">
                <span className="text-[11px] text-slate-400 block font-normal">الأرقام والتواريخ:</span>
                <span className="text-sm font-black text-slate-900 block mt-0.5 font-mono">
                  1234567890 • 2026/10/02
                </span>
                <span className="text-xs font-bold text-purple-700 block mt-0.5">
                  سوق عين بامعبد المركزي للأسماك
                </span>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Section 3: Tax Rates & Commission */}
        {activeTab === 'taxes' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shadow-xs">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">نسب العمولات والضرائب المحتسبة</h3>
              <p className="text-xs text-slate-400">تحدد نسبة عمولة المشتري ونسبة خصم الصياد في كل فاتورة</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50/70 border-2 border-blue-300 rounded-none space-y-2">
              <label className="block text-blue-950 font-black text-xs">نسبة عمولة المشتري الإضافية (+)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={buyerTaxInput}
                  onChange={(e) => setBuyerTaxInput(e.target.value)}
                  className="w-24 bg-white border border-blue-300 rounded-none p-2.5 text-blue-950 font-mono font-black text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-blue-800 font-bold font-mono text-sm">% (افتراضي 2%)</span>
              </div>
              <p className="text-[11px] text-blue-800/80">تضاف على إجمالي المشتريات كعمولة للجمعية</p>
            </div>

            <div className="p-4 bg-slate-50 border-2 border-slate-300 rounded-none space-y-2">
              <label className="block text-slate-900 font-black text-xs">نسبة خصم الصياد/البائع (-)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={sellerTaxInput}
                  onChange={(e) => setSellerTaxInput(e.target.value)}
                  className="w-24 bg-white border border-slate-300 rounded-none p-2.5 text-slate-900 font-mono font-black text-base text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-600 font-bold font-mono text-sm">% (افتراضي 3%)</span>
              </div>
              <p className="text-[11px] text-slate-500">تخصم من صافي مستحقات الصياد كعمولة حراج</p>
            </div>
          </div>

          {/* خيار إظهار مفتاح التبديل (صياد / بائع) في واجهة الفاتورة */}
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="space-y-0.5">
              <span className="text-xs font-black text-slate-900 block">
                إظهار مفتاح التبديل (صياد / بائع) في واجهة تسجيل الفاتورة
              </span>
              <span className="text-[11px] text-slate-500 block">
                عند تفعيل هذا الخيار، سيظهر زران (صياد / بائع) بجانب اسم الصياد. عند إلغاء التفعيل (الافتراضي)، يتم إخفاء الخيار ليظهر حقل الصياد متناسقاً تماماً أمام خيارات الخصم مثل حقل المشتري.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={Boolean(formData.showSellerRoleToggle)}
                onChange={(e) => setFormData({ ...formData, showSellerRoleToggle: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* خيار فصل أرباح وعمولات الحراج من إجمالي كاش الدرج */}
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 block">
                  فصل أرباح وعمولات الحراج (5%) من إجمالي كاش الدرج
                </span>
                {formData.separateProfitsFromDrawerCash && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-none border border-emerald-300">
                    مفعّل (أرباح مفصولة)
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 block">
                عند التفعيل: يتم استبعاد وفصل أرباح وعمولات الحراج (5%) من إجمالي رصيد كاش الدرج ليعكس صافي السيولة المخصصة للتداول وحقوق الصيادين والعهد فقط. عند الإلغاء (الافتراضي): يتم إرجاع ودمج الأرباح ضمن كاش الدرج كاملاً.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={Boolean(formData.separateProfitsFromDrawerCash)}
                onChange={(e) => setFormData({ ...formData, separateProfitsFromDrawerCash: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* خيار إظهار العهدة وفائض أرباح الشروات المسترد في بطاقات النقدية واليومية */}
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 block">
                  إظهار العهدة وفائض أرباح الشروات المسترد في بطاقات النقدية واليومية
                </span>
                {formData.showSurplusInCashCards !== false && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-none border border-emerald-300">
                    مفعّل
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 block">
                عند التفعيل (الافتراضي): تظهر العهدة الافتتاحية ضمن رقم بطاقة إجمالي الوارد (المقبوضات)، ويظهر فائض أرباح الشروات المسترد في بطاقات النقدية واليومية. عند الإلغاء: يختفيان من العرض فقط (ليعرض الوارد الصافي بدون العهدة) دون تغيير الحسابات أو التأثير على رصيد الصندوق الفعلي.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={formData.showSurplusInCashCards !== false}
                onChange={(e) => setFormData({ ...formData, showSurplusInCashCards: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* خيار حصر مبيعات المشترين والمقاصة المالية في كشف المشتري وعدم إظهارهم في كشف الصيادين */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 block">
                  خدمة حصر مبيعات المشترين والمقاصة المالية في كشف المشتري
                </span>
                {Boolean(formData.enableBuyerFishSalesAndOffset) ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-none border border-emerald-300">
                    مفعّل (دمج البيعات مع الشروات)
                  </span>
                ) : (
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-none border border-blue-300">
                    مفصول ومستقل (الافتراضي: كشف صياد مستقل وكشف مشتري مستقل)
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 block">
                عند الإيقاف (الافتراضي): يُفصل الحسابان بالكامل، فتظهر مبيعات الأسماك في كشف حسابه كصياد/بائع، وتظهر الشروات في كشف حسابه كمشتري. عند التفعيل: تُدمج البيعات داخل كشف المشتري وتُقاص مع ديونه.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={Boolean(formData.enableBuyerFishSalesAndOffset)}
                onChange={(e) => setFormData({ ...formData, enableBuyerFishSalesAndOffset: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* خيار إظهار زر (شروة و بيعة) في كشف حساب المشتري */}
          <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-900 block">
                  إظهار زر (شروة و بيعة) في كشف حساب المشتري
                </span>
                {formData.showBuyerResaleButton !== false && (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-none border border-emerald-300">
                    مفعّل
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 block">
                عند تفعيل هذا الخيار، سيظهر زر (شروة و بيعة) في رأس كشف حساب المشتري لعرض سجل بيعات الشروات لمشترين آخرين والمقاصة المالية. عند إلغاء تفعيله يختفي الزر من الواجهة.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={formData.showBuyerResaleButton !== false}
                onChange={(e) => setFormData({ ...formData, showBuyerResaleButton: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>
          </div>
        )}

        {/* Section 4: Email Backup (SMTP) */}
        {activeTab === 'backup' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-200 shadow-xs">
                <MailCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">النسخ الاحتياطي التلقائي عبر البريد الإلكتروني (SMTP)</h3>
                <p className="text-xs text-slate-400">إرسال نسخة مشفرة ومؤرشفة يومياً إلى بريدك الإلكتروني</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-none border border-slate-300">
                <input
                  type="checkbox"
                  checked={formData.emailBackupEnabled !== false}
                  onChange={(e) => setFormData({ ...formData, emailBackupEnabled: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-800">تفعيل النسخ الاحتياطي التلقائي</span>
              </label>

              {formData.emailBackupEnabled !== false && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-none border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, backupFrequency: 'daily' })}
                    className={`px-2.5 py-1 text-[11px] font-black rounded-none transition-all cursor-pointer ${
                      (formData.backupFrequency || 'daily') === 'daily'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    كل 24 ساعة (يومي)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, backupFrequency: 'weekly' })}
                    className={`px-2.5 py-1 text-[11px] font-black rounded-none transition-all cursor-pointer ${
                      formData.backupFrequency === 'weekly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    كل أسبوع
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, backupFrequency: 'monthly' })}
                    className={`px-2.5 py-1 text-[11px] font-black rounded-none transition-all cursor-pointer ${
                      formData.backupFrequency === 'monthly'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                    }`}
                  >
                    كل شهر
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-indigo-50/50 border border-indigo-200 rounded-none space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-slate-800">
                  المستلم: <span className="font-mono text-indigo-700 font-black" dir="ltr">{user?.email || formData.smtpUser || 'البريد المسجل في النظام'}</span>
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  موضوع الرسالة: <span className="font-bold text-slate-700">[نسخة احتياطية - نظام الحراج]</span> (خيط محادثة واحد متجدد في Gmail)
                </p>
                {formData.lastEmailBackupAt && (
                  <p className="text-[11px] text-emerald-700 font-black mt-1">
                    آخر نسخة أُرسلت: {new Date(formData.lastEmailBackupAt).toLocaleString('ar-EG')}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSendingEmailBackup}
                  onClick={handleManualEmailBackup}
                  className="px-4 py-2.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-none shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSendingEmailBackup ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الإرسال...</span>
                    </>
                  ) : (
                    <>
                      <MailCheck className="w-4 h-4" />
                      <span>إرسال نسخة الآن إلى البريد</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Email backup result notice */}
            {emailBackupResult && (
              <div
                className={`p-3 rounded-none text-xs font-bold flex items-center gap-2 ${
                  emailBackupResult.type === 'success'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-rose-100 text-rose-900 border border-rose-300'
                }`}
              >
                {emailBackupResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                )}
                <span>{emailBackupResult.text}</span>
              </div>
            )}

            {/* ── خيارات وتوقيت النسخ التلقائي عبر البريد الإلكتروني ── */}
            <div className="p-3.5 bg-white border border-indigo-200 rounded-none space-y-3 shadow-xs">
              <div className="flex items-center gap-2 border-b border-indigo-100 pb-2">
                <MailCheck className="w-4 h-4 text-indigo-600" />
                <div>
                  <h4 className="text-xs font-black text-slate-800">خيارات وجدولة الإرسال التلقائي للبريد:</h4>
                  <p className="text-[10px] text-slate-500">يمكنك تفعيل أحد الخيارين أو كليهما بحسب رغبتك</p>
                </div>
              </div>

              {/* الخيار الأول: تحديد ساعة يومية ثابتة */}
              <div className={`p-3 rounded-none border transition-all ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-indigo-50/60 border-indigo-300' : 'bg-slate-50 border-slate-300'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(formData.emailBackupOnScheduleEnabled !== false);
                        const updated = { ...formData, emailBackupOnScheduleEnabled: nextVal };
                        setFormData(updated);
                        onSaveSettings(updated);
                      }}
                      className={`mt-0.5 w-5 h-5 rounded-none flex items-center justify-center transition-colors cursor-pointer ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-indigo-600 text-white shadow-xs' : 'border-2 border-slate-400 bg-white'}`}
                    >
                      {formData.emailBackupOnScheduleEnabled !== false && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-indigo-700" />
                        <span className="text-xs font-black text-slate-900">الخيار 1: إرسال تلقائي في ساعة يومية محددة</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        يقوم النظام بإرسال نسخة احتياطية مشفرة ومؤرشفة لبريدك يومياً فور حلول هذه الساعة المحددة.
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-none shrink-0 ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'}`}>
                    {formData.emailBackupOnScheduleEnabled !== false ? 'مفعل' : 'معطل'}
                  </span>
                </div>

                {formData.emailBackupOnScheduleEnabled !== false && (
                  <div className="mt-3 pt-2.5 border-t border-indigo-100 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-700 font-bold text-[11px]">حدد وقت الإرسال:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...formData, emailBackupScheduledTime: '23:00' };
                        setFormData(updated);
                        onSaveSettings(updated);
                      }}
                      className={`px-2.5 py-1 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '23:00' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                    >
                      11:00 مساءً (23:00)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...formData, emailBackupScheduledTime: '00:00' };
                        setFormData(updated);
                        onSaveSettings(updated);
                      }}
                      className={`px-2.5 py-1 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '00:00' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                    >
                      12:00 منتصف الليل (00:00)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...formData, emailBackupScheduledTime: '22:00' };
                        setFormData(updated);
                        onSaveSettings(updated);
                      }}
                      className={`px-2.5 py-1 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '22:00' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                    >
                      10:00 مساءً (22:00)
                    </button>
                    <div className="flex items-center gap-1.5 mr-auto">
                      <span className="text-[11px] text-slate-500 font-semibold">أو وقت مخصص:</span>
                      <input
                        type="time"
                        dir="ltr"
                        value={formData.emailBackupScheduledTime || '23:00'}
                        onChange={(e) => {
                          const updated = { ...formData, emailBackupScheduledTime: e.target.value };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className="bg-white border border-indigo-300 rounded-none px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* الخيار الثاني: إرسال فوري عند اعتماد إغلاق اليومية والجرد */}
              <div className={`p-3 rounded-none border transition-all ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-50/60 border-emerald-300' : 'bg-slate-50 border-slate-300'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !(formData.emailBackupOnDayCloseEnabled !== false);
                        const updated = { ...formData, emailBackupOnDayCloseEnabled: nextVal };
                        setFormData(updated);
                        onSaveSettings(updated);
                      }}
                      className={`mt-0.5 w-5 h-5 rounded-none flex items-center justify-center transition-colors cursor-pointer ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-600 text-white shadow-xs' : 'border-2 border-slate-400 bg-white'}`}
                    >
                      {formData.emailBackupOnDayCloseEnabled !== false && <Check className="w-3.5 h-3.5" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-black text-slate-900">الخيار 2: إرسال تلقائي فوري عند اعتماد إغلاق اليومية والجرد</span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        بمجرد أن ينهي المحاسب الجرد ويضغط على «اعتماد إغلاق اليومية»، يرسل النظام فوراً نسخة احتياطية كاملة ومؤرشفة لكافة العمليات والحسابات لبريدك الإلكتروني مع تقرير اليومية.
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-none shrink-0 ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-200 text-slate-600'}`}>
                    {formData.emailBackupOnDayCloseEnabled !== false ? 'مفعل' : 'معطل'}
                  </span>
                </div>
              </div>
            </div>

            {/* Collapsible Advanced SMTP Configuration */}
            <div className="pt-2 border-t border-indigo-200/80">
              <button
                type="button"
                onClick={() => setShowSmtpConfig(!showSmtpConfig)}
                className="text-xs font-bold text-indigo-800 hover:text-indigo-950 flex items-center gap-1 cursor-pointer"
              >
                {showSmtpConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span>إعدادات خادم البريد المخصص (SMTP Settings) وكلمة مرور التطبيقات</span>
              </button>

              {showSmtpConfig && (
                <div className="mt-3 p-4 bg-white border border-indigo-200 rounded-none space-y-3">
                  {/* Google App Password Guide */}
                  <div className="p-3 bg-blue-50/80 border border-blue-300 rounded-none text-xs space-y-1.5 text-blue-950">
                    <div className="font-bold flex items-center gap-1.5 text-blue-900">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span>كيفية الحصول على كلمة مرور التطبيقات (App Password) من Google:</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      تشترط Google كلمة مرور تطبيقات خاصة (16 حرفاً) لحماية حسابك بدلاً من كلمة المرور العادية:
                    </p>
                    <ol className="list-decimal list-inside text-[11px] text-slate-700 space-y-1 font-medium">
                      <li>تأكد من تفعيل "التحقق بخطوتين" في حساب Google.</li>
                      <li>
                        افتح صفحة كلمات مرور التطبيقات:{' '}
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 font-bold underline mr-1 hover:text-blue-900"
                        >
                          myaccount.google.com/apppasswords
                        </a>
                      </li>
                      <li>أدخل اسماً للتطبيق (مثل: <span className="font-bold">حراج الأسماك</span>) واضغط "إنشاء".</li>
                      <li>انسخ الكود (16 حرفاً) والصقه في خانة "كلمة مرور التطبيق" أدناه ثم يتم حفظه تلقائياً.</li>
                    </ol>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold text-xs mb-1">خادم البريد (SMTP Host)</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={formData.smtpHost || 'smtp.gmail.com'}
                        onChange={(e) => {
                          const updated = { ...formData, smtpHost: e.target.value };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-xs text-slate-900 font-mono focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold text-xs mb-1">المنفذ (Port)</label>
                      <input
                        type="number"
                        dir="ltr"
                        value={formData.smtpPort || 465}
                        onChange={(e) => {
                          const updated = { ...formData, smtpPort: Number(e.target.value) };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-xs text-slate-900 font-mono focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-bold text-xs mb-1">بريد الإرسال (User Email)</label>
                      <input
                        type="email"
                        dir="ltr"
                        value={formData.smtpUser || ''}
                        onChange={(e) => {
                          const updated = { ...formData, smtpUser: e.target.value };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        placeholder="your-email@gmail.com"
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-xs text-slate-900 font-mono focus:bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-700 font-bold text-xs">كلمة مرور التطبيق (App Password - 16 حرفاً)</label>
                      {formData.smtpPass && (
                        <span className="text-[11px] text-emerald-700 font-black flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>محفوظة في النظام وثابتة</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showSmtpPassInput ? 'text' : 'password'}
                        dir="ltr"
                        placeholder="xxxx xxxx xxxx xxxx"
                        value={formData.smtpPass || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = { ...formData, smtpPass: val };
                          setFormData(updated);
                          // حفظ فوري في التخزين وقاعدة البيانات لتبقى ثابتة دائماً
                          onSaveSettings(updated);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 pr-8 text-xs text-slate-900 font-mono focus:bg-white focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSmtpPassInput(!showSmtpPassInput)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showSmtpPassInput ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {smtpTestResult && (
                    <div
                      className={`p-3 rounded-none text-xs font-bold flex items-center gap-2 ${
                        smtpTestResult.type === 'success'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-rose-100 text-rose-900 border border-rose-300'
                      }`}
                    >
                      {smtpTestResult.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                      )}
                      <span>{smtpTestResult.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      disabled={isTestingSmtp}
                      onClick={handleTestSmtp}
                      className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-none border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isTestingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                      <span>{isTestingSmtp ? 'جاري الفحص...' : 'اختبار اتصال خادم البريد (Test SMTP)'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Google Drive Cloud Folder Integration */}
            <div className="pt-3 border-t border-indigo-200/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-amber-600" />
                  <label className="text-slate-800 font-bold text-xs">
                    مجلد النسخ الاحتياطية على Google Drive (أو مسار مجلد الكمبيوتر):
                  </label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={async () => {
                      const path = formData.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER;
                      await openLocalFolder(path);
                    }}
                    className="text-xs text-indigo-700 hover:text-indigo-900 font-black flex items-center gap-1 cursor-pointer bg-white px-2.5 py-1 rounded-none border border-indigo-200 shadow-2xs hover:bg-indigo-50 transition-colors"
                    title="فتح هذا المجلد مباشرة في مستكشف ملفات Windows"
                  >
                    <span>فتح المجلد على جهاز الكمبيوتر</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={isTestingFolderBackup}
                    onClick={async () => {
                      setIsTestingFolderBackup(true);
                      setFolderBackupResult(null);
                      try {
                        const target = formData.googleDriveFolderUrl || DEFAULT_GOOGLE_DRIVE_FOLDER;
                        const fullBackup = exportAllData();
                        const res = await saveBackupToFolder(target, fullBackup);
                        if (res.success) {
                          setFolderBackupResult({
                            type: 'success',
                            text: `✓ تم حفظ وتنزيل نسخة النظام الأصلية والفعلية بنجاح في: ${res.savedPath}`,
                          });
                        } else {
                          setFolderBackupResult({
                            type: 'error',
                            text: res.error || 'فشل حفظ النسخة في المجلد',
                          });
                        }
                      } finally {
                        setIsTestingFolderBackup(false);
                      }
                    }}
                    className="text-xs text-emerald-800 bg-emerald-100/80 hover:bg-emerald-200 font-black flex items-center gap-1 cursor-pointer px-2.5 py-1 rounded-none border border-emerald-300 shadow-2xs transition-colors disabled:opacity-50"
                    title="حفظ نسخة احتياطية فعلية كاملة لبيانات النظام الآن في المجلد المحدد"
                  >
                    {isTestingFolderBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>حفظ نسخة فعلية الآن بالمجلد</span>
                  </button>
                </div>
              </div>

              <input
                type="text"
                dir="ltr"
                value={formData.googleDriveFolderUrl || ''}
                onChange={(e) => setFormData({ ...formData, googleDriveFolderUrl: e.target.value })}
                placeholder="G:\ملفاتي\ابناء مديرية رضوم\معروف"
                className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span>مسار المجلد المحلي المخصص لرفع ومزامنة نسخ النظام الاحتياطية تلقائياً عبر Google Drive for Desktop</span>
                <span className="text-emerald-700 font-bold font-mono">المسار الافتراضي: G:\ملفاتي\ابناء مديرية رضوم\معروف</span>
              </div>

              {folderBackupResult && (
                <div
                  className={`p-2.5 rounded-none text-xs font-bold flex items-center gap-2 ${
                    folderBackupResult.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {folderBackupResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-mono text-[11px] break-all">{folderBackupResult.text}</span>
                </div>
              )}
            </div>
          </div>
          </div>
        )}

        {/* Section 5: Security PIN & Local DB */}
        {activeTab === 'security' && (
          <div className="bg-white border border-slate-300/90 rounded-none p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-10 h-10 rounded-none bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200 shadow-xs">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">أمان النظام وقاعدة البيانات</h3>
              <p className="text-xs text-slate-400">رمز المرور الرقمي وإدارة قاعدة البيانات المركزية</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex items-center justify-between gap-4">
              <div>
                <label className="block text-slate-900 font-black text-xs mb-1">رمز المرور الرقمي (PIN)</label>
                <p className="text-[11px] text-slate-500">يتكون من أرقام فقط ويستخدم لشاشة البداية وقفل الشاشة</p>
              </div>
              <div className="w-36 relative">
                <input
                  type={showSystemPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={formData.systemPin || ''}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    setFormData({ ...formData, systemPin: cleaned });
                  }}
                  placeholder="••••"
                  className="w-full bg-white border border-slate-300 rounded-none py-2.5 pr-3 pl-9 text-slate-900 font-mono font-black text-center tracking-widest text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSystemPin(!showSystemPin)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded-none hover:bg-slate-100 transition-colors"
                  title={showSystemPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {showSystemPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-300 rounded-none flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-xs" />
                  <label className="block text-slate-900 font-black text-xs">قاعدة البيانات (PostgreSQL)</label>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">قاعدة بيانات نشطة ومتصلة بالنظام</p>
              </div>
              {onOpenBackup && (
                <button
                  type="button"
                  onClick={onOpenBackup}
                  className="px-3.5 py-2 text-xs font-bold bg-white text-emerald-800 border border-emerald-300 rounded-none hover:bg-emerald-50 transition-colors cursor-pointer shadow-2xs shrink-0"
                >
                  فتح مركز الأرشيف
                </button>
              )}
            </div>
          </div>

          {/* Wipe & Reset Warning */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-rose-700">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold">تصفير ومسح كافة فواتير وحركات الصندوق والبيانات نهائياً:</span>
            </div>
            <button
              type="button"
              onClick={handleOpenWipeModal}
              disabled={isWiping}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-none text-xs font-black transition-colors cursor-pointer self-start sm:self-center"
            >
              {isWiping ? 'جاري المسح...' : 'مسح وتصفير كافة البيانات الآن'}
            </button>
          </div>
          </div>
        )}

        {/* Form Submission Action Bar */}
        <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md border border-slate-300 p-4 rounded-none shadow-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>سيتم حفظ التغييرات وتطبيقها فوراً على كل شاشات النظام وفواتير البيع</span>
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-none shadow-xs shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <Save className="w-5 h-5" />
            <span>حفظ كافة التغييرات</span>
          </button>
        </div>
      </form>

      {/* Wipe / Reset PIN Protection Confirmation Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white border-2 border-rose-300 rounded-none max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 border-b border-rose-100 pb-3">
              <div className="w-12 h-12 rounded-none bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-rose-950">تأكيد مسح وتصفير كافة البيانات</h3>
                <p className="text-xs text-rose-600 font-bold">هذا الإجراء نهائي ولا يمكن التراجع عنه!</p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-none text-xs text-rose-900 space-y-1.5 leading-relaxed">
              <p className="font-black">⚠️ سيتم حذف وتصفير السجلات التالية بالكامل:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-800">
                <li>جميع العمليات وفواتير البيع المحررة</li>
                <li>سجلات المشترين والصيادين وأرصدتهم والديون</li>
                <li>حركة الصندوق والعهدة وسجلات الجرد اليومي وقاعدة البيانات</li>
              </ul>
            </div>

            <form onSubmit={handleConfirmWipeWithPin} className="space-y-3">
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  أدخل رمز المرور الرقمي (PIN) للمتابعة والحذف:
                </label>
                <div className="relative">
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
                    className="w-full bg-slate-50 border border-slate-300 rounded-none p-3 pr-10 text-center font-mono font-black text-lg tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWipePin(!showWipePin)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showWipePin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {wipePinError && (
                <div className="p-3 bg-rose-100 border border-rose-300 rounded-none text-xs font-black text-rose-900 flex items-center gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span>{wipePinError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isWiping}
                  onClick={() => setIsWipeModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-none cursor-pointer transition-colors"
                >
                  إلغاء وتراجع
                </button>
                <button
                  type="submit"
                  disabled={isWiping || !wipePinInput.trim()}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black rounded-none shadow-xs shadow-rose-600/20 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  {isWiping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري المسح...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>تأكيد مسح البيانات نهائياً</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
