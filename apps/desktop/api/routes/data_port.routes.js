"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataPortRoutes = void 0;
const db_js_1 = require("../config/db.js");
const importer_js_1 = require("../domain/importer.js");
const exporter_js_1 = require("../domain/exporter.js");
const dataPortRoutes = async (fastify) => {
    // 1. Preview Excel Workbook
    fastify.post('/import/preview', async (req, reply) => {
        const data = await req.file();
        if (!data)
            return reply.status(400).send({ error: 'يرجى رفع ملف إكسيل (.xlsx)' });
        const buffer = await data.toBuffer();
        const preview = await (0, importer_js_1.parseExcelWorkbook)(buffer);
        return preview;
    });
    // 2. Commit Imported Excel Data
    fastify.post('/import/commit', async (req, reply) => {
        const { preview, mode } = req.body;
        if (!preview)
            return reply.status(400).send({ error: 'بيانات الاستيراد مفقودة' });
        const result = await (0, db_js_1.withTransaction)(async (client) => {
            return await (0, importer_js_1.commitImportedData)(client, preview, mode || 'opening_balances');
        });
        return {
            status: 'success',
            ...result,
            message: `تم استيراد ${result.customersCreated} عميل، ${result.suppliersCreated} مورد، ${result.productsCreated} صنف بنجاح!`,
        };
    });
    // 3. Export Customers to Excel
    fastify.get('/export/customers', async (req, reply) => {
        const client = await db_js_1.pool.connect();
        try {
            const buffer = await (0, exporter_js_1.exportCustomersToExcel)(client);
            reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', 'attachment; filename="customers.xlsx"')
                .send(buffer);
        }
        finally {
            client.release();
        }
    });
    // 4. Export Products to Excel
    fastify.get('/export/products', async (req, reply) => {
        const client = await db_js_1.pool.connect();
        try {
            const buffer = await (0, exporter_js_1.exportProductsToExcel)(client);
            reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', 'attachment; filename="products.xlsx"')
                .send(buffer);
        }
        finally {
            client.release();
        }
    });
    // 5. Export Customer Statement to Excel
    fastify.get('/export/statement/:partyId', async (req, reply) => {
        const { partyId } = req.params;
        const { start_date, end_date } = req.query;
        const client = await db_js_1.pool.connect();
        try {
            const buffer = await (0, exporter_js_1.exportCustomerStatementToExcel)(client, partyId, start_date, end_date);
            reply
                .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                .header('Content-Disposition', `attachment; filename="statement_${partyId}.xlsx"`)
                .send(buffer);
        }
        finally {
            client.release();
        }
    });
    // 6. Export SQL Dump
    fastify.get('/export/sql', async (req, reply) => {
        const client = await db_js_1.pool.connect();
        try {
            const sql = await (0, exporter_js_1.exportDatabaseToSql)(client);
            reply
                .header('Content-Type', 'application/sql')
                .header('Content-Disposition', 'attachment; filename="fludo_erp_export.sql"')
                .send(sql);
        }
        finally {
            client.release();
        }
    });
    // 7. Import SQL Script
    fastify.post('/import/sql', async (req, reply) => {
        const { sqlScript } = req.body;
        if (!sqlScript || !sqlScript.trim()) {
            return reply.status(400).send({ error: 'يرجى تقديم نص كود SQL' });
        }
        await (0, db_js_1.withTransaction)(async (client) => {
            await client.query(sqlScript);
        });
        return {
            status: 'success',
            message: 'تم تنفيذ كود SQL واستيراد البيانات بنجاح',
        };
    });
};
exports.dataPortRoutes = dataPortRoutes;
