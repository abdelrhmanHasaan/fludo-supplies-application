const fs = require('fs');
const { parseExcelWorkbook } = require('../services/api/dist/domain/importer.js');

async function main() {
  const filePath = 'C:/Users/Abdelrhman/.gemini/antigravity/brain/11761ab4-9226-4e3d-b4e9-0410c9946ca1/.user_uploaded/media_1795109794092_37ae080c.xlsx';
  const buf = fs.readFileSync(filePath);
  const preview = await parseExcelWorkbook(buf);

  console.log('--- parseExcelWorkbook Real Output ---');
  console.log('Customers found:', preview.customersFound.length);
  console.log('Suppliers found:', preview.suppliersFound.length);
  console.log('Products found:', preview.productsFound.length);
  console.log('Employees found:', preview.employeesFound.length);
  console.log('Equipment found:', preview.equipmentFound.length);
  console.log('Totals:', preview.totals);
}
main().catch(console.error);
