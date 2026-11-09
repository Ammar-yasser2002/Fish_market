const { app, BrowserWindow, ipcMain, shell, Menu, dialog, session } = require('electron');
const path = require('path');
const http = require('http');
const net = require('net');
const fs = require('fs');

process.env.FISHE_EMBEDDED = 'true';
process.env.SERVE_STATIC = 'true';

// Load environment variables (.env)
try {
  const dotenv = require('dotenv');
  dotenv.config();
  dotenv.config({ path: path.join(__dirname, '../.env') });
  dotenv.config({ path: path.join(app.getAppPath(), '.env') });
  if (process.resourcesPath) {
    dotenv.config({ path: path.join(process.resourcesPath, '.env') });
    dotenv.config({ path: path.join(process.resourcesPath, 'app.asar.unpacked', '.env') });
  }
} catch (e) {
  console.warn('dotenv loading note:', e.message);
}

// Ensure default PostgreSQL connection if environment missing
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:19702002Ay@localhost:5432/fishe_db?schema=public';
}

// Ensure node_modules paths include app.asar.unpacked in packaged Electron environments
if (typeof module !== 'undefined' && module.paths) {
  const candidateModulePaths = [
    path.join(__dirname, 'node_modules'),
    path.join(__dirname, '../node_modules'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'node_modules'),
    path.join(process.resourcesPath || '', 'node_modules'),
    path.join(app.getAppPath(), 'node_modules'),
    path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'node_modules'),
  ];
  for (const p of candidateModulePaths) {
    if (fs.existsSync(p) && !module.paths.includes(p)) {
      module.paths.unshift(p);
    }
  }
}

// Log file for diagnosing any startup issues
const logFilePath = path.join(app.getPath('userData'), 'desktop-app.log');
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  try {
    fs.appendFileSync(logFilePath, line, 'utf-8');
  } catch {}
  console.log(...args);
}

log('Starting desktop application...', { isPackaged: app.isPackaged, version: app.getVersion() });

// Safely catch unhandled exceptions & rejections to prevent native OS error boxes
process.on('uncaughtException', (err) => {
  log('Uncaught Exception caught safely:', err?.message || err);
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.message?.includes('ECONNREFUSED'))) {
    // Suppress network disconnection noise during quit/teardown
    return;
  }
});

process.on('unhandledRejection', (reason) => {
  log('Unhandled Rejection caught safely:', reason);
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log('Another instance is already running. Exiting.');
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let serverInstance = null;
let activePort = 3000;
let prismaClientInstance = null;
let isQuitting = false;

const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Initialize Prisma Client
function getPrismaClient() {
  if (prismaClientInstance) return prismaClientInstance;
  try {
    let PrismaClientClass;
    try {
      PrismaClientClass = require('@prisma/client').PrismaClient;
    } catch {
      const candidates = [
        path.join(process.resourcesPath || '', 'app.asar.unpacked/node_modules/@prisma/client'),
        path.join(app.getAppPath(), '../app.asar.unpacked/node_modules/@prisma/client'),
        path.join(__dirname, '../node_modules/@prisma/client'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          PrismaClientClass = require(c).PrismaClient;
          break;
        }
      }
    }
    if (!PrismaClientClass) throw new Error('Could not resolve @prisma/client module');
    prismaClientInstance = new PrismaClientClass({
      log: isDev ? ['warn', 'error'] : ['error'],
    });
    return prismaClientInstance;
  } catch (err) {
    log('PrismaClient library could not be loaded:', err.message);
    return null;
  }
}

// Global BigInt JSON serialization helper
if (!(BigInt.prototype).toJSON) {
  BigInt.prototype.toJSON = function () {
    return Number(this);
  };
}

// Find an available port starting from 3000
function getAvailablePort(startingPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startingPort, '127.0.0.1', () => {
      server.once('close', () => resolve(startingPort));
      server.close();
    });
    server.on('error', () => {
      resolve(getAvailablePort(startingPort + 1));
    });
  });
}

// Check if server is ready and responding
function waitForServer(port, maxRetries = 40, interval = 150) {
  return new Promise((resolve) => {
    let retries = 0;
    let resolved = false;

    const check = () => {
      if (resolved) return;
      // Fast check ping first
      const req = http.get(`http://127.0.0.1:${port}/api/ping`, (res) => {
        if (res.statusCode === 200) {
          log('Server is online and responding healthy on port', port);
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        } else {
          checkHealthFallback();
        }
      });
      req.on('error', () => {
        retry();
      });
      req.setTimeout(1200, () => {
        req.destroy();
        retry();
      });
    };

    const checkHealthFallback = () => {
      if (resolved) return;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200 || res.statusCode === 304) {
          if (!resolved) {
            resolved = true;
            resolve(true);
          }
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(1200, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (resolved) return;
      retries++;
      if (retries >= maxRetries) {
        log('Server health check timed out after', maxRetries, 'retries');
        resolved = true;
        resolve(false);
      } else {
        setTimeout(check, interval);
      }
    };

    check();
  });
}

// Fallback static server if dist/server.cjs fails to run
function startFallbackStaticServer(port) {
  return new Promise((resolve) => {
    const distCandidates = [
      path.join(process.resourcesPath || '', 'app.asar.unpacked/dist'),
      path.join(__dirname, '../dist'),
      path.join(__dirname, 'dist'),
      path.join(app.getAppPath(), 'dist'),
      path.join(process.cwd(), 'dist'),
    ];
    const distDir = distCandidates.find((d) => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));
    if (!distDir) {
      log('Fallback server: Could not find dist directory with index.html');
      resolve(null);
      return;
    }

    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    };

    const fallbackServer = http.createServer((req, res) => {
      try {
        let reqPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (reqPath === '/api/ping' || reqPath === '/ping') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, fallback: true }));
          return;
        }
        if (reqPath.startsWith('/api/')) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'offline', message: 'خادم قاعدة البيانات غير متصل، يعمل النظام بالتخزين المحلي' }));
          return;
        }

        let filePath = path.join(distDir, reqPath === '/' ? 'index.html' : reqPath);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(distDir, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error loading file');
          } else {
            res.writeHead(200, {
              'Content-Type': contentType,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
            });
            res.end(content);
          }
        });
      } catch (e) {
        res.writeHead(500);
        res.end('Server Error');
      }
    });

    fallbackServer.listen(port, '127.0.0.1', () => {
      log(`Fallback static HTTP server started successfully on port ${port} from ${distDir}`);
      resolve(fallbackServer);
    });

    fallbackServer.on('error', (err) => {
      log('Fallback server failed to bind:', err.message);
      resolve(null);
    });
  });
}

async function startInternalServer() {
  if (isDev) {
    activePort = Number(process.env.FISHE_DEV_SERVER_PORT) || 3000;
    log('Development mode: waiting for the Vite dev server on port', activePort);
    const ready = await waitForServer(activePort, 100, 200);
    if (!ready) {
      throw new Error(`Development server did not become ready on port ${activePort}`);
    }
    return { port: activePort, ready: true };
  }

  // Choose an available port
  activePort = await getAvailablePort(3000);
  process.env.PORT = String(activePort);
  process.env.NODE_ENV = 'production';
  process.env.FISHE_EMBEDDED = 'true';

  log(`Starting internal server on port ${activePort}...`);

  try {
    const serverCandidates = [
      path.join(process.resourcesPath || '', 'app.asar.unpacked/dist/server.cjs'),
      path.join(__dirname, '../dist/server.cjs'),
      path.join(__dirname, 'dist/server.cjs'),
      path.join(app.getAppPath(), 'dist/server.cjs'),
      path.join(process.resourcesPath || '', 'app/dist/server.cjs'),
      path.join(process.resourcesPath || '', 'app.asar/dist/server.cjs'),
    ];

    let serverPath = serverCandidates.find((p) => fs.existsSync(p));
    if (!serverPath) {
      serverPath = path.join(__dirname, '../dist/server.cjs');
    }
    log(`Loading server module from: ${serverPath}`);

    const serverModule = require(serverPath);
    const startFn = serverModule.startServer || serverModule.default?.startServer;

    if (typeof startFn === 'function') {
      const res = await startFn(activePort);
      serverInstance = res?.server;
      log(`Server successfully started on port ${activePort}`);
      const isReady = await waitForServer(activePort, 20, 100);
      if (isReady) return { port: activePort, ready: true };
    } else {
      log('startServer function not found in server module');
    }
  } catch (err) {
    log('Failed to start server directly via require:', err.message, err.stack);
  }

  // Fallback: start emergency built-in static server to ensure the UI ALWAYS loads
  log('Starting emergency built-in static server to guarantee UI availability...');
  const fallbackSrv = await startFallbackStaticServer(activePort);
  if (fallbackSrv) {
    serverInstance = fallbackSrv;
    return { port: activePort, ready: true };
  }
  const isReady = await waitForServer(activePort, 15, 150);
  return { port: activePort, ready: isReady };
}

function showDiagnosticErrorScreen(win, errorCode, errorDesc, targetUrl) {
  if (!win || win.isDestroyed()) return;
  const safeError = `${errorCode}: ${errorDesc}`;
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>نظام حراج الأسماك - خطأ في الاتصال</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; max-width: 600px; width: 100%; padding: 36px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
    .icon { width: 72px; height: 72px; background: rgba(239, 68, 68, 0.15); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; color: #ef4444; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 12px; color: #fff; }
    p { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 20px; }
    .details { background: #0f172a; border-radius: 12px; padding: 12px 16px; font-size: 12px; color: #cbd5e1; direction: ltr; font-family: monospace; text-align: left; margin-bottom: 24px; word-break: break-all; border: 1px solid #334155; }
    .btn-group { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    button { background: #2563eb; color: white; border: none; padding: 12px 24px; border-radius: 10px; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; }
    button:hover { background: #1d4ed8; }
    button.secondary { background: #334155; color: #f8fafc; }
    button.secondary:hover { background: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>تعذر الاتصال بخادم النظام الداخلي</h1>
    <p>لم يتمكن التطبيق من بدء الخادم المحلي أو الاتصال به على هذا الجهاز. يمكنك النقر على زر إعادة المحاولة، أو فتح أدوات المطورين لمشاهدة تفاصيل الخطأ.</p>
    <div class="details">Error: ${safeError}<br>Target: ${targetUrl}</div>
    <div class="btn-group">
      <button onclick="window.location.href='${targetUrl}'">🔄 إعادة المحاولة</button>
      <button class="secondary" onclick="window.close()">إغلاق التطبيق</button>
    </div>
  </div>
</body>
</html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createMainWindow(appUrl) {
  log(`Creating main window with URL: ${appUrl}`);

  const iconCandidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../public/icon.png'),
    path.join(app.getAppPath(), 'build/icon.ico'),
    path.join(app.getAppPath(), 'public/icon.png'),
  ];
  const iconPath = iconCandidates.find((p) => fs.existsSync(p));

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'نظام حراج الأسماك - نقطة البيع والحسابات',
    icon: iconPath,
    show: false,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  const menuTemplate = [
    {
      label: 'ملف',
      submenu: [
        {
          label: 'إعادة تحميل الصفحة',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow && mainWindow.reload(),
        },
        {
          label: 'طباعة فورية',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow && mainWindow.webContents.print(),
        },
        { type: 'separator' },
        {
          label: 'إغلاق النظام',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'عرض',
      submenu: [
        {
          label: 'ملء الشاشة',
          accelerator: 'F11',
          click: () => mainWindow && mainWindow.setFullScreen(!mainWindow.isFullScreen()),
        },
        {
          label: 'تكبير',
          accelerator: 'CmdOrCtrl+Plus',
          role: 'zoomIn',
        },
        {
          label: 'تصغير',
          accelerator: 'CmdOrCtrl+-',
          role: 'zoomOut',
        },
        {
          label: 'الحجم الافتراضي',
          accelerator: 'CmdOrCtrl+0',
          role: 'resetZoom',
        },
        { type: 'separator' },
        {
          label: 'أدوات المطورين (DevTools)',
          accelerator: 'F12',
          click: () => mainWindow && mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'مساعدة',
      submenu: [
        {
          label: 'عن نظام حراج الأسماك',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'عن النظام',
              message: 'نظام حراج الأسماك - نقطة البيع والحسابات (PostgreSQL + Prisma ORM)',
              detail: 'تطبيق سطح مكتب متكامل لإدارة عمليات حراج الأسماك ومبيعات الصيادين وحسابات المشتري والعمولات.\nالإصدار: 4.0.0 (PostgreSQL Edition)',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  // Clear Chromium cache to guarantee latest build renders without stale cache
  if (session && session.defaultSession) {
    try {
      session.defaultSession.clearCache();
      session.defaultSession.clearCodeCaches({});
    } catch {}
  }

  mainWindow.loadURL(appUrl, {
    extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n',
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    log(`[Renderer Console] (level=${level}) ${message} [${sourceId}:${line}]`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log('Renderer process gone:', details);
    if (details.reason !== 'clean-exit' && !isQuitting) {
      log('Renderer crashed unexpectedly. Recreating the main window...');
      const recoveryUrl = `http://127.0.0.1:${activePort}`;
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(recoveryUrl);
          return;
        }
        createMainWindow(recoveryUrl);
      }, 1000);
    }
  });

  let failLoadCount = 0;
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
    log(`Page failed to load: ${errorCode} - ${errorDesc} on ${validatedURL}`);
    // Ignore aborted navigations
    if (errorCode === -3) return;

    failLoadCount++;
    if (failLoadCount <= 3) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          log(`Retrying loadURL (attempt ${failLoadCount}/3)...`);
          mainWindow.loadURL(appUrl);
        }
      }, 1200);
    } else {
      log('Max loadURL retries reached. Displaying recovery diagnostic screen.');
      showDiagnosticErrorScreen(mainWindow, errorCode, errorDesc, appUrl);
    }
  });

  let isWindowPresented = false;
  const presentWindow = () => {
    if (isWindowPresented || !mainWindow || mainWindow.isDestroyed()) return;
    isWindowPresented = true;
    log('Window ready. Maximizing and presenting.');
    mainWindow.show();
    mainWindow.maximize();
  };

  mainWindow.once('ready-to-show', presentWindow);
  // Fallback: guarantee window is presented quickly even if Chromium delayed ready-to-show
  setTimeout(presentWindow, 700);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl =
      url.includes('firebaseapp.com/__/auth') ||
      url.includes('accounts.google.com') ||
      url.includes('apis.google.com') ||
      url.includes('google.com/o/oauth2');

    if (isAuthUrl) {
      log('Allowing Firebase/Google OAuth popup window for:', url);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 650,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        },
      };
    }

    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('whatsapp:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-create-window', (childWindow) => {
    try {
      const defaultUa = session.defaultSession.getUserAgent();
      const cleanUa = defaultUa.replace(/\sElectron\/[^\s]+/i, '');
      childWindow.webContents.setUserAgent(cleanUa);
    } catch (e) {
      log('Error setting child window user-agent:', e);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance handler
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  if (activePort) {
    createMainWindow(`http://127.0.0.1:${activePort}`);
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  try {
    const defaultUa = session.defaultSession.getUserAgent();
    const cleanUa = defaultUa.replace(/\sElectron\/[^\s]+/i, '');
    session.defaultSession.setUserAgent(cleanUa);
  } catch (e) {
    log('Failed to customize session User-Agent:', e);
  }

  // 1. Standard IPC handlers
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('print-page', () => {
    if (mainWindow) {
      mainWindow.webContents.print({ silent: false, printBackground: true });
    }
  });
  ipcMain.handle('open-external', async (_, url) => {
    if (!url) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch (e) {
      log('open-external error:', url, e?.message);
      return false;
    }
  });
  ipcMain.handle('open-path', async (_, p) => {
    if (!p) return false;
    try {
      await shell.openPath(p);
      return true;
    } catch (e) {
      log('open-path error:', p, e?.message);
      return false;
    }
  });
  ipcMain.handle('show-item-in-folder', (_, p) => {
    try {
      if (p && fs.existsSync(p)) {
        shell.showItemInFolder(p);
        return true;
      }
    } catch (e) {
      log('show-item-in-folder error:', p, e?.message);
    }
    return false;
  });
  ipcMain.handle('copy-file-to-clipboard', (_, p) => {
    if (!p || !fs.existsSync(p)) return false;
    try {
      const tempPs1 = path.join(app.getPath('temp'), 'copy_clip.ps1');
      fs.writeFileSync(tempPs1, 'param([string]$f)\nSet-Clipboard -LiteralPath $f\n', 'utf8');
      const { execFile } = require('child_process');
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempPs1, p], (err) => {
        try { fs.unlinkSync(tempPs1); } catch {}
        if (err) log('copy-file-to-clipboard error:', err?.message);
      });
      return true;
    } catch (e) {
      log('copy-file-to-clipboard exception:', e);
      return false;
    }
  });
  // Pre-warmed singleton worker window for lightning-fast vector printing and PDF export
  let printWorkerWin = null;
  let isPrintWorkerBusy = false;

  function getOrCreatePrintWorker() {
    if (printWorkerWin && !printWorkerWin.isDestroyed()) {
      return printWorkerWin;
    }
    try {
      printWorkerWin = new BrowserWindow({
        show: false,
        skipTaskbar: true,
        focusable: false,
        frame: false,
        width: 1024,
        height: 1400,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      printWorkerWin.on('closed', () => {
        printWorkerWin = null;
        isPrintWorkerBusy = false;
      });
      return printWorkerWin;
    } catch (e) {
      log('getOrCreatePrintWorker error:', e);
      return null;
    }
  }

  // printWorkerWin will be created purely on-demand during print or export, not on startup

  ipcMain.handle('send-whatsapp-file', async (_, { filePath, phone }) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, message: 'ملف الفاتورة غير موجود' };
    }
    try {
      let cleanPhone = (phone || '').replace(/\D/g, '');
      if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.slice(2);
      if (cleanPhone.startsWith('0') && cleanPhone.length === 10) cleanPhone = '967' + cleanPhone.slice(1);
      else if (cleanPhone.length === 9 && (cleanPhone.startsWith('7') || cleanPhone.startsWith('1'))) cleanPhone = '967' + cleanPhone;
      const waUrl = cleanPhone ? `whatsapp://send?phone=${cleanPhone}` : `whatsapp://send`;

      // 1. Open WhatsApp Desktop immediately to recipient's chat without blocking
      shell.openExternal(waUrl).catch((err) => log('openExternal waUrl err:', err));

      // 2. Copy PDF file to Windows Clipboard as native file drop and auto-paste into WhatsApp Desktop in background
      const tempPs1 = path.join(app.getPath('temp'), 'wa_send_pdf.ps1');
      const scriptContent = `param([string]$f)
try {
  Set-Clipboard -LiteralPath $f
  Start-Sleep -Milliseconds 500
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinInputHelper {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    public static void SendPaste() {
        keybd_event(0x11, 0, 0, 0);       // Ctrl down
        keybd_event(0x56, 0, 0, 0);       // V down
        keybd_event(0x56, 0, 0x0002, 0);  // V up
        keybd_event(0x11, 0, 0x0002, 0);  // Ctrl up
    }
}
"@
  [WinInputHelper]::SendPaste()
} catch {}
`;
      fs.writeFileSync(tempPs1, scriptContent, 'utf8');

      // 3. Execute PowerShell to copy to clipboard & auto-paste into WhatsApp asynchronously
      const { execFile } = require('child_process');
      execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempPs1, filePath], () => {
        try { fs.unlinkSync(tempPs1); } catch {}
      });

      return { success: true };
    } catch (e) {
      log('send-whatsapp-file error:', e);
      return { success: false, error: e?.message };
    }
  });

  ipcMain.handle('share-file', async (_, { filePath, target }) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: false, message: 'ملف الفاتورة غير موجود أو تعذر الوصول إليه' };
    }
    try {
      const { execFile, spawn } = require('child_process');

      // 1. نسخ ملف الفاتورة تلقائياً إلى الحافظة كملف حقيقي (Windows File Drop) ليكون جاهزاً للصق في أي مكان
      const tempPs1 = path.join(app.getPath('temp'), 'share_copy_file.ps1');
      const scriptContent = `param([string]$f)
try {
  Set-Clipboard -LiteralPath $f
} catch {}
`;
      try {
        fs.writeFileSync(tempPs1, scriptContent, 'utf8');
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempPs1, filePath], () => {
          try { fs.unlinkSync(tempPs1); } catch {}
        });
      } catch {}

      if (target === 'localsend') {
        // مسارات تطبيق LocalSend المحتملة على النظام
        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        const candidates = [
          'C:\\Program Files\\LocalSend\\localsend_app.exe',
          'C:\\Program Files (x86)\\LocalSend\\localsend_app.exe',
          path.join(localAppData, 'Programs', 'LocalSend', 'localsend_app.exe'),
          path.join(localAppData, 'LocalSend', 'localsend_app.exe'),
          path.join(userProfile, 'Desktop', 'LocalSend.lnk'),
          'C:\\Users\\Public\\Desktop\\LocalSend.lnk',
        ];

        let exePath = candidates.find((p) => fs.existsSync(p));

        // إذا كان اختصار .lnk نقوم بقراءة المسار الفعلي للهدف
        if (exePath && exePath.endsWith('.lnk')) {
          try {
            const sc = shell.readShortcutLink(exePath);
            if (sc && sc.target && fs.existsSync(sc.target)) {
              exePath = sc.target;
            }
          } catch {}
        }

        if (exePath && fs.existsSync(exePath)) {
          // تشغيل تطبيق LocalSend وتمرير مسار ملف الـ PDF كمعامل
          spawn(exePath, [filePath], { detached: true, stdio: 'ignore' }).unref();
          return {
            success: true,
            message: 'تم فتح تطبيق LocalSend وجاري تجهيز إرسال الفاتورة عبر الشبكة المحلية',
          };
        } else {
          // في حال عدم العثور على المسار المباشر، نظهر الملف في المجلد ليتمكن من سحبه
          shell.showItemInFolder(filePath);
          return {
            success: true,
            message: 'تم نسخ ملف الفاتورة للحافظة وتحديد مكانه في المجلد لسحبه إلى LocalSend',
          };
        }
      } else if (target === 'bluetooth') {
        // تشغيل معالج البلوتوث المباشر (إرسال الملف مباشرة إلى المستلم دون الحاجة لأخذه أو البحث عنه في الجهاز)
        const sendToDir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'SendTo');
        let bluetoothLnk = null;
        try {
          if (fs.existsSync(sendToDir)) {
            const files = fs.readdirSync(sendToDir);
            const found = files.find((f) => f.toLowerCase().includes('bluetooth') && f.toLowerCase().endsWith('.lnk'));
            if (found) {
              bluetoothLnk = path.join(sendToDir, found);
            }
          }
        } catch {}

        if (bluetoothLnk && fs.existsSync(bluetoothLnk)) {
          // تشغيل معالج البلوتوث مع تمرير مسار الملف مباشرة إليه (Windows SendTo Handler)
          const psCommand = `Start-Process -FilePath "${bluetoothLnk.replace(/"/g, '`"')}" -ArgumentList "\`"${filePath.replace(/"/g, '`"')}\`""`;
          execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], (err) => {
            if (err) {
              const fsquirtPath = 'C:\\Windows\\System32\\fsquirt.exe';
              if (fs.existsSync(fsquirtPath)) {
                spawn(fsquirtPath, ['-send'], { detached: true, stdio: 'ignore' }).unref();
              }
            }
          });
          return {
            success: true,
            message: 'تم فتح معالج البلوتوث المباشر وإرفاق الملف تلقائياً للإرسال إلى المستلم فوراً',
          };
        } else {
          const fsquirtPath = 'C:\\Windows\\System32\\fsquirt.exe';
          if (fs.existsSync(fsquirtPath)) {
            spawn(fsquirtPath, ['-send'], { detached: true, stdio: 'ignore' }).unref();
            return {
              success: true,
              message: 'تم فتح معالج إرسال البلوتوث المباشر (-send) ونسخ ملف الفاتورة للحافظة',
            };
          } else {
            shell.showItemInFolder(filePath);
            return {
              success: true,
              message: 'تم نسخ ملف الفاتورة للحافظة وإظهار الملف في المجلد',
            };
          }
        }
      } else if (target === 'open-with') {
        // فتح نافذة اختيار تطبيق المشاركة (فتح باستخدام...) في نظام ويندوز
        execFile('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', filePath]);
        return {
          success: true,
          message: 'تم فتح نافذة اختيار تطبيق المشاركة في ويندوز',
        };
      } else if (target === 'show-folder') {
        shell.showItemInFolder(filePath);
        return {
          success: true,
          message: 'تم فتح المجلد وتحديد ملف الفاتورة بنجاح',
        };
      } else if (target === 'copy') {
        return {
          success: true,
          message: 'تم نسخ ملف الفاتورة إلى الحافظة بنجاح (جاهز للصق Ctrl+V في أي برنامج أو محادثة)',
        };
      }

      return { success: false, message: 'خيار مشاركة غير مدعوم' };
    } catch (err) {
      log('share-file error:', err);
      return { success: false, message: err?.message || 'خطأ أثناء محاولة المشاركة' };
    }
  });

  ipcMain.handle('export-pdf-invoice', async (_, { html, filename, defaultDirectory, silent = false }) => {
    const isSilent = Boolean(silent === true || silent === 'true' || silent === 1 || defaultDirectory === 'temp');
    const safeFilename = (filename || 'invoice.pdf').replace(/[\\/:*?"<>|]/g, '_');

    // Start rendering PDF immediately in parallel so it's ready by the time user picks save location
    const renderPdfPromise = (async () => {
      let workerWin = null;
      let shouldCloseWorker = false;
      try {
        const warmWin = getOrCreatePrintWorker();
        if (!isPrintWorkerBusy && warmWin) {
          workerWin = warmWin;
          isPrintWorkerBusy = true;
          shouldCloseWorker = false;
        } else {
          workerWin = new BrowserWindow({
            show: false,
            skipTaskbar: true,
            focusable: false,
            frame: false,
            width: 1024,
            height: 1400,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
            },
          });
          shouldCloseWorker = true;
        }

        await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await new Promise((r) => setTimeout(r, 40));
        return await workerWin.webContents.printToPDF({
          pageSize: 'A4',
          printBackground: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        });
      } finally {
        if (shouldCloseWorker && workerWin) {
          try { workerWin.close(); } catch {}
        } else {
          isPrintWorkerBusy = false;
        }
      }
    })();

    let targetFilePath = '';

    // 1. For non-silent download: Prompt Save Dialog immediately without delay!
    if (!isSilent) {
      const desktopPath = app.getPath('desktop');
      const defaultPath = path.join(defaultDirectory || desktopPath, safeFilename);

      const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
      const saveDialogRes = await dialog.showSaveDialog(targetWindow || null, {
        title: 'حفظ مستند PDF باسم - اختر مكان الحفظ',
        defaultPath,
        filters: [
          { name: 'مستندات PDF (*.pdf)', extensions: ['pdf'] },
          { name: 'جميع الملفات (*.*)', extensions: ['*'] },
        ],
      });

      if (saveDialogRes.canceled || !saveDialogRes.filePath) {
        return { success: false, canceled: true, message: 'تم إلغاء عملية الحفظ' };
      }
      targetFilePath = saveDialogRes.filePath;
    } else {
      // Save silently to isolated system temporary folder (e.g. for WhatsApp sending)
      const tempDir = path.join(app.getPath('temp'), 'invoices_temp');
      if (!fs.existsSync(tempDir)) {
        try { fs.mkdirSync(tempDir, { recursive: true }); } catch {}
      }
      targetFilePath = path.join(tempDir, safeFilename);
    }

    try {
      const pdfBuffer = await renderPdfPromise;
      fs.writeFileSync(targetFilePath, pdfBuffer);

      return {
        success: true,
        savedPath: targetFilePath,
        filename: path.basename(targetFilePath),
        base64: pdfBuffer.toString('base64'),
      };
    } catch (err) {
      log('export-pdf-invoice error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-printers', async () => {
    try {
      if (mainWindow) {
        return await mainWindow.webContents.getPrintersAsync();
      }
      return [];
    } catch (e) {
      log('get-printers error:', e);
      return [];
    }
  });

  ipcMain.handle('print-html-direct', async (_, { html, silent = false, deviceName, pageSize = 'A4' }) => {
    let workerWin = null;
    let shouldCloseWorker = false;
    try {
      const warmWin = getOrCreatePrintWorker();
      if (!isPrintWorkerBusy && warmWin) {
        workerWin = warmWin;
        isPrintWorkerBusy = true;
        shouldCloseWorker = false;
      } else {
        workerWin = new BrowserWindow({
          show: false,
          skipTaskbar: true,
          focusable: false,
          frame: false,
          width: 1024,
          height: 1400,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        shouldCloseWorker = true;
      }

      await workerWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      // Brief wait for font and images rendering
      await new Promise((r) => setTimeout(r, 50));

      const printOptions = {
        silent: Boolean(silent),
        printBackground: true,
        pageSize: pageSize || 'A4',
        margins: { marginType: 'none' },
      };

      if (deviceName) {
        printOptions.deviceName = deviceName;
      }

      // If interactive print dialog (silent: false), summon dialog and resolve immediately so UI does not hang spinning
      if (!silent) {
        workerWin.webContents.print(printOptions, (success, failureReason) => {
          if (!success && failureReason && failureReason !== 'canceled') {
            log('print-html-direct dialog feedback:', failureReason);
          }
          if (shouldCloseWorker && workerWin) {
            try { workerWin.close(); } catch {}
          } else {
            isPrintWorkerBusy = false;
          }
        });
        setTimeout(() => { isPrintWorkerBusy = false; }, 800);
        return { success: true };
      }

      return await new Promise((resolve) => {
        workerWin.webContents.print(printOptions, (success, failureReason) => {
          if (!success) {
            log('print-html-direct failed/canceled:', failureReason);
            resolve({ success: false, error: failureReason || 'canceled' });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (err) {
      log('print-html-direct error:', err);
      return { success: false, error: err.message };
    } finally {
      if (shouldCloseWorker && workerWin) {
        try {
          workerWin.close();
        } catch {}
      } else {
        isPrintWorkerBusy = false;
      }
    }
  });

  ipcMain.handle('save-file-dialog', async (_, { filename, content, base64, buffer, filters }) => {
    try {
      const desktopPath = path.join(process.env.USERPROFILE || '', 'Desktop');
      const safeFilename = (filename || 'export.file').replace(/[\\/:*?"<>|]/g, '_');
      const defaultPath = path.join(desktopPath, safeFilename);
      const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
      const res = await dialog.showSaveDialog(targetWindow || null, {
        title: 'حفظ الملف باسم - اختر مكان الحفظ',
        defaultPath,
        filters: filters || [{ name: 'جميع الملفات (*.*)', extensions: ['*'] }],
      });
      if (res.canceled || !res.filePath) {
        return { success: false, canceled: true, message: 'تم إلغاء عملية الحفظ' };
      }
      let data;
      if (base64) {
        data = Buffer.from(base64, 'base64');
      } else if (buffer) {
        data = Buffer.from(buffer);
      } else {
        data = Buffer.from(content || '', 'utf8');
      }
      fs.writeFileSync(res.filePath, data);
      return { success: true, savedPath: res.filePath, filename: path.basename(res.filePath) };
    } catch (err) {
      log('save-file-dialog error:', err);
      return { success: false, error: err.message };
    }
  });

  // 2. Initialize and verify PostgreSQL Connection via Prisma ORM asynchronously (non-blocking)
  const verifyPostgresDbAsync = async () => {
    const prisma = getPrismaClient();
    if (!prisma) {
      log('Prisma client not yet available.');
      return;
    }
    try {
      log('Verifying PostgreSQL connection via Prisma ORM (background)...');
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      log('PostgreSQL database connected successfully!');
    } catch (dbErr) {
      log('PostgreSQL database connection check note:', dbErr.message);
    }
  };
  verifyPostgresDbAsync();

  // 3. Register ipcMain Database Query Handlers using Prisma ORM
  ipcMain.handle('db:check-connection', async () => {
    const p = getPrismaClient();
    if (!p) return { ok: false, error: 'Prisma Client not initialized' };
    try {
      await p.$queryRawUnsafe('SELECT 1');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('db:get-transactions', async (_, limit = 2000) => {
    const p = getPrismaClient();
    if (!p) return [];
    try {
      const rows = await p.transaction.findMany({
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { items: true },
      });
      return JSON.parse(JSON.stringify(rows));
    } catch (e) {
      log('Error in db:get-transactions:', e.message);
      return [];
    }
  });

  ipcMain.handle('db:save-transaction', async (_, tx) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const ts = BigInt(tx.timestamp || Date.now());
    const res = await p.transaction.upsert({
      where: { id: tx.id },
      create: {
        id: tx.id,
        dateStr: tx.dateStr || '',
        timeStr: tx.timeStr || '',
        timestamp: ts,
        sellerId: tx.sellerId || null,
        sellerName: tx.sellerName || '',
        sellerPhone: tx.sellerPhone || null,
        buyerId: tx.buyerId || null,
        buyerName: tx.buyerName || '',
        buyerPhone: tx.buyerPhone || null,
        grossAmount: Number(tx.grossAmount) || 0,
        buyerTaxRate: tx.buyerTaxRate !== undefined ? Number(tx.buyerTaxRate) : null,
        buyerTaxAmount: Number(tx.buyerTaxAmount) || 0,
        totalFromBuyer: Number(tx.totalFromBuyer) || 0,
        sellerTaxRate: tx.sellerTaxRate !== undefined ? Number(tx.sellerTaxRate) : null,
        sellerTaxAmount: Number(tx.sellerTaxAmount) || 0,
        netToSeller: Number(tx.netToSeller) || 0,
        harajProfit: Number(tx.harajProfit) || 0,
        paymentStatus: tx.paymentStatus || 'unpaid',
        settlementType: tx.settlementType || 'association_cash',
        buyerPaidAmount: tx.buyerPaidAmount !== undefined ? Number(tx.buyerPaidAmount) : null,
        paidAtPosBuyerAmount: tx.paidAtPosBuyerAmount !== undefined ? Number(tx.paidAtPosBuyerAmount) : null,
        buyerRemainingDebt: tx.buyerRemainingDebt !== undefined ? Number(tx.buyerRemainingDebt) : null,
        buyerAdvanceUsed: tx.buyerAdvanceUsed !== undefined ? Number(tx.buyerAdvanceUsed) : null,
        sellerPaidAmount: tx.sellerPaidAmount !== undefined ? Number(tx.sellerPaidAmount) : null,
        paidAtPosAmount: tx.paidAtPosAmount !== undefined ? Number(tx.paidAtPosAmount) : null,
        sellerRemainingDebt: tx.sellerRemainingDebt !== undefined ? Number(tx.sellerRemainingDebt) : null,
        sellerPaidStatus: tx.sellerPaidStatus || null,
        sellerPayoutMethod: tx.sellerPayoutMethod || null,
        sellerExchangeName: tx.sellerExchangeName || null,
        isEdited: Boolean(tx.isEdited),
        editedAt: tx.editedAt ? BigInt(tx.editedAt) : null,
        editedDateStr: tx.editedDateStr || null,
        isTransferred: Boolean(tx.isTransferred),
        transferredFromBuyerName: tx.transferredFromBuyerName || null,
        transferredAt: tx.transferredAt ? BigInt(tx.transferredAt) : null,
        isResale: Boolean(tx.isResale),
        resaleSurplus: tx.resaleSurplus !== undefined ? Number(tx.resaleSurplus) : null,
        resoldFromTransactionId: tx.resoldFromTransactionId || null,
        wasResold: Boolean(tx.wasResold),
        resoldToTransactionId: tx.resoldToTransactionId || null,
        resoldToBuyerName: tx.resoldToBuyerName || null,
        resoldPaymentStatus: tx.resoldPaymentStatus || null,
        notes: tx.notes || null,
        data: tx,
      },
      update: {
        dateStr: tx.dateStr || '',
        timeStr: tx.timeStr || '',
        timestamp: ts,
        sellerId: tx.sellerId || null,
        sellerName: tx.sellerName || '',
        sellerPhone: tx.sellerPhone || null,
        buyerId: tx.buyerId || null,
        buyerName: tx.buyerName || '',
        buyerPhone: tx.buyerPhone || null,
        grossAmount: Number(tx.grossAmount) || 0,
        buyerTaxRate: tx.buyerTaxRate !== undefined ? Number(tx.buyerTaxRate) : null,
        buyerTaxAmount: Number(tx.buyerTaxAmount) || 0,
        totalFromBuyer: Number(tx.totalFromBuyer) || 0,
        sellerTaxRate: tx.sellerTaxRate !== undefined ? Number(tx.sellerTaxRate) : null,
        sellerTaxAmount: Number(tx.sellerTaxAmount) || 0,
        netToSeller: Number(tx.netToSeller) || 0,
        harajProfit: Number(tx.harajProfit) || 0,
        paymentStatus: tx.paymentStatus || 'unpaid',
        settlementType: tx.settlementType || 'association_cash',
        buyerPaidAmount: tx.buyerPaidAmount !== undefined ? Number(tx.buyerPaidAmount) : null,
        paidAtPosBuyerAmount: tx.paidAtPosBuyerAmount !== undefined ? Number(tx.paidAtPosBuyerAmount) : null,
        buyerRemainingDebt: tx.buyerRemainingDebt !== undefined ? Number(tx.buyerRemainingDebt) : null,
        buyerAdvanceUsed: tx.buyerAdvanceUsed !== undefined ? Number(tx.buyerAdvanceUsed) : null,
        sellerPaidAmount: tx.sellerPaidAmount !== undefined ? Number(tx.sellerPaidAmount) : null,
        paidAtPosAmount: tx.paidAtPosAmount !== undefined ? Number(tx.paidAtPosAmount) : null,
        sellerRemainingDebt: tx.sellerRemainingDebt !== undefined ? Number(tx.sellerRemainingDebt) : null,
        sellerPaidStatus: tx.sellerPaidStatus || null,
        sellerPayoutMethod: tx.sellerPayoutMethod || null,
        sellerExchangeName: tx.sellerExchangeName || null,
        isEdited: Boolean(tx.isEdited),
        editedAt: tx.editedAt ? BigInt(tx.editedAt) : null,
        editedDateStr: tx.editedDateStr || null,
        isTransferred: Boolean(tx.isTransferred),
        transferredFromBuyerName: tx.transferredFromBuyerName || null,
        transferredAt: tx.transferredAt ? BigInt(tx.transferredAt) : null,
        isResale: Boolean(tx.isResale),
        resaleSurplus: tx.resaleSurplus !== undefined ? Number(tx.resaleSurplus) : null,
        resoldFromTransactionId: tx.resoldFromTransactionId || null,
        wasResold: Boolean(tx.wasResold),
        resoldToTransactionId: tx.resoldToTransactionId || null,
        resoldToBuyerName: tx.resoldToBuyerName || null,
        resoldPaymentStatus: tx.resoldPaymentStatus || null,
        notes: tx.notes || null,
        data: tx,
      },
    });

    await p.transactionItem.deleteMany({
      where: { transactionId: tx.id },
    });

    if (Array.isArray(tx.items) && tx.items.length > 0) {
      await p.transactionItem.createMany({
        data: tx.items.map((i, idx) => ({
          id: `${tx.id}_item_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          transactionId: tx.id,
          fishTypeId: i.fishTypeId || null,
          fishName: i.fishName || '',
          quantity: Number(i.quantity) || 0,
          unit: i.unit || '',
          unitPrice: Number(i.unitPrice) || 0,
          totalGross: Number(i.totalGross) || 0,
        })),
      });
    }

    return JSON.parse(JSON.stringify(res));
  });

  ipcMain.handle('db:delete-transaction', async (_, id) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    await p.transaction.delete({ where: { id } });
    return { success: true };
  });

  ipcMain.handle('db:get-contacts', async () => {
    const p = getPrismaClient();
    if (!p) return [];
    const rows = await p.contact.findMany({ orderBy: { name: 'asc' } });
    return JSON.parse(JSON.stringify(rows));
  });

  ipcMain.handle('db:save-contact', async (_, contact) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const res = await p.contact.upsert({
      where: { id: contact.id },
      create: {
        id: contact.id,
        name: contact.name,
        type: contact.type,
        phone: contact.phone || null,
        taxNumber: contact.taxNumber || null,
        role: contact.role || null,
        dailyWage: contact.dailyWage !== undefined ? Number(contact.dailyWage) : null,
        notes: contact.notes || null,
        createdAt: contact.createdAt || new Date().toISOString(),
        data: contact,
      },
      update: {
        name: contact.name,
        type: contact.type,
        phone: contact.phone || null,
        taxNumber: contact.taxNumber || null,
        role: contact.role || null,
        dailyWage: contact.dailyWage !== undefined ? Number(contact.dailyWage) : null,
        notes: contact.notes || null,
        createdAt: contact.createdAt || new Date().toISOString(),
        data: contact,
      },
    });
    return JSON.parse(JSON.stringify(res));
  });

  ipcMain.handle('db:delete-contact', async (_, id) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    await p.contact.delete({ where: { id } });
    return { success: true };
  });

  ipcMain.handle('db:get-fish-types', async () => {
    const p = getPrismaClient();
    if (!p) return [];
    const rows = await p.fishType.findMany({ orderBy: { name: 'asc' } });
    return JSON.parse(JSON.stringify(rows));
  });

  ipcMain.handle('db:save-fish-type', async (_, fish) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const res = await p.fishType.upsert({
      where: { id: fish.id },
      create: {
        id: fish.id,
        name: fish.name,
        arabicName: fish.arabicName || fish.name,
        defaultUnit: fish.defaultUnit || 'kg',
        unitLabel: fish.unitLabel || 'كيلو',
        estimatedPricePerUnit: fish.estimatedPricePerUnit !== undefined ? Number(fish.estimatedPricePerUnit) : null,
        category: fish.category || null,
        popular: fish.popular !== undefined ? Boolean(fish.popular) : true,
        data: fish,
      },
      update: {
        name: fish.name,
        arabicName: fish.arabicName || fish.name,
        defaultUnit: fish.defaultUnit || 'kg',
        unitLabel: fish.unitLabel || 'كيلو',
        estimatedPricePerUnit: fish.estimatedPricePerUnit !== undefined ? Number(fish.estimatedPricePerUnit) : null,
        category: fish.category || null,
        popular: fish.popular !== undefined ? Boolean(fish.popular) : true,
        data: fish,
      },
    });
    return JSON.parse(JSON.stringify(res));
  });

  ipcMain.handle('db:delete-fish-type', async (_, id) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    await p.fishType.delete({ where: { id } });
    return { success: true };
  });

  ipcMain.handle('db:get-cash-entries', async (_, limit = 2000) => {
    const p = getPrismaClient();
    if (!p) return [];
    const rows = await p.cashEntry.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
    return JSON.parse(JSON.stringify(rows));
  });

  ipcMain.handle('db:save-cash-entry', async (_, entry) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const ts = BigInt(entry.timestamp || Date.now());
    const res = await p.cashEntry.upsert({
      where: { id: entry.id },
      create: {
        id: entry.id,
        timestamp: ts,
        dateStr: entry.dateStr || '',
        timeStr: entry.timeStr || '',
        type: entry.type,
        category: entry.category,
        amount: Number(entry.amount) || 0,
        description: entry.description || null,
        performedBy: entry.performedBy || null,
        referenceId: entry.referenceId || null,
        contactId: entry.contactId || null,
        contactName: entry.contactName || null,
        transactionId: entry.transactionId || null,
        payoutMethod: entry.payoutMethod || null,
        repaymentMethod: entry.repaymentMethod || null,
        exchangeName: entry.exchangeName || null,
        data: entry,
      },
      update: {
        timestamp: ts,
        dateStr: entry.dateStr || '',
        timeStr: entry.timeStr || '',
        type: entry.type,
        category: entry.category,
        amount: Number(entry.amount) || 0,
        description: entry.description || null,
        performedBy: entry.performedBy || null,
        referenceId: entry.referenceId || null,
        contactId: entry.contactId || null,
        contactName: entry.contactName || null,
        transactionId: entry.transactionId || null,
        payoutMethod: entry.payoutMethod || null,
        repaymentMethod: entry.repaymentMethod || null,
        exchangeName: entry.exchangeName || null,
        data: entry,
      },
    });
    return JSON.parse(JSON.stringify(res));
  });

  ipcMain.handle('db:delete-cash-entry', async (_, id) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    await p.cashEntry.delete({ where: { id } });
    return { success: true };
  });

  ipcMain.handle('db:get-cash-closings', async (_, limit = 1000) => {
    const p = getPrismaClient();
    if (!p) return [];
    const rows = await p.cashDayCloseRecord.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
    return JSON.parse(JSON.stringify(rows));
  });

  ipcMain.handle('db:save-cash-closing', async (_, closing) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const ts = BigInt(closing.timestamp || Date.now());
    const res = await p.cashDayCloseRecord.upsert({
      where: { id: closing.id },
      create: {
        id: closing.id,
        timestamp: ts,
        dateStr: closing.dateStr || '',
        timeStr: closing.timeStr || '',
        openingBalance: Number(closing.openingBalance) || 0,
        totalDeposits: Number(closing.totalDeposits) || 0,
        totalExpenses: Number(closing.totalExpenses) || 0,
        totalWithdrawals: Number(closing.totalWithdrawals) || 0,
        harajCashSales: closing.harajCashSales !== undefined ? Number(closing.harajCashSales) : null,
        harajSellerPayouts: closing.harajSellerPayouts !== undefined ? Number(closing.harajSellerPayouts) : null,
        buyerDebtRepayments: closing.buyerDebtRepayments !== undefined ? Number(closing.buyerDebtRepayments) : null,
        buyerDebtExchangeRepayments: closing.buyerDebtExchangeRepayments !== undefined ? Number(closing.buyerDebtExchangeRepayments) : null,
        sellerExchangePayouts: closing.sellerExchangePayouts !== undefined ? Number(closing.sellerExchangePayouts) : null,
        officeExpenses: closing.officeExpenses !== undefined ? Number(closing.officeExpenses) : null,
        associationProfits: closing.associationProfits !== undefined ? Number(closing.associationProfits) : null,
        systemCalculatedBalance: Number(closing.systemCalculatedBalance) || 0,
        actualCountedCash: Number(closing.actualCountedCash) || 0,
        difference: Number(closing.difference) || 0,
        notes: closing.notes || null,
        data: closing,
      },
      update: {
        timestamp: ts,
        dateStr: closing.dateStr || '',
        timeStr: closing.timeStr || '',
        openingBalance: Number(closing.openingBalance) || 0,
        totalDeposits: Number(closing.totalDeposits) || 0,
        totalExpenses: Number(closing.totalExpenses) || 0,
        totalWithdrawals: Number(closing.totalWithdrawals) || 0,
        harajCashSales: closing.harajCashSales !== undefined ? Number(closing.harajCashSales) : null,
        harajSellerPayouts: closing.harajSellerPayouts !== undefined ? Number(closing.harajSellerPayouts) : null,
        buyerDebtRepayments: closing.buyerDebtRepayments !== undefined ? Number(closing.buyerDebtRepayments) : null,
        buyerDebtExchangeRepayments: closing.buyerDebtExchangeRepayments !== undefined ? Number(closing.buyerDebtExchangeRepayments) : null,
        sellerExchangePayouts: closing.sellerExchangePayouts !== undefined ? Number(closing.sellerExchangePayouts) : null,
        officeExpenses: closing.officeExpenses !== undefined ? Number(closing.officeExpenses) : null,
        associationProfits: closing.associationProfits !== undefined ? Number(closing.associationProfits) : null,
        systemCalculatedBalance: Number(closing.systemCalculatedBalance) || 0,
        actualCountedCash: Number(closing.actualCountedCash) || 0,
        difference: Number(closing.difference) || 0,
        notes: closing.notes || null,
        data: closing,
      },
    });
    return JSON.parse(JSON.stringify(res));
  });

  ipcMain.handle('db:get-settings', async () => {
    const p = getPrismaClient();
    if (!p) return null;
    const row = await p.setting.findUnique({ where: { key: 'global' } });
    return row?.data || null;
  });

  ipcMain.handle('db:save-settings', async (_, settings) => {
    const p = getPrismaClient();
    if (!p) throw new Error('Database not connected');
    const res = await p.setting.upsert({
      where: { key: 'global' },
      create: { key: 'global', data: settings },
      update: { data: settings },
    });
    return res.data;
  });

  // 4. Start Internal Server & Create Main Window
  try {
    const { port, ready } = await startInternalServer();
    if (!ready) {
      log('WARNING: Server did not respond ready within deadline. Attempting to load anyway.');
    }
    const appUrl = `http://127.0.0.1:${port}`;
    createMainWindow(appUrl);
  } catch (err) {
    log('Fatal error during startup:', err);
    dialog.showErrorBox('خطأ في الإقلاع', `حدث خطأ أثناء تشغيل النظام الداخلي:\n${err.message}`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(`http://127.0.0.1:${activePort}`);
    }
  });
});

app.on('before-quit', () => {
  log('Application before-quit triggered.');
  try {
    if (activePort && serverInstance && serverInstance.listening) {
      log('Triggering exit backup before server shutdown...');
      const http = require('http');
      const req = http.request({
        hostname: '127.0.0.1',
        port: activePort,
        path: '/api/backup/save-to-folder',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 1500,
      });
      req.on('error', (err) => {
        log('Before-quit backup request note (safe to ignore):', err.message);
      });
      req.on('timeout', () => {
        try { req.destroy(); } catch {}
      });
      req.write(JSON.stringify({}));
      req.end();
    }
  } catch (err) {
    log('Before-quit backup note:', err.message);
  }
});

app.on('window-all-closed', async () => {
  log('All windows closed. Quitting.');
  if (prismaClientInstance) {
    try {
      await prismaClientInstance.$disconnect();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    if (serverInstance && typeof serverInstance.close === 'function') {
      try {
        serverInstance.close();
      } catch {}
      serverInstance = null;
    }
    app.quit();
  }
});
