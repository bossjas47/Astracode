// AstraCode demo: fake API in the browser. Nothing is saved; reload = reset.
(() => {
  const DAY = 864e5, now = () => Date.now();
  const S = {
    logged: false, email: '', planId: 3, expires: now() + 20 * DAY, u4: 0, uw: 0,
    settings: { promptpay_id: '', slip_api_url: '', slip_amount_field: 'data.amount', featured_plan: '3' },
    models: [
      { id: 1, name: 'DeepSeek', promo_pct: 20, promo_start: now() - 2 * DAY, promo_end: now() + 12 * DAY, provider: 'openai', api_model: 'deepseek-flash', base_url: 'https://api.deepseek.com', key_name: 'DEEPSEEK_KEY', multiplier: 1, cost_in: 0.97, cost_out: 3.87, cost_cache: 0.02, cost_cache_write: 0.97, vision: 0, effort: 'deepseek', sort: 0, active: 1, has_key: true },
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
    projects: [{ id: 1, name: 'เว็บแรกของฉัน', updated_at: now(), files: {
      'index.html': '<!DOCTYPE html>\n<html lang="th">\n<head>\n  <meta charset="utf-8">\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>สวัสดี AstraCode</h1>\n  <button id="btn">กดเลย</button>\n  <script src="script.js"></script>\n</body>\n</html>\n',
      'style.css': 'body {\n  font-family: system-ui, sans-serif;\n  background: #111;\n  color: #f5f5f7;\n  padding: 24px;\n}\nbutton {\n  padding: 10px 20px;\n  border-radius: 999px;\n  border: 0;\n  background: #0071e3;\n  color: #fff;\n}\n',
      'script.js': "document.getElementById('btn').onclick = () => {\n  console.log('กดปุ่มแล้ว');\n};\n",
      'main.py': 'print("สวัสดี AstraCode")\n',
    } }],
    nextProject: 2,
    balance: 120, memories: [{ id: 1, text: 'ฉันชอบคำตอบสั้นๆ เป็นภาษาไทย' }], folders: [{ id: 1, name: 'งาน' }], keys: [], instructions: '', overflow: false, renew: false, totp: false,
    tickets: [{ id: 1, user_id: 1, subject: 'สอบถามเรื่องแพลนรายปี', status: 'answered', created_at: now() - 2 * DAY, updated_at: now() - DAY, msgs: [{ admin: 0, body: 'แพลนรายปีลดกี่เปอร์เซ็นต์ครับ', created_at: now() - 2 * DAY }, { admin: 1, body: 'ประหยัดประมาณ 2 เดือนครับ ดูได้ที่หน้าแพลน กดแท็บรายปี', created_at: now() - DAY }] }],
    coupons: [{ code: 'WELCOME20', kind: 'percent', value: 20, max_uses: 100, used: 12, expires: null, note: 'ลูกค้าใหม่', active: 1 }, { code: 'GIFT50', kind: 'credit', value: 50, max_uses: 0, used: 3, expires: null, note: '', active: 1 }],
    posts: [{ id: 1, slug: 'welcome', title: 'เปิดตัว AstraCode', summary: 'AI ทุกตัวในมือถือเครื่องเดียว พร้อมโหมด Code และ API', body: '## ยินดีต้อนรับ\n\nAstraCode รวม **Claude, GPT, Gemini, DeepSeek และ Kimi** ไว้ในเว็บเดียว\n\n- แชตบนมือถือ\n- เขียนโค้ดแบบ VS Code\n- API แบบ OpenAI', cover: '', published: 1, created_at: now() - 3 * DAY }],
    tx: [{ amount: 100, balance_after: 100, kind: 'topup', ref: 'payment#9', created_at: now() - 5 * DAY }, { amount: 20, balance_after: 120, kind: 'referral', ref: 'ref', created_at: now() - 4 * DAY }],
  };
  S.plans.forEach(p => p.price_year = p.price ? p.price * 10 : null);
  S.chats[0].folder_id = 1;
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
    const p = plan(); if (body.model_id === 'auto') { const ms = [...allowed(p)].sort((a, b) => a.multiplier - b.multiplier); body.model_id = (/โค้ด|code|วิเคราะห์|```/i.test(body.text || '') || body.images?.length || body.files?.length ? ms.at(-1) : ms[0]).id; }
    const m = allowed(p).find(x => x.id === body.model_id);
    if (!m) return err('แพลนของคุณใช้โมเดลนี้ไม่ได้', 403);
    const u = usage();
    if (u.pct4h >= 100 || u.pctWeek >= 100) return res({ error: 'ลิมิตเต็มแล้ว', ...u }, 429);
    if (body.images?.length && !m.vision) return err('โมเดลนี้อ่านรูปไม่ได้ เลือกโมเดลอื่น');
    let c = S.chats.find(x => x.id === body.chat_id);
    const files = body.files || [];
    let text = body.text || (files.length ? 'อ่านไฟล์นี้' : body.images?.length ? 'อธิบายรูปนี้' : '');
    if (body.regenerate) {
      if (!c) return err('ไม่มีข้อความให้ตอบใหม่');
      if (c.msgs.at(-1)?.role === 'assistant') c.msgs.pop();
      text = c.msgs.at(-1)?.content || '';
    } else {
      if (!text) return err('ข้อความว่าง');
      if (!c || body.ephemeral) { c = { id: body.ephemeral ? null : S.nextChat++, title: text.slice(0, 40), msgs: [], project_id: body.project_id || null }; if (!body.ephemeral) S.chats.unshift(c); }
      c.msgs.push({ role: 'user', content: text + files.map(f => `\n\n[[file:${f.name}]]\n${f.text}\n[[/file]]`).join('') + (body.images?.length ? `\n\n[แนบรูป ${body.images.length} รูป]` : '') });
    }
    if (body.project_id) { // โหมด Code: ตอบเป็นการแก้ไฟล์
      const code = `READ path=index.html\nGREP btn\n\nแก้ให้แล้วครับ (เดโม) เพิ่มตัวนับจำนวนครั้งที่กด และไฟล์ CSS ใหม่\n\n\`\`\`js path=script.js\nlet n = 0;\ndocument.getElementById('btn').onclick = () => {\n  n++;\n  console.log('กดครั้งที่', n);\n  document.querySelector('h1').textContent = 'กดแล้ว ' + n + ' ครั้ง';\n};\n\`\`\`\n\n\`\`\`css path=css/extra.css\nh1 { color: #2997ff; }\n\`\`\`\n\nกด **ดู diff** เพื่อดูว่าเปลี่ยนอะไร แล้วกด **Apply** เพื่อใช้`;
      return streamReply(c, m, text, code, body, signal);
    }
    if (/ไฟล์|excel|csv/i.test(text)) return streamReply(c, m, text, 'ทำไฟล์ให้แล้วครับ\n\n```csv file=sales.xlsx\nเดือน,ยอดขาย\nม.ค.,1200\nก.พ.,1500\n```\n\nกดดาวน์โหลดได้เลย', body, signal);
    if (/landing|เว็บ/i.test(text)) return streamReply(c, m, text, 'ได้เลยครับ ขอวางแผนก่อน:\n\n1. **Landing Page** — Hero, จุดเด่น, ฟอร์มติดต่อ\n2. **Catalog** — รายการพร้อมฟิลเตอร์\n3. **หลังบ้าน** — เพิ่ม/แก้ข้อมูล\n\n{"question":"ต้องการให้เริ่มจากส่วนไหนก่อน","options":["Landing Page ก่อน","ทำครบทุกส่วน",{"label":"ขอดูตัวอย่างดีไซน์ก่อน"}]}', body, signal);
    const think = body.effort ? `_(โหมดคิด: ${body.effort})_ ` : '';
    const fileNote = files.length ? `อ่านไฟล์แล้ว ${files.length} ไฟล์ (เดโม: ไม่ได้ส่งให้ AI จริง)\n\n${files.map(f => `- **${f.name}** ${f.text.length.toLocaleString()} ตัวอักษร: "${f.text.replace(/\s+/g, ' ').slice(0, 60)}…"`).join('\n')}\n\n` : '';
    const reply = fileNote + (body.images?.length ? `เห็นรูป ${body.images.length} รูปแล้วครับ (เดโม: ไม่ได้ส่งให้ AI จริง)\n\n` : '') + think + ANSWERS[ai++ % ANSWERS.length](text);
    return streamReply(c, m, text, reply, body, signal);
  }
  function streamReply(c, m, text, reply, body, signal) {
    const enc = new TextEncoder(), cid = c.id;
    let out = '';
    let think = '', tk = null; // ถูกตั้งค่าใน start()
    const finish = () => {
      tk = { in: Math.ceil(c.msgs.reduce((a, x) => a + x.content.length, 0) / 2) + 400, out: Math.ceil((out.length + think.length) / 2) };
      if (out) c.msgs.push({ role: 'assistant', content: out, model: m.name, thinking: think || null, tin: tk.in, tout: tk.out });
      const units = (text.length * 2 + out.length) * m.multiplier * 40 * (body.effort ? 2 : 1); // เดโม: คิดลิมิตเร็วกว่าจริงให้เห็นแถบขยับ
      S.u4 += units; S.uw += units / 3;
      S.usageLog.push({ model: m.name, tin: text.length * 2, tout: out.length, cost: units / 1e6 * 1.2 });
    };
    const stream = new ReadableStream({
      async start(ctl) {
        const send = o => ctl.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n'));
        send({ chat_id: cid, model: m.name });
        if (body.search) send({ sources: [{ title: 'Wikipedia: ปัญญาประดิษฐ์', url: 'https://th.wikipedia.org/wiki/ปัญญาประดิษฐ์' }, { title: 'ข่าว AI ล่าสุด (ตัวอย่าง)', url: 'https://example.com/ai-news' }] });
        if (body.effort) for (const ch of `ผู้ใช้ถามว่า "${text.slice(0, 40)}" ควรตอบให้ตรงคำถาม มีตัวอย่าง และจัดรูปแบบให้อ่านง่ายบนมือถือ (โหมด ${body.effort})`.match(/[\s\S]{1,4}/g)) {
          if (signal?.aborted) break; think += ch; send({ th: ch }); await wait(30);
        }
        await wait(300);
        for (const ch of reply.match(/[\s\S]{1,6}/g)) {
          if (signal?.aborted) { finish(); ctl.error(new DOMException('Aborted', 'AbortError')); return; }
          out += ch; send({ t: ch }); await wait(25);
        }
        finish(); send({ done: true, tok: tk, ...usage() }); ctl.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
  }

  function projectsApi(path, M, body, q) {
    const size = p => Object.values(p.files).reduce((a, c) => a + c.length, 0);
    if (path === '/api/projects') {
      if (M === 'POST') { const p = { id: S.nextProject++, name: body.name, updated_at: now(), files: { ...S.projects[0].files } }; S.projects.unshift(p); return res({ ok: true, id: p.id }); }
      return res(S.projects.map(p => ({ id: p.id, name: p.name, updated_at: p.updated_at, files: Object.keys(p.files).length, size: size(p) })));
    }
    const r = path.match(/^\/api\/projects\/(\d+)(\/[a-z]+)?$/), p = S.projects.find(x => x.id === +r?.[1]);
    if (!p) return err('ไม่พบโปรเจกต์', 404);
    p.updated_at = now();
    const sub = r[2] || '';
    if (!sub && M === 'GET') return res({ id: p.id, name: p.name, files: Object.keys(p.files).sort().map(k => ({ path: k, content: p.files[k] })) });
    if (!sub && M === 'PUT') { p.name = body.name; return res({ ok: true }); }
    if (!sub && M === 'DELETE') { S.projects = S.projects.filter(x => x !== p); return res({ ok: true }); }
    if (sub === '/file' && M === 'PUT') { p.files[body.path] = body.content; return res({ ok: true }); }
    if (sub === '/file' && M === 'DELETE') { const fp = q.searchParams.get('path'); for (const k of Object.keys(p.files)) if (fp.endsWith('/') ? k.startsWith(fp) : k === fp) delete p.files[k]; return res({ ok: true }); }
    if (sub === '/import') { for (const f of body.files) p.files[f.path] = f.content; return res({ ok: true }); }
    if (sub === '/rename') {
      for (const k of Object.keys(p.files)) if (body.from.endsWith('/') ? k.startsWith(body.from) : k === body.from) { const n = body.from.endsWith('/') ? body.to + k.slice(body.from.length) : body.to; p.files[n] = p.files[k]; delete p.files[k]; }
      return res({ ok: true });
    }
    return err('not found', 404);
  }
  const est = p => allowed(p).map(m => ({ name: m.name, week: Math.floor(p.limit_week / (2500 * m.multiplier)) }));
  async function api(path, opt) {
    const M = (opt.method || 'GET').toUpperCase();
    const body = typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body;
    const q = new URL(path, location.origin);
    path = q.pathname;
    let r;
    // ---------- ฟีเจอร์ชุดใหม่ (ไม่ต้องล็อกอิน) ----------
    if (path === '/api/settings/public') return res({ announcement: 'หน้าเดโม: ทุกปุ่มกดได้ แต่ข้อมูลไม่ถูกบันทึก', announcement_level: 'info', maintenance: '0', referral_bonus: '20', topup_min: '50', search: true, image: true, google: true, line: true, mail: true });
    if (path === '/api/blog') return res(S.posts.filter(p => p.published));
    if ((r = path.match(/^\/api\/blog\/(.+)$/))) { const p = S.posts.find(x => x.slug === decodeURIComponent(r[1]) && x.published); return p ? res(p) : err('ไม่พบบทความ', 404); }
    if (path === '/api/status') { const today = Math.floor(now() / DAY); return res({ updated: now(), models: S.models.map((m, k) => ({ name: m.name, uptime: k ? 99.2 : 100, down: false, days: Array.from({ length: 30 }, (_, i) => ({ d: (today - 29 + i) * DAY, ok: 50 + i, err: k && i % 9 === 4 ? 2 : 0 })) })) }); }
    if (S.logged) {
      const u0 = S.users[0];
      if (path === '/api/me' && M === 'PUT') { if ('instructions' in body) S.instructions = body.instructions; if ('wallet_overflow' in body) S.overflow = body.wallet_overflow; if ('auto_renew' in body) S.renew = body.auto_renew; return res({ ok: true }); }
      if (path === '/api/wallet') return res({ balance: S.balance, ref_code: 'DEMO1234', referred: 3, referred_paid: 1, bonus: 20, tx: [...S.tx].reverse() });
      if (path === '/api/memories') { if (M === 'POST') { const m = { id: Date.now(), text: body.text }; S.memories.push(m); return res(m); } return res(S.memories); }
      if ((r = path.match(/^\/api\/memories\/(\d+)$/))) { S.memories = S.memories.filter(m => m.id !== +r[1]); return res({ ok: true }); }
      if (path === '/api/folders') { if (M === 'POST') { const f = { id: Date.now(), name: body.name }; S.folders.push(f); return res(f); } return res(S.folders); }
      if ((r = path.match(/^\/api\/folders\/(\d+)$/))) { if (M === 'DELETE') { S.folders = S.folders.filter(f => f.id !== +r[1]); S.chats.forEach(c => { if (c.folder_id === +r[1]) c.folder_id = null; }); } else S.folders.find(f => f.id === +r[1]).name = body.name; return res({ ok: true }); }
      if (path === '/api/keys') { if (M === 'POST') { const key = 'sk-astra-demo' + Math.random().toString(36).slice(2, 14); S.keys.unshift({ id: Date.now(), name: body.name || 'default', prefix: key.slice(0, 14), created_at: now(), last_used: null, budget: null, models: null, spent: 0 }); return res({ key }); } return res(S.keys); }
      if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'DELETE') { S.keys = S.keys.filter(k => k.id !== +r[1]); return res({ ok: true }); }
      if (path === '/api/coupon/check') { const c = S.coupons.find(x => x.code === String(body.code).toUpperCase() && x.kind !== 'credit'); if (!c) return err('คูปองใช้ไม่ได้หรือหมดอายุ'); const pl = S.plans.find(p => p.id === body.plan_id), amt = body.period === 'year' ? pl.price_year : pl.price, d = c.kind === 'percent' ? Math.round(amt * c.value) / 100 : Math.min(amt, c.value); return res({ code: c.code, kind: c.kind, value: c.value, discount: d, total: amt - d }); }
      if (path === '/api/coupon/redeem') { const c = S.coupons.find(x => x.code === String(body.code).toUpperCase() && x.kind === 'credit'); if (!c) return err('คูปองใช้ไม่ได้ ลอง GIFT50'); S.balance += c.value; S.tx.push({ amount: c.value, balance_after: S.balance, kind: 'coupon', ref: c.code, created_at: now() }); return res({ ok: true, amount: c.value, balance: S.balance }); }
      if (path === '/api/2fa/setup') return res({ secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/AstraCode:' + encodeURIComponent(S.email) + '?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=AstraCode' });
      if (path === '/api/2fa/enable' || path === '/api/2fa/disable') { if (!/^\d{6}$/.test(String(body.code || '').trim())) return err('ใส่รหัส 6 หลัก (เดโม: เลขอะไรก็ได้)'); S.totp = path.endsWith('enable'); return res({ ok: true }); }
      if (path === '/api/me/delete') return err('หน้าเดโมลบบัญชีไม่ได้');
      if ((r = path.match(/^\/api\/receipt\/(\d+)$/))) { const p = S.payments.find(x => x.id === +r[1] && x.status === 'approved') || { id: +r[1], amount: 299, created_at: now(), plan_name: 'Sonnet Plus' }; return res({ id: p.id, no: 'AC' + String(p.id).padStart(6, '0'), date: p.created_at, email: S.email, amount: p.amount, discount: 0, item: p.kind === 'topup' ? 'เติมเงิน Wallet' : `แพลน ${p.plan_name} (30 วัน)`, business: { business_name: 'AstraCode', business_address: 'กรุงเทพฯ', business_tax_id: '' } }); }
      if (path === '/api/tickets') { if (M === 'POST') { const t = { id: Date.now(), user_id: 1, subject: body.subject, status: 'open', created_at: now(), updated_at: now(), msgs: [{ admin: 0, body: body.body, created_at: now() }] }; S.tickets.unshift(t); return res({ ok: true, id: t.id }); } return res(S.tickets); }
      if ((r = path.match(/^\/api\/(admin\/)?tickets\/(\d+)$/))) { const t = S.tickets.find(x => x.id === +r[2]); if (!t) return err('ไม่พบเรื่อง', 404); if (M === 'POST') { if (body.body) t.msgs.push({ admin: r[1] ? 1 : 0, body: body.body, created_at: now() }); t.status = body.status === 'closed' ? 'closed' : r[1] ? 'answered' : 'open'; t.updated_at = now(); return res({ ok: true }); } return res({ ...t, email: S.email }); }
      if (path === '/api/admin/tickets') return res(S.tickets.map(t => ({ ...t, email: S.email, n: t.msgs.length })));
      if (path === '/api/image') { await wait(900); const c = ['#3987e5', '#d95926', '#199e70'][Math.floor(Math.random() * 3)]; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${c}"/><circle cx="256" cy="230" r="120" fill="#fff" opacity=".85"/><text x="256" y="440" font-size="28" text-anchor="middle" font-family="sans-serif" fill="#fff">รูปตัวอย่าง (เดโม)</text></svg>`; const cv = document.createElement('canvas'); cv.width = cv.height = 512; const img = new Image(); await new Promise(ok => { img.onload = ok; img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); }); cv.getContext('2d').drawImage(img, 0, 0); return res({ src: cv.toDataURL('image/png'), usage: usage() }); }
      if (path === '/api/complete') return res({ text: '' });
      if (path === '/api/admin/coupons') { if (M === 'DELETE') S.coupons = S.coupons.filter(c => c.code !== body.code); else if (M === 'POST') { const i = S.coupons.findIndex(c => c.code === body.code.toUpperCase()); const c = { used: 0, ...S.coupons[i], ...body, code: body.code.toUpperCase(), value: +body.value, max_uses: +body.max_uses || 0 }; i >= 0 ? S.coupons[i] = c : S.coupons.unshift(c); } return res(M === 'GET' ? S.coupons : { ok: true }); }
      if ((r = path.match(/^\/api\/admin\/posts(?:\/(\d+))?$/))) { if (M === 'GET') return res(S.posts); if (M === 'DELETE') S.posts = S.posts.filter(p => p.id !== +r[1]); else if (M === 'POST') S.posts.unshift({ ...body, id: Date.now(), created_at: now() }); else Object.assign(S.posts.find(p => p.id === +r[1]), body); return res({ ok: true }); }
      if (path === '/api/admin/audit') return res([{ admin_email: S.email, action: 'update settings', detail: '["promptpay_id"]', created_at: now() - 3600e3 }]);
      if (path === '/api/admin/events') return res([{ kind: 'error', model: 'Claude Sonnet 5.5', detail: 'HTTP 529 overloaded', created_at: now() - 5 * 3600e3 }]);
      if (path === '/api/admin/backups') return M === 'POST' ? res({ ok: true }) : res([{ key: 'backup/2026-11-12T03-00-00-000Z.json', size: 184320, at: now() - 5 * 3600e3 }]);
      if (path === '/api/admin/notify-test') return res({ ok: true });
      if (path === '/api/admin/reset-limits') { S.u4 = 0; S.uw = 0; return res({ ok: true, count: body.target === 'email' ? 1 : body.target === 'plan' ? 2 : S.users.length }); }
      if (path === '/api/admin/slip-test') return res({ ok: true, data: { code: '200001', data: { shopName: 'AstraCode (เดโม)', tokens: 412 } } });
      if (path === '/api/admin/profit') return res({ days: 30, total: { rev: 4120, cost: 1385.4, profit: 2734.6 }, losers: 1,
        plans: [{ id: 1, name: 'Free', price: 0, subs: 120, rev: 0, cost: 96.2 }, { id: 2, name: 'DeepSeek Lite', price: 59, subs: 24, rev: 1416, cost: 210.5 }, { id: 3, name: 'Sonnet Plus', price: 299, subs: 7, rev: 2093, cost: 980.1 }, { id: 4, name: 'Pro', price: 499, subs: 1, rev: 499, cost: 61.3 }],
        wallet: { charges: 112, api_cost: 37.3, topups: 600, liability: 1240 },
        users: [{ id: 3, email: 'nida@example.com', plan: 'Sonnet Plus', rev: 299, cost: 412.8, profit: -113.8 }, { id: 2, email: 'somchai@example.com', plan: 'DeepSeek Lite', rev: 59, cost: 12.1, profit: 46.9 }, { id: 1, email: S.email, plan: 'Pro', rev: 499, cost: 61.3, profit: 437.7 }] });
      if ((r = path.match(/^\/api\/keys\/(\d+)$/)) && M === 'PUT') { const k = S.keys.find(x => x.id === +r[1]); k.budget = body.budget === '' ? null : +body.budget; k.models = body.models?.length ? body.models.join(',') : null; return res({ ok: true }); }
    }
    if (path === '/api/pricing') { const mk = 1 + (+S.settings.price_markup || 30) / 100, r = v => Math.round(v * mk * 10000) / 10000;
      return res({ note: S.settings.price_note || 'หน้าเดโม: ราคาคำนวณจากทุน + markup 30%', plans: S.plans.map(({ id, name, price, limit_week }) => ({ id, name, price, limit_week })),
        models: S.models.filter(m => m.active).map(m => ({ id: m.id, name: m.name, provider: m.provider, vision: !!m.vision, effort: m.effort !== 'none', multiplier: m.multiplier, note: m.note || '',
          ...(() => { const b = { in: m.price_in ?? r(m.cost_in), out: m.price_out ?? r(m.cost_out), cache: m.price_cache ?? r(m.cost_cache), cache_write: m.price_cache_write ?? r(m.cost_cache_write) }, off = m.promo_pct > 0 ? 1 - m.promo_pct / 100 : 1; return { ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * off * 10000) / 10000])), promo: off < 1 ? { pct: m.promo_pct, start: m.promo_start, end: m.promo_end, ...b } : null }; })(), plans: S.plans.filter(p => p.model_ids.includes(m.id)).map(p => p.id) })) }); }
    if (path === '/api/plans') return res(S.plans.filter(p => p.active).sort((a, b) => a.sort - b.sort).map(p => ({ id: p.id, name: p.name, price: p.price, price_year: p.price_year, description: p.description, models: est(p), featured: String(p.id) === S.settings.featured_plan })));
    if (path === '/api/auth') { if (body.action === 'forgot') return res({ ok: true }); if (!/^[^\s@]+@[^\s@]+$/.test(body.email) || String(body.password).length < 8) return err('ใส่อีเมล และรหัสผ่านอย่างน้อย 8 ตัว (เดโม: อะไรก็ได้)'); S.logged = true; S.email = body.email; S.users[0].email = S.email; return res({ ok: true }); }
    if (!S.logged) return err('กรุณาเข้าสู่ระบบ', 401);
    if (path === '/api/logout') { S.logged = false; return res({ ok: true }); }
    if (path === '/api/me') { const p = plan(); return res({ email: S.email, role: 'admin', balance: S.balance, ref_code: 'DEMO1234', email_verified: false, totp_on: S.totp, google: false, line: false, has_password: true, instructions: S.instructions, wallet_overflow: S.overflow, auto_renew: S.renew, plan: { id: p.id, name: p.name, expires: p.price > 0 ? S.expires : null }, usage: usage(), models: allowed(p).map(({ id, name, multiplier, vision, effort }) => ({ id, name, multiplier, vision, effort })), promptpay_id: S.settings.promptpay_id }); }
    if (path === '/api/chat') return chatStream(body, opt.signal);
    if (path === '/api/chats') { const pj = +q.searchParams.get('project') || null; return res(S.chats.filter(c => (c.project_id || null) === pj).map(c => ({ id: c.id, title: c.title, folder_id: c.folder_id || null }))); }
    if (path === '/api/github') return M === 'GET' ? res({ connected: false, secret: true }) : err('หน้าเดโมเชื่อม GitHub ไม่ได้ ใช้ได้บนเว็บจริง');
    if (/^\/api\/projects\/\d+\/github/.test(path)) return err('หน้าเดโมเชื่อม GitHub ไม่ได้ ใช้ได้บนเว็บจริง');
    if (path.startsWith('/api/projects')) return projectsApi(path, M, body, q);
    if ((r = path.match(/^\/api\/chats\/(\d+)$/))) {
      const c = S.chats.find(x => x.id === +r[1]); if (!c) return err('ไม่พบแชต', 404);
      if (M === 'DELETE') { S.chats = S.chats.filter(x => x !== c); return res({ ok: true }); }
      if (M === 'PUT') { if ('title' in body) c.title = body.title; if ('folder_id' in body) c.folder_id = body.folder_id; return res({ ok: true }); }
      return res(c.msgs);
    }
    if (path === '/api/pay' && M === 'POST') {
      const f = body.get('slip'), p = S.plans.find(x => x.id === +body.get('plan_id'));
      if (body.get('wallet') === '1') { const amt = body.get('period') === 'year' ? p.price_year : p.price; if (S.balance < amt) return err('ยอดเงินใน Wallet ไม่พอ'); S.balance -= amt; S.planId = p.id; S.expires = now() + (body.get('period') === 'year' ? 365 : 30) * DAY; const pay = { id: S.nextPay++, user_id: 1, email: S.email, plan_id: p.id, plan_name: p.name, amount: amt, status: 'approved', created_at: now() }; S.payments.unshift(pay); return res({ ok: true, approved: true, id: pay.id }); }
      if (body.get('kind') === 'topup') { if (!f?.size) return err('อัปโหลดรูปสลิป'); S.payments.unshift({ id: S.nextPay++, user_id: 1, email: S.email, plan_id: 0, plan_name: 'เติม Wallet', kind: 'topup', amount: +body.get('amount'), slip: '', status: 'pending', created_at: now() }); return res({ ok: true }); }
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
    if (path === '/api/admin/users') { const s = (q.searchParams.get('q') || '').toLowerCase(); return res(S.users.filter(u => u.email.toLowerCase().includes(s)).map((u, i) => ({ ...u, plan_name: S.plans.find(p => p.id === u.plan_id)?.name, last_active: now() - i * 7200e3, tok30: 2.1e6 - i * 6e5 }))); }
    if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/))) {
      const u = S.users.find(x => x.id === +r[1]);
      if (body.password != null && String(body.password).length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
      if (body.reset_usage && u.id === 1) { S.u4 = 0; S.uw = 0; }
      if ('banned' in body) u.banned = body.banned;
      if ('plan_id' in body) { u.plan_id = body.plan_id; u.plan_expires = body.plan_id ? now() + 30 * DAY : null; if (u.id === 1) { S.planId = body.plan_id || 1; S.expires = u.plan_expires; } }
      return res({ ok: true });
    }
    if (path === '/api/admin/stats') {
      const days = +q.searchParams.get('days') || 30, today = Math.floor(now() / DAY);
      let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      const daily = Array.from({ length: days }, (_, i) => { const g = 1 + i / days; return { day: (today - days + 1 + i) * DAY, tin: Math.round((60e3 + rnd() * 40e3) * g), tout: Math.round((20e3 + rnd() * 15e3) * g), tc: Math.round((150e3 + rnd() * 120e3) * g), cost: +(2 + rnd() * 3 * g).toFixed(2), msgs: Math.round((40 + rnd() * 50) * g), au: Math.round(8 + rnd() * 10), rev: rnd() > .8 ? [59, 299, 499][Math.floor(rnd() * 3)] : 0, reg: Math.round(rnd() * 4) }; });
      S.usageLog.forEach(x => { const d = daily.at(-1); d.tin += x.tin; d.tout += x.tout; d.msgs++; });
      const sum = k => daily.reduce((a, d) => a + d[k], 0), cur = { rev: sum('rev'), cost: sum('cost'), msgs: sum('msgs'), au: 21, tok: sum('tin') + sum('tout') + sum('tc') };
      return res({ days, cur, prev: { rev: cur.rev * .8, cost: cur.cost * .85, msgs: cur.msgs * .9, au: 18, tok: cur.tok * .88 }, daily,
        models: [{ name: 'DeepSeek', msgs: Math.round(cur.msgs * .75), tin: sum('tin') * .7, tout: sum('tout') * .7, tc: sum('tc') * .8, cost: cur.cost * .2 }, { name: 'Claude Sonnet 5.5', msgs: Math.round(cur.msgs * .25), tin: sum('tin') * .3, tout: sum('tout') * .3, tc: sum('tc') * .2, cost: cur.cost * .8 }],
        top: S.users.map((u, i) => ({ id: u.id, email: u.email, plan: S.plans.find(p => p.id === u.plan_id)?.name, msgs: 400 - i * 120, tok: 2.1e6 - i * 6e5, cost: 31 - i * 9 })),
        users: { total: S.users.length, paid: S.users.filter(u => u.plan_id).length }, pending: S.payments.filter(p => p.status === 'pending').length });
    }
    if ((r = path.match(/^\/api\/admin\/users\/(\d+)$/)) && M === 'GET') {
      const u = S.users.find(x => x.id === +r[1]), pl = S.plans.find(p => p.id === u.plan_id);
      return res({ ...u, balance: u.id === 1 ? S.balance : 0, wallet: u.id === 1 ? [...S.tx].reverse() : [], plan_name: pl?.name, current_plan: pl?.name || 'Free', chats: 3, usage: u.id === 1 ? usage() : { pct4h: 12, pctWeek: 34 }, models: [{ name: 'DeepSeek', msgs: 220, tok: 1.2e6, cost: 4.2 }], payments: S.payments.filter(p => p.user_id === u.id) });
    }
    if (path === '/api/admin/stats-old') {
      const rev = S.payments.filter(p => p.status === 'approved').reduce((a, p) => a + p.amount, 0) + 1740;
      const by = {}; S.usageLog.forEach(x => { const o = by[x.model] ||= { name: x.model, msgs: 0, tin: 0, tout: 0, cost: 0 }; o.msgs++; o.tin += x.tin; o.tout += x.tout; o.cost += x.cost; });
      const models = Object.values(by), cost = models.reduce((a, m) => a + m.cost, 0) + 212.4;
      return res({ revenue: rev, cost, profit: rev - cost, models, users: { total: S.users.length, paid: S.users.filter(u => u.plan_id).length }, pending: S.payments.filter(p => p.status === 'pending').length });
    }
    if (path === '/api/admin/settings') { if (M === 'PUT') Object.assign(S.settings, body); return res({ search_enabled: '1', image_enabled: '1', image_base_url: 'https://api.openai.com/v1', image_model: 'gpt-image-1', image_key_name: 'OPENAI_KEY', image_units: '300000', image_cost: '1.5', topup_min: '50', referral_bonus: '20', business_name: 'AstraCode', announcement: '', maintenance: '0', ...S.settings, slip_key_set: false, env: { RESEND_KEY: true, TAVILY_KEY: true, SECRET_KEY: true }, r2: true }); }
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
