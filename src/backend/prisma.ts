import dotenv from 'dotenv';
import { createRequire } from 'node:module';
import path from 'path';
import fs from 'fs';

const require = createRequire(path.join(process.cwd(), 'package.json'));

// Load environment variables (.env)
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), '.env') });
if ((process as any).resourcesPath) {
  dotenv.config({ path: path.join((process as any).resourcesPath, '.env') });
  dotenv.config({ path: path.join((process as any).resourcesPath, 'app.asar.unpacked', '.env') });
}

// Fallback DATABASE_URL if not provided in environment
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:19702002Ay@localhost:5432/fishe_db?schema=public';
}

function loadPrismaClientClass(): any {
  try {
    return require('@prisma/client').PrismaClient;
  } catch (err1) {
    const candidates = [
      path.join(process.cwd(), 'node_modules/@prisma/client'),
      path.join(process.cwd(), 'src/node_modules/@prisma/client'),
      path.join(process.cwd(), 'src/backend/node_modules/@prisma/client'),
      path.join((process as any).resourcesPath || '', 'app.asar.unpacked/node_modules/@prisma/client'),
      path.join((process as any).resourcesPath || '', 'node_modules/@prisma/client'),
    ];
    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          return require(c).PrismaClient;
        }
      } catch {}
    }
    console.warn('[prisma.ts] Note: @prisma/client could not be loaded directly:', (err1 as any)?.message);
    return null;
  }
}

// Create safe fallback proxy that never crashes when database is unavailable
function createPrismaFallback(): any {
  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop === '$connect') return async () => { throw new Error('Database client not loaded'); };
      if (prop === '$disconnect') return async () => {};
      if (prop === '$queryRaw') return async () => { throw new Error('Database client not loaded'); };
      if (prop === '$transaction') return async (args: any) => {
        if (Array.isArray(args)) return [];
        if (typeof args === 'function') return await args(createPrismaFallback());
        return [];
      };
      return new Proxy({}, {
        get(_, method) {
          return async () => {
            if (method === 'findMany') return [];
            if (method === 'count') return 0;
            if (method === 'findUnique' || method === 'findFirst') return null;
            if (method === 'deleteMany' || method === 'updateMany') return { count: 0 };
            return null;
          };
        }
      });
    }
  };
  return new Proxy({}, handler);
}

const PrismaClientClass = loadPrismaClientClass();
let prismaInstance: any = null;

if (PrismaClientClass) {
  try {
    prismaInstance = new PrismaClientClass({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  } catch (err: any) {
    console.warn('[prisma.ts] Failed to instantiate PrismaClient, using safe fallback proxy:', err?.message);
    prismaInstance = createPrismaFallback();
  }
} else {
  prismaInstance = createPrismaFallback();
}

export const prisma = prismaInstance;

export async function testDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!PrismaClientClass || !prisma || typeof prisma.$queryRaw !== 'function') {
      return { ok: false, error: 'محرك قاعدة البيانات Prisma غير مثبت أو غير متاح في هذا المسار' };
    }
    // Set a quick 2-second timeout race so it doesn't hang if Postgres port is blocked or non-existent
    const queryPromise = (async () => {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    })();
    const timeoutPromise = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      setTimeout(() => resolve({ ok: false, error: 'انتهت مهلة الاتصال بقاعدة البيانات PostgreSQL (Timeout)' }), 2000);
    });
    return await Promise.race([queryPromise, timeoutPromise]);
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

