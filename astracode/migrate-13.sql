ALTER TABLE plans ADD COLUMN seats INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN shared_pool INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  max_seats INTEGER NOT NULL DEFAULT 5,
  shared_pool INTEGER NOT NULL DEFAULT 0,
  sess_start INTEGER,
  week_start INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX IF NOT EXISTS team_members_user ON team_members(user_id);
INSERT OR IGNORE INTO plans (id,name,price,price_year,limit_4h,limit_week,description,seats,shared_pool,sort,active) VALUES
 (7,'Team',1990,19900,40,150,'แพลนทีม สูงสุด 5 คน (ใช้ได้ทุกโมเดล)',5,0,6,1);
INSERT OR IGNORE INTO plan_models SELECT 7, id FROM models WHERE active=1;
