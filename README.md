# Úkolovník obchodu – Konica Minolta

Centrální úkolovník obchodního týmu: úkoly z porad, marketingových akcí i ručního zadání, delegování, skupiny uživatelů, lokality a pozice, přehled (dashboard), upozornění a import zápisu z porady s rozpoznáním úkolů pomocí AI.

**Technologie:** statická stránka (`index.html`) + serverové funkce Vercel (`/api`) + Firebase Authentication a Cloud Firestore.

## Zprovoznění (jednorázově, cca 15 minut)

### 1. Firebase
1. Na <https://console.firebase.google.com> vytvořte projekt (např. `ukolovnik-obchod`). Google Analytics není potřeba.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
3. **Authentication → Settings → Authorized domains → Add domain:** doména aplikace na Vercelu (např. `ukolovnik-obchod.vercel.app`).
4. Volitelně **Authentication → Templates**: nastavte jazyk e-mailů na češtinu.
5. **Build → Firestore Database → Create database** (region `europe-west3` Frankfurt, *production mode*).
6. **Firestore → Rules:** vložte obsah souboru [`firestore.rules`](firestore.rules) a klikněte **Publish**.
   Zkontrolujte v něm firemní doménu (`konicaminolta.cz`) a e-mail prvního administrátora.
7. **Project settings (ozubené kolo) → General → Your apps → Web (`</>`)** → zaregistrujte aplikaci a zkopírujte objekt `firebaseConfig`.

### 2. Vercel – proměnné prostředí
V projektu na Vercelu **Settings → Environment Variables** (Production i Preview):

| Proměnná | Hodnota | Povinná |
|---|---|---|
| `FIREBASE_CONFIG` | celý objekt `firebaseConfig` z kroku 1.7 (stačí ho vložit tak, jak je) | ano |
| `ALLOWED_EMAIL_DOMAIN` | `konicaminolta.cz` | ne (výchozí) |
| `ADMIN_EMAILS` | e-maily prvních administrátorů oddělené čárkou | ne (výchozí `milan.zajic@konicaminolta.cz`) |
| `ANTHROPIC_API_KEY` | klíč z <https://console.anthropic.com> pro rozpoznání úkolů ze zápisu | ne – bez něj funguje základní rozpoznání |
| `ANTHROPIC_MODEL` | model Claude | ne (výchozí `claude-sonnet-5-5`) |

Po změně proměnných spusťte **Deployments → Redeploy**.

### 3. První přihlášení
1. První administrátor (dle `ADMIN_EMAILS` a `firestore.rules`) se zaregistruje, ověří e-mail a vyplní profil.
2. V **Správa** založí ostatní uživatele předem (jméno, e-mail, lokalita, pozice, role) a vytvoří skupiny.
3. Kolegové se registrují stejným firemním e-mailem a automaticky převezmou úkoly, které jim už byly přiděleny.

## Funkce
- Role **Administrátor** (mazání, správa uživatelů, skupin a nastavení) a **Uživatel** (vytváří, deleguje, plní).
- Uživatelé mají **lokalitu a pozici**; přehled i seznam úkolů lze filtrovat podle skupiny, lokality nebo pozice.
- **Skupiny**: úkol lze přidělit skupině – buď jako jeden společný úkol, nebo každému členovi samostatně.
- Upozornění ve zvonečku, odznak s počtem na ikoně (po instalaci jako aplikace), upozornění prohlížeče; připomenutí X dní před termínem (nastavitelné).
- Import zápisu z porady (.txt, .md, .docx, přepis z Teams) → návrh úkolů → kontrola → vytvoření.
- Export do CSV pro Excel.

E-mailová upozornění zatím nejsou zapojena (volba v nastavení je připravena). Doporučené řešení: Firebase rozšíření *Trigger Email* nebo Power Automate.

## Struktura
```
index.html            aplikace (UI + Firebase SDK z CDN)
api/config.js         veřejná konfigurace pro prohlížeč
api/parse.js          rozpoznání úkolů ze zápisu (Anthropic API, ověřuje Firebase token)
api/icon.js           ikony aplikace
api/_lib.js           sdílené funkce
firestore.rules       pravidla přístupu k datům (vložit do Firebase konzole)
manifest.webmanifest  PWA manifest, sw.js service worker
```
