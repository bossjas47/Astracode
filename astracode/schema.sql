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
  sess_start INTEGER, week_start INTEGER,   -- เริ่มรอบ 4 ชม. / รอบสัปดาห์ของผู้ใช้ (NULL = ยังไม่มีรอบที่นับอยู่)
  gh_token TEXT,                            -- GitHub token (เข้ารหัส)
  gh_login TEXT,
  balance REAL NOT NULL DEFAULT 0, ref_code TEXT, referred_by INTEGER, ref_rewarded INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_last INTEGER, digest_off INTEGER, totp_on INTEGER NOT NULL DEFAULT 0, google_id TEXT, line_id TEXT,
  instructions TEXT NOT NULL DEFAULT '', wallet_overflow INTEGER NOT NULL DEFAULT 0, auto_renew INTEGER NOT NULL DEFAULT 0,
  plan_period TEXT NOT NULL DEFAULT 'month', reminded_at INTEGER, has_password INTEGER NOT NULL DEFAULT 1, fb_uid TEXT UNIQUE,
  created_at INTEGER NOT NULL
  , webhook_url TEXT                       -- แจ้งเตือนงบ API key ถึงปลายทางนี้ (https)
  , bill_info TEXT                        -- ข้อมูลผู้ซื้อในใบเสร็จ (JSON: name, address, tax_id)
  , vercel_token TEXT                     -- token Vercel ของผู้ใช้ (เข้ารหัสด้วย SECRET_KEY) สำหรับ deploy โปรเจกต์ Code
  , wallet_day_cap REAL                   -- เพดานใช้ Wallet ต่อวัน (บาท) ที่ผู้ใช้ตั้งเอง
  , no_report INTEGER                      -- 1 = ไม่นับในรายงานรายได้/กำไร (บัญชีแอดมิน/ทดสอบ)
  , cc_first INTEGER                       -- 1 = ใช้เครดิต Claude ที่แถมก่อนลิมิต (ว่าง = ลิมิตก่อน)
  , auto_compact INTEGER                   -- 0 = ปิดย่อแชตอัตโนมัติเมื่อ context ใกล้เต็ม (ว่าง = เปิด)
  , auto_memory INTEGER                    -- 1 = ให้ AI บันทึกความจำเอง (ค่าเริ่มต้นปิด)
  , agent_pack_from INTEGER, agent_pack_until INTEGER, agent_pack_units REAL -- แพ็กเสริม Agent ที่ซื้อด้วย Wallet
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  created_at INTEGER, ua TEXT, ip TEXT,     -- อุปกรณ์ที่ล็อกอิน (ip เป็นแบบหยาบ)
  admin_ok INTEGER                          -- เวลาหมดอายุของการปลดล็อกรหัสผ่านชั้นที่สองของหลังบ้าน
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,            -- บาท / เดือน
  limit_4h REAL NOT NULL,                   -- งบต้นทุนจริงต่อรอบ 4 ชม. (บาท)
  use_4h INTEGER,                           -- 0 = ปิดรอบ 4 ชม. (ว่าง/1 = เปิด)
  limit_week REAL NOT NULL,                 -- งบต้นทุนจริงต่อสัปดาห์ (บาท)
  description TEXT NOT NULL DEFAULT '',
  price_year REAL,
  free_models TEXT,                         -- โมเดลฟรีไม่จำกัด (JSON [model_id]) ไม่หักลิมิต มีเพดานต่อวัน                          -- ราคารายปี (ว่าง = ไม่มีแบบรายปี)
  seats INTEGER NOT NULL DEFAULT 1,         -- 1 = เดี่ยว, 2+ = แพลนทีม
  shared_pool INTEGER NOT NULL DEFAULT 0,   -- 0 = แยกโควตาต่อคน, 1 = ใช้งบรวมทั้งทีม
  api_limit INTEGER NOT NULL DEFAULT 0,     -- 0 = API Key หักจาก Wallet, 1 = หักจากลิมิตแพลนได้
  days INTEGER,                             -- ระยะแพลน (วัน) ว่าง = 30 เช่นแพลนทดลอง 7 วัน
  once INTEGER,                             -- 1 = ซื้อได้ครั้งเดียวต่อบัญชี ไม่ต่ออายุอัตโนมัติ
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
  , agent INTEGER                           -- 1 = Agent (แอป Desktop/คลาวด์) ใช้ลิมิตแพลนได้
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                       -- ชื่อที่แสดง
  provider TEXT NOT NULL,                   -- openai | anthropic  (รูปแบบ API)
  api_model TEXT NOT NULL,                  -- รหัสโมเดลที่ส่งไป API
  base_url TEXT NOT NULL,                   -- เช่น https://api.deepseek.com/v1
  key_name TEXT NOT NULL,                   -- ชื่อ secret ใน Worker เช่น DEEPSEEK_KEY
  multiplier REAL NOT NULL DEFAULT 1,       -- ความหนักสัมพัทธ์ ใช้เรียงลำดับ/แสดงผล (ลิมิตหักตามต้นทุนจริง ไม่ใช้ตัวนี้)
  cost_in REAL NOT NULL DEFAULT 0,          -- บาท / 1M token
  cost_out REAL NOT NULL DEFAULT 0,
  cost_cache REAL NOT NULL DEFAULT 0,       -- cache read
  cost_cache_write REAL NOT NULL DEFAULT 0,
  vision INTEGER NOT NULL DEFAULT 0,        -- อ่านรูปได้
  ctx_k REAL,                               -- ขนาด context ของโมเดล (พัน token) ว่าง = 128
  long_k REAL, long_in REAL, long_out REAL, -- ราคาขั้นที่ 2: input ต่อคำขอ ≥ long_k พัน token → ขาเข้า/cache ×long_in (2), ขาออก ×long_out (1.5)
  new_until INTEGER,                        -- แสดงป้าย "ใหม่" ในหน้าเลือกโมเดลถึงเวลานี้ (ms)
  cats TEXT,                                -- หมวดตามงานที่เหมาะ (คั่นด้วย , เช่น code,math) ใช้กรองในหน้าเลือกโมเดล
  req_cap INTEGER,                          -- เพดานจำนวนคำขอต่อผู้ใช้ต่อ 4 ชม. (ว่าง = ไม่จำกัด)
  bill TEXT,                                -- วิธีคิดเงิน: NULL/token = ตามจำนวน token · request = เหมาต่อ request (ใช้ req_cost/req_price แทนราคา token ทั้งหมด ไม่ผสมกัน)
  req_cost REAL, req_price REAL,            -- ต้นทุน/ราคาขายต่อ request (บาท) ใช้เมื่อ bill=request
  price_in REAL, price_out REAL, price_cache REAL, price_cache_write REAL, -- ราคาขาย/1M token (ว่าง = ทุน + markup)
  public INTEGER NOT NULL DEFAULT 1,        -- แสดงในหน้าราคา
  note TEXT NOT NULL DEFAULT '',            -- คำอธิบายในหน้าราคา
  fallback_id INTEGER,                      -- โมเดลสำรองเมื่อตัวนี้ล่ม
  promo_pct REAL, promo_start INTEGER, promo_end INTEGER, -- โปรลดราคา % ช่วงเวลา (unix ms)
  cap_pct INTEGER NOT NULL DEFAULT 0,       -- เพดานโมเดลนี้เป็น % ของงบสัปดาห์ (0 = ไม่จำกัด) เช่น Opus 50
  use_mult REAL, promo_mult REAL,           -- ตัวคูณหน่วยลิมิต (ว่าง = 1) / ช่วงโปร
  tools TEXT,                               -- tools แบบ native: auto (ว่าง) / on / off
  first_token_s REAL, idle_s REAL,          -- นาฬิกาเฝ้าโมเดล: รอข้อความแรก / เงียบกลางทาง (วินาที ว่าง = ค่าเริ่มต้น 90/60)
  code_prompt TEXT,                         -- คำสั่งเพิ่มในโหมด Code สำหรับโมเดลนี้
  sys_prompt TEXT,                          -- คำสั่งระบบประจำโมเดล (แชตและ API) เช่นโมเดลเฉพาะทาง
  effort TEXT NOT NULL DEFAULT 'none',      -- none | openai | anthropic | deepseek | kimi
  effort_levels TEXT,                       -- คั่นด้วย , เช่น none,low,medium,high,max (ว่าง = ค่าเริ่มต้นค่าย)
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
  , summary TEXT, summary_upto INTEGER
  , pinned INTEGER NOT NULL DEFAULT 0, share_token TEXT       -- สรุปข้อความเก่า (ย่อแชตยาว) ถึงข้อความ id นี้
  , deleted_at INTEGER, archived INTEGER   -- ถังขยะ (ลบจริงหลัง 30 วัน) และเก็บถาวร
  , instructions TEXT                       -- คำสั่งเฉพาะแชตนี้
);
CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chats_share ON chats(share_token);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,                       -- user | assistant
  content TEXT NOT NULL,
  model_id INTEGER,
  created_at INTEGER NOT NULL,
  thinking TEXT                             -- เหตุผลที่ AI คิดก่อนตอบ
  , sources TEXT                            -- แหล่งข้อมูลจากการค้นเว็บ (JSON)
  , tin INTEGER, tout INTEGER               -- token ที่ใช้ตอบข้อความนี้
  , starred INTEGER                         -- บุ๊กมาร์ก
  , tcr INTEGER, tcw INTEGER                -- token ขาเข้าที่อ่านจาก cache / เขียนลง cache (รวมอยู่ใน tin)
  , tctx INTEGER                            -- context จริงของรอบสุดท้าย: input + output ตามผู้ให้บริการ
  , applied TEXT                            -- โหมด Code: ไฟล์ที่ใช้การแก้ไขของข้อความนี้แล้ว (JSON ของ path) · กันการ์ดเด้งให้ Apply ซ้ำหลังรีเฟรช
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
  , ms INTEGER                              -- เวลารวมของข้อความ (แชตเว็บ)
  , ttft INTEGER                            -- เวลาจนได้ตัวอักษรแรก
  , prep INTEGER                            -- เวลาที่ระบบเตรียมก่อนเรียกโมเดล (ms)
  , src TEXT                                -- chat/api/agent/task/complete/image/system
  , charge REAL                             -- บาทที่หักจาก Wallet
  , flag TEXT                               -- gone = ลูกค้าตัดกลางทาง · est = token ประมาณ (ผู้ให้บริการไม่ส่ง usage) · part = ผู้ให้บริการ error กลางคำตอบ
  , pack REAL                               -- โควตาแพ็ก Agent ที่ใช้ไป (แทนหน่วยลิมิตแพลน)
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
  review INTEGER,                           -- 1 = ลูกค้าขอให้แอดมินตรวจสลิปที่ถูกปฏิเสธ
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ค่าเริ่มต้น แก้ได้ในหลังบ้าน
INSERT OR IGNORE INTO plans (id,name,price,price_year,limit_4h,limit_week,description,sort) VALUES
 (1,'Free',0,NULL,0.4,1.5,'DeepSeek ฟรี',0),
 (2,'DeepSeek Lite',59,602,2.2,8,'DeepSeek ประหยัด',1),
 (3,'DeepSeek Max',199,2030,9,35,'DeepSeek ใช้หนักทั้งวัน',2),
 (4,'Plus',299,3050,8,30,'DeepSeek + Claude Sonnet',3),
 (5,'Pro',599,6110,20,70,'ใช้ Sonnet หนักขึ้น',4),
 (6,'Max',1290,13160,50,170,'ทุกโมเดล',5);

INSERT OR IGNORE INTO models (id,name,provider,api_model,base_url,key_name,multiplier,cost_in,cost_out,cost_cache,cost_cache_write,vision,effort,sort) VALUES
 (1,'DeepSeek','openai','deepseek-chat','https://api.deepseek.com/v1','DEEPSEEK_KEY',1,0.97,3.87,0.02,0.97,0,'deepseek',0),
 (2,'Claude Sonnet 5.5','anthropic','claude-sonnet-5-5','https://api.anthropic.com/v1','ANTHROPIC_KEY',35,24.9,124.6,2.5,31.2,1,'anthropic',1);

INSERT OR IGNORE INTO plan_models VALUES (1,1),(2,1),(3,1),(4,1),(4,2),(5,1),(5,2),(6,1),(6,2);

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
  , instructions TEXT NOT NULL DEFAULT ''
  , share_token TEXT                        -- ลิงก์แชร์แบบอ่านอย่างเดียว /p/<token>
  , slug TEXT                               -- ชื่อลิงก์ที่ตั้งเอง /p/<slug>
  , featured INTEGER                        -- 1 = แอดมินเลือกขึ้นแกลเลอรีหน้า Code
  , blurb TEXT                              -- คำอธิบายในแกลเลอรี/หน้าแรก (เช่น สร้างด้วยโมเดลอะไร)
  , env_sealed TEXT   -- ตัวแปรลับของโปรเจกต์ (เข้ารหัส)
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
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER, revoked INTEGER NOT NULL DEFAULT 0, budget REAL, models TEXT, spent REAL NOT NULL DEFAULT 0, spent_month TEXT, use_plan INTEGER NOT NULL DEFAULT 1, ip_allow TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS gift_codes (code TEXT PRIMARY KEY, amount REAL NOT NULL, from_user INTEGER NOT NULL, created_at INTEGER NOT NULL, used_by INTEGER, used_at INTEGER); -- โค้ดของขวัญ: โอนเงิน Wallet ให้คนอื่น
CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER NOT NULL, user_id INTEGER NOT NULL, path TEXT, model TEXT, status INTEGER, tin INTEGER, tout INTEGER, charge REAL, ms INTEGER, err TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS api_log_key ON api_log(key_id, id);
CREATE TABLE IF NOT EXISTS wallet_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, balance_after REAL NOT NULL, kind TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_tx(user_id, id);
CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, kind TEXT NOT NULL, value REAL NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, expires INTEGER, note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (code, user_id));
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, instructions TEXT, files TEXT, team_id INTEGER); -- instructions/files = คำสั่งและเอกสารอ้างอิง (JSON [{name,text}]) ที่ทุกแชตในโฟลเดอร์ใช้ร่วมกัน
CREATE TABLE IF NOT EXISTS file_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS file_versions_path ON file_versions(project_id, path, id);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, admin_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, model_id INTEGER, detail TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS events_model ON events(model_id, kind, created_at); -- modelDown() ถามทุกข้อความ
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000), changelog INTEGER);
INSERT OR IGNORE INTO settings VALUES ('referral_bonus','20'); INSERT OR IGNORE INTO settings VALUES ('announcement',''); INSERT OR IGNORE INTO settings VALUES ('announcement_level','info'); INSERT OR IGNORE INTO settings VALUES ('maintenance','0'); INSERT OR IGNORE INTO settings VALUES ('alert_discord',''); INSERT OR IGNORE INTO settings VALUES ('alert_line_to',''); INSERT OR IGNORE INTO settings VALUES ('cost_alert_daily','0'); INSERT OR IGNORE INTO settings VALUES ('mail_from',''); INSERT OR IGNORE INTO settings VALUES ('search_enabled','1'); INSERT OR IGNORE INTO settings VALUES ('image_enabled','0'); INSERT OR IGNORE INTO settings VALUES ('image_base_url','https://api.openai.com/v1'); INSERT OR IGNORE INTO settings VALUES ('image_model','gpt-image-1'); INSERT OR IGNORE INTO settings VALUES ('image_key_name','OPENAI_KEY'); INSERT OR IGNORE INTO settings VALUES ('image_units','300000'); INSERT OR IGNORE INTO settings VALUES ('image_cost','1.5'); INSERT OR IGNORE INTO settings VALUES ('autocomplete_model',''); INSERT OR IGNORE INTO settings VALUES ('business_name','AstraCode'); INSERT OR IGNORE INTO settings VALUES ('business_address',''); INSERT OR IGNORE INTO settings VALUES ('business_tax_id',''); INSERT OR IGNORE INTO settings VALUES ('topup_min','50');

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
  sess_start INTEGER, week_start INTEGER,   -- เริ่มรอบ 4 ชม. / รอบสัปดาห์ของผู้ใช้ (NULL = ยังไม่มีรอบที่นับอยู่)
  gh_token TEXT,                            -- GitHub token (เข้ารหัส)
  gh_login TEXT,
  balance REAL NOT NULL DEFAULT 0, ref_code TEXT, referred_by INTEGER, ref_rewarded INTEGER NOT NULL DEFAULT 0,
  email_verified INTEGER NOT NULL DEFAULT 0, totp_secret TEXT, totp_on INTEGER NOT NULL DEFAULT 0, google_id TEXT, line_id TEXT,
  instructions TEXT NOT NULL DEFAULT '', wallet_overflow INTEGER NOT NULL DEFAULT 0, auto_renew INTEGER NOT NULL DEFAULT 0,
  plan_period TEXT NOT NULL DEFAULT 'month', reminded_at INTEGER, has_password INTEGER NOT NULL DEFAULT 1, fb_uid TEXT UNIQUE,
  created_at INTEGER NOT NULL
  , webhook_url TEXT                       -- แจ้งเตือนงบ API key ถึงปลายทางนี้ (https)
  , bill_info TEXT                        -- ข้อมูลผู้ซื้อในใบเสร็จ (JSON: name, address, tax_id)
  , vercel_token TEXT                     -- token Vercel ของผู้ใช้ (เข้ารหัสด้วย SECRET_KEY) สำหรับ deploy โปรเจกต์ Code
  , wallet_day_cap REAL                   -- เพดานใช้ Wallet ต่อวัน (บาท) ที่ผู้ใช้ตั้งเอง
  , no_report INTEGER                      -- 1 = ไม่นับในรายงานรายได้/กำไร (บัญชีแอดมิน/ทดสอบ)
  , cc_first INTEGER                       -- 1 = ใช้เครดิต Claude ที่แถมก่อนลิมิต (ว่าง = ลิมิตก่อน)
  , auto_compact INTEGER                   -- 0 = ปิดย่อแชตอัตโนมัติเมื่อ context ใกล้เต็ม (ว่าง = เปิด)
  , auto_memory INTEGER                    -- 1 = ให้ AI บันทึกความจำเอง (ค่าเริ่มต้นปิด)
  , agent_pack_from INTEGER, agent_pack_until INTEGER, agent_pack_units REAL -- แพ็กเสริม Agent ที่ซื้อด้วย Wallet
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  created_at INTEGER, ua TEXT, ip TEXT,     -- อุปกรณ์ที่ล็อกอิน (ip เป็นแบบหยาบ)
  admin_ok INTEGER                          -- เวลาหมดอายุของการปลดล็อกรหัสผ่านชั้นที่สองของหลังบ้าน
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,            -- บาท / เดือน
  limit_4h REAL NOT NULL,                   -- งบต้นทุนจริงต่อรอบ 4 ชม. (บาท)
  use_4h INTEGER,                           -- 0 = ปิดรอบ 4 ชม. (ว่าง/1 = เปิด)
  limit_week REAL NOT NULL,                 -- งบต้นทุนจริงต่อสัปดาห์ (บาท)
  description TEXT NOT NULL DEFAULT '',
  price_year REAL,
  free_models TEXT,                         -- โมเดลฟรีไม่จำกัด (JSON [model_id]) ไม่หักลิมิต มีเพดานต่อวัน                          -- ราคารายปี (ว่าง = ไม่มีแบบรายปี)
  seats INTEGER NOT NULL DEFAULT 1,         -- 1 = เดี่ยว, 2+ = แพลนทีม
  shared_pool INTEGER NOT NULL DEFAULT 0,   -- 0 = แยกโควตาต่อคน, 1 = ใช้งบรวมทั้งทีม
  api_limit INTEGER NOT NULL DEFAULT 0,     -- 0 = API Key หักจาก Wallet, 1 = หักจากลิมิตแพลนได้
  days INTEGER,                             -- ระยะแพลน (วัน) ว่าง = 30 เช่นแพลนทดลอง 7 วัน
  once INTEGER,                             -- 1 = ซื้อได้ครั้งเดียวต่อบัญชี ไม่ต่ออายุอัตโนมัติ
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
  , agent INTEGER                           -- 1 = Agent (แอป Desktop/คลาวด์) ใช้ลิมิตแพลนได้
);

CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                       -- ชื่อที่แสดง
  provider TEXT NOT NULL,                   -- openai | anthropic  (รูปแบบ API)
  api_model TEXT NOT NULL,                  -- รหัสโมเดลที่ส่งไป API
  base_url TEXT NOT NULL,                   -- เช่น https://api.deepseek.com/v1
  key_name TEXT NOT NULL,                   -- ชื่อ secret ใน Worker เช่น DEEPSEEK_KEY
  multiplier REAL NOT NULL DEFAULT 1,       -- ความหนักสัมพัทธ์ ใช้เรียงลำดับ/แสดงผล (ลิมิตหักตามต้นทุนจริง ไม่ใช้ตัวนี้)
  cost_in REAL NOT NULL DEFAULT 0,          -- บาท / 1M token
  cost_out REAL NOT NULL DEFAULT 0,
  cost_cache REAL NOT NULL DEFAULT 0,       -- cache read
  cost_cache_write REAL NOT NULL DEFAULT 0,
  vision INTEGER NOT NULL DEFAULT 0,        -- อ่านรูปได้
  ctx_k REAL,                               -- ขนาด context ของโมเดล (พัน token) ว่าง = 128
  long_k REAL, long_in REAL, long_out REAL, -- ราคาขั้นที่ 2: input ต่อคำขอ ≥ long_k พัน token → ขาเข้า/cache ×long_in (2), ขาออก ×long_out (1.5)
  new_until INTEGER,                        -- แสดงป้าย "ใหม่" ในหน้าเลือกโมเดลถึงเวลานี้ (ms)
  cats TEXT,                                -- หมวดตามงานที่เหมาะ (คั่นด้วย , เช่น code,math) ใช้กรองในหน้าเลือกโมเดล
  req_cap INTEGER,                          -- เพดานจำนวนคำขอต่อผู้ใช้ต่อ 4 ชม. (ว่าง = ไม่จำกัด)
  bill TEXT,                                -- วิธีคิดเงิน: NULL/token = ตามจำนวน token · request = เหมาต่อ request (ใช้ req_cost/req_price แทนราคา token ทั้งหมด ไม่ผสมกัน)
  req_cost REAL, req_price REAL,            -- ต้นทุน/ราคาขายต่อ request (บาท) ใช้เมื่อ bill=request
  price_in REAL, price_out REAL, price_cache REAL, price_cache_write REAL, -- ราคาขาย/1M token (ว่าง = ทุน + markup)
  public INTEGER NOT NULL DEFAULT 1,        -- แสดงในหน้าราคา
  note TEXT NOT NULL DEFAULT '',            -- คำอธิบายในหน้าราคา
  fallback_id INTEGER,                      -- โมเดลสำรองเมื่อตัวนี้ล่ม
  promo_pct REAL, promo_start INTEGER, promo_end INTEGER, -- โปรลดราคา % ช่วงเวลา (unix ms)
  cap_pct INTEGER NOT NULL DEFAULT 0,       -- เพดานโมเดลนี้เป็น % ของงบสัปดาห์ (0 = ไม่จำกัด) เช่น Opus 50
  use_mult REAL, promo_mult REAL,           -- ตัวคูณหน่วยลิมิต (ว่าง = 1) / ช่วงโปร
  tools TEXT,                               -- tools แบบ native: auto (ว่าง) / on / off
  first_token_s REAL, idle_s REAL,          -- นาฬิกาเฝ้าโมเดล: รอข้อความแรก / เงียบกลางทาง (วินาที ว่าง = ค่าเริ่มต้น 90/60)
  code_prompt TEXT,                         -- คำสั่งเพิ่มในโหมด Code สำหรับโมเดลนี้
  sys_prompt TEXT,                          -- คำสั่งระบบประจำโมเดล (แชตและ API) เช่นโมเดลเฉพาะทาง
  effort TEXT NOT NULL DEFAULT 'none',      -- none | openai | anthropic | deepseek | kimi
  effort_levels TEXT,                       -- คั่นด้วย , เช่น none,low,medium,high,max (ว่าง = ค่าเริ่มต้นค่าย)
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
  , summary TEXT, summary_upto INTEGER
  , pinned INTEGER NOT NULL DEFAULT 0, share_token TEXT       -- สรุปข้อความเก่า (ย่อแชตยาว) ถึงข้อความ id นี้
);
CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS chats_share ON chats(share_token);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  role TEXT NOT NULL,                       -- user | assistant
  content TEXT NOT NULL,
  model_id INTEGER,
  created_at INTEGER NOT NULL,
  thinking TEXT                             -- เหตุผลที่ AI คิดก่อนตอบ
  , sources TEXT                            -- แหล่งข้อมูลจากการค้นเว็บ (JSON)
  , tin INTEGER, tout INTEGER               -- token ที่ใช้ตอบข้อความนี้
  , starred INTEGER                         -- บุ๊กมาร์ก
  , tcr INTEGER, tcw INTEGER                -- token ขาเข้าที่อ่านจาก cache / เขียนลง cache (รวมอยู่ใน tin)
  , tctx INTEGER                            -- context จริงของรอบสุดท้าย: input + output ตามผู้ให้บริการ
  , applied TEXT                            -- โหมด Code: ไฟล์ที่ใช้การแก้ไขของข้อความนี้แล้ว (JSON ของ path) · กันการ์ดเด้งให้ Apply ซ้ำหลังรีเฟรช
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
  , ms INTEGER                              -- เวลารวมของข้อความ (แชตเว็บ)
  , ttft INTEGER                            -- เวลาจนได้ตัวอักษรแรก
  , prep INTEGER                            -- เวลาที่ระบบเตรียมก่อนเรียกโมเดล (ms)
  , src TEXT                                -- chat/api/agent/task/complete/image/system
  , charge REAL                             -- บาทที่หักจาก Wallet
  , flag TEXT                               -- gone = ลูกค้าตัดกลางทาง · est = token ประมาณ (ผู้ให้บริการไม่ส่ง usage) · part = ผู้ให้บริการ error กลางคำตอบ
  , pack REAL                               -- โควตาแพ็ก Agent ที่ใช้ไป (แทนหน่วยลิมิตแพลน)
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
  review INTEGER,                           -- 1 = ลูกค้าขอให้แอดมินตรวจสลิปที่ถูกปฏิเสธ
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ค่าเริ่มต้น แก้ได้ในหลังบ้าน
INSERT OR IGNORE INTO plans (id,name,price,price_year,limit_4h,limit_week,description,sort) VALUES
 (1,'Free',0,NULL,0.4,1.5,'DeepSeek ฟรี',0),
 (2,'DeepSeek Lite',59,602,2.2,8,'DeepSeek ประหยัด',1),
 (3,'DeepSeek Max',199,2030,9,35,'DeepSeek ใช้หนักทั้งวัน',2),
 (4,'Plus',299,3050,8,30,'DeepSeek + Claude Sonnet',3),
 (5,'Pro',599,6110,20,70,'ใช้ Sonnet หนักขึ้น',4),
 (6,'Max',1290,13160,50,170,'ทุกโมเดล',5);

INSERT OR IGNORE INTO models (id,name,provider,api_model,base_url,key_name,multiplier,cost_in,cost_out,cost_cache,cost_cache_write,vision,effort,sort) VALUES
 (1,'DeepSeek','openai','deepseek-chat','https://api.deepseek.com/v1','DEEPSEEK_KEY',1,0.97,3.87,0.02,0.97,0,'deepseek',0),
 (2,'Claude Sonnet 5.5','anthropic','claude-sonnet-5-5','https://api.anthropic.com/v1','ANTHROPIC_KEY',35,24.9,124.6,2.5,31.2,1,'anthropic',1);

INSERT OR IGNORE INTO plan_models VALUES (1,1),(2,1),(3,1),(4,1),(4,2),(5,1),(5,2),(6,1),(6,2);

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
  , instructions TEXT NOT NULL DEFAULT ''
  , share_token TEXT                        -- ลิงก์แชร์แบบอ่านอย่างเดียว /p/<token>
  , slug TEXT                               -- ชื่อลิงก์ที่ตั้งเอง /p/<slug>
  , featured INTEGER                        -- 1 = แอดมินเลือกขึ้นแกลเลอรีหน้า Code
  , blurb TEXT                              -- คำอธิบายในแกลเลอรี/หน้าแรก (เช่น สร้างด้วยโมเดลอะไร)
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
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, last_used INTEGER, revoked INTEGER NOT NULL DEFAULT 0, budget REAL, models TEXT, spent REAL NOT NULL DEFAULT 0, spent_month TEXT, use_plan INTEGER NOT NULL DEFAULT 1, ip_allow TEXT, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS gift_codes (code TEXT PRIMARY KEY, amount REAL NOT NULL, from_user INTEGER NOT NULL, created_at INTEGER NOT NULL, used_by INTEGER, used_at INTEGER); -- โค้ดของขวัญ: โอนเงิน Wallet ให้คนอื่น
CREATE TABLE IF NOT EXISTS api_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key_id INTEGER NOT NULL, user_id INTEGER NOT NULL, path TEXT, model TEXT, status INTEGER, tin INTEGER, tout INTEGER, charge REAL, ms INTEGER, err TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS api_log_key ON api_log(key_id, id);
CREATE TABLE IF NOT EXISTS wallet_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, balance_after REAL NOT NULL, kind TEXT NOT NULL, ref TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wallet_tx_user ON wallet_tx(user_id, id);
CREATE TABLE IF NOT EXISTS coupons (code TEXT PRIMARY KEY, kind TEXT NOT NULL, value REAL NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, expires INTEGER, note TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS coupon_uses (code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (code, user_id));
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, instructions TEXT, files TEXT, team_id INTEGER); -- instructions/files = คำสั่งและเอกสารอ้างอิง (JSON [{name,text}]) ที่ทุกแชตในโฟลเดอร์ใช้ร่วมกัน
CREATE TABLE IF NOT EXISTS file_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS file_versions_path ON file_versions(project_id, path, id);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, admin INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER NOT NULL, admin_email TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, model_id INTEGER, detail TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_time ON events(created_at);
CREATE INDEX IF NOT EXISTS events_model ON events(model_id, kind, created_at); -- modelDown() ถามทุกข้อความ
CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', cover TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000), changelog INTEGER);
INSERT OR IGNORE INTO settings VALUES ('referral_bonus','20'); INSERT OR IGNORE INTO settings VALUES ('announcement',''); INSERT OR IGNORE INTO settings VALUES ('announcement_level','info'); INSERT OR IGNORE INTO settings VALUES ('maintenance','0'); INSERT OR IGNORE INTO settings VALUES ('alert_discord',''); INSERT OR IGNORE INTO settings VALUES ('alert_line_to',''); INSERT OR IGNORE INTO settings VALUES ('cost_alert_daily','0'); INSERT OR IGNORE INTO settings VALUES ('mail_from',''); INSERT OR IGNORE INTO settings VALUES ('search_enabled','1'); INSERT OR IGNORE INTO settings VALUES ('image_enabled','0'); INSERT OR IGNORE INTO settings VALUES ('image_base_url','https://api.openai.com/v1'); INSERT OR IGNORE INTO settings VALUES ('image_model','gpt-image-1'); INSERT OR IGNORE INTO settings VALUES ('image_key_name','OPENAI_KEY'); INSERT OR IGNORE INTO settings VALUES ('image_units','300000'); INSERT OR IGNORE INTO settings VALUES ('image_cost','1.5'); INSERT OR IGNORE INTO settings VALUES ('autocomplete_model',''); INSERT OR IGNORE INTO settings VALUES ('business_name','AstraCode'); INSERT OR IGNORE INTO settings VALUES ('business_address',''); INSERT OR IGNORE INTO settings VALUES ('business_tax_id',''); INSERT OR IGNORE INTO settings VALUES ('topup_min','50');

CREATE INDEX IF NOT EXISTS payments_slip_ref ON payments(slip_ref);
CREATE UNIQUE INDEX IF NOT EXISTS payments_slip_key_uq ON payments(slip_key) WHERE slip_key LIKE 'slip/%';
CREATE UNIQUE INDEX IF NOT EXISTS payments_slip_ref_uq ON payments(slip_ref) WHERE slip_ref IS NOT NULL AND status<>'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS wallet_first_bonus_uq ON wallet_tx(user_id) WHERE kind='first_bonus';
INSERT OR IGNORE INTO settings VALUES ('slip_provider',''); INSERT OR IGNORE INTO settings VALUES ('slip_auto_approve','1'); INSERT OR IGNORE INTO settings VALUES ('slip2go_url',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_type',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_account','');

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 5,
  shared_pool INTEGER NOT NULL DEFAULT 0,
  domain TEXT,                              -- อีเมล @โดเมนนี้เข้าทีมอัตโนมัติ (หัวหน้าตั้ง)
  sess_start INTEGER,
  week_start INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  cap_pct REAL,                             -- เพดานต่อคน (% ของงบสัปดาห์ทีม) ใช้กับทีมที่ใช้งบรวม
  api_off INTEGER,                          -- 1 = หัวหน้าทีมปิดสิทธิ์ใช้ API ด้วยงบทีมของคนนี้
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user ON team_members(user_id);
INSERT OR IGNORE INTO plans (id,name,price,price_year,limit_4h,limit_week,description,seats,shared_pool,sort,active) VALUES
 (7,'Team',1990,19900,40,150,'แพลนทีม สูงสุด 5 คน (ใช้ได้ทุกโมเดล)',5,0,6,1);
INSERT OR IGNORE INTO plan_models SELECT 7, id FROM models WHERE active=1;

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  share_token TEXT
  , as_text INTEGER   -- 1 = พรอมต์สำเร็จรูป: พิมพ์ / แล้วเลือกเพื่อใส่ข้อความลงช่องพิมพ์ (ไม่ใช่คำสั่งระบบ)
  , model_id INTEGER  -- โมเดลประจำของ Skill (เปิดแล้วสลับให้)
  , plugin TEXT       -- มาจากปลั๊กอินไหน (ถอนปลั๊กอิน = ลบ Skill ชุดนี้)
);
CREATE INDEX IF NOT EXISTS skills_user ON skills(user_id, id);
INSERT OR IGNORE INTO skills (id,user_id,name,description,content,enabled,created_at) VALUES
 (1,0,'apple-dark-ui','ออกแบบ UI สไตล์ Apple Dark / Glassmorphism พร้อมโค้ดสะอาด','When designing or writing frontend UI/CSS, strictly follow Apple Dark Design principles: deep obsidian (#050507) and carbon (#18181c) surfaces, hairline 1px rgba(255,255,255,0.09) borders, subtle backdrop-filter blur, SF Pro / Inter / Prompt typography, 12px rounded-rect inputs, 9999px pill buttons, generous whitespace, and zero emojis in UI chrome (use crisp SVG icons instead).',1,0),
 (2,0,'senior-debugger','วิเคราะห์หาต้นตอของบั๊กอย่างเป็นระบบก่อนแก้โค้ด','When debugging code or errors: 1) Identify the exact root cause before proposing a fix. 2) Check edge cases, async race conditions, null/undefined handling, and state sync. 3) Keep changes minimal, surgical, and explain why the bug happened in 2-3 concise bullet points.',1,0),
 (3,0,'thai-pro-writer','เขียนและเกลาภาษาไทยให้สละสลวย กระชับ เป็นธรรมชาติ','Write in natural, modern, concise Thai. Avoid stiff translated phrasing, excessive filler words, or robotic openings. Use clear headings and bullet points where helpful.',1,0);

INSERT OR IGNORE INTO skills (id,user_id,name,description,content,enabled,created_at) VALUES
 (4,0,'code-reviewer','รีวิวโค้ดแบบมืออาชีพ เรียงตามความรุนแรง พร้อมวิธีแก้','When asked to review code: list findings ordered by severity (bug, security, performance, maintainability). For each give the location, what is wrong, why it matters and a concrete fix. Skip style nitpicks unless they hide a bug. If the code is fine, say so briefly instead of inventing problems.',1,1700000000000),
 (5,0,'refactor-clean','จัดโครงสร้างโค้ดให้สะอาด โดยพฤติกรรมเดิมไม่เปลี่ยน','When refactoring: keep behavior identical, make the smallest change that improves clarity, remove duplication, use clear names, and do not add features or abstractions that nobody asked for. Show only the changed parts and list anything that could change behavior.',1,1700000000000),
 (6,0,'explain-simple','อธิบายเรื่องยากให้เข้าใจง่าย ด้วยตัวอย่าง','Explain the topic so a smart beginner understands: start with a one-sentence answer, then a simple analogy, then a short concrete example. Avoid jargon or define it the first time it appears. Keep it short and end with one question that checks understanding.',1,1700000000000),
 (7,0,'summarizer','สรุปข้อความยาวให้สั้น ได้ใจความ','Summarize the given text: first a one-line takeaway, then 3-7 bullet points with the key facts, numbers, names and decisions, then any open questions or next steps. Do not add information that is not in the text. Use the same language as the text.',1,1700000000000),
 (8,0,'translator','แปลไทย-อังกฤษให้เป็นธรรมชาติ คงความหมายและน้ำเสียง','Translate between Thai and English naturally. Keep meaning, tone, names, numbers and formatting. Prefer idiomatic phrasing over word-for-word translation. If the source is ambiguous, give the most likely translation and note the alternative in one line. Output only the translation unless asked otherwise.',1,1700000000000),
 (9,0,'email-writer','เขียนอีเมลสุภาพ กระชับ พร้อมส่ง','Write a ready-to-send email: a clear subject line, a polite greeting, the purpose in the first sentence, short paragraphs, a specific request or next step, and a courteous closing. Match the formality the user asks for and write in the language they use. Do not invent facts, dates or amounts.',1,1700000000000),
 (10,0,'sql-helper','ช่วยเขียนและตรวจ SQL อย่างปลอดภัย','When writing or reviewing SQL: ask for the schema if it is missing, write readable queries with explicit columns and joins, use parameters instead of string concatenation, explain what the query does in one or two lines, and point out missing indexes, N+1 patterns and anything that could be slow or destructive. Confirm before suggesting UPDATE or DELETE without a WHERE clause.',1,1700000000000),
 (11,0,'study-tutor','ติวเตอร์ สอนทีละขั้น ถามให้คิดก่อนเฉลย','Act as a patient tutor: find out what the user already knows, teach one step at a time, give a worked example, then ask the user to try a similar problem before revealing the full answer. Praise correct reasoning, correct mistakes gently and explain why. Keep each turn short.',1,1700000000000),
 (12,0,'git-commit-writer','เขียน commit message แบบ Conventional Commits','Write a commit message in Conventional Commits format: type(scope): short imperative summary under 72 characters, then a body that explains why the change was made and anything risky or notable. Base it only on the diff or description the user provides. Output the message in a code block.',1,1700000000000);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token_enc TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  connector TEXT, auto INTEGER, oauth_enc TEXT, perms_json TEXT, last_error TEXT
);
CREATE INDEX IF NOT EXISTS mcp_user ON mcp_servers(user_id, id);

CREATE TABLE IF NOT EXISTS feedback (message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, model_id INTEGER, vote INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id));
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER, user_id INTEGER, model_id INTEGER, reason TEXT, snippet TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);

INSERT OR IGNORE INTO settings VALUES ('slip_provider',''); INSERT OR IGNORE INTO settings VALUES ('slip_auto_approve','1'); INSERT OR IGNORE INTO settings VALUES ('slip2go_url',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_type',''); INSERT OR IGNORE INTO settings VALUES ('slip2go_receiver_account','');

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 5,
  shared_pool INTEGER NOT NULL DEFAULT 0,
  domain TEXT,                              -- อีเมล @โดเมนนี้เข้าทีมอัตโนมัติ (หัวหน้าตั้ง)
  sess_start INTEGER,
  week_start INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  cap_pct REAL,                             -- เพดานต่อคน (% ของงบสัปดาห์ทีม) ใช้กับทีมที่ใช้งบรวม
  api_off INTEGER,                          -- 1 = หัวหน้าทีมปิดสิทธิ์ใช้ API ด้วยงบทีมของคนนี้
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user ON team_members(user_id);
INSERT OR IGNORE INTO plans (id,name,price,price_year,limit_4h,limit_week,description,seats,shared_pool,sort,active) VALUES
 (7,'Team',1990,19900,40,150,'แพลนทีม สูงสุด 5 คน (ใช้ได้ทุกโมเดล)',5,0,6,1);
INSERT OR IGNORE INTO plan_models SELECT 7, id FROM models WHERE active=1;

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  share_token TEXT, plugin TEXT
);
CREATE INDEX IF NOT EXISTS skills_user ON skills(user_id, id);
INSERT OR IGNORE INTO skills (id,user_id,name,description,content,enabled,created_at) VALUES
 (1,0,'apple-dark-ui','ออกแบบ UI สไตล์ Apple Dark / Glassmorphism พร้อมโค้ดสะอาด','When designing or writing frontend UI/CSS, strictly follow Apple Dark Design principles: deep obsidian (#050507) and carbon (#18181c) surfaces, hairline 1px rgba(255,255,255,0.09) borders, subtle backdrop-filter blur, SF Pro / Inter / Prompt typography, 12px rounded-rect inputs, 9999px pill buttons, generous whitespace, and zero emojis in UI chrome (use crisp SVG icons instead).',1,0),
 (2,0,'senior-debugger','วิเคราะห์หาต้นตอของบั๊กอย่างเป็นระบบก่อนแก้โค้ด','When debugging code or errors: 1) Identify the exact root cause before proposing a fix. 2) Check edge cases, async race conditions, null/undefined handling, and state sync. 3) Keep changes minimal, surgical, and explain why the bug happened in 2-3 concise bullet points.',1,0),
 (3,0,'thai-pro-writer','เขียนและเกลาภาษาไทยให้สละสลวย กระชับ เป็นธรรมชาติ','Write in natural, modern, concise Thai. Avoid stiff translated phrasing, excessive filler words, or robotic openings. Use clear headings and bullet points where helpful.',1,0);

INSERT OR IGNORE INTO skills (id,user_id,name,description,content,enabled,created_at) VALUES
 (4,0,'code-reviewer','รีวิวโค้ดแบบมืออาชีพ เรียงตามความรุนแรง พร้อมวิธีแก้','When asked to review code: list findings ordered by severity (bug, security, performance, maintainability). For each give the location, what is wrong, why it matters and a concrete fix. Skip style nitpicks unless they hide a bug. If the code is fine, say so briefly instead of inventing problems.',1,1700000000000),
 (5,0,'refactor-clean','จัดโครงสร้างโค้ดให้สะอาด โดยพฤติกรรมเดิมไม่เปลี่ยน','When refactoring: keep behavior identical, make the smallest change that improves clarity, remove duplication, use clear names, and do not add features or abstractions that nobody asked for. Show only the changed parts and list anything that could change behavior.',1,1700000000000),
 (6,0,'explain-simple','อธิบายเรื่องยากให้เข้าใจง่าย ด้วยตัวอย่าง','Explain the topic so a smart beginner understands: start with a one-sentence answer, then a simple analogy, then a short concrete example. Avoid jargon or define it the first time it appears. Keep it short and end with one question that checks understanding.',1,1700000000000),
 (7,0,'summarizer','สรุปข้อความยาวให้สั้น ได้ใจความ','Summarize the given text: first a one-line takeaway, then 3-7 bullet points with the key facts, numbers, names and decisions, then any open questions or next steps. Do not add information that is not in the text. Use the same language as the text.',1,1700000000000),
 (8,0,'translator','แปลไทย-อังกฤษให้เป็นธรรมชาติ คงความหมายและน้ำเสียง','Translate between Thai and English naturally. Keep meaning, tone, names, numbers and formatting. Prefer idiomatic phrasing over word-for-word translation. If the source is ambiguous, give the most likely translation and note the alternative in one line. Output only the translation unless asked otherwise.',1,1700000000000),
 (9,0,'email-writer','เขียนอีเมลสุภาพ กระชับ พร้อมส่ง','Write a ready-to-send email: a clear subject line, a polite greeting, the purpose in the first sentence, short paragraphs, a specific request or next step, and a courteous closing. Match the formality the user asks for and write in the language they use. Do not invent facts, dates or amounts.',1,1700000000000),
 (10,0,'sql-helper','ช่วยเขียนและตรวจ SQL อย่างปลอดภัย','When writing or reviewing SQL: ask for the schema if it is missing, write readable queries with explicit columns and joins, use parameters instead of string concatenation, explain what the query does in one or two lines, and point out missing indexes, N+1 patterns and anything that could be slow or destructive. Confirm before suggesting UPDATE or DELETE without a WHERE clause.',1,1700000000000),
 (11,0,'study-tutor','ติวเตอร์ สอนทีละขั้น ถามให้คิดก่อนเฉลย','Act as a patient tutor: find out what the user already knows, teach one step at a time, give a worked example, then ask the user to try a similar problem before revealing the full answer. Praise correct reasoning, correct mistakes gently and explain why. Keep each turn short.',1,1700000000000),
 (12,0,'git-commit-writer','เขียน commit message แบบ Conventional Commits','Write a commit message in Conventional Commits format: type(scope): short imperative summary under 72 characters, then a body that explains why the change was made and anything risky or notable. Base it only on the diff or description the user provides. Output the message in a code block.',1,1700000000000);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  token_enc TEXT,
  tools_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  connector TEXT, auto INTEGER, oauth_enc TEXT, perms_json TEXT, last_error TEXT
);
CREATE INDEX IF NOT EXISTS mcp_user ON mcp_servers(user_id, id);

CREATE TABLE IF NOT EXISTS feedback (message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, model_id INTEGER, vote INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, user_id));
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER, user_id INTEGER, model_id INTEGER, reason TEXT, snippet TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);

-- Artifact: หน้าเว็บที่ AI สร้างในแชต (สร้างซ้ำใน ensureCols ด้วย)
CREATE TABLE IF NOT EXISTS artifacts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, chat_id INTEGER, title TEXT NOT NULL, ver INTEGER NOT NULL DEFAULT 1, share_token TEXT, share_ver INTEGER, reports INTEGER NOT NULL DEFAULT 0, gallery INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS artifact_versions (artifact_id INTEGER NOT NULL, ver INTEGER NOT NULL, html TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (artifact_id, ver));
CREATE INDEX IF NOT EXISTS artifacts_user ON artifacts(user_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS artifacts_share ON artifacts(share_token);

CREATE TABLE IF NOT EXISTS team_log (id INTEGER PRIMARY KEY AUTOINCREMENT, team_id INTEGER NOT NULL, user_id INTEGER, action TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS team_log_team ON team_log(team_id, id);
