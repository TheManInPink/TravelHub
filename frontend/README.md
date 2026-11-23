# TravelHub, front-end

Ce dossier contient le front-end Next.js du TP2. Il sert de BFF (backend for frontend) au back-end Django qui se trouve à la racine du dépôt.

```powershell
npm ci
Copy-Item .env.example .env.local   # puis remplir les valeurs
npm run dev                         # http://localhost:3000
npm test
```

Le fichier `schema.graphql` est le schéma GraphQL produit par Django. Un test vérifie que nos documents GraphQL (`src/lib/api/itinerary.ts`) le respectent. Après un changement du schéma côté Django, nous le régénérons depuis la racine du dépôt :

```powershell
.\.venv\Scripts\python.exe manage.py graphql_schema --out frontend/schema.graphql
```

Les explications complètes sont dans la section « Lancer le front-end » du [README de la racine](../README.md#lancer-le-front-end). Le plan du TP2 est dans [docs/plan-tp2.md](../docs/plan-tp2.md).
