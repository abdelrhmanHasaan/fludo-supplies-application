import pg from 'pg';

const { Pool } = pg;

export interface TxContext {
  userId?: string;
  editApprovalId?: string;
}

let activePool: pg.Pool | null = null;

export function resetPool(): void {
  if (activePool) {
    try {
      activePool.end().catch(() => {});
    } catch {}
    activePool = null;
  }
}

export function getPool(): pg.Pool {
  if (!activePool) {
    const port = parseInt(process.env.PGPORT || '5433', 10);
    activePool = new Pool({
      host: process.env.PGHOST || '127.0.0.1',
      port,
      database: process.env.PGDATABASE || 'fludo_erp',
      user: process.env.PGUSER || 'erp_owner',
      password: process.env.PGPASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return activePool;
}

export const pool = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    const p = getPool();
    const val = (p as any)[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  },
});

export async function withTransaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>,
  ctx?: TxContext
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (ctx?.userId) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
    }
    if (ctx?.editApprovalId) {
      await client.query("SELECT set_config('app.edit_approval_id', $1, true)", [ctx.editApprovalId]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

