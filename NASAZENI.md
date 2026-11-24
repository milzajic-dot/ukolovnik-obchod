# Nasazení přes příkazový řádek (Windows PowerShell)

Viz odpověď v chatu — stejný postup krok za krokem:

1. `winget install --id Git.Git -e; winget install --id GitHub.cli -e; winget install --id OpenJS.NodeJS.LTS -e` (pak nové okno PowerShellu)
2. `npm install -g vercel firebase-tools`
3. `gh auth login; vercel login; firebase login`
4. Firebase:
   ```
   $P = "ukolovnik-obchod-km"
   firebase projects:create $P --display-name "Ukolovnik obchodu"
   firebase apps:create web "Ukolovnik" --project $P
   firebase apps:sdkconfig web --project $P | Out-File -Encoding utf8 firebase-config.json
   firebase firestore:databases:create "(default)" --location=europe-west3 --project $P
   firebase deploy --only "firestore:rules,auth" --project $P
   ```
5. GitHub: `gh repo create ukolovnik-obchod --private --source . --push`
6. Vercel:
   ```
   vercel link --yes --project ukolovnik-obchod
   Get-Content firebase-config.json -Raw | vercel env add FIREBASE_CONFIG production
   vercel env add ANTHROPIC_API_KEY production      # volitelné
   vercel deploy --prod
   vercel git connect
   ```
