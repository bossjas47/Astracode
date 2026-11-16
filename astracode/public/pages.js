// AstraCode: หน้า API นักพัฒนา, ติดต่อเรา, บล็อก, สถานะระบบ, ใบเสร็จ
const pre = code => `<div class="code"><div class="code-h"><span>${code[0]}</span><button class="cp-code">Copy</button></div><pre><code>${esc(code[1])}</code></pre></div>`;
const bindCopy = () => app.querySelectorAll('.cp-code').forEach(b => b.onclick = () => copy(b.closest('.code').querySelector('code').textContent, b));

// ---------- API สำหรับนักพัฒนา ----------
PAGES.developers = async () => {
  const [pr, keys, kstats] = await Promise.all([api('/pricing'), me ? api('/keys') : null, me ? api('/keys/stats').catch(() => []) : []]);
  const base = location.origin + '/v1', slug = n => n.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
  const first = pr.models[0] ? slug(pr.models[0].name) : 'model-name';
  const draw = (newKey = '') => {
    page(nav() + `<div class="wrap" style="max-width:820px"><section class="hero" style="padding:56px 0 24px"><div class="name">AstraCode API</div><h1>API สำหรับนักพัฒนา</h1>
      <p>เรียกทุกโมเดลผ่าน API แบบ OpenAI ใช้กับ SDK และเครื่องมือที่รองรับ OpenAI ได้ทันที จ่ายตามจริงจาก Wallet</p></section>
      ${me ? `<div class="card">${h3k('API key')}${me.plan.api_limit ? `<div class="notice" style="margin:0 0 12px"><span>แพลน <b>${esc(me.plan.name)}</b> ใช้ API Key หักจากลิมิตแพลนได้โดยไม่ต้องเติม Wallet · 4 ชม. <b>${me.usage.pct4h}%</b> · สัปดาห์ <b>${me.usage.pctWeek}%</b></span></div>` : `<p class="muted">แพลนปัจจุบัน (${esc(me.plan.name)}) คิดค่า API จาก Wallet ฿${baht(me.balance)} · <a href="/plans?topup=1">เติมเงิน</a> หรือ <a href="/plans">อัปเกรดแพลนที่รองรับ API Limit</a></p>`}
        ${newKey ? `<div class="notice hi">คัดลอกเก็บไว้ตอนนี้ จะไม่แสดงอีก<div class="row" style="flex-wrap:nowrap;margin-top:8px"><input readonly value="${esc(newKey)}" id="nk"><button class="btn out sm" id="cpk">Copy</button></div></div>` : ''}
        ${keys.length ? keys.map(k => `<details class="ed key"><summary><b>${esc(k.name)}</b><span class="muted"><code>${esc(k.prefix)}…</code> · เดือนนี้ ฿${money(k.spent)}${k.budget != null ? ` / ฿${baht(k.budget)}` : ''}${k.models ? ` · ${k.models.split(',').length} โมเดล` : ''} · ใช้ล่าสุด ${when(k.last_used)}</span></summary>
          <form class="kset" data-k="${k.id}"><label>งบต่อเดือน (บาท) เว้นว่าง = ไม่จำกัด</label><input name="budget" type="number" min="0" step="any" value="${k.budget ?? ''}" placeholder="ไม่จำกัด">
            <label class="sw-row"><span class="sw"><input type="checkbox" name="use_plan" ${k.use_plan !== 0 ? 'checked' : ''}><span></span></span>หักจากลิมิตแพลนก่อน (ถ้าแพลนรองรับ)</label>
            <label>โมเดลที่ key นี้ใช้ได้ (ไม่เลือก = ทุกโมเดล)</label><div class="chips-sel">${pr.models.map(m => `<label><input type="checkbox" name="m" value="${slug(m.name)}" ${k.models?.split(',').includes(slug(m.name)) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>
            <div class="row" style="margin-top:12px"><button class="btn blue sm">Save</button><button type="button" class="btn out sm danger" data-rk="${k.id}">Revoke key</button><span class="ok sv"></span></div></form></details>`).join('') : '<p class="muted">ยังไม่มี key</p>'}
        <form id="kf" class="row" style="flex-wrap:nowrap"><input name="name" placeholder="ชื่อ key เช่น my-app" maxlength="40"><button class="btn blue sm">Create key</button></form><div class="err" id="ke"></div></div>`
      : `<div class="card" style="text-align:center"><p>เข้าสู่ระบบเพื่อสร้าง API key</p><a class="btn blue" href="/login?next=/developers">Log in</a></div>`}
            ${me ? `<div class="card">${h3k('ทดสอบ API (Playground)')}
        <form id="pg" class="form2">
          <div><label>API Key</label><input id="pgk" placeholder="sk-astra-..." value="${esc(newKey)}" required></div>
          <div><label>โมเดล</label><select id="pgm">${pr.models.map(m => `<option value="${esc(slug(m.name))}">${esc(m.name)} (${esc(slug(m.name))})</option>`).join('')}</select></div>
        </form>
        <label>ข้อความทดสอบ</label><div class="row" style="flex-wrap:nowrap"><input id="pgt" value="สวัสดี ตอบสั้นๆ 1 ประโยค"><button type="button" class="btn blue sm" id="pgrun">Test</button></div>
        <div id="pgo" class="muted" style="margin-top:10px;font-size:13px"></div></div>` : ''}
      ${me && kstats.length ? `<div class="card">${h3k('ยอดใช้ API 14 วันล่าสุด')}<div class="ubars">${kstats.map(r => { const mx = Math.max(...kstats.map(x => x.n), 1); return `<div class="ubar" title="${r.d}: ${r.n} ครั้ง · ฿${baht(r.spent)}"><i style="height:${Math.max(4, Math.round(r.n / mx * 100))}%"></i><span>${r.d.slice(8)}</span></div>`; }).join('')}</div></div>` : ''}
      <div class="band"><h2>เริ่มใช้</h2>
        <p class="muted">Base URL: <code>${esc(base)}</code> · ส่ง key ใน header <code>Authorization: Bearer sk-astra-...</code></p>
        ${pre(['curl', `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $ASTRA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${first}","messages":[{"role":"user","content":"สวัสดี"}]}'`])}
        ${pre(['python', `from openai import OpenAI\n\nclient = OpenAI(base_url="${base}", api_key="sk-astra-...")\nr = client.chat.completions.create(\n    model="${first}",\n    messages=[{"role": "user", "content": "สวัสดี"}],\n    stream=True,\n)\nfor chunk in r:\n    print(chunk.choices[0].delta.content or "", end="")`])}
        ${pre(['javascript', `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${base}", apiKey: process.env.ASTRA_KEY });\nconst r = await client.chat.completions.create({\n  model: "${first}",\n  messages: [{ role: "user", content: "สวัสดี" }],\n});\nconsole.log(r.choices[0].message.content);`])}
      </div>
      <div class="band"><h2>โมเดลและราคา</h2><p class="muted">ราคาเป็นบาทต่อ 1M token · ส่ง <code>reasoning_effort</code> = low / high / max เพื่อให้โมเดลที่รองรับคิดก่อนตอบ</p>
        <div class="tw"><table class="tbl"><tr><th>model</th><th>Input</th><th>Output</th><th>Cache</th></tr>${pr.models.map(m => `<tr><td><code>${esc(slug(m.name))}</code>${m.promo ? ` <span class="pill sale">-${m.promo.pct}%</span>` : ''}</td>${['in', 'out', 'cache'].map(k => `<td>${m.promo ? `<s class="muted">฿${money(m.promo[k])}</s> ` : ''}฿${money(m[k])}</td>`).join('')}</tr>`).join('')}</table></div></div>
      <div class="band"><h2>ตัวอย่างอื่นๆ</h2>
        <p class="muted">สร้างรูป (<code>POST /v1/images/generations</code>): ใช้ได้กับโมเดลประเภทสร้างรูปเท่านั้น คิดเงินต่อรูป ตอบกลับเป็น <code>b64_json</code> (หรือ <code>url</code> ถ้าผู้ให้บริการส่งลิงก์มา) รองรับ <code>n=1</code>, <code>size</code>, <code>quality</code></p>
        ${pre(['curl', `curl ${base}/images/generations \\\n  -H "Authorization: Bearer $ASTRA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"IMAGE_MODEL","prompt":"a red fox in the snow","size":"1024x1024"}'`])}
        <p class="muted">JSON mode, tools และพารามิเตอร์ที่รองรับ: <code>temperature</code> (0–2), <code>top_p</code> (0–1), <code>presence_penalty</code> / <code>frequency_penalty</code> (-2–2), <code>seed</code>, <code>stop</code> (สูงสุด 4), <code>max_tokens</code>, <code>response_format</code> (<code>json_object</code> / <code>json_schema</code>), <code>tools</code> + <code>tool_choice</code>, <code>reasoning_effort</code>, <code>stream</code> (usage อยู่ใน chunk สุดท้ายเสมอ) · โมเดลที่กำลังคิด (ใส่ <code>reasoning_effort</code>) จะไม่รับ <code>temperature</code>/<code>top_p</code>/<code>stop</code> และโมเดลที่ไม่รองรับ JSON mode โดยตรงจะได้คำสั่งให้ตอบเป็น JSON แทน ค่าผิดรูปแบบตอบ 400</p>
        ${pre(['python', `r = client.chat.completions.create(\n    model="${first}",\n    messages=[{"role": "user", "content": "List 3 fruits as JSON"}],\n    response_format={"type": "json_object"},\n    temperature=0.2,\n    seed=7,\n)\nprint(r.choices[0].message.content)`])}
      </div>
      <div class="band"><h2>รหัสข้อผิดพลาด</h2><p class="muted">รูปแบบ <code>{"error": {"message": "...", "message_th": "...", "type": "..."}}</code> · <code>message</code> เป็นภาษาอังกฤษ ส่วน <code>message_th</code> เป็นไทย</p>
        <div class="tw"><table class="tbl"><tr><th>HTTP</th><th>type</th><th>ความหมาย</th></tr>
          <tr><td>400</td><td><code>invalid_request_error</code></td><td>พารามิเตอร์ผิด เช่น temperature เกินช่วง, messages ว่าง, ส่งรูปให้โมเดลที่ไม่รองรับ</td></tr>
          <tr><td>401</td><td><code>invalid_api_key</code></td><td>key ผิด ถูกเพิกถอน หรือบัญชีถูกระงับ</td></tr>
          <tr><td>402</td><td><code>insufficient_quota</code></td><td>ยอด Wallet ไม่พอ</td></tr>
          <tr><td>404</td><td><code>invalid_request_error</code></td><td>ไม่พบโมเดล หรือ key นี้ไม่ได้รับอนุญาตให้ใช้โมเดลนี้</td></tr>
          <tr><td>413</td><td><code>invalid_request_error</code></td><td>คำขอยาวเกินไป</td></tr>
          <tr><td>429</td><td><code>rate_limit_error</code></td><td>เกิน 60 ครั้ง/นาที หรือมีคำขอ Wallet ค้างอยู่ — ดู <code>retry-after</code></td></tr>
          <tr><td>429</td><td><code>insufficient_quota</code></td><td>งบรายเดือนของ key หมด หรือลิมิตแพลนเต็ม (ไม่มี retry-after)</td></tr>
          <tr><td>502</td><td><code>api_error</code></td><td>โมเดลต้นทางตอบไม่ได้ (ระบบลองโมเดลสำรองให้แล้ว)</td></tr></table></div>
        <p class="muted">ทุกคำตอบของ <code>/v1/chat/completions</code> และ <code>/v1/images/generations</code> มี <code>x-ratelimit-limit-requests</code>, <code>x-ratelimit-remaining-requests</code>, <code>x-ratelimit-reset-requests</code> และ <code>x-astracode-billing</code> (plan / wallet)</p>
      </div>
      <div class="band"><h2>ข้อจำกัด</h2><ul class="muted"><li>60 คำขอต่อนาทีต่อ key</li><li>Wallet ต้องมียอดมากกว่า 0 ก่อนเรียก (คำขอสุดท้ายอาจทำให้ยอดติดลบเล็กน้อย)</li><li>ตั้งงบต่อเดือนและจำกัดโมเดลแยกแต่ละ key ได้ (เกินงบ = ตอบ 429)</li><li>รองรับ <code>/v1/models</code>, <code>/v1/usage</code> (เช็ก % ลิมิตและยอด Wallet), <code>/v1/chat/completions</code> (ข้อความ, รูปภาพ, tools, stream) และ <code>/v1/images/generations</code></li></ul></div>
      ${footer()}</div>`);
    bindCopy();
    $('#pgrun')?.addEventListener('click', async () => {
      const k = $('#pgk').value.trim(), mdl = $('#pgm').value, msg = $('#pgt').value.trim(), out = $('#pgo');
      if (!k || !msg) return toast('ใส่ API Key และข้อความก่อน', 'bad');
      out.textContent = 'กำลังส่งคำขอ...'; const t0 = performance.now();
      try {
        const r = await fetch('/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k }, body: JSON.stringify({ model: mdl, messages: [{ role: 'user', content: msg }] }) });
        const d = await r.json(), ms = Math.round(performance.now() - t0), bill = r.headers.get('x-astracode-billing') || '-';
        if (!r.ok) { out.innerHTML = `<span class="bad">${esc(d.error?.message || 'HTTP ' + r.status)}</span>`; return; }
        const ans = d.choices?.[0]?.message?.content || '';
        out.innerHTML = `<div class="ok" style="margin-bottom:6px">HTTP 200 · ${ms} ms · หักจาก: <b>${esc(bill)}</b> · ${d.usage ? `${d.usage.total_tokens} tokens` : ''}</div><div class="code" style="padding:12px">${esc(ans)}</div>`;
      } catch (x) { out.innerHTML = `<span class="bad">${esc(x.message)}</span>`; }
    });
    $('#cpk')?.addEventListener('click', e => copy($('#nk').value, e.target));
    $('#kf')?.addEventListener('submit', async e => {
      e.preventDefault();
      try { const r = await api('/keys', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); keys.splice(0, keys.length, ...await api('/keys')); draw(r.key); }
      catch (x) { $('#ke').textContent = x.message; }
    });
    app.querySelectorAll('.kset').forEach(f => f.onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(f);
      try { await api('/keys/' + f.dataset.k, { method: 'PUT', body: { budget: fd.get('budget'), models: fd.getAll('m'), use_plan: fd.get('use_plan') ? 1 : 0 } }); keys.splice(0, keys.length, ...await api('/keys')); draw(); }
      catch (x) { toast(x.message, 'bad'); }
    });
    app.querySelectorAll('[data-rk]').forEach(b => b.onclick = async () => {
      if (!await confirmSheet('ยกเลิก API key นี้? แอปที่ใช้อยู่จะเรียกไม่ได้ทันที', { title: 'ยกเลิก API key', ok: 'Revoke key', danger: true })) return;
      await api('/keys/' + b.dataset.rk, { method: 'DELETE' }); keys.splice(0, keys.length, ...await api('/keys')); draw();
    });
  };
  draw();
};
const h3k = t => `<div style="font:600 19px var(--display);margin-bottom:8px">${t}</div>`;

// ---------- ติดต่อเรา (ticket) ----------
const TK = { open: '<span class="warn">รอตอบ</span>', answered: '<span class="ok">ตอบแล้ว</span>', closed: '<span class="muted">ปิดแล้ว</span>' };
PAGES.support = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const id = qs().get('id');
  if (id) {
    const t = await api('/tickets/' + id);
    page(nav() + `<div class="wrap" style="max-width:680px"><p style="margin-top:24px"><a href="/support">← เรื่องทั้งหมด</a></p><h1 style="font:600 28px var(--display)">${esc(t.subject)}</h1><p>${TK[t.status] || ''}</p>
      <div class="thread">${t.msgs.map(m => `<div class="tmsg ${m.admin ? 'adm' : ''}"><div class="muted" style="font-size:12px">${m.admin ? 'ทีมงาน AstraCode' : 'คุณ'} · ${when(m.created_at)}</div><div>${esc(m.body).replace(/\n/g, '<br>')}</div></div>`).join('')}</div>
      <form class="card" id="rf"><textarea name="body" rows="3" maxlength="5000" placeholder="พิมพ์ข้อความ" required></textarea><div class="err" id="e"></div><button class="btn blue">Send</button></form>${footer()}</div>`);
    $('#rf').onsubmit = async e => { e.preventDefault(); e.submitter.disabled = true; try { await api('/tickets/' + id, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); boot(); } catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; } };
    return;
  }
  const list = await api('/tickets');
  page(nav() + `<div class="wrap" style="max-width:680px"><section class="hero" style="padding:48px 0 16px"><h1>ติดต่อเรา</h1><p>ปัญหาการใช้งาน การชำระเงิน หรือข้อเสนอแนะ ทีมงานจะตอบกลับที่นี่${me.email_verified ? ' และทางอีเมล' : ''}</p></section>
    <form class="card" id="nf"><label>หัวข้อ</label><input name="subject" maxlength="120" required><label>รายละเอียด</label><textarea name="body" rows="4" maxlength="5000" required></textarea>
      <div class="err" id="e"></div><button class="btn blue">Submit</button></form>
    ${list.length ? `<div class="card">${h3k('เรื่องของคุณ')}${list.map(t => `<a class="row tk" href="/support?id=${t.id}"><span>${esc(t.subject)}</span><span class="sp"></span>${TK[t.status] || ''}<span class="muted">${when(t.updated_at)}</span></a>`).join('')}</div>` : ''}${footer()}</div>`);
  $('#nf').onsubmit = async e => { e.preventDefault(); e.submitter.disabled = true; try { const r = await api('/tickets', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); go('/support?id=' + r.id); } catch (x) { $('#e').textContent = x.message; e.submitter.disabled = false; } };
};

// ---------- บล็อก: /blog = รายการ, /blog/<slug> = บทความ ----------
PAGES.blog = async () => {
  const slugQ = decodeURIComponent(curl().pathname.split('/')[2] || '');
  if (slugQ) {
    const p = await api('/blog/' + encodeURIComponent(slugQ));
    document.title = p.title + ' · ASTRACODE';
    page(nav() + `<article class="wrap post-body" style="max-width:720px"><p style="margin-top:24px"><a href="/blog">← บทความทั้งหมด</a></p>
      <h1>${esc(p.title)}</h1><p class="muted">${when(p.created_at)}</p>${p.cover?.startsWith('/') ? `<img class="cover" src="${esc(p.cover)}" alt="">` : ''}
      <div class="msg ai"><div class="b">${md(p.body)}</div></div><p style="margin:32px 0"><a class="btn blue" href="/login">Try AstraCode free</a></p></article>${footer()}`);
    bindCopy(); return;
  }
  const posts = await api('/blog');
  page(nav() + `<div class="wrap"><section class="hero" style="padding:56px 0 24px"><h1>บล็อก</h1><p>ข่าวสาร วิธีใช้ และเทคนิคการใช้ AI</p></section>
    ${posts.length ? `<div class="grid">${posts.map(postTile).join('')}</div>` : '<p class="muted" style="text-align:center">ยังไม่มีบทความ</p>'}${footer()}</div>`);
};

// ---------- สถานะระบบ ----------
PAGES.status = async () => {
  const d = await api('/status'), down = d.models.filter(m => m.down);
  page(nav() + `<div class="wrap" style="max-width:820px"><section class="hero" style="padding:56px 0 24px"><h1>สถานะระบบ</h1>
    <p class="${down.length ? 'warn' : 'ok'}" style="font-size:19px">${down.length ? `${ic('alert', 'sm')} บางโมเดลมีปัญหา: ` + down.map(m => esc(m.name)).join(', ') : '● ระบบทำงานปกติ'}</p>
    <p class="muted">อัปเดต ${when(d.updated)}</p></section>
    ${d.models.map(m => `<div class="card st"><div class="row"><b>${esc(m.name)}</b><span class="sp"></span><span class="${m.state === 'down' ? 'bad' : m.down ? 'warn' : 'ok'}">${m.state === 'down' ? `${ic('alert', 'sm')} ล่ม · สลับโมเดลสำรองอัตโนมัติ` : m.down ? `${ic('alert', 'sm')} ไม่เสถียร` : '● ปกติ'}</span><span class="muted">${m.uptime}% ใน 30 วัน</span></div>
      <div class="bars">${m.days.map(x => { const t = x.ok + x.err, r = t ? x.err / t : 0; return `<i class="${!t ? 'none' : r > 0.2 ? 'bad' : r > 0 ? 'mid' : 'good'}" title="${new Date(x.d).toLocaleDateString(LOC)} · สำเร็จ ${x.ok} · ผิดพลาด ${x.err}"></i>`; }).join('')}</div>
      <div class="row muted" style="font-size:12px"><span>30 วันก่อน</span><span class="sp"></span><span>วันนี้</span></div></div>`).join('')}
    <p class="muted" style="text-align:center">สีเทา = ไม่มีการใช้งานวันนั้น · มีปัญหา? <a href="/support">แจ้งเรา</a></p>${footer()}</div>`);
};

// ---------- ใบเสร็จ (พิมพ์ / บันทึกเป็น PDF) ----------
PAGES.receipt = async () => {
  if (!me) return go('/login?next=' + encodeURIComponent(here()));
  const r = await api('/receipt/' + (+qs().get('id') || 0)), b = r.business;
  page(`<div class="receipt"><div class="row no-print" style="margin-bottom:16px"><a href="/plans">← กลับ</a><span class="sp"></span><button class="btn blue sm" id="pr">Print / Save PDF</button></div>
    <div class="paper"><div class="row"><div><h1>${esc(b.business_name || 'AstraCode')}</h1>${b.business_address ? `<p>${esc(b.business_address).replace(/\n/g, '<br>')}</p>` : ''}${b.business_tax_id ? `<p>เลขประจำตัวผู้เสียภาษี ${esc(b.business_tax_id)}</p>` : ''}</div>
      <span class="sp"></span><div style="text-align:right"><h2>ใบเสร็จรับเงิน</h2><p>เลขที่ ${esc(r.no)}<br>วันที่ ${new Date(r.date).toLocaleDateString(LOC, { dateStyle: 'long' })}</p></div></div>
      <p><b>ลูกค้า</b> ${esc(r.email)}</p>
      <table><tr><th>รายการ</th><th style="text-align:right">จำนวนเงิน</th></tr>
        <tr><td>${esc(r.item)}</td><td style="text-align:right">฿${baht(r.amount + (r.discount || 0))}</td></tr>
        ${r.discount ? `<tr><td>ส่วนลด${r.coupon ? ` (${esc(r.coupon)})` : ''}</td><td style="text-align:right">-฿${baht(r.discount)}</td></tr>` : ''}
        <tr class="tot"><td>รวมทั้งสิ้น</td><td style="text-align:right">฿${baht(r.amount)}</td></tr></table>
      <p class="muted">ชำระแล้ว · ขอบคุณที่ใช้บริการ</p></div></div>`);
  $('#pr').onclick = () => print();
};
