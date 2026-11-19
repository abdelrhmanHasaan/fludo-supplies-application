import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { hashSecret } from '../utils/security.js';

export const companyRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Get Company Profile & Setup Status
  fastify.get('/profile', async (req, reply) => {
    const res = await pool.query(`
      SELECT 
        id, 
        name_ar, 
        name_en, 
        tagline, 
        address, 
        phones, 
        logo_path
      FROM app.company_profile
      LIMIT 1
    `);

    // Check if onboarding setup has been completed
    const setupCheck = await pool.query(`
      SELECT value FROM app.app_settings 
      WHERE key = 'setup_completed'
      LIMIT 1
    `);

    const isSetupCompleted = setupCheck.rows.length > 0 && setupCheck.rows[0].value === true;

    if (res.rows.length === 0) {
      return {
        name_ar: 'شركة الرضا للتوريدات',
        name_en: 'AL REDA SUPPLIES CO.',
        tagline: 'مواد البناء والتوريدات العامة',
        address: 'كرداسة — الجيزة',
        phones: '01030343576',
        logo_path: '',
        is_setup_completed: false,
      };
    }

    return {
      ...res.rows[0],
      is_setup_completed: isSetupCompleted,
    };
  });

  // 2. Update Company Profile
  fastify.put('/profile', async (req, reply) => {
    const { name_ar, tagline, address, phones, logo_path } = req.body as any;

    if (!name_ar || !name_ar.trim()) {
      return reply.status(400).send({ error: 'اسم الشركة مطلوب' });
    }

    const res = await pool.query(
      `UPDATE app.company_profile
       SET 
         name_ar = $1,
         tagline = COALESCE($2, tagline),
         address = COALESCE($3, address),
         phones = COALESCE($4, phones),
         logo_path = COALESCE($5, logo_path),
         updated_at = NOW()
       RETURNING *`,
      [name_ar.trim(), tagline?.trim() || null, address?.trim() || null, phones?.trim() || null, logo_path || null]
    );

    return {
      status: 'success',
      profile: res.rows[0],
      message: 'تم تحديث بيانات الشركة بنجاح',
    };
  });

  // 3. First-Run Setup Wizard: Configure Company & Primary Admin User
  fastify.post('/setup', async (req, reply) => {
    const {
      company_name,
      tagline,
      address,
      phones,
      admin_full_name,
      admin_username,
      admin_password,
      manager_pin,
    } = req.body as any;

    if (!company_name || !company_name.trim()) {
      return reply.status(400).send({ error: 'يرجى إدخال اسم المنشأة / الشركة' });
    }

    await withTransaction(async (client) => {
      // 1. Update or Insert Company Profile
      const existing = await client.query('SELECT id FROM app.company_profile LIMIT 1');
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE app.company_profile
           SET name_ar = $1, tagline = $2, address = $3, phones = $4, updated_at = NOW()
           WHERE id = $5`,
          [
            company_name.trim(),
            tagline?.trim() || 'التوريدات العامة والتجارة',
            address?.trim() || 'المركز الرئيسي',
            phones?.trim() || '',
            existing.rows[0].id,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO app.company_profile (name_ar, tagline, address, phones)
           VALUES ($1, $2, $3, $4)`,
          [
            company_name.trim(),
            tagline?.trim() || 'التوريدات العامة والتجارة',
            address?.trim() || 'المركز الرئيسي',
            phones?.trim() || '',
          ]
        );
      }

      // 2. Update Admin credentials if provided
      if (admin_password || manager_pin || admin_full_name) {
        const adminRes = await client.query("SELECT id FROM app.users WHERE username = 'admin' OR id IN (SELECT user_id FROM app.user_roles ur JOIN app.roles r ON r.id = ur.role_id WHERE r.code = 'admin') LIMIT 1");
        
        let passwordHash = undefined;
        let pinHash = undefined;

        if (admin_password && admin_password.trim()) {
          passwordHash = await hashSecret(admin_password.trim());
        }
        if (manager_pin && manager_pin.trim()) {
          pinHash = await hashSecret(manager_pin.trim());
        }

        if (adminRes.rows.length > 0) {
          const adminId = adminRes.rows[0].id;
          await client.query(
            `UPDATE app.users
             SET 
               full_name = COALESCE($1, full_name),
               username = COALESCE($2, username),
               password_hash = COALESCE($3, password_hash),
               manager_pin_hash = COALESCE($4, manager_pin_hash),
               updated_at = NOW()
             WHERE id = $5`,
            [
              admin_full_name?.trim() || null,
              admin_username?.trim() || null,
              passwordHash || null,
              pinHash || null,
              adminId,
            ]
          );
        }
      }

      // 3. Mark setup as completed in app.app_settings
      await client.query(
        `INSERT INTO app.app_settings (key, value)
         VALUES ('setup_completed', 'true'::jsonb)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = 'true'::jsonb`
      );
    });

    return {
      status: 'success',
      message: 'تم حفظ إعدادات المنشأة والمستخدم بنجاح وبدء تشغيل النظام',
    };
  });
};
