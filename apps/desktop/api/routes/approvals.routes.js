"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvalsRoutes = void 0;
const db_js_1 = require("../config/db.js");
const security_js_1 = require("../utils/security.js");
const approvalsRoutes = async (fastify) => {
    // Request / Grant Manager Approval via 4-Digit PIN
    fastify.post('/verify-pin', async (req, reply) => {
        const { targetTable, targetId, reason, managerPin } = req.body;
        if (!targetTable || !targetId || !reason || !managerPin) {
            return reply.status(400).send({
                error: 'يرجى تقديم اسم الجدول، معرف السجل، سبب التعديل، والرقم السري للمدير',
            });
        }
        // 1. Fetch manager user who has manager_pin_hash and admin/approval permission
        const userRes = await db_js_1.pool.query(`
      SELECT u.id, u.username, u.manager_pin_hash 
      FROM app.users u
      JOIN app.user_roles ur ON ur.user_id = u.id
      JOIN app.roles r ON r.id = ur.role_id
      WHERE r.code = 'admin' AND u.manager_pin_hash IS NOT NULL AND u.is_active
      LIMIT 1
    `);
        if (userRes.rows.length === 0) {
            return reply.status(403).send({ error: 'لا يوجد حساب مدير مفعل بالرقم السري' });
        }
        const manager = userRes.rows[0];
        const isPinValid = await (0, security_js_1.verifySecret)(managerPin, manager.manager_pin_hash);
        if (!isPinValid) {
            return reply.status(401).send({ error: 'الرقم السري للمدير غير صحيح' });
        }
        // 2. Insert into app.edit_approvals with 5 minute expiry
        const grantRes = await db_js_1.pool.query(`INSERT INTO app.edit_approvals (
        target_table, target_id, reason, approved_by, valid_until
      ) VALUES ($1, $2, $3, $4, now() + interval '5 minutes')
      RETURNING id, valid_until`, [targetTable, targetId, reason, manager.id]);
        const grant = grantRes.rows[0];
        return {
            status: 'granted',
            approvalId: grant.id,
            validUntil: grant.valid_until,
            message: 'تم منح إذن التعديل بنجاح لمدة 5 دقائق',
        };
    });
};
exports.approvalsRoutes = approvalsRoutes;
