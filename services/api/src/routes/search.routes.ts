import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (req, reply) => {
    const { q, types, limit } = req.query as any;
    if (!q || !q.trim()) {
      return { results: [], total: 0 };
    }

    const searchTerm = q.trim();
    const maxLimit = Math.min(parseInt(limit || '20', 10), 50);
    const requestedTypes = types ? types.split(',').map((t: string) => t.trim()) : null;

    const results: Array<{
      type: string;
      id: string;
      title: string;
      subtitle: string;
      code?: string;
      route: string;
      meta?: any;
    }> = [];

    // 1. Search Products
    if (!requestedTypes || requestedTypes.includes('products')) {
      const prodRes = await pool.query(
        `SELECT id, code, name, default_sale_price,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.products
         WHERE is_deleted = false 
           AND (
             code ILIKE $2 OR 
             name ILIKE $2 OR 
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (code ILIKE $2) DESC, (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, sml DESC, code ASC
         LIMIT $3`,
        [searchTerm, `%${searchTerm}%`, maxLimit]
      );
      for (const row of prodRes.rows) {
        results.push({
          type: 'product',
          id: row.id,
          title: row.name,
          subtitle: `كود: ${row.code} — سعر اليوم: ${parseFloat(row.default_sale_price || '0').toLocaleString()} ج.م`,
          code: row.code,
          route: 'products',
          meta: { price: parseFloat(row.default_sale_price || '0') },
        });
      }
    }

    // 2. Search Parties (Customers & Suppliers)
    if (!requestedTypes || requestedTypes.includes('customers') || requestedTypes.includes('suppliers') || requestedTypes.includes('parties')) {
      const partyRes = await pool.query(
        `SELECT id, name, phone, is_customer, is_supplier,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.parties
         WHERE is_deleted = false
           AND (
             name ILIKE $2 OR 
             phone ILIKE $2 OR 
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, (name ILIKE $2) DESC, sml DESC, name ASC
         LIMIT $3`,
        [searchTerm, `%${searchTerm}%`, maxLimit]
      );
      for (const row of partyRes.rows) {
        const kind = row.is_customer && row.is_supplier ? 'عميل ومورد' : row.is_customer ? 'عميل' : 'مورد';
        results.push({
          type: row.is_customer ? 'customer' : 'supplier',
          id: row.id,
          title: row.name,
          subtitle: `${kind} — ${row.phone || 'بدون هاتف'}`,
          route: row.is_customer ? 'customers' : 'suppliers',
        });
      }
    }

    // 3. Search Sales Invoices
    if (!requestedTypes || requestedTypes.includes('invoices')) {
      const invRes = await pool.query(
        `SELECT i.id, i.invoice_no, p.name AS party_name, i.net_total,
                TO_CHAR(i.invoice_date, 'YYYY-MM-DD') AS invoice_date
         FROM app.sales_invoices i
         JOIN app.parties p ON p.id = i.party_id
         WHERE i.is_deleted = false
           AND (i.invoice_no ILIKE $1 OR p.name ILIKE $1)
         ORDER BY (i.invoice_no ILIKE $1) DESC, i.invoice_date DESC
         LIMIT $2`,
        [`%${searchTerm}%`, maxLimit]
      );
      for (const row of invRes.rows) {
        results.push({
          type: 'invoice',
          id: row.id,
          title: `فاتورة مبيعات ${row.invoice_no}`,
          subtitle: `العميل: ${row.party_name} — التاريخ: ${row.invoice_date} — ${parseFloat(row.net_total || '0').toLocaleString()} ج.م`,
          code: row.invoice_no,
          route: 'invoices',
        });
      }
    }

    // 4. Search Employees
    if (!requestedTypes || requestedTypes.includes('employees')) {
      const empRes = await pool.query(
        `SELECT id, code, full_name, phone, job_title, daily_rate,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.employees
         WHERE is_deleted = false
           AND (
             COALESCE(code, '') ILIKE $2 OR
             full_name ILIKE $2 OR
             COALESCE(phone, '') ILIKE $2 OR
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, (full_name ILIKE $2) DESC, sml DESC
         LIMIT $3`,
        [searchTerm, `%${searchTerm}%`, maxLimit]
      );
      for (const row of empRes.rows) {
        results.push({
          type: 'employee',
          id: row.id,
          title: row.full_name,
          subtitle: `الوظيفة: ${row.job_title || 'عامل'} — اليومية: ${parseFloat(row.daily_rate || '0')} ج.م`,
          code: row.code,
          route: 'payroll',
        });
      }
    }

    // 5. Search Equipment
    if (!requestedTypes || requestedTypes.includes('equipment')) {
      const eqRes = await pool.query(
        `SELECT id, code, name, plate_no, vehicle_description,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.equipment
         WHERE is_deleted = false
           AND (
             COALESCE(code, '') ILIKE $2 OR
             name ILIKE $2 OR
             COALESCE(plate_no, '') ILIKE $2 OR
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, (name ILIKE $2) DESC, sml DESC
         LIMIT $3`,
        [searchTerm, `%${searchTerm}%`, maxLimit]
      );
      for (const row of eqRes.rows) {
        results.push({
          type: 'equipment',
          id: row.id,
          title: `${row.code ? `[${row.code}] ` : ''}${row.name}`,
          subtitle: `رقم اللوحة: ${row.plate_no || 'غير مسجل'} — ${row.vehicle_description || ''}`,
          code: row.code,
          route: 'equipment',
        });
      }
    }

    return {
      results,
      total: results.length,
      query: searchTerm,
    };
  });
};
