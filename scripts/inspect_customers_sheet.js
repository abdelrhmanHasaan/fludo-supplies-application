import ExcelJS from 'exceljs';

const originalPath = 'assets/templates/yomia_template.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(originalPath);

  const s6 = wb.getWorksheet('حسابات العملاء');
  console.log('--- حسابات العملاء ---');
  console.log('Rows:', s6.rowCount, 'Cols:', s6.columnCount);
  for (let r = 1; r <= 25; r++) {
    const row = s6.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const v = typeof cell.value === 'object' && cell.value?.formula ? `F:${cell.value.formula}` : cell.value;
      cells.push(`C${c}=${v}`);
    });
    if (cells.length > 0) console.log(`R${r}: ${cells.slice(0, 10).join(' | ')}`);
  }
}

main().catch(console.error);
