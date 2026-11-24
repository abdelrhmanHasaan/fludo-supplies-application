const { Pool } = require('pg');

async function testPhase4Inventory() {
  const pool = new Pool({
    connectionString: 'postgresql://erp_owner:erp_password_local_123@127.0.0.1:5434/fludo_erp',
  });

  console.log('--- Testing Phase 4: Inventory & Products ---');

  // 1. Check product stock overview query with branch_stocks
  const testQuery = `
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
    LIMIT 5
  `;
  const overviewRes = await pool.query(testQuery);
  console.log(`✓ Fetched ${overviewRes.rows.length} product rows with branch_stocks`);
  if (overviewRes.rows.length > 0) {
    console.log('Sample product:', {
      name: overviewRes.rows[0].product_name,
      code: overviewRes.rows[0].product_code,
      unit: overviewRes.rows[0].unit_name,
      branch_stocks: overviewRes.rows[0].branch_stocks,
    });
  }

  // 2. Test auto-code generation query
  const maxRes = await pool.query(
    `SELECT COALESCE(MAX(SUBSTRING(code FROM '^P([0-9]+)$')::integer), 0) + 1 AS next_num 
     FROM app.products 
     WHERE code ~ '^P[0-9]+$'`
  );
  const nextNum = maxRes.rows[0].next_num || 1;
  const generatedCode = `P${String(nextNum).padStart(4, '0')}`;
  console.log(`✓ Auto-generated next product code: ${generatedCode}`);

  // 3. Test insert product with free-text unit
  const testUnit = 'شكارة 50كجم';
  await pool.query(
    `INSERT INTO app.units (name)
     SELECT trim($1)
     WHERE NOT EXISTS (SELECT 1 FROM app.units WHERE lower(name) = lower(trim($1)) AND NOT is_deleted)`,
    [testUnit]
  );
  const insertRes = await pool.query(
    `INSERT INTO app.products (code, name, kind, unit_name, default_sale_price, default_purchase_price, min_stock)
     VALUES ($1, 'صنف تجريبي لاختبار المرحلة 4', 'goods', $2, 120.00, 100.00, 10)
     RETURNING *`,
    [generatedCode, testUnit]
  );
  const created = insertRes.rows[0];
  console.log(`✓ Inserted product with free-text unit: ${created.name} (${created.code})`);

  // 4. Clean up test product and unit
  await pool.query('DELETE FROM app.products WHERE id = $1', [created.id]);
  await pool.query('DELETE FROM app.units WHERE name = $1', [testUnit]);
  console.log('✓ Cleaned up test product and unit');

  await pool.end();
  console.log('=== GATE 4: Warehouse & Inventory PASSED ===');
}

testPhase4Inventory().catch((err) => {
  console.error('GATE 4 FAILED:', err);
  process.exit(1);
});
