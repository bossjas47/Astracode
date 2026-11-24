// เครื่องมือแก้ APK ให้ Agent: apktool (แตก/แพ็ก), jadx (อ่านเป็น Java), uber-apk-signer (เซ็นให้ติดตั้งได้)
// ดาวน์โหลดรุ่นล่าสุดจาก GitHub Releases มาไว้ที่ ~/.astra/tools ครั้งแรกครั้งเดียว · Java ไม่มีบน Windows → ติดตั้งผ่าน winget
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { runCmd } = require('./tools');

const DIR = path.join(os.homedir(), '.astra', 'tools');
const win = process.platform === 'win32';
const q = s => win ? `"${s}"` : `'${s.replace(/'/g, "'\\''")}'`;
const exists = p => fs.access(p).then(() => true, () => false);

// GitHub API ไม่ได้ (โดนจำกัดครั้ง/พร็อกซี) → ใช้หน้า releases/latest ที่ redirect ไป tag แล้วประกอบชื่อไฟล์ตามรูปแบบของแต่ละโปรเจกต์
const NAME = { 'iBotPeaches/Apktool': v => `apktool_${v}.jar`, 'patrickfav/uber-apk-signer': v => `uber-apk-signer-${v}.jar`, 'skylot/jadx': v => `jadx-${v}.zip` };
async function latest(repo, re) {
  try { return await latestApi(repo, re); } catch (e) {
    const r = await fetch(`https://github.com/${repo}/releases/latest`, { redirect: 'manual', headers: { 'user-agent': 'Kyber-Agent' }, signal: AbortSignal.timeout(20e3) });
    const tag = (r.headers.get('location') || '').match(/\/tag\/(v?([\d.]+))$/); if (!tag) throw e;
    return { browser_download_url: `https://github.com/${repo}/releases/download/${tag[1]}/${NAME[repo](tag[2])}` };
  }
}
async function latestApi(repo, re) {
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { 'user-agent': 'Kyber-Agent', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20e3) });
  if (!r.ok) throw new Error(`หา ${repo} รุ่นล่าสุดไม่ได้ (HTTP ${r.status})`);
  const a = (await r.json()).assets?.find(x => re.test(x.name)); if (!a) throw new Error(`ไม่พบไฟล์ของ ${repo}`);
  return a;
}
async function download(url, file) {
  const r = await fetch(url, { headers: { 'user-agent': 'Kyber-Agent' }, redirect: 'follow', signal: AbortSignal.timeout(300e3) });
  if (!r.ok) throw new Error(`ดาวน์โหลด ${path.basename(file)} ไม่ได้ (HTTP ${r.status})`);
  await fs.writeFile(file + '.part', Buffer.from(await r.arrayBuffer())); await fs.rename(file + '.part', file);
}
async function javaOk() { const r = await runCmd(os.homedir(), 'java -version', { timeout: 20e3 }).catch(() => ({ code: 1 })); return r.code === 0; }

// คืนคำสั่งพร้อมใช้ (ติดตั้งส่วนที่ขาดให้ก่อน) · log = ข้อความความคืบหน้า
async function androidTools({ log = () => {} } = {}) {
  await fs.mkdir(DIR, { recursive: true });
  const notes = [];
  if (!await javaOk()) {
    if (win) {
      log('กำลังติดตั้ง Java (Temurin 21 JRE) ด้วย winget…');
      const r = await runCmd(os.homedir(), 'winget install -e --id EclipseAdoptium.Temurin.21.JRE --silent --accept-source-agreements --accept-package-agreements', { timeout: 600e3 });
      const jre = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Eclipse Adoptium');
      const sub = (await fs.readdir(jre).catch(() => [])).find(d => /jre/i.test(d)); if (sub) process.env.PATH = `${path.join(jre, sub, 'bin')};${process.env.PATH}`;
      if (!await javaOk()) notes.push('ติดตั้ง Java ไม่สำเร็จ: ' + String(r.stderr || r.stdout).slice(0, 200) + ' · ให้ผู้ใช้ติดตั้ง Java 17+ เอง (adoptium.net)');
    } else notes.push('ไม่พบ Java: ติดตั้งก่อน เช่น `brew install openjdk` (Mac) หรือ `sudo apt install -y default-jre-headless` (Linux)');
  }
  const apktool = path.join(DIR, 'apktool.jar'), signer = path.join(DIR, 'uber-apk-signer.jar'), jadxDir = path.join(DIR, 'jadx');
  if (!await exists(apktool)) { log('กำลังดาวน์โหลด apktool…'); await download((await latest('iBotPeaches/Apktool', /^apktool_[\d.]+\.jar$/)).browser_download_url, apktool); }
  if (!await exists(signer)) { log('กำลังดาวน์โหลด uber-apk-signer…'); await download((await latest('patrickfav/uber-apk-signer', /^uber-apk-signer-[\d.]+\.jar$/)).browser_download_url, signer); }
  const jadx = path.join(jadxDir, 'bin', win ? 'jadx.bat' : 'jadx');
  if (!await exists(jadx)) {
    log('กำลังดาวน์โหลด jadx…'); const zip = path.join(DIR, 'jadx.zip');
    await download((await latest('skylot/jadx', /^jadx-[\d.]+\.zip$/)).browser_download_url, zip);
    const r = await runCmd(DIR, win ? `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zip}' -DestinationPath '${jadxDir}'"` : `mkdir -p ${q(jadxDir)} && unzip -oq ${q(zip)} -d ${q(jadxDir)} && chmod +x ${q(jadx)}`, { timeout: 120e3 });
    if (r.code !== 0) notes.push('แตก jadx ไม่สำเร็จ: ' + String(r.stderr).slice(0, 200));
    await fs.rm(zip, { force: true });
  }
  return [
    'เครื่องมือ Android พร้อมใช้ (รันด้วย bash):',
    `- แตก APK เป็น smali + resource ที่แก้ได้: java -jar ${q(apktool)} d app.apk -o app_src -f`,
    `- อ่านโค้ดเป็น Java (อ่านอย่างเดียว ไว้ทำความเข้าใจ): ${q(jadx)} -d app_java app.apk`,
    `- แพ็กกลับ: java -jar ${q(apktool)} b app_src -o app_mod.apk`,
    `- เซ็นให้ติดตั้งได้ (debug key): java -jar ${q(signer)} -a app_mod.apk --allowResign -o signed`,
    '- ติดตั้งลงมือถือที่ต่อ USB (เปิด USB debugging): adb install -r signed/<ไฟล์>.apk (ต้องมี adb)',
    'ขั้นตอนแนะนำ: แตก → แก้ AndroidManifest.xml / res/values/strings.xml / smali → แพ็ก → เซ็น → แจ้งพาธไฟล์ที่เซ็นแล้วให้ผู้ใช้ · แก้ smali ต้องรักษาจำนวน register และ syntax',
    ...notes.map(n => '⚠ ' + n),
  ].join('\n');
}
module.exports = { androidTools, ANDROID_DIR: DIR };
