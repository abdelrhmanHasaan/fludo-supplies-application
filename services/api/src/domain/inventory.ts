import type { PoolClient } from 'pg';

export interface StockMovementInput {
  branchId?: string;
  productId: string;
  movementType:
    | 'opening'
    | 'purchase_receipt'
    | 'purchase_return'
    | 'sale_issue'
    | 'sales_return'
    | 'transfer_in'
    | 'transfer_out'
    | 'adjustment';
  quantity: number; // positive = add, negative = deduct
  unitCost?: number;
  sourceType?: string;
  sourceId?: string;
  notes?: string;
}

export async function recordStockMovement(
  client: PoolClient,
  movement: StockMovementInput
): Promise<string> {
  let branchId = movement.branchId;
  if (!branchId) {
    const bRes = await client.query("SELECT id FROM app.branches WHERE code = 'MAIN' OR is_active = true LIMIT 1");
    if (bRes.rows.length === 0) {
      const newB = await client.query(
        "INSERT INTO app.branches (code, name, is_active) VALUES ('MAIN', 'المقر الرئيسي', true) RETURNING id"
      );
      branchId = newB.rows[0].id;
    } else {
      branchId = bRes.rows[0].id;
    }
  }

  const today = new Date().toISOString().split('T')[0];

  const res = await client.query(
    `INSERT INTO app.stock_movements (
      branch_id, product_id, movement_date, quantity, movement_type, unit_cost, source_type, source_id, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id`,
    [
      branchId,
      movement.productId,
      today,
      movement.quantity,
      movement.movementType,
      movement.unitCost || 0,
      movement.sourceType || null,
      movement.sourceId || null,
      movement.notes || null,
    ]
  );

  return res.rows[0].id;
}

export async function getProductStockOverview(client: PoolClient, productId?: string) {
  let query = `
    SELECT 
      v.product_id,
      v.code AS product_code,
      v.name AS product_name,
      p.kind,
      p.default_sale_price,
      COALESCE(p.default_purchase_price, 0) AS default_purchase_price,
      COALESCE(p.min_stock, 0) AS min_stock,
      COALESCE(p.unit_name, u.name, 'قطعة') AS unit_name,
      v.qty_on_hand AS physical_stock,
      v.qty_reserved AS reserved_qty,
      v.qty_available AS available_stock,
      v.qty_incoming AS incoming_qty,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'branch_id', soh.branch_id,
          'branch_name', b.name,
          'qty_on_hand', soh.qty_on_hand
        ))
        FROM app.v_stock_on_hand soh
        JOIN app.branches b ON b.id = soh.branch_id
        WHERE soh.product_id = v.product_id AND NOT b.is_deleted
      ), '[]'::jsonb) AS branch_stocks
    FROM app.v_product_availability v
    JOIN app.products p ON p.id = v.product_id
    LEFT JOIN app.units u ON u.id = p.unit_id
    WHERE NOT p.is_deleted
  `;

  const params: any[] = [];
  if (productId) {
    query += ' AND v.product_id = $1';
    params.push(productId);
  }
  query += ' ORDER BY v.code, v.name';

  const res = await client.query(query, params);
  return res.rows;
}
