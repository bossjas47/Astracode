-- API: บันทึกคำขอ (api_log) และ IP allowlist ต่อ key (Worker สร้างเองตอนใช้งาน ไฟล์นี้ไว้รันมือถ้าต้องการ)
ALTER TABLE api_keys ADD COLUMN ip_allow TEXT;
CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER NOT NULL, user_id INTEGER NOT NULL, path TEXT, model TEXT, status INTEGER, tin INTEGER, tout INTEGER, charge REAL, ms INTEGER, err TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS api_log_key ON api_log(key_id, id);
