import express from 'express';
import path from 'path';
import fs from 'fs';

// Ensure node_modules paths include app.asar.unpacked in packaged Electron environments
if (typeof module !== 'undefined' && (module as any).paths) {
  const candidateModulePaths = [
    path.join(__dirname, 'node_modules'),
    path.join(__dirname, '../node_modules'),
    path.join(__dirname, '../../node_modules'),
    path.join((process as any).resourcesPath || '', 'app.asar.unpacked', 'node_modules'),
    path.join((process as any).resourcesPath || '', 'node_modules'),
  ];
  for (const p of candidateModulePaths) {
    if (fs.existsSync(p) && !(module as any).paths.includes(p)) {
      (module as any).paths.unshift(p);
    }
  }
}

import { apiRouter } from './src/backend/routes';

export async function startServer(portOverride?: number) {
  const app = express();
  const PORT = portOverride || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);

  // Body parsing middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Fast ping route for instant readiness check without database handshake
  app.get(['/api/ping', '/ping'], (req, res) => {
    res.json({ ok: true, status: 'ready', timestamp: Date.now() });
  });

  // Mount backend API routes FIRST
  app.use('/api', apiRouter);

  // Vite middleware for development vs static build for production
  const isPackaged = Boolean((process as any).resourcesPath && !(process as any).defaultApp);
  if (!isPackaged && process.env.NODE_ENV !== 'production' && !process.env.SERVE_STATIC) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('Vite middleware could not be loaded, serving statically:', err);
      serveStaticFiles(app);
    }
  } else {
    serveStaticFiles(app);
  }

  return new Promise<{ server: any; port: number }>((resolve) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Backend server running on http://127.0.0.1:${PORT}`);
      resolve({ server, port: PORT });
    });
  });
}

function serveStaticFiles(app: express.Express) {
  // Resolve dist path
  const candidates = [
    process.env.FISHE_DIST_PATH,
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'dist'),
    path.join(process.resourcesPath || '', 'app', 'dist'),
    path.join(process.cwd(), 'dist'),
    path.join(__dirname, 'dist'),
    path.join(__dirname, '../dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist'),
  ].filter(Boolean) as string[];

  let distPath = candidates.find((p) => fs.existsSync(p)) || path.join(process.cwd(), 'dist');
  console.log(`Serving static files from: ${distPath}`);

  // Prevent caching of index.html and SPA assets so desktop always reflects latest build immediately
  app.use((req, res, next) => {
    if (req.url === '/' || req.url.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));

  // Fallback handler for SPA routing
  app.get('*', (req, res) => {
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      try {
        const content = fs.readFileSync(indexPath, 'utf-8');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.send(content);
      } catch (err) {
        console.error('Error reading index.html:', err);
      }
    }
    res.sendFile(indexPath);
  });
}

// Auto-start only if executed directly as a standalone process
if (process.env.FISHE_EMBEDDED !== 'true') {
  startServer();
}
