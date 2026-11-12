-- (ไม่บังคับ) ใช้ชุดแพลนใหม่ 6 แพลน: ปิดแพลนเดิมที่เปิดขายอยู่ (ผู้ใช้ที่ซื้อไว้แล้วยังใช้ต่อได้จนหมดอายุ) แล้วเพิ่มแพลนใหม่
-- รันหลัง migrate-11.sql · แก้ราคา/ลิมิต/โมเดลต่อได้ที่หลังบ้าน → แพลน · หน่วยลิมิตเป็นบาท (ต้นทุนจริง)
UPDATE plans SET active = 0;
INSERT INTO plans (name,price,price_year,limit_4h,limit_week,description,sort,active) VALUES
 ('Free',0,NULL,0.4,1.5,'DeepSeek ฟรี',0,1),
 ('DeepSeek Lite',59,602,2.2,8,'DeepSeek ประหยัด',1,1),
 ('DeepSeek Max',199,2030,9,35,'DeepSeek ใช้หนักทั้งวัน',2,1),
 ('Plus',299,3050,8,30,'DeepSeek + Claude Sonnet',3,1),
 ('Pro',599,6110,20,70,'ใช้ Sonnet หนักขึ้น',4,1),
 ('Max',1290,13160,50,170,'ทุกโมเดล',5,1);
-- โมเดลของแต่ละแพลน เลือกจากชื่อโมเดล (ตรวจ/แก้ที่หลังบ้าน → แพลน)
INSERT OR IGNORE INTO plan_models SELECT p.id, m.id FROM plans p JOIN models m
  ON m.active = 1 AND (
    (p.name IN ('Free','DeepSeek Lite','DeepSeek Max') AND m.name LIKE '%DeepSeek%')
    OR (p.name = 'Plus' AND (m.name LIKE '%DeepSeek%' OR m.name LIKE '%Sonnet%'))
    OR (p.name = 'Pro' AND (m.name LIKE '%DeepSeek%' OR m.name LIKE '%Sonnet%' OR m.name LIKE '%Kimi%' OR m.name LIKE '%GPT%'))
    OR p.name = 'Max')
  WHERE p.active = 1;
-- โมเดลระดับ Opus ใช้ได้ไม่เกิน 50% ของงบสัปดาห์
UPDATE models SET cap_pct = 50 WHERE name LIKE '%Opus%';
