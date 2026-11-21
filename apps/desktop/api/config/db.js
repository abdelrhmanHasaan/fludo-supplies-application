"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.withTransaction = withTransaction;
const pg_1 = __importDefault(require("pg"));
const { Pool } = pg_1.default;
exports.pool = new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5433', 10),
    database: process.env.PGDATABASE || 'fludo_erp',
    user: process.env.PGUSER || 'erp_owner',
    password: process.env.PGPASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});
async function withTransaction(callback, ctx) {
    const client = await exports.pool.connect();
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
    }
    catch (error) {
        try {
            await client.query('ROLLBACK');
        }
        catch { }
        throw error;
    }
    finally {
        client.release();
    }
}
