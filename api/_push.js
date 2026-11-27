// Oznámení na telefon (Web Push přes Firebase Cloud Messaging) a počet na ikoně aplikace.
// Tokeny zařízení jsou v kolekci pushTokens/{uid}; z aplikace je nikdo nečte ani nezapisuje
// (pravidla Firestore k ní přístup nedávají), pracuje s nimi jen server přes servisní účet.
import { firebaseConfig, serviceAccount, serviceToken, getDoc, listDocs, appUrl, todayPrague } from './_lib.js';

const fsBase = () => `https://firestore.googleapis.com/v1/projects/${firebaseConfig().projectId}/databases/(default)/documents`;
export const pushReady = () => Boolean(serviceAccount() && firebaseConfig());

export async function getTokens(uid, saTok) {
  const d = await getDoc(`pushTokens/${uid}`, saTok).catch(() => null);
  return Array.isArray(d && d.tokens) ? d.tokens.filter(Boolean) : [];
}
export async function setTokens(uid, tokens, saTok) {
  const body = { fields: { tokens: { arrayValue: { values: tokens.map((t) => ({ stringValue: t })) } }, updatedAt: { integerValue: String(Date.now()) } } };
  const r = await fetch(`${fsBase()}/pushTokens/${uid}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${saTok}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${r.status} pushTokens`);
}

// Stejný výpočet jako zvoneček v aplikaci (funkce notes() v index.html).
const dayNum = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
export function badgeCount(uid, member, tasks, groups, cfg) {
  if (!member) return 0;
  const seen = member.seenAt || 0;
  const rd = Math.max(1, +(cfg && cfg.reminderDays) || 4);
  const ids = [uid, member.alias].filter(Boolean);
  const gm = new Map((groups || []).map((g) => [g.id, g.members || []]));
  const today = dayNum(todayPrague());
  let n = 0;
  for (const t of tasks) {
    if (!t) continue;
    if (t.kind === 'info') { if ((t.createdAt || 0) > seen && t.author !== uid) n++; continue; }
    const a = String(t.assignee || '');
    const mine = a === uid || (a.startsWith('g:') && (gm.get(a.slice(2)) || []).some((x) => ids.includes(x)));
    if (!mine) continue;
    if ((t.assignedAt || t.createdAt || 0) > seen && t.assignedBy !== uid && t.status !== 'done') n++;
    if (t.status !== 'done' && /^\d{4}-\d{2}-\d{2}$/.test(t.due || '') && dayNum(t.due) - today <= rd) n++;
  }
  return n;
}

// Načte vše potřebné pro výpočet počtu (jednou na požadavek).
export async function loadContext(saTok) {
  const [tasks, members, groups, cfg] = await Promise.all([
    listDocs('tasks', saTok), listDocs('members', saTok), listDocs('groups', saTok).catch(() => []),
    getDoc('config/app', saTok).catch(() => null),
  ]);
  return { tasks, members: new Map(members.map((m) => [m.id, m])), groups, cfg };
}

// Pošle oznámení všem zařízením uživatele. Neplatné tokeny smaže.
export async function pushTo(uid, { title, body, tag }, ctx, saTok) {
  const tokens = await getTokens(uid, saTok);
  if (!tokens.length) return 0;
  const msgTok = await serviceToken('https://www.googleapis.com/auth/firebase.messaging');
  const badge = badgeCount(uid, ctx.members.get(uid), ctx.tasks, ctx.groups, ctx.cfg);
  const url = `${appUrl()}/#ukoly`;
  let ok = 0;
  const dead = [];
  for (const token of tokens) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${firebaseConfig().projectId}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${msgTok}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          data: { title: String(title), body: String(body || ''), tag: String(tag || ''), url, badge: String(badge) },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        },
      }),
    });
    if (r.ok) { ok++; continue; }
    const txt = await r.text().catch(() => '');
    if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(txt)) dead.push(token);
    else console.error('FCM', r.status, txt.slice(0, 300));
  }
  if (dead.length) await setTokens(uid, tokens.filter((t) => !dead.includes(t)), saTok).catch(() => {});
  return ok;
}
