import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';
import { getProductStockOverview } from '../domain/inventory.js';

export const productsRoutes: FastifyPluginAsync = async (fastify) => {
  // List all products with current stock and unit info
  fastify.get('/', async (req, reply) => {
    const products = await getProductStockOverview(pool as any);
    return products.map((p) => ({
      ...p,
      default_sale_price: parseFloat(p.default_sale_price),
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

  // Create or Update Product
  fastify.post('/', async (req, reply) => {
    const { code, name, kind, unit_id, default_sale_price, min_stock_alert } = req.body as any;
    if (!name || !code) return reply.status(400).send({ error: 'كود الصنف واسمه مطلوبان' });

    const res = await pool.query(
      `INSERT INTO app.products (
        code, name, kind, unit_id, default_sale_price, min_stock_alert
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        unit_id = EXCLUDED.unit_id,
        default_sale_price = EXCLUDED.default_sale_price,
        min_stock_alert = EXCLUDED.min_stock_alert,
        updated_at = now()
      RETURNING *`,
      [
        code,
        name,
        kind || 'goods',
        unit_id || null,
        default_sale_price || 0,
        min_stock_alert || 0,
      ]
    );

    return res.rows[0];
  });
};

