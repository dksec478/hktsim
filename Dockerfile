FROM python:3.9-slim

# 安裝 Chromium 和依賴
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

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