-- ปิดรอบ 4 ชม. ต่อแพลน (0 = ปิด, ว่าง/1 = เปิด) และตัวคูณหน่วยลิมิตต่อโมเดล (ว่าง = 1) · Worker เพิ่มคอลัมน์เองด้วย ไฟล์นี้ไว้สำหรับติดตั้งใหม่/รันมือ
ALTER TABLE plans ADD COLUMN use_4h INTEGER;
ALTER TABLE models ADD COLUMN use_mult REAL;
ALTER TABLE models ADD COLUMN promo_mult REAL;
