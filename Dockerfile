FROM node:18-slim

# 安裝 Chromium 和 Puppeteer 依賴
RUN apt-get update && apt-get install -y \
    chromium \
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
    && rm -rf /var/lib/apt/lists/*

# 設置工作目錄
WORKDIR /app

# 複製並安裝依賴
COPY package.json .
RUN npm install

# 複製應用程式碼
COPY . .

# 暴露端口
EXPOSE 5000

# 運行應用
CMD ["npm", "start"]