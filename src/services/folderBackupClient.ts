/**
 * Folder Backup Client: Automates saving system backups directly into
 * Google Drive for Desktop mounted folder (e.g. G:\ملفاتي\ابناء مديرية رضوم\معروف)
 */

export interface FolderBackupResult {
  success: boolean;
  savedPath?: string;
  filename?: string;
  sizeBytes?: number;
  folder?: string;
  timestamp?: number;
  message?: string;
  error?: string;
}

export const DEFAULT_GOOGLE_DRIVE_FOLDER = 'G:\\ملفاتي\\ابناء مديرية رضوم\\معروف';

/**
 * Saves a backup snapshot directly into the specified folder
 */
export async function saveBackupToFolder(
  folderPath?: string,
  backupData?: any,
  filename?: string
): Promise<FolderBackupResult> {
  const targetFolder = (folderPath && folderPath.trim()) ? folderPath.trim() : DEFAULT_GOOGLE_DRIVE_FOLDER;

  try {
    const res = await fetch('/api/backup/save-to-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath: targetFolder,
        backupData,
        filename,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل حفظ النسخة الاحتياطية في المجلد');
    }

    return data as FolderBackupResult;
  } catch (err: any) {
    console.error('Error saving backup to folder:', err);
    return {
      success: false,
      error: err?.message || 'تعذر الاتصال بخدمة النسخ الاحتياطي المحلي',
      folder: targetFolder,
    };
  }
}

/**
 * Opens a local folder in Windows File Explorer
 */
export async function openLocalFolder(folderPath?: string): Promise<{ success: boolean; error?: string }> {
  const targetFolder = (folderPath && folderPath.trim()) ? folderPath.trim() : DEFAULT_GOOGLE_DRIVE_FOLDER;

  // Try Electron native API first
  if (typeof window !== 'undefined' && (window as any).electronAPI?.openPath) {
    try {
      await (window as any).electronAPI.openPath(targetFolder);
      return { success: true };
    } catch (e) {
      console.warn('electronAPI.openPath error, falling back to backend API:', e);
    }
  }

  // Fallback to backend API
  try {
    const res = await fetch('/api/open-local-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: targetFolder }),
    });
    const data = await res.json();
    return { success: data.success };
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر فتح المجلد' };
  }
}
