// ตั้งค่า → Connectors / Skills / Plugins (โหลดเมื่อเปิดครั้งแรก) · ใช้ตัวช่วยกลางจาก app.js: sheet, api, esc, ic, toast, confirmSheet
(() => {
  const S = { tab: 'connectors', view: 'browse', q: '', d: null, skills: null, plugins: null };
  const AUTH_TXT = { oauth: 'ล็อกอินกับผู้ให้บริการ', none: 'ไม่ต้องล็อกอิน', token: 'ใส่ API key', url: 'วาง URL ส่วนตัว', google: 'บัญชี Google', github: 'GitHub token' };
  const PERM = [['allow', 'อนุญาตเสมอ'], ['ask', 'ถามก่อน'], ['deny', 'ห้ามใช้']];
  // โลโก้จริงจาก Simple Icons (CC0) · Microsoft วาดสี่เหลี่ยม 4 สีตามแบบ · ไม่มีไฟล์โลโก้เสรี (Canva, DeepWiki) = ตัวอักษรบนสีแบรนด์ · แอดมินอัปโหลดรูปเองได้ (data:image)
  const LOGOS = {"google":["4285F4","M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"],"github":["181717","M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"],"notion":["000000","M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"],"linear":["5E6AD2","M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"],"atlassian":["0052CC","M7.12 11.084a.683.683 0 00-1.16.126L.075 22.974a.703.703 0 00.63 1.018h8.19a.678.678 0 00.63-.39c1.767-3.65.696-9.203-2.406-12.52zM11.434.386a15.515 15.515 0 00-.906 15.317l3.95 7.9a.703.703 0 00.628.388h8.19a.703.703 0 00.63-1.017L12.63.38a.664.664 0 00-1.196.006z"],"sentry":["362D59","M13.91 2.505c-.873-1.448-2.972-1.448-3.844 0L6.904 7.92a15.478 15.478 0 0 1 8.53 12.811h-2.221A13.301 13.301 0 0 0 5.784 9.814l-2.926 5.06a7.65 7.65 0 0 1 4.435 5.848H2.194a.365.365 0 0 1-.298-.534l1.413-2.402a5.16 5.16 0 0 0-1.614-.913L.296 19.275a2.182 2.182 0 0 0 .812 2.999 2.24 2.24 0 0 0 1.086.288h6.983a9.322 9.322 0 0 0-3.845-8.318l1.11-1.922a11.47 11.47 0 0 1 4.95 10.24h5.915a17.242 17.242 0 0 0-7.885-15.28l2.244-3.845a.37.37 0 0 1 .504-.13c.255.14 9.75 16.708 9.928 16.9a.365.365 0 0 1-.327.543h-2.287c.029.612.029 1.223 0 1.831h2.297a2.206 2.206 0 0 0 1.922-3.31z"],"vercel":["000000","m12 1.608 12 20.784H0Z"],"supabase":["3FCF8E","M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z"],"stripe":["635BFF","M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"],"huggingface":["FFD21E","M12.025 1.13c-5.77 0-10.449 4.647-10.449 10.378 0 1.112.178 2.181.503 3.185.064-.222.203-.444.416-.577a.96.96 0 0 1 .524-.15c.293 0 .584.124.84.284.278.173.48.408.71.694.226.282.458.611.684.951v-.014c.017-.324.106-.622.264-.874s.403-.487.762-.543c.3-.047.596.06.787.203s.31.313.4.467c.15.257.212.468.233.542.01.026.653 1.552 1.657 2.54.616.605 1.01 1.223 1.082 1.912.055.537-.096 1.059-.38 1.572.637.121 1.294.187 1.967.187.657 0 1.298-.063 1.921-.178-.287-.517-.44-1.041-.384-1.581.07-.69.465-1.307 1.081-1.913 1.004-.987 1.647-2.513 1.657-2.539.021-.074.083-.285.233-.542.09-.154.208-.323.4-.467a1.08 1.08 0 0 1 .787-.203c.359.056.604.29.762.543s.247.55.265.874v.015c.225-.34.457-.67.683-.952.23-.286.432-.52.71-.694.257-.16.547-.284.84-.285a.97.97 0 0 1 .524.151c.228.143.373.388.43.625l.006.04a10.3 10.3 0 0 0 .534-3.273c0-5.731-4.678-10.378-10.449-10.378M8.327 6.583a1.5 1.5 0 0 1 .713.174 1.487 1.487 0 0 1 .617 2.013c-.183.343-.762-.214-1.102-.094-.38.134-.532.914-.917.71a1.487 1.487 0 0 1 .69-2.803m7.486 0a1.487 1.487 0 0 1 .689 2.803c-.385.204-.536-.576-.916-.71-.34-.12-.92.437-1.103.094a1.487 1.487 0 0 1 .617-2.013 1.5 1.5 0 0 1 .713-.174m-10.68 1.55a.96.96 0 1 1 0 1.921.96.96 0 0 1 0-1.92m13.838 0a.96.96 0 1 1 0 1.92.96.96 0 0 1 0-1.92M8.489 11.458c.588.01 1.965 1.157 3.572 1.164 1.607-.007 2.984-1.155 3.572-1.164.196-.003.305.12.305.454 0 .886-.424 2.328-1.563 3.202-.22-.756-1.396-1.366-1.63-1.32q-.011.001-.02.006l-.044.026-.01.008-.03.024q-.018.017-.035.036l-.032.04a1 1 0 0 0-.058.09l-.014.025q-.049.088-.11.19a1 1 0 0 1-.083.116 1.2 1.2 0 0 1-.173.18q-.035.029-.075.058a1.3 1.3 0 0 1-.251-.243 1 1 0 0 1-.076-.107c-.124-.193-.177-.363-.337-.444-.034-.016-.104-.008-.2.022q-.094.03-.216.087-.06.028-.125.063l-.13.074q-.067.04-.136.086a3 3 0 0 0-.135.096 3 3 0 0 0-.26.219 2 2 0 0 0-.12.121 2 2 0 0 0-.106.128l-.002.002a2 2 0 0 0-.09.132l-.001.001a1.2 1.2 0 0 0-.105.212q-.013.036-.024.073c-1.139-.875-1.563-2.317-1.563-3.203 0-.334.109-.457.305-.454m.836 10.354c.824-1.19.766-2.082-.365-3.194-1.13-1.112-1.789-2.738-1.789-2.738s-.246-.945-.806-.858-.97 1.499.202 2.362c1.173.864-.233 1.45-.685.64-.45-.812-1.683-2.896-2.322-3.295s-1.089-.175-.938.647 2.822 2.813 2.562 3.244-1.176-.506-1.176-.506-2.866-2.567-3.49-1.898.473 1.23 2.037 2.16c1.564.932 1.686 1.178 1.464 1.53s-3.675-2.511-4-1.297c-.323 1.214 3.524 1.567 3.287 2.405-.238.839-2.71-1.587-3.216-.642-.506.946 3.49 2.056 3.522 2.064 1.29.33 4.568 1.028 5.713-.624m5.349 0c-.824-1.19-.766-2.082.365-3.194 1.13-1.112 1.789-2.738 1.789-2.738s.246-.945.806-.858.97 1.499-.202 2.362c-1.173.864.233 1.45.685.64.451-.812 1.683-2.896 2.322-3.295s1.089-.175.938.647-2.822 2.813-2.562 3.244 1.176-.506 1.176-.506 2.866-2.567 3.49-1.898-.473 1.23-2.037 2.16c-1.564.932-1.686 1.178-1.464 1.53s3.675-2.511 4-1.297c.323 1.214-3.524 1.567-3.287 2.405.238.839 2.71-1.587 3.216-.642.506.946-3.49 2.056-3.522 2.064-1.29.33-4.568 1.028-5.713-.624"],"context7":["00E9A3","M13.8027 0C11.193 0 8.583.9952 6.5918 2.9863c-3.9823 3.9823-3.9823 10.4396 0 14.4219 1.9911 1.9911 5.2198 1.9911 7.211 0 1.991-1.9911 1.991-5.2198 0-7.211L12 12c.9956.9956.9956 2.6098 0 3.6055-.9956.9955-2.6099.9955-3.6055 0-2.9866-2.9868-2.9866-7.8297 0-10.8164 2.9868-2.9868 7.8297-2.9868 10.8164 0l1.8028-1.8028C19.0225.9952 16.4125 0 13.8027 0zM12 12c-.9956-.9956-.9956-2.6098 0-3.6055.9956-.9955 2.6098-.9955 3.6055 0 2.9867 2.9868 2.9867 7.8297 0 10.8164-2.9867 2.9868-7.8297 2.9868-10.8164 0l-1.8028 1.8028c3.9823 3.9822 10.4396 3.9822 14.4219 0 3.9823-3.9824 3.9823-10.4396 0-14.4219-.9956-.9956-2.3006-1.4922-3.6055-1.4922-1.3048 0-2.6099.4966-3.6054 1.4922-1.9912 1.9912-1.9912 5.2198 0 7.211z"],"cloudflare-docs":["F38020","M16.5088 16.8447c.1475-.5068.0908-.9707-.1553-1.3154-.2246-.3164-.6045-.499-1.0615-.5205l-8.6592-.1123a.1559.1559 0 0 1-.1333-.0713c-.0283-.042-.0351-.0986-.021-.1553.0278-.084.1123-.1484.2036-.1562l8.7359-.1123c1.0351-.0489 2.1601-.8868 2.5537-1.9136l.499-1.3013c.0215-.0561.0293-.1128.0147-.168-.5625-2.5463-2.835-4.4453-5.5499-4.4453-2.5039 0-4.6284 1.6177-5.3876 3.8614-.4927-.3658-1.1187-.5625-1.794-.499-1.2026.119-2.1665 1.083-2.2861 2.2856-.0283.31-.0069.6128.0635.894C1.5683 13.171 0 14.7754 0 16.752c0 .1748.0142.3515.0352.5273.0141.083.0844.1475.1689.1475h15.9814c.0909 0 .1758-.0645.2032-.1553l.12-.4268zm2.7568-5.5634c-.0771 0-.1611 0-.2383.0112-.0566 0-.1054.0415-.127.0976l-.3378 1.1744c-.1475.5068-.0918.9707.1543 1.3164.2256.3164.6055.498 1.0625.5195l1.8437.1133c.0557 0 .1055.0263.1329.0703.0283.043.0351.1074.0214.1562-.0283.084-.1132.1485-.204.1553l-1.921.1123c-1.041.0488-2.1582.8867-2.5527 1.914l-.1406.3585c-.0283.0713.0215.1416.0986.1416h6.5977c.0771 0 .1474-.0489.169-.126.1122-.4082.1757-.837.1757-1.2803 0-2.6025-2.125-4.727-4.7344-4.727"],"zapier":["FF4F00","M4.157 0A4.151 4.151 0 0 0 0 4.161v15.678A4.151 4.151 0 0 0 4.157 24h15.682A4.152 4.152 0 0 0 24 19.839V4.161A4.152 4.152 0 0 0 19.839 0H4.157Zm10.61 8.761h.03a.577.577 0 0 1 .23.038.585.585 0 0 1 .201.124.63.63 0 0 1 .162.431.612.612 0 0 1-.162.435.58.58 0 0 1-.201.128.58.58 0 0 1-.23.042.529.529 0 0 1-.235-.042.585.585 0 0 1-.332-.328.559.559 0 0 1-.038-.235.613.613 0 0 1 .17-.431.59.59 0 0 1 .405-.162Zm2.853 1.572c.03.004.061.004.095.004.325-.011.646.064.937.219.238.144.431.355.552.609.128.279.189.582.185.888v.193a2 2 0 0 1 0 .219h-2.498c.003.227.075.45.204.642a.78.78 0 0 0 .646.265.714.714 0 0 0 .484-.136.642.642 0 0 0 .23-.318l.915.257a1.398 1.398 0 0 1-.28.537c-.14.159-.321.284-.521.355a2.234 2.234 0 0 1-.836.136 1.923 1.923 0 0 1-1.001-.245 1.618 1.618 0 0 1-.665-.703 2.221 2.221 0 0 1-.227-1.036 1.95 1.95 0 0 1 .48-1.398 1.9 1.9 0 0 1 1.3-.488Zm-9.607.023c.162.004.325.026.48.079.207.065.4.174.563.314.26.302.393.692.366 1.088v2.276H8.53l-.109-.711h-.065c-.064.163-.155.31-.272.439a1.122 1.122 0 0 1-.374.264 1.023 1.023 0 0 1-.453.083 1.334 1.334 0 0 1-.866-.264.965.965 0 0 1-.329-.801.993.993 0 0 1 .076-.431 1.02 1.02 0 0 1 .242-.363 1.478 1.478 0 0 1 1.043-.303h.952v-.181a.696.696 0 0 0-.136-.454.553.553 0 0 0-.438-.154.695.695 0 0 0-.378.086.48.48 0 0 0-.193.254l-.99-.144a1.26 1.26 0 0 1 .257-.563c.14-.174.321-.302.533-.378.261-.091.54-.136.82-.129.053-.003.106-.007.163-.007Zm4.384.007c.174 0 .347.038.506.114.182.083.34.211.458.374.257.423.377.911.351 1.406a2.53 2.53 0 0 1-.355 1.448 1.148 1.148 0 0 1-1.009.517c-.204 0-.401-.045-.582-.136a1.052 1.052 0 0 1-.48-.457 1.298 1.298 0 0 1-.114-.234h-.045l.004 1.784h-1.059v-4.713h.904l.117.805h.057c.068-.208.177-.401.328-.56a1.129 1.129 0 0 1 .843-.344h.076v-.004Zm7.559.084h.903l.113.805h.053a1.37 1.37 0 0 1 .235-.484.813.813 0 0 1 .313-.242.82.82 0 0 1 .39-.076h.234v1.051h-.401a.662.662 0 0 0-.313.008.623.623 0 0 0-.272.155.663.663 0 0 0-.174.26.683.683 0 0 0-.027.314v1.875h-1.054v-3.666Zm-17.515.003h3.262v.896L3.73 13.104l.034.113h1.973l.042.9H2.4v-.9l1.931-1.754-.045-.117H2.441v-.896Zm11.815 0h1.055v3.659h-1.055V10.45Zm3.443.684.019.016a.69.69 0 0 0-.351.045.756.756 0 0 0-.287.204c-.11.155-.174.336-.189.522h1.545c-.034-.526-.257-.787-.74-.787h.003Zm-5.718.163c-.026 0-.057 0-.083.004a.78.78 0 0 0-.31.053.746.746 0 0 0-.257.189 1.016 1.016 0 0 0-.204.695v.064c-.015.257.057.507.204.711a.634.634 0 0 0 .253.196.638.638 0 0 0 .314.061.644.644 0 0 0 .578-.265c.14-.223.204-.48.189-.74a1.216 1.216 0 0 0-.181-.711.677.677 0 0 0-.503-.257Zm-4.509 1.266a.464.464 0 0 0-.268.102.373.373 0 0 0-.114.276c0 .053.008.106.027.155a.375.375 0 0 0 .087.132.576.576 0 0 0 .397.11v.004a.863.863 0 0 0 .563-.182.573.573 0 0 0 .211-.457v-.14h-.903Z"]};
  const MS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="10.5" height="10.5" fill="#F25022"/><rect x="12.5" y="1" width="10.5" height="10.5" fill="#7FBA00"/><rect x="1" y="12.5" width="10.5" height="10.5" fill="#00A4EF"/><rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/></svg>';
  const icon = (c, big) => {
    const i = c?.icon || '#6b7280', cls = 'cn-ico' + (big ? ' big' : ''), slug = c?.slug || c?.connector, L = LOGOS[slug];
    if (/^data:image\//.test(i)) return `<span class="${cls} logo"><img src="${esc(i)}" alt=""></span>`;
    if (L) return `<span class="${cls} logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#${L[0]}" d="${L[1]}"/></svg></span>`;
    if (slug === 'microsoft-learn') return `<span class="${cls} logo">${MS}</span>`;
    const n = String(c?.name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase();
    return `<span class="${cls}" style="--c:${/^#[0-9a-f]{6}$/i.test(i) ? i : '#6b7280'}">${esc(n)}</span>`;
  };
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
  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq; let body = ''; // กดสลับแท็บเร็วๆ: แท็บที่โหลดช้ากว่าห้ามเขียนทับแท็บที่เลือกล่าสุด
    const tab = S.tab, view = S.view;
    try {
      if (S.tab === 'connectors') { if (!S.d) await load(); body = S.view === 'mine' ? mineHTML() : browseHTML(); }
      else if (S.tab === 'skills') { S.skills = await loadSkills(!S.skills); body = skillsHTML(); }
      else { S.plugins = await api('/plugins'); if (!S.d) await load(); body = pluginsHTML(); }
    } catch (x) { body = `<p class="bad">${esc(x.message)}</p>`; }
    if (seq !== drawSeq || tab !== S.tab || view !== S.view) return;
    // หน้ารายการเปิดอยู่แล้ว: เปลี่ยนแค่เนื้อหาข้างใน ไม่สร้างหน้าต่างใหม่ (เดิมเด้งเล่นแอนิเมชันเปิดทุกครั้งที่สลับแท็บ/พิมพ์ค้นหา)
    const open = document.querySelector('.sheet-bg .sheet.cn-sheet.cn-main');
    if (open) { const b = open.querySelector('.sheet-b'), tops = [open.scrollTop, b.scrollTop], sameTab = open.dataset.cnv === S.tab + S.view; b.innerHTML = shell(body); open.dataset.cnv = S.tab + S.view; [open.scrollTop, b.scrollTop] = sameTab ? tops : [0, 0]; bind(open.parentElement, () => open.parentElement.remove()); return; }
    sheet('Connectors · Skills · Plugins', shell(body), (d, close) => { const s = d.querySelector('.sheet'); s.classList.add('cn-main'); s.dataset.cnv = S.tab + S.view; return bind(d, close); });
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
    return `<div class="cn-list">${list.map(x => `<button type="button" class="cn-row" data-cid="${x.id}">${icon({ icon: x.icon, name: x.name, slug: x.connector })}<span class="cn-txt"><b>${esc(x.name)}</b><small>${esc(x.host)} · ${x.tools.length} เครื่องมือ${x.global ? ' · ของระบบ' : ''}</small></span>
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
      <div class="cn-head">${icon(c || { icon: row?.icon, name, slug: row?.connector }, true)}<div><b>${esc(name)}</b><small>${c?.by ? 'โดย ' + esc(c.by) + ' · ' : ''}${esc(row?.host || AUTH_TXT[kind] || '')}</small></div></div>
      ${c?.description ? `<p>${esc(c.description)}</p>` : ''}
      ${row ? `${row.status === 'error' ? `<p class="bad">${esc(row.error || 'ต้องเชื่อมต่อใหม่')}</p>` : ''}
        <label class="tg"><input type="checkbox" data-auto ${row.auto ? 'checked' : ''} ${row.global ? 'disabled' : ''}><span><b>ใช้ในทุกแชต</b><small class="muted">AI เรียกใช้เองเมื่อจำเป็น · ปิดชั่วคราวในแชตได้ที่ปุ่ม +</small></span></label>
        <div class="row cn-acts">${row.global ? '' : `<button type="button" class="btn out sm" data-sync>${ic('refresh', 'sm')} อัปเดตเครื่องมือ</button>${kind === 'oauth' || row.status === 'error' ? `<button type="button" class="btn out sm" data-go>เชื่อมใหม่</button>` : ''}<button type="button" class="btn red sm" data-del>ยกเลิกการเชื่อมต่อ</button>`}</div>
        <h4 class="cn-cat">เครื่องมือ (${row.tools.length})</h4><p class="muted cn-hint">AI ใช้ได้ทุกเครื่องมือโดยไม่ต้องกดอนุญาต · อยากให้ถามก่อนหรือห้ามใช้เครื่องมือไหน ตั้งได้ด้านล่าง</p><div class="cn-tools">${tools || '<p class="muted">ไม่มีเครื่องมือ</p>'}</div>`
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
    return `<div class="cn-grid">${list.map(s => `<button type="button" class="cn-card" data-sk="${s.id}"><span class="cn-ico" style="--c:#8b5cf6">${ic('sparkles', 'sm')}</span><span class="cn-txt"><b>${esc(s.name)}</b><span>${esc(s.description || String(s.content || '').slice(0, 90))}</span><small>${s.user_id ? 'ของคุณ' : 'Kyber'}</small></span><span class="cn-plus">${ic('right', 'sm')}</span></button>`).join('')}</div><p class="muted cn-hint">ใช้ในแชต: กด + ในช่องพิมพ์ → Skills หรือพิมพ์ / ตามด้วยชื่อ</p>`;
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
      <div class="sheet-acts"><button type="button" class="btn out" data-c>ยกเลิก</button><button class="btn blue">บันทึก</button></div></form>
      <form class="sheet-form" id="skgh" style="margin-top:14px;border-top:1px solid var(--hair);padding-top:14px"><b>หรือนำเข้าจาก GitHub</b><small class="muted">ลิงก์ repo ที่มีไฟล์ SKILL.md (แบบ Claude Skills) · นำเข้าแล้วพิมพ์ / ในช่องแชตเพื่อเรียกใช้</small>
      <input name="url" type="url" placeholder="https://github.com/owner/repo" required><button class="btn out">นำเข้า</button></form>`, (d, close) => {
      d.querySelector('[data-c]').onclick = () => { close(); draw(); };
      d.querySelector('#skgh').onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'กำลังนำเข้า...'; try { const r = await api('/skills/github', { method: 'POST', body: { url: new FormData(e.target).get('url') } }); S.skills = null; S.view = 'mine'; if (typeof loadSkills === 'function') loadSkills(true).catch(() => {}); close(); toast(r.added.length ? `นำเข้า ${r.added.length} Skill: ${r.added.slice(0, 3).join(', ')}${r.added.length > 3 ? '…' : ''} · พิมพ์ / เพื่อใช้` : 'มี Skill เหล่านี้อยู่แล้ว', 'ok'); draw(); } catch (x) { toast(x.message, 'bad'); b.disabled = false; b.textContent = 'นำเข้า'; } };
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
