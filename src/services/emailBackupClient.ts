/**
 * emailBackupClient.ts
 * عميل إرسال النسخة الاحتياطية عبر البريد الإلكتروني والجدولة التلقائية
 */

import { MarketSettings } from '../types';

export interface SendEmailBackupResponse {
  success: boolean;
  message: string;
  timestamp?: number;
}

const STORAGE_KEYS = {
  LAST_BACKUP_TIME: 'last_daily_email_backup_time',
  LAST_BACKUP_DATE: 'last_daily_email_backup_date',
};

export function hasSmtpCredentials(config?: { user?: string; pass?: string; smtpUser?: string; smtpPass?: string }): boolean {
  const user = ((config?.user ?? config?.smtpUser) || '').trim();
  const pass = ((config?.pass ?? config?.smtpPass) || '').trim();
  return Boolean(user && pass);
}

export function getMissingSmtpConfigMessage(): string {
  return 'لم يتم ضبط إعدادات بريد الإرسال (SMTP). يرجى إدخال البريد وكلمة مرور التطبيقات (App Password) في الإعدادات أولاً.';
}

/**
 * إرسال يدوي للنسخة الاحتياطية إلى البريد الإلكتروني
 */
export async function sendBackupEmailNow(
  recipientEmail: string,
  backupJson?: string,
  smtpConfig?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    secure?: boolean;
  },
  extraOptions?: {
    subject?: string;
    triggerReason?: string;
  }
): Promise<SendEmailBackupResponse> {
  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new Error('يرجى التأكد من تسجيل بريد إلكتروني صالح في النظام');
  }

  if (smtpConfig && (!smtpConfig.user?.trim() || !smtpConfig.pass?.trim())) {
    throw new Error(getMissingSmtpConfigMessage());
  }

  const response = await fetch('/api/backup/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipientEmail,
      backupJson,
      smtpConfig,
      subject: extraOptions?.subject,
      triggerReason: extraOptions?.triggerReason,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'تعذر إرسال النسخة الاحتياطية بالبريد');
  }

  // حفظ تاريخ آخر إرسال ناجح محلياً
  try {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_TIME, String(now));
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    localStorage.setItem(STORAGE_KEYS.LAST_BACKUP_DATE, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  } catch {}

  return data;
}

/**
 * اختبار الاتصال بخادم البريد (SMTP)
 */
export async function testSmtpSettings(config: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
}): Promise<{ success: boolean; message: string }> {
  const response = await fetch('/api/backup/test-smtp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'فشل فحص الاتصال بخادم البريد');
  }
  return data;
}

/**
 * الجدولة التلقائية: فحص تاريخ آخر إرسال، وإذا مر 24 ساعة يتم التنفيذ في الخلفية
 * يعمل بدون إيقاف واجهة المستخدم ويتعامل مع انقطاع النت بمرونة تامة.
 */
export async function checkAndTriggerAutoDailyBackup(
  recipientEmail: string | null | undefined,
  settings: MarketSettings,
  getBackupJson: () => string
): Promise<void> {
  // 1. شروط مبدئية: وجود بريد، تفعيل الميزة، ووجود بيانات SMTP اللازمة
  if (!recipientEmail || !recipientEmail.includes('@')) return;
  if (settings.emailBackupEnabled === false) return;
  if (!navigator.onLine) return;
  if (!hasSmtpCredentials({ user: settings.smtpUser, pass: settings.smtpPass })) {
    console.warn('[AutoEmailBackup] تم إيقاف الإرسال التلقائي لأن بيانات SMTP غير مسجلة. يرجى إدخال البريد وكلمة مرور التطبيق في الإعدادات.');
    return;
  }

  // 2. التحقق من انقضاء المدة المحددة حسب دورية النسخ (يومي / أسبوعي / شهري)
  const frequency = settings.backupFrequency || 'daily';
  const intervalMs =
    frequency === 'monthly'
      ? 30 * 24 * 60 * 60 * 1000
      : frequency === 'weekly'
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  const lastBackupStr = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP_TIME);
  const now = Date.now();

  if (lastBackupStr) {
    const lastTimestamp = parseInt(lastBackupStr, 10);
    if (!isNaN(lastTimestamp) && now - lastTimestamp < intervalMs) {
      // لم تنقضِ المدة المحددة بعد
      return;
    }
  }

  // 3. تأخير طفيف (5 ثوانٍ بعد فتح البرنامج) لضمان عدم إثقال تحميل الصفحة
  setTimeout(async () => {
    try {
      const freqLabel = frequency === 'monthly' ? 'الشهرية' : frequency === 'weekly' ? 'الأسبوعية' : 'اليومية';
      console.log(`[AutoEmailBackup] بدء الإرسال التلقائي للنسخة الاحتياطية (${freqLabel}) في الخلفية...`);
      const json = getBackupJson();
      const res = await sendBackupEmailNow(recipientEmail, json, {
        host: settings.smtpHost,
        port: settings.smtpPort,
        user: settings.smtpUser,
        pass: settings.smtpPass,
        secure: settings.smtpSecure,
      });
      console.log('[AutoEmailBackup] ✓ تم إرسال النسخة الاحتياطية التلقائية بنجاح:', res.message);
    } catch (err: any) {
      // التقاط الخطأ في الخلفية دون تعطيل واجهة المستخدم أو إظهار نوافذ منبثقة مزعجة
      console.warn('[AutoEmailBackup] تعذر إرسال النسخة التلقائية في الخلفية:', err?.message || err);
    }
  }, 5000);
}
