import ExcelJS from 'exceljs';

const originalPath = 'assets/templates/yomia_template.xlsx';

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(originalPath);

  // Inspect "الاعدادات"
  const s2 = wb.getWorksheet('الاعدادات');
  console.log('--- الاعدادات ---');
  for (let r = 7; r <= 15; r++) {
    const row = s2.getRow(r);
    console.log(`R${r}: B=${row.getCell(2).value}, C=${row.getCell(3).value}, D=${row.getCell(4).value}, E=${row.getCell(5).value} | G=${row.getCell(7).value}, H=${row.getCell(8).value}, I=${row.getCell(9).value}, K=${row.getCell(11).value}`);
  }

  // Inspect "كشف حساب"
  const s5 = wb.getWorksheet('كشف حساب');
  console.log('\n--- كشف حساب ---');
  for (let r = 1; r <= 15; r++) {
    const row = s5.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      cells.push(`C${c}[${cell.address}]=${cell.value}`);
    });
    console.log(`R${r}: ${cells.join(' | ')}`);
  }
}

main().catch(console.error);
