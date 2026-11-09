import nodemailer, { SendMailOptions } from 'nodemailer';
import { localDb } from './localDb';
import { MarketSettings } from '../types';

export interface SmtpConfig {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
}

export interface SendBackupEmailOptions {
  recipientEmail: string;
  backupJson?: string;
  smtpConfig?: SmtpConfig;
  subject?: string;
  triggerReason?: string;
}

/**
 * يترجم أخطاء SMTP والشبكة إلى رسائل عربية واضحة
 */
export function translateSmtpError(error: any): string {
  if (!error) return 'حدث خطأ غير معروف أثناء إرسال البريد';
  const msg = error.message || String(error);
  const code = error.code || '';

  if (code === 'EAUTH' || msg.includes('Invalid login') || msg.includes('Username and Password not accepted')) {
    return 'فشل تسجيل الدخول بخادم البريد (SMTP). يرجى التأكد من البريد الإلكتروني وكلمة مرور التطبيق (App Password).';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo')) {
    return 'تعذر الوصول لخادم البريد الإلكتروني. يرجى التحقق من اتصال الإنترنت وصحة عنوان خادم SMTP.';
  }
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || msg.includes('timeout')) {
    return 'انتهت مهلة الاتصال بخادم البريد أو تم رفض الاتصال. تحقق من المنفذ (Port) وخيار SSL/TLS.';
  }
  if (code === 'EENVELOPE' || msg.includes('No recipients defined')) {
    return 'لم يتم تحديد عنوان بريد إلكتروني صالح للمستلم.';
  }

  return `خطأ في إرسال البريد: ${msg}`;
}

/**
 * تجهيز الناقل (Transporter) لخدمة البريد
 */
async function createTransporter(config?: SmtpConfig) {
  const settings = (await localDb.getSettings()) as (MarketSettings | null);

  const host = (config?.host || settings?.smtpHost || 'smtp.gmail.com').trim();
  const port = Number(config?.port || settings?.smtpPort || 465);
  const user = (config?.user || settings?.smtpUser || '').trim();
  const pass = (config?.pass || settings?.smtpPass || '').trim();
  const secure = config?.secure !== undefined ? config.secure : (settings?.smtpSecure !== undefined ? settings.smtpSecure : port === 465);

  if (!user || !pass) {
    throw new Error('لم يتم ضبط إعدادات بريد الإرسال (SMTP). يرجى إدخال البريد وكلمة مرور التطبيقات (App Password) في الإعدادات أولاً.');
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false, // تجنب مشاكل شهادات SSL المحلية
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    }),
    user,
    host,
    port,
  };
}

/**
 * فحص اتصال SMTP
 */
export async function testSmtpConnection(config?: SmtpConfig): Promise<{ success: boolean; message: string }> {
  try {
    const { transporter } = await createTransporter(config);
    await transporter.verify();
    return {
      success: true,
      message: 'تم التحقق من الاتصال بخادم البريد بنجاح جاهز للإرسال!',
    };
  } catch (error: any) {
    return {
      success: false,
      message: translateSmtpError(error),
    };
  }
}

/**
 * إرسال النسخة الاحتياطية إلى البريد المسجل
 */
export async function sendBackupEmail(options: SendBackupEmailOptions): Promise<{
  success: boolean;
  message: string;
  timestamp: number;
}> {
  const { recipientEmail, smtpConfig } = options;

  if (!recipientEmail || !recipientEmail.includes('@')) {
    throw new Error('عنوان بريد المستلم غير صحيح أو غير مسجل في النظام.');
  }

  // إعداد بيانات النسخة الاحتياطية
  let backupContent = options.backupJson;
  if (!backupContent || backupContent.trim().length === 0) {
    // جلب من قاعدة البيانات المحلية مباشرة
    const allData = {
      exportDate: new Date().toISOString(),
      exportDateFormatted: new Date().toLocaleString('ar-EG'),
      system: 'سوق عين بامعبد المركزي - نظام حراج الأسماك',
      version: '4.0.0 (PostgreSQL + Prisma ORM)',
      settings: await localDb.getSettings(),
      transactions: await localDb.getAllTransactions(5000),
      contacts: await localDb.getAllContacts(),
      fishTypes: await localDb.getAllFishTypes(),
      cashEntries: await localDb.getAllCashEntries(5000),
      cashClosings: await localDb.getAllCashClosings(1000),
    };
    backupContent = JSON.stringify(allData, null, 2);
  }

  // تجهيز الناقل
  const { transporter, user: senderEmail } = await createTransporter(smtpConfig);

  const now = new Date();
  const dateFormatted = now.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // معرف ثابت لجمع الرسائل في خيط محادثة واحد (Single Thread)
  const safeThreadId = `backup-thread-${recipientEmail.replace(/[^a-zA-Z0-9]/g, '')}@harajpos.local`;
  const backupThreadTitle = 'نسخة احتياطية يومية - آخر تحديث';

  const emailSubject = options.subject || `(${backupThreadTitle}) - ${dateFormatted}`;

  const mailOptions: SendMailOptions = {
    from: `"نظام حراج الأسماك" <${senderEmail}>`,
    to: recipientEmail,
    subject: emailSubject,
    // ترويسات الخيط الواحد لتجميع كافة الإيميلات في محادثة واحدة
    headers: {
      'Message-ID': `<${safeThreadId}>`,
      'In-Reply-To': `<${safeThreadId}>`,
      'References': `<${safeThreadId}>`,
      'Thread-Topic': backupThreadTitle,
      'Thread-Index': 'AdBackupHarajPosDaily==',
      'X-Entity-Ref-ID': safeThreadId,
    },
    text: `السلام عليكم ورحمة الله وبركاته،\n\nمرفق لكم النسخة الاحتياطية لبيانات نظام حراج الأسماك.${options.triggerReason ? `\nالسبب: ${options.triggerReason}` : ''}\nتاريخ النسخة: ${dateFormatted} - ${timeFormatted}\nالمستلم: ${recipientEmail}\nاسم الملف المرفق: backup_latest.json\n\nهذه الرسالة جزء من محادثة واحدة تجمع جميع النسخ معاً، بحيث يظهر آخر تحديث دائماً في الأعلى.\nحفظكم الله.`,
    html: `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background-color: #f1f5f9; padding: 24px; color: #0f172a;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          {/* Header */}
          <div style="background: linear-gradient(135deg, #0f2d4a 0%, #1e40af 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800;">سوق عين بامعبد المركزي</h1>
            <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">النسخة الاحتياطية لبيانات النظام</p>
          </div>

          {/* Body */}
          <div style="padding: 24px;">
            <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 14px; font-weight: 700; color: #1e3a8a;">
                📦 تم إرفاق ملف النسخة الاحتياطية بنجاح باسم: <code style="background: #ffffff; padding: 2px 6px; border-radius: 6px; font-family: monospace; color: #0f172a;">backup_latest.json</code>
              </p>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
              ${options.triggerReason ? `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0369a1; font-weight: 700;">نوع الإرسال:</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0c4a6e; font-weight: 800;">${options.triggerReason}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">تاريخ النسخة:</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700;">${dateFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">وقت الإصدار:</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700;">${timeFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #64748b; font-weight: 600;">البريد المستلم:</td>
                <td style="padding: 10px; border-bottom: 1px solid #f1f5f9; color: #0f172a; font-weight: 700; direction: ltr; text-align: right;">${recipientEmail}</td>
              </tr>
              <tr>
                <td style="padding: 10px; color: #64748b; font-weight: 600;">نوع النسخة:</td>
                <td style="padding: 10px; color: #16a34a; font-weight: 700;">شاملة لكافة الفواتير والصندوق والعملاء والأسماك</td>
              </tr>
            </table>

            <div style="background-color: #f8fafc; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.6;">
              💡 <strong>ملاحظة هامة:</strong> يتم إرسال هذه الرسائل بنفس العنوان المعياري لتُجمع في خيط محادثة واحد (Single Thread) دائماً، حتى يسهل الرجوع لأحدث نسخة من بريدك دون فوضى أو تراكم الرسائل.
            </div>
          </div>

          {/* Footer */}
          <div style="background: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
            نظام حراج الأسماك ونقاط البيع • محافظة شبوة
          </div>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'backup_latest.json',
        content: backupContent,
        contentType: 'application/json',
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);

    // تحديث تاريخ آخر إرسال في الإعدادات المحلية
    const currentSettings = await localDb.getSettings();
    if (currentSettings) {
      currentSettings.lastEmailBackupAt = Date.now();
      const pad = (n: number) => String(n).padStart(2, '0');
      currentSettings.lastEmailBackupDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      await localDb.saveSettings(currentSettings);
    }

    return {
      success: true,
      message: `تم إرسال النسخة الاحتياطية بنجاح إلى البريد: ${recipientEmail}`,
      timestamp: Date.now(),
    };
  } catch (error: any) {
    throw new Error(translateSmtpError(error));
  }
}
