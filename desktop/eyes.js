// ให้โมเดลที่อ่านรูปไม่ได้ (เช่น DeepSeek uncen) คุมหน้าจอได้
// 1) UI Automation ของ Windows: รายชื่อปุ่ม/ช่อง/เมนูในหน้าต่างที่อยู่หน้าสุด พร้อมพิกัดกึ่งกลาง (ฟรี แม่น แต่เกม/โปรแกรมที่วาดเองทั้งจอจะไม่มีรายการ)
// 2) ตาช่วย: โมเดลที่อ่านรูปได้ (หักลิมิตน้อยสุดในแพลน) บรรยายภาพหน้าจอ + พิกัดเป็นข้อความ แล้วส่งให้โมเดลหลักแทนรูป
// เดิม: ส่งภาพหน้าจอไปให้โมเดลที่อ่านรูปไม่ได้ → เซิร์ฟเวอร์ตอบ 400 งานพังหลังเปิดโปรแกรม (กดข้างในไม่ได้)

// PowerShell: หน้าต่างหน้าสุด → องค์ประกอบที่กด/พิมพ์ได้ (ไม่เกิน 150) · บรรทัดละ ชนิด|ชื่อ|x|y (พิกเซลจริงของจอ)
const UIA_PS = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes;
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class KW{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();}';
[KW]::SetProcessDPIAware()|Out-Null;
$A=[System.Windows.Automation.AutomationElement];$T=[System.Windows.Automation.ControlType];
$w=$A::FromHandle([KW]::GetForegroundWindow());
"WINDOW|"+($w.Current.Name -replace '[\\r\\n|]',' ');
$types=@($T::Button,$T::Edit,$T::MenuItem,$T::ListItem,$T::TabItem,$T::CheckBox,$T::ComboBox,$T::Hyperlink,$T::TreeItem,$T::RadioButton,$T::SplitButton,$T::DataItem,$T::Slider,$T::Spinner);
$conds=[System.Windows.Automation.Condition[]]($types|%{New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty,$_)});
$c=New-Object System.Windows.Automation.OrCondition -ArgumentList (,$conds);
$i=0;foreach($e in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants,$c)){ if($i -ge 150){break}; $r=$e.Current.BoundingRectangle; if($e.Current.IsOffscreen -or $r.Width -le 0 -or $r.Height -le 0){continue}; $i++; $e.Current.ControlType.ProgrammaticName.Replace('ControlType.','')+'|'+($e.Current.Name -replace '[\\r\\n|]',' ')+'|'+[int]($r.X+$r.Width/2)+'|'+[int]($r.Y+$r.Height/2) }`;

// แปลงผล PowerShell → ข้อความสั้นสำหรับโมเดล (พิกัดเป็นพิกเซลของภาพหน้าจอที่ส่งให้โมเดล: หารด้วยสเกล sx/sy)
function parseUia(out, { sx = 1, sy = 1, w = 99999, h = 99999 } = {}) {
  const lines = String(out || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const win = (lines.find(l => l.startsWith('WINDOW|')) || '').slice(7).trim();
  const items = [];
  for (const l of lines) {
    const p = l.split('|'); if (p.length < 4 || p[0] === 'WINDOW') continue;
    const x = Math.round(+p[p.length - 2] / sx), y = Math.round(+p[p.length - 1] / sy);
    if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x > w || y > h) continue;
    items.push({ type: p[0], name: p.slice(1, -2).join('|').trim().slice(0, 80), x, y });
  }
  return { window: win, items };
}
const uiaText = ({ window, items }) => !items.length ? `หน้าต่างหน้าสุด: ${window || '(ไม่ทราบชื่อ)'} · ไม่พบปุ่ม/ช่องจาก Windows (โปรแกรมนี้อาจวาดหน้าจอเอง เช่น เกม): ใช้คำบรรยายภาพแทน`
  : `หน้าต่างหน้าสุด: ${window || '(ไม่ทราบชื่อ)'}\nปุ่ม/ช่องที่กดได้ (ชนิด "ชื่อ" @ x,y = จุดกึ่งกลาง ใช้คลิกได้เลย):\n` + items.map(i => `- ${i.type} "${i.name}" @ ${i.x},${i.y}`).join('\n');

// เลือกตาช่วย: โมเดลที่อ่านรูปได้ หักลิมิตน้อยสุด (multiplier) แล้วต้นทุนต่ำสุด · ข้ามโมเดลสร้างรูป
function pickEyes(models = []) {
  return models.filter(m => m.vision && !/image|embed/i.test(m.owned_by || '') && !/image|embed|video|tts|whisper/i.test(m.id))
    .sort((a, b) => (a.multiplier ?? 1) - (b.multiplier ?? 1) || (a.cost ?? 0) - (b.cost ?? 0))[0]?.id || null;
}

// บรรยายภาพหน้าจอเป็นข้อความ (มีพิกัด) ให้โมเดลที่มองไม่เห็น · คืน null เมื่อเรียกไม่ได้
async function describeScreen({ post, model, image, w, h, goal = '', uia = '' }) {
  if (!post || !model || !image) return null;
  const sys = `You are the eyes of a computer-control agent that cannot see images. Describe this Windows screenshot (${w}x${h} pixels) so the agent can act: the windows/apps visible and which is in front, dialogs or errors, and EVERY element relevant to the goal (buttons, menus, tabs, fields, links, icons, list items) with its center coordinates as "label @ x,y" in this image's pixels. Be precise with coordinates; read visible text exactly (keep Thai as Thai). Max 350 words, no advice.`;
  const r = await post({ model, stream: false, max_tokens: 900, messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: `Agent goal: ${String(goal).slice(0, 600) || '(not given)'}${uia ? `\n\nWindows reports these elements (may be incomplete):\n${uia.slice(0, 2500)}` : ''}` }, { type: 'image_url', image_url: { url: image } }] }] }).catch(() => null);
  if (!r || !r.ok) return null;
  const d = await r.json().catch(() => ({})); return String(d.choices?.[0]?.message?.content || '').trim() || null;
}

module.exports = { UIA_PS, parseUia, uiaText, pickEyes, describeScreen };
