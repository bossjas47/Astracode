# Agent บนคลาวด์ + Cowork (Cloudflare Containers): เครื่องแยกต่องาน รัน Agent ตัวเดียวกับแอป Desktop ในโหมดทำเองทั้งหมด
# app/ = desktop/{agent,agenttools,tools,localfs,android,office}.js ที่ workflow คัดลอกมาก่อน build
# Cowork: ไฟล์ออฟฟิศ (docx/exceljs/pptxgenjs) · Chromium สำหรับเครื่องมือ browser และ PDF · ฟอนต์ไทย · pandas/matplotlib
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-pip python3-venv ca-certificates curl \
    chromium fonts-thai-tlwg fonts-noto-color-emoji python3-pandas python3-matplotlib python3-openpyxl \
 && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3 /usr/local/bin/python
WORKDIR /srv
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY app/ ./app/
COPY server.js browser.js ./
ENV WORK=/work NODE_ENV=production CHROME=/usr/bin/chromium PIP_BREAK_SYSTEM_PACKAGES=1
EXPOSE 8080
CMD ["node", "server.js"]
