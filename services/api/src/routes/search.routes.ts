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
        `SELECT id, code, name, default_sale_price, unit_name,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.products
         WHERE is_deleted = false 
           AND (
             code = $1 OR
             code ILIKE ($1 || '%') OR
             name ILIKE ('%' || $1 || '%') OR 
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (code = $1) DESC, (code ILIKE ($1 || '%')) DESC, (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, sml DESC, code ASC
         LIMIT $2`,
        [searchTerm, maxLimit]
      );
      for (const row of prodRes.rows) {
        results.push({
          type: 'product',
          id: row.id,
          title: row.name,
          subtitle: `كود: ${row.code} — الوحدة: ${row.unit_name || '—'} — سعر البيع: ${parseFloat(row.default_sale_price || '0').toLocaleString()} ج.م`,
          code: row.code,
          route: 'inventory',
          meta: { price: parseFloat(row.default_sale_price || '0') },
        });
      }
    }

    // 2. Search Parties (Customers & Suppliers)
    if (!requestedTypes || requestedTypes.includes('customers') || requestedTypes.includes('suppliers') || requestedTypes.includes('parties')) {
      const partyRes = await pool.query(
        `SELECT id, code, name, phone, is_customer, is_supplier,
                similarity(search_text, app.normalize_ar($1)) AS sml
         FROM app.parties
         WHERE is_deleted = false
           AND (
             COALESCE(code, '') = $1 OR
             COALESCE(code, '') ILIKE ($1 || '%') OR
             name ILIKE ('%' || $1 || '%') OR 
             COALESCE(phone, '') ILIKE ('%' || $1 || '%') OR 
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (COALESCE(code, '') = $1) DESC, (COALESCE(code, '') ILIKE ($1 || '%')) DESC, (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, sml DESC, name ASC
         LIMIT $2`,
        [searchTerm, maxLimit]
      );
      for (const row of partyRes.rows) {
        const kind = row.is_customer && row.is_supplier ? 'عميل ومورد' : row.is_customer ? 'عميل' : 'مورد';
        results.push({
          type: row.is_customer ? 'customer' : 'supplier',
          id: row.id,
          title: `${row.code ? `[${row.code}] ` : ''}${row.name}`,
          subtitle: `${kind} — ${row.phone || 'بدون هاتف'}`,
          code: row.code,
          route: row.is_customer ? 'customers' : 'suppliers',
        });
      }
    }

    // 3. Search Invoices (Sales & Purchases)
    if (!requestedTypes || requestedTypes.includes('invoices')) {
      const invRes = await pool.query(
        `SELECT
          si.id, si.invoice_no, 'sale' AS doc_kind, p.name AS party_name, si.net_total,
          TO_CHAR(si.invoice_date, 'YYYY-MM-DD') AS invoice_date
         FROM app.sales_invoices si
         JOIN app.parties p ON p.id = si.party_id
         WHERE si.is_deleted = false AND (si.invoice_no ILIKE ('%' || $1 || '%') OR p.name ILIKE ('%' || $1 || '%'))

         UNION ALL

         SELECT
          pi.id, pi.invoice_no, 'purchase' AS doc_kind, p.name AS party_name, pi.net_total,
          TO_CHAR(pi.invoice_date, 'YYYY-MM-DD') AS invoice_date
         FROM app.purchase_invoices pi
         JOIN app.parties p ON p.id = pi.party_id
         WHERE pi.is_deleted = false AND (pi.invoice_no ILIKE ('%' || $1 || '%') OR p.name ILIKE ('%' || $1 || '%'))

         ORDER BY (invoice_no = $1) DESC, (invoice_no ILIKE ($1 || '%')) DESC, invoice_date DESC
         LIMIT $2`,
        [searchTerm, maxLimit]
      );
      for (const row of invRes.rows) {
        const kindLabel = row.doc_kind === 'sale' ? 'فاتورة بيع' : 'إذن توريد مورد';
        results.push({
          type: 'invoice',
          id: row.id,
          title: `${kindLabel} ${row.invoice_no}`,
          subtitle: `الطرف: ${row.party_name} — التاريخ: ${row.invoice_date} — ${parseFloat(row.net_total || '0').toLocaleString()} ج.م`,
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
             COALESCE(code, '') = $1 OR
             COALESCE(code, '') ILIKE ($1 || '%') OR
             full_name ILIKE ('%' || $1 || '%') OR
             COALESCE(phone, '') ILIKE ('%' || $1 || '%') OR
             search_text ILIKE ('%' || app.normalize_ar($1) || '%') OR
             search_text % app.normalize_ar($1)
           )
         ORDER BY (COALESCE(code, '') = $1) DESC, (COALESCE(code, '') ILIKE ($1 || '%')) DESC, (search_text ILIKE ('%' || app.normalize_ar($1) || '%')) DESC, sml DESC
         LIMIT $2`,
        [searchTerm, maxLimit]
      );
      for (const row of empRes.rows) {
        results.push({
          type: 'employee',
          id: row.id,
          title: `${row.code ? `[${row.code}] ` : ''}${row.full_name}`,
          subtitle: `الوظيفة: ${row.job_title || 'موظف'} — اليومية: ${parseFloat(row.daily_rate || '0')} ج.م`,
          code: row.code,
          route: 'payroll',
        });
      }
    }

    // 5. Search Cash Accounts
    if (!requestedTypes || requestedTypes.includes('treasury') || requestedTypes.includes('cash_accounts')) {
      const cashRes = await pool.query(
        `SELECT id, name, kind
         FROM app.cash_accounts
         WHERE is_deleted = false AND is_active = true
           AND (name ILIKE ('%' || $1 || '%') OR kind ILIKE ('%' || $1 || '%'))
         LIMIT $2`,
        [searchTerm, maxLimit]
      );
      for (const row of cashRes.rows) {
        const kindLabel = row.kind === 'cash' ? 'خزينة كاش' : row.kind === 'wallet' ? 'محفظة إلكترونية' : row.kind === 'bank' ? 'حساب بنكي' : 'حساب آخر';
        results.push({
          type: 'cash_account',
          id: row.id,
          title: row.name,
          subtitle: `نوع الحساب: ${kindLabel}`,
          route: 'treasury',
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
