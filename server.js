const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = process.env.PORT || 5000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://roamfree.com.hk');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

const { Semaphore } = require('async-mutex');
const mutex = new Semaphore(1);

const log = (level, message) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${level} - ${message}`);
    fs.appendFile(path.join(__dirname, 'app.log'), `${timestamp} - ${level} - ${message}\n`).catch(() => {});
};

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
        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
        log('info', `使用 Chromium 路徑: ${executablePath}`);
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-setuid-sandbox',
                '--disable-features=site-per-process',
                '--window-size=1280,720',
                '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ],
            executablePath
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
        await page.goto('https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/', { waitUntil: 'networkidle2', timeout: 30000 });
        const url = page.url();
        log('info', `當前頁面 URL: ${url}`);
        if (url.includes('login') || url.includes('auth')) {
            log('info', '導向登錄頁面，會話無效');
            return false;
        }
        const inputSelector = 'input#quick-search-input';
        try {
            await page.waitForSelector(inputSelector, { timeout: 30000 });
            log('info', '會話有效，找到輸入框');
            return true;
        } catch (error) {
            const pageContent = await page.evaluate(() => document.body.innerHTML.slice(0, 1000));
            log('error', `輸入框選擇器失敗: ${error.message}, 頁面內容: ${pageContent}`);
            return false;
        }
    } catch (error) {
        log('error', `會話檢查失敗: ${error.message}`);
        return false;
    }
}

async function login(page) {
    try {
        await page.goto('https://iot.app.consoleconnect.com/', { waitUntil: 'networkidle2', timeout: 30000 });
        const url = page.url();
        log('info', `登錄頁面 URL: ${url}`);
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.type('input[name="username"]', USERNAME);
        await page.type('input[name="password"]', PASSWORD);
        await page.click('input[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        await saveCookies(page);
        const postLoginUrl = page.url();
        log('info', `登錄後頁面 URL: ${postLoginUrl}`);
        if (postLoginUrl.includes('login') || postLoginUrl.includes('auth')) {
            log('error', '登錄失敗，仍在登錄頁面');
            return false;
        }
        log('info', '登入成功並保存 cookies');
        return true;
    } catch (error) {
        log('error', `登入失敗: ${error.message}`);
        return false;
    }
}

async function scrollToLoadMore(page, maxScrolls = 100) {
    let scrollCount = 0;
    let previousRowCount = 0;
    while (scrollCount < maxScrolls) {
        const currentRowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr:not([style*="display: none"])').length);
        log('info', `當前表格行數: ${currentRowCount}, 滾動次數: ${scrollCount + 1}`);
        if (currentRowCount === previousRowCount && scrollCount > 0) {
            log('info', '無更多數據加載');
            break;
        }
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(2000); // 等待新數據加載
        previousRowCount = currentRowCount;
        scrollCount++;
    }
    return scrollCount;
}

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

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

app.post('/check-sim', async (req, res) => {
    const [value, release] = await mutex.acquire();
    try {
        const { iccid } = req.body;
        const cleanedIccid = iccid.replace(/\s/g, ''); // 去除空格
        if (!cleanedIccid || !/^\d{19,20}$/.test(cleanedIccid)) {
            log('warning', `無效的 ICCID 格式: ${iccid}`);
            return res.status(400).json({ message: '無效的ICCID格式，需為19或20位數字' });
        }

        log('info', `開始查詢 ICCID: ${cleanedIccid}`);
        const startTime = Date.now();

        if (!browser) {
            browser = await initBrowser();
        }
        const page = await browser.newPage();
        try {
            await page.setDefaultTimeout(30000);
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            await loadCookies(page);
            if (!await isSessionValid(page)) {
                log('info', '會話超時，重新登入');
                if (!await login(page)) {
                    log('error', '重新登入失敗');
                    res.status(500).json({ message: '無法登錄，請檢查憑證' });
                    return;
                }
            }

            log('info', `訪問查詢頁面: https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/`);
            await page.goto('https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/', { waitUntil: 'networkidle2', timeout: 30000 });
            const url = page.url();
            log('info', `當前頁面 URL: ${url}`);
            if (url.includes('login') || url.includes('auth')) {
                log('error', '查詢頁面導向登錄頁面');
                res.status(500).json({ message: '會話失效，無法訪問查詢頁面' });
                return;
            }

            // 使用正確的輸入框選擇器
            const inputSelector = 'input#quick-search-input';
            let iccidInput;
            try {
                iccidInput = await page.waitForSelector(inputSelector, { timeout: 30000 });
                log('info', '找到 ICCID 輸入框');
            } catch (error) {
                const pageContent = await page.evaluate(() => document.body.innerHTML.slice(0, 1000));
                log('error', `輸入框選擇器失敗: ${error.message}, 頁面內容: ${pageContent}`);
                res.status(500).json({ message: `無法找到輸入框：${error.message}` });
                return;
            }

            // 清空輸入框並輸入 ICCID
            await iccidInput.click({ clickCount: 3 }); // 選中並清空
            await iccidInput.type(cleanedIccid);
            await page.evaluate((inputId, value) => {
                const input = document.querySelector(inputId);
                input.value = value;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('keyup', { bubbles: true }));
            }, inputSelector, cleanedIccid);
            await iccidInput.press('Enter');
            log('info', '已輸入 ICCID 並提交');

            // 檢查並點擊搜索按鈕（備用）
            const searchButtonSelectors = [
                'button[aria-label="Search"]',
                'button[type="submit"]',
                'button[title="Search"]',
                'button.v-button.v-widget[aria-label="Search"]',
                'button.v-button',
                'button:contains("Search")',
                'button:contains("查詢")'
            ];
            let searchButton = null;
            for (const selector of searchButtonSelectors) {
                try {
                    searchButton = await page.$(selector);
                    if (searchButton) break;
                } catch (error) {
                    log('info', `未找到按鈕選擇器 ${selector}: ${error.message}`);
                }
            }
            if (searchButton) {
                log('info', '找到搜索按鈕，執行點擊');
                await searchButton.click();
                await page.waitForTimeout(3000); // 等待表格刷新
            } else {
                log('info', '未找到搜索按鈕，依賴自動加載');
            }

            // 等待表格過濾完成（預期 0 或 1 行）
            try {
                await page.waitForFunction(() => {
                    const table = document.querySelector('table tbody');
                    const rows = document.querySelectorAll('table tbody tr:not([style*="display: none"])');
                    const loading = document.querySelector('table')?.classList.contains('loading');
                    return table && !loading && rows.length <= 1;
                }, { timeout: 40000 }); // 延長等待時間
            } catch (error) {
                const rowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr:not([style*="display: none"])').length);
                log('error', `表格過濾失敗，行數: ${rowCount}, 錯誤: ${error.message}`);
                // 嘗試重新輸入
                await iccidInput.click({ clickCount: 3 });
                await iccidInput.type(cleanedIccid);
                await page.evaluate((inputId, value) => {
                    const input = document.querySelector(inputId);
                    input.value = value;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    input.dispatchEvent(new Event('keyup', { bubbles: true }));
                }, inputSelector, cleanedIccid);
                await iccidInput.press('Enter');
                if (searchButton) {
                    await searchButton.click();
                }
                await page.waitForTimeout(3000);
                const retryRowCount = await page.evaluate(() => document.querySelectorAll('table tbody tr:not([style*="display: none"])').length);
                if (retryRowCount > 1) {
                    log('error', `重新輸入後仍失敗，行數: ${retryRowCount}`);
                    // 嘗試無限滾動
                    await scrollToLoadMore(page);
                }
            }

            const result = {};
            try {
                const rows = await page.$$('table tbody tr:not([style*="display: none"])');
                log('info', `找到 ${rows.length} 個可見表格行`);

                // 記錄表格內容以便診斷
                const tableContent = await page.evaluate(() => {
                    const table = document.querySelector('table tbody');
                    return table ? table.innerText.slice(0, 1000) : '無表格內容';
                });
                log('info', `表格內容: ${tableContent}`);

                // 處理結果：預期 0 或 1 行
                if (rows.length === 0) {
                    log('info', `查無 ICCID: ${cleanedIccid}，表格無數據`);
                    res.status(404).json({ message: `查無此ICCID：${cleanedIccid}，請確認輸入正確！` });
                    return;
                }

                if (rows.length > 1) {
                    log('warning', `查詢返回 ${rows.length} 行，預期僅 1 行，嘗試無限滾動`);
                    await scrollToLoadMore(page);
                    const allRows = await page.$$('table tbody tr:not([style*="display: none"])');
                    for (const row of allRows) {
                        try {
                            const iccidCell = await row.$eval('td:nth-child(4)', el => el.textContent.trim());
                            log('info', `檢查行，ICCID: ${iccidCell}`);
                            if (iccidCell === cleanedIccid) {
                                result.imsi = await row.$eval('td:nth-child(2)', el => el.textContent.trim()) || 'N/A';
                                result.iccid = iccidCell;
                                result.msisdn = await row.$eval('td:nth-child(5)', el => el.textContent.trim()) || 'N/A';
                                result.status = await row.$eval('td:nth-child(8)', el => el.textContent.trim()) || 'N/A';
                                result.activation_date = await row.$eval('td:nth-child(12)', el => el.textContent.trim()) || 'N/A';
                                result.termination_date = 'N/A';
                                try {
                                    result.data_usage = await row.$eval('td:nth-child(21)', el => el.textContent.trim()) || 'N/A';
                                    log('info', `數據使用: ${result.data_usage}`);
                                } catch {
                                    result.data_usage = 'N/A';
                                    log('warning', '無法提取數據使用');
                                }
                                log('info', `查詢成功: ${cleanedIccid}`);
                                res.json(result);
                                return;
                            }
                        } catch (error) {
                            log('warning', `提取行數據失敗: ${error.message}`);
                            continue;
                        }
                    }
                    log('info', `查無 ICCID: ${cleanedIccid}，已滾動所有數據`);
                    res.status(404).json({ message: `查無此ICCID：${cleanedIccid}，請確認輸入正確！` });
                    return;
                }

                // 處理單行結果
                const row = rows[0];
                const iccidCell = await row.$eval('td:nth-child(4)', el => el.textContent.trim());
                if (iccidCell === cleanedIccid) {
                    result.imsi = await row.$eval('td:nth-child(2)', el => el.textContent.trim()) || 'N/A';
                    result.iccid = iccidCell;
                    result.msisdn = await row.$eval('td:nth-child(5)', el => el.textContent.trim()) || 'N/A';
                    result.status = await row.$eval('td:nth-child(8)', el => el.textContent.trim()) || 'N/A';
                    result.activation_date = await row.$eval('td:nth-child(12)', el => el.textContent.trim()) || 'N/A';
                    result.termination_date = 'N/A';
                    try {
                        result.data_usage = await row.$eval('td:nth-child(21)', el => el.textContent.trim()) || 'N/A';
                        log('info', `數據使用: ${result.data_usage}`);
                    } catch {
                        result.data_usage = 'N/A';
                        log('warning', '無法提取數據使用');
                    }
                    log('info', `查詢成功: ${cleanedIccid}`);
                    res.json(result);
                } else {
                    log('info', `查無 ICCID: ${cleanedIccid}，表格行不匹配`);
                    res.status(404).json({ message: `查無此ICCID：${cleanedIccid}，請確認輸入正確！` });
                }
            } catch (error) {
                const pageUrl = page.url();
                const pageContent = await page.evaluate(() => document.body.innerHTML.slice(0, 1000));
                log('error', `表格加載失敗: ${error.message}, URL: ${pageUrl}, 頁面內容: ${pageContent}`);
                res.status(500).json({ message: `查詢失敗：${error.message}` });
            } finally {
                await page.close();
                if (browser) {
                    await browser.close();
                    browser = null;
                    log('info', '關閉瀏覽器以釋放資源');
                }
                log('info', `查詢完成，耗時 ${(Date.now() - startTime) / 1000} 秒`);
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