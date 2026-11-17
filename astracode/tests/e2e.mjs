// เปิดทุกหน้าในเบราว์เซอร์จริง (Chromium) กับ API จำลอง: หน้าต้องวาดได้และไม่มี error ของ JavaScript
// รัน: npm run e2e (ต้องมี playwright) · ไม่ได้แตะ Worker จริง ทดสอบเฉพาะโค้ดฝั่งหน้าเว็บ
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url); let pw; try { pw = req('playwright'); } catch { pw = req('playwright-core'); } // CI ใช้ playwright-core กับ Chrome ของเครื่อง (CHROME_PATH)
const { chromium } = pw;
const pub = join(dirname(fileURLToPath(import.meta.url)), '../public');
const usage = { pct4h: 12, pctWeek: 34, reset4h: Date.now() + 3600e3, resetWeek: Date.now() + 5 * 864e5, use4h: true };
const models = [{ id: 1, name: 'Flash', provider: 'openai', multiplier: 1, vision: 1, effort: 'none', cap_pct: 0 }, { id: 2, name: 'Sonnet', provider: 'anthropic', multiplier: 5, vision: 1, effort: 'anthropic', effort_levels: 'low,high', cap_pct: 30 }];
const ME = admin => ({ email: 'tester@example.com', role: admin ? 'admin' : 'user', plan: { id: 2, name: 'Plus', paid: true, api_limit: true, expires: Date.now() + 9 * 864e5, period: 'month', team: null }, balance: 120, ref_code: 'AB12', email_verified: true, totp_on: false, has_password: true, instructions: '', wallet_overflow: false, auto_renew: true, usage, reset_credits: 0, reset_list: [], models, promptpay_id: '0800000000', pay_info: { bank_name: 'Bank', bank_account: '111-1-11111-1', bank_holder: 'Holder' } });
const plans = [{ id: 1, name: 'Free', price: 0, description: 'ฟรี', seats: 1, models: [{ name: 'Flash', week: 50 }] }, { id: 2, name: 'Plus', price: 349, price_year: 3490, description: 'ดี', seats: 1, api_limit: 1, models: [{ name: 'Flash', week: 900 }, { name: 'Sonnet', week: 90 }] }, { id: 3, name: 'Team 5', price: 1790, price_year: 17900, description: 'ทีม', seats: 5, shared_pool: 1, api_limit: 1, models: [{ name: 'Flash', week: 5000 }] }];
const API = (admin, loggedIn) => ({
  '/api/me': loggedIn ? ME(admin) : null, '/api/settings/public': { search: true }, '/api/plans': plans,
  '/api/pricing': { note: '', plans: plans.map(p => ({ id: p.id, name: p.name, price: p.price, limit_week: 30 })), models: [{ id: 1, name: 'Flash', provider: 'openai', in: 2.5, out: 10, cache: 0.2, cache_write: 0, plans: [1, 2], multiplier: 1, official: { in: 0.3, out: 1.2 } }, { id: 9, name: 'PerRequest', provider: 'openai', req: 1.2, in: 0, out: 0, cache: 0, plans: [2], multiplier: 1 }] },
  '/api/pricing/calc': { per1: 0.01, month: 3, plans: [{ id: 2, pct: 12 }] },
  '/api/status': { updated: Date.now(), models: [{ name: 'Flash', uptime: 99.9, state: 'ok', down: false, days: Array.from({ length: 30 }, () => ({ ok: 5, err: 0 })) }] },
  '/api/wallet': { balance: 120, ref_code: 'AB12', referred: 0, referred_paid: 0, bonus: 20, tx: [{ amount: 100, balance_after: 120, kind: 'topup', ref: null, created_at: Date.now() }] },
  '/api/team': { team: null }, '/api/admin-gate': { set: true, ok: true },
  '/api/admin/quality': { votes: [], reports: [], cache: [{ model_id: 1, name: 'Flash', n: 3, fresh: 100, cached: 300 }] },
  '/api/admin/settings': { env: {}, health_check: '0' }, '/api/pay': [], '/api/skills': [{ id: 1, user_id: 0, name: 'translator', description: 'แปล', content: 'x', enabled: 1 }],
});
const PAGES = [['/', 0, 1], ['/login', 0, 0], ['/chat', 0, 1], ['/plans', 0, 1], ['/plans?team=1', 0, 1], ['/pricing', 0, 1], ['/pricing', 0, 0], ['/account', 0, 1], ['/developers', 0, 1], ['/status', 0, 0], ['/terms', 0, 0], ['/support', 0, 1], ['/code', 0, 1], ['/admin?tab=quality', 1, 1], ['/admin?tab=settings', 1, 1], ['/admin?tab=models', 1, 1]];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } : {}); let failed = 0;
for (const [url, admin, loggedIn] of PAGES) {
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } }), errs = [], api = API(admin, loggedIn);
  page.on('pageerror', e => errs.push(e.message + (process.env.STACK ? ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' < ') : '')));
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 't.test') return r.abort();
    if (u.pathname.startsWith('/api/')) { const d = api[u.pathname]; return d === null ? r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d ?? []) }); }
    const f = join(pub, u.pathname === '/' ? 'home.html' : u.pathname), hit = [f, f + '.html'].find(x => existsSync(x) && statSync(x).isFile());
    return hit ? r.fulfill({ path: hit }) : r.fulfill({ status: 404, body: '' });
  });
  await page.goto('http://t.test' + url); await page.waitForTimeout(900);
  const text = (await page.locator('#app').innerText().catch(() => '')).trim();
  const ok = !errs.length && text.length > 20; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${url}${loggedIn ? admin ? ' (admin)' : ' (user)' : ' (guest)'}${errs.length ? '  ' + errs.join(' | ').slice(0, 300) : ''}${text.length <= 20 ? '  (empty page)' : ''}`);
  await page.close();
}
await browser.close(); console.log(failed ? `${failed} page(s) failed` : 'all pages ok'); process.exit(failed ? 1 : 0);
