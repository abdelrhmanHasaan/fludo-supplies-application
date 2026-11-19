"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const db_js_1 = require("../config/db.js");
const security_js_1 = require("../utils/security.js");
const authRoutes = async (fastify) => {
    // Ensure default admin user exists
    fastify.post('/seed-admin', async (req, reply) => {
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
            return { status: 'created', username: 'admin', defaultPass: 'admin123456', defaultPin: '1234' };
        }
        return { status: 'already_exists' };
    });
    // Login
    fastify.post('/login', async (req, reply) => {
        const { username, password } = req.body;
        if (!username || !password) {
            return reply.status(400).send({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
        }
        const res = await db_js_1.pool.query(`SELECT u.*, r.code AS role_code 
       FROM app.users u
       LEFT JOIN app.user_roles ur ON ur.user_id = u.id
       LEFT JOIN app.roles r ON r.id = ur.role_id
       WHERE lower(u.username) = lower($1) AND NOT u.is_deleted`, [username]);
        if (res.rows.length === 0) {
            return reply.status(401).send({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        const user = res.rows[0];
        if (!user.is_active) {
            return reply.status(403).send({ error: 'هذا الحساب معطل، يرجى مراجعة الإدارة' });
        }
        const isValid = await (0, security_js_1.verifySecret)(password, user.password_hash);
        if (!isValid) {
            return reply.status(401).send({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
        }
        const token = (0, security_js_1.signToken)({
            userId: user.id,
            username: user.username,
            role: user.role_code || 'accountant',
        });
        return {
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                role: user.role_code || 'accountant',
            },
        };
    });
    // Current user info
    fastify.get('/me', async (req, reply) => {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ error: 'غير مصرح بالدخول' });
        }
        const token = authHeader.substring(7);
        const decoded = (0, security_js_1.verifyToken)(token);
        if (!decoded) {
            return reply.status(401).send({ error: 'الجلسة منتهية، يرجى تسجيل الدخول مجدداً' });
        }
        const res = await db_js_1.pool.query(`SELECT u.id, u.username, u.full_name, r.code AS role
       FROM app.users u
       LEFT JOIN app.user_roles ur ON ur.user_id = u.id
       LEFT JOIN app.roles r ON r.id = ur.role_id
       WHERE u.id = $1`, [decoded.userId]);
        if (res.rows.length === 0) {
            return reply.status(404).send({ error: 'المستخدم غير موجود' });
        }
        return { user: res.rows[0] };
    });
};
exports.authRoutes = authRoutes;
