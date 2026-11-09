import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { localDb } from './localDb';
import { testDatabaseConnection } from './prisma';

export const apiRouter = Router();

// 1. Health & Database Status (PostgreSQL via Prisma ORM)
apiRouter.get('/health', async (req: Request, res: Response) => {
  try {
    const connCheck = await testDatabaseConnection();
    const stats = await localDb.getStats();
    res.json({
      status: connCheck.ok ? 'online' : 'database_disconnected',
      timestamp: Date.now(),
      server: 'Fish Market POS Backend Server (Node/Express)',
      database: {
        type: 'PostgreSQL Database Engine (Prisma ORM)',
        file: stats.dbPath,
        fileSize: stats.fileSizeFormatted,
        journalMode: stats.mode,
        status: connCheck.ok ? 'active_postgresql_ready' : 'connection_failed',
        isLocal: false,
        error: connCheck.error || null,
        counts: stats.counts,
        features: [
          'قاعدة بيانات PostgreSQL قوية وموزعة',
          'مدارة عبر Prisma ORM بمخطط بيانات موثق Type-Safe',
          'دعم كامل للربط الشبكي وتعدد المستخدمين',
          'معاملات مالية فورية متوافقة مع معايير ACID',
        ],
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err?.message || 'Database error' });
  }
});

// 2. System database info
apiRouter.get('/system-info', async (req: Request, res: Response) => {
  try {
    const stats = await localDb.getStats();
    res.json({
      appName: 'نظام حراج الأسماك ونقاط البيع السريعة',
      version: '4.0.0 (PostgreSQL + Prisma ORM)',
      architecture: {
        backend: 'Express.js on Node.js',
        frontend: 'React 19 + Vite + Tailwind CSS',
        database: 'PostgreSQL (Prisma ORM Client)',
        storageStrategy: 'PostgreSQL Relational DB + Prisma Connection Pooling',
        dbFilePath: stats.dbPath,
        recordsCount: stats.counts,
      },
      security: {
        dataStorage: 'قاعدة بيانات PostgreSQL مركزية وآمنة',
        dataIntegrity: 'Mathematical checks on buyer +2% and seller -3%',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 3. Transactions Endpoints
apiRouter.get('/transactions', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 2000;
    const list = await localDb.getAllTransactions(limit);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/transactions', async (req: Request, res: Response) => {
  try {
    const tx = req.body;
    if (!tx || !tx.id) {
      return res.status(400).json({ error: 'Missing transaction id or body' });
    }
    await localDb.saveTransaction(tx);
    res.json({ success: true, transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await localDb.deleteTransaction(id);
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 4. Contacts Endpoints
apiRouter.get('/contacts', async (req: Request, res: Response) => {
  try {
    const list = await localDb.getAllContacts();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/contacts', async (req: Request, res: Response) => {
  try {
    const contact = req.body;
    if (!contact || !contact.id) {
      return res.status(400).json({ error: 'Missing contact id or body' });
    }
    await localDb.saveContact(contact);
    res.json({ success: true, contact });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await localDb.deleteContact(id);
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 5. Fish Types Endpoints
apiRouter.get('/fish-types', async (req: Request, res: Response) => {
  try {
    const list = await localDb.getAllFishTypes();
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/fish-types', async (req: Request, res: Response) => {
  try {
    const fish = req.body;
    if (!fish || !fish.id) {
      return res.status(400).json({ error: 'Missing fish id or body' });
    }
    await localDb.saveFishType(fish);
    res.json({ success: true, fishType: fish });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/fish-types/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await localDb.deleteFishType(id);
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 6. Cash Entries Endpoints
apiRouter.get('/cash-entries', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 2000;
    const list = await localDb.getAllCashEntries(limit);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/cash-entries', async (req: Request, res: Response) => {
  try {
    const entry = req.body;
    if (!entry || !entry.id) {
      return res.status(400).json({ error: 'Missing entry id or body' });
    }
    await localDb.saveCashEntry(entry);
    res.json({ success: true, entry });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/cash-entries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await localDb.deleteCashEntry(id);
    res.json({ success: true, deletedId: id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 7. Cash Closings Endpoints
apiRouter.get('/cash-closings', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 1000;
    const list = await localDb.getAllCashClosings(limit);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/cash-closings', async (req: Request, res: Response) => {
  try {
    const closing = req.body;
    if (!closing || !closing.id) {
      return res.status(400).json({ error: 'Missing closing id or body' });
    }
    await localDb.saveCashClosing(closing);
    res.json({ success: true, closing });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 8. Settings Endpoints
apiRouter.get('/settings', async (req: Request, res: Response) => {
  try {
    const settings = await localDb.getSettings();
    res.json(settings || {});
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const settings = req.body;
    await localDb.saveSettings(settings);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 9. Bulk sync all entities into PostgreSQL
apiRouter.post('/sync-all', async (req: Request, res: Response) => {
  try {
    const result = await localDb.syncAllData(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 9.1 Smart Merge Backup (دمج النسخ الاحتياطي بدون مسح وبدون تكرار)
apiRouter.post('/backup/smart-merge', async (req: Request, res: Response) => {
  try {
    const result = await localDb.smartMergeData(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Smart merge failed' });
  }
});

// 10. Clear database tables
apiRouter.post('/clear-all', async (req: Request, res: Response) => {
  try {
    const result = await localDb.clearAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 11. Financial calculation validation endpoint
apiRouter.post('/calculate-deal', (req: Request, res: Response) => {
  const { grossAmount, buyerTaxRate = 0.02, sellerTaxRate = 0.03 } = req.body;
  const gross = Number(grossAmount) || 0;
  const buyerTax = Math.round(gross * buyerTaxRate * 100) / 100;
  const totalBuyer = Math.round((gross + buyerTax) * 100) / 100;

  const sellerTax = Math.round(gross * sellerTaxRate * 100) / 100;
  const netSeller = Math.round((gross - sellerTax) * 100) / 100;

  const harajProfit = Math.round((buyerTax + sellerTax) * 100) / 100;

  res.json({
    grossAmount: gross,
    buyer: {
      taxRate: buyerTaxRate,
      taxAmount: buyerTax,
      totalToPay: totalBuyer,
    },
    seller: {
      taxRate: sellerTaxRate,
      deductionAmount: sellerTax,
      netToReceive: netSeller,
    },
    associationProfit: {
      rate: buyerTaxRate + sellerTaxRate,
      profitAmount: harajProfit,
    },
  });
});

// 12. Email Backup Endpoints
apiRouter.post('/backup/send-email', async (req: Request, res: Response) => {
  try {
    const { recipientEmail, backupJson, smtpConfig, subject, triggerReason } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ error: 'البريد الإلكتروني للمستلم مطلوب' });
    }
    const { sendBackupEmail } = await import('./emailBackupService');
    const result = await sendBackupEmail({ recipientEmail, backupJson, smtpConfig, subject, triggerReason });
    res.json(result);
  } catch (err: any) {
    console.error('Email backup error:', err);
    res.status(500).json({ error: err?.message || 'فشل إرسال النسخة الاحتياطية' });
  }
});

apiRouter.post('/backup/test-smtp', async (req: Request, res: Response) => {
  try {
    const { testSmtpConnection } = await import('./emailBackupService');
    const result = await testSmtpConnection(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'فشل فحص الاتصال بالبريد' });
  }
});

// 13. Automatic Folder Backup (Google Drive for Desktop / Local disk)
apiRouter.post('/backup/save-to-folder', async (req: Request, res: Response) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    let { folderPath, backupData, filename } = req.body;

    if (!folderPath || typeof folderPath !== 'string' || !folderPath.trim()) {
      const settings = await localDb.getSettings();
      folderPath = settings?.googleDriveFolderUrl || 'G:\\ملفاتي\\ابناء مديرية رضوم\\معروف';
    }

    folderPath = folderPath.trim();

    // If it's a web URL, inform the user
    if (folderPath.startsWith('http://') || folderPath.startsWith('https://')) {
      return res.status(400).json({
        error: 'المسار المحدد هو رابط ويب خارجي وليس مجلداً على جهاز الكمبيوتر. يرجى إدخال مسار المجلد مثل: G:\\ملفاتي\\ابناء مديرية رضوم\\معروف',
      });
    }

    // Ensure folder exists or create it
    if (!fs.existsSync(folderPath)) {
      try {
        fs.mkdirSync(folderPath, { recursive: true });
      } catch (mkdirErr: any) {
        return res.status(400).json({
          error: `تعذر الوصول أو إنشاء المجلد على المسار (${folderPath}). يرجى التأكد من تشغيل تطبيق Google Drive وتوصيل القرص G:\\`,
        });
      }
    }

    // Compile full backup payload if not provided
    let payload = backupData;
    if (!payload) {
      const txs = await localDb.getAllTransactions(10000);
      const contacts = await localDb.getAllContacts();
      const fishTypes = await localDb.getAllFishTypes();
      const cashEntries = await localDb.getAllCashEntries(10000);
      const cashClosings = await localDb.getAllCashClosings(1000);
      const settings = await localDb.getSettings();

      payload = {
        exportDate: new Date().toISOString(),
        appName: 'نظام حراج الأسماك ونقاط البيع السريعة',
        version: '4.0.0',
        transactions: txs,
        contacts,
        fishTypes,
        cashEntries,
        cashClosings,
        settings,
      };
    }

    const jsonString = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);

    if (!jsonString || jsonString.trim().length < 20) {
      return res.status(400).json({ error: 'محتوى النسخة الاحتياطية فارغ أو غير صالح' });
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timePart = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const actualFilename = filename || `haraj_backup_${datePart}_${timePart}.json`;
    const fullPath = path.join(folderPath, actualFilename);

    fs.writeFileSync(fullPath, jsonString, 'utf-8');

    // Also update predictable "haraj_latest_backup.json"
    try {
      const latestPath = path.join(folderPath, 'haraj_latest_backup.json');
      fs.writeFileSync(latestPath, jsonString, 'utf-8');
    } catch {}

    // تنظيف ذكي للنسخ الاحتياطية القديمة لحماية القرص مع الحفاظ التام على أمان البيانات:
    // 1. لا يتم المساس إطلاقاً بملف haraj_latest_backup.json
    // 2. الاحتفاظ التام وبشكل قطعي بآخر 15 نسخة حديثة
    // 3. الاحتفاظ بنسخة يومية لكل الأيام السابقة (أرشيف يومي)
    // 4. حذف النسخ المكررة الزائدة فقط، وتطهير أي ملفات فارغة 0 بايت
    let prunedCount = 0;
    try {
      const allFiles = fs.readdirSync(folderPath);
      const backupFiles = allFiles
        .filter((f) => f.startsWith('haraj_backup_') && f.endsWith('.json'))
        .map((f) => {
          const p = path.join(folderPath, f);
          try {
            const stat = fs.statSync(p);
            if (stat.size === 0) {
              try { fs.unlinkSync(p); } catch {}
              return null;
            }
            return { name: f, fullPath: p, mtime: stat.mtimeMs };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as { name: string; fullPath: string; mtime: number }[];

      // ترتيب من الأحدث إلى الأقدم
      backupFiles.sort((a, b) => b.mtime - a.mtime);

      const MIN_RETAINED = 15;
      if (backupFiles.length > MIN_RETAINED) {
        const seenDays = new Set<string>();
        const toDelete: string[] = [];

        backupFiles.forEach((file, index) => {
          // أحدث 15 نسخة محفوظة بشكل دائم ولا تُمس
          if (index < MIN_RETAINED) return;

          // ما قبل النسخ الـ 15، نحتفظ بنسخة واحدة فقط لكل يوم تاريخي
          const match = file.name.match(/haraj_backup_(\d{4}-\d{2}-\d{2})/);
          const dayKey = match ? match[1] : '';

          if (dayKey && !seenDays.has(dayKey)) {
            seenDays.add(dayKey);
          } else {
            toDelete.push(file.fullPath);
          }
        });

        // صمام أمان صارم: التأكد من بقاء 15 ملفاً على الأقل دائماً
        if (backupFiles.length - toDelete.length >= MIN_RETAINED) {
          toDelete.forEach((filePath) => {
            try {
              fs.unlinkSync(filePath);
              prunedCount++;
            } catch (delErr) {
              console.warn('Backup file unlink error:', delErr);
            }
          });
        }
      }
    } catch (pruneErr) {
      console.warn('Smart backup pruning warning:', pruneErr);
    }

    const fileStat = fs.statSync(fullPath);

    res.json({
      success: true,
      savedPath: fullPath,
      filename: actualFilename,
      sizeBytes: fileStat.size,
      folder: folderPath,
      timestamp: Date.now(),
      message: `تم حفظ وتنزيل نسخة النظام الأصلية والفعلية بنجاح في مجلد: ${folderPath}`,
    });
  } catch (err: any) {
    console.error('Save to folder error:', err);
    res.status(500).json({ error: err?.message || 'فشل حفظ النسخة الاحتياطية في المجلد' });
  }
});

// 14. Open Local Folder in Windows File Explorer
apiRouter.post('/open-local-folder', async (req: Request, res: Response) => {
  try {
    const { exec } = await import('child_process');
    let { folderPath } = req.body;

    if (!folderPath || typeof folderPath !== 'string') {
      const settings = await localDb.getSettings();
      folderPath = settings?.googleDriveFolderUrl || 'G:\\ملفاتي\\ابناء مديرية رضوم\\معروف';
    }

    folderPath = folderPath.trim();

    if (folderPath.startsWith('http://') || folderPath.startsWith('https://')) {
      return res.json({ success: true, isUrl: true, url: folderPath });
    }

    exec(`explorer "${folderPath}"`, (err) => {
      if (err) {
        console.warn('Could not open folder via explorer:', err);
      }
    });

    res.json({ success: true, folderPath });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'تعذر فتح المجلد' });
  }
});

// 15. Save Export File Directly to Windows Desktop
apiRouter.post('/save-to-desktop', async (req: Request, res: Response) => {
  try {
    const { filename, content, base64 } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'اسم الملف مطلوب' });
    }

    const desktopPath = path.join(process.env.USERPROFILE || '', 'Desktop');
    if (!fs.existsSync(desktopPath)) {
      return res.status(400).json({ error: 'مجلد سطح المكتب غير موجود' });
    }

    const safeFilename = filename.replace(/[\\/:*?"<>|]/g, '_');
    const fullPath = path.join(desktopPath, safeFilename);

    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(fullPath, buffer);
    } else {
      fs.writeFileSync(fullPath, content || '', 'utf-8');
    }

    res.json({
      success: true,
      savedPath: fullPath,
      filename: safeFilename,
      message: `تم حفظ الملف بنجاح على سطح المكتب: ${safeFilename}`,
    });
  } catch (err: any) {
    console.error('Save to desktop error:', err);
    res.status(500).json({ error: err?.message || 'فشل حفظ الملف على سطح المكتب' });
  }
});
