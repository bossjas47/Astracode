-- ลิมิตหักตามต้นทุนจริง (บาท) แบบรอบ 4 ชม. + สัปดาห์ผูกบัญชี · รันครั้งเดียวเท่านั้น (ห้ามรันซ้ำ เพราะแปลงเลขลิมิต)
ALTER TABLE users ADD COLUMN sess_start INTEGER;
ALTER TABLE users ADD COLUMN week_start INTEGER;
ALTER TABLE models ADD COLUMN cap_pct INTEGER NOT NULL DEFAULT 0;
-- แปลงลิมิตเดิม (unit ≈ token ของ DeepSeek ต้นทุนเฉลี่ย ~1.5 บาท/1M) เป็นงบเป็นบาท ผู้ใช้เดิมได้สิทธิ์เท่าเดิม
UPDATE plans SET limit_4h = ROUND(limit_4h * 0.0000015, 2), limit_week = ROUND(limit_week * 0.0000015, 2);
-- เริ่มนับใหม่ทุกคน: ประวัติเดิมนับด้วยสูตรเก่า
UPDATE users SET usage_reset_at = CAST(strftime('%s','now') AS INTEGER) * 1000, sess_start = NULL, week_start = NULL;
