/**
 * FirebaseLoginScreen.tsx
 * واجهة تسجيل الدخول / إنشاء الحساب باستخدام Firebase Authentication
 * تصميم احترافي عربي متجاوب مع نفس هوية النظام
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogIn,
  UserPlus,
  ShieldCheck,
  Store,
  Calendar,
  Clock,
  Wifi,
  WifiOff,
  ArrowLeft,
  Chrome,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatGregorianDate, formatGregorianTime } from '../utils/calculations';

// ─────────────────────────────────────────────
// Email Validation
// ─────────────────────────────────────────────
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ─────────────────────────────────────────────
// Local Storage Keys
// ─────────────────────────────────────────────
const LS_REMEMBERED_EMAIL = 'fishe_remembered_email';
const LS_REMEMBER_ME = 'fishe_remember_me';

// ─────────────────────────────────────────────
// Component Props
// ─────────────────────────────────────────────
interface FirebaseLoginScreenProps {
  onContinueWithPin?: () => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export const FirebaseLoginScreen: React.FC<FirebaseLoginScreenProps> = ({ onContinueWithPin }) => {
  const { signIn, signInWithGoogle, register } = useAuth();

  // تبويب نشط: login | register
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // حقول النموذج
  const [email, setEmail] = useState<string>(() => {
    if (localStorage.getItem(LS_REMEMBER_ME) === 'true') {
      return localStorage.getItem(LS_REMEMBERED_EMAIL) ?? '';
    }
    return '';
  });
  const [password, setPassword] = useState<string>('');

  // UI States
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    return localStorage.getItem(LS_REMEMBER_ME) === 'true';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  // الوقت الحالي
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  // Validation states
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // ─── ساعة مباشرة ───
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setCurrentTime(formatGregorianTime(now, true));
      const weekday = now.toLocaleDateString('ar-EG', { weekday: 'long' });
      setCurrentDate(`${weekday}، ${formatGregorianDate(now)}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── مراقبة الاتصال ───
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

  // ─── Focus على حقل البريد عند التبديل ───
  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 100);
    setErrorMsg('');
    setSuccessMsg('');
    setPassword('');
    setPasswordTouched(false);
  }, [tab]);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  const clearMessages = () => {
    setErrorMsg('');
    setSuccessMsg('');
  };

  // ─── تسجيل الدخول ───
  const handleSignIn = useCallback(async () => {
    clearMessages();
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!email.trim()) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني');
      triggerShake();
      emailRef.current?.focus();
      return;
    }
    if (!isValidEmail(email)) {
      setErrorMsg('صيغة البريد الإلكتروني غير صحيحة');
      triggerShake();
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setErrorMsg('يرجى إدخال كلمة المرور');
      triggerShake();
      return;
    }
    if (!isOnline) {
      setErrorMsg('لا يوجد اتصال بالإنترنت، يرجى التحقق من الشبكة');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      // حفظ البريد إذا فعّل "تذكرني"
      if (rememberMe) {
        localStorage.setItem(LS_REMEMBERED_EMAIL, email.trim());
        localStorage.setItem(LS_REMEMBER_ME, 'true');
      } else {
        localStorage.removeItem(LS_REMEMBERED_EMAIL);
        localStorage.setItem(LS_REMEMBER_ME, 'false');
      }
      // سيتولى AuthContext توجيه المستخدم تلقائياً عبر onAuthStateChanged
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, rememberMe, signIn, isOnline]);

  // ─── إنشاء حساب ───
  const handleRegister = useCallback(async () => {
    clearMessages();
    setEmailTouched(true);
    setPasswordTouched(true);

    if (!email.trim() || !isValidEmail(email)) {
      setErrorMsg('يرجى إدخال بريد إلكتروني صحيح');
      triggerShake();
      emailRef.current?.focus();
      return;
    }
    if (password.length < 6) {
      setErrorMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      triggerShake();
      return;
    }
    if (!isOnline) {
      setErrorMsg('لا يوجد اتصال بالإنترنت، يرجى التحقق من الشبكة');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      await register(email, password);
      setSuccessMsg('تم إنشاء الحساب بنجاح! جاري الدخول...');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, register, isOnline]);

  const handleGoogleSignIn = useCallback(async () => {
    clearMessages();
    if (!isOnline) {
      setErrorMsg('لا يوجد اتصال بالإنترنت، يرجى التحقق من الشبكة');
      triggerShake();
      return;
    }

    setIsLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google');
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [isOnline, signInWithGoogle]);

  // ─── إدخال بلوحة المفاتيح ───
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      tab === 'login' ? handleSignIn() : handleRegister();
    }
  };

  // ─────────────────────────────────────────────
  // Styles helpers
  // ─────────────────────────────────────────────
  const inputClass = (hasError: boolean) =>
    `w-full pr-11 pl-11 py-3.5 rounded-2xl border-2 text-sm font-medium transition-all outline-none bg-white
    ${hasError
      ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
      : 'border-slate-200 focus:border-blue-900 focus:bg-white bg-slate-50'
    } text-slate-800 placeholder:text-slate-400 placeholder:font-normal`;

  const emailHasError = emailTouched && email.trim() !== '' && !isValidEmail(email);

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-white flex flex-col font-['Cairo',system-ui,sans-serif] select-none"
      style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      {/* ── شريط علوي: اسم النظام + الوقت + حالة الاتصال ── */}
      <div className="w-full border-b border-slate-100 px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs text-slate-500 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-blue-900" />
          <span className="font-semibold text-slate-700">سوق عين بامعبد المركزي</span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="text-slate-500 hidden sm:inline">نظام إدارة ومبيعات الحراج</span>
        </div>

        <div className="flex items-center gap-3 font-mono">
          {/* حالة الاتصال */}
          <div
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
              isOnline
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : 'text-rose-700 bg-rose-50 border-rose-200'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden sm:inline">{isOnline ? 'متصل' : 'غير متصل'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-blue-800" />
            <span>{currentDate}</span>
          </div>

          <div className="flex items-center gap-1.5 text-slate-700 font-bold bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-sm">
            <Clock className="w-3.5 h-3.5 text-blue-800 animate-pulse" />
            <span>{currentTime}</span>
          </div>
        </div>
      </div>

      {/* ── المحتوى الرئيسي ── */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center p-4 sm:p-8 lg:p-12 gap-8 lg:gap-16 max-w-7xl mx-auto w-full">

        {/* ════ قسم الشعار والهوية (يسار) ════ */}
        <div className="w-full lg:w-1/2 flex flex-col items-center text-center p-6 sm:p-10 rounded-3xl bg-gradient-to-b from-blue-50/50 via-white to-sky-50/30 border border-blue-100/80 shadow-sm relative overflow-hidden">
          {/* تأثيرات الخلفية */}
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-sky-100/50 blur-3xl pointer-events-none" />

          {/* الشعار */}
          <div className="relative mb-6 group">
            <div className="w-60 h-48 sm:w-72 sm:h-56 lg:w-80 lg:h-60 rounded-3xl bg-white p-3.5 shadow-xl border-4 border-white ring-8 ring-blue-50/70 flex items-center justify-center transition-all duration-500 hover:scale-105">
              <img
                src="/logo.png"
                alt="شعار سوق عين بامعبد المركزي"
                className="w-full h-full object-contain drop-shadow-sm"
              />
            </div>
            <div className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-blue-900 text-white text-[11px] font-bold px-3.5 py-1 rounded-full shadow-md flex items-center gap-1 border-2 border-white">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>دخول سحابي آمن</span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#0f2d4a] tracking-tight mb-2">
            سوق عين بامعبد المركزي
          </h1>
          <h2 className="text-base sm:text-lg font-bold text-blue-800/90 mb-3">
            للأسماك الطازجة والخضروات والفواكة
          </h2>

          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/70 text-blue-950 text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-xl mb-6 shadow-sm">
            <span>محافظة شبوة</span>
            <span className="text-blue-300">•</span>
            <span>مديرية رضوم</span>
            <span className="text-blue-300">•</span>
            <span>عين بامعبد</span>
          </div>

          <p className="text-slate-500 text-xs sm:text-sm max-w-md leading-relaxed">
            منظومة إلكترونية متكاملة لإدارة شروات الحراج، كشوفات الصيادين، حسابات المشترين،
            ومتابعة صندوق النقدية اليومي — متزامنة بين سطح المكتب والموبايل.
          </p>

          <div className="mt-6 pt-6 border-t border-slate-100 w-full flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              تزامن سحابي فوري
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              حماية بـ Firebase Auth
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
              جلسة محفوظة آمنة
            </span>
          </div>
        </div>

        {/* ════ قسم نموذج الدخول (يمين) ════ */}
        <div className="w-full lg:w-1/2 max-w-md flex flex-col items-center">
          <div
            className={`w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl transition-all duration-300 ${
              isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''
            }`}
            style={{
              animation: isShaking ? 'shake 0.5s ease-in-out' : undefined,
            }}
            onKeyDown={handleKeyDown}
          >
            {/* ── تبويبات: دخول / تسجيل ── */}
            <div className="flex bg-slate-100 rounded-2xl p-1 mb-6 gap-1">
              <button
                onClick={() => setTab('login')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                  tab === 'login'
                    ? 'bg-white text-blue-900 shadow-md border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <LogIn className="w-4 h-4" />
                تسجيل الدخول
              </button>
              <button
                onClick={() => setTab('register')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer ${
                  tab === 'register'
                    ? 'bg-white text-blue-900 shadow-md border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                إنشاء حساب
              </button>
            </div>

            {/* ── عنوان النموذج ── */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm flex-shrink-0">
                <Lock className="w-6 h-6 text-blue-900" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">
                  {tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
                </h3>
                <p className="text-xs text-slate-500">
                  {tab === 'login'
                    ? 'أدخل بياناتك للدخول إلى النظام'
                    : 'أنشئ حساباً جديداً للوصول السحابي'}
                </p>
              </div>
            </div>

            {/* ── رسالة خطأ ── */}
            {errorMsg && (
              <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* ── رسالة نجاح ── */}
            {successMsg && (
              <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* ── الحقول ── */}
            <div className="space-y-4">

              {/* البريد الإلكتروني */}
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder="البريد الإلكتروني"
                  className={inputClass(emailHasError)}
                  autoComplete="email"
                  disabled={isLoading}
                  dir="ltr"
                />
                {emailHasError && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-500">
                    <AlertCircle className="w-4 h-4" />
                  </span>
                )}
              </div>
              {emailHasError && (
                <p className="text-xs text-rose-600 font-semibold -mt-2 pr-1">
                  صيغة البريد الإلكتروني غير صحيحة
                </p>
              )}

              {/* كلمة المرور */}
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearMessages(); setPasswordTouched(true); }}
                  placeholder="كلمة المرور"
                  className={inputClass(
                    passwordTouched && tab === 'register' && password.length > 0 && password.length < 6,
                  )}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  disabled={isLoading}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  title={showPassword ? 'إخفاء' : 'إظهار'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordTouched && tab === 'register' && password.length > 0 && password.length < 6 && (
                <p className="text-xs text-rose-600 font-semibold -mt-2 pr-1">
                  كلمة المرور يجب أن تكون 6 أحرف على الأقل
                </p>
              )}


              {/* تذكرني (عند الدخول فقط) */}
              {tab === 'login' && (
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${
                      rememberMe
                        ? 'bg-blue-900 border-blue-900'
                        : 'border-slate-300 bg-white group-hover:border-blue-400'
                    }`}
                  >
                    {rememberMe && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span
                    onClick={() => setRememberMe(!rememberMe)}
                    className="text-sm text-slate-600 font-medium"
                  >
                    تذكرني (حفظ البريد الإلكتروني)
                  </span>
                </label>
              )}
            </div>

            {/* ── زر الإرسال ── */}
            <button
              type="button"
              onClick={tab === 'login' ? handleSignIn : handleRegister}
              disabled={isLoading}
              className="mt-6 w-full py-4 px-6 rounded-2xl bg-[#0f2d4a] hover:bg-[#163c62] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-base shadow-lg shadow-blue-900/20 flex items-center justify-center gap-3 transition-all cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري المعالجة...</span>
                </>
              ) : tab === 'login' ? (
                <>
                  <span>دخول النظام</span>
                  <ArrowLeft className="w-5 h-5" />
                </>
              ) : (
                <>
                  <span>إنشاء الحساب</span>
                  <UserPlus className="w-5 h-5" />
                </>
              )}
            </button>

            {tab === 'login' && (
              <>
                <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span>أو</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="w-full py-3.5 px-6 rounded-2xl border-2 border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 font-bold text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-sm hover:shadow"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>الدخول عبر Google</span>
                </button>
              </>
            )}

            {/* ── تبديل التبويب ── */}
            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              {tab === 'login' ? (
                <p className="text-xs text-slate-500">
                  لا تمتلك حساباً؟{' '}
                  <button
                    onClick={() => setTab('register')}
                    className="text-blue-900 font-bold hover:underline cursor-pointer"
                  >
                    أنشئ حساباً جديداً
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  تمتلك حساباً بالفعل؟{' '}
                  <button
                    onClick={() => setTab('login')}
                    className="text-blue-900 font-bold hover:underline cursor-pointer"
                  >
                    سجّل دخولك
                  </button>
                </p>
              )}
            </div>

            {/* ── المتابعة برمز المرور الرقمي (PIN) دون بريد إلكتروني ── */}
            {onContinueWithPin && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onContinueWithPin}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-900 border border-slate-200 hover:border-blue-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-blue-800" />
                  <span>المتابعة برمز المرور / PIN (دون بريد إلكتروني)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="w-full border-t border-slate-100 py-3 text-center text-xs text-slate-500 bg-white">
        جميع الحقوق محفوظة © سوق عين بامعبد المركزي — محافظة شبوة
        <span className="mx-2 text-slate-300">|</span>
        مشفّر ومحمي بـ Firebase Authentication
      </footer>

      {/* ── Shake Animation ── */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          15%      { transform: translateX(-8px); }
          30%      { transform: translateX(8px); }
          45%      { transform: translateX(-6px); }
          60%      { transform: translateX(6px); }
          75%      { transform: translateX(-4px); }
          90%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};
