// AstraCode demo: fake API in the browser. Nothing is saved; reload = reset.
(() => {
  const DAY = 864e5, now = () => Date.now();
  const S = {
    logged: false, email: '', planId: 3, expires: now() + 20 * DAY, u4: 0, uw: 0,
    settings: { promptpay_id: '', slip_api_url: '', slip_amount_field: 'data.amount', featured_plan: '3' },
    models: [
      { id: 1, name: 'DeepSeek', provider: 'openai', api_model: 'deepseek-flash', base_url: 'https://api.deepseek.com', key_name: 'DEEPSEEK_KEY', multiplier: 1, cost_in: 0.97, cost_out: 3.87, cost_cache: 0.02, cost_cache_write: 0.97, vision: 0, effort: 'deepseek', sort: 0, active: 1, has_key: true },
      { id: 2, name: 'Claude Sonnet 5.5', provider: 'anthropic', api_model: 'claude-sonnet-5-5', base_url: 'https://api.anthropic.com/v1', key_name: 'ANTHROPIC_KEY', multiplier: 35, cost_in: 24.9, cost_out: 124.6, cost_cache: 2.5, cost_cache_write: 31.2, vision: 1, effort: 'anthropic', sort: 1, active: 1, has_key: true },
    ],
    plans: [
      { id: 1, name: 'Free', price: 0, limit_4h: 100000, limit_week: 1000000, description: 'DeepSeek ฟรี', sort: 0, active: 1, model_ids: [1] },
      { id: 2, name: 'DeepSeek Lite', price: 59, limit_4h: 1500000, limit_week: 6000000, description: 'DeepSeek ไม่อั้นแบบคุ้ม', sort: 1, active: 1, model_ids: [1] },
      { id: 3, name: 'Sonnet Plus', price: 299, limit_4h: 6000000, limit_week: 30000000, description: 'DeepSeek + Claude Sonnet', sort: 2, active: 1, model_ids: [1, 2] },
      { id: 4, name: 'Pro', price: 499, limit_4h: 12000000, limit_week: 60000000, description: 'ทุกโมเดล ยกเว้น Opus', sort: 3, active: 1, model_ids: [1, 2] },
    ],
    chats: [{ id: 1, title: 'ตัวอย่าง: วางแผนเที่ยวเชียงใหม่', msgs: [
      { role: 'user', content: 'ช่วยวางแผนเที่ยวเชียงใหม่ 2 วันหน่อย' },
      { role: 'assistant', model: 'DeepSeek', content: '## เชียงใหม่ 2 วัน\n\n**วันที่ 1**\n- เช้า: วัดพระธาตุดอยสุเทพ\n- บ่าย: นิมมานเหมินท์ คาเฟ่\n- เย็น: ถนนคนเดินวัวลาย (เฉพาะวันเสาร์)\n\n**วันที่ 2**\n1. ม่อนแจ่ม ชมวิว\n2. สวนพฤกษศาสตร์ฯ\n3. กลับมากินข้าวซอยในเมือง\n\n| รายการ | งบโดยประมาณ |\n|---|---|\n| ที่พัก | 800–1,500 บาท/คืน |\n| เช่ารถ | 250 บาท/วัน |\n\n> ถ้าไปหน้าหนาว เตรียมเสื้อกันหนาวด้วย' },
    ] }],
    nextChat: 2, payments: [], nextPay: 1,
    users: [
      { id: 1, email: 'you@demo', role: 'admin', plan_id: 3, plan_expires: now() + 20 * DAY, banned: 0 },
      { id: 2, email: 'somchai@example.com', role: 'user', plan_id: null, plan_expires: null, banned: 0 },
      { id: 3, email: 'nida@example.com', role: 'user', plan_id: 2, plan_expires: now() + 9 * DAY, banned: 0 },
    ],
    usageLog: [],
  };
  // ตัวอย่างสลิปรออนุมัติ 1 ใบ
  const svgSlip = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="300" height="420" rx="20" fill="#fff"/><text x="150" y="80" font-size="22" text-anchor="middle" font-family="sans-serif" fill="#1d1d1f">โอนเงินสำเร็จ</text><text x="150" y="160" font-size="40" text-anchor="middle" font-family="sans-serif" fill="#1d1d1f">59.00</text><text x="150" y="200" font-size="14" text-anchor="middle" font-family="sans-serif" fill="#6e6e73">ตัวอย่างสลิป (เดโม)</text></svg>');
  S.payments.push({ id: S.nextPay++, user_id: 2, email: 'somchai@example.com', plan_id: 2, plan_name: 'DeepSeek Lite', amount: 59, slip: svgSlip, slip_amount: 59, slip_check: '{"data":{"amount":59}}', status: 'pending', created_at: now() - 3600e3 });

  const plan = () => S.plans.find(p => p.id === S.planId) || S.plans[0];
  const allowed = p => S.models.filter(m => p.model_ids.includes(m.id) && m.active);
  const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; };
  const usage = () => {
    const p = plan(), pct = (a, b) => Math.min(100, Math.round(a / b * 1000) / 10);
    return { pct4h: pct(S.u4, p.limit_4h), pctWeek: pct(S.uw, p.limit_week), reset4h: S.u4 ? now() + 3.5 * 3600e3 : null, resetWeek: weekStart() + 7 * DAY };
  };
  const res = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
  const err = (m, s = 400) => res({ error: m }, s);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const ANSWERS = [
    t => `นี่คือคำตอบตัวอย่างในโหมดเดโมครับ คุณถามว่า **"${t.slice(0, 60)}"**\n\nบนเว็บจริงคำตอบจะมาจากโมเดลที่เลือก ตัวอย่างการแสดงผล:\n\n- รายการแบบจุด\n- \`โค้ดสั้นๆ\` ในบรรทัด\n  - รายการย่อย\n\n1. ขั้นที่หนึ่ง\n2. ขั้นที่สอง`,
    t => `ตัวอย่างโค้ดสำหรับ "${t.slice(0, 40)}":\n\n\`\`\`python\ndef hello(name):\n    return f"สวัสดี {name}"\n\nprint(hello("AstraCode"))\n\`\`\`\n\nกดปุ่ม **คัดลอก** ที่หัวบล็อกโค้ดได้เลย`,
    t => `สรุปเปรียบเทียบให้ครับ\n\n| หัวข้อ | ตัวเลือก A | ตัวเลือก B |\n|---|---|---|\n| ราคา | ถูก | แพงกว่า |\n| ความเร็ว | เร็ว | ปานกลาง |\n| เหมาะกับ | งานทั่วไป | งานยาก |\n\n> ตารางกว้างเลื่อนซ้ายขวาได้บนมือถือ`,
  ];
  let ai = 0;

  function chatStream(body, signal) {
    const p = plan(), m = allowed(p).find(x => x.id === body.model_id);
    if (!m) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
    const u = usage();
    if (u.pct4h >= 100 || u.pctWeek >= 100) return res({ error: 'ลิมิตเต็มแล้ว', ...u }, 429);
    if (body.images?.length && !m.vision) return err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น');
    let c = S.chats.find(x => x.id === body.chat_id);
    let text = body.text || (body.images?.length ? 'อธิบายรูปนี้' : '');
    if (body.regenerate) {
      if (!c) return err('ไม่มีข้อความให้ตอบใหม่');
      if (c.msgs.at(-1)?.role === 'assistant') c.msgs.pop();
      text = c.msgs.at(-1)?.content || '';
    } else {
      if (!text) return err('ข้อความว่าง');
      if (!c) { c = { id: S.nextChat++, title: text.slice(0, 40), msgs: [] }; S.chats.unshift(c); }
      c.msgs.push({ role: 'user', content: body.images?.length ? `${text}\n\n[แนบรูป ${body.images.length} รูป]` : text });
    }
    const think = body.effort ? `_(โหมดคิด: ${body.effort})_ ` : '';
    const reply = (body.images?.length ? `เห็นรูป ${body.images.length} รูปแล้วครับ (เดโม: ไม่ได้ส่งให้ AI จริง)\n\n` : '') + think + ANSWERS[ai++ % ANSWERS.length](text);
    const enc = new TextEncoder(), cid = c.id;
    let out = '';
    const finish = () => {
      if (out) c.msgs.push({ role: 'assistant', content: out, model: m.name });
      const units = (text.length * 2 + out.length) * m.multiplier * 40 * (body.effort ? 2 : 1); // เดโม: คิดลิมิตเร็วกว่าจริงให้เห็นแถบขยับ
      S.u4 += units; S.uw += units / 3;
      S.usageLog.push({ model: m.name, tin: text.length * 2, tout: out.length, cost: units / 1e6 * 1.2 });
    };
    const stream = new ReadableStream({
      async start(ctl) {
        const send = o => ctl.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n'));
        send({ chat_id: cid, model: m.name });
        await wait(body.effort ? 1200 : 400); // จำลองเวลาคิด
        for (const ch of reply.match(/[\s\S]{1,6}/g)) {
          if (signal?.aborted) { finish(); ctl.error(new DOMException('Aborted', 'AbortError')); return; }
          out += ch; send({ t: ch }); await wait(25);
        }
        finish(); send({ done: true, ...usage() }); ctl.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  }

  const est = p => allowed(p).map(m => ({ name: m.name, week: Math.floor(p.limit_week / (2500 * m.multiplier)) }));
  async function api(path, opt) {
    const M = (opt.method || 'GET').toUpperCase();
    const body = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    const q = new URL(path, location.origin);
    path = q.pathname;
    let r;
    if (path === '/api/plans') return res(S.plans.filter(p => p.active).sort((a, b) => a.sort - b.sort).map(p => ({ id: p.id, name: p.name, price: p.price, description: p.description, models: est(p), featured: String(p.id) === S.settings.featured_plan })));
    if (path === '/api/register' || path === '/api/login') {
      if (!/^[^\s@]+@[^\s@]+$/.test(body.email || '') || String(body.password || '').length < 8) return err('ใส่อีเมล และรหัสผ่านอย่างน้อย 8 ตัว (เดโม: อะไรก็ได้)');
      S.logged = true; S.email = body.email; S.users[0].email = body.email; return res({ ok: true });
    }
    if (!S.logged) return err('กรุณาเข้าสู่ระบบ', 401);
    if (path === '/api/logout') { S.logged = false; return res({ ok: true }); }
    if (path === '/api/me') { const p = plan(); return res({ email: S.email, role: 'admin', plan: { id: p.id, name: p.name, expires: p.price > 0 ? S.expires : null }, usage: usage(), models: allowed(p).map(({ id, name, multiplier, vision, effort }) => ({ id, name, multiplier, vision, effort })), promptpay_id: S.settings.promptpay_id }); }
    if (path === '/api/password') return body.old ? res({ ok: true }) : err('รหัสผ่านเดิมไม่ถูกต้อง', 401);
    if (path === '/api/chat') return chatStream(body, opt.signal);
    if (path === '/api/chats') return res(S.chats.map(c => ({ id: c.id, title: c.title })));
    if ((r = path.match(/^\/api\/chats\/(\d+)$/))) {
      const c = S.chats.find(x => x.id === +r[1]); if (!c) return err('ไม่พบแชต', 404);
      if (M === 'DELETE') { S.chats = S.chats.filter(x => x !== c); return res({ ok: true }); }
      if (M === 'PUT') { c.title = body.title; return res({ ok: true }); }
      return res(c.msgs);
    }
    if (path === '/api/pay' && M === 'POST') {
      const f = body.get('slip'), p = S.plans.find(x => x.id === +body.get('plan_id'));
      if (!f?.size) return err('อัปโหลดรูปสลิป');
      if (S.payments.some(x => x.user_id === 1 && x.status === 'pending')) return err('มีคำขอที่รออนุมัติอยู่แล้ว');
      const slip = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(f); });
      S.payments.unshift({ id: S.nextPay++, user_id: 1, email: S.email, plan_id: p.id, plan_name: p.name, amount: p.price, slip, slip_amount: null, slip_check: null, status: 'pending', created_at: now() });
      return res({ ok: true });
    }
    if (path === '/api/pay') return res(S.payments.filter(x => x.user_id === 1));
    // ---------- admin ----------
    if ((r = path.match(/^\/api\/admin\/(plans|models)(?:\/(\d+))?$/))) {
      const list = S[r[1]];
      if (M === 'GET') return res([...list].sort((a, b) => a.sort - b.sort));
      if (M === 'DELETE') { S[r[1]] = list.filter(x => x.id !== +r[2]); return res({ ok: true }); }
      if (M === 'POST') { const id = Math.max(...list.map(x => x.id)) + 1; list.push({ ...body, id, has_key: true }); return res({ ok: true, id }); }
      Object.assign(list.find(x => x.id === +r[2]), body); return res({ ok: true });
    }
    if (path === '/api/admin/payments') return res(S.payments);
    if ((r = path.match(/^\/api\/admin\/payments\/(\d+)\/(approve|reject)$/))) {
      const p = S.payments.find(x => x.id === +r[1]);
      if (p.status !== 'pending') return err('คำขอนี้ถูกจัดการไปแล้ว', 409);
      p.status = r[2] === 'approve' ? 'approved' : 'rejected';
      if (p.status === 'approved') { const u = S.users.find(x => x.id === p.user_id); u.plan_id = p.plan_id; u.plan_expires = now() + 30 * DAY; if (u.id === 1) { S.planId = p.plan_id; S.expires = u.plan_expires; } }
      return res({ ok: true });
    }
    if (path === '/api/admin/users') { const s = (q.searchParams.get('q') || '').toLowerCase(); return res(S.users.filter(u => u.email.toLowerCase().includes(s)).map(u => ({ ...u, plan_name: S.plans.find(p => p.id === u.plan_id)?.name }))); }
    if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/))) {
      const u = S.users.find(x => x.id === +r[1]);
      if (body.password != null && String(body.password).length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
      if (body.reset_usage && u.id === 1) { S.u4 = 0; S.uw = 0; }
      if ('banned' in body) u.banned = body.banned;
      if ('plan_id' in body) { u.plan_id = body.plan_id; u.plan_expires = body.plan_id ? now() + 30 * DAY : null; if (u.id === 1) { S.planId = body.plan_id || 1; S.expires = u.plan_expires; } }
      return res({ ok: true });
    }
    if (path === '/api/admin/stats') {
      const rev = S.payments.filter(p => p.status === 'approved').reduce((a, p) => a + p.amount, 0) + 1740;
      const by = {}; S.usageLog.forEach(x => { const o = by[x.model] ||= { name: x.model, msgs: 0, tin: 0, tout: 0, cost: 0 }; o.msgs++; o.tin += x.tin; o.tout += x.tout; o.cost += x.cost; });
      const models = Object.values(by), cost = models.reduce((a, m) => a + m.cost, 0) + 212.4;
      return res({ revenue: rev, cost, profit: rev - cost, models, users: { total: S.users.length, paid: S.users.filter(u => u.plan_id).length }, pending: S.payments.filter(p => p.status === 'pending').length });
    }
    if (path === '/api/admin/settings') { if (M === 'PUT') Object.assign(S.settings, body); return res({ ...S.settings, slip_key_set: false }); }
    return err('not found', 404);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opt = {}) => {
    const u = String(url);
    if (!u.startsWith('/api')) return realFetch(url, opt);
    await wait(120); // จำลองเน็ต
    if (opt.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return api(u, opt);
  };

  // เฟรมของ artifact ไม่อนุญาต alert/confirm/prompt จึงใช้กล่องข้อความในหน้าแทน
  const toast = m => {
    const t = document.createElement('div'); t.className = 'demo-toast'; t.textContent = m;
    document.body.append(t); setTimeout(() => t.remove(), 2600);
  };
  window.alert = toast;
  window.confirm = () => true;
  window.prompt = (m, d) => (d ? d + ' (แก้ชื่อแล้ว)' : 'newpassword1');

  // รูปสลิปในหลังบ้านโหลดจาก /api/admin/slip/:id ซึ่งเดโมไม่มี จึงแทนด้วยรูปที่เก็บในหน่วยความจำ
  new MutationObserver(() => document.querySelectorAll('img[src^="/api/admin/slip/"]').forEach(img => {
    img.src = S.payments.find(p => p.id === +img.getAttribute('src').split('/').pop())?.slip || '';
  })).observe(document.documentElement, { childList: true, subtree: true });

  addEventListener('DOMContentLoaded', () => toast('โหมดเดโม: ล็อกอินด้วยอีเมลอะไรก็ได้ ข้อมูลไม่ถูกบันทึก'));
})();
