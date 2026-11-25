// Jednorázový test odesílání e-mailů – pošle zkušební zprávu jen prvnímu administrátorovi.
import { adminEmails, mailConfigured, sendMail, mailLayout } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!mailConfigured()) return res.status(200).json({ ok: false, error: 'E-mail není nastaven' });
  const to = adminEmails()[0];
  if (!to) return res.status(200).json({ ok: false, error: 'Chybí ADMIN_EMAILS' });
  try {
    const m = mailLayout({
      heading: 'E-maily fungují',
      intro: 'Tohle je zkušební zpráva. Oznámení o nových úkolech a připomínky termínů budou chodit z této adresy.',
      task: { title: 'Zkušební úkol', due: new Date().toISOString().slice(0, 10) },
      button: 'Otevřít Úkolovník',
    });
    await sendMail({ to, subject: 'Úkolovník obchodu – zkušební e-mail', html: m.html, text: m.text });
    res.status(200).json({ ok: true, to });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e && e.message || e) });
  }
}
