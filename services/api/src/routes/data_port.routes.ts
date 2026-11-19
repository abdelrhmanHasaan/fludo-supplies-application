import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { parseExcelWorkbook, commitImportedData, ImportPreviewResult } from '../domain/importer.js';
import {
  exportCustomersToExcel,
  exportProductsToExcel,
  exportCustomerStatementToExcel,
  exportDatabaseToSql,
  generateImportTemplateExcel,
} from '../domain/exporter.js';

export const dataPortRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Preview Excel Workbook
  fastify.post('/import/preview', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'يرجى رفع ملف إكسيل (.xlsx)' });

    const buffer = await data.toBuffer();
    const preview = await parseExcelWorkbook(buffer);
    return preview;
  });

  // 2. Commit Imported Excel Data
  fastify.post('/import/commit', async (req, reply) => {
    const { preview, mode } = req.body as { preview: ImportPreviewResult; mode?: 'opening_balances' | 'full' };
    if (!preview) return reply.status(400).send({ error: 'بيانات الاستيراد مفقودة' });

    const result = await withTransaction(async (client) => {
      return await commitImportedData(client, preview, mode || 'opening_balances');
    });

    return {
      status: 'success',
      ...result,
      message: `تم استيراد ${result.customersCreated} عميل، ${result.suppliersCreated} مورد، ${result.productsCreated} صنف بنجاح!`,
    };
  });

  // 3. Export Customers to Excel
  fastify.get('/template/excel', async (req, reply) => {
    const buffer = await generateImportTemplateExcel();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="fludo_import_template.xlsx"')
      .send(buffer);
  });

  // 3. Export Customers to Excel
  fastify.get('/export/customers', async (req, reply) => {
    const client = await pool.connect();
    try {
      const buffer = await exportCustomersToExcel(client);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="customers.xlsx"')
        .send(buffer);
    } finally {
      client.release();
    }
  });

  // 4. Export Products to Excel
  fastify.get('/export/products', async (req, reply) => {
    const client = await pool.connect();
    try {
      const buffer = await exportProductsToExcel(client);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', 'attachment; filename="products.xlsx"')
        .send(buffer);
    } finally {
      client.release();
    }
  });

  // 5. Export Customer Statement to Excel
  fastify.get('/export/statement/:partyId', async (req, reply) => {
    const { partyId } = req.params as any;
    const { start_date, end_date } = req.query as any;

    const client = await pool.connect();
    try {
      const buffer = await exportCustomerStatementToExcel(client, partyId, start_date, end_date);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="statement_${partyId}.xlsx"`)
        .send(buffer);
    } finally {
      client.release();
    }
  });

  // 6. Export SQL Dump
  fastify.get('/export/sql', async (req, reply) => {
    const client = await pool.connect();
    try {
      const sql = await exportDatabaseToSql(client);
      reply
        .header('Content-Type', 'application/sql')
        .header('Content-Disposition', 'attachment; filename="fludo_erp_export.sql"')
        .send(sql);
    } finally {
      client.release();
    }
  });

  // 7. Import SQL Script
  fastify.post('/import/sql', async (req, reply) => {
    const { sqlScript } = req.body as { sqlScript: string };
    if (!sqlScript || !sqlScript.trim()) {
      return reply.status(400).send({ error: 'يرجى تقديم نص كود SQL' });
    }

    await withTransaction(async (client) => {
      await client.query(sqlScript);
    });

    return {
      status: 'success',
      message: 'تم تنفيذ كود SQL واستيراد البيانات بنجاح',
    };
  });
};

