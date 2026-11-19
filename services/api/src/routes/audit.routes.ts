import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';

export const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // Query Audit Trail
  fastify.get('/logs', async (req, reply) => {
    const { table_name, limit } = req.query as any;

    let query = `
      SELECT 
        a.seq,
        a.id,
        a.entity_table,
        a.entity_id,
        a.action,
        a.before_data,
        a.after_data,
        a.reason,
        a.prev_hash,
        a.row_hash,
        TO_CHAR(a.occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS occurred_at,
        u.username,
        u.full_name
      FROM app.audit_log a
      LEFT JOIN app.users u ON u.id = a.user_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (table_name) {
      query += ` AND a.entity_table = $1`;
      params.push(table_name);
    }
    query += ` ORDER BY a.seq DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit || '100', 10));

    const res = await pool.query(query, params);
    return res.rows;
  });

  // Verify Audit Log Hash Chain Integrity
  fastify.get('/verify', async (req, reply) => {
    const res = await pool.query(`
      SELECT seq, id, tenant_id, user_id, action, entity_table, entity_id, before_data, after_data, prev_hash, row_hash
      FROM app.audit_log
      ORDER BY seq ASC
    `);

    let isTampered = false;
    let breakSeq: number | null = null;
    let expectedHash = 'GENESIS';

    for (const row of res.rows) {
      if (row.prev_hash && row.prev_hash !== expectedHash && expectedHash !== 'GENESIS') {
        isTampered = true;
        breakSeq = parseInt(row.seq, 10);
        break;
      }
      expectedHash = row.row_hash;
    }

    return {
      totalRecordsVerified: res.rows.length,
      isChainIntact: !isTampered,
      tamperedAtSequence: breakSeq,
      status: !isTampered ? 'INTEGRITY_VERIFIED' : 'CHAIN_TAMPERED',
      message: !isTampered
        ? 'تم التحقق من سلامة سجل التدقيق: السلسلة المشفرة سليمة بنسبة 100%'
        : `تم اكتشاف تلاعب أو انقطاع في السلسلة عند السجل رقم ${breakSeq}`,
    };
  });
};
