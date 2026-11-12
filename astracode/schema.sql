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
  gh_token TEXT,                            -- GitHub token (เข้ารหัส)
  gh_login TEXT,
  balance REAL NOT NULL DEFAULT 0, ref_code TEXT, referred_by INTEGER, ref_rewarded INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_on INTEGER NOT NULL DEFAULT 0, google_id TEXT, line_id TEXT,
  instructions TEXT NOT NULL DEFAULT '', wallet_overflow INTEGER NOT NULL DEFAULT 0, auto_renew INTEGER NOT NULL DEFAULT 0,
  plan_period TEXT NOT NULL DEFAULT 'month', reminded_at INTEGER, has_password INTEGER NOT NULL DEFAULT 1,
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
  price_year REAL,                          -- ราคารายปี (ว่าง = ไม่มีแบบรายปี)
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
  price_in REAL, price_out REAL, price_cache REAL, price_cache_write REAL, -- ราคาขาย/1M token (ว่าง = ทุน + markup)
  public INTEGER NOT NULL DEFAULT 1,        -- แสดงในหน้าราคา
  note TEXT NOT NULL DEFAULT '',            -- คำอธิบายในหน้าราคา
  fallback_id INTEGER,                      -- โมเดลสำรองเมื่อตัวนี้ล่ม
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
  created_at INTEGER NOT NULL,
  project_id INTEGER                        -- แชตของโปรเจกต์ (โหมด Code)
  , folder_id INTEGER
);
CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,                       -- user | assistant
  content TEXT NOT NULL,
  model_id INTEGER,
  created_at INTEGER NOT NULL,
  thinking TEXT                             -- เหตุผลที่ AI คิดก่อนตอบ
  , sources TEXT                            -- แหล่งข้อมูลจากการค้นเว็บ (JSON)
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
  kind TEXT NOT NULL DEFAULT 'plan',        -- plan | topup
  period TEXT NOT NULL DEFAULT 'month', coupon TEXT, discount REAL NOT NULL DEFAULT 0, approved_at INTEGER, slip_ref TEXT,
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
 ('featured_plan','3'),
 ('price_markup','30'),
 ('price_note','');

CREATE TABLE IF NOT EXISTS rate (          -- นับครั้งกันยิงรัวๆ / ล็อกแชต
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (      -- โหมด Code
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  gh_repo TEXT, gh_branch TEXT, gh_sha TEXT, -- repo ที่เชื่อม และคอมมิตล่าสุดที่ sync
  gh_synced TEXT                            -- JSON: path → blob sha ตอน sync ล่าสุด
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);
CREATE TABLE IF NOT EXISTS project_files (
  project_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
);

-- ระบบเพิ่มเติม (เหมือน migrate-6.sql)
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER, revoked INTEGER NOT NULL DEFAULT 0, budget REAL, models TEXT, spent REAL NOT NULL DEFAULT 0, spent_month TEXT);
CREATE TABLE IF NOT EXISTS wallet_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, balance_after REAL NOT NULL, kind TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_tx(user_id, id);
CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, kind TEXT NOT NULL, value REAL NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, expires INTEGER, note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (code, user_id));
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS file_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS file_versions_path ON file_versions(project_id, path, id);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, admin_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, model_id INTEGER, detail TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at);
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000));
INSERT OR IGNORE INTO settings VALUES ('referral_bonus','20'); INSERT OR IGNORE INTO settings VALUES ('announcement',''); INSERT OR IGNORE INTO settings VALUES ('announcement_level','info'); INSERT OR IGNORE INTO settings VALUES ('maintenance','0'); INSERT OR IGNORE INTO settings VALUES ('alert_discord',''); INSERT OR IGNORE INTO settings VALUES ('alert_line_to',''); INSERT OR IGNORE INTO settings VALUES ('cost_alert_daily','0'); INSERT OR IGNORE INTO settings VALUES ('mail_from',''); INSERT OR IGNORE INTO settings VALUES ('search_enabled','1'); INSERT OR IGNORE INTO settings VALUES ('image_enabled','0'); INSERT OR IGNORE INTO settings VALUES ('image_base_url','https://api.openai.com/v1'); INSERT OR IGNORE INTO settings VALUES ('image_model','gpt-image-1'); INSERT OR IGNORE INTO settings VALUES ('image_key_name','OPENAI_KEY'); INSERT OR IGNORE INTO settings VALUES ('image_units','300000'); INSERT OR IGNORE INTO settings VALUES ('image_cost','1.5'); INSERT OR IGNORE INTO settings VALUES ('autocomplete_model',''); INSERT OR IGNORE INTO settings VALUES ('business_name','AstraCode'); INSERT OR IGNORE INTO settings VALUES ('business_address',''); INSERT OR IGNORE INTO settings VALUES ('business_tax_id',''); INSERT OR IGNORE INTO settings VALUES ('topup_min','50');

CREATE INDEX IF NOT EXISTS payments_slip_ref ON payments(slip_ref);
INSERT OR IGNORE INTO settings VALUES ('slip_provider',''); INSERT OR IGNORE INTO settings VALUES ('slip_auto_approve','1'); INSERT OR IGNORE INTO settings VALUES ('slip2go_url',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_type',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_account','');
