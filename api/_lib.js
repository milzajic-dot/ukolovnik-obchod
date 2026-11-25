// Sdílené pomocné funkce pro serverové funkce (soubor začínající "_" Vercel nezveřejňuje jako endpoint).

// Konfiguraci Firebase lze zadat buď jako celé FIREBASE_CONFIG (JSON nebo zkopírovaný objekt
// z Firebase konzole), nebo jako jednotlivé proměnné FIREBASE_API_KEY, FIREBASE_PROJECT_ID atd.
export function firebaseConfig() {
  const raw = process.env.FIREBASE_CONFIG;
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j && j.apiKey) return j;
    } catch (e) {
      const out = {};
      for (const m of raw.matchAll(/(\w+)\s*:\s*["']([^"']+)["']/g)) out[m[1]] = m[2];
      if (out.apiKey) return out;
    }
  }
  if (process.env.FIREBASE_API_KEY) {
    const pid = process.env.FIREBASE_PROJECT_ID;
    return {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || (pid ? `${pid}.firebaseapp.com` : undefined),
      projectId: pid,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
    };
  }
  return null;
}

export const allowedDomain = () => (process.env.ALLOWED_EMAIL_DOMAIN || 'konicaminolta.cz').toLowerCase().trim();
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS || 'milan.zajic@konicaminolta.cz').toLowerCase().split(/[,;\s]+/).filter(Boolean);

// Ověří Firebase ID token přes Identity Toolkit (bez dalších závislostí).
export async function verifyUser(req) {
  const fb = firebaseConfig();
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!fb || !tok) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fb.apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: tok }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const u = j.users && j.users[0];
  if (!u || !u.emailVerified) return null;
  const email = String(u.email || '').toLowerCase();
  if (!email.endsWith('@' + allowedDomain())) return null;
  return { uid: u.localId, email, token: tok };
}

// ---------- Firestore REST (bez dalších závislostí) ----------
export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  return null;
}
export function decodeFields(f) {
  const o = {};
  for (const [k, v] of Object.entries(f || {})) o[k] = decodeValue(v);
  return o;
}
const fsBase = () => `https://firestore.googleapis.com/v1/projects/${firebaseConfig().projectId}/databases/(default)/documents`;

// Přečte dokument jako daný uživatel (jeho token) nebo jako servisní účet.
export async function getDoc(path, token) {
  const r = await fetch(`${fsBase()}/${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore ${r.status} ${path}`);
  const j = await r.json();
  return decodeFields(j.fields);
}
export async function listDocs(collection, token) {
  const out = [];
  let pageToken = '';
  do {
    const r = await fetch(`${fsBase()}/${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`Firestore ${r.status} ${collection}`);
    const j = await r.json();
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), ...decodeFields(d.fields) });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
export async function patchDoc(path, data, token) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(Math.round(v)) } : { stringValue: String(v) };
  }
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  const r = await fetch(`${fsBase()}/${path}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${r.status} ${path}`);
}

// ---------- Servisní účet Firebase (pro denní připomínky) ----------
// FIREBASE_SERVICE_ACCOUNT = celý JSON klíče z Firebase konzole (Project settings → Service accounts → Generate new private key).
let saCache = { token: '', exp: 0 };
export function serviceAccount() {
  try { const j = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || ''); return j && j.private_key && j.client_email ? j : null; } catch (e) { return null; }
}
export async function serviceToken() {
  const sa = serviceAccount();
  if (!sa) return null;
  const now = Math.floor(Date.now() / 1000);
  if (saCache.token && saCache.exp > now + 60) return saCache.token;
  const { createSign } = await import('node:crypto');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
  });
  if (!r.ok) throw new Error(`Google token ${r.status}`);
  const j = await r.json();
  saCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return saCache.token;
}

// ---------- E-mail ----------
// Buď RESEND_API_KEY (+ MAIL_FROM), nebo SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (+ MAIL_FROM).
export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
export const appUrl = () => (process.env.APP_URL || 'https://ukolovnik-obchod.vercel.app').replace(/\/$/, '');
let smtpTransport = null;
export async function sendMail({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'Úkolovník <onboarding@resend.dev>';
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status} ${(await r.text()).slice(0, 200)}`);
    return;
  }
  if (!smtpTransport) {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(process.env.SMTP_PORT || 587);
    smtpTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  await smtpTransport.sendMail({ from, to, subject, html, text });
}

const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (s) => { if (!s) return 'bez termínu'; const p = String(s).split('-'); return `${+p[2]}. ${+p[1]}. ${p[0]}`; };
export function mailLayout({ heading, intro, task, assignerName, button }) {
  const rows = [
    ['Úkol', task.title],
    task.desc ? ['Popis', task.desc] : null,
    ['Termín', fmtDate(task.due)],
    assignerName ? ['Zadal(a)', assignerName] : null,
    task.meeting ? ['Porada', task.meeting] : null,
  ].filter(Boolean);
  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#0077c8;color:#fff;border-radius:12px 12px 0 0;padding:16px 22px;font-weight:bold;font-size:16px">Úkolovník obchodu · Konica Minolta</div>
<div style="background:#fff;border-radius:0 0 12px 12px;padding:22px">
<h1 style="font-size:20px;margin:0 0 10px">${escH(heading)}</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${escH(intro)}</p>
<table style="border-collapse:collapse;width:100%;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5a6670;vertical-align:top;white-space:nowrap">${escH(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${escH(v)}</td></tr>`).join('')}</table>
<p style="margin:22px 0 0"><a href="${appUrl()}/#ukoly" style="background:#0077c8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${escH(button)}</a></p>
</div><p style="font-size:12px;color:#5a6670;text-align:center;margin-top:14px">Automatická zpráva z aplikace Úkolovník obchodu.</p></div></body></html>`;
  const text = `${heading}\n\n${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${button}: ${appUrl()}/#ukoly`;
  return { html, text };
}

// ---------- Pracovní dny (ČR) ----------
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const isoUTC = (d) => d.toISOString().slice(0, 10);
export function isHolidayCZ(iso) {
  const md = iso.slice(5);
  if (['01-01', '05-01', '05-08', '07-05', '07-06', '09-28', '10-28', '11-17', '12-24', '12-25', '12-26'].includes(md)) return true;
  const e = easterSunday(+iso.slice(0, 4));
  const fri = new Date(e); fri.setUTCDate(e.getUTCDate() - 2);
  const mon = new Date(e); mon.setUTCDate(e.getUTCDate() + 1);
  return iso === isoUTC(fri) || iso === isoUTC(mon);
}
export function isWorkday(iso) {
  const wd = new Date(iso + 'T12:00:00Z').getUTCDay();
  return wd !== 0 && wd !== 6 && !isHolidayCZ(iso);
}
// Datum, které je `n` pracovních dní před `iso`.
export function workdaysBefore(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() - 1); if (isWorkday(isoUTC(d))) left--; }
  return isoUTC(d);
}
export const todayPrague = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
