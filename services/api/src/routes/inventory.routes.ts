import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { getProductStockOverview, recordStockMovement } from '../domain/inventory.js';
import { postJournalEntry } from '../domain/accounting.js';

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // Stock Overview
  fastify.get('/', async (req, reply) => {
    const stock = await getProductStockOverview(pool as any);
    return stock.map((s) => ({
      ...s,
      physical_stock: parseFloat(s.physical_stock),
      reserved_qty: parseFloat(s.reserved_qty),
      available_stock: parseFloat(s.available_stock),
      incoming_qty: parseFloat(s.incoming_qty),
    }));
  });

  // Stock Movements Ledger
  fastify.get('/movements', async (req, reply) => {
    const { product_id, limit } = req.query as any;

    let query = `
      SELECT 
        sm.*,
        p.name AS product_name,
        p.code AS product_code,
        u.name AS unit_name,
        TO_CHAR(sm.created_at, 'YYYY-MM-DD HH24:MI') AS created_at_fmt
      FROM app.stock_movements sm
      JOIN app.products p ON p.id = sm.product_id
      LEFT JOIN app.units u ON u.id = p.unit_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (product_id) {
      query += ` AND sm.product_id = $1`;
      params.push(product_id);
    }
    query += ` ORDER BY sm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit || '100', 10));

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      ...r,
      qty: parseFloat(r.qty),
      unit_cost: parseFloat(r.unit_cost || '0'),
    }));
  });

  // Manual Stock Adjustment
  fastify.post('/adjustment', async (req, reply) => {
    const { productId, qty, reason, unitCost } = req.body as any;
    if (!productId || qty === undefined || qty === 0) {
      return reply.status(400).send({ error: 'يرجى تحديد الصنف والكمية' });
    }

    const adjustmentId = await withTransaction(async (client) => {
      const nextNumRes = await client.query("SELECT app.next_doc_number('stock_transfer') AS num");
      const adjNum = nextNumRes.rows[0].num;

      const adjRes = await client.query(
        `INSERT INTO app.stock_adjustments (
          adjustment_number, adjustment_date, status, reason
        ) VALUES ($1, now()::date, 'approved', $2)
        RETURNING id`,
        [adjNum, reason || 'تسوية جردية']
      );
      const adjId = adjRes.rows[0].id;

      await recordStockMovement(client, {
        productId,
        movementType: 'adjustment',
        quantity: parseFloat(qty),
        unitCost: parseFloat(unitCost || '0'),
        sourceType: 'stock_adjustment',
        sourceId: adjId,
        notes: reason || 'تسوية جردية يدوية',
      });

      // Post accounting adjustment if unitCost provided
      if (unitCost && unitCost > 0) {
        const totalAdjValue = Math.abs(parseFloat(qty) * parseFloat(unitCost));
        if (parseFloat(qty) > 0) {
          // Increase inventory: Dr Inventory (1200) / Cr Stock Adjustment (5900)
          await postJournalEntry(client, {
            entryDate: new Date().toISOString().split('T')[0],
            sourceDocType: 'stock_adjustment',
            sourceDocId: adjId,
            narration: `تسوية جرد بالزيادة: ${reason || ''}`,
            lines: [
              { accountCode: '1200', debit: totalAdjValue, credit: 0, description: 'زيادة مخزون' },
              { accountCode: '5900', debit: 0, credit: totalAdjValue, description: 'فروق جرد' },
            ],
          });
        } else {
          // Decrease inventory: Dr Stock Adjustment (5900) / Cr Inventory (1200)
          await postJournalEntry(client, {
            entryDate: new Date().toISOString().split('T')[0],
            sourceDocType: 'stock_adjustment',
            sourceDocId: adjId,
            narration: `تسوية جرد بالنقص: ${reason || ''}`,
            lines: [
              { accountCode: '5900', debit: totalAdjValue, credit: 0, description: 'عجز مخزون' },
              { accountCode: '1200', debit: 0, credit: totalAdjValue, description: 'تخفيض مخزون' },
            ],
          });
        }
      }

      return adjId;
    });

    return { status: 'success', adjustmentId };
  });
};
