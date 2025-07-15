const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// 延遲輔助函數
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureLoggedIn(page) {
  const loginUrl = 'https://iot.app.consoleconnect.com/auth/realms/iot/protocol/openid-connect/auth';
  const currentUrl = page.url();

  // 檢查是否在登入頁面
  if (currentUrl.includes(loginUrl)) {
    console.log('檢測到需要重新登入，正在重新登入...');
    await page.type('#username', process.env.CONSOLECONNECT_USERNAME || 'mttelecom_admin');
    await page.type('#password', process.env.CONSOLECONNECT_PASSWORD || 'gAry20250708');
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    console.log('重新登入成功');
  }
}

async function fetchICCData(iccid) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 導航到登錄頁面
    await page.goto(
      'https://iot.app.consoleconnect.com/auth/realms/iot/protocol/openid-connect/auth?response_type=code&client_id=pccw&redirect_uri=https%3A%2F%2Fiot.app.consoleconnect.com%2Fportal%2F&state=51c7373b-f74e-4b89-83fc-17279686191b&login=true&scope=openid',
      { waitUntil: 'networkidle2', timeout: 30000 }
    );

    // 確保已登入
    await ensureLoggedIn(page);

    // 等待表格加載
    const tableSelector = '.v-grid-tablewrapper tbody';
    await page.waitForSelector(tableSelector, { timeout: 30000 });

    // 查詢特定 ICCID
    if (!iccid) {
      throw new Error('請提供 ICCID');
    }

    await ensureLoggedIn(page); // 再次檢查是否需要登入
    await page.type('#quick-search-input', iccid);
    await page.keyboard.press('Enter');
    await delay(3000); // 等待查詢結果

    const data = await page.evaluate((selector) => {
      const rows = document.querySelectorAll(`${selector} tr`);
      return Array.from(rows).map((row) => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells).map((cell) => {
          const label = cell.querySelector('.v-label')?.textContent.trim() || cell.textContent.trim();
          return label;
        });
      });
    }, tableSelector);

    return data;
  } catch (error) {
    console.error('提取數據錯誤：', error);
    throw error;
  } finally {
    await browser.close();
  }
}

app.get('/fetch_iccid', async (req, res) => {
  const iccid = req.query.iccid;
  try {
    if (!iccid) {
      return res.status(400).json({ status: 'error', message: '請提供 ICCID' });
    }
    const data = await fetchICCData(iccid);
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`伺服器運行在端口 ${port}`);
});