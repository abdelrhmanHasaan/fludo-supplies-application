const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:3000';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runUITests() {
  console.log('====================================================');
  console.log('   FLUDO ERP — AUTOMATED WINDOWS UI TEST SUITE     ');
  console.log('====================================================');
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Chrome Executable: ${CHROME_PATH}`);
  console.log(`Screenshots Directory: ${SCREENSHOT_DIR}\n`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900',
    ],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  const errors = [];
  const warnings = [];

  page.on('pageerror', (err) => {
    console.error(' [PAGE ERROR]', err.message);
    errors.push(`Page Error: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Allow initial unauthenticated 401 on /auth/me before login
      if (!txt.includes('401 (Unauthorized)')) {
        console.error(' [CONSOLE ERROR]', txt);
        errors.push(`Console Error: ${txt}`);
      }
    } else if (msg.type() === 'warn') {
      warnings.push(msg.text());
    }
  });

  page.on('response', async (res) => {
    if (res.status() >= 400 && !res.url().includes('/auth/me')) {
      try {
        const text = await res.text();
        console.error(` [HTTP ${res.status()}] ${res.request().method()} ${res.url()} -> ${text}`);
      } catch {
        console.error(` [HTTP ${res.status()}] ${res.request().method()} ${res.url()}`);
      }
    }
  });

  const testResults = [];

  async function step(name, action) {
    const start = Date.now();
    try {
      await action();
      const duration = Date.now() - start;
      console.log(`  ✓ [PASS] ${name} (${duration}ms)`);
      testResults.push({ name, status: 'PASS', duration });
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`  ✗ [FAIL] ${name} (${duration}ms):`, err.message);
      testResults.push({ name, status: 'FAIL', duration, error: err.message });
      throw err;
    }
  }

  try {
    // 1. Initial Load & Login Page Check
    await step('01. Load Login Screen & RTL Verification', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 15000 });
      const dir = await page.$eval('html', (el) => el.getAttribute('dir'));
      if (dir !== 'rtl') {
        throw new Error(`Expected dir="rtl", got "${dir}"`);
      }
      const title = await page.title();
      console.log(`     Page Title: "${title}", RTL: ${dir}`);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00_login.png') });
    });

    // 2. Authentication Flow
    await step('02. Authenticate as Admin', async () => {
      await page.waitForSelector('button[type="submit"]', { timeout: 5000 });

      // Enter credentials if empty
      const userVal = await page.$eval('input[type="text"]', (el) => el.value).catch(() => '');
      if (!userVal) {
        await page.type('input[type="text"]', 'admin');
        const defaultSecret = Buffer.from('YWRtaW4xMjM0NTY=', 'base64').toString();
        await page.type('input[type="password"]', process.env.ERP_TEST_PASSWORD || defaultSecret);
      }

      // Submit login credentials
      await page.click('button[type="submit"]');

      // Wait for navigation / sidebar to appear
      await page.waitForSelector('aside', { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 800));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_dashboard.png') });
    });

    // Helper to click sidebar by data-section attribute
    async function selectSection(sectionKey, screenshotName, waitMs = 600) {
      const selector = `button[data-section="${sectionKey}"]`;
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector);
      // Wait for any 'جاري تحميل' indicators to settle
      await page.waitForFunction(
        () => !document.body.innerText.includes('جاري تحميل') && !document.body.innerText.includes('جاري التحميل'),
        { timeout: 6000 }
      ).catch(() => {});
      await new Promise((r) => setTimeout(r, waitMs));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, screenshotName) });
    }

    // 3. Screen: اليومية السريعة (Daily Center)
    await step('03. Daily Center View (اليومية السريعة - F2)', async () => {
      await selectSection('daily', '02_daily_center.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('مركز العمليات اليومية') ||
               document.body.innerText.includes('فاتورة بيع') ||
               document.body.innerText.includes('سداد مورد');
      });
      if (!hasContent) throw new Error('Daily Center content not rendered');
    });

    // 4. Screen: العملاء (Customers)
    await step('04. Customers View (العملاء وكشوف الحساب)', async () => {
      await selectSection('customers', '03_customers.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('العملاء') &&
               (document.body.innerText.includes('رصيد') || document.body.innerText.includes('عميل'));
      });
      if (!hasContent) throw new Error('Customers list content not found');
    });

    // 5. Screen: الموردين (Suppliers)
    await step('05. Suppliers View (الموردين والمشتريات)', async () => {
      await selectSection('suppliers', '04_suppliers.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الموردين') &&
               (document.body.innerText.includes('مورد') || document.body.innerText.includes('سداد'));
      });
      if (!hasContent) throw new Error('Suppliers content not found');
    });

    // 6. Screen: المخزون (Inventory)
    await step('06. Inventory Stock Availability View (المخزون والكميات)', async () => {
      await selectSection('inventory', '05_inventory.png');
      const text = await page.evaluate(() => document.body.innerText);
      console.log('     [DEBUG TEXT]:', text.slice(0, 200).replace(/\n+/g, ' '));
      const hasContent = text.includes('المخزون') &&
             (text.includes('رصيد') || text.includes('كمية') || text.includes('الصنف') || text.includes('حركة'));
      if (!hasContent) throw new Error(`Inventory table not found. Got: ${text.slice(0, 200)}`);
    });

    // 7. Screen: المنتجات والأسعار (Products)
    await step('07. Products Catalogue View (المنتجات والأسعار)', async () => {
      await selectSection('products', '06_products.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('المنتجات') ||
               document.body.innerText.includes('قائمة الأسعار');
      });
      if (!hasContent) throw new Error('Product items not rendered');
    });

    // 8. Screen: الفواتير (Invoices)
    await step('08. Invoices View (فواتير المبيعات والمشتريات والطباعة)', async () => {
      await selectSection('invoices', '07_invoices.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الفواتير') ||
               document.body.innerText.includes('فاتورة');
      });
      if (!hasContent) throw new Error('Invoices content not found');
    });

    // 9. Screen: الشحنات والسائقين (Shipments)
    await step('09. Shipments & Drivers View (الشحنات والسائقين والتحصيلات)', async () => {
      await selectSection('shipments', '08_shipments.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الشحنات') ||
               document.body.innerText.includes('السائقين');
      });
      if (!hasContent) throw new Error('Shipments content not found');
    });

    // 10. Screen: الخزينة والبنوك (Treasury)
    await step('10. Treasury & Cash Accounts View (الخزينة والبنوك والجرد)', async () => {
      await selectSection('treasury', '09_treasury.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الخزينة') ||
               document.body.innerText.includes('النقدية');
      });
      if (!hasContent) throw new Error('Treasury content not found');
    });

    // 11. Screen: المصروفات (Expenses)
    await step('11. General Expenses View (المصروفات العمومية والتشغيلية)', async () => {
      await selectSection('expenses', '10_expenses.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('المصروفات');
      });
      if (!hasContent) throw new Error('Expenses content not found');
    });

    // 12. Screen: الأصول والمعدات (Equipment)
    await step('12. Equipment & Machinery View (الأصول والمعدات M01-M07)', async () => {
      await selectSection('equipment', '11_equipment.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('المعدات') ||
               document.body.innerText.includes('الأصول');
      });
      if (!hasContent) throw new Error('Equipment items not rendered');
    });

    // 13. Screen: الموظفين والمرتبات (Payroll)
    await step('13. Payroll & Attendance View (الموظفين والحضور والمرتبات)', async () => {
      await selectSection('payroll', '12_payroll.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الموظفين') ||
               document.body.innerText.includes('الرواتب');
      });
      if (!hasContent) throw new Error('Payroll content not found');
    });

    // 14. Screen: التقارير المالية (Reports & Trial Balance)
    await step('14. Reports View (ميزان المراجعة وقائمة الدخل)', async () => {
      await selectSection('reports', '13_reports.png', 1200);
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('التقارير المالية') ||
               document.body.innerText.includes('ميزان المراجعة');
      });
      if (!hasContent) throw new Error('Reports content not found');
    });

    // 15. Screen: ترحيل واستيراد البيانات (Data Port)
    await step('15. Data Port View (استيراد وتصدير إكسل وSQL)', async () => {
      await selectSection('dataport', '14_dataport.png');
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('استيراد وتصدير') ||
               document.body.innerText.includes('إكسيل') ||
               document.body.innerText.includes('SQL');
      });
      if (!hasContent) throw new Error('Data Port controls not found');
    });

    // 16. Screen: الإعدادات والأمان والتدقيق (Settings & Security)
    await step('16. Settings & Audit Hash Chain View (الإعدادات وسجل التدقيق)', async () => {
      await selectSection('settings', '15_settings.png', 1200);
      const hasContent = await page.evaluate(() => {
        return document.body.innerText.includes('الإعدادات') ||
               document.body.innerText.includes('التدقيق');
      });
      if (!hasContent) throw new Error('Settings content not found');
    });

    // 17. Return to Dashboard and verify key summary cards
    await step('17. Return to Dashboard & Assert Core Yard KPIs', async () => {
      await selectSection('dashboard', '16_dashboard_final.png');
      const hasKPIs = await page.evaluate(() => {
        return document.body.innerText.includes('لوحة التحكم') &&
               (document.body.innerText.includes('مستحقات') ||
                document.body.innerText.includes('السيولة') ||
                document.body.innerText.includes('مبيعات'));
      });
      if (!hasKPIs) throw new Error('Dashboard KPIs not found');
    });

  } finally {
    await browser.close();
  }

  console.log('\n====================================================');
  console.log('   TEST EXECUTION SUMMARY                          ');
  console.log('====================================================');
  const passed = testResults.filter((r) => r.status === 'PASS').length;
  const failed = testResults.filter((r) => r.status === 'FAIL').length;
  console.log(`Total Steps:     ${testResults.length}`);
  console.log(`Passed:          ${passed}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Uncaught Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nError Details:');
    errors.forEach((e) => console.log(' - ' + e));
  }

  if (failed > 0 || errors.length > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL 17 AUTOMATED WINDOWS UI TESTS PASSED PERFECTLY!');
  }
}

runUITests().catch((err) => {
  console.error('\nFATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
