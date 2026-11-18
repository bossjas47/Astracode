# AstraCode Desktop

แอป Windows ที่ให้โมเดลของ AstraCode ทำงานในเครื่องผู้ใช้: อ่าน/เขียนไฟล์ในโฟลเดอร์งาน, รันคำสั่ง และต่อ MCP (เช่น Blender)

- ล็อกอิน: แอปเปิด `https://astracode.panderx.xyz/desktop-auth` ผู้ใช้กดอนุญาต เว็บสร้าง API key ชื่อ "Desktop" แล้วส่งกลับมาที่ `127.0.0.1` ของเครื่อง
- เรียกโมเดลผ่าน `/v1/chat/completions` (tool calling) ค่าใช้งานหักจากแพลน/Wallet ตามปกติ
- แก้ไฟล์และรันคำสั่งต้องกดอนุญาตทุกครั้ง เว้นแต่เปิดอนุญาตอัตโนมัติในตั้งค่า · เข้าถึงได้เฉพาะในโฟลเดอร์งานที่เลือก

## Build
GitHub Actions `desktop.yml` build `.exe` บน Windows เมื่อแก้ไฟล์ใน `desktop/` แล้วอัปขึ้น R2 (`dl/AstraCode-Desktop-Setup.exe`) ดาวน์โหลดได้ที่ `/download/desktop`

ทดสอบในเครื่อง: `npm install && npm test && npm start`

ยังไม่เซ็นรับรอง: Windows จะเตือนตอนติดตั้ง (More info → Run anyway) จนกว่าจะซื้อ code signing certificate
