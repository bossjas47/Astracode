// ปลั๊กอินที่ AI สร้าง: ตรวจชื่อ/ขนาด · ห้าม key ลับ · ต้องมีเนื้อหา · แปลงเป็นส่วนของ system prompt
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MAKE_PLUGIN_TOOL, normalizePlugin, pluginPrompt, pluginSummary } = require('../plugmake');

test('make_plugin: validates, trims, blocks secrets, and renders saved plugins for the next task', () => {
  const p = normalizePlugin({ name: 'Team-Review', title: 'รีวิวโค้ดทีม', skills: [{ name: 'review', content: 'ตรวจ null, ตั้งชื่อ, เทสต์' }], commands: [{ name: '/weekly report', text: 'สรุปงานสัปดาห์นี้' }] });
  assert.equal(p.name, 'team-review'); assert.equal(p.commands[0].name, 'weekly-report');
  assert.throws(() => normalizePlugin({ name: 'x y', title: 't', skills: [{ name: 'a', content: 'b' }] }), /a-z 0-9/);
  assert.throws(() => normalizePlugin({ name: 'empty', title: 't' }), /อย่างน้อย 1/);
  assert.throws(() => normalizePlugin({ name: 'leak', title: 't', skills: [{ name: 'a', content: 'use key sk-abcdefghijklmnopqrstuv' }] }), /key\/token/);
  const t = pluginPrompt([p]); assert.match(t, /Plugins saved for this user/); assert.match(t, /Skill "review"/); assert.match(t, /\/weekly-report/);
  assert.equal(pluginPrompt([]), '');
  assert.match(pluginSummary(p), /รีวิวโค้ดทีม/); assert.equal(MAKE_PLUGIN_TOOL.function.name, 'make_plugin');
});
