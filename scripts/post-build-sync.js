import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sourceDist = path.join(projectRoot, 'dist');
let appVersion = '1.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  if (pkg.version) appVersion = pkg.version;
} catch {}

const sourceRelease = path.join(projectRoot, 'release');
const sourceUnpacked = path.join(sourceRelease, 'win-unpacked');
const sourceAsar = path.join(sourceUnpacked, 'resources', 'app.asar');
const sourcePortableExe = path.join(sourceRelease, `نظام حراج الأسماك ${appVersion}.exe`);
const sourceSetupExe = path.join(sourceRelease, `نظام حراج الأسماك Setup ${appVersion}.exe`);
const srcPrismaClient = path.join(projectRoot, 'node_modules', '@prisma');
const srcDotPrisma = path.join(projectRoot, 'node_modules', '.prisma');
const srcEnv = path.join(projectRoot, '.env');

console.log('[post-build-sync] 🚀 Starting complete synchronization across all copies and environments...');

// ─── 0. مزامنة main.cjs في الجذر مع electron/main.cjs ───
try {
  const electronMain = path.join(projectRoot, 'electron', 'main.cjs');
  const rootMain = path.join(projectRoot, 'main.cjs');
  if (fs.existsSync(electronMain)) {
    fs.copyFileSync(electronMain, rootMain);
    console.log('[post-build-sync] ✓ Synced electron/main.cjs to root main.cjs');
  }
} catch (e) {
  console.warn('[post-build-sync] Could not sync root main.cjs:', e.message);
}

// ─── 0.1 ترقيع app.asar لإخفاء نوافذ الطباعة الخلفية ومنع أي نافذة بيضاء ثانية ───
try {
  const { patchAsarFile } = await import('./patch-asar-workers.cjs');
  if (fs.existsSync(sourceAsar)) {
    patchAsarFile(sourceAsar);
  }
} catch (e) {
  console.warn('[post-build-sync] Could not patch sourceAsar:', e.message);
}

if (!fs.existsSync(sourceDist)) {
  console.log('[post-build-sync] ⚠️ dist folder not found, skipping sync.');
  process.exit(0);
}

// ─── 1. إيقاف أي عملية سابقة مفتوحة لتجنب قفل الملفات في Windows ───
try {
  execSync('powershell -NoProfile -Command "Get-Process | Where-Object { $_.Name -like \'*حراج*\' -or $_.Name -like \'*fishe*\' -or ($_.Path -and ($_.Path -like \'*fishe-haraj-pos*\' -or $_.Path -like \'*release\\win-unpacked*\')) } | Stop-Process -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  execSync('taskkill /F /IM electron.exe /T', { stdio: 'ignore' });
  execSync('taskkill /F /FI "IMAGENAME eq *fishe*" /T', { stdio: 'ignore' });
} catch {}

// ─── دوال مساعدة للمزامنة الدقيقة والشاملة ───
function copyDirRecursiveSync(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    try {
      if (entry.isDirectory()) {
        copyDirRecursiveSync(srcPath, destPath);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (e) {
      // Ignore individual file copy errors safely
    }
  }
}

function syncDistTo(targetDistPath, label) {
  try {
    fs.mkdirSync(targetDistPath, { recursive: true });
    copyDirRecursiveSync(sourceDist, targetDistPath);
    console.log(`[post-build-sync] ✓ Updated dist for ${label}: ${targetDistPath}`);
  } catch (err) {
    console.warn(`[post-build-sync] ⚠️ Could not sync dist to ${label}:`, err.message);
  }
}

function syncFileTo(srcFile, destFile, label) {
  try {
    if (!fs.existsSync(srcFile)) return;
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.copyFileSync(srcFile, destFile);
    console.log(`[post-build-sync] ✓ Updated ${label}: ${destFile}`);
  } catch (err) {
    console.warn(`[post-build-sync] ⚠️ Could not copy ${label}:`, err.message);
  }
}

function syncFolderTo(srcFolder, destFolder, label) {
  try {
    if (!fs.existsSync(srcFolder)) return;
    fs.mkdirSync(destFolder, { recursive: true });
    copyDirRecursiveSync(srcFolder, destFolder);
    console.log(`[post-build-sync] ✓ Updated folder ${label}: ${destFolder}`);
  } catch (err) {
    console.warn(`[post-build-sync] ⚠️ Could not sync folder ${label}:`, err.message);
  }
}

// ─── 2. تحديث release/win-unpacked للمشروع الحالي ───
const localUnpackedResources = path.join(sourceUnpacked, 'resources');
const localUnpackedDist = path.join(localUnpackedResources, 'app.asar.unpacked', 'dist');
const localUnpackedNodeModules = path.join(localUnpackedResources, 'app.asar.unpacked', 'node_modules');

if (fs.existsSync(sourceUnpacked)) {
  syncDistTo(localUnpackedDist, 'Local release/win-unpacked dist');

  if (fs.existsSync(srcPrismaClient)) {
    syncFolderTo(srcPrismaClient, path.join(localUnpackedNodeModules, '@prisma'), 'unpacked node_modules/@prisma');
  }
  if (fs.existsSync(srcDotPrisma)) {
    syncFolderTo(srcDotPrisma, path.join(localUnpackedNodeModules, '.prisma'), 'unpacked node_modules/.prisma');
  }
  if (fs.existsSync(srcEnv)) {
    syncFileTo(srcEnv, path.join(localUnpackedResources, '.env'), 'unpacked resources/.env');
    syncFileTo(srcEnv, path.join(localUnpackedResources, 'app.asar.unpacked', '.env'), 'unpacked app.asar.unpacked/.env');
  }
}

// ─── 3. تحديث نسخة التطبيق المثبتة محلياً في AppData أولاً وبشكل عاجل ───
const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
const installedRoots = [
  path.join(localAppData, 'Programs', 'fishe-haraj-pos'),
  path.join(localAppData, 'Programs', 'نظام حراج الأسماك'),
].filter(Boolean);

for (const installedRoot of installedRoots) {
  if (fs.existsSync(installedRoot)) {
    console.log(`\n[post-build-sync] >> Synchronizing installed app at: ${installedRoot}`);
    const installedResources = path.join(installedRoot, 'resources');
    const installedDist = path.join(installedResources, 'app.asar.unpacked', 'dist');
    const installedNodeModules = path.join(installedResources, 'app.asar.unpacked', 'node_modules');
    const destInstalledAsar = path.join(installedResources, 'app.asar');

    syncDistTo(installedDist, 'installed app dist');

    if (destInstalledAsar && fs.existsSync(sourceAsar)) {
      syncFileTo(sourceAsar, destInstalledAsar, 'installed app app.asar');
    }

    if (fs.existsSync(srcPrismaClient)) {
      syncFolderTo(srcPrismaClient, path.join(installedNodeModules, '@prisma'), 'installed app node_modules/@prisma');
    }
    if (fs.existsSync(srcDotPrisma)) {
      syncFolderTo(srcDotPrisma, path.join(installedNodeModules, '.prisma'), 'installed app node_modules/.prisma');
    }

    if (fs.existsSync(srcEnv)) {
      syncFileTo(srcEnv, path.join(installedRoot, '.env'), 'installed app .env');
      syncFileTo(srcEnv, path.join(installedResources, '.env'), 'installed app resources/.env');
      syncFileTo(srcEnv, path.join(installedResources, 'app.asar.unpacked', '.env'), 'installed app app.asar.unpacked/.env');
    }

    const sourceExe = path.join(sourceUnpacked, 'نظام حراج الأسماك.exe');
    const destInstalledExe = path.join(installedRoot, 'نظام حراج الأسماك.exe');
    if (fs.existsSync(sourceExe)) {
      syncFileTo(sourceExe, destInstalledExe, 'installed app executable');
    }
  }
}

// ─── 4. مسح كافة كاشات Chromium و Code Cache للتأكد من ظهور آخر تحديث فوراً ───
const appData = process.env.APPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming') : '');
if (appData) {
  const dirsToClear = [
    path.join(appData, 'fishe-haraj-pos', 'Cache'),
    path.join(appData, 'fishe-haraj-pos', 'Code Cache'),
    path.join(appData, 'fishe-haraj-pos', 'GPUCache'),
    path.join(appData, 'fishe-haraj-pos', 'DawnCache'),
    path.join(appData, 'fishe-haraj-pos', 'Network'),
    path.join(appData, 'fishe-haraj-pos', 'blob_storage'),
    path.join(appData, 'نظام حراج الأسماك', 'Cache'),
    path.join(appData, 'نظام حراج الأسماك', 'Code Cache'),
    path.join(appData, 'نظام حراج الأسماك', 'GPUCache'),
    path.join(appData, 'نظام حراج الأسماك', 'DawnCache'),
    path.join(appData, 'نظام حراج الأسماك', 'Network'),
    path.join(appData, 'نظام حراج الأسماك', 'blob_storage'),
  ];
  for (const d of dirsToClear) {
    if (fs.existsSync(d)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
        console.log(`[post-build-sync] ✓ Cleared cache directory: ${path.basename(d)} (${path.basename(path.dirname(d))})`);
      } catch {}
    }
  }
}

// ─── 5. فحص وتحديث كافة النسخ على سطح المكتب (مُعطّل افتراضياً للاكتفاء بنسخة Desktop/fishe الأساسية) ───
const desktopDir = path.join(process.env.USERPROFILE || '', 'Desktop');

if (process.env.SYNC_ALL_COPIES === 'true' && fs.existsSync(desktopDir)) {
  function findFisheCopies(baseDir, maxDepth = 2, currentDepth = 0) {
    const matches = [];
    if (currentDepth > maxDepth || !fs.existsSync(baseDir)) return matches;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (['node_modules', '.git', 'release', 'dist', 'build', 'AppData', '.cache'].includes(entry.name)) continue;
        const fullPath = path.join(baseDir, entry.name);
        if (path.resolve(fullPath) === projectRoot) continue;
        let isMatch = false;
        const pkgPath = path.join(fullPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.name === 'fishe-haraj-pos' || pkg.name?.includes('fishe')) isMatch = true;
          } catch {}
        }
        if (isMatch) matches.push(fullPath);
        else matches.push(...findFisheCopies(fullPath, maxDepth, currentDepth + 1));
      }
    } catch {}
    return matches;
  }

  try {
    const allCopies = findFisheCopies(desktopDir, 2);
    console.log(`[post-build-sync] Found ${allCopies.length} workspace/copy folders on Desktop.`);

    for (const fullDirPath of allCopies) {
      const folderName = path.basename(fullDirPath);
      console.log(`\n[post-build-sync] >> Synchronizing copy: "${folderName}" -> ${fullDirPath}`);

      // أ) تحديث مجلد dist
      syncDistTo(path.join(fullDirPath, 'dist'), `${folderName}/dist`);

      // ب) تحديث مجلدات وملفات الكود المصدري
      if (fs.existsSync(path.join(fullDirPath, 'src')) || fs.existsSync(path.join(fullDirPath, 'package.json'))) {
        syncFolderTo(path.join(projectRoot, 'src'), path.join(fullDirPath, 'src'), `${folderName}/src`);
        syncFolderTo(path.join(projectRoot, 'electron'), path.join(fullDirPath, 'electron'), `${folderName}/electron`);
        syncFileTo(path.join(projectRoot, 'server.ts'), path.join(fullDirPath, 'server.ts'), `${folderName}/server.ts`);
        syncFileTo(path.join(projectRoot, 'index.html'), path.join(fullDirPath, 'index.html'), `${folderName}/index.html`);
        syncFileTo(path.join(projectRoot, '.env'), path.join(fullDirPath, '.env'), `${folderName}/.env`);
        syncFileTo(path.join(projectRoot, 'package.json'), path.join(fullDirPath, 'package.json'), `${folderName}/package.json`);
        if (fs.existsSync(path.join(projectRoot, 'prisma'))) {
          syncFolderTo(path.join(projectRoot, 'prisma'), path.join(fullDirPath, 'prisma'), `${folderName}/prisma`);
        }
      }

      // ج) تحديث release/win-unpacked داخل النسخة
      const copyUnpacked = path.join(fullDirPath, 'release', 'win-unpacked');
      if (fs.existsSync(copyUnpacked) || fs.existsSync(sourceUnpacked)) {
        const candidateUnpackedDist = path.join(copyUnpacked, 'resources', 'app.asar.unpacked', 'dist');
        const candidateAsar = path.join(copyUnpacked, 'resources', 'app.asar');
        const candidateNodeModules = path.join(copyUnpacked, 'resources', 'app.asar.unpacked', 'node_modules');
        const candidateResources = path.join(copyUnpacked, 'resources');

        syncDistTo(candidateUnpackedDist, `${folderName}/win-unpacked/dist`);
        if (fs.existsSync(sourceAsar)) {
          syncFileTo(sourceAsar, candidateAsar, `${folderName}/win-unpacked/app.asar`);
        }
        if (fs.existsSync(srcPrismaClient)) {
          syncFolderTo(srcPrismaClient, path.join(candidateNodeModules, '@prisma'), `${folderName}/win-unpacked node_modules/@prisma`);
        }
        if (fs.existsSync(srcDotPrisma)) {
          syncFolderTo(srcDotPrisma, path.join(candidateNodeModules, '.prisma'), `${folderName}/win-unpacked node_modules/.prisma`);
        }
        if (fs.existsSync(srcEnv)) {
          syncFileTo(srcEnv, path.join(candidateResources, '.env'), `${folderName}/win-unpacked resources/.env`);
          syncFileTo(srcEnv, path.join(candidateResources, 'app.asar.unpacked', '.env'), `${folderName}/win-unpacked app.asar.unpacked/.env`);
        }

        // مزامنة الملف التنفيذي والملفات الثنائية في جذر win-unpacked لضمان تطابق كامل
        const sourceUnpackedExe = path.join(sourceUnpacked, 'نظام حراج الأسماك.exe');
        if (fs.existsSync(sourceUnpackedExe)) {
          syncFileTo(sourceUnpackedExe, path.join(copyUnpacked, 'نظام حراج الأسماك.exe'), `${folderName}/win-unpacked EXE`);
        }
      }

      // د) تحديث النسخة المحمولة القابلة للتشغيل المباشر (.exe)
      const targetPortableExe = path.join(fullDirPath, 'release', `نظام حراج الأسماك ${appVersion}.exe`);
      if (fs.existsSync(sourcePortableExe)) {
        syncFileTo(sourcePortableExe, targetPortableExe, `${folderName}/Portable EXE`);
      }

      // هـ) تحديث نسخة التثبيت Setup إن وُجدت
      const targetSetupExe = path.join(fullDirPath, 'release', `نظام حراج الأسماك Setup ${appVersion}.exe`);
      if (fs.existsSync(sourceSetupExe)) {
        syncFileTo(sourceSetupExe, targetSetupExe, `${folderName}/Setup EXE`);
      }
    }
  } catch (e) {
    console.warn('[post-build-sync] ⚠️ Error scanning Desktop entries:', e.message);
  }
}

// ─── 6. تنظيف أقفال التحميل ومجلدات التنزيل المؤقتة العالقة في temp ───
try {
  const tmp = os.tmpdir();
  const tmpEntries = fs.readdirSync(tmp);
  for (const entry of tmpEntries) {
    if (entry.startsWith('electron-download-') || entry.startsWith('eb-dl-') && entry.endsWith('.lock')) {
      try {
        const full = path.join(tmp, entry);
        fs.rmSync(full, { recursive: true, force: true });
      } catch {}
    }
  }
} catch {}

console.log('\n[post-build-sync] ✨ All non-installed and installed copies are 100% up to date!\n');
