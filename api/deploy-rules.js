import { readFile } from 'node:fs/promises';
import { serviceToken, firebaseConfig } from './_lib.js';

// Nasadí pravidla z firestore.rules do Firebase (Cloud Firestore) přes servisní účet.
// Volání: GET /api/deploy-rules?key=<CRON_SECRET> (nebo hlavička Authorization: Bearer <CRON_SECRET>).
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const given = (req.query && req.query.key) || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || given !== secret) return res.status(401).json({ error: 'Neoprávněný přístup.' });
  const project = firebaseConfig()?.projectId;
  let token;
  try { token = await serviceToken('https://www.googleapis.com/auth/cloud-platform'); } catch (e) { return res.status(500).json({ error: 'Servisní účet: ' + e.message }); }
  if (!token || !project) return res.status(500).json({ error: 'Chybí servisní účet nebo konfigurace Firebase.' });
  let content;
  try { content = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'); } catch (e) {
    try { content = await readFile(process.cwd() + '/firestore.rules', 'utf8'); } catch (e2) { return res.status(500).json({ error: 'Soubor firestore.rules nebyl nalezen.' }); }
  }
  const api = `https://firebaserules.googleapis.com/v1/projects/${project}`;
  const h = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const r1 = await fetch(`${api}/rulesets`, { method: 'POST', headers: h, body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content }] } }) });
  const j1 = await r1.json();
  if (!r1.ok) return res.status(502).json({ step: 'ruleset', status: r1.status, error: j1.error && j1.error.message });
  const release = { name: `projects/${project}/releases/cloud.firestore`, rulesetName: j1.name };
  let r2 = await fetch(`${api}/releases/cloud.firestore`, { method: 'PATCH', headers: h, body: JSON.stringify({ release }) });
  if (r2.status === 404) r2 = await fetch(`${api}/releases`, { method: 'POST', headers: h, body: JSON.stringify(release) });
  const j2 = await r2.json();
  if (!r2.ok) return res.status(502).json({ step: 'release', status: r2.status, error: j2.error && j2.error.message });
  return res.status(200).json({ ok: true, ruleset: j1.name, release: j2.name, updated: j2.updateTime });
}
