import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { hashSecret, verifySecret, signToken, verifyToken } from '../utils/security.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Check system setup status (does any active user exist?)
  fastify.get('/status', async () => {
    const res = await pool.query(
      `SELECT count(*)::int AS count FROM app.users WHERE NOT is_deleted AND last_login_at IS NOT NULL`
    );
    const count = res.rows[0]?.count || 0;

    const totalRes = await pool.query(
      `SELECT count(*)::int AS count FROM app.users WHERE NOT is_deleted`
    );
    const totalCount = totalRes.rows[0]?.count || 0;

    const compRes = await pool.query(
      `SELECT name_ar FROM app.company_profile LIMIT 1`
    ).catch(() => ({ rows: [] }));

    const userRes = await pool.query(
      `SELECT full_name FROM app.users WHERE NOT is_deleted ORDER BY created_at ASC LIMIT 1`
    ).catch(() => ({ rows: [] }));

    return {
      initialized: count > 0,
      userCount: totalCount,
      companyName: compRes.rows[0]?.name_ar || 'شركة الرضا للتوريدات',
      adminName: userRes.rows[0]?.full_name || 'مدير النظام',
    };
  });

  // First-run setup wizard: create initial admin & company profile
  fastify.post('/setup', async (req, reply) => {
    const { companyName, adminFullName, username, password, managerPin } = req.body as any;

    // Check if system is already initialized with an active logged-in user
    const checkUsers = await pool.query(
      `SELECT count(*)::int AS count FROM app.users WHERE NOT is_deleted AND last_login_at IS NOT NULL`
    );
    if ((checkUsers.rows[0]?.count || 0) > 0) {
      return reply.status(403).send({ error: 'تم تهيئة النظام مسبقاً، يرجى إدخال كلمة المرور' });
    }

    if (!companyName || !companyName.trim()) {
      return reply.status(400).send({ error: 'اسم الشركة مطلوب' });
    }
    if (!adminFullName || !adminFullName.trim()) {
      return reply.status(400).send({ error: 'الاسم الكامل لمدير النظام مطلوب' });
    }
    if (!password || password.length < 12) {
      return reply.status(400).send({ error: 'كلمة المرور يجب ألا تقل عن 12 حرفاً وفقاً لمعايير الأمان' });
    }
    if (!managerPin || !/^\d{4}$/.test(managerPin.toString().trim())) {
      return reply.status(400).send({ error: 'رمز موافقة المدير (PIN) يجب أن يتكون من 4 أرقام بالضبط' });
    }

    const cleanFullName = adminFullName.trim();
    const cleanUsername = (username && username.trim().length >= 3)
      ? username.trim().toLowerCase()
      : 'admin';
    const cleanCompanyName = companyName.trim();
    const cleanPin = managerPin.toString().trim();

    const passwordHash = await hashSecret(password);
    const pinHash = await hashSecret(cleanPin);

    const result = await withTransaction(async (client) => {
      // 1. Update company / tenant name if tenant exists
      await client.query(
        `UPDATE app.tenants SET name = $1, updated_at = NOW()`,
        [cleanCompanyName]
      );
      await client.query(
        `UPDATE app.company_profile SET name_ar = $1, updated_at = NOW()`,
        [cleanCompanyName]
      );

      // Clean up any unauthenticated placeholder users
      await client.query(`DELETE FROM app.users WHERE last_login_at IS NULL`);

      // 2. Ensure admin role exists
      let roleRes = await client.query(`SELECT id FROM app.roles WHERE code = 'admin'`);
      let roleId = roleRes.rows[0]?.id;
      if (!roleId) {
        const newRole = await client.query(
          `INSERT INTO app.roles (code, name_ar, description) 
           VALUES ('admin', 'مدير النظام', 'صلاحيات كاملة على كافة أجزاء النظام') 
           RETURNING id`
        );
        roleId = newRole.rows[0].id;
      }

      // 3. Create administrator user
      const userRes = await client.query(
        `INSERT INTO app.users (
          username, full_name, password_hash, manager_pin_hash, 
          is_active, must_change_password, failed_attempts, last_login_at
        ) VALUES ($1, $2, $3, $4, true, false, 0, NOW())
        RETURNING id, username, full_name`,
        [cleanUsername, cleanFullName, passwordHash, pinHash]
      );
      const user = userRes.rows[0];

      // 4. Assign admin role
      await client.query(
        `INSERT INTO app.user_roles (user_id, role_id) 
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [user.id, roleId]
      );

      return user;
    });

    const token = signToken({
      userId: result.id,
      username: result.username,
      role: 'admin',
    });

    return {
      message: 'تم إعداد النظام وإنشاء حساب المدير بنجاح',
      token,
      user: {
        id: result.id,
        username: result.username,
        fullName: result.full_name,
        role: 'admin',
      },
    };
  });

  // Login (supports password-only for desktop manager, or PIN, or username+password)
  fastify.post('/login', async (req, reply) => {
    const { username, password, pin } = req.body as any;
    const providedSecret = (password || pin || '').toString().trim();

    if (!providedSecret) {
      return reply.status(400).send({ error: 'يرجى إدخال كلمة المرور لدخول النظام' });
    }

    let user: any = null;

    if (username && username.trim()) {
      const res = await pool.query(
        `SELECT u.*, r.code AS role_code 
         FROM app.users u
         LEFT JOIN app.user_roles ur ON ur.user_id = u.id
         LEFT JOIN app.roles r ON r.id = ur.role_id
         WHERE lower(u.username) = lower($1) AND NOT u.is_deleted`,
        [username.trim()]
      );
      if (res.rows.length > 0) {
        user = res.rows[0];
      }
    } else {
      // Password-only login: default to the primary system manager/admin
      const res = await pool.query(
        `SELECT u.*, r.code AS role_code 
         FROM app.users u
         LEFT JOIN app.user_roles ur ON ur.user_id = u.id
         LEFT JOIN app.roles r ON r.id = ur.role_id
         WHERE NOT u.is_deleted
         ORDER BY (r.code = 'admin') DESC, u.created_at ASC
         LIMIT 1`
      );
      if (res.rows.length > 0) {
        user = res.rows[0];
      }
    }

    if (!user) {
      return reply.status(401).send({ error: 'لم يتم العثور على حساب مسجل، يرجى إعداد النظام أولاً' });
    }

    // Check temporary lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const waitMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      return reply.status(429).send({
        error: `الحساب مقفل مؤقتاً لتكرار محاولات الدخول الخاطئة. يرجى المحاولة بعد ${waitMinutes} دقيقة.`,
      });
    }

    if (!user.is_active) {
      return reply.status(403).send({ error: 'هذا الحساب معطل، يرجى مراجعة الإدارة' });
    }

    // Verify against password_hash OR manager_pin_hash
    let isValid = await verifySecret(providedSecret, user.password_hash);
    if (!isValid && user.manager_pin_hash) {
      isValid = await verifySecret(providedSecret, user.manager_pin_hash);
    }

    if (!isValid) {
      const newAttempts = (user.failed_attempts || 0) + 1;
      let lockSql = `UPDATE app.users SET failed_attempts = $1 WHERE id = $2`;
      let params: any[] = [newAttempts, user.id];

      if (newAttempts >= 5) {
        lockSql = `UPDATE app.users SET failed_attempts = $1, locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $2`;
      }
      await pool.query(lockSql, params);

      return reply.status(401).send({ error: 'كلمة المرور غير صحيحة' });
    }

    // Reset failed attempts on success
    await pool.query(
      `UPDATE app.users 
       SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() 
       WHERE id = $1`,
      [user.id]
    );

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role_code || 'admin',
    });

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role_code || 'admin',
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
    const decoded = verifyToken(token);
    if (!decoded) {
      return reply.status(401).send({ error: 'الجلسة منتهية، يرجى تسجيل الدخول مجدداً' });
    }

    const res = await pool.query(
      `SELECT u.id, u.username, u.full_name, r.code AS role
       FROM app.users u
       LEFT JOIN app.user_roles ur ON ur.user_id = u.id
       LEFT JOIN app.roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND NOT u.is_deleted`,
      [decoded.userId]
    );

    if (res.rows.length === 0) {
      return reply.status(404).send({ error: 'المستخدم غير موجود' });
    }

    return { user: res.rows[0] };
  });
};
