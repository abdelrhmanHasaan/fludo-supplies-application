"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordStockMovement = recordStockMovement;
exports.getProductStockOverview = getProductStockOverview;
async function recordStockMovement(client, movement) {
    let branchId = movement.branchId;
    if (!branchId) {
        const bRes = await client.query('SELECT id FROM app.branches ORDER BY created_at LIMIT 1');
        if (bRes.rows.length === 0) {
            const newB = await client.query("INSERT INTO app.branches (code, name_ar, is_active) VALUES ('MAIN', 'المقر الرئيسي', true) RETURNING id");
            branchId = newB.rows[0].id;
        }
        else {
            branchId = bRes.rows[0].id;
        }
    }
    const today = new Date().toISOString().split('T')[0];
    const res = await client.query(`INSERT INTO app.stock_movements (
      branch_id, product_id, movement_date, quantity, movement_type, unit_cost, source_type, source_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`, [
        branchId,
        movement.productId,
        today,
        movement.quantity,
        movement.movementType,
        movement.unitCost || 0,
        movement.sourceType || null,
        movement.sourceId || null,
        movement.notes || null,
    ]);
    return res.rows[0].id;
}
async function getProductStockOverview(client, productId) {
    let query = `
    SELECT 
      v.product_id,
      v.code AS product_code,
      v.name AS product_name,
      p.kind,
      p.default_sale_price,
      u.name AS unit_name,
      v.qty_on_hand AS physical_stock,
      v.qty_reserved AS reserved_qty,
      v.qty_available AS available_stock,
      v.qty_incoming AS incoming_qty
    FROM app.v_product_availability v
    JOIN app.products p ON p.id = v.product_id
    LEFT JOIN app.units u ON u.id = p.unit_id
    WHERE NOT p.is_deleted
  `;
    const params = [];
    if (productId) {
        query += ' AND v.product_id = $1';
        params.push(productId);
    }
    query += ' ORDER BY v.code, v.name';
    const res = await client.query(query, params);
    return res.rows;
}
