"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
async function createOrder(client, params) {
    const docSeq = params.orderType === 'sales' ? 'order_sales' : 'order_purchase';
    const nextNumRes = await client.query(`SELECT app.next_doc_number($1) AS num`, [docSeq]);
    const orderNumber = nextNumRes.rows[0].num;
    const branchRes = await client.query("SELECT id FROM app.branches WHERE code = 'MAIN' OR is_active = true LIMIT 1");
    const branchId = branchRes.rows[0]?.id || null;
    const orderRes = await client.query(`INSERT INTO app.orders (
      order_no, order_type, party_id, branch_id, order_date, status, notes
    ) VALUES ($1, $2, $3, $4, $5, 'open', $6)
    RETURNING id`, [
        orderNumber,
        params.orderType,
        params.partyId,
        branchId,
        params.orderDate,
        params.notes || null,
    ]);
    const orderId = orderRes.rows[0].id;
    let lineNo = 1;
    for (const line of params.lines) {
        await client.query(`INSERT INTO app.order_lines (
        order_id, line_no, product_id, qty_ordered, unit_price
      ) VALUES ($1, $2, $3, $4, $5)`, [
            orderId,
            lineNo++,
            line.productId,
            line.qty,
            line.unitPrice,
        ]);
    }
    return orderId;
}
