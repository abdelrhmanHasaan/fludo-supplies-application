import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../config/db.js';

export const syncRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Get Sync Status
  fastify.get('/status', async (req, reply) => {
    try {
      // Get tenant ID
      const tenantRes = await pool.query(`
        SELECT tenant_id FROM app.installation LIMIT 1;
      `).catch(() => ({ rows: [] }));
      const tenantId = tenantRes.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';

      // Read sync state
      const stateRes = await pool.query(`
        SELECT 
          tenant_id,
          last_pushed_outbox_id,
          last_pulled_cursor,
          last_success_at,
          last_error,
          server_url,
          enabled
        FROM app.sync_state
        LIMIT 1;
      `).catch(() => ({ rows: [] }));

      const state = stateRes.rows[0] || {
        enabled: false,
        server_url: '',
        last_success_at: null,
        last_error: null,
        last_pushed_outbox_id: 0,
      };

      // Count outbox
      const outboxPendingRes = await pool.query(`
        SELECT COUNT(*)::int as count 
        FROM app.sync_outbox 
        WHERE status IN ('pending', 'failed');
      `).catch(() => ({ rows: [{ count: 0 }] }));

      const outboxTotalRes = await pool.query(`
        SELECT COUNT(*)::int as count 
        FROM app.sync_outbox;
      `).catch(() => ({ rows: [{ count: 0 }] }));

      return {
        enabled: Boolean(state.enabled),
        serverUrl: state.server_url || '',
        lastSuccessAt: state.last_success_at,
        lastError: state.last_error,
        lastPushedId: state.last_pushed_outbox_id || 0,
        pendingCount: outboxPendingRes.rows[0]?.count || 0,
        totalCount: outboxTotalRes.rows[0]?.count || 0,
        tenantId,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'فشل جلب حالة المزامنة' });
    }
  });

  // 2. Save Sync Config
  fastify.post('/config', async (req, reply) => {
    try {
      const { serverUrl, enabled, tenantToken } = req.body as any;

      const tenantRes = await pool.query(`
        SELECT tenant_id FROM app.installation LIMIT 1;
      `).catch(() => ({ rows: [] }));
      const tenantId = tenantRes.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';

      await pool.query(
        `INSERT INTO app.sync_state (tenant_id, server_url, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id)
         DO UPDATE SET 
           server_url = EXCLUDED.server_url,
           enabled = EXCLUDED.enabled;`,
        [tenantId, serverUrl?.trim() || null, Boolean(enabled)]
      );

      if (tenantToken !== undefined) {
        await pool.query(
          `INSERT INTO app.app_settings (tenant_id, key, value)
           VALUES ($1, 'cloud_sync_token', $2)
           ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value;`,
          [tenantId, JSON.stringify(tenantToken?.trim() || '')]
        );
      }

      return {
        success: true,
        message: 'تم حفظ إعدادات المزامنة والربط السحابي بنجاح',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'فشل حفظ إعدادات المزامنة' });
    }
  });

  // 3. Test Connection to Cloud Server
  fastify.post('/test', async (req, reply) => {
    const { serverUrl } = req.body as any;
    if (!serverUrl || !serverUrl.trim()) {
      return reply.status(400).send({ error: 'يرجى إدخال رابط خادم المزامنة السحابي أولاً' });
    }

    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    const candidateEndpoints = [`${cleanUrl}/api/health`, `${cleanUrl}/health`, cleanUrl];

    let lastError = '';
    for (const endpoint of candidateEndpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(endpoint, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          return {
            success: true,
            message: `تم التحقق من الاتصال بنجاح مع الخادم السحابي (${cleanUrl})`,
            endpointUsed: endpoint,
          };
        }
      } catch (e: any) {
        lastError = e.message || 'تعذر الوصول إلى الخادم';
      }
    }

    return reply.status(502).send({
      success: false,
      error: `تعذر الوصول إلى خادم المزامنة على الرابط (${cleanUrl}). تأكد من أن السيرفر السحابي يعمل ومتاح عبر الإنترنت. التفاصيل: ${lastError}`,
    });
  });

  // 4. Trigger Sync Now
  fastify.post('/trigger', async (req, reply) => {
    try {
      // Read state
      const stateRes = await pool.query(`SELECT * FROM app.sync_state LIMIT 1;`);
      const state = stateRes.rows[0];

      if (!state || !state.server_url) {
        return reply.status(400).send({
          error: 'لم يتم تحديد رابط السيرفر السحابي بعد. يرجى إدخال الرابط وتفعيله أولاً.',
        });
      }

      // Fetch pending records from outbox
      const pendingRes = await pool.query(`
        SELECT id, entity_table, entity_id, operation, row_version, payload, idempotency_key
        FROM app.sync_outbox
        WHERE status IN ('pending', 'failed')
        ORDER BY id ASC
        LIMIT 100;
      `);

      const count = pendingRes.rows.length;
      if (count === 0) {
        await pool.query(`
          UPDATE app.sync_state 
          SET last_success_at = now(), last_error = NULL;
        `);
        return {
          success: true,
          message: 'جميع السجلات المحلية متطابقة ومزامنة بالكامل مع السيرفر.',
          pushedCount: 0,
        };
      }

      // Attempt push to server
      const cleanUrl = state.server_url.trim().replace(/\/+$/, '');
      const pushUrl = `${cleanUrl}/api/sync/receive`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const pushRes = await fetch(pushUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: pendingRes.rows }),
          signal: controller.signal,
        });
        clearTimeout(pushRes.ok ? 0 : 0);

        if (pushRes.ok) {
          const maxId = pendingRes.rows[pendingRes.rows.length - 1].id;
          await pool.query(`
            UPDATE app.sync_outbox
            SET status = 'sent', sent_at = now()
            WHERE id <= $1;
          `, [maxId]);

          await pool.query(`
            UPDATE app.sync_state
            SET last_pushed_outbox_id = $1, last_success_at = now(), last_error = NULL;
          `, [maxId]);

          return {
            success: true,
            message: `تمت مزامنة ورفع ${count} سجل بنجاح إلى السيرفر السحابي!`,
            pushedCount: count,
          };
        } else {
          throw new Error(`استجاب السيرفر بكود خطأ: ${pushRes.status}`);
        }
      } catch (netErr: any) {
        const errMsg = `فشل الاتصال بنقطة استقبال المزامنة بالسيرفر: ${netErr.message}`;
        await pool.query(`
          UPDATE app.sync_state
          SET last_error = $1;
        `, [errMsg]);

        return reply.status(503).send({
          success: false,
          error: `${errMsg}. (السجلات محفوظة محلياً في صندوق الانتظار بأمان وسيتم رفعها تلقائياً فور توفر السيرفر)`,
          pendingCount: count,
        });
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'حدث خطأ أثناء المزامنة' });
    }
  });

  // 5. Enqueue all master records for initial replication
  fastify.post('/enqueue-all', async (req, reply) => {
    try {
      const tenantRes = await pool.query(`SELECT tenant_id FROM app.installation LIMIT 1;`).catch(() => ({ rows: [] }));
      const tenantId = tenantRes.rows[0]?.tenant_id || '00000000-0000-0000-0000-000000000001';

      // 1. Products
      const productsRes = await pool.query(`SELECT id, code, name, kind, default_sale_price, default_purchase_price, is_active FROM app.products;`);
      let enqueued = 0;

      for (const p of productsRes.rows) {
        const key = `init_product_${p.id}`;
        await pool.query(`
          INSERT INTO app.sync_outbox (tenant_id, entity_table, entity_id, operation, row_version, payload, idempotency_key, status)
          VALUES ($1, 'app.products', $2, 'insert', 1, $3, $4, 'pending')
          ON CONFLICT (idempotency_key) DO NOTHING;
        `, [tenantId, p.id, JSON.stringify(p), key]);
        enqueued++;
      }

      // 2. Parties
      const partiesRes = await pool.query(`SELECT id, code, name, phone, address, credit_limit, is_customer, is_supplier, is_active FROM app.parties;`);
      for (const prt of partiesRes.rows) {
        const key = `init_party_${prt.id}`;
        await pool.query(`
          INSERT INTO app.sync_outbox (tenant_id, entity_table, entity_id, operation, row_version, payload, idempotency_key, status)
          VALUES ($1, 'app.parties', $2, 'insert', 1, $3, $4, 'pending')
          ON CONFLICT (idempotency_key) DO NOTHING;
        `, [tenantId, prt.id, JSON.stringify(prt), key]);
        enqueued++;
      }

      return {
        success: true,
        message: `تم تجهيز وإدراج ${enqueued} سجل رئيسي في طابور المزامنة السحابية بنجاح.`,
        enqueuedCount: enqueued,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || 'فشل إدراج السجلات في طابور المزامنة' });
    }
  });
};
