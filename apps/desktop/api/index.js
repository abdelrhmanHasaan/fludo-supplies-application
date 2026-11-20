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
const company_routes_js_1 = require("./routes/company.routes.js");
const search_routes_js_1 = require("./routes/search.routes.js");
const sync_routes_js_1 = require("./routes/sync.routes.js");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({
    logger: false,
});
async function autoEnsureSchema() {
    try {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const res = await db_js_1.pool.query(`
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
                await db_js_1.pool.query(cleanSql);
                console.log('[API] Initial schema migrated successfully!');
            }
        }
        // Check Migration 0002
        const m2Check = await db_js_1.pool.query(`
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
                await db_js_1.pool.query(sql);
                console.log('[API] 0002 migration applied successfully!');
            }
        }
    }
    catch (err) {
        console.warn('[API] autoEnsureSchema check notice:', err);
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
    // Centralized Error Handler (translating PostgreSQL errors to clear Arabic messages)
    fastify.setErrorHandler((error, request, reply) => {
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
        }
        else if (error.code === '23503') {
            statusCode = 400;
            arabicMessage = 'البيانات المرتبطة غير صحيحة أو غير موجودة (يرجى التأكد من اختيار العميل أو الصنف أو الخزينة بشكل صحيح)';
        }
        else if (error.code === '23505') {
            statusCode = 400;
            arabicMessage = 'الرقم أو الكود مسجل بالفعل في النظام ولا يمكن تكراره';
        }
        else if (error.code === '23514') {
            statusCode = 400;
            arabicMessage = 'القيمة المدخلة غير مسموحة (يرجى التحقق من صحة الكميات والأسعار والمبالغ)';
        }
        else if (error.code === '42501') {
            statusCode = 403;
            arabicMessage = 'السجل معتمد ومقفل — يلزم إذن وموافقة المدير (PIN) لإجراء التعديل';
        }
        else if (error.code === 'P0001') {
            statusCode = 400;
            arabicMessage = error.message;
        }
        else if (error.code === '42P01' || error.code === '42703') {
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
        version: '1.4.0',
        time: new Date().toISOString(),
    });
    fastify.get('/health', healthHandler);
    fastify.get('/api/health', healthHandler);
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
    await fastify.register(company_routes_js_1.companyRoutes, { prefix: '/api/company' });
    await fastify.register(search_routes_js_1.searchRoutes, { prefix: '/api/search' });
    await fastify.register(sync_routes_js_1.syncRoutes, { prefix: '/api/sync' });
    await autoEnsureSchema();
    const port = parseInt(process.env.PORT || '4000', 10);
    const host = '127.0.0.1';
    await fastify.listen({ port, host });
    console.log(`Fludo ERP API server running on http://${host}:${port}`);
}
start().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
