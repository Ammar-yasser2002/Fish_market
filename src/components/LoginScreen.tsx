import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Eye,
  EyeOff,
  Delete,
  AlertCircle,
  Clock,
  Calendar,
  CheckCircle2,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  Store,
  UserCircle2,
  Loader2,
  LogOut,
  Mail,
} from 'lucide-react';
import { MarketSettings } from '../types';
import { formatGregorianDate, formatGregorianTime } from '../utils/calculations';
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  settings: MarketSettings;
  onLoginSuccess: () => void;
  currentUserEmail?: string | null;
  onFirebaseLogout?: () => void;
  onSwitchToFirebase?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  settings,
  onLoginSuccess,
  currentUserEmail,
  onFirebaseLogout,
  onSwitchToFirebase,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const [pin, setPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'تعذر تسجيل الدخول عبر Google');
      triggerShake();
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // صورة المستخدم أو الحرف الأول من البريد كبديل
  const photoURL = user?.photoURL;
  const emailInitial = (currentUserEmail || user?.email || '?')[0].toUpperCase();

  // Live clock
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

  // Autofocus input on load
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Validate and submit PIN
  const handleVerifyPin = (pinToTest?: string) => {
    const code = pinToTest !== undefined ? pinToTest : pin;
    const correctPin = settings.systemPin || '1234';

    if (!code || code.trim() === '') {
      setErrorMsg('يرجى إدخال رمز المرور الرقمي');
      triggerShake();
      return;
    }

    if (code === correctPin) {
      setErrorMsg('');
      onLoginSuccess();
    } else {
      setErrorMsg('رمز المرور غير صحيح! حاول مرة أخرى');
      triggerShake();
      setPin('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  // On keypad button click
  const handleKeypadPress = (digit: string) => {
    setErrorMsg('');
    if (pin.length < 8) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4 && nextPin === (settings.systemPin || '1234')) {
        setTimeout(() => {
          handleVerifyPin(nextPin);
        }, 150);
      }
    }
  };

  const handleBackspace = () => {
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setErrorMsg('');
    setPin('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerifyPin();
    }
  };

  return (
    <div
      dir="rtl"
      className="h-screen max-h-screen w-full bg-white text-slate-800 flex flex-col font-['Cairo',system-ui,sans-serif] select-none overflow-y-auto lg:overflow-hidden justify-between"
    >
      {/* Upper Subtle Bar with Clock & Date */}
      <div className="w-full border-b border-slate-100 px-6 py-2 flex items-center justify-between text-xs text-slate-500 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-blue-900" />
          <span className="font-semibold text-slate-700">
            {settings.marketName || 'سوق عين بامعبد المركزي'}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">نظام إدارة ومبيعات الحراج</span>
        </div>

        <div className="flex items-center gap-4 font-mono">
          <div className="flex items-center gap-1.5 text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-blue-800" />
            <span>{currentDate}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-700 font-bold bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-blue-800 animate-pulse" />
            <span>{currentTime}</span>
          </div>
        </div>
      </div>

      {/* Main Split Screen Container */}
      <div className="flex-1 flex flex-col lg:flex-row items-center justify-center px-4 py-2 sm:px-6 sm:py-3 lg:px-8 lg:py-2 gap-5 lg:gap-10 max-w-7xl mx-auto w-full min-h-0">
        {/* ========================================================= */}
        {/* SECTION 1: LOGO & MARKET IDENTITY (قسم الشعار والهوية) */}
        {/* ========================================================= */}
        <div className="w-full lg:w-1/2 flex flex-col items-center text-center p-4 sm:p-6 lg:p-7 rounded-3xl bg-linear-to-b from-blue-50/50 via-white to-sky-50/30 border border-blue-100/80 shadow-sm relative overflow-hidden">
          {/* Subtle Background Rings & Accents */}
          <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-100/40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-sky-100/50 blur-3xl pointer-events-none" />

          {/* Logo Container with White Backing & Elegant Shadow (حجم أكبر وأوضح للشعار) */}
          <div className="relative mb-3.5 group">
            <div className="w-60 h-48 sm:w-72 sm:h-56 lg:w-80 lg:h-60 rounded-3xl bg-white p-3.5 shadow-xl border-4 border-white ring-8 ring-blue-50/70 flex items-center justify-center transition-all duration-500 transform group-hover:scale-102">
              <img
                src="/logo.png"
                alt="شعار سوق عين بامعبد المركزي"
                className="w-full h-full object-contain drop-shadow-xs"
              />
            </div>
            <div className="absolute -bottom-2 right-1/2 translate-x-1/2 bg-blue-900 text-white text-[11px] font-bold px-3.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border-2 border-white">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>النظام المعتمد الرسمي</span>
            </div>
          </div>

          {/* Typography Titles */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#0f2d4a] tracking-tight mb-1">
            سوق عين بامعبد المركزي
          </h1>
          <h2 className="text-sm sm:text-base font-bold text-blue-800/90 mb-2">
            للأسماك الطازجة والخضروات والفواكة
          </h2>

          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200/70 text-blue-950 text-xs font-semibold px-3 py-1 rounded-xl mb-3 shadow-2xs">
            <span>محافظة شبوة</span>
            <span className="text-blue-300">•</span>
            <span>مديرية رضوم</span>
            <span className="text-blue-300">•</span>
            <span>عين بامعبد</span>
          </div>

          <p className="text-slate-500 text-xs max-w-md leading-relaxed hidden sm:block mb-3">
            منظومة إلكترونية متكاملة لإدارة شروات الحراج، كشوفات الصيادين، حسابات المشترين، ومتابعة
            صندوق النقدية اليومي بكل دقة وسرعة.
          </p>

          <div className="mt-2 pt-3 border-t border-slate-100 w-full flex items-center justify-center gap-6 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              قاعدة بيانات محلية سريعة
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              طباعة فورية للإيصالات
            </span>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 2: NUMERIC PIN LOGIN (قسم تسجيل الدخول برمز رقمي) */}
        {/* ========================================================= */}
        <div className="w-full lg:w-1/2 max-w-md flex flex-col items-center">
          <div
            className={`w-full bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-xl transition-transform ${
              isShaking ? 'animate-[shake_0.5s_ease-in-out]' : ''
            }`}
          >
            {/* Header / Lock Icon */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">تسجيل الدخول</h3>
                  <p className="text-[11px] text-slate-500">أدخل رمز المرور الرقمي للبدء</p>
                </div>
              </div>

              <div className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                أرقام فقط
              </div>
            </div>

            {/* Current Account Badge */}
            {(currentUserEmail || user?.email) && (
              <div className="mb-3 p-2 rounded-xl bg-blue-50/80 border border-blue-200 flex items-center gap-2.5 animate-in fade-in">
                {/* صورة المستخدم أو حرف بديل */}
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt="صورة المستخدم"
                    className="w-8 h-8 rounded-full object-cover shrink-0 border-2 border-blue-200 shadow-sm"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center shrink-0 border-2 border-blue-300 shadow-sm">
                    <span className="text-white font-black text-xs">{emailInitial}</span>
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] text-slate-500 font-semibold">حساب المستخدم</span>
                  <span className="text-xs font-bold text-blue-900 truncate" dir="ltr">
                    {currentUserEmail || user?.email}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] text-emerald-700 font-bold">متصل</span>
                  </span>
                  {onFirebaseLogout && (
                    <button
                      type="button"
                      onClick={onFirebaseLogout}
                      className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="تسجيل الخروج من الحساب"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* PIN Input & Visual Indicators */}
            <div className="space-y-2.5 mb-4">
              {/* Visual Circles / Dots */}
              <div className="flex items-center justify-center gap-2.5 py-0.5">
                {[0, 1, 2, 3].map((index) => {
                  const isFilled = pin.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-200 border-2 ${
                        isFilled
                          ? 'bg-blue-900 border-blue-900 scale-110 ring-4 ring-blue-100'
                          : 'bg-slate-100 border-slate-300'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Real Input with Show/Hide toggle */}
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    if (cleaned.length <= 8) {
                      setPin(cleaned);
                      setErrorMsg('');
                      if (cleaned.length === 4 && cleaned === (settings.systemPin || '1234')) {
                        setTimeout(() => handleVerifyPin(cleaned), 150);
                      }
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="• • • •"
                  className="w-full text-center text-xl font-mono tracking-widest py-2.5 px-10 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-blue-900 focus:bg-white focus:outline-none transition-all text-slate-800 placeholder:text-slate-300 shadow-inner"
                  autoComplete="off"
                />

                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                  title={showPin ? 'إخفاء الرمز' : 'إظهار الرمز'}
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Touch / Screen Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num)}
                  className="h-11 sm:h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-900 active:text-white border border-slate-200/80 text-lg font-mono font-bold text-slate-800 hover:text-blue-900 hover:border-blue-300 transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                >
                  {num}
                </button>
              ))}

              {/* Bottom Keypad Row: Clear, 0, Backspace */}
              <button
                type="button"
                onClick={handleClear}
                className="h-11 sm:h-12 rounded-xl bg-slate-100/80 hover:bg-rose-50 active:bg-rose-100 border border-slate-200 text-xs font-bold text-slate-600 hover:text-rose-600 transition-all flex items-center justify-center cursor-pointer"
                title="مسح الكل"
              >
                مسح الكل
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                className="h-11 sm:h-12 rounded-xl bg-slate-50 hover:bg-blue-50 active:bg-blue-900 active:text-white border border-slate-200/80 text-lg font-mono font-bold text-slate-800 hover:text-blue-900 hover:border-blue-300 transition-all shadow-2xs flex items-center justify-center cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-11 sm:h-12 rounded-xl bg-slate-100/80 hover:bg-amber-50 active:bg-amber-100 border border-slate-200 text-slate-600 hover:text-amber-700 transition-all flex items-center justify-center cursor-pointer"
                title="تراجع"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => handleVerifyPin()}
              className="w-full py-3 px-5 rounded-xl bg-[#0f2d4a] hover:bg-[#163c62] active:scale-[0.99] text-white font-bold text-sm shadow-md shadow-blue-900/20 flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <span>دخول النظام</span>
              <ArrowLeft className="w-4 h-4" />
            </button>



            {/* خيارات تسجيل الدخول السحابي (Google / البريد) إن لم يكن مسجلاً */}
            {!user && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading}
                  className="w-full py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
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
                  )}
                  <span>تسجيل الدخول السريع عبر Google</span>
                </button>

                {onSwitchToFirebase && (
                  <button
                    type="button"
                    onClick={onSwitchToFirebase}
                    className="w-full py-1.5 px-2 text-[11px] font-bold text-blue-900 hover:text-blue-700 hover:underline flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Mail className="w-3 h-3" />
                    <span>تسجيل الدخول أو إنشاء حساب بالبريد الإلكتروني</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <footer className="w-full border-t border-slate-100 py-2 text-center text-[11px] text-slate-500 bg-white shrink-0">
        جميع الحقوق محفوظة © سوق عين بامعبد المركزي - محافظة شبوة
      </footer>
    </div>
  );
};
