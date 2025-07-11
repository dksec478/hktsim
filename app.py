from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
import os
import time
import logging
import json

app = Flask(__name__)
CORS(app)  # 支援跨域，後續可限制 origins

# 設置日誌（本機除錯用 app.log）
logging.basicConfig(level=logging.INFO, filename="app.log", filemode="a", format="%(asctime)s - %(levelname)s - %(message)s")

# 減少 webdriver-manager 日誌
os.environ["WDM_LOG_LEVEL"] = "0"

# 全局瀏覽器實例
driver = None
USERNAME = os.getenv("SIM_USERNAME", "mttelecom_admin")
PASSWORD = os.getenv("SIM_PASSWORD", "gAry20250708")
COOKIES_FILE = "/tmp/cookies.json"  # Render 可寫目錄

def init_driver():
    """初始化 Selenium 瀏覽器"""
    global driver
    try:
        if driver:
            driver.quit()
    except:
        pass
    service = Service(ChromeDriverManager().install())
    options = webdriver.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--disable-extensions")
    options.add_argument("--window-size=1920,1080")
    driver = webdriver.Chrome(service=service, options=options)
    logging.info("瀏覽器初始化成功")
    return driver

def save_cookies():
    """保存 cookies"""
    try:
        cookies = driver.get_cookies()
        with open(COOKIES_FILE, "w") as f:
            json.dump(cookies, f)
        logging.info("Cookies 保存成功")
    except Exception as e:
        logging.error(f"Cookies 保存失敗: {str(e)}")

def load_cookies():
    """載入 cookies"""
    try:
        if os.path.exists(COOKIES_FILE):
            with open(COOKIES_FILE, "r") as f:
                cookies = json.load(f)
            driver.delete_all_cookies()
            for cookie in cookies:
                try:
                    driver.add_cookie(cookie)
                except:
                    continue
            logging.info("Cookies 載入成功")
            return True
        logging.info("Cookies 檔案不存在")
        return False
    except Exception as e:
        logging.error(f"Cookies 載入失敗: {str(e)}")
        return False

def is_session_valid():
    """檢查會話是否有效"""
    try:
        driver.get("https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/")
        WebDriverWait(driver, 5).until(
            EC.presence_of_element_located((By.XPATH, "/html/body/div[1]/div/div[2]/div[1]/div/div[4]/div/div/div/div[3]/div/div/div/div[1]/input"))
        )
        logging.info("會話有效，查詢頁面正常")
        return True
    except TimeoutException:
        logging.info("會話無效，無法訪問查詢頁面")
        return False
    except Exception as e:
        logging.error(f"會話檢查失敗: {str(e)}")
        return False

def login():
    """執行登入並保存 cookies"""
    try:
        driver.get("https://iot.app.consoleconnect.com/")
        wait = WebDriverWait(driver, 10)
        username_xpath = "/html/body/div[1]/div[2]/div[2]/div[1]/div/div/div/form/div[1]/input"
        username_field = wait.until(EC.presence_of_element_located((By.XPATH, username_xpath)))
        username_field.send_keys(USERNAME)
        
        password_xpath = "/html/body/div[1]/div[2]/div[2]/div[1]/div/div/div/form/div[2]/input"
        password_field = wait.until(EC.presence_of_element_located((By.XPATH, password_xpath)))
        password_field.send_keys(PASSWORD)
        
        login_button_xpath = "/html/body/div[1]/div[2]/div[2]/div[1]/div/div/div/form/div[4]/input[2]"
        login_button = wait.until(EC.element_to_be_clickable((By.XPATH, login_button_xpath)))
        login_button.click()
        
        wait.until(EC.url_contains("subscriptions"))
        save_cookies()
        logging.info("登入成功並保存 cookies")
        return True
    except TimeoutException:
        logging.error("登入超時")
        return False
    except Exception as e:
        logging.error(f"登入失敗: {str(e)}")
        return False

@app.route("/", methods=["GET"])
def home():
    """根路由渲染 index.html"""
    return render_template("index.html")

@app.route("/check-sim", methods=["POST"])
def check_sim():
    global driver
    try:
        data = request.get_json()
        iccid = data.get("iccid")
        
        if not iccid or not iccid.isdigit() or len(iccid) not in [19, 20]:
            logging.warning(f"無效的 ICCID 格式: {iccid}")
            return jsonify({"message": "無效的ICCID格式"}), 400
        
        logging.info(f"開始查詢 ICCID: {iccid}")
        
        # 初始化或檢查瀏覽器
        if driver is None or not driver.session_id:
            driver = init_driver()
            login()
        else:
            driver.get("https://iot.app.consoleconnect.com/")
            load_cookies()
            if not is_session_valid():
                logging.info("會話超時，重新登入")
                login()
        
        # 執行查詢
        driver.get("https://iot.app.consoleconnect.com/portal/#/zh_TW/72000044/subscriptions/")
        wait = WebDriverWait(driver, 10)
        iccid_input_xpath = "/html/body/div[1]/div/div[2]/div[1]/div/div[4]/div/div/div/div[3]/div/div/div/div[1]/input"
        iccid_field = wait.until(EC.presence_of_element_located((By.XPATH, iccid_input_xpath)))
        iccid_field.clear()
        for char in iccid:
            iccid_field.send_keys(char)
            time.sleep(0.05)
        iccid_field.send_keys(Keys.RETURN)
        
        # 等待表格更新
        result = {}
        try:
            wait.until(EC.presence_of_element_located((By.XPATH, "//table/tbody/tr")))
            rows = driver.find_elements(By.XPATH, "//table/tbody/tr[not(contains(@style, 'display: none'))]")
            logging.info(f"找到 {len(rows)} 個可見表格行")
            found = False
            for row in rows:
                try:
                    columns = row.find_elements(By.XPATH, "./td")
                    iccid_cell = row.find_element(By.XPATH, "./td[4]").text.strip()
                    if iccid_cell == iccid:
                        result["imsi"] = row.find_element(By.XPATH, "./td[2]").text.strip() or ""
                        result["iccid"] = iccid_cell
                        result["msisdn"] = row.find_element(By.XPATH, "./td[5]").text.strip() or ""
                        result["status"] = row.find_element(By.XPATH, "./td[8]").text.strip() or ""
                        result["activation_date"] = row.find_element(By.XPATH, "./td[12]").text.strip() or ""
                        result["termination_date"] = row.find_element(By.XPATH, "./td[13]").text.strip() or ""
                        try:
                            td_21 = row.find_element(By.XPATH, "./td[21]")
                            data_usage = driver.execute_script(
                                "return arguments[0].textContent || arguments[0].innerText || arguments[0].innerHTML;",
                                td_21
                            ).strip()
                            if not data_usage:
                                data_usage = td_21.text.strip()
                            result["data_usage"] = data_usage or ""
                            logging.info(f"數據使用: {data_usage}")
                        except:
                            result["data_usage"] = ""
                            logging.warning("無法提取數據使用")
                        found = True
                        break
                except Exception as e:
                    logging.warning(f"提取行數據失敗: {str(e)}")
                    continue
            
            if found:
                logging.info(f"查詢成功: {iccid}")
                return jsonify(result)
            else:
                logging.info(f"查無 ICCID: {iccid}")
                return jsonify({"message": f"查無此ICCID：{iccid}，請確認輸入正確！"}), 404
        
        except TimeoutException:
            logging.info(f"查無 ICCID: {iccid}，表格無數據或未加載")
            return jsonify({"message": f"查無此ICCID：{iccid}，請確認輸入正確！"}), 404
    
    except Exception as e:
        logging.error(f"查詢失敗: {str(e)}")
        try:
            driver.quit()
            driver = None
        except:
            pass
        return jsonify({"message": f"查詢失敗：{str(e)}"}), 500

@app.teardown_appcontext
def cleanup(exception):
    """應用關閉時清理瀏覽器"""
    global driver
    if driver:
        try:
            driver.quit()
            driver = None
            logging.info("應用關閉，瀏覽器清理完成")
        except:
            logging.warning("瀏覽器清理失敗")

if __name__ == "__main__":
    app.run(debug=True, port=5000)