import {
  serviceToken, listDocs, patchDoc, getDoc, sendMail, mailConfigured, mailLayout,
  workdaysBefore, todayPrague, fmtDate,
} from './_lib.js';
import { pushReady, pushTo, loadContext } from './_push.js';

// Denní připomínka (Vercel Cron): 3 pracovní dny před termínem pošle e-mail každému řešiteli,
// který úkol ještě nesplnil. Každý úkol se připomene jen jednou (pole reminderSent; po změně termínu se vynuluje).
export const REMIND_WORKDAYS = 3;

export function dueForReminder(t, today, days = REMIND_WORKDAYS) {
  if (!t || t.kind !== 'task' || t.status === 'done' || t.reminderSent) return false;
  if (!t.due || !/^\d{4}-\d{2}-\d{2}$/.test(t.due) || !t.assignee || String(t.assignee).startsWith('g:')) return false;
  if (t.due < today) return false; // po termínu už nepřipomínáme
  return today >= workdaysBefore(t.due, days);
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Neoprávněný přístup.' });
  const token = await serviceToken().catch(() => null);
  if (!token) return res.status(200).json({ ok: false, reason: 'Chybí FIREBASE_SERVICE_ACCOUNT.' });

  const ctx = await loadContext(token);
  const cfg = ctx.cfg;
  const mailOn = mailConfigured() && !(cfg && cfg.emails === false);
  const pushOn = pushReady();
  if (!mailOn && !pushOn) return res.status(200).json({ ok: true, disabled: true });

  const today = todayPrague();
  const tasks = ctx.tasks;
  const byId = ctx.members;
  let sent = 0, pushed = 0;
  const errors = [];
  for (const t of tasks.filter((x) => dueForReminder(x, today))) {
    const m = byId.get(t.assignee);
    try {
      if (pushOn && m) {
        pushed += await pushTo(t.assignee, {
          title: 'Blíží se termín úkolu',
          body: `${t.title} · termín ${fmtDate(t.due)}`,
          tag: `${t.id}:soon`,
        }, ctx, token).catch(() => 0);
      }
      if (mailOn && m && m.email) {
        const author = byId.get(t.author) || {};
        const { html, text } = mailLayout({
          heading: 'Blíží se termín úkolu',
          intro: `Úkol „${t.title}“ má termín ${fmtDate(t.due)} a zatím není označený jako splněný.`,
          task: t, assignerName: author.name || '', button: 'Otevřít úkoly',
        });
        await sendMail({ to: m.email, subject: `Připomínka: ${t.title} – termín ${fmtDate(t.due)}`, html, text });
        sent++;
      }
      await patchDoc(`tasks/${t.id}`, { reminderSent: true }, token);
    } catch (e) {
      errors.push(`${t.id}: ${String(e.message || e).slice(0, 120)}`);
    }
  }
  return res.status(200).json({ ok: true, today, sent, pushed, errors: errors.slice(0, 10) });
}
