# نظام مزامنة وتحديث كافة النسخ (Build & Deployment Sync)

عند إجراء أي تعديلات برمجية في كود المشروع:
1. يجب دائماً تنفيذ أمر البناء `npm run build`.
2. تم تفعيل خطاف تلقائي `postbuild` يقوم بنسخ كافة ملفات `dist` المحدثة إلى:
   - مجلد البرنامج المثبت على جهاز المستخدم: `%LOCALAPPDATA%\Programs\fishe-haraj-pos\resources\app.asar.unpacked\dist`
   - مجلد التشغيل المباشر: `release\win-unpacked\resources\app.asar.unpacked\dist`
   - مسح ذاكرة التخزين المؤقت (Chromium/Code Cache) حتى تظهر التحديثات فوراً بدون الحاجة لإعادة التثبيت.
3. عند طلب تجهيز النسخة للأجهزة الأخرى أو حزم التثبيت، يتم تشغيل:
   `npm run electron:dist`
   وهذا يُحدث ملف التثبيت الرسمي `release/نظام حراج الأسماك Setup 1.0.0.exe` والنسخة المحمولة `release/نظام حراج الأسماك 1.0.0.exe`.
