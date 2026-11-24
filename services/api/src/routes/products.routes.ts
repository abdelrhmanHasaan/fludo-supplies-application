import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';
import { getProductStockOverview } from '../domain/inventory.js';
import { verifySecret } from '../utils/security.js';

export const productsRoutes: FastifyPluginAsync = async (fastify) => {
  // List all products with current stock and unit info
  fastify.get('/', async (req, reply) => {
    const products = await getProductStockOverview(pool as any);
    return products.map((p) => ({
      ...p,
      default_sale_price: parseFloat(p.default_sale_price),
      default_purchase_price: parseFloat(p.default_purchase_price || 0),
      min_stock: parseFloat(p.min_stock || 0),
      physical_stock: parseFloat(p.physical_stock),
      reserved_qty: parseFloat(p.reserved_qty),
      available_stock: parseFloat(p.available_stock),
      incoming_qty: parseFloat(p.incoming_qty),
    }));
  });

  // List units
  fastify.get('/units', async (req, reply) => {
    const res = await pool.query('SELECT * FROM app.units ORDER BY name');
    return res.rows;
  });

  // Create Product (Auto-code, free-text unit_name)
  fastify.post('/', async (req, reply) => {
    const { code, name, kind, unit_name, unit_id, default_sale_price, default_purchase_price, min_stock } = req.body as any;
    if (!name || !name.trim()) return reply.status(400).send({ error: 'اسم الصنف مطلوب' });

    try {
      let finalCode = code?.trim() || null;
      if (!finalCode) {
        const maxRes = await pool.query(
          `SELECT COALESCE(MAX(SUBSTRING(code FROM '^P([0-9]+)$')::integer), 0) + 1 AS next_num 
           FROM app.products 
           WHERE code ~ '^P[0-9]+$'`
        );
        const nextNum = maxRes.rows[0].next_num || 1;
        finalCode = `P${String(nextNum).padStart(4, '0')}`;
      }

      // Learn unit into app.units if new
      if (unit_name && unit_name.trim()) {
        await pool.query(
          `INSERT INTO app.units (name)
           SELECT trim($1)
           WHERE NOT EXISTS (SELECT 1 FROM app.units WHERE lower(name) = lower(trim($1)) AND NOT is_deleted)`,
          [unit_name.trim()]
        );
      }

      const res = await pool.query(
        `INSERT INTO app.products (
          code, name, kind, unit_name, unit_id, default_sale_price, default_purchase_price, min_stock
        ) VALUES (
          $1,
          trim($2),
          $3,
          NULLIF(trim($4), ''),
          $5,
          $6,
          $7,
          $8
        )
        RETURNING *`,
        [
          finalCode,
          name,
          kind || 'goods',
          unit_name || null,
          unit_id || null,
          default_sale_price || 0,
          default_purchase_price || 0,
          min_stock || 0,
        ]
      );

      return res.rows[0];
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Update Existing Product (Protected by PIN)
  fastify.put('/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { name, unit_name, default_sale_price, default_purchase_price, min_stock, pin } = req.body as any;

    if (pin) {
      const managerRes = await pool.query(
        `SELECT u.id, u.manager_pin_hash 
         FROM app.users u 
         JOIN app.roles r ON r.id = u.role_id 
         WHERE r.code = 'admin' AND u.manager_pin_hash IS NOT NULL AND u.is_active 
         LIMIT 1`
      );
      if (managerRes.rows.length === 0) {
        return reply.status(403).send({ error: 'لم يتم تعيين رمز أمان للمدير في النظام' });
      }
      const isPinValid = await verifySecret(pin.toString().trim(), managerRes.rows[0].manager_pin_hash);
      if (!isPinValid) {
        return reply.status(403).send({ error: 'رمز الأمان (PIN) غير صحيح' });
      }
    }

    try {
      if (unit_name && unit_name.trim()) {
        await pool.query(
          `INSERT INTO app.units (name)
           SELECT trim($1)
           WHERE NOT EXISTS (SELECT 1 FROM app.units WHERE lower(name) = lower(trim($1)) AND NOT is_deleted)`,
          [unit_name.trim()]
        );
      }

      const res = await pool.query(
        `UPDATE app.products
         SET name = COALESCE(NULLIF(trim($1), ''), name),
             unit_name = COALESCE(NULLIF(trim($2), ''), unit_name),
             default_sale_price = COALESCE($3, default_sale_price),
             default_purchase_price = COALESCE($4, default_purchase_price),
             min_stock = COALESCE($5, min_stock),
             updated_at = now()
         WHERE id = $6 AND NOT is_deleted
         RETURNING *`,
        [name, unit_name, default_sale_price, default_purchase_price, min_stock, id]
      );
      if (res.rows.length === 0) return reply.status(404).send({ error: 'الصنف غير موجود' });
      return res.rows[0];
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Soft Delete Product (PIN protected)
  fastify.delete('/:id', async (req, reply) => {
    const { id } = req.params as any;
    const { pin } = (req.query || {}) as any;

    if (!pin) {
      return reply.status(403).send({ error: 'حذف الصنف يتطلب إدخال رمز الأمان (PIN)' });
    }

    const managerRes = await pool.query(
      `SELECT u.id, u.manager_pin_hash 
       FROM app.users u 
       JOIN app.roles r ON r.id = u.role_id 
       WHERE r.code = 'admin' AND u.manager_pin_hash IS NOT NULL AND u.is_active 
       LIMIT 1`
    );
    if (managerRes.rows.length === 0) {
      return reply.status(403).send({ error: 'لم يتم تعيين رمز أمان للمدير في النظام' });
    }
    const isPinValid = await verifySecret(pin.toString().trim(), managerRes.rows[0].manager_pin_hash);
    if (!isPinValid) {
      return reply.status(403).send({ error: 'رمز الأمان (PIN) غير صحيح' });
    }

    // Check movements exist
    const moves = await pool.query(`SELECT id FROM app.stock_movements WHERE product_id = $1 LIMIT 1`, [id]);
    if (moves.rows.length > 0) {
      return reply.status(400).send({ error: 'لا يمكن حذف هذا الصنف لوجود حركات مخزنية مسجلة عليه' });
    }

    await pool.query(`UPDATE app.products SET is_deleted = true, updated_at = now() WHERE id = $1`, [id]);
    return { status: 'success', message: 'تم حذف الصنف بنجاح' };
  });
};
