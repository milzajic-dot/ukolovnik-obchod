import { verifyUser } from './_lib.js';

// Rozpozná úkoly ze zápisu z porady pomocí Claude (Anthropic API).
// Klíč ANTHROPIC_API_KEY je jen na serveru; volat smí pouze přihlášený uživatel s ověřeným firemním e-mailem.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použijte POST.' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(501).json({ error: 'Rozpoznání pomocí AI není nastavené.' });

  let user = null;
  try { user = await verifyUser(req); } catch (e) { user = null; }
  if (!user) return res.status(401).json({ error: 'Nepřihlášený uživatel.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const text = String(body.text || '').slice(0, 40000);
  if (!text.trim()) return res.status(400).json({ error: 'Chybí text zápisu.' });
  const members = (Array.isArray(body.members) ? body.members : []).slice(0, 300).map(String);
  const groups = (Array.isArray(body.groups) ? body.groups : []).slice(0, 100).map(String);
  const today = String(body.today || '').slice(0, 40);
  const meetingDate = String(body.meetingDate || '').slice(0, 10);

  const prompt = `Jsi asistent obchodního týmu. Ze zápisu z porady vytáhni jednotlivé úkoly a informace.
Dnešní datum: ${today}. Datum porady: ${meetingDate || today}.
Členové týmu: ${members.join(', ') || '(zatím nikdo)'}.
Skupiny uživatelů: ${groups.join(', ') || '(žádné)'}.
Vrať POUZE JSON pole objektů ve tvaru {"title": krátký název v češtině začínající slovesem (max 100 znaků), "desc": kontext v 1–2 větách nebo "", "assignee": přesné jméno člena nebo přesný název skupiny ze seznamů výše, nebo "", "due": "YYYY-MM-DD" nebo "", "kind": "task" pro úkol ke splnění nebo "info" pro pouhou informaci}.
Jména v textu mohou být skloňovaná (např. Milanovi = Milan) nebo jen křestní. Když je úkol pro celou skupinu (např. "všichni obchodníci z Brna"), použij název skupiny. Relativní termíny (do pátku, příští týden, do konce měsíce) převeď na datum vůči datu porady. Nevymýšlej úkoly, které v zápisu nejsou.
Zápis:
"""
${text}
"""`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return res.status(502).json({ error: 'Služba AI vrátila chybu.', detail });
    }
    const j = await r.json();
    const out = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const a = out.indexOf('['), b = out.lastIndexOf(']');
    let items = [];
    if (a >= 0 && b > a) { try { items = JSON.parse(out.slice(a, b + 1)); } catch (e) { items = []; } }
    return res.status(200).json({ items: Array.isArray(items) ? items.slice(0, 100) : [] });
  } catch (e) {
    return res.status(502).json({ error: 'Spojení se službou AI selhalo.' });
  }
}
