import React, { useState, useEffect } from 'react';
import { MarketSettings, Transaction, Contact, FishType, CashEntry, CashDayCloseRecord, LotTransferRecord } from '../types';
import {
  Settings,
  X,
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
  Send,
  LogOut,
  Server,
  MailCheck,
  ChevronDown,
  ChevronUp,
  Type,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Percent,
  Building2,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { exportAllData, importData, resetAllDataToDefault } from '../utils/storage';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/authService';
import { sendBackupEmailNow, testSmtpSettings } from '../services/emailBackupClient';
import { ARABIC_FONTS, FONT_SIZE_OPTIONS, applyTypography } from '../utils/typography';
import { SettingsTab, SETTINGS_TABS } from './SettingsView';

interface SettingsModalProps {
  settings: MarketSettings;
  isOpen: boolean;
  onClose: () => void;
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

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  isOpen,
  onClose,
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

  // Sync form data whenever modal opens or settings change
  useEffect(() => {
    if (isOpen && settings) {
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
      setAuthMsg(null);
      setShowSwitchAccountForm(false);
    }
  }, [isOpen, settings, user?.email]);

  const handleSettingsGoogleSignIn = async () => {
    setAuthMsg(null);
    setIsGoogleAuthLoading(true);
    try {
      await signInWithGoogle();
      setAuthMsg({ type: 'success', text: 'تم تسجيل الدخول عبر Google بنجاح وتم ربط الحساب السحابي!' });
      setShowSwitchAccountForm(false);
    } catch (err: unknown) {
      setAuthMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google',
      });
    } finally {
      setIsGoogleAuthLoading(false);
    }
  };

  const handleSettingsEmailAuth = async () => {
    setAuthMsg(null);
    if (!loginEmail.trim()) {
      setAuthMsg({ type: 'error', text: 'يرجى إدخال البريد الإلكتروني' });
      return;
    }
    if (!loginPassword) {
      setAuthMsg({ type: 'error', text: 'يرجى إدخال كلمة المرور' });
      return;
    }
    if (authTab === 'register' && loginPassword.length < 6) {
      setAuthMsg({ type: 'error', text: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
      return;
    }

    setAuthLoading(true);
    try {
      if (authTab === 'login') {
        await signIn(loginEmail.trim(), loginPassword);
        setAuthMsg({ type: 'success', text: 'تم تسجيل الدخول بنجاح وتم ربط حسابك السحابي!' });
      } else {
        await register(loginEmail.trim(), loginPassword, registerName.trim());
        setAuthMsg({ type: 'success', text: 'تم إنشاء الحساب وتسجيل الدخول بنجاح!' });
      }
      setLoginPassword('');
      setShowSwitchAccountForm(false);
    } catch (err: unknown) {
      setAuthMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'حدث خطأ أثناء المصادقة',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFirebaseSignOut = async () => {
    if (window.confirm('هل أنت متأكد من تسجيل الخروج من حساب Firebase؟')) {
      try {
        await firebaseSignOut();
        setAuthMsg({ type: 'success', text: 'تم تسجيل الخروج من الحساب بنجاح' });
      } catch (err: any) {
        alert(err.message || 'حدث خطأ أثناء تسجيل الخروج');
      }
    }
  };

  const handleManualEmailBackup = async () => {
    const targetEmail = user?.email || formData.smtpUser;
    if (!targetEmail) {
      setEmailBackupResult({
        type: 'error',
        text: 'لم يتم العثور على بريد إلكتروني مسجل. يرجى التأكد من تسجيل الدخول في النظام أولاً.',
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
          triggerReason: `إرسال يدوي فوري من نافذة الإعدادات`,
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


  if (!isOpen) return null;

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
    setMsg('تم حفظ الإعدادات بنجاح');
    setTimeout(() => {
      setMsg(null);
      onClose();
    }, 800);
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
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error clearing data:', err);
      setIsWiping(false);
      setWipePinError('حدث خطأ أثناء مسح البيانات، يرجى المحاولة مرة أخرى.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-300 rounded-none max-w-lg w-full overflow-hidden shadow-xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between p-4 border-b border-slate-300 bg-blue-50/60">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Settings className="w-4 h-4 text-blue-600" />
            <span>إعدادات النظام والطباعة والعمولات</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {msg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-none flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="font-bold">{msg}</span>
            </div>
          )}

          {/* Modern Tab Navigation */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 bg-slate-100 p-1.5 rounded-none border border-slate-300">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center sm:flex-col sm:items-center text-right sm:text-center gap-1.5 p-2 rounded-none font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-blue-700 shadow-2xs border border-slate-300 ring-2 ring-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <div className={`p-1.5 rounded-none shrink-0 ${isActive ? 'bg-blue-50 text-blue-700' : 'bg-slate-200/70 text-slate-500'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-black truncate">{tab.label}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ══ قسم حساب المستخدم والمصادقة (Firebase) في الأعلى ══ */}
          {activeTab === 'account' && (
            <div className="space-y-3 pb-3 border-b border-slate-300">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                <span>حساب المستخدم والمزامنة السحابية (Firebase)</span>
              </h4>
              {user && (
                <button
                  type="button"
                  onClick={handleFirebaseSignOut}
                  className="px-2.5 py-1 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-none transition-colors cursor-pointer flex items-center gap-1"
                  title="تسجيل الخروج من حساب Firebase"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>تسجيل خروج</span>
                </button>
              )}
            </div>

            {/* رسائل التنبيه والنتائج للمصادقة */}
            {authMsg && (
              <div className={`p-3 rounded-none flex items-start gap-2.5 text-xs font-semibold ${
                authMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-700'
              }`}>
                {authMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span>{authMsg.text}</span>
              </div>
            )}

            {user && !showSwitchAccountForm ? (
              /* ── عرض الحساب الحالي المتصل ── */
              <div className="space-y-3">
                <div className="p-3.5 bg-blue-50/70 border border-blue-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-none bg-blue-900 text-white border-2 border-white shadow-sm shrink-0 flex items-center justify-center overflow-hidden">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={`صورة حساب ${accountName}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-black">{accountInitials || <User className="w-5 h-5" />}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <p className="text-[11px] text-emerald-800 font-bold">متصل سحابياً بـ Firebase</p>
                      </div>
                      <p className="text-xs font-black text-slate-900 truncate" dir="ltr">{user.email}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5 font-medium">الاسم: {accountName}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSwitchAccountForm(true);
                        setAuthMsg(null);
                      }}
                      className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-none transition-colors cursor-pointer"
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
                      className="px-3 py-1.5 text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 rounded-none transition-colors cursor-pointer"
                    >
                      {showEmailForm ? 'إلغاء' : 'تغيير البريد'}
                    </button>
                  </div>
                </div>

                {/* نموذج تغيير البريد الإلكتروني للحساب الحالي */}
                {showEmailForm && (
                  <div className="p-3 bg-white border border-slate-300 rounded-none space-y-3">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      سيتم إرسال رابط تحقق إلى البريد الجديد — يُطبَّق التغيير فوراً بعد النقر على الرابط في بريدك.
                    </p>

                    {emailUpdateMsg && (
                      <div className={`p-2.5 rounded-none flex items-start gap-2 text-[11px] font-semibold ${
                        emailUpdateMsg.type === 'success'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border border-rose-200 text-rose-700'
                      }`}>
                        {emailUpdateMsg.type === 'success'
                          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                        <span>{emailUpdateMsg.text}</span>
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold text-[11px]">البريد الإلكتروني الجديد</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => { setNewEmail(e.target.value); setEmailUpdateMsg(null); }}
                        placeholder="example@email.com"
                        dir="ltr"
                        disabled={emailUpdateLoading}
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold text-[11px]">كلمة المرور الحالية (للتحقق من هويتك)</label>
                      <div className="relative">
                        <input
                          type={showEmailPassword ? 'text' : 'password'}
                          value={currentPasswordForEmail}
                          onChange={(e) => { setCurrentPasswordForEmail(e.target.value); setEmailUpdateMsg(null); }}
                          placeholder="••••••"
                          dir="ltr"
                          disabled={emailUpdateLoading}
                          className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 pr-8 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEmailPassword(!showEmailPassword)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showEmailPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={emailUpdateLoading || !newEmail.trim() || !currentPasswordForEmail}
                      onClick={async () => {
                        setEmailUpdateLoading(true);
                        setEmailUpdateMsg(null);
                        try {
                          await authService.updateEmail(newEmail, currentPasswordForEmail);
                          setEmailUpdateMsg({
                            type: 'success',
                            text: `تم إرسال رابط التحقق إلى ${newEmail} — تفقد صندوق الوارد وانقر على الرابط لتطبيق التغيير.`,
                          });
                          setNewEmail('');
                          setCurrentPasswordForEmail('');
                        } catch (err: unknown) {
                          setEmailUpdateMsg({
                            type: 'error',
                            text: err instanceof Error ? err.message : 'حدث خطأ غير متوقع',
                          });
                        } finally {
                          setEmailUpdateLoading(false);
                        }
                      }}
                      className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-none flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {emailUpdateLoading ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>جاري الإرسال...</span></>
                      ) : (
                        <><Mail className="w-3.5 h-3.5" /><span>إرسال رابط التحقق للبريد الجديد</span></>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* ── نموذج تسجيل الدخول أو إنشاء الحساب مباشرة من داخل الإعدادات ── */
              <div className="p-4 bg-slate-50 border border-slate-300 rounded-none space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800 text-xs">
                      {showSwitchAccountForm ? 'تسجيل الدخول بحساب سحابي آخر' : 'تسجيل الدخول / ربط حساب سحابي'}
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      يمكنك تسجيل الدخول أو إنشاء حساب الآن لحفظ النسخ السحابية والمزامنة دون مغادرة النظام
                    </p>
                  </div>
                  {showSwitchAccountForm && (
                    <button
                      type="button"
                      onClick={() => setShowSwitchAccountForm(false)}
                      className="text-xs text-blue-900 hover:underline font-semibold cursor-pointer"
                    >
                      إلغاء التبديل
                    </button>
                  )}
                </div>

                {/* زر الدخول السريع عبر Google */}
                <button
                  type="button"
                  onClick={handleSettingsGoogleSignIn}
                  disabled={isGoogleAuthLoading || authLoading}
                  className="w-full py-3 px-4 rounded-none border-2 border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 font-bold text-xs flex items-center justify-center gap-2.5 transition-all shadow-xs cursor-pointer hover:border-slate-300"
                >
                  {isGoogleAuthLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      <span>جاري تسجيل الدخول عبر Google...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                      </svg>
                      <span>الدخول السريع عبر Google</span>
                    </>
                  )}
                </button>

                <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span>أو بالبريد الإلكتروني وكلمة المرور</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>

                {/* تبويبات: دخول / إنشاء حساب */}
                <div className="flex bg-slate-200/80 rounded-none p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => { setAuthTab('login'); setAuthMsg(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-none transition-all cursor-pointer ${
                      authTab === 'login'
                        ? 'bg-white text-blue-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthTab('register'); setAuthMsg(null); }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-none transition-all cursor-pointer ${
                      authTab === 'register'
                        ? 'bg-white text-blue-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    إنشاء حساب جديد
                  </button>
                </div>

                {/* حقول الإدخال */}
                <div className="space-y-2.5">
                  {authTab === 'register' && (
                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold text-[11px]">اسم العرض (اختياري)</label>
                      <input
                        type="text"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        placeholder="اسم المستخدم أو المؤسسة"
                        disabled={authLoading}
                        className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold text-[11px]">البريد الإلكتروني</label>
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="example@email.com"
                      dir="ltr"
                      disabled={authLoading}
                      className="w-full bg-white border border-slate-300 rounded-none p-2.5 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1 font-semibold text-[11px]">كلمة المرور</label>
                    <div className="relative">
                      <input
                        type={showAuthPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••"
                        dir="ltr"
                        disabled={authLoading}
                        className="w-full bg-white border border-slate-300 rounded-none p-2.5 pr-8 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="w-full mt-2 py-2.5 px-4 bg-[#0f2d4a] hover:bg-[#163c62] active:scale-[0.99] disabled:opacity-60 text-white font-bold text-xs rounded-none flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
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

          {/* Market info */}
          {activeTab === 'general' && (
            <div className="space-y-3">
            <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1">
              بيانات الحراج والجمعية (تظهر في الفواتير)
            </h4>

            <div>
              <label className="block text-slate-700 mb-1 font-semibold">اسم الحراج أو الجمعية</label>
              <input
                type="text"
                value={formData.marketName || ''}
                onChange={(e) => setFormData({ ...formData, marketName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-semibold">العنوان الفرعي</label>
              <input
                type="text"
                value={formData.subTitle || ''}
                onChange={(e) => setFormData({ ...formData, subTitle: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">موقع الحراج</label>
                <input
                  type="text"
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">رقم هاتف / جوال الحراج (المطبوع في الفاتورة والترويسة)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={formData.contactPhone ?? '782191112'}
                  placeholder="782191112"
                  onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 font-bold text-right focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-semibold flex items-center justify-between">
                <span>اسم الموظف / المحاسب (المطبوع في الفواتير وسندات القبض)</span>
                <span className="text-xs text-blue-600 font-normal">يظهر في الفاتورة والسندات</span>
              </label>
              <input
                type="text"
                value={formData.employeeName || ''}
                placeholder="مثال: أمين الصندوق / سالم باحاج"
                onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 mb-1 font-semibold">العملة الأساسية للنظام</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={formData.currency || 'ريال يمني'}
                  placeholder="ريال يمني"
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-none p-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, currency: 'ريال يمني' })}
                  className="shrink-0 px-2.5 py-2 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-300 rounded-none hover:bg-blue-100 transition-colors cursor-pointer"
                  title="اعتماد الريال اليمني كعملة أساسية"
                >
                  ريال يمني
                </button>
              </div>
            </div>

            {/* إعدادات طريقة عرض رصيد صندوق النقدية والدرج */}
            <div className="pt-3 border-t border-slate-100">
              <label className="block text-slate-800 text-xs font-bold mb-1">
                طريقة عرض بطاقة رصيد الصندوق الفعلي
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                تحديد القيمة التي تظهر في بطاقة "رصيد الصندوق الفعلي" في شاشة صندوق النقدية لمنع الارتباك:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cashDrawerDisplayMode: 'today_only' })}
                  className={`p-2.5 rounded-none border-2 text-right transition-all cursor-pointer ${
                    (formData.cashDrawerDisplayMode || 'today_only') === 'today_only'
                      ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-400/30'
                      : 'bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-emerald-950">
                      رصيد درج اليوم والعهدة (الموصى به)
                    </span>
                    {(formData.cashDrawerDisplayMode || 'today_only') === 'today_only' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    يعرض المبلغ النقدي المتوفر بالدرج لليوم الحالي فقط (العهدة الصباحية + مبيعات اليوم).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, cashDrawerDisplayMode: 'cumulative' })}
                  className={`p-2.5 rounded-none border-2 text-right transition-all cursor-pointer ${
                    formData.cashDrawerDisplayMode === 'cumulative'
                      ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-400/30'
                      : 'bg-white hover:bg-slate-50 border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs font-bold text-amber-950">
                      الرصيد التراكمي الشامل (كافة الحركات)
                    </span>
                    {formData.cashDrawerDisplayMode === 'cumulative' && (
                      <span className="w-2 h-2 rounded-full bg-amber-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    يعرض مجموع كافة الحركات النقدية في تاريخ النظام كاملاً.
                  </p>
                </button>
              </div>
            </div>

            {/* خيار إظهار العهدة وفائض أرباح الشروات المسترد في بطاقات النقدية واليومية */}
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-2.5">
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
                  عند التفعيل تظهر العهدة ضمن بطاقة إجمالي الوارد (المقبوضات) وفائض أرباح الشروات في بطاقات المنصرفات واليومية، وعند الإلغاء يختفيان من العرض فقط دون المساس بالحسابات الفعلية أو رصيد الصندوق.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.showSurplusInCashCards !== false}
                  onChange={(e) => setFormData({ ...formData, showSurplusInCashCards: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            </div>
          )}

          {/* Section: Typography & Display Customization */}
          {activeTab === 'appearance' && (
            <div className="space-y-4 pt-3 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-none bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200 shadow-2xs">
                  <Type className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">مظهر النظام، حجم الخط، والخطوط العربية</h4>
                  <p className="text-[11px] text-slate-500">تخصيص نوع الخط وتكبير أو تصغير حجم النصوص في كافة الشاشات</p>
                </div>
              </div>

              {/* Quick Reset */}
              <button
                type="button"
                onClick={() => {
                  const nextSettings = { ...formData, fontFamily: 'Cairo', fontSizeScale: 112 };
                  setFormData(nextSettings);
                  applyTypography('Cairo', 112);
                }}
                className="px-2.5 py-1 rounded-none text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer self-start sm:self-center"
              >
                استعادة الافتراضي (Cairo 112%)
              </button>
            </div>

            {/* 1. Font Size Scaling Controller */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-purple-600" />
                  <span>تكبير حجم خط النظام:</span>
                  <span className="font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-xs">
                    {formData.fontSizeScale || 112}%
                  </span>
                </label>

                {/* Fast +/- buttons */}
                <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-none border border-slate-300">
                  <button
                    type="button"
                    onClick={() => {
                      const current = formData.fontSizeScale || 112;
                      const next = Math.max(88, current - 4);
                      setFormData({ ...formData, fontSizeScale: next });
                      applyTypography(formData.fontFamily, next);
                    }}
                    className="px-2 py-0.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-300 cursor-pointer flex items-center gap-0.5"
                    title="تصغير الخط 4%"
                  >
                    <ZoomOut className="w-3 h-3 text-slate-600" />
                    <span>A-</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const current = formData.fontSizeScale || 112;
                      const next = Math.min(135, current + 4);
                      setFormData({ ...formData, fontSizeScale: next });
                      applyTypography(formData.fontFamily, next);
                    }}
                    className="px-2 py-0.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-300 cursor-pointer flex items-center gap-0.5"
                    title="تكبير الخط 4%"
                  >
                    <ZoomIn className="w-3 h-3 text-purple-700" />
                    <span>A+</span>
                  </button>
                </div>
              </div>

              {/* Scale Options Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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
                      className={`p-2 rounded-none border-2 text-right transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-50/80 border-purple-500 shadow-2xs ring-1 ring-purple-400/30'
                          : 'bg-white hover:bg-slate-50 border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold ${isSelected ? 'text-purple-900' : 'text-slate-800'}`}>
                          {opt.label}
                        </span>
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />}
                      </div>
                      <p className={`text-[9px] mt-0.5 ${isSelected ? 'text-purple-700' : 'text-slate-400'}`}>
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Arabic Font Families Selection Grid with Live Previews */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>اختر نوع الخط العربي المفضل:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
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
                      className={`p-2.5 rounded-none border-2 text-right transition-all cursor-pointer flex flex-col justify-between min-h-[90px] ${
                        isSelected
                          ? 'bg-purple-50/90 border-purple-600 shadow-xs ring-2 ring-purple-400/20'
                          : 'bg-white hover:bg-slate-50 border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-purple-950 font-black' : 'text-slate-800'}`}>
                            {font.nameArabic}
                          </span>
                          {isSelected ? (
                            <span className="shrink-0 p-0.5 bg-purple-600 text-white rounded-none">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          ) : font.recommended ? (
                            <span className="shrink-0 text-[8px] font-bold px-1 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              موصى به
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[9px] text-slate-500 line-clamp-1 font-sans">
                          {font.category}
                        </p>
                      </div>

                      <div className={`pt-1.5 border-t text-[11px] font-bold truncate ${isSelected ? 'border-purple-200 text-purple-900' : 'border-slate-100 text-slate-700'}`}>
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
              className="p-3 bg-gradient-to-r from-purple-50/70 to-blue-50/70 border border-purple-200 rounded-none space-y-1.5 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-950 font-sans">
                  معاينة حية: <span className="font-mono text-purple-800">{formData.fontFamily || 'Cairo'} ({formData.fontSizeScale || 112}%)</span>
                </span>
                <span className="text-[9px] text-purple-800 font-sans">معاينة تفاعلية</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="bg-white p-2 rounded-none border border-purple-100">
                  <span className="text-[10px] text-slate-400 block">نموذج شروة:</span>
                  <span className="text-xs font-black text-slate-900 block">ديرك كنعد - 50 كجم</span>
                  <span className="text-[11px] font-mono font-bold text-blue-700 block">185,000 ريال</span>
                </div>
                <div className="bg-white p-2 rounded-none border border-purple-100">
                  <span className="text-[10px] text-slate-400 block">عمولة الجمعية 2%:</span>
                  <span className="text-xs font-black text-slate-900 block">الصافي للصياد:</span>
                  <span className="text-[11px] font-mono font-bold text-emerald-700 block">179,450 ريال</span>
                </div>
                <div className="bg-white p-2 rounded-none border border-purple-100">
                  <span className="text-[10px] text-slate-400 block">الأرقام:</span>
                  <span className="text-xs font-black text-slate-900 block font-mono">1234567890 • 2026/10/02</span>
                  <span className="text-[11px] font-bold text-purple-700 block">سوق عين بامعبد</span>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Tax Rates Configuration */}
          {activeTab === 'taxes' && (
            <div className="space-y-3 pt-2">
            <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1">
              نسب العمولات والضرائب المحتسبة
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-blue-50/70 border border-blue-300 rounded-none space-y-1.5">
                <label className="block text-blue-950 font-bold">نسبة المشتري الإضافية (+)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={buyerTaxInput}
                    onChange={(e) => setBuyerTaxInput(e.target.value)}
                    className="w-20 bg-white border border-blue-300 rounded-none p-1.5 text-blue-950 font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-blue-800 font-bold font-mono text-xs">% (افتراضي 2%)</span>
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none space-y-1.5">
                <label className="block text-slate-900 font-bold">نسبة خصم الصياد/البائع (-)</label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={sellerTaxInput}
                    onChange={(e) => setSellerTaxInput(e.target.value)}
                    className="w-20 bg-white border border-slate-300 rounded-none p-1.5 text-slate-900 font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-slate-600 font-bold font-mono text-xs">% (افتراضي 3%)</span>
                </div>
              </div>
            </div>

            {/* خيار إظهار مفتاح التبديل (صياد / بائع) في واجهة الفاتورة */}
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-2.5">
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
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* خيار فصل أرباح وعمولات الحراج من إجمالي كاش الدرج */}
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-2.5">
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
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* خيار إظهار زر (شروة و بيعة) في كشف حساب المشتري */}
            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-2.5">
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
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
            </div>
          )}

          {/* ══ قسم النسخ الاحتياطي عبر البريد الإلكتروني (SMTP) ══ */}
          {activeTab === 'backup' && (
            <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-1">
              <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                <MailCheck className="w-4 h-4 text-blue-600" />
                <span>النسخ الاحتياطي عبر البريد الإلكتروني</span>
              </h4>
              <div className="flex flex-wrap items-center gap-1.5">
                <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2 py-1 rounded-none border border-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.emailBackupEnabled !== false}
                    onChange={(e) => setFormData({ ...formData, emailBackupEnabled: e.target.checked })}
                    className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-slate-700">تفعيل التلقائي</span>
                </label>

                {formData.emailBackupEnabled !== false && (
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-none border border-slate-300">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, backupFrequency: 'daily' })}
                      className={`px-2 py-0.5 text-[10px] font-black rounded-none transition-all cursor-pointer ${
                        (formData.backupFrequency || 'daily') === 'daily'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      يومي
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, backupFrequency: 'weekly' })}
                      className={`px-2 py-0.5 text-[10px] font-black rounded-none transition-all cursor-pointer ${
                        formData.backupFrequency === 'weekly'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      أسبوعي
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, backupFrequency: 'monthly' })}
                      className={`px-2 py-0.5 text-[10px] font-black rounded-none transition-all cursor-pointer ${
                        formData.backupFrequency === 'monthly'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      شهري
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3.5 bg-blue-50/50 border border-blue-300 rounded-none space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    المستلم: <span className="font-mono text-blue-700 font-bold" dir="ltr">{user?.email || formData.smtpUser || 'البريد المسجل في النظام'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    الدورية: <span className="font-bold text-blue-800">{(formData.backupFrequency || 'daily') === 'monthly' ? 'شهرياً (كل 30 يوماً)' : (formData.backupFrequency || 'daily') === 'weekly' ? 'أسبوعياً (كل 7 أيام)' : 'يومياً (كل 24 ساعة)'}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    موضوع الرسالة: <span className="font-bold text-slate-700">[نسخة احتياطية - نظام الحراج]</span> (خيط محادثة واحد)
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    الملف المرفق: <code className="font-mono text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-300">backup_latest.json</code>
                  </p>
                  <p className="text-[10px] text-indigo-700 font-semibold mt-1 bg-indigo-50 border border-indigo-200 rounded-none px-2 py-1 inline-block">
                    سيتم تجميع النسخ اليومية في محادثة واحدة داخل Gmail بحيث يظهر آخر تحديث دائماً في الأعلى.
                  </p>
                  {formData.lastEmailBackupAt && (
                    <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                      آخر نسخة أُرسلت: {new Date(formData.lastEmailBackupAt).toLocaleString('ar-EG')}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSendingEmailBackup}
                  onClick={handleManualEmailBackup}
                  className="shrink-0 px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-none shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSendingEmailBackup ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري الإرسال...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>إرسال نسخة احتياطية إلى بريدي الآن</span>
                    </>
                  )}
                </button>
              </div>

              {/* رسالة نتيجة الإرسال اليدوي */}
              {emailBackupResult && (
                <div className={`p-2.5 rounded-none flex items-start gap-2 text-xs font-semibold ${
                  emailBackupResult.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border border-rose-200 text-rose-700'
                }`}>
                  {emailBackupResult.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                  )}
                  <span>{emailBackupResult.text}</span>
                </div>
              )}

              {/* ── خيارات وتوقيت النسخ التلقائي عبر البريد الإلكتروني ── */}
              <div className="p-3 bg-white border border-blue-300 rounded-none space-y-2.5 shadow-xs">
                <div className="flex items-center gap-1.5 border-b border-slate-300 pb-1.5">
                  <MailCheck className="w-4 h-4 text-blue-600" />
                  <div>
                    <h4 className="text-xs font-black text-slate-800">خيارات وجدولة الإرسال التلقائي للبريد:</h4>
                    <p className="text-[10px] text-slate-500">يمكنك تفعيل أحد الخيارين أو كليهما بحسب رغبتك</p>
                  </div>
                </div>

                {/* الخيار الأول: تحديد ساعة يومية ثابتة */}
                <div className={`p-2.5 rounded-none border transition-all ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-blue-50/70 border-blue-300' : 'bg-slate-50 border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !(formData.emailBackupOnScheduleEnabled !== false);
                          const updated = { ...formData, emailBackupOnScheduleEnabled: nextVal };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center transition-colors cursor-pointer ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-blue-600 text-white' : 'border border-slate-400 bg-white'}`}
                      >
                        {formData.emailBackupOnScheduleEnabled !== false && <Check className="w-3 h-3" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-700" />
                          <span className="text-xs font-black text-slate-900">الخيار 1: إرسال تلقائي في ساعة يومية محددة</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          يقوم النظام بإرسال نسخة احتياطية مشفرة ومؤرشفة لبريدك يومياً فور حلول هذه الساعة المحددة.
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-none shrink-0 ${formData.emailBackupOnScheduleEnabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {formData.emailBackupOnScheduleEnabled !== false ? 'مفعل' : 'معطل'}
                    </span>
                  </div>

                  {formData.emailBackupOnScheduleEnabled !== false && (
                    <div className="mt-2.5 pt-2 border-t border-slate-300 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-700 font-bold text-[11px]">حدد وقت الإرسال:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...formData, emailBackupScheduledTime: '23:00' };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className={`px-2 py-0.5 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '23:00' ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
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
                        className={`px-2 py-0.5 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '00:00' ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
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
                        className={`px-2 py-0.5 text-xs font-black rounded-none border transition-all cursor-pointer ${(formData.emailBackupScheduledTime || '23:00') === '22:00' ? 'bg-blue-600 text-white border-blue-600 shadow-xs' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
                      >
                        10:00 مساءً (22:00)
                      </button>
                      <div className="flex items-center gap-1 mr-auto">
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
                          className="bg-white border border-blue-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* الخيار الثاني: إرسال فوري عند اعتماد إغلاق اليومية والجرد */}
                <div className={`p-2.5 rounded-none border transition-all ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50 border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextVal = !(formData.emailBackupOnDayCloseEnabled !== false);
                          const updated = { ...formData, emailBackupOnDayCloseEnabled: nextVal };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center transition-colors cursor-pointer ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-600 text-white' : 'border border-slate-400 bg-white'}`}
                      >
                        {formData.emailBackupOnDayCloseEnabled !== false && <Check className="w-3 h-3" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="text-xs font-black text-slate-900">الخيار 2: إرسال تلقائي فوري عند اعتماد إغلاق اليومية والجرد</span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          بمجرد أن ينهي المحاسب الجرد ويضغط على «اعتماد إغلاق اليومية»، يرسل النظام فوراً نسخة احتياطية كاملة ومؤرشفة لكافة العمليات والحسابات لبريدك الإلكتروني مع تقرير اليومية.
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-none shrink-0 ${formData.emailBackupOnDayCloseEnabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                      {formData.emailBackupOnDayCloseEnabled !== false ? 'مفعل' : 'معطل'}
                    </span>
                  </div>
                </div>
              </div>

              {/* إعدادات خادم SMTP المتقدمة (قابلة للطي) */}
              <div className="pt-2 border-t border-slate-300">
                <button
                  type="button"
                  onClick={() => setShowSmtpConfig(!showSmtpConfig)}
                  className="flex items-center justify-between w-full text-slate-700 hover:text-blue-700 font-bold text-xs cursor-pointer py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                    <span>إعدادات خادم البريد (SMTP) وكلمة مرور التطبيق</span>
                  </span>
                  {showSmtpConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showSmtpConfig && (
                  <div className="mt-3 p-3 bg-white border border-slate-300 rounded-none space-y-3">
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

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold text-[11px]">خادم SMTP (Host)</label>
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="smtp.gmail.com"
                          value={formData.smtpHost || ''}
                          onChange={(e) => {
                            const updated = { ...formData, smtpHost: e.target.value };
                            setFormData(updated);
                            onSaveSettings(updated);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 mb-1 font-semibold text-[11px]">المنفذ (Port)</label>
                        <input
                          type="number"
                          dir="ltr"
                          placeholder="465"
                          value={formData.smtpPort || 465}
                          onChange={(e) => {
                            const updated = { ...formData, smtpPort: parseInt(e.target.value, 10) || 465 };
                            setFormData(updated);
                            onSaveSettings(updated);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 mb-1 font-semibold text-[11px]">بريد الإرسال (SMTP User / Gmail)</label>
                      <input
                        type="email"
                        dir="ltr"
                        placeholder="your-email@gmail.com"
                        value={formData.smtpUser || ''}
                        onChange={(e) => {
                          const updated = { ...formData, smtpUser: e.target.value };
                          setFormData(updated);
                          onSaveSettings(updated);
                        }}
                        className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-700 font-semibold text-[11px]">كلمة مرور التطبيق (App Password - 16 حرفاً)</label>
                        {formData.smtpPass && (
                          <span className="text-[11px] text-emerald-700 font-black flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>محفوظة وثابتة</span>
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
                            // حفظ فوري في التخزين وقاعدة البيانات
                            onSaveSettings(updated);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-none p-2 pr-8 text-slate-900 text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPassInput(!showSmtpPassInput)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          tabIndex={-1}
                        >
                          {showSmtpPassInput ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {smtpTestResult && (
                      <div className={`p-2.5 rounded-none flex items-start gap-2 text-[11px] font-semibold ${
                        smtpTestResult.type === 'success'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border border-rose-200 text-rose-700'
                      }`}>
                        {smtpTestResult.type === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                        )}
                        <span>{smtpTestResult.text}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        disabled={isTestingSmtp}
                        onClick={handleTestSmtp}
                        className="px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-none border border-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isTestingSmtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5" />}
                        <span>{isTestingSmtp ? 'جاري الفحص...' : 'اختبار اتصال خادم البريد (Test SMTP)'}</span>
                      </button>

                      <span className="text-[10px] text-slate-500">
                        مشفّر وآمن (SSL 465)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* System PIN Code Section */}
          {activeTab === 'security' && (
            <div className="space-y-3">
              <div className="space-y-3 pt-2">
            <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>رمز المرور الرقمي لشاشة البداية (PIN)</span>
              </span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-none">أرقام فقط</span>
            </h4>

            <div className="p-3.5 bg-slate-50 border border-slate-300 rounded-none flex items-center justify-between gap-4">
              <div>
                <label className="block text-slate-900 font-bold mb-1">رمز الدخول الحالي للنظام (PIN)</label>
                <p className="text-[11px] text-slate-500">يتكون من أرقام فقط ويستخدم للدخول في شاشة البداية وقفل الشاشة</p>
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
                  className="w-full bg-white border border-slate-300 rounded-none py-2 pr-3 pl-9 text-slate-900 font-mono font-bold text-center tracking-widest text-base focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSystemPin(!showSystemPin)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer rounded-none hover:bg-slate-100 transition-colors"
                  title={showSystemPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {showSystemPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Database & Backup Actions */}
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
              <span>قاعدة البيانات وإدارة النسخ الاحتياطي</span>
              <span className="text-[11px] font-bold text-slate-500">Database & Backup</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Database Status & Trigger Button */}
              <button
                type="button"
                onClick={() => {
                  if (onOpenBackup) onOpenBackup();
                }}
                className={`p-3.5 rounded-none border flex items-center justify-between text-right transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.99] ${
                  cloudStatus === 'connected'
                    ? 'bg-emerald-50/90 hover:bg-emerald-100/90 text-emerald-950 border-emerald-200'
                    : cloudStatus === 'syncing'
                    ? 'bg-sky-50 hover:bg-sky-100 text-sky-950 border-sky-200'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-950 border-slate-300'
                }`}
                title="اضغط هنا لإدارة قاعدة البيانات والنسخ الاحتياطي"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-none bg-white/80 border border-emerald-200/60 text-emerald-700 shadow-2xs">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          cloudStatus === 'connected'
                            ? 'bg-emerald-500 ring-2 ring-emerald-300 animate-pulse'
                            : cloudStatus === 'syncing'
                            ? 'bg-sky-500 animate-ping'
                            : 'bg-amber-500'
                        }`}
                      />
                      <span className="text-xs font-black text-slate-900">قاعدة البيانات (PostgreSQL)</span>
                    </div>
                    <span className="text-[11px] text-slate-600 block mt-0.5">
                      {cloudStatus === 'connected'
                        ? 'قاعدة بيانات متصلة ونشطة'
                        : cloudStatus === 'syncing'
                        ? 'جارٍ فحص قاعدة البيانات...'
                        : 'وضع التخزين الآمن'}
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-white/90 px-2 py-1 rounded-none border border-emerald-200">
                  إدارة القاعدة
                </span>
              </button>

              {/* Quick Backup Action Button */}
              <button
                type="button"
                onClick={() => {
                  if (onOpenBackup) onOpenBackup();
                }}
                className="p-3.5 rounded-none bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-between text-right transition-all cursor-pointer shadow-sm hover:shadow-xs active:scale-[0.99]"
                title="النسخ الاحتياطي وحفظ وتصدير البيانات"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-none bg-emerald-700/70 border border-emerald-500/50 text-emerald-100 shadow-2xs">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-black block">نسخة احتياطية</span>
                    <span className="text-[11px] text-emerald-100 block mt-0.5">
                      تصدير الفواتير، Excel، والنسخ السريع
                    </span>
                  </div>
                </div>
                <span className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded-none">
                  فتح المركز
                </span>
              </button>
            </div>

            {/* Direct Local JSON Backup Actions */}
            <div className="p-3 bg-slate-50 border border-slate-300 rounded-none space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>أدوات النسخ والاسترجاع المحلي (JSON):</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="px-3 py-1.5 rounded-none bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>تصدير ملف (JSON)</span>
                </button>

                <label className="px-3 py-1.5 rounded-none bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-300 shadow-2xs transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-blue-600" />
                  <span>استيراد ملف</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFile}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleOpenWipeModal}
                  disabled={isWiping}
                  className="px-3 py-1.5 rounded-none bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 border border-rose-200 transition-colors cursor-pointer"
                  title="مسح وتصفير كافة بيانات النظام (فواتير، حسابات، ديون، حركة الصندوق)"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>{isWiping ? 'جاري المسح...' : 'مسح وتصفير كافة البيانات'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 font-bold cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-none shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>حفظ التغييرات</span>
            </button>
          </div>
        </form>
      </div>

      {/* Wipe / Reset PIN Protection Confirmation Modal */}
      {isWipeModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
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
                <li>حركة الصندوق والعهدة وسجلات الجرد وقاعدة البيانات</li>
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
