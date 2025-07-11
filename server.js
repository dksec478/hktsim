const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 5000;

// 中間件：解析 JSON 和限制並發
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
const semaphore = require('async-mutex').Semaphore;
const mutex = new semaphore(1);

// 日誌設置
const log = (level, message) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${level} - ${message}`);
    // 可選：寫入 app.log
    fs.appendFile(path.join(__dirname, 'app.log'), `${timestamp} - ${level} - ${message}\n`);
};

// 全局瀏覽器實例
let browser = null;
const COOKIES_FILE = '/tmp/cookies.json';
const USERNAME = process.env.SIM_USERNAME || 'mttelecom_admin';
const PASSWORD = process.env.SIM_PASSWORD || 'gAry20250708';

async function initBrowser() {
    try {
        if (browser) {
            await browser.close();
            log('info', '關閉舊瀏覽器實例');
        }
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--window-size=1280,720',
                '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        });
        log('info', '瀏覽器初始化成功');
        return browser;
    } catch (error) {
        log('error', `瀏覽器初始化失敗: ${error.message}`);
        throw error;
    }
}

async function saveCookies(page) {
    try {
        const cookies = await page.cookies();
        await fs.writeFile(COOKIES_FILE, JSON.stringify(cookies));
        log('info', 'Cookies 保存成功');
    } catch (error) {
        log('error', `Cookies 保存失敗: ${error.message}`);
    }
}

async function loadCookies(page) {
    try {
        if (await fs.access(COOKIES_FILE).then(() => true).catch(() => false)) {
            const cookies = JSON.parse(await fs.readFile(COOKIES_FILE));
            await page.setCookie(...cookies);
            log('info', 'Cookies 載入成功');
            return true;
        }
        log('info', 'Cookies 檔案不存在');
        return false;
    } catch (error) {
        log('error', `Cookies 載入失敗: ${error.message}`);
        return false;
    }
}

async function isSessionValid(page) {
    try {
        await page.goto('https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('input', { timeout: 5000 });
        log('info', '會話有效，查詢頁面正常');
        return true;
    } catch (error) {
        log('info', '會話無效，無法訪問查詢頁面');
        return false;
    }
}

async function login(page) {
    try {
        await page.goto('https://iot.app.consoleconnect.com/', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.type('input[name="username"]', USERNAME);
        await page.type('input[name="password"]', PASSWORD);
        await page.click('input[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
        await saveCookies(page);
        log('info', '登入成功並保存 cookies');
        return true;
    } catch (error) {
        log('error', `登入失敗: ${error.message}`);
        return false;
    }
}

// 提供靜態檔案
app.get('/', async (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (error) {
        log('error', `提供 index.html 失敗: ${error.message}`);
        res.status(500).json({ message: '無法載入頁面' });
    }
});

app.get('/styles.css', async (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'styles.css'));
    } catch (error) {
        log('error', `提供 styles.css 失敗: ${error.message}`);
        res.status(500).json({ message: '無法載入樣式' });
    }
});

app.get('/script.js', async (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'script.js'));
    } catch (error) {
        log('error', `提供 script.js 失敗: ${error.message}`);
        res.status(500).json({ message: '無法載入腳本' });
    }
});

// 查詢 API
app.post('/check-sim', async (req, res) => {
    const release = await mutex.acquire();
    try {
        const { iccid } = req.body;
        if (!iccid || !/^\d{19,20}$/.test(iccid)) {
            log('warning', `無效的 ICCID 格式: ${iccid}`);
            return res.status(400).json({ message: '無效的ICCID格式' });
        }

        log('info', `開始查詢 ICCID: ${iccid}`);
        const startTime = Date.now();

        if (!browser) {
            browser = await initBrowser();
        }
        const page = await browser.newPage();
        try {
            await page.setDefaultTimeout(10000);
            await loadCookies(page);
            if (!await isSessionValid(page)) {
                log('info', '會話超時，重新登入');
                await login(page);
            }

            await page.goto('https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/', { waitUntil: 'domcontentloaded' });
            const iccidInput = await page.waitForSelector('input', { timeout: 10000 });
            await iccidInput.type(iccid);
            await iccidInput.press('Enter');

            const result = {};
            try {
                await page.waitForSelector('table tbody tr', { timeout: 10000 });
                const rows = await page.$$('table tbody tr:not([style*="display: none"])');
                log('info', `找到 ${rows.length} 個可見表格行`);
                let found = false;

                for (const row of rows) {
                    try {
                        const iccidCell = await row.$eval('td:nth-child(4)', el => el.textContent.trim());
                        if (iccidCell === iccid) {
                            result.imsi = await row.$eval('td:nth-child(2)', el => el.textContent.trim()) || 'N/A';
                            result.iccid = iccidCell;
                            result.msisdn = await row.$eval('td:nth-child(5)', el => el.textContent.trim()) || 'N/A';
                            result.status = await row.$eval('td:nth-child(8)', el => el.textContent.trim()) || 'N/A';
                            result.activation_date = await row.$eval('td:nth-child(12)', el => el.textContent.trim()) || 'N/A';
                            result.termination_date = await row.$eval('td:nth-child(13)', el => el.textContent.trim()) || 'N/A';
                            try {
                                result.data_usage = await row.$eval('td:nth-child(21)', el => el.textContent.trim()) || 'N/A';
                                log('info', `數據使用: ${result.data_usage}`);
                            } catch {
                                result.data_usage = 'N/A';
                                log('warning', '無法提取數據使用');
                            }
                            found = true;
                            break;
                        }
                    } catch (error) {
                        log('warning', `提取行數據失敗: ${error.message}`);
                        continue;
                    }
                }

                log('info', `查詢完成，耗時 ${(Date.now() - startTime) / 1000} 秒`);
                if (found) {
                    log('info', `查詢成功: ${iccid}`);
                    res.json(result);
                } else {
                    log('info', `查無 ICCID: ${iccid}`);
                    res.status(404).json({ message: `查無此ICCID：${iccid}，請確認輸入正確！` });
                }
            } catch (error) {
                log('info', `查無 ICCID: ${iccid}，表格無數據或未加載`);
                res.status(404).json({ message: `查無此ICCID：${iccid}，請確認輸入正確！` });
            } finally {
                await page.close();
            }
        } catch (error) {
            log('error', `查詢失敗: ${error.message}`);
            res.status(500).json({ message: `查詢失敗：${error.message}` });
        }
    } catch (error) {
        log('error', `查詢失敗: ${error.message}`);
        res.status(500).json({ message: `查詢失敗：${error.message}` });
    } finally {
        release();
    }
});

// 清理
process.on('SIGTERM', async () => {
    if (browser) {
        await browser.close();
        log('info', '應用關閉，瀏覽器清理完成');
    }
    process.exit(0);
});

app.listen(port, () => {
    log('info', `伺服器運行於 http://localhost:${port}`);
});