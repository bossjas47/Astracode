# Agent บนคลาวด์ (Cloudflare Containers): เครื่องแยกต่องาน รัน Agent ตัวเดียวกับแอป Desktop ในโหมดทำเองทั้งหมด
# app/ = desktop/{agent,agenttools,tools,localfs}.js ที่ workflow คัดลอกมาก่อน build
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 python3-pip python3-venv ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* && ln -sf /usr/bin/python3 /usr/local/bin/python
WORKDIR /srv
COPY app/ ./app/
COPY server.js ./
ENV WORK=/work NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
