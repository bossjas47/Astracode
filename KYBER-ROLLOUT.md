# Kyber rollout: รายงานสรุป + Deployment & Rollback Checklist

เปลี่ยนแบรนด์ AstraCode → **Kyber** (สร้างโดย **Hypatia**), Cowork → **Kyber Harness** และปรับตัวคุมงานของ Agent
ทำบน branch `ccr-84ca511c-jo3r38` แบ่งเป็น 3 commit (ยังไม่เข้า `main`)

| เฟส | Commit | เนื้อหา |
|---|---|---|
| 1 | `fd3cbf1` | เปลี่ยนแบรนด์, SEO (JSON-LD, OG/Twitter, canonical), รองรับของเดิม (key, ลิงก์ `astracode://`, โฟลเดอร์ข้อมูลแอป) |
| 2 | `accdb94` | Kyber Harness: ตัวคุมรอบ, เครื่องมือใหม่, จัดการ context, แก้ /v1 6 จุด, แก้ Desktop/เว็บ |
| 3 | (commit นี้) | เทสต์หน่วย, Eval Harness, ตรวจ syntax, ภาพ OG ใหม่, เอกสารนี้ |

## สิ่งที่ไม่ได้เปลี่ยน (ข้อห้ามของโปรเจกต์)

- ชื่อตาราง/คอลัมน์ D1 เดิมทั้งหมด (`cowork_tasks`, `plans.cowork` ฯลฯ)
  - เพิ่มเฉพาะตารางใหม่ `agent_harness` ซึ่งสร้างเองครั้งแรกด้วย `CREATE TABLE IF NOT EXISTS`
- R2 prefix (`slip/`, `video/`, `cowork/`), cookie `sid`, `SECRET_KEY`, สูตร billing/slip/credits
- `wrangler.toml`: `name`, `database_name`, `database_id`, `bucket_name`, Durable Objects (`CHATRUN`, `AGENTBOX`)
- API key `sk-astra-*` ใช้ได้เหมือนเดิม และ key ใหม่ยังออกเป็น `sk-astra-`
  - ฝั่ง Desktop/CLI รับ `sk-kyber-*` ได้ด้วย และมีเทสต์ยืนยันว่า backend รับทั้งสองแบบ
- `/v1/*` และ `/api/*`: ไม่มี redirect, header เดิม `x-astracode-*` ยังส่งอยู่ (เพิ่ม `x-kyber-*` คู่กัน)
- URL ของ GitHub Releases / Auto-Updater, `appId`, `artifactName`, `executableName` ของแอป Desktop
- CSP ยังบังคับใช้เหมือนเดิม (ตามที่เลือก)
- ไฟล์ Vercel เดิม และไฟล์ bundle (`node-runner.js`, `cm.js`, `fb.js`)

## รายการไฟล์ที่เปลี่ยน

**เฟส 1 (เปลี่ยนแบรนด์ + SEO):** 65 ไฟล์
- `astracode/tools/pages.mjs` (ต้นฉบับ HTML/SEO) และหน้า HTML ที่สร้างจากไฟล์นี้
- `public/*.js`, `public/i18n-en.js`, `public/manifest.json`, `src/*.js`
- `desktop/{package.json, main.js, cli.js, agenttools.js, android.js, mcp.js, setuptools.js}`
- `mobile/*`, เทสต์ที่ตรวจข้อความแบรนด์

**เฟส 2 (Kyber Harness):**

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `desktop/agent.js` | ตัวคุมรอบ: ลองใหม่แบบ backoff + jitter และทำตาม Retry-After, ตรวจการวนซ้ำ, เพดานรอบ/เวลา/token, ห้ามผู้ช่วยซ้อนผู้ช่วย, checkpoint, ซ่อม tool call ที่ค้าง, ตรวจ argument กับ schema, อ่านพร้อมกัน/เขียนทีละอัน, เก็บผลยาวลงไฟล์, ปิดบัง secret, ย่อบทสนทนาโดยคงสถานะงาน, สถิติ |
| `desktop/agenttools.js` | `multi_edit`, `git_inspect`, `check_syntax`, `ASK_TOOL` ที่ใช้ร่วมกัน, ตรวจ syntax หลังแก้ไฟล์, `android_tools` เฉพาะงาน Android, `toolRegistry`, หน้าต่างขออนุญาตขึ้นทีละอัน |
| `desktop/main.js` | ใช้ชุดเครื่องมือเดียวทุกโหมด (prompt cache ใช้ต่อได้), `~/KyberWorkspace` สำหรับผู้ใช้ใหม่, ปุ่มฉุกเฉิน, `unregisterAll`, ล้าง interval, ส่ง telemetry |
| `desktop/cli.js` | เก็บผลยาวลงไฟล์ |
| `astracode/container/server.js` | เครื่องมือชุดใหม่, ไม่อัปโหลด `.kyber-tmp` |
| `astracode/src/api.js` | SSE keepalive, เวลารอ token แรก/เวลาเงียบ แล้วสลับโมเดลสำรอง, parallel tool args ใน `/v1/responses`, บล็อก thinking ใน `/v1/messages`, ตาราง `agent_harness`, สตรีมไม่ทิ้งบรรทัดท้าย |
| `astracode/src/ai.js` | `sse()` ไม่ทิ้งบรรทัดท้าย, รวมข้อความบทบาทเดียวกันสำหรับ Anthropic, `busyRetry` สำหรับ provider `responses` |
| `astracode/public/chat.js` | ส่งต่อคำตอบที่ค้างเมื่อกลับมาที่หน้าหรือเน็ตกลับมา, บันทึกร่างข้อความต่อแชต |

**เฟส 3 (เทสต์ + เครื่องมือวัดผล):**

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `desktop/test/harness.test.js` | ใหม่: 20 เทสต์ของตัวคุมรอบและเครื่องมือ |
| `desktop/package.json` | เพิ่มไฟล์เทสต์ใหม่ใน `npm test` |
| `desktop/agent.js` | คำสั่ง bash ที่ exit ไม่ใช่ 0 นับเป็น error ที่ยังค้าง (คงไว้หลังย่อบทสนทนา) |
| `astracode/tests/harness.test.mjs` | ใหม่: 9 เทสต์ของ /v1 และการตรวจ syntax ทุกไฟล์ JS |
| `astracode/tests/bench/harness-eval.mjs` | ใหม่: Eval Harness 10 สถานการณ์แบบออฟไลน์ (`npm run eval`) |
| `astracode/tests/harness-eval.test.mjs` | ใหม่: รัน Eval Harness ใน `npm test` |
| `astracode/package.json` | เพิ่มสคริปต์ `eval` |
| `astracode/src/api.js` | ตั้งช่วงเวลา keepalive ได้ด้วย `SSE_PING_MS` (ใช้ในเทสต์เท่านั้น ค่าเริ่มต้น 15 วินาที) |
| `astracode/public/og.png` | ภาพ OG ใหม่: Kyber by Hypatia · formerly AstraCode |
| `KYBER-ROLLOUT.md` | เอกสารนี้ |

## ผลเทสต์ (ก่อน commit เฟส 3)

| ชุด | คำสั่ง | ผล |
|---|---|---|
| Web/Worker | `cd astracode && npm test` | **273 ผ่าน / 0 ไม่ผ่าน** (เดิม 253 + ใหม่ 20) |
| Lint | `cd astracode && npm run lint` | ไม่มี error |
| E2E (Playwright) | `cd astracode && npm run e2e` | ผ่านทุก flow |
| Desktop | `cd desktop && npm test` | **38 ผ่าน / 0 ไม่ผ่าน** (เดิม 18 + ใหม่ 20) |
| Eval Harness | `cd astracode && npm run eval` | **10/10** |

**เทียบ Eval Harness กับตัวคุมรอบรุ่นก่อนเฟส 2:**
- คำสั่ง: `KYBER_DESKTOP_DIR=<โฟลเดอร์ desktop รุ่นเก่า> npm run eval`
- รุ่นเก่าผ่าน 2/10 รุ่นใหม่ผ่าน 10/10
- เคส `flaky-provider`: รุ่นเก่าก็ลองใหม่เมื่อเจอ 503 เหมือนกัน แต่ไม่ผ่านเพราะยังไม่รายงานจำนวนครั้งที่ลองใหม่

**สถานการณ์ใน Eval Harness:**
1. `bugfix-and-verify`: อ่าน → แก้บัค → รันทดสอบ
2. `multi-edit-atomic-recovery`: แก้หลายจุด ผิดจุดเดียวไฟล์ไม่ถูกแตะ
3. `syntax-guard-after-edit`: แก้ไฟล์แล้วพังจะถูกแจ้งทันที
4. `stuck-loop-escape`: วนซ้ำแล้วถูกเตือน จนเปลี่ยนวิธีได้
5. `flaky-provider`: เจอ 429/503/502 กลางงานแล้วทำงานต่อจนเสร็จ
6. `long-output-spill`: ผลยาวเก็บลงไฟล์ แล้ว grep หาบรรทัดที่ต้องการได้
7. `crash-resume`: แอปปิดกลางรอบ แล้วซ่อมประวัติก่อนทำต่อ
8. `secret-hygiene`: key ใน `.env` ไม่หลุดไปถึงโมเดล
9. `parallel-read-serial-write`: อ่านพร้อมกัน เขียนตามลำดับ
10. `compaction-keeps-state`: รายการงาน ไฟล์ที่แก้ และ error ค้าง ยังอยู่หลังย่อบทสนทนา

## Deployment Checklist

> **สำคัญ:** push เข้า `main` จะ deploy production ทันที
> - เว็บ/API ผ่าน `.github/workflows/deploy.yml`
> - **แอป Desktop 0.10.0** ผ่าน `.github/workflows/desktop.yml`: build แล้วอัปโหลดขึ้น release `desktop-latest` ผู้ใช้แอปทุกคนจะได้อัปเดตอัตโนมัติ

### ก่อน merge
- [ ] ตรวจ diff ทั้ง 3 commit บน branch `ccr-84ca511c-jo3r38`
- [ ] รันเทสต์ในเครื่อง: `cd astracode && npm test && npm run lint && npm run e2e` และ `cd desktop && npm test`
- [ ] จดเวอร์ชันที่ใช้งานอยู่ไว้สำหรับ rollback:
  ```bash
  cd astracode && npx wrangler@4.162.0 deployments list
  ```
  จดค่า "Version(s)" บนสุด แล้วยิง `curl -s https://astracode.panderx.xyz/api/version` เพื่อเก็บ commit sha ปัจจุบัน
- [ ] (แนะนำ) สำรอง D1 ก่อน:
  ```bash
  npx wrangler@4.162.0 d1 export astracode --remote --output backup-before-kyber.sql
  ```
  เฟสนี้ไม่แก้ตารางเดิม แค่เพิ่มตาราง `agent_harness`

### โดเมน / DNS / Cloudflare (ทำตอนย้ายไปโดเมนใหม่ ยังไม่ต้องทำตอนนี้)
ตอนนี้ระบบยังอยู่ที่ `astracode.panderx.xyz` ตามที่ตกลงไว้ เมื่อพร้อมย้าย:
- [ ] Cloudflare → Workers & Pages → `astracode` → Settings → Domains & Routes → **Add Custom Domain** (โดเมนใหม่) **และคงโดเมนเดิมไว้**
  - key, ลิงก์แชร์ และแอปรุ่นเก่ายังชี้โดเมนเดิม
  - ห้ามทำ 301 ของ `/v1/*` และ `/api/*`
- [ ] ตั้ง Worker var `PUBLIC_URL=https://<โดเมนใหม่>` ซึ่งใช้ในลิงก์อีเมลและงานเบื้องหลัง (`src/billing.js` → `siteUrl`)
- [ ] สร้างหน้า HTML ใหม่ด้วยโดเมนใหม่ (canonical / og:url / JSON-LD) แล้ว commit:
  ```bash
  SITE=https://<โดเมนใหม่> node tools/pages.mjs
  ```
- [ ] `sitemap.xml` / `robots.txt` สร้างจากโดเมนของคำขอ (`src/jobs.js`) จึงไม่ต้องแก้ · แก้ URL ที่ตรวจใน `deploy.yml` (Verify live version, Smoke test) เมื่อเลิกใช้โดเมนเดิม
- [ ] แอป Desktop: เพิ่ม origin ใหม่ใน `SITES` และ hostname ใน `AUTH_HOSTS` (`desktop/main.js`) **ก่อน**ปล่อยแอปรุ่นที่เปลี่ยน `SITE`
- [ ] Google Search Console: เพิ่ม property โดเมนใหม่ แล้วใช้ Change of Address จากโดเมนเดิม (หลังโดเมนใหม่ใช้งานได้แล้ว)

### OAuth / Firebase (ทำตอนเพิ่มโดเมนใหม่)
- [ ] **Google OAuth (ล็อกอิน + Connectors):** Google Cloud Console → APIs & Services → Credentials → OAuth client
  - เพิ่ม Authorized JavaScript origins: `https://<โดเมนใหม่>`
  - เพิ่ม Authorized redirect URIs: `https://<โดเมนใหม่>/api/oauth/google/callback` (ใช้ทั้งล็อกอินและ Google Connectors: `src/user.js` และ `src/google.js` สร้างจากโดเมนที่ผู้ใช้เปิดอยู่)
  - **คงของโดเมนเดิมไว้**
- [ ] **OAuth consent screen:** เปลี่ยน App name เป็น "Kyber", Developer/Company เป็น "Hypatia", อัปโหลดโลโก้ใหม่
  - ถ้าแอปผ่าน verification แล้ว การเปลี่ยนชื่อ/โลโก้อาจต้องรอ Google ตรวจใหม่
- [ ] **LINE Login:** LINE Developers → Channel → LINE Login → Callback URL: เพิ่ม `https://<โดเมนใหม่>/api/oauth/line/callback` และเปลี่ยน Channel name/icon เป็น Kyber
- [ ] **Firebase Auth:** Firebase Console → Authentication → Settings → **Authorized domains**: เพิ่มโดเมนใหม่ (คงโดเมนเดิมไว้)
  - เปลี่ยน Project public-facing name เป็น "Kyber" และ Support email
  - แก้ template อีเมล (verification/reset) ให้ใช้ชื่อ Kyber
- [ ] **Turnstile:** Cloudflare → Turnstile → widget → Hostname management: เพิ่มโดเมนใหม่
- [ ] **Resend (อีเมล):** ถ้าจะส่งจากโดเมนใหม่ ให้ verify โดเมนใน Resend แล้วตั้ง `mail_from` ในหลังบ้าน (ค่าเริ่มต้นตอนนี้ `Kyber by Hypatia <onboarding@resend.dev>`)

### ไอคอน / OG image
- [x] `public/og.png`: ทำใหม่แล้ว (Kyber by Hypatia · formerly AstraCode, 1200×630)
- [ ] `public/icon.svg`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `desktop/build/icon.png`: ยังเป็นโลโก้เดิม (ไม่มีตัวอักษรชื่อแบรนด์ ใช้ต่อได้)
  - ถ้าจะใช้โลโก้ Kyber ให้แทนที่ไฟล์ที่ขนาดเดิม แล้วเปลี่ยน `?v=` / ชื่อไฟล์เพื่อล้าง cache ของ PWA
- [ ] ตรวจภาพตัวอย่างลิงก์หลัง deploy:
  - Facebook Sharing Debugger: กด "Scrape Again"
  - LINE: แชร์ลิงก์ใหม่ (LINE cache ราว 1 วัน)
  - X Card Validator

### Merge และ deploy
- [ ] Merge branch เข้า `main` (PR หรือ fast-forward) แล้วดู Actions:
  - `Deploy`: lint → test → e2e → deploy → **Verify live version** → container → **Smoke test** ต้องเขียวทั้งหมด
  - `Build Desktop`: Windows + Linux ต้องเขียว แล้ว release `desktop-latest` จะมี `latest.yml` เวอร์ชัน 0.10.0
- [ ] ตรวจด้วยมือหลัง deploy (5–10 นาที):
  - [ ] ล็อกอินด้วย Google / LINE / อีเมล ได้ และลูกค้าที่ล็อกอินค้างไว้ไม่หลุด
  - [ ] `curl https://astracode.panderx.xyz/v1/models -H "Authorization: Bearer sk-astra-…"` ได้ 200
  - [ ] สตรีม `/v1/chat/completions` มีบรรทัด `: ping` ระหว่างรอ และ SDK ของ OpenAI/Anthropic อ่านได้ปกติ
  - [ ] แชตบนเว็บตอบได้ และพับจอระหว่างตอบแล้วกลับมาก็ได้คำตอบ
  - [ ] Kyber Code / Kyber Harness (งานบนคลาวด์) เริ่มงานและได้ไฟล์
  - [ ] แอป Desktop รุ่นเดิมอัปเดตเป็น 0.10.0 แล้วยังล็อกอินอยู่ ประวัติแชต Agent และโฟลเดอร์ที่เชื่อมยังอยู่ (เพราะ userData ถูกตรึงไว้ที่โฟลเดอร์ "AstraCode Desktop")
  - [ ] ลิงก์ `astracode://` และ `kyber://` เปิดแอปได้
- [ ] ดูหลังบ้าน 24 ชม.: error ของโมเดล (`events`), `api_log` status 5xx, ตาราง `agent_harness` (retries / stuck / cache_hit) และ Workers Logs

## Rollback Checklist

### เว็บ/API (Cloudflare Worker): เร็วที่สุด ไม่ต้องรอ CI
```bash
cd astracode
npx wrangler@4.162.0 deployments list                  # ดูเวอร์ชันก่อนหน้า (version id)
npx wrangler@4.162.0 rollback <VERSION_ID> -m "rollback Kyber rollout"
# หรือย้อนไปเวอร์ชันก่อนหน้าทันที (wrangler จะถามยืนยัน):
npx wrangler@4.162.0 rollback -m "rollback Kyber rollout"
curl -s https://astracode.panderx.xyz/api/version     # ต้องได้ sha เดิมที่จดไว้
```
- Worker ชื่อเดียว (`astracode`) ทั้ง config ปกติและ `wrangler.cloud.toml` (เครื่องเสมือน) การ rollback จึงย้อนทั้งเว็บและ Durable Objects ไปเวอร์ชันนั้น
- ข้อจำกัด: `wrangler rollback` ย้อนเวอร์ชันที่มีการเปลี่ยน Durable Object migration ไม่ได้ แต่ rollout นี้**ไม่มี migration ใหม่**
- container image ของ Agent บนคลาวด์ไม่ย้อนตาม ถ้าต้องย้อนให้ใช้วิธี "ย้อนด้วย git" ด้านล่าง ซึ่งจะ build image จาก commit เดิม

### ย้อนด้วย git (ถาวร ให้ CI deploy ใหม่)
```bash
git checkout main && git pull
git revert --no-edit <merge-commit-sha>      # หรือ: git revert --no-edit <sha เฟส3> accdb94 fd3cbf1
git push origin main                          # deploy.yml + desktop.yml ทำงานใหม่
```

### แอป Desktop
- electron-updater **ไม่ downgrade เอง** ถ้า 0.10.0 มีปัญหา ให้ revert โค้ดแล้ว**ขึ้นเลขเวอร์ชันใหม่** (เช่น `0.10.1`) ใน `desktop/package.json` ก่อน push
- ข้อมูลผู้ใช้ปลอดภัย: 0.10.0 ใช้โฟลเดอร์ userData เดิม ("AstraCode Desktop") และไม่แก้รูปแบบไฟล์ settings / session ของ Agent
- ผู้ใช้ใหม่ที่ได้โฟลเดอร์ `~/KyberWorkspace` ยังใช้ได้กับรุ่นเก่า (เป็นแค่ path ใน settings)

### ฐานข้อมูล D1
- ไม่ต้องย้อน: rollout นี้เพิ่มแค่ตาราง `agent_harness` (เวอร์ชันเก่าไม่อ่านตารางนี้)
- ถ้าต้องการลบ: `npx wrangler@4.162.0 d1 execute astracode --remote --command "DROP TABLE IF EXISTS agent_harness"`
- ฉุกเฉินเท่านั้น (ย้อนข้อมูลทั้งฐาน **ข้อมูลหลังเวลานั้นจะหาย**):
  ```bash
  npx wrangler@4.162.0 d1 time-travel restore astracode --timestamp=<unix-time ก่อน deploy>
  ```

### ปิดเฉพาะส่วนที่มีปัญหา (ไม่ต้อง rollback ทั้งระบบ)
| อาการ | วิธีแก้ |
|---|---|
| ลูกค้า API บ่นว่าโดนตัดเพราะรอนาน | ตั้ง `first_token_s` / `idle_s` ของโมเดลนั้นให้สูงขึ้นในหลังบ้าน (ค่าเริ่มต้น /v1: 180 วินาที หรือ 300 เมื่อ effort สูง / เงียบได้ 120 วินาที) |
| client เก่าอ่านบรรทัด `: ping` ไม่ได้ | ผิดสเปก SSE และพบได้ยาก ให้ rollback Worker แล้วแจ้งผู้ใช้ client นั้น |
| ภาพ OG ใหม่ไม่ถูกใจ | ดึงไฟล์เดิมคืน: `git checkout fd3cbf1 -- astracode/public/og.png` |
