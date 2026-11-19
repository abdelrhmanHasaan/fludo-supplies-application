"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const dotenv_1 = __importDefault(require("dotenv"));
const db_js_1 = require("./config/db.js");
const security_js_1 = require("./utils/security.js");
const auth_routes_js_1 = require("./routes/auth.routes.js");
const parties_routes_js_1 = require("./routes/parties.routes.js");
const products_routes_js_1 = require("./routes/products.routes.js");
const orders_routes_js_1 = require("./routes/orders.routes.js");
const invoices_routes_js_1 = require("./routes/invoices.routes.js");
const payments_routes_js_1 = require("./routes/payments.routes.js");
const inventory_routes_js_1 = require("./routes/inventory.routes.js");
const treasury_routes_js_1 = require("./routes/treasury.routes.js");
const payroll_routes_js_1 = require("./routes/payroll.routes.js");
const equipment_routes_js_1 = require("./routes/equipment.routes.js");
const expenses_routes_js_1 = require("./routes/expenses.routes.js");
const reports_routes_js_1 = require("./routes/reports.routes.js");
const approvals_routes_js_1 = require("./routes/approvals.routes.js");
const audit_routes_js_1 = require("./routes/audit.routes.js");
const data_port_routes_js_1 = require("./routes/data_port.routes.js");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: false,
});
async function autoEnsureSchema() {
    try {
        const res = await db_js_1.pool.query(`
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
                await db_js_1.pool.query(sql);
                console.log('[API] Initial schema migrated successfully!');
            }
        }
    }
    catch (err) {
        console.warn('[API] autoEnsureSchema check notice:', err);
    }
}
async function autoSeedAdmin() {
    try {
        const existing = await db_js_1.pool.query("SELECT id FROM app.users WHERE username = 'admin'");
        if (existing.rows.length === 0) {
            const passwordHash = await (0, security_js_1.hashSecret)('admin123456');
            const pinHash = await (0, security_js_1.hashSecret)('1234');
            const roleRes = await db_js_1.pool.query("SELECT id FROM app.roles WHERE code = 'admin'");
            const roleId = roleRes.rows[0]?.id;
            const userRes = await db_js_1.pool.query(`INSERT INTO app.users (
          username, full_name, password_hash, manager_pin_hash, is_active
        ) VALUES ('admin', 'مدير النظام', $1, $2, true)
        RETURNING id`, [passwordHash, pinHash]);
            const userId = userRes.rows[0].id;
            if (roleId) {
                await db_js_1.pool.query(`INSERT INTO app.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, roleId]);
            }
            console.log('Default admin seeded (admin / admin123456, PIN: 1234)');
        }
    }
    catch (err) {
        console.error('Auto seed admin error:', err);
    }
}
async function start() {
    await fastify.register(cors_1.default, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });
    await fastify.register(multipart_1.default, {
        limits: {
            fileSize: 50 * 1024 * 1024, // 50MB
        },
    });
    fastify.get('/api/health', async () => {
        return { status: 'healthy', version: '1.0.0', time: new Date().toISOString() };
    });
    await fastify.register(auth_routes_js_1.authRoutes, { prefix: '/api/auth' });
    await fastify.register(parties_routes_js_1.partiesRoutes, { prefix: '/api/parties' });
    await fastify.register(products_routes_js_1.productsRoutes, { prefix: '/api/products' });
    await fastify.register(orders_routes_js_1.ordersRoutes, { prefix: '/api/orders' });
    await fastify.register(invoices_routes_js_1.invoicesRoutes, { prefix: '/api/invoices' });
    await fastify.register(payments_routes_js_1.paymentsRoutes, { prefix: '/api/payments' });
    await fastify.register(inventory_routes_js_1.inventoryRoutes, { prefix: '/api/inventory' });
    await fastify.register(treasury_routes_js_1.treasuryRoutes, { prefix: '/api/treasury' });
    await fastify.register(payroll_routes_js_1.payrollRoutes, { prefix: '/api/payroll' });
    await fastify.register(equipment_routes_js_1.equipmentRoutes, { prefix: '/api/equipment' });
    await fastify.register(expenses_routes_js_1.expensesRoutes, { prefix: '/api/expenses' });
    await fastify.register(reports_routes_js_1.reportsRoutes, { prefix: '/api/reports' });
    await fastify.register(approvals_routes_js_1.approvalsRoutes, { prefix: '/api/approvals' });
    await fastify.register(audit_routes_js_1.auditRoutes, { prefix: '/api/audit' });
    await fastify.register(data_port_routes_js_1.dataPortRoutes, { prefix: '/api/data' });
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
