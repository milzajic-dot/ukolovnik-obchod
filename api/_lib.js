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
  return { uid: u.localId, email };
}
