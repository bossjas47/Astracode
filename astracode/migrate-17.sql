CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS skills_user ON skills(user_id, id);
INSERT OR IGNORE INTO skills (id,user_id,name,description,content,enabled,created_at) VALUES
 (1,0,'apple-dark-ui','ออกแบบ UI สไตล์ Apple Dark / Glassmorphism พร้อมโค้ดสะอาด','When designing or writing frontend UI/CSS, strictly follow Apple Dark Design principles: deep obsidian (#050507) and carbon (#18181c) surfaces, hairline 1px rgba(255,255,255,0.09) borders, subtle backdrop-filter blur, SF Pro / Inter / Prompt typography, 12px rounded-rect inputs, 9999px pill buttons, generous whitespace, and zero emojis in UI chrome (use crisp SVG icons instead).',1,0),
 (2,0,'senior-debugger','วิเคราะห์หาต้นตอของบั๊กอย่างเป็นระบบก่อนแก้โค้ด','When debugging code or errors: 1) Identify the exact root cause before proposing a fix. 2) Check edge cases, async race conditions, null/undefined handling, and state sync. 3) Keep changes minimal, surgical, and explain why the bug happened in 2-3 concise bullet points.',1,0),
 (3,0,'thai-pro-writer','เขียนและเกลาภาษาไทยให้สละสลวย กระชับ เป็นธรรมชาติ','Write in natural, modern, concise Thai. Avoid stiff translated phrasing, excessive filler words, or robotic openings. Use clear headings and bullet points where helpful.',1,0);
