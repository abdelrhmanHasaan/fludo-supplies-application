"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productsRoutes = void 0;
const db_js_1 = require("../config/db.js");
const inventory_js_1 = require("../domain/inventory.js");
const productsRoutes = async (fastify) => {
    // List all products with current stock and unit info
    fastify.get('/', async (req, reply) => {
        const products = await (0, inventory_js_1.getProductStockOverview)(db_js_1.pool);
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
        const res = await db_js_1.pool.query('SELECT * FROM app.units ORDER BY name');
        return res.rows;
    });
    // Create Product (Auto-code, free-text unit_name)
    fastify.post('/', async (req, reply) => {
        const { code, name, kind, unit_name, unit_id, default_sale_price, default_purchase_price, min_stock } = req.body;
        if (!name || !name.trim())
            return reply.status(400).send({ error: 'اسم الصنف مطلوب' });
        try {
            const res = await db_js_1.pool.query(`INSERT INTO app.products (
          code, name, kind, unit_name, unit_id, default_sale_price, default_purchase_price, min_stock
        ) VALUES (
          NULLIF(trim($1), ''),
          trim($2),
          $3,
          NULLIF(trim($4), ''),
          $5,
          $6,
          $7,
          $8
        )
        RETURNING *`, [
                code || null,
                name,
                kind || 'goods',
                unit_name || null,
                unit_id || null,
                default_sale_price || 0,
                default_purchase_price || 0,
                min_stock || 0,
            ]);
            return res.rows[0];
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
    // Update Existing Product (Protected by PIN)
    fastify.put('/:id', async (req, reply) => {
        const { id } = req.params;
        const { name, unit_name, default_sale_price, default_purchase_price, min_stock } = req.body;
        try {
            const res = await db_js_1.pool.query(`UPDATE app.products
         SET name = COALESCE(NULLIF(trim($1), ''), name),
             unit_name = COALESCE(NULLIF(trim($2), ''), unit_name),
             default_sale_price = COALESCE($3, default_sale_price),
             default_purchase_price = COALESCE($4, default_purchase_price),
             min_stock = COALESCE($5, min_stock),
             updated_at = now()
         WHERE id = $6 AND NOT is_deleted
         RETURNING *`, [name, unit_name, default_sale_price, default_purchase_price, min_stock, id]);
            if (res.rows.length === 0)
                return reply.status(404).send({ error: 'الصنف غير موجود' });
            return res.rows[0];
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
    });
};
exports.productsRoutes = productsRoutes;
