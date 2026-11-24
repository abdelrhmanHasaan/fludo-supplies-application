import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { pool, resetPool } from './config/db.js';
import { hashSecret } from './utils/security.js';

import { authRoutes } from './routes/auth.routes.js';
import { partiesRoutes } from './routes/parties.routes.js';
import { productsRoutes } from './routes/products.routes.js';
import { ordersRoutes } from './routes/orders.routes.js';
import { invoicesRoutes } from './routes/invoices.routes.js';
import { paymentsRoutes } from './routes/payments.routes.js';
import { inventoryRoutes } from './routes/inventory.routes.js';
import { treasuryRoutes } from './routes/treasury.routes.js';
import { payrollRoutes } from './routes/payroll.routes.js';
import { equipmentRoutes } from './routes/equipment.routes.js';
import { expensesRoutes } from './routes/expenses.routes.js';
import { reportsRoutes } from './routes/reports.routes.js';
import { approvalsRoutes } from './routes/approvals.routes.js';
import { auditRoutes } from './routes/audit.routes.js';
import { dataPortRoutes } from './routes/data_port.routes.js';
import { companyRoutes } from './routes/company.routes.js';
import { searchRoutes } from './routes/search.routes.js';
import { syncRoutes } from './routes/sync.routes.js';

dotenv.config();

const fastify = Fastify({
  logger: false,
});

async function autoEnsureSchema() {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');

    // Check app.schema_migrations first
    const smCheck = await pool.query(`
      SELECT version FROM app.schema_migrations;
    `).catch(() => ({ rows: [] }));

    const appliedSet = new Set(smCheck.rows.map((r: any) => r.version));
    if (
      appliedSet.has('0001_initial') &&
      appliedSet.has('0002_fix_constraints_and_search') &&
      appliedSet.has('0003_comprehensive_schema_update') &&
      appliedSet.has('0004_figjam_overhaul')
    ) {
      console.log('[API] Schema verified against app.schema_migrations (Version: 4).');
      return;
    }

    const res = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'app' AND table_name = 'users'
      ) AS exists;
    `);

    if (!res.rows[0]?.exists) {
      console.log('[API] Fresh database detected. Applying 0001_initial.sql migration automatically...');
      const migration1Paths = [
        path.join(__dirname, '0001_initial.sql'),
        path.join(__dirname, '..', '0001_initial.sql'),
        path.resolve(process.cwd(), 'db/migrations/0001_initial.sql'),
        path.resolve(process.cwd(), '../../db/migrations/0001_initial.sql'),
        path.join(process.cwd(), '0001_initial.sql'),
      ];
      const sql1Path = migration1Paths.find((p) => fs.existsSync(p));
      if (sql1Path) {
        const sql = fs.readFileSync(sql1Path, 'utf8');
        const cleanSql = sql.replace(/^\\[^\n]*\n?/gm, '');
        await pool.query(cleanSql);
        console.log('[API] Initial schema migrated successfully!');
      }
    }

    // Check Migration 0002
    const m2Check = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'normalize_ar'
      ) AS exists;
    `).catch(() => ({ rows: [{ exists: false }] }));

    if (!m2Check.rows[0]?.exists) {
      console.log('[API] Applying 0002_fix_constraints_and_search.sql migration...');
      const migration2Paths = [
        path.join(__dirname, '0002_fix_constraints_and_search.sql'),
        path.join(__dirname, '..', '0002_fix_constraints_and_search.sql'),
        path.resolve(process.cwd(), 'db/migrations/0002_fix_constraints_and_search.sql'),
        path.resolve(process.cwd(), '../../db/migrations/0002_fix_constraints_and_search.sql'),
        path.join(process.cwd(), '0002_fix_constraints_and_search.sql'),
      ];
      const sql2Path = migration2Paths.find((p) => fs.existsSync(p));
      if (sql2Path) {
        const sql = fs.readFileSync(sql2Path, 'utf8');
        await pool.query(sql);
        console.log('[API] 0002 migration applied successfully!');
      }
    }

    // Check Migration 0003
    const m3Check = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_views WHERE schemaname = 'app' AND viewname = 'v_dashboard_metrics'
      ) AS exists;
    `).catch(() => ({ rows: [{ exists: false }] }));

    if (!m3Check.rows[0]?.exists) {
      console.log('[API] Applying 0003_comprehensive_schema_update.sql migration...');
      const migration3Paths = [
        path.join(__dirname, '0003_comprehensive_schema_update.sql'),
        path.join(__dirname, '..', '0003_comprehensive_schema_update.sql'),
        path.resolve(process.cwd(), 'db/migrations/0003_comprehensive_schema_update.sql'),
        path.resolve(process.cwd(), '../../db/migrations/0003_comprehensive_schema_update.sql'),
        path.join(process.cwd(), '0003_comprehensive_schema_update.sql'),
      ];
      const sql3Path = migration3Paths.find((p) => fs.existsSync(p));
      if (sql3Path) {
        const sql = fs.readFileSync(sql3Path, 'utf8');
        await pool.query(sql);
        console.log('[API] 0003 migration applied successfully!');
      }
    }

    // Check Migration 0004 (FigJam Overhaul)
    const m4Check = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'app' AND table_name = 'cash_movements'
      ) AS exists;
    `).catch(() => ({ rows: [{ exists: false }] }));

    if (!m4Check.rows[0]?.exists) {
      console.log('[API] Applying 0004_figjam_overhaul.sql migration...');
      const migration4Paths = [
        path.join(__dirname, '0004_figjam_overhaul.sql'),
        path.join(__dirname, '..', '0004_figjam_overhaul.sql'),
        path.resolve(process.cwd(), 'db/migrations/0004_figjam_overhaul.sql'),
        path.resolve(process.cwd(), '../../db/migrations/0004_figjam_overhaul.sql'),
        path.join(process.cwd(), '0004_figjam_overhaul.sql'),
      ];
      const sql4Path = migration4Paths.find((p) => fs.existsSync(p));
      if (sql4Path) {
        const sql = fs.readFileSync(sql4Path, 'utf8');
        await pool.query(sql);
        console.log('[API] 0004 migration applied successfully!');
      }
    }
  } catch (err) {
    console.warn('[API] autoEnsureSchema check notice:', err);
  }
}

async function start() {
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Centralized Error Handler (translating PostgreSQL errors to clear Arabic messages)
  fastify.setErrorHandler((error: any, request, reply) => {
    const correlationId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    console.error(`[API ERROR ${correlationId}]`, {
      url: request.url,
      method: request.method,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      column: error.column,
      table: error.table,
      message: error.message,
    });

    let arabicMessage = error.message || 'حدث خطأ غير متوقع';
    let statusCode = error.statusCode || 500;

    if (error.code === '23502') {
      statusCode = 400;
      arabicMessage = `الحقل [${error.column || 'المطلوب'}] لا يمكن تركه فارغاً`;
    } else if (error.code === '23503') {
      statusCode = 400;
      arabicMessage = 'البيانات المرتبطة غير صحيحة أو غير موجودة (يرجى التأكد من اختيار العميل أو الصنف أو الخزينة بشكل صحيح)';
    } else if (error.code === '23505') {
      statusCode = 400;
      arabicMessage = 'الرقم أو الكود مسجل بالفعل في النظام ولا يمكن تكراره';
    } else if (error.code === '23514') {
      statusCode = 400;
      arabicMessage = 'القيمة المدخلة غير مسموحة (يرجى التحقق من صحة الكميات والأسعار والمبالغ)';
    } else if (error.code === '42501') {
      statusCode = 403;
      arabicMessage = 'السجل معتمد ومقفل — يلزم إذن وموافقة المدير (PIN) لإجراء التعديل';
    } else if (error.code === 'P0001') {
      statusCode = 400;
      arabicMessage = error.message;
    } else if (error.code === '42P01' || error.code === '42703') {
      statusCode = 500;
      arabicMessage = 'قاعدة البيانات بحاجة إلى تحديث هيكلي';
    }

    reply.status(statusCode).send({
      error: arabicMessage,
      correlationId,
      code: error.code,
      detail: process.env.NODE_ENV !== 'production' ? error.detail : undefined,
    });
  });

  const healthHandler = async () => ({
    status: 'healthy',
    version: '1.7.0',
    time: new Date().toISOString(),
  });
  fastify.get('/health', healthHandler);
  fastify.get('/api/health', healthHandler);

  // Per-launch secret token validation (Requirement 3)
  const appSecretToken = process.env.APP_SECRET_TOKEN;
  if (appSecretToken) {
    fastify.addHook('onRequest', async (req, reply) => {
      if (req.method === 'OPTIONS' || req.url === '/health' || req.url === '/api/health') {
        return;
      }
      const token = req.headers['x-app-token'];
      if (!token || token !== appSecretToken) {
        return reply.status(401).send({ error: 'غير مصرح: رمز الجلسة غير صالح أو مفقود' });
      }
    });
  }

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(partiesRoutes, { prefix: '/api/parties' });
  await fastify.register(productsRoutes, { prefix: '/api/products' });
  await fastify.register(ordersRoutes, { prefix: '/api/orders' });
  await fastify.register(invoicesRoutes, { prefix: '/api/invoices' });
  await fastify.register(paymentsRoutes, { prefix: '/api/payments' });
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' });
  await fastify.register(treasuryRoutes, { prefix: '/api/treasury' });
  await fastify.register(payrollRoutes, { prefix: '/api/payroll' });
  await fastify.register(equipmentRoutes, { prefix: '/api/equipment' });
  await fastify.register(expensesRoutes, { prefix: '/api/expenses' });
  await fastify.register(reportsRoutes, { prefix: '/api/reports' });
  await fastify.register(approvalsRoutes, { prefix: '/api/approvals' });
  await fastify.register(auditRoutes, { prefix: '/api/audit' });
  await fastify.register(dataPortRoutes, { prefix: '/api/data' });
  await fastify.register(companyRoutes, { prefix: '/api/company' });
  await fastify.register(searchRoutes, { prefix: '/api/search' });
  await fastify.register(syncRoutes, { prefix: '/api/sync' });

  await autoEnsureSchema();

  const port = parseInt(process.env.PORT || '4000', 10);
  const host = '127.0.0.1';

  await fastify.listen({ port, host });
  console.log(`Fludo ERP API server running on http://${host}:${port}`);
  return fastify;
}

export async function startServer(customPort?: number, customPgPort?: number, token?: string) {
  if (customPort) process.env.PORT = String(customPort);
  if (customPgPort) {
    process.env.PGPORT = String(customPgPort);
    resetPool();
  }
  if (token) process.env.APP_SECRET_TOKEN = token;
  return await start();
}

export { fastify, start };

// Only call start() automatically when executed as standalone script file
if (process.argv[1] && (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts'))) {
  start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}
