import { verifyUser, getDoc, sendMail, mailConfigured, mailLayout } from './_lib.js';

// E-mail řešitelům nově přidělených úkolů. Volá ho aplikace hned po vytvoření, přidání řešitele nebo předání.
// Data čte z Firestore s tokenem přihlášeného uživatele, takže platí stejná pravidla jako v aplikaci.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Použijte POST.' });
  let user = null;
  try { user = await verifyUser(req); } catch (e) { user = null; }
  if (!user) return res.status(401).json({ error: 'Nepřihlášený uživatel.' });
  if (!mailConfigured()) return res.status(200).json({ sent: 0, configured: false });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter((x) => /^[\w.-]{1,80}$/.test(x)).slice(0, 200);
  const reason = body.reason === 'delegate' ? 'delegate' : 'new';

  let cfg = null;
  try { cfg = await getDoc('config/app', user.token); } catch (e) { cfg = null; }
  if (cfg && cfg.emails === false) return res.status(200).json({ sent: 0, disabled: true });

  const people = new Map();
  const person = async (id) => {
    if (!people.has(id)) { try { people.set(id, await getDoc(`members/${id}`, user.token)); } catch (e) { people.set(id, null); } }
    return people.get(id);
  };

  let sent = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const t = await getDoc(`tasks/${id}`, user.token);
      if (!t || t.kind !== 'task' || !t.assignee || String(t.assignee).startsWith('g:') || t.status === 'done') continue;
      if (t.assignee === user.uid) continue; // sám sobě e-mail neposíláme
      const m = await person(t.assignee);
      if (!m || !m.email) continue;
      const who = (await person(user.uid)) || {};
      const { html, text } = mailLayout({
        heading: reason === 'delegate' ? 'Byl vám předán úkol' : 'Máte nový úkol',
        intro: `${who.name || 'Kolega'} vám ${reason === 'delegate' ? 'předal(a)' : 'přidělil(a)'} úkol v Úkolovníku obchodu.`,
        task: t, assignerName: who.name || '', button: 'Otevřít úkoly',
      });
      await sendMail({ to: m.email, subject: `${reason === 'delegate' ? 'Předaný úkol' : 'Nový úkol'}: ${t.title}`, html, text });
      sent++;
    } catch (e) {
      errors.push(String(e.message || e).slice(0, 120));
    }
  }
  return res.status(200).json({ sent, configured: true, errors: errors.slice(0, 5) });
}
