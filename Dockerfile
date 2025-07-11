FROM python:3.9-slim

# 安裝依賴
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# 下載並安裝 Chromium 快照（版本 138.0.7204.92 對應快照 ID 1271398）
RUN wget -q https://commondatastorage.googleapis.com/chromium-browser-snapshots/Linux_x64/1271398/chromium.zip \
    && unzip chromium.zip -d /usr/bin/ \
    && chmod +x /usr/bin/chromium \
    && rm chromium.zip

# 下載並安裝 ChromeDriver 138
RUN wget -q https://edgedl.me.gvt1.com/edgedl/chrome/chrome-for-testing/138.0.7204.92/linux64/chromedriver-linux64.zip \
    && unzip chromedriver-linux64.zip \
    && mv chromedriver-linux64/chromedriver /usr/bin/chromedriver \
    && chmod +x /usr/bin/chromedriver \
    && rm chromedriver-linux64.zip

# 設置工作目錄
WORKDIR /app

# 複製並安裝 Python 依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製應用程式碼
COPY . .

# 暴露端口
EXPOSE 5000

# 運行應用
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]