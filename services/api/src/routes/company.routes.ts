import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { hashSecret, verifySecret } from '../utils/security.js';

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

  // 4. Update Company & Manager Profile (Integrated Live Settings)
  fastify.put('/manage', async (req, reply) => {
    const {
      name_ar,
      name_en,
      tagline,
      address,
      phones,
      admin_full_name,
      new_password,
      new_pin,
      current_pin,
    } = req.body as any;

    if (!name_ar || !name_ar.trim()) {
      return reply.status(400).send({ error: 'اسم المنشأة / الشركة مطلوب' });
    }

    try {
      const result = await withTransaction(async (client) => {
        // A. Update company profile
        await client.query(
          `UPDATE app.company_profile
           SET 
             name_ar = $1,
             name_en = COALESCE($2, name_en),
             tagline = COALESCE($3, tagline),
             address = COALESCE($4, address),
             phones = COALESCE($5, phones),
             updated_at = NOW()`,
          [name_ar.trim(), name_en?.trim() || null, tagline?.trim() || null, address?.trim() || null, phones?.trim() || null]
        );
        await client.query(`UPDATE app.tenants SET name = $1, updated_at = NOW()`, [name_ar.trim()]);

        // B. Update manager credentials if requested
        const adminRes = await client.query(
          `SELECT u.* FROM app.users u
           LEFT JOIN app.user_roles ur ON ur.user_id = u.id
           LEFT JOIN app.roles r ON r.id = ur.role_id
           WHERE NOT u.is_deleted
           ORDER BY (r.code = 'admin') DESC, u.created_at ASC
           LIMIT 1`
        );

        if (adminRes.rows.length > 0) {
          const adminUser = adminRes.rows[0];

          // If changing password or PIN and user has a current PIN, verify it
          if ((new_password || new_pin) && current_pin && adminUser.manager_pin_hash) {
            const isPinValid = await verifySecret(current_pin.toString().trim(), adminUser.manager_pin_hash);
            if (!isPinValid) {
              throw new Error('رمز موافقة المدير الحالي غير صحيح');
            }
          }

          let newPassHash: string | null = null;
          if (new_password && new_password.trim()) {
            if (new_password.trim().length < 12) {
              throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 12 حرفاً');
            }
            newPassHash = await hashSecret(new_password.trim());
          }

          let newPinHash: string | null = null;
          if (new_pin && new_pin.toString().trim()) {
            const pinStr = new_pin.toString().trim();
            if (!/^\d{4}$/.test(pinStr)) {
              throw new Error('رمز موافقة المدير (PIN) يجب أن يتكون من 4 أرقام بالضبط');
            }
            newPinHash = await hashSecret(pinStr);
          }

          await client.query(
            `UPDATE app.users
             SET 
               full_name = COALESCE($1, full_name),
               password_hash = COALESCE($2, password_hash),
               manager_pin_hash = COALESCE($3, manager_pin_hash),
               updated_at = NOW()
             WHERE id = $4`,
            [admin_full_name?.trim() || null, newPassHash, newPinHash, adminUser.id]
          );
        }

        const compRes = await client.query('SELECT * FROM app.company_profile LIMIT 1');
        return compRes.rows[0];
      });

      return {
        status: 'success',
        profile: result,
        message: 'تم حفظ وتحديث بيانات المنشأة والمدير بنجاح',
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'فشل تحديث البيانات' });
    }
  });

  // 5. Smart 2-Step Verification Delete Endpoint
  fastify.post('/delete-item', async (req, reply) => {
    const { type, id, pin } = req.body as any;

    if (!type || !id || !pin) {
      return reply.status(400).send({ error: 'يرجى تقديم نوع العنصر، المعرف، ورمز موافقة المدير (PIN)' });
    }

    // 1. Verify Manager PIN
    const managerRes = await pool.query(`
      SELECT u.id, u.manager_pin_hash 
      FROM app.users u
      JOIN app.user_roles ur ON ur.user_id = u.id
      JOIN app.roles r ON r.id = ur.role_id
      WHERE r.code = 'admin' AND u.manager_pin_hash IS NOT NULL AND u.is_active
      LIMIT 1
    `);

    if (managerRes.rows.length === 0) {
      return reply.status(403).send({ error: 'لم يتم العثور على حساب مدير نشط برمز PIN' });
    }

    const isPinValid = await verifySecret(pin.toString().trim(), managerRes.rows[0].manager_pin_hash);
    if (!isPinValid) {
      return reply.status(401).send({ error: 'رمز موافقة المدير (PIN) غير صحيح' });
    }

    // 2. Perform intelligent soft-deletion based on entity type
    try {
      await withTransaction(async (client) => {
        switch (type) {
          case 'customer':
          case 'supplier':
          case 'party':
            await client.query(
              `UPDATE app.parties SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
              [id]
            );
            break;

          case 'product':
            await client.query(
              `UPDATE app.products SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
              [id]
            );
            break;

          case 'invoice':
            // Cancel invoice status and mark deleted
            await client.query(
              `UPDATE app.sales_invoices 
               SET status = 'cancelled', is_deleted = true, deleted_at = NOW() 
               WHERE id = $1`,
              [id]
            );
            // Reverse stock movements if any
            await client.query(
              `UPDATE app.stock_movements 
               SET is_deleted = true, deleted_at = NOW() 
               WHERE source_type = 'sales_invoice' AND source_id = $1`,
              [id]
            );
            break;

          case 'expense':
            await client.query(
              `UPDATE app.expenses SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
              [id]
            );
            break;

          case 'equipment':
            await client.query(
              `UPDATE app.equipment SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
              [id]
            );
            break;

          case 'employee':
            await client.query(
              `UPDATE app.employees SET is_deleted = true, deleted_at = NOW() WHERE id = $1`,
              [id]
            );
            break;

          default:
            throw new Error(`نوع العنصر غير معروف: ${type}`);
        }
      });

      return {
        status: 'success',
        message: 'تم حذف السجل بنجاح مع تأكيد التحقق الأمني الثنائي',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'فشل حذف السجل' });
    }
  });

  // 6. Production Reset: Wipe Movements & Operational Data, Keep Warehouse/Products
  fastify.post('/reset-movements', async (req, reply) => {
    const { pin } = req.body as any;

    if (!pin) {
      return reply.status(400).send({ error: 'رمز موافقة المدير (PIN) مطلوب لتأكيد التفريغ' });
    }

    // Verify Manager PIN
    const managerRes = await pool.query(`
      SELECT u.id, u.manager_pin_hash 
      FROM app.users u
      JOIN app.user_roles ur ON ur.user_id = u.id
      JOIN app.roles r ON r.id = ur.role_id
      WHERE r.code = 'admin' AND u.manager_pin_hash IS NOT NULL AND u.is_active
      LIMIT 1
    `);

    if (managerRes.rows.length === 0) {
      return reply.status(403).send({ error: 'لا يوجد حساب مدير مسجل برمز PIN' });
    }

    const isPinValid = await verifySecret(pin.toString().trim(), managerRes.rows[0].manager_pin_hash);
    if (!isPinValid) {
      return reply.status(401).send({ error: 'رمز موافقة المدير (PIN) غير صحيح' });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET session_replication_role = 'replica'");

        // Delete in reverse foreign key order
        await client.query('DELETE FROM app.payment_allocations');
        await client.query('DELETE FROM app.payments');
        await client.query('DELETE FROM app.sales_invoice_lines');
        await client.query('DELETE FROM app.sales_invoices');
        await client.query('DELETE FROM app.purchase_invoice_lines');
        await client.query('DELETE FROM app.purchase_invoices');
        await client.query('DELETE FROM app.order_lines');
        await client.query('DELETE FROM app.orders');
        await client.query('DELETE FROM app.stock_movements');
        await client.query('DELETE FROM app.shipments');
        await client.query('DELETE FROM app.equipment_expenses');
        await client.query('DELETE FROM app.expenses');
        await client.query('DELETE FROM app.attendance');
        await client.query('DELETE FROM app.payroll_lines');
        await client.query('DELETE FROM app.payroll_periods');
        await client.query('DELETE FROM app.employee_transactions');
        await client.query('DELETE FROM app.journal_lines');
        await client.query('DELETE FROM app.journal_entries');
        await client.query('DELETE FROM app.parties');
        await client.query('DELETE FROM app.edit_approvals');

        await client.query(`UPDATE app.document_sequences SET next_value = 1`);
        await client.query("SET session_replication_role = 'origin'");

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      return {
        status: 'success',
        message: 'تم تصفير الحركات وتفريغ النظام بنجاح مع الحفاظ على أصناف ومخزون المستودع',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'فشل تصفير النظام' });
    }
  });
};
