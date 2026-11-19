import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import dotenv from 'dotenv';
import { pool } from './config/db.js';
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

dotenv.config();

const fastify = Fastify({
  logger: false,
});

async function autoEnsureSchema() {
  try {
    const res = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'app' AND table_name = 'users'
      ) AS exists;
    `);
    if (!res.rows[0]?.exists) {
      console.log('[API] Fresh database detected. Applying 0001_initial.sql migration automatically...');
      const fs = await import('node:fs');
      const path = await import('node:path');
      const migrationPaths = [
        path.join(__dirname, '0001_initial.sql'),
        path.join(__dirname, '..', '0001_initial.sql'),
        path.resolve(process.cwd(), 'db/migrations/0001_initial.sql'),
        path.resolve(process.cwd(), '../../db/migrations/0001_initial.sql'),
        path.join(process.cwd(), '0001_initial.sql'),
      ];
      const sqlPath = migrationPaths.find((p) => fs.existsSync(p));
      if (sqlPath) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await pool.query(sql);
        console.log('[API] Initial schema migrated successfully!');
      }
    }
  } catch (err) {
    console.warn('[API] autoEnsureSchema check notice:', err);
  }
}

async function autoSeedAdmin() {
  try {
    const existing = await pool.query("SELECT id FROM app.users WHERE username = 'admin'");
    if (existing.rows.length === 0) {
      const passwordHash = await hashSecret('admin123456');
      const pinHash = await hashSecret('1234');

      const roleRes = await pool.query("SELECT id FROM app.roles WHERE code = 'admin'");
      const roleId = roleRes.rows[0]?.id;

      const userRes = await pool.query(
        `INSERT INTO app.users (
          username, full_name, password_hash, manager_pin_hash, is_active
        ) VALUES ('admin', 'مدير النظام', $1, $2, true)
        RETURNING id`,
        [passwordHash, pinHash]
      );

      const userId = userRes.rows[0].id;
      if (roleId) {
        await pool.query(
          `INSERT INTO app.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, roleId]
        );
      }
      console.log('Default admin seeded (admin / admin123456, PIN: 1234)');
    }
  } catch (err) {
    console.error('Auto seed admin error:', err);
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

  fastify.get('/api/health', async () => {
    return { status: 'healthy', version: '1.0.0', time: new Date().toISOString() };
  });

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

  await autoEnsureSchema();
  await autoSeedAdmin();

  const port = parseInt(process.env.PORT || '4000', 10);
  const host = '127.0.0.1';

  await fastify.listen({ port, host });
  console.log(`Fludo ERP API server running on http://${host}:${port}`);
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
