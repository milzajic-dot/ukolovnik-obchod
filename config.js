import { firebaseConfig, allowedDomain, adminEmails } from './_lib.js';

// Veřejná konfigurace pro prohlížeč. Webová konfigurace Firebase není tajná;
// přístup k datům hlídají pravidla ve firestore.rules.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    firebase: firebaseConfig(),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    domain: allowedDomain(),
    admins: adminEmails(),
  });
}
