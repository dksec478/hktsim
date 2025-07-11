<<<<<<< HEAD
FROM python:3.9-slim

# 安裝依賴
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    chromium \
    chromium-driver \
=======
FROM node:18-slim

# 安裝 Puppeteer 依賴
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
>>>>>>> 89d520d (初始化 Node.js + Puppeteer 應用)
    && rm -rf /var/lib/apt/lists/*

# 設置工作目錄
WORKDIR /app

<<<<<<< HEAD
# 複製並安裝 Python 依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
=======
# 複製並安裝依賴
COPY package.json .
RUN npm install
>>>>>>> 89d520d (初始化 Node.js + Puppeteer 應用)

# 複製應用程式碼
COPY . .

# 暴露端口
EXPOSE 5000

# 運行應用
<<<<<<< HEAD
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "120", "app:app"]
=======
CMD ["npm", "start"]
>>>>>>> 89d520d (初始化 Node.js + Puppeteer 應用)
