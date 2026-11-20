// ตั้งค่า → Connectors / Skills / Plugins (โหลดเมื่อเปิดครั้งแรก) · ใช้ตัวช่วยกลางจาก app.js: sheet, api, esc, ic, toast, confirmSheet
(() => {
  const S = { tab: 'connectors', view: 'browse', q: '', d: null, skills: null, plugins: null };
  const AUTH_TXT = { oauth: 'ล็อกอินกับผู้ให้บริการ', none: 'ไม่ต้องล็อกอิน', token: 'ใส่ API key', url: 'วาง URL ส่วนตัว', google: 'บัญชี Google', github: 'GitHub token' };
  const PERM = [['allow', 'อนุญาตเสมอ'], ['ask', 'ถามก่อน'], ['deny', 'ห้ามใช้']];
  const icon = (c, big) => { const i = c?.icon || '#6b7280', n = String(c?.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase(); return /^data:image\//.test(i) ? `<span class="cn-ico${big ? ' big' : ''}"><img src="${esc(i)}" alt=""></span>` : `<span class="cn-ico${big ? ' big' : ''}" style="--c:${/^#[0-9a-f]{6}$/i.test(i) ? i : '#6b7280'}">${esc(n)}</span>`; };
  const load = async () => (S.d = await api('/connectors'));
  const mineFor = slug => S.d.mine.find(x => x.connector === slug);
  const match = (...xs) => !S.q || xs.join(' ').toLowerCase().includes(S.q.toLowerCase());
  // ป๊อปอัปล็อกอิน: เปิดหน้าในเว็บเราก่อน (ไม่โดนบล็อก แอป Desktop เปิดในแอปพร้อมคุกกี้) แล้วรอหน้า /connected แจ้งกลับ
  const popup = url => new Promise(ok => {
    const w = window.open(url, 'astra-connect', 'width=520,height=720');
    if (!w) { location.href = url; return; } // บล็อกป๊อปอัป: ไปหน้าเดียวกัน แล้ว /connected พากลับมาที่แชต
    let end = false; const fin = r => { if (end) return; end = true; clearInterval(t); removeEventListener('message', on); ok(r); };
    const on = e => { if (e.origin === location.origin && e.data?.astraConnected) fin(e.data.astraConnected); };
    const t = setInterval(() => { if (w.closed) fin(null); }, 700);
    addEventListener('message', on);
  });
  const after = async (r, name) => {
    if (!r) return;
    if (!r.ok) return toast(r.error || 'เชื่อมต่อไม่สำเร็จ', 'bad');
    toast(`เชื่อมต่อ ${name} แล้ว · AI ใช้ได้ทุกแชต`, 'ok'); await load(); if (r.id) detail({ id: r.id }); else draw();
  };

  function shell(body, bar = true) {
    const tabs = [['connectors', 'Connectors'], ['skills', 'Skills'], ['plugins', 'Plugins']];
    return `<div class="cn-wrap"><div class="cn-top"><div class="seg cn-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      ${bar ? `<div class="cn-bar"><div class="seg" role="group"><button type="button" data-view="mine" class="${S.view === 'mine' ? 'on' : ''}">ของคุณ</button><button type="button" data-view="browse" class="${S.view === 'browse' ? 'on' : ''}">ค้นพบ</button></div>
        <input type="search" id="cnq" placeholder="ค้นหา" value="${esc(S.q)}" autocomplete="off" aria-label="ค้นหา"><button type="button" class="btn out sm" data-add>${ic('plus', 'sm')} เพิ่ม</button></div>` : ''}
      <div class="cn-body">${body}</div></div>`;
  }
  function bind(d, close) {
    d.querySelector('.sheet')?.classList.add('cn-sheet');
    d.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.q = ''; draw(); });
    d.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { S.view = b.dataset.view; draw(); });
    const q = d.querySelector('#cnq'); if (q) q.oninput = () => { S.q = q.value; const pos = q.selectionStart; draw(); const n = document.querySelector('#cnq'); n?.focus(); n?.setSelectionRange(pos, pos); };
    d.querySelector('[data-add]')?.addEventListener('click', () => S.tab === 'skills' ? skillNew() : S.tab === 'plugins' ? toast('ปลั๊กอินเพิ่มได้โดยแอดมิน · สร้าง Skill หรือ Connector ของคุณเองได้ที่แท็บนั้น') : addCustom());
    d.querySelectorAll('[data-slug]').forEach(b => b.onclick = () => detail({ slug: b.dataset.slug }));
    d.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => detail({ id: +b.dataset.cid }));
    d.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => skillDetail(+b.dataset.sk));
    d.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => pluginDetail(b.dataset.pl));
    return close;
  }
  async function draw() {
    let body = '';
    try {
      if (S.tab === 'connectors') { if (!S.d) await load(); body = S.view === 'mine' ? mineHTML() : browseHTML(); }
      else if (S.tab === 'skills') { S.skills = await loadSkills(!S.skills); body = skillsHTML(); }
      else { S.plugins = await api('/plugins'); if (!S.d) await load(); body = pluginsHTML(); }
    } catch (x) { body = `<p class="bad">${esc(x.message)}</p>`; }
    sheet('Connectors · Skills · Plugins', shell(body), bind);
  }
  const card = (c, on) => `<button type="button" class="cn-card" data-slug="${esc(c.slug)}">${icon(c)}<span class="cn-txt"><b>${esc(c.name)}${on ? ` <i class="cn-ok" title="เชื่อมแล้ว">${ic('check', 'sm')}</i>` : ''}</b><span>${esc(c.description || '')}</span><small>${c.by ? 'โดย ' + esc(c.by) + ' · ' : ''}${AUTH_TXT[c.auth] || ''}</small></span><span class="cn-plus">${ic(on ? 'check' : 'plus', 'sm')}</span></button>`;
  function browseHTML() {
    const list = S.d.directory.filter(c => match(c.name, c.description, c.category, c.by));
    if (!list.length) return '<p class="muted">ไม่พบ ลองคำอื่น หรือกด + เพิ่ม เพื่อใส่ URL ของ MCP server เอง</p>';
    const cats = [...new Set(list.map(c => c.category || 'อื่นๆ'))];
    return cats.map(cat => `<h4 class="cn-cat">${esc(cat)}</h4><div class="cn-grid">${list.filter(c => (c.category || 'อื่นๆ') === cat).map(c => card(c, !!mineFor(c.slug))).join('')}</div>`).join('');
  }
  function mineHTML() {
    const list = S.d.mine.filter(x => match(x.name, x.host));
    if (!S.d.mine.length) return `<div class="cn-empty"><p>ยังไม่ได้เชื่อมต่อบริการไหน</p><p class="muted">เชื่อม Google, Notion, GitHub และอื่นๆ แล้ว AI จะค้น อ่าน และทำงานกับข้อมูลของคุณได้ในทุกแชต</p><button type="button" class="btn blue" data-view="browse">ดูทั้งหมด</button></div>`;
    return `<div class="cn-list">${list.map(x => `<button type="button" class="cn-row" data-cid="${x.id}">${icon({ icon: x.icon, name: x.name })}<span class="cn-txt"><b>${esc(x.name)}</b><small>${esc(x.host)} · ${x.tools.length} เครื่องมือ${x.global ? ' · ของระบบ' : ''}</small></span>
      <span class="pill ${x.status === 'error' ? 'bad' : !x.enabled || !x.auto ? '' : 'ok'}">${x.status === 'error' ? 'ต้องเชื่อมใหม่' : !x.enabled ? 'ปิดอยู่' : x.auto ? 'ใช้ทุกแชต' : 'เปิดเองในแชต'}</span></button>`).join('')}</div>`;
  }
  // ---- รายละเอียด connector: เชื่อม / สวิตช์ใช้ทุกแชต / สิทธิ์รายเครื่องมือ / ยกเลิก ----
  async function detail({ slug, id }) {
    if (!S.d) await load();
    const row = id ? S.d.mine.find(x => x.id === id) : mineFor(slug), c = S.d.directory.find(x => x.slug === (slug || row?.connector)) || null;
    const name = c?.name || row?.name || 'Connector', kind = c?.auth || (row?.oauth ? 'oauth' : 'custom');
    const connectUI = () => {
      if (kind === 'token') return `<form class="cn-form" data-f="token"><input name="token" type="password" placeholder="วาง API key / token" autocomplete="off" required><button class="btn blue">เชื่อมต่อ</button></form>`;
      if (kind === 'url') return `<form class="cn-form" data-f="url"><input name="url" type="url" placeholder="https://… (URL MCP ส่วนตัว)" required><button class="btn blue">เชื่อมต่อ</button></form>`;
      if (kind === 'github' && !S.d.github) return `<form class="cn-form" data-f="gh"><input name="token" type="password" placeholder="github_pat_... หรือ ghp_..." autocomplete="off" required><button class="btn blue">เชื่อม GitHub</button></form><p class="muted cn-hint">สร้างที่ github.com → Settings → Developer settings → Fine-grained tokens (ให้สิทธิ์ repo ที่ต้องการ)</p>`;
      if (kind === 'google' && !S.d.google) return '<p class="muted">แอดมินยังไม่ได้เปิดการเชื่อม Google</p>';
      return `<button type="button" class="btn blue" data-go>${kind === 'google' ? 'เชื่อมต่อด้วย Google' : 'เชื่อมต่อ'}</button>${kind === 'oauth' ? '<p class="muted cn-hint">จะเปิดหน้าต่างให้ล็อกอินกับผู้ให้บริการ แล้วกลับมาเอง</p>' : ''}`;
    };
    const tools = row ? row.tools.map(t => `<div class="cn-tool"><div><b>${esc(t.name)}</b>${t.description ? `<small>${esc(t.description.slice(0, 140))}</small>` : ''}</div><div class="seg sm" role="group" aria-label="สิทธิ์ ${esc(t.name)}">${PERM.map(([v, l]) => `<button type="button" data-perm="${esc(t.name)}" data-v="${v}" class="${t.perm === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>`).join('') : '';
    sheet(name, `<div class="cn-wrap"><button type="button" class="linkb cn-back" data-back>‹ กลับ</button>
      <div class="cn-head">${icon(c || { icon: row?.icon, name }, true)}<div><b>${esc(name)}</b><small>${c?.by ? 'โดย ' + esc(c.by) + ' · ' : ''}${esc(row?.host || AUTH_TXT[kind] || '')}</small></div></div>
      ${c?.description ? `<p>${esc(c.description)}</p>` : ''}
      ${row ? `${row.status === 'error' ? `<p class="bad">${esc(row.error || 'ต้องเชื่อมต่อใหม่')}</p>` : ''}
        <label class="tg"><input type="checkbox" data-auto ${row.auto ? 'checked' : ''} ${row.global ? 'disabled' : ''}><span><b>ใช้ในทุกแชต</b><small class="muted">AI เรียกใช้เองเมื่อจำเป็น · ปิดชั่วคราวในแชตได้ที่ปุ่ม +</small></span></label>
        <div class="row cn-acts">${row.global ? '' : `<button type="button" class="btn out sm" data-sync>${ic('refresh', 'sm')} อัปเดตเครื่องมือ</button>${kind === 'oauth' || row.status === 'error' ? `<button type="button" class="btn out sm" data-go>เชื่อมใหม่</button>` : ''}<button type="button" class="btn red sm" data-del>ยกเลิกการเชื่อมต่อ</button>`}</div>
        <h4 class="cn-cat">เครื่องมือ (${row.tools.length})</h4><p class="muted cn-hint">อ่านข้อมูล = อนุญาตเสมอ · แก้หรือส่งข้อมูลออกไป = ถามก่อน (ขึ้นปุ่มอนุญาตในแชต)</p><div class="cn-tools">${tools || '<p class="muted">ไม่มีเครื่องมือ</p>'}</div>`
        : connectUI()}
    </div>`, (d, close) => {
      d.querySelector('.sheet')?.classList.add('cn-sheet');
      d.querySelector('[data-back]').onclick = () => { close(); draw(); };
      d.querySelector('[data-go]')?.addEventListener('click', async () => {
        if (kind === 'none') { try { const r = await api('/connectors/add/' + c.slug, { method: 'POST', body: {} }); close(); await after({ ok: true, id: r.id }, name); } catch (x) { toast(x.message, 'bad'); } return; }
        const url = c ? '/api/connectors/go?slug=' + encodeURIComponent(c.slug) : '/api/connectors/go?url=' + encodeURIComponent(row.url || '') + '&name=' + encodeURIComponent(name);
        const r = await popup(url); close(); await after(r, name);
      });
      d.querySelectorAll('.cn-form').forEach(f => f.onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(f)), btn = f.querySelector('button'); btn.disabled = true;
        try {
          if (f.dataset.f === 'gh') { await api('/github', { method: 'PUT', body: { token: v.token.trim() } }); S.d.github = true; }
          const r = await api('/connectors/add/' + c.slug, { method: 'POST', body: f.dataset.f === 'gh' ? {} : v }); close(); await after({ ok: true, id: r.id }, name);
        } catch (x) { btn.disabled = false; toast(x.message, 'bad'); }
      });
      d.querySelector('[data-auto]')?.addEventListener('change', async e => { try { await api('/connectors/mine/' + row.id, { method: 'PATCH', body: { auto: e.target.checked } }); row.auto = e.target.checked; toast(e.target.checked ? 'ใช้ในทุกแชตแล้ว' : 'ปิดแล้ว เปิดเองในแชตได้ที่ปุ่ม +', 'ok'); } catch (x) { toast(x.message, 'bad'); } });
      d.querySelector('[data-sync]')?.addEventListener('click', async e => { e.target.disabled = true; try { const r = await api(`/connectors/mine/${row.id}/sync`, { method: 'POST' }); toast(`อัปเดตแล้ว · ${r.tools} เครื่องมือ`, 'ok'); await load(); close(); detail({ id: row.id }); } catch (x) { e.target.disabled = false; toast(x.message, 'bad'); } });
      d.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await confirmSheet(`ยกเลิกการเชื่อมต่อ ${name}? AI จะใช้บริการนี้ไม่ได้จนกว่าจะเชื่อมใหม่`, { title: 'ยกเลิกการเชื่อมต่อ', ok: 'ยกเลิกการเชื่อมต่อ', danger: true })) return detail({ id: row.id });
        try { await api(kind === 'google' ? '/google' : '/connectors/mine/' + row.id, { method: 'DELETE' }); toast('ยกเลิกการเชื่อมต่อแล้ว', 'ok'); await load(); S.view = 'mine'; draw(); } catch (x) { toast(x.message, 'bad'); }
      });
      d.querySelectorAll('[data-perm]').forEach(b => b.onclick = async () => {
        const t = b.dataset.perm, v = b.dataset.v;
        try { await api('/connectors/mine/' + row.id, { method: 'PATCH', body: { perms: { [t]: v } } }); const tt = row.tools.find(x => x.name === t); if (tt) tt.perm = v; b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); } catch (x) { toast(x.message, 'bad'); }
      });
    });
  }
  // เพิ่มเองด้วย URL: ไม่ต้องล็อกอิน / ใส่ token / ล็อกอินในป๊อปอัป (ระบบดูให้เอง)
  function addCustom() {
    sheet('เพิ่ม connector เอง', `<form class="sheet-form" id="cnadd"><p class="sheet-msg">ใส่ URL ของ Remote MCP server (https://) ถ้าต้องล็อกอิน ระบบจะเปิดหน้าล็อกอินให้เอง</p>
      <input name="name" placeholder="ชื่อ (เช่น ระบบสต็อกของร้าน)" maxlength="60"><input name="url" type="url" placeholder="https://example.com/mcp" required>
      <details><summary class="muted">มี API key / token (ไม่บังคับ)</summary><input name="token" type="password" placeholder="Bearer token" autocomplete="off" style="margin-top:8px"></details>
      <div class="sheet-acts"><button type="button" class="btn out" data-c>ยกเลิก</button><button class="btn blue">เชื่อมต่อ</button></div></form>`, (d, close) => {
      d.querySelector('[data-c]').onclick = () => { close(); draw(); };
      d.querySelector('#cnadd').onsubmit = async e => {
        e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), btn = e.submitter; btn.disabled = true;
        try {
          const r = await api('/connectors/custom', { method: 'POST', body: v });
          if (r.oauth) { const p = await popup('/api/connectors/go?url=' + encodeURIComponent(v.url) + '&name=' + encodeURIComponent(v.name || '')); close(); return after(p, v.name || 'connector'); }
          close(); await after({ ok: true, id: r.id }, v.name || 'connector');
        } catch (x) { btn.disabled = false; toast(x.message, 'bad'); }
      };
    });
  }
  // ---- Skills ----
  function skillsHTML() {
    const list = S.skills.filter(s => !s.as_text && (S.view === 'mine' ? s.user_id : !s.user_id) && match(s.name, s.description));
    if (!list.length) return S.view === 'mine' ? '<div class="cn-empty"><p>ยังไม่มี Skill ของคุณ</p><p class="muted">Skill = ชุดคำสั่งให้ AI ทำงานแบบเดิมทุกครั้ง เช่น สไตล์การเขียน กติกาโค้ด กด + เพิ่ม เพื่อสร้าง</p></div>' : '<p class="muted">ไม่พบ Skill</p>';
    return `<div class="cn-grid">${list.map(s => `<button type="button" class="cn-card" data-sk="${s.id}"><span class="cn-ico" style="--c:#8b5cf6">${ic('sparkles', 'sm')}</span><span class="cn-txt"><b>${esc(s.name)}</b><span>${esc(s.description || String(s.content || '').slice(0, 90))}</span><small>${s.user_id ? 'ของคุณ' : 'AstraCode'}</small></span><span class="cn-plus">${ic('right', 'sm')}</span></button>`).join('')}</div><p class="muted cn-hint">ใช้ในแชต: กด + ในช่องพิมพ์ → Skills หรือพิมพ์ / ตามด้วยชื่อ</p>`;
  }
  function skillDetail(id) {
    const s = S.skills.find(x => x.id === id); if (!s) return;
    sheet(s.name, `<div class="cn-wrap"><button type="button" class="linkb cn-back" data-back>‹ กลับ</button><p>${esc(s.description || '')}</p><pre class="cn-pre">${esc(String(s.content || '').slice(0, 4000))}</pre>
      ${s.user_id ? '<div class="row cn-acts"><button type="button" class="btn out sm" data-share>คัดลอกลิงก์แชร์</button><button type="button" class="btn red sm" data-del>ลบ</button></div>' : ''}</div>`, (d, close) => {
      d.querySelector('.sheet')?.classList.add('cn-sheet');
      d.querySelector('[data-back]').onclick = () => { close(); draw(); };
      d.querySelector('[data-share]')?.addEventListener('click', async e => { try { const r = await api(`/skills/${s.id}/share`, { method: 'POST' }); await copy(`${location.origin}/chat?skill=${r.token}`, e.target); } catch (x) { toast(x.message, 'bad'); } });
      d.querySelector('[data-del]')?.addEventListener('click', async () => { if (!await confirmSheet(`ลบ Skill ${s.name}?`, { title: 'ลบ Skill', ok: 'Delete', danger: true })) return skillDetail(id); await api('/skills/' + s.id, { method: 'DELETE' }); S.skills = null; toast('ลบแล้ว', 'ok'); draw(); });
    });
  }
  function skillNew() {
    sheet('สร้าง Skill', `<form class="sheet-form" id="sknew"><input name="name" placeholder="ชื่อ เช่น thai-sales-writer" maxlength="60" required><input name="description" placeholder="ใช้ทำอะไร (สั้นๆ)" maxlength="200">
      <textarea name="content" rows="6" maxlength="6000" placeholder="คำสั่งหรือกติกาที่ให้ AI ทำตามเมื่อเปิด Skill นี้" required></textarea>
      <div class="sheet-acts"><button type="button" class="btn out" data-c>ยกเลิก</button><button class="btn blue">บันทึก</button></div></form>`, (d, close) => {
      d.querySelector('[data-c]').onclick = () => { close(); draw(); };
      d.querySelector('#sknew').onsubmit = async e => { e.preventDefault(); try { await api('/skills', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); S.skills = null; S.view = 'mine'; close(); toast('สร้าง Skill แล้ว', 'ok'); draw(); } catch (x) { toast(x.message, 'bad'); } };
    });
  }
  // ---- Plugins: ชุด Connectors + Skills + คำสั่งลัด ติดตั้งครั้งเดียว ----
  function pluginsHTML() {
    const list = S.plugins.filter(p => (S.view === 'mine' ? p.installed : true) && match(p.name, p.description));
    if (!list.length) return S.view === 'mine' ? '<div class="cn-empty"><p>ยังไม่ได้ติดตั้งปลั๊กอิน</p><p class="muted">ปลั๊กอิน = ชุดสำเร็จรูป มี Connectors, Skills และคำสั่งลัด (/) สำหรับงานแต่ละแบบ</p><button type="button" class="btn blue" data-view="browse">ดูทั้งหมด</button></div>' : '<p class="muted">ไม่พบปลั๊กอิน</p>';
    return `<div class="cn-grid">${list.map(p => `<button type="button" class="cn-card" data-pl="${esc(p.slug)}">${icon(p)}<span class="cn-txt"><b>${esc(p.name)}${p.installed ? ` <i class="cn-ok">${ic('check', 'sm')}</i>` : ''}</b><span>${esc(p.description || '')}</span><small>${[p.connectors.length && p.connectors.length + ' connectors', p.skills.length && p.skills.length + ' skills', p.commands.length && p.commands.length + ' คำสั่งลัด'].filter(Boolean).join(' · ')}</small></span><span class="cn-plus">${ic(p.installed ? 'check' : 'plus', 'sm')}</span></button>`).join('')}</div>`;
  }
  async function pluginDetail(slug, fresh) {
    if (fresh || !S.plugins) S.plugins = await api('/plugins');
    if (fresh) await load();
    const p = S.plugins.find(x => x.slug === slug); if (!p) return draw();
    const need = p.connectors.filter(c => !mineFor(c.slug));
    sheet(p.name, `<div class="cn-wrap"><button type="button" class="linkb cn-back" data-back>‹ กลับ</button>
      <div class="cn-head">${icon(p, true)}<div><b>${esc(p.name)}</b><small>${p.installed ? 'ติดตั้งแล้ว' : 'ปลั๊กอิน'}</small></div></div><p>${esc(p.description || '')}</p>
      ${p.installed ? '' : `<button type="button" class="btn blue" data-inst>ติดตั้ง</button>`}
      ${p.connectors.length ? `<h4 class="cn-cat">Connectors</h4><div class="cn-list">${p.connectors.map(c => `<div class="cn-row cn-static">${icon(c)}<span class="cn-txt"><b>${esc(c.name)}</b><small>${AUTH_TXT[c.auth] || ''}</small></span>${mineFor(c.slug) ? '<span class="pill ok">เชื่อมแล้ว</span>' : p.installed ? `<button type="button" class="btn out sm" data-conn="${esc(c.slug)}">เชื่อมต่อ</button>` : '<span class="pill">ยังไม่เชื่อม</span>'}</div>`).join('')}</div>${p.installed && need.length ? '<p class="muted cn-hint">เชื่อมต่อให้ครบเพื่อให้ปลั๊กอินทำงานได้เต็มที่</p>' : ''}` : ''}
      ${p.skills.length ? `<h4 class="cn-cat">Skills</h4>${p.skills.map(x => `<div class="cn-line"><b>${esc(x.name)}</b> <span class="muted">${esc(x.description || '')}</span></div>`).join('')}` : ''}
      ${p.commands.length ? `<h4 class="cn-cat">คำสั่งลัด (พิมพ์ / ในช่องแชต)</h4>${p.commands.map(x => `<div class="cn-line"><b>/${esc(x.name)}</b> <span class="muted">${esc(x.text.slice(0, 110))}${x.text.length > 110 ? '…' : ''}</span></div>`).join('')}` : ''}
      ${p.installed ? '<div class="row cn-acts"><button type="button" class="btn red sm" data-uninst>ถอนการติดตั้ง</button></div>' : ''}</div>`, (d, close) => {
      d.querySelector('.sheet')?.classList.add('cn-sheet');
      d.querySelector('[data-back]').onclick = () => { close(); draw(); };
      d.querySelector('[data-inst]')?.addEventListener('click', async e => {
        e.target.disabled = true;
        try { const r = await api('/plugins/' + slug, { method: 'POST' }); if (typeof loadSkills === 'function') await loadSkills(true).catch(() => {}); toast(`ติดตั้ง ${p.name} แล้ว${r.failed?.length ? ' · เชื่อม ' + r.failed.join(', ') + ' ไม่สำเร็จ' : ''}`, 'ok'); close(); pluginDetail(slug, true); }
        catch (x) { e.target.disabled = false; toast(x.message, 'bad'); }
      });
      d.querySelector('[data-uninst]')?.addEventListener('click', async () => {
        if (!await confirmSheet(`ถอน ${p.name}? Skills และคำสั่งลัดของปลั๊กอินนี้จะถูกลบ (Connectors ที่เชื่อมไว้ยังอยู่)`, { title: 'ถอนการติดตั้ง', ok: 'ถอนการติดตั้ง', danger: true })) return pluginDetail(slug);
        await api('/plugins/' + slug, { method: 'DELETE' }).catch(x => toast(x.message, 'bad')); if (typeof loadSkills === 'function') await loadSkills(true).catch(() => {}); toast('ถอนแล้ว', 'ok'); pluginDetail(slug, true);
      });
      d.querySelectorAll('[data-conn]').forEach(b => b.onclick = () => { close(); detail({ slug: b.dataset.conn }); });
    });
  }
  window.connectorsPage = (tab = 'connectors', view) => { S.tab = tab; S.view = view || (tab === 'connectors' ? 'mine' : 'browse'); S.q = ''; S.d = null; S.skills = null; draw(); };
  window.connectorsState = S; window.connectorsDraw = draw; window.connectorPopup = popup; window.connectorAfter = after; window.connectorsLoad = load;
})();
