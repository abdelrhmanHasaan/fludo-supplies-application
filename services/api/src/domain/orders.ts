import type { PoolClient } from 'pg';

export interface OrderLineItem {
  productId: string;
  qty: number;
  unitPrice: number;
  notes?: string;
}

export interface CreateOrderParams {
  orderType: 'sales' | 'purchase';
  partyId: string;
  orderDate: string;
  priceGuaranteedUntil?: string;
  notes?: string;
  lines: OrderLineItem[];
}

export async function createOrder(client: PoolClient, params: CreateOrderParams): Promise<string> {
  const docSeq = params.orderType === 'sales' ? 'order_sales' : 'order_purchase';
  const nextNumRes = await client.query(`SELECT app.next_doc_number($1) AS num`, [docSeq]);
  const orderNumber = nextNumRes.rows[0].num;

  const orderRes = await client.query(
    `INSERT INTO app.orders (
      order_no, order_type, party_id, order_date, status, notes
    ) VALUES ($1, $2, $3, $4, 'confirmed', $5)
    RETURNING id`,
    [
      orderNumber,
      params.orderType,
      params.partyId,
      params.orderDate,
      params.notes || null,
    ]
  );
  const orderId = orderRes.rows[0].id;

  let lineNo = 1;
  for (const line of params.lines) {
    await client.query(
      `INSERT INTO app.order_lines (
        order_id, line_no, product_id, qty_ordered, unit_price
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        orderId,
        lineNo++,
        line.productId,
        line.qty,
        line.unitPrice,
      ]
    );
  }

  return orderId;
}
