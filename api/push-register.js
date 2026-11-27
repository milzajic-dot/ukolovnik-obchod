import { verifyUser, serviceToken, getDoc } from './_lib.js';
import { pushReady, getTokens, setTokens } from './_push.js';

// Uloží (nebo odebere) token zařízení pro oznámení na telefon přihlášeného uživatele.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použijte POST.' });
  if (!pushReady()) return res.status(200).json({ ok: false, configured: false });
  let user = null;
  try { user = await verifyUser(req); } catch (e) { user = null; }
  if (!user) return res.status(401).json({ error: 'Nepřihlášený uživatel.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const token = String(body.token || '');
  if (!/^[\w:.\-]{20,4096}$/.test(token)) return res.status(400).json({ error: 'Neplatný token.' });

  const sa = await serviceToken();
  const member = await getDoc(`members/${user.uid}`, sa).catch(() => null);
  if (!member) return res.status(403).json({ error: 'Uživatel není v týmu.' });

  const cur = await getTokens(user.uid, sa);
  const next = body.remove ? cur.filter((t) => t !== token) : [token, ...cur.filter((t) => t !== token)].slice(0, 6);
  await setTokens(user.uid, next, sa);
  return res.status(200).json({ ok: true, devices: next.length });
}
