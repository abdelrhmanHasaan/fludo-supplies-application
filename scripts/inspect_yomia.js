import ExcelJS from 'exceljs';
import path from 'node:path';

const originalPath = 'C:/Users/Abdelrhman/.gemini/antigravity/brain/11761ab4-9226-4e3d-b4e9-0410c9946ca1/.user_uploaded/media_1795109794092_37ae080c.xlsx';

async function inspect() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(originalPath);

  console.log(`Workbook loaded. Total sheets: ${wb.worksheets.length}`);
  wb.worksheets.forEach((ws, idx) => {
    console.log(`\nSheet [${idx + 1}]: "${ws.name}", views: ${JSON.stringify(ws.views)}`);
    console.log(`  Row count: ${ws.rowCount}, Col count: ${ws.columnCount}`);
    
    // Print first 10 rows sample
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const values = [];
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const val = typeof cell.value === 'object' && cell.value?.formula 
          ? `FORMULA:${cell.value.formula}` 
          : cell.value;
        values.push(`[C${colNumber}:${val}]`);
      });
      if (values.length > 0) {
        console.log(`  Row ${r}: ${values.slice(0, 8).join(', ')}`);
      }
    }
  });
}

inspect().catch(console.error);
