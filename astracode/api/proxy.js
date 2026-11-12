// AstraCode บน Vercel: ส่งต่อทุกคำขอ /api/*, /v1/*, /robots.txt, /sitemap.xml, /blog ไปยัง Cloudflare Worker (D1, R2, AI อยู่ที่นั่น)
// ตั้ง Environment Variables บน Vercel: WORKER_URL (เช่น https://astracode.xxx.workers.dev) และ PROXY_SECRET (ค่าเดียวกับ secret ใน Worker)
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const u = new URL(req.url);
  const path = u.searchParams.get('__p') || '';
  u.searchParams.delete('__p');
  if (!/^(api|v1)\//.test(path)) return new Response('not found', { status: 404 });
  const target = `${process.env.WORKER_URL.replace(/\/$/, '')}/${path}${u.search}`;
  const h = new Headers(req.headers);
  for (const k of ['host', 'x-proxy-secret', 'x-client-ip', 'x-forwarded-host']) h.delete(k); // ห้ามผู้ใช้ปลอมค่าพวกนี้
  h.set('x-proxy-secret', process.env.PROXY_SECRET || '');
  h.set('x-client-ip', (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || '');
  h.set('x-forwarded-host', u.host);
  const res = await fetch(target, {
    method: req.method, headers: h, redirect: 'manual',
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, duplex: 'half',
  });
  const out = new Headers(res.headers);
  out.delete('content-encoding'); out.delete('content-length'); // ให้ Vercel บีบอัดเอง และส่งแบบ stream ได้
  return new Response(res.body, { status: res.status, headers: out });
}
