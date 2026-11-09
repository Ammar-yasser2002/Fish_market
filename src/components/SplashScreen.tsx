import React, { useEffect, useState, useRef } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [fadeOut, setFadeOut] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    // عرض الشعار لمدة ثانيتين كاملتين بشكل ثابت قبل بدء الاختفاء التدريجي
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 2000);

    // إنهاء شاشة البداية بالكامل بعد اكتمال تأثير الاختفاء التدريجي (2.35 ثانية)
    const finishTimer = setTimeout(() => {
      onFinishRef.current();
    }, 2350);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white transition-opacity duration-300 ease-out select-none"
      style={{ opacity: fadeOut ? 0 : 1 }}
    >
      <div className="flex flex-col items-center gap-6 animate-[splashIn_0.35s_ease-out]">
        {/* Logo - حجم أكبر وأوضح للشعار */}
        <div className="w-56 h-48 sm:w-72 sm:h-60 rounded-3xl bg-white p-4 shadow-2xl border border-slate-100 flex items-center justify-center">
          <img
            src="/logo.png"
            alt="شعار سوق عين بامعبد المركزي"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Market Name */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black text-[#0f2d4a] tracking-tight">
            سوق عين بامعبد المركزي
          </h1>
          <p className="text-sm text-slate-500 font-semibold">
            نظام إدارة ومبيعات الحراج
          </p>
        </div>

        {/* Loading dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-900 animate-bounce"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes splashIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};
