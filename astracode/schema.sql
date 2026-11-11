-- AstraCode D1 schema. Run: npx wrangler d1 execute astracode --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',        -- user | admin
  plan_id INTEGER,                          -- NULL = แพลนฟรี
  plan_expires INTEGER,                     -- unix ms
  banned INTEGER NOT NULL DEFAULT 0,
  usage_reset_at INTEGER NOT NULL DEFAULT 0, -- แอดมินรีเซ็ตลิมิต
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,            -- บาท / เดือน
  limit_4h INTEGER NOT NULL,                -- units
  limit_week INTEGER NOT NULL,              -- units
  description TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                       -- ชื่อที่แสดง
  provider TEXT NOT NULL,                   -- openai | anthropic  (รูปแบบ API)
  api_model TEXT NOT NULL,                  -- รหัสโมเดลที่ส่งไป API
  base_url TEXT NOT NULL,                   -- เช่น https://api.deepseek.com/v1
  key_name TEXT NOT NULL,                   -- ชื่อ secret ใน Worker เช่น DEEPSEEK_KEY
  multiplier REAL NOT NULL DEFAULT 1,
  cost_in REAL NOT NULL DEFAULT 0,          -- บาท / 1M token
  cost_out REAL NOT NULL DEFAULT 0,
  cost_cache REAL NOT NULL DEFAULT 0,       -- cache read
  cost_cache_write REAL NOT NULL DEFAULT 0,
  vision INTEGER NOT NULL DEFAULT 0,        -- อ่านรูปได้
  effort TEXT NOT NULL DEFAULT 'none',      -- none | openai | anthropic | deepseek (รูปแบบพารามิเตอร์ effort)
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS plan_models (
  plan_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  PRIMARY KEY (plan_id, model_id)
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,                       -- user | assistant
  content TEXT NOT NULL,
  model_id INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  model_id INTEGER NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  tokens_cache INTEGER NOT NULL,
  units REAL NOT NULL,
  cost REAL NOT NULL,                       -- บาท
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_user ON usage(user_id, created_at);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  slip_key TEXT NOT NULL,                   -- key ใน R2
  slip_check TEXT,                          -- ผลจาก API เช็กสลิป (JSON)
  slip_amount REAL,                         -- ยอดที่ API อ่านได้
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ค่าเริ่มต้น แก้ได้ในหลังบ้าน
INSERT OR IGNORE INTO plans (id,name,price,limit_4h,limit_week,description,sort) VALUES
 (1,'Free',0,100000,1000000,'DeepSeek ฟรี',0),
 (2,'DeepSeek Lite',59,1500000,6000000,'DeepSeek ไม่อั้นแบบคุ้ม',1),
 (3,'Sonnet Plus',299,6000000,30000000,'DeepSeek + Claude Sonnet',2),
 (4,'Pro',499,12000000,60000000,'ทุกโมเดล ยกเว้น Opus',3);

INSERT OR IGNORE INTO models (id,name,provider,api_model,base_url,key_name,multiplier,cost_in,cost_out,cost_cache,cost_cache_write,vision,effort,sort) VALUES
 (1,'DeepSeek','openai','deepseek-chat','https://api.deepseek.com/v1','DEEPSEEK_KEY',1,0.97,3.87,0.02,0.97,0,'deepseek',0),
 (2,'Claude Sonnet 5.5','anthropic','claude-sonnet-5-5','https://api.anthropic.com/v1','ANTHROPIC_KEY',35,24.9,124.6,2.5,31.2,1,'anthropic',1);

INSERT OR IGNORE INTO plan_models VALUES (1,1),(2,1),(3,1),(3,2),(4,1),(4,2);

INSERT OR IGNORE INTO settings VALUES
 ('promptpay_id',''),
 ('slip_api_url',''),
 ('slip_amount_field','data.amount'),
 ('featured_plan','3');

CREATE TABLE IF NOT EXISTS rate (          -- นับครั้งกันยิงรัวๆ / ล็อกแชต
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset INTEGER NOT NULL
);
