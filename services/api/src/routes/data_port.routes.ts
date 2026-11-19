import type { FastifyPluginAsync } from 'fastify';
import { pool, withTransaction } from '../config/db.js';
import { parseExcelWorkbook, commitImportedData, ImportPreviewResult } from '../domain/importer.js';
import {
  exportCustomersToExcel,
  exportProductsToExcel,
  exportCustomerStatementToExcel,
  exportDatabaseToSql,
  exportFullSqlBackup,
  exportYomiaWorkbook,
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

  // 3. Template Download
  fastify.get('/template/excel', async (req, reply) => {
    const buffer = await generateImportTemplateExcel();
    reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="fludo_import_template.xlsx"')
      .send(buffer);
  });

  // 4. Export Yomia Full 10-Sheet Workbook (Template-Fill Matching يوميه.xlsx)
  fastify.get('/export/yomia', async (req, reply) => {
    const { fix_formulas } = req.query as any;
    const shouldFix = fix_formulas !== 'false';

    const client = await pool.connect();
    try {
      const buffer = await exportYomiaWorkbook(client, shouldFix);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="yomia_Fludo_ERP.xlsx"; filename*=UTF-8''${encodeURIComponent('يوميه_Fludo_ERP.xlsx')}`)
        .send(buffer);
    } finally {
      client.release();
    }
  });

  // 5. Export Customers to Excel
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

  // 6. Export Products to Excel
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

  // 7. Export Customer Statement to Excel
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

  // 8. Export Portable Data SQL
  fastify.get('/export/sql', async (req, reply) => {
    const client = await pool.connect();
    try {
      const sql = await exportDatabaseToSql(client);
      reply
        .header('Content-Type', 'application/sql')
        .header('Content-Disposition', 'attachment; filename="fludo_erp_data.sql"')
        .send(sql);
    } finally {
      client.release();
    }
  });

  // 9. Export Full PostgreSQL Backup via pg_dump
  fastify.get('/export/sql/full-backup', async (req, reply) => {
    try {
      const sqlDump = await exportFullSqlBackup();
      reply
        .header('Content-Type', 'application/sql')
        .header('Content-Disposition', 'attachment; filename="fludo_erp_full_backup.sql"')
        .send(sqlDump);
    } catch (err: any) {
      reply.status(500).send({ error: err.message || 'فشل إنشاء النسخة الاحتياطية الكاملة' });
    }
  });

  // 10. Import / Restore SQL Script
  fastify.post('/import/sql', async (req, reply) => {
    const { sqlScript } = req.body as { sqlScript: string };
    if (!sqlScript || !sqlScript.trim()) {
      return reply.status(400).send({ error: 'يرجى تقديم نص كود SQL' });
    }

    // Safety checks against dangerous drops
    if (sqlScript.toLowerCase().includes('drop database') || sqlScript.toLowerCase().includes('drop schema public')) {
      return reply.status(403).send({ error: 'محظور: لا يمكن تنفيذ أوامر حذف قاعدة البيانات الأساسية' });
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
