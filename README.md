# TravelHub

TravelHub est le back-end Django du TP1. Il sert à planifier et gérer des voyages. Il propose une API REST (Django REST Framework) et une API GraphQL (Graphene-Django), utilise PostgreSQL et appelle deux services externes, Open-Meteo et Countries GraphQL.

Le front-end du TP2 est une application Next.js qui se trouve dans le dossier `frontend/`. Elle est décrite dans la section [Lancer le front-end](#lancer-le-front-end).

Sommaire : [installation locale](#installation-powershell) · [Docker](#docker) · [front-end](#lancer-le-front-end) · [variables d'environnement](#variables-denvironnement) · [comptes de démonstration](#comptes-de-démonstration) · [exploitation (journaux, santé)](#exploitation) · [sauvegarde et restauration](#sauvegarde-et-restauration) · [API REST](#api-rest) · [API GraphQL](#api-graphql) · [sécurité](#sécurité-owasp-api-security-top-10-2023) · [tests](#tests-et-qualité)

## Prérequis

| Outil | Version |
| --- | --- |
| Python | 3.14 (`C:\Python314\python.exe`) |
| PostgreSQL | 18 (service `postgresql-x64-18`) |
| pgAdmin | 4 |
| Node.js | 26 LTS, pour le front-end |
| Git | 2.x |

Sur ce poste, la commande `py` lance Python 3.15. Il faut donc créer l'environnement virtuel avec Python 3.14 en donnant son chemin complet.

## Installation (PowerShell)

```powershell
git clone <url-du-depot> TravelHub
cd TravelHub
C:\Python314\python.exe -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt

Copy-Item .env.example .env      # puis remplir SECRET_KEY, ALLOWED_HOSTS et DATABASE_URL (exemples en commentaire)
.\scripts\db\create_database.ps1 # crée le rôle et la base de DATABASE_URL
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_demo --password "MotDePasseDemo-2026"   # facultatif, comptes de démo
python manage.py runserver
```

Pour vérifier que tout marche, http://localhost:8000/health/ doit répondre `{"status": "ok", …}` et http://localhost:8000/api/docs/ doit afficher Swagger UI.

Pour générer une clé secrète :

```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Créer la base avec pgAdmin au lieu du script

Dans pgAdmin, ouvrez le *Query Tool* sur le serveur PostgreSQL 18 et lancez ces deux commandes avec le mot de passe de votre `.env` :

```sql
CREATE ROLE travelhub LOGIN CREATEDB PASSWORD 'mot-de-passe-du-.env';
CREATE DATABASE travelhub OWNER travelhub ENCODING 'UTF8';
```

Le droit `CREATEDB` est nécessaire pour que pytest puisse créer la base `test_travelhub`.

### Mot de passe `postgres` oublié

Ouvrez un PowerShell **en tant qu'administrateur** à la racine du projet, puis lancez :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\db\reset_postgres_password.ps1
```

Le script fait une copie de `pg_hba.conf` et autorise pour un moment les connexions locales sans mot de passe. Il change ensuite le mot de passe et remet toujours la configuration d'origine. À la fin, il crée le rôle et la base de TravelHub.

## Docker

Il faut Docker Desktop avec Compose 2.23 ou plus récent. Compose lit aussi le fichier `.env`, donc remplissez-y `ALLOWED_HOSTS`, `POSTGRES_PASSWORD` et `PGADMIN_DEFAULT_PASSWORD` (voir `.env.example`).

```powershell
docker compose up --build        # web (Gunicorn), db (PostgreSQL 18), pgadmin
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py seed_demo --password "MotDePasseDemo-2026"
docker compose ps                # web doit être « healthy » (contrôle /health/)
docker compose logs -f web       # journaux JSON
docker compose down              # arrête tout, --volumes efface aussi la base et les journaux
```

| Service | Adresse | Rôle |
| --- | --- | --- |
| `web` | http://localhost:8000/api/docs/ | Image du `Dockerfile` avec `config.settings.prod`. Applique les migrations à chaque démarrage. Journaux rotatifs dans le volume `web-logs` |
| `db` | `db:5432`, réseau interne seulement | `postgres:18`, données dans le volume `postgres-data`, contrôle avec `pg_isready` |
| `pgadmin` | http://localhost:5050 | Connexion avec `PGADMIN_DEFAULT_EMAIL` et `PGADMIN_DEFAULT_PASSWORD`. Le serveur « TravelHub (Docker) » est déjà déclaré |

Le `Dockerfile` installe les dépendances dans une première étape (`python:3.14-slim`) et copie ensuite l'environnement virtuel dans l'image finale. Il lance `collectstatic` (les fichiers sont servis par WhiteNoise). Au démarrage du conteneur, son `CMD` applique les migrations puis lance Gunicorn (`gunicorn.conf.py`, avec `WEB_CONCURRENCY` processus). Docker Compose et Render utilisent ce même `CMD`. Gunicorn tourne avec un utilisateur non root qui peut seulement écrire dans `/app/logs`. Le `HEALTHCHECK` appelle `/health/` toutes les 30 s.

Dans `docker-compose.yml`, le service `web` remplace `DATABASE_URL` pour viser l'hôte `db`. Il désactive aussi la redirection HTTPS et HSTS, parce qu'en local on passe par HTTP. En vraie production, derrière un proxy HTTPS, on garde les valeurs par défaut.

## Lancer le front-end

Le front-end est une application Next.js 16 (App Router, TypeScript, Tailwind CSS et shadcn/ui). Il faut Node.js 26 LTS, et `node -v` doit afficher une version 26. Le navigateur ne parle qu'à Next.js. C'est le serveur Next.js qui appelle l'API Django, donc nous démarrons d'abord Django (voir plus haut).

```powershell
cd frontend
npm ci                              # installe les versions exactes de package-lock.json
Copy-Item .env.example .env.local   # puis remplir les valeurs (exemples en commentaire)
npm run dev                         # http://localhost:3000
npm test                            # tests Vitest
```

Le fichier `.env.local` reste hors de Git. Seules les variables qui commencent par `NEXT_PUBLIC_` arrivent dans le navigateur. La clé secrète de Supabase n'a donc jamais ce préfixe.

D'autres commandes se lancent aussi depuis `frontend/`. `npm run lint` lance ESLint et `npm run typecheck` génère les types des routes avant de lancer `tsc` de TypeScript 7. `npm run build` fait le build de production, comme sur Vercel. Les tests sont dans `frontend/tests/` et `npm run test:watch` les relance à chaque modification.

TypeScript 7.0 n'a pas encore d'API JavaScript, et `typescript-eslint` en a besoin. Nous suivons donc la méthode de l'équipe TypeScript, avec deux paquets. Le paquet `typescript7` est TypeScript 7.0, que `npm run typecheck` utilise. Le nom `typescript` est un alias vers `@typescript/typescript6`, qui fournit l'API de TypeScript 6 à `typescript-eslint` et la commande `tsc6`. `next build` la trouve tout seul pour sa propre vérification des types. Nous pourrons revenir à un seul paquet quand TypeScript 7.1 aura son API.

Le lint utilise ESLint 10. Les plugins `react`, `import` et `jsx-a11y` de `eslint-config-next` n'acceptent pas encore ESLint 10. Nous avons donc écrit `eslint.config.mjs` nous-mêmes. Il reprend les règles de `eslint-config-next` avec `@next/eslint-plugin-next`, `eslint-plugin-react-hooks` et `typescript-eslint`, et avec trois remplaçants qui acceptent ESLint 10 : `@eslint-react/eslint-plugin`, `eslint-plugin-import-x` et `eslint-plugin-jsx-a11y-x`. Les `overrides` de `package.json` imposent `minimatch` 11 à deux paquets, ce qui corrige une faille signalée par `npm audit`.

Depuis la racine du dépôt, `npm test` et `npm run build` lancent les mêmes commandes dans `frontend/`, grâce au petit `package.json` de la racine. Ces deux commandes n'ont rien à installer à la racine. Les dépendances de la racine servent seulement à la CLI Neon (voir « Déploiement »).

## Intégration continue

Le fichier `.github/workflows/ci.yml` tourne à chaque push sur `master` et à chaque pull request. Il contient trois tâches.

La tâche **Lint et tests** démarre un service PostgreSQL 18 et utilise le cache pip. Elle lance `ruff check`, `ruff format --check` et `pytest --cov-fail-under=80`. Le résumé de couverture s'affiche sur la page de l'exécution, et `coverage.xml` et `htmlcov/` sont publiés dans l'artefact `coverage`.

La tâche **Image Docker** construit l'image avec le cache de GitHub Actions. Elle lance ensuite `docker compose up --wait web`, qui attend que `/health/` réponde, puis vérifie `/health/`, `/api/docs/` et `/api/schema/`.

La tâche **Front-end** installe Node.js 26 avec le cache npm, puis lance `npm ci` dans `frontend/`. Elle enchaîne ensuite le lint, la vérification des types, les tests Vitest et le build. Pour le build, chaque variable de `frontend/.env.example` reçoit une valeur factice.

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour de pip, de npm (dossier `frontend/`) et de GitHub Actions. Pour npm, il ne propose pas de nouvelle version majeure de `@types/node`, qui suit Node.js 26, ni de l'alias `typescript`, qui doit rester en version 6 pour `typescript-eslint`.

## Déploiement

La version en ligne utilise quatre services gratuits. Le navigateur parle seulement à Next.js, sur Vercel. Le serveur Next.js appelle l'API Django sur Render, et Django lit la base PostgreSQL de Neon. Supabase Storage garde seulement les images de couverture. Les quatre services sont dans l'est des États-Unis, près de Washington, pour que les appels entre eux restent courts.

| Service | Adresse | Contenu |
| --- | --- | --- |
| Vercel | https://travelhub-uqar.vercel.app | Front-end Next.js (dossier `frontend/`), fonctions dans la région `iad1` |
| Render | https://travelhub-uqar-api.onrender.com | API Django dans l'image du `Dockerfile`, région `virginia`. Swagger est sur `/api/docs/` |
| Neon | projet `travelhub`, branche `production` | PostgreSQL 18, région `aws-us-east-1`, base `travelhub`, rôle `travelhub_owner` |
| Supabase | projet `travelhub`, `https://<ref>.supabase.co` | Bucket public `travelhub-images`, région East US (North Virginia) |

### API sur Render

Le service `travelhub-uqar-api` est décrit dans `render.yaml` (un Blueprint). Nous l'avons créé une seule fois dans le tableau de bord, avec *New > Blueprint* sur la branche `master`. Ensuite, Render relit ce fichier à chaque commit de `master` et redéploie l'API quand la CI est verte (`autoDeployTrigger: checksPass`). Un commit qui touche seulement le front-end, la documentation, Postman, le rapport ou les fichiers de la CLI Neon ne redéploie pas l'API (`buildFilter`).

Le plan gratuit n'a ni commande de pré-déploiement ni shell. Le `CMD` du `Dockerfile` applique donc les migrations à chaque démarrage, puis lance Gunicorn. Render attend ensuite une réponse 200 de `/health/`. Le service s'endort après 15 minutes sans requête, et la requête suivante attend environ une minute.

| Variable | Valeur | Où elle est définie |
| --- | --- | --- |
| `DJANGO_SETTINGS_MODULE` | `config.settings.prod` | `render.yaml` |
| `NUM_PROXIES` | `1`, le proxy de Render | `render.yaml` |
| `THROTTLE_ANON_RATE` | `300/hour`, car toutes les requêtes anonymes arrivent du serveur Vercel | `render.yaml` |
| `LOG_FILE` | vide, donc les journaux vont seulement sur la console de Render | `render.yaml` |
| `WEB_CONCURRENCY` | `2` | `render.yaml` |
| `SECRET_KEY` | générée sur notre poste avec `python -c "import secrets; print(secrets.token_urlsafe(50))"` | tableau de bord |
| `DATABASE_URL` | URL directe de Neon, sans `-pooler`, avec `sslmode=require` | tableau de bord |
| `ALLOWED_HOSTS` | `travelhub-uqar-api.onrender.com,localhost` | tableau de bord |
| `CORS_ALLOWED_ORIGINS` | `https://travelhub-uqar.vercel.app`, sans `/` à la fin | tableau de bord |
| `SUPABASE_STORAGE_HOST` | `<ref>.supabase.co`, l'hôte seul, sans `https://` ni `/` | tableau de bord |

Les cinq dernières variables ont `sync: false` dans `render.yaml`, et leur valeur existe seulement dans le tableau de bord. Render a demandé les quatre premières à la création du Blueprint. Il ne pose pas la question pour une variable ajoutée plus tard : nous avons donc saisi `SUPABASE_STORAGE_HOST` à la main, dans *Environment*. Nous générons `SECRET_KEY` nous-mêmes, car `generateValue` de Render donne 44 caractères et Django en demande au moins 50. Une origine CORS avec un `/` final ou sans `https://` fait échouer les contrôles de Django (erreurs `corsheaders.E014` et `E013`), et donc tout le déploiement.

### Base sur Neon

Django utilise l'URL directe, sans `-pooler`. Les migrations ont besoin d'une connexion directe, et deux processus Gunicorn ouvrent peu de connexions. Sur le plan gratuit, la base s'endort après 5 minutes sans requête et se réveille à la requête suivante.

Le dépôt est relié au projet par la CLI Neon (`npm install -g neon`, puis `neon login` et `neon init`). Le fichier `.neon`, hors de Git, garde le projet et la branche. `neon.ts` décrit la politique des branches, et ses deux dépendances sont dans le `package.json` de la racine. Le fichier `.npmrc` empêche npm de créer un `package-lock.json` à la racine, sinon Next.js prendrait tout le dépôt comme racine du front-end.

Par défaut, `neon init`, `neon deploy` et `neon env pull` écrivent les variables de Neon dans `.env`. Elles y remplacent le `DATABASE_URL` local, et pytest ou `runserver` viseraient alors la base de production. Nous lançons donc toujours `neon deploy --no-env-pull`.

Les commandes sur la base de production se lancent depuis notre poste, dans une fenêtre PowerShell réservée à cet usage. On n'y lance jamais pytest. Le mot de passe des comptes de démo en production n'est pas celui de ce README.

```powershell
$env:DATABASE_URL = neon connection-string production --database-name travelhub --role-name travelhub_owner --ssl require
.\.venv\Scripts\python.exe manage.py migrate          # Render le fait aussi à chaque démarrage
.\.venv\Scripts\python.exe manage.py createsuperuser
$env:DEMO_PASSWORD = Read-Host "Mot de passe des comptes de démo en production"
.\.venv\Scripts\python.exe manage.py seed_demo
Remove-Item Env:DATABASE_URL, Env:DEMO_PASSWORD       # ou fermer la fenêtre
```

Pour changer le mot de passe du rôle, on lance `neon roles reset-password travelhub_owner`. On colle ensuite la nouvelle URL dans `DATABASE_URL` sur Render, puis on redéploie.

### Front-end sur Vercel

Le projet Vercel `travelhub-uqar` est relié au dépôt GitHub, avec `frontend` comme *Root Directory*. Vercel prend Node.js 26, car `engines.node` vaut `26.x`. Chaque commit de `master` part en production, et chaque PR reçoit une preview. La protection de Vercel (*Standard Protection*) demande une connexion pour les previews, mais pas pour le domaine de production.

| Variable (Production et Preview) | Valeur |
| --- | --- |
| `DJANGO_API_URL` | `https://travelhub-uqar-api.onrender.com`, sans `/` à la fin. Seul le serveur Next.js la lit |
| `NEXT_PUBLIC_SITE_URL` | `https://travelhub-uqar.vercel.app`. Elle sert de base aux liens des métadonnées (`metadataBase`) |
| `SUPABASE_URL` | `https://<ref>.supabase.co`. Elle sert aussi à `images.remotePatterns` de `next.config.ts` |
| `SUPABASE_SECRET_KEY` | La clé `sb_secret_…` du projet, marquée *Sensitive*. Seul le serveur Next.js la lit |
| `SUPABASE_BUCKET` | `travelhub-images` |

Une variable changée sur Vercel ne s'applique qu'au déploiement suivant. Il faut donc redéployer (*Deployments*, puis *Redeploy*). Les variables `NEXT_PUBLIC_` sont même écrites dans le JavaScript au moment du build. `SUPABASE_URL` est aussi lue au build, pour la liste des images que `next/image` peut optimiser.

### Images sur Supabase Storage

Le projet Supabase `travelhub` garde seulement les images. La connexion des utilisateurs reste dans Django. Le bucket `travelhub-images` est public, avec une limite de 4 Mo et les types `image/jpeg`, `image/png` et `image/webp`. Public veut dire que tout le monde peut lire une image si on connaît son adresse. Les adresses contiennent un identifiant aléatoire, et Django ne les donne qu'aux participants du voyage.

Nous n'avons ajouté aucune politique RLS d'écriture. Le navigateur n'écrit jamais dans Supabase. Il envoie le fichier à la Server Action `uploadTripCover` de Next.js. Celle-ci vérifie la session et le rôle (propriétaire ou éditeur), puis le type, la taille et les premiers octets du fichier. Elle l'envoie ensuite à Supabase avec la clé secrète, qui contourne RLS. Sans politique, la clé publiable et les visiteurs ne peuvent donc rien écrire. L'action enregistre enfin l'adresse publique dans Django avec `PATCH /api/trips/{id}/`, puis supprime l'ancienne image.

Chaque image a un nom neuf, `trips/<id>/<uuid>.<ext>`. Le navigateur et le CDN de Supabase ne montrent donc jamais une ancienne version. Si Django refuse l'adresse, l'action supprime le fichier qu'elle vient d'envoyer. Côté Django, `SUPABASE_STORAGE_HOST` refuse toute adresse d'un autre hôte.

### Vérifier le déploiement

```powershell
# API et base. Réponse attendue 200 avec {"status": "ok", "checks": {"database": "ok", "cache": "ok"}}
curl.exe -s -i --max-time 120 https://travelhub-uqar-api.onrender.com/health/

# CORS depuis le domaine Vercel. La réponse contient access-control-allow-origin
curl.exe -s -i -X OPTIONS https://travelhub-uqar-api.onrender.com/api/auth/token/ -H "Origin: https://travelhub-uqar.vercel.app" -H "Access-Control-Request-Method: POST"

# CORS depuis une autre origine. Réponse 200 aussi, mais sans access-control-allow-origin
curl.exe -s -i -X OPTIONS https://travelhub-uqar-api.onrender.com/api/auth/token/ -H "Origin: https://site-refuse.example" -H "Access-Control-Request-Method: POST"

# Aucun secret dans le dépôt
git grep -nE "sb_secret_[A-Za-z0-9]"
git grep -n "SECRET_KEY="

# Aucune clé Supabase dans le JavaScript envoyé au navigateur (après npm run build, dans frontend/)
Get-ChildItem .next\static -Recurse -File | Select-String -Pattern "sb_secret" -List
```

La première et la dernière recherche ne trouvent rien. La seconde trouve seulement des lignes sans vraie valeur, par exemple les modèles `.env.example` vides et les clés factices de la CI et du build Docker.

On se connecte ensuite avec `alice` sur https://travelhub-uqar.vercel.app/login. Dans les outils du navigateur, les cookies `th_access` et `th_refresh` sont `HttpOnly`, `Secure` et `SameSite=Lax`. L'onglet Réseau ne montre aucune requête vers `onrender.com`.

Le CORS ne joue que si un navigateur appelle Django directement. Dans TravelHub, le navigateur appelle seulement Next.js, et les appels vers Django partent du serveur Next.js. Un serveur n'applique pas le CORS, donc ces appels marchent quelle que soit la valeur de `CORS_ALLOWED_ORIGINS`. Nous la réglons quand même sur le domaine Vercel, comme le demande l'énoncé. Elle protégerait l'API si une page l'appelait un jour depuis le navigateur.

## Variables d'environnement

Les variables sont lues dans l'environnement, sinon dans `.env` (le modèle est `.env.example`). Si une variable existe déjà dans l'environnement, elle passe avant celle de `.env`.

| Variable | Obligatoire | Défaut | Rôle |
| --- | --- | --- | --- |
| `SECRET_KEY` | oui | | Clé de signature de Django et des JWT (au moins 50 caractères) |
| `DATABASE_URL` | oui | | `postgres://utilisateur:motdepasse@hôte:5432/base`, remplacée par l'hôte `db` dans Docker |
| `DEBUG` | | `False` (`True` en dev) | Ignorée en production (`config.settings.prod`) |
| `ALLOWED_HOSTS` | en production | `localhost,127.0.0.1` en dev | Noms d'hôte acceptés, séparés par des virgules |
| `CORS_ALLOWED_ORIGINS` | | aucune | Origines du front-end autorisées (le domaine Vercel en production) |
| `CORS_ALLOWED_ORIGIN_REGEXES` | | aucune | Regex des previews Vercel, séparées par `;`. Chaque regex commence par `^` et finit par `$`. Inutile avec le BFF, donc vide en production |
| `SUPABASE_STORAGE_HOST` | | aucun | Seul hôte accepté pour `cover_image_url` (ex. `<ref>.supabase.co`). On met l'hôte seul, sans `https://` ni `/`, sinon Django refuse de démarrer. Si la variable est vide, toute adresse https est acceptée |
| `DB_CONN_MAX_AGE` | | `60` | Durée de vie des connexions PostgreSQL, en secondes |
| `THROTTLE_ANON_RATE`, `THROTTLE_USER_RATE` | | `100/hour`, `1000/hour` | Limites de requêtes (REST et GraphQL) |
| `NUM_PROXIES` | | aucun | Nombre de proxys devant Gunicorn (`1` sur Render). La limite de requêtes prend alors l'adresse ajoutée par le proxy à `X-Forwarded-For` |
| `LOG_LEVEL` | | `INFO` | Niveau des journaux de l'application |
| `DJANGO_LOG_LEVEL` | | `INFO` | Niveau des journaux de Django |
| `LOG_FILE` | | `logs/travelhub.log` | Fichier rotatif. Si la valeur est vide, on écrit seulement sur la console |
| `DEMO_PASSWORD` | | | Mot de passe des comptes créés par `seed_demo` |
| `CSRF_TRUSTED_ORIGINS` | | | En production, origines HTTPS de confiance pour l'admin |
| `SECURE_SSL_REDIRECT` | | `True` | En production, redirection de HTTP vers HTTPS (`False` dans Docker en local) |
| `SECURE_HSTS_SECONDS` | | 30 jours | En production, durée HSTS (`0` dans Docker en local) |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Docker | `travelhub`, aucun, `travelhub` | Base du conteneur `db` (évitez `@ : /` dans le mot de passe) |
| `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD` | Docker | `admin@example.com`, aucun | Compte pgAdmin |
| `WEB_PORT`, `PGADMIN_PORT` | | `8000`, `5050` | Ports publiés par Docker |
| `PORT` | | `8000` | Port d'écoute de Gunicorn, donné par Render. À ne pas définir pour Docker en local |
| `GUNICORN_BIND` | | | Adresse d'écoute complète de Gunicorn, prioritaire sur `PORT` |
| `WEB_CONCURRENCY` | | `2` | Nombre de processus Gunicorn |

Il y a trois modules de paramètres :

| Module | Usage |
| --- | --- |
| `config.settings.dev` | Développement (utilisé par défaut par `manage.py`) |
| `config.settings.test` | Tests (`pytest.ini`), avec les journaux seulement sur la console |
| `config.settings.prod` | Production (`wsgi.py`, `asgi.py`, image Docker). On le vérifie avec `python manage.py check --deploy --settings=config.settings.prod` |

## Comptes de démonstration

```powershell
python manage.py seed_demo --password "MotDePasseDemo-2026"          # crée les comptes et leurs voyages
python manage.py seed_demo --reset --password "MotDePasseDemo-2026"  # recrée tout (autre mot de passe…)
python manage.py seed_demo                                           # sans mot de passe, on ne peut pas se connecter
```

| Compte | Rôle `owner` | Rôle `editor` | Rôle `viewer` |
| --- | --- | --- | --- |
| `alice` | Week-end à Montréal | Automne à Paris, Retrouvailles à Dakar | Printemps au Japon |
| `mamadou` | Automne à Paris, Retrouvailles à Dakar | | |
| `yuki` | Printemps au Japon | Week-end à Montréal | Automne à Paris, Retrouvailles à Dakar |

Les courriels finissent par `@demo.travelhub.example` (par exemple `alice@demo.travelhub.example`). `alice` voit les 4 voyages, c'est donc le compte le plus pratique pour tester chaque rôle.

Le mot de passe est celui donné avec `--password`, sinon celui de `DEMO_PASSWORD`. Il est fixé seulement quand le compte est créé. Pour le changer, il faut relancer avec `--reset`. Pour se connecter, on envoie `POST /api/auth/token/` avec `{"username": "alice", "password": "…"}`. On colle ensuite le jeton `access` dans Swagger (bouton **Authorize**) ou dans GraphiQL.

On peut relancer la commande sans créer de doublons. `--reset` supprime seulement les comptes en `@demo.travelhub.example` et leurs voyages. Les dates dépendent du jour où on lance la commande. On obtient un voyage terminé, un en cours, un planifié et un brouillon, à Montréal, Paris, Tokyo et Dakar.

L'administration (`/admin/`) demande un superutilisateur. On le crée avec `python manage.py createsuperuser`, ou avec `docker compose exec web python manage.py createsuperuser` dans Docker. Aucun compte administrateur n'existe au départ.

## Exploitation

### Journaux

L'application écrit une ligne JSON par événement (`apps/core/logs.py`). Les lignes vont sur la console (sortie d'erreur, lisible avec `docker compose logs web` dans Docker) et dans le fichier rotatif `LOG_FILE`. Ce fichier fait 10 Mo au maximum et on garde 5 archives, de `travelhub.log.1` à `.5`.

```json
{"timestamp": "2026-10-23T22:01:39.510+00:00", "level": "INFO", "logger": "travelhub.request",
 "message": "GET /api/trips/ 200", "request_id": "292f04c8d5e541e69c07c7565e0e65f0",
 "method": "GET", "path": "/api/trips/", "status": 200, "duration_ms": 401.1, "user_id": 5}
```

| Logger | Contenu |
| --- | --- |
| `travelhub.request` | Une ligne par requête avec la méthode, le chemin **sans** chaîne de requête, le statut, la durée (ms) et l'utilisateur. `/health/` n'apparaît qu'au niveau DEBUG |
| `apps.integrations.services.http` | Une ligne par appel externe (`"event": "external_call"`) avec `service` (Open-Meteo ou Countries GraphQL), `method`, `url` sans paramètres, `status` (code HTTP, `timeout` ou `network_error`), `duration_ms` et `attempt`. Niveau WARNING si l'appel échoue ou est refusé (4xx). Une réponse trouvée dans le cache ne compte pas comme un appel |
| `django.request` | Requêtes en 4xx (WARNING) et erreurs 500 avec leur trace (ERROR). Le client reçoit seulement `internal_error` |
| `gunicorn.error` | Démarrage de Gunicorn et de ses processus (Docker) |

Chaque réponse a un en-tête `X-Request-ID` (`apps/core/middleware.py`). Le même identifiant se retrouve dans toutes les lignes de la requête, même celles écrites par les fils de la vue d'ensemble. Si le client ou un proxy envoie déjà un `X-Request-ID`, on le garde s'il est sûr (lettres, chiffres, `. _ -`, 64 caractères au plus). Sinon, on le remplace. Le front-end peut le lire (`CORS_EXPOSE_HEADERS`, avec `Retry-After`) et l'afficher avec un message d'erreur.

Aucun secret n'est journalisé. On n'écrit jamais les corps de requête, les en-têtes, la chaîne de requête ou les paramètres des appels externes. Par sécurité, le formateur masque aussi (`[masqué]`) les champs dont le nom fait penser à un secret (`password`, `token`, `access`, `refresh`, `authorization`, `cookie`…). Il masque aussi les JWT et les en-têtes `Bearer` trouvés dans un message ou une trace (voir `apps/core/tests/test_logging.py`).

Quelques recherches utiles dans le fichier (PowerShell) :

```powershell
Get-Content logs\travelhub.log -Wait | ConvertFrom-Json | Where-Object level -ne INFO   # suivi des avertissements
Select-String -Path logs\travelhub.log -Pattern '"request_id": "292f04c8d5e541e69c07c7565e0e65f0"'
Get-Content logs\travelhub.log | ConvertFrom-Json | Where-Object event -eq external_call |
    Group-Object service | Select-Object Name, Count                                    # appels par service
docker compose exec web tail -n 20 /app/logs/travelhub.log
```

Avec plusieurs processus Gunicorn, chaque processus fait tourner le fichier de son côté. La sortie de `docker compose logs` est complète et dans l'ordre, c'est donc elle qu'il vaut mieux consulter.

### Contrôle de santé

`GET /health/` (ou `HEAD`) ne demande pas d'authentification, n'a pas de limite de requêtes et n'est jamais mis en cache.

| Situation | Statut | Corps |
| --- | --- | --- |
| Base et cache répondent | 200 | `{"status": "ok", "checks": {"database": "ok", "cache": "ok"}}` |
| Base injoignable | 503 | `{"status": "error", "checks": {"database": "error", "cache": "ok"}}` |
| Cache en échec | 503 | `{"status": "error", "checks": {"database": "ok", "cache": "error"}}` |

La base est vérifiée avec `SELECT 1` et le cache avec une écriture suivie d'une lecture. Si quelque chose échoue, la cause n'est pas donnée au client mais elle est journalisée (logger `apps.core.views`). Le `HEALTHCHECK` de l'image appelle cette route toutes les 30 s, et `docker compose up --wait` comme la CI attendent l'état `healthy`. En production, `/health/` n'est pas redirigé vers HTTPS (`SECURE_REDIRECT_EXEMPT`), parce que Docker l'appelle en HTTP sans passer par le proxy.

## Sauvegarde et restauration

On utilise `scripts/backup.ps1` et `scripts/restore.ps1` (PowerShell 5.1 ou 7). Les archives sont au format personnalisé de `pg_dump` (`-Fc`) et vont dans `backups/`, qui est ignoré par Git. Elles s'appellent `<base>_AAAAMMJJ-HHMMSS.dump` en local et `<base>-docker_AAAAMMJJ-HHMMSS.dump` avec Docker. Le mot de passe n'apparaît jamais sur la ligne de commande. Il passe par `PGPASSWORD` pendant la commande, et dans le conteneur on n'en a pas besoin (connexion locale par socket).

```powershell
.\scripts\backup.ps1                                 # base de DATABASE_URL (PostgreSQL local)
.\scripts\backup.ps1 -Docker                         # base du service db de docker compose
.\scripts\backup.ps1 -Keep 14 -OutputDir D:\sauvegardes
```

Chaque archive est relue avec `pg_restore --list` avant d'être gardée, et une archive incomplète est supprimée. On garde les 7 sauvegardes les plus récentes de chaque série (option `-Keep`) et les plus vieilles sont supprimées.

```powershell
.\scripts\restore.ps1 -Database travelhub_restore    # dernière sauvegarde dans une base neuve, créée au besoin
.\scripts\restore.ps1 -File .\backups\travelhub_20261023-180008.dump -Force   # écrase la base de DATABASE_URL
.\scripts\restore.ps1 -Docker -Force                 # écrase la base du conteneur (web arrêté puis redémarré)
.\scripts\restore.ps1 -Docker -Database travelhub_restore -File .\backups\travelhub_20261023-180008.dump
```

Sans `-File`, le script prend la sauvegarde la plus récente de `backups/`. Sans `-Database`, il restaure dans la base de `DATABASE_URL` (ou `POSTGRES_DB` avec `-Docker`). Si la base n'existe pas, elle est créée, car le rôle de l'application a le droit `CREATEDB`.

Une base qui a déjà des tables n'est écrasée qu'avec `-Force` (`pg_restore --clean --if-exists`). La restauration se fait dans une seule transaction (`--single-transaction --exit-on-error`). Si l'archive est corrompue ou qu'une erreur arrive, la base ne change pas. Les options `--no-owner --no-privileges` permettent de restaurer une sauvegarde locale dans Docker, et l'inverse.

Avec `-Docker`, si la base visée est celle de `web`, le service est arrêté pendant la restauration puis redémarré. Il applique alors les migrations plus récentes que la sauvegarde. En local, pensez à arrêter `runserver` avant d'écraser la base qu'il utilise.

Pour vérifier une restauration dans une base vide :

```powershell
.\scripts\backup.ps1
.\scripts\restore.ps1 -Database travelhub_restore
$env:DATABASE_URL = "postgres://travelhub:<mot-de-passe>@localhost:5432/travelhub_restore"  # même URL que .env, autre base
python manage.py migrate --check     # code 0 si le schéma est à jour
python manage.py runserver 8001      # puis http://localhost:8001/health/ et une connexion avec un compte de la sauvegarde
Remove-Item Env:\DATABASE_URL        # revenir à la base de .env
& "C:\Program Files\PostgreSQL\18\bin\dropdb.exe" -h localhost -U travelhub travelhub_restore   # nettoyage
```

On peut aussi le faire sans les scripts, avec `docker compose exec` :

```powershell
# Sauvegarde. pg_dump écrit dans le conteneur, puis on copie le fichier sur l'hôte.
# On n'utilise pas la redirection >, car PowerShell 5.1 abîme les données binaires.
docker compose exec -T db sh -c 'pg_dump -Fc -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/travelhub.dump'
docker compose cp db:/tmp/travelhub.dump backups/travelhub-docker_manuel.dump

# Restauration dans une base vide travelhub_restore
docker compose cp backups/travelhub-docker_manuel.dump db:/tmp/travelhub.dump
docker compose exec -T db sh -c 'createdb -U $POSTGRES_USER travelhub_restore && pg_restore -U $POSTGRES_USER -d travelhub_restore --no-owner --no-privileges --exit-on-error --single-transaction /tmp/travelhub.dump'
docker compose exec -T db rm /tmp/travelhub.dump
```

Attention, le volume `postgres-data` n'est pas une sauvegarde, car `docker compose down --volumes` l'efface. Il faut copier `backups/` ailleurs que sur la machine de temps en temps.

## API REST

La documentation interactive est sur `/api/docs/` (Swagger UI) et `/api/redoc/` (ReDoc). Le schéma OpenAPI brut est sur `/api/schema/`.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| POST | `/api/auth/register/` | Inscription, renvoie l'utilisateur et une paire de jetons |
| POST | `/api/auth/token/` | Connexion (`username`, `password`). Jeton d'accès de 15 min, jeton de rafraîchissement de 1 jour |
| POST | `/api/auth/token/refresh/` | Nouveau jeton d'accès. L'ancien refresh est mis sur liste noire (rotation) |
| POST | `/api/auth/logout/` | Met le refresh envoyé sur liste noire (authentifié, seulement pour son propre jeton) |
| GET | `/api/auth/me/` | Profil de l'utilisateur connecté |
| GET, POST | `/api/trips/` | Mes voyages (20 par page) et création |
| GET, PUT, PATCH, DELETE | `/api/trips/{id}/` | Détail avec destinations et activités, modification, suppression |
| GET | `/api/trips/{id}/stats/` | Coût total, budget restant, coût moyen, et nombre, somme et moyenne par catégorie |
| POST | `/api/trips/{id}/clone/` | Copie du voyage en brouillon, avec ses destinations et activités, dans une transaction |
| GET, POST | `/api/trips/{id}/participants/` | Liste des participants, ajout par courriel (`email`, `role` editor ou viewer) |
| PATCH, DELETE | `/api/trips/{id}/participants/{user_id}/` | Changement de rôle (`owner` transfère la propriété) et retrait |
| GET, POST | `/api/destinations/` | Destinations de mes voyages, création (`trip` dans le corps) |
| GET, PUT, PATCH, DELETE | `/api/destinations/{id}/` | Détail, modification, suppression |
| GET | `/api/destinations/{id}/weather/` | Météo actuelle et prévisions du séjour (Open-Meteo) |
| GET | `/api/destinations/{id}/country/` | Pays de la destination (Countries GraphQL) |
| GET | `/api/destinations/{id}/overview/` | Destination, voyage, activités, coût total, météo et pays, avec dégradation partielle |
| GET, POST | `/api/activities/` | Activités de mes voyages, création (`destination` dans le corps) |
| GET, PUT, PATCH, DELETE | `/api/activities/{id}/` | Détail, modification, suppression |

Tout demande une authentification par défaut (`Authorization: Bearer <access>`). Dans Swagger, on appelle `POST /api/auth/token/` avec *Try it out* et on copie `access`. On clique ensuite sur **Authorize** et on colle le jeton sans le mot `Bearer`.

Accès aux voyages :

| Utilisateur | Lire | Modifier | Supprimer |
| --- | --- | --- | --- |
| Propriétaire | 200 | 200 | 204 |
| Éditeur | 200 | 200 | 403 |
| Lecteur | 200 | 403 | 403 |
| Non participant | 404 | 404 | 404 |

Un non-participant reçoit 404 et pas 403. Comme ça, l'API ne révèle pas que le voyage d'un autre existe.

Les destinations et les activités suivent les droits de leur voyage. Tous les participants peuvent les lire. Le propriétaire et les éditeurs peuvent aussi les créer, les modifier et les supprimer. À la création, si le voyage (ou la destination) parent est visible mais que l'utilisateur n'a pas le droit d'écrire, on renvoie 403. Si le parent est inconnu ou invisible, on renvoie 404.

Actions sur un voyage :

| Action | Propriétaire | Éditeur | Lecteur | Non participant |
| --- | --- | --- | --- | --- |
| `stats`, `clone`, liste des participants | 200 / 201 | 200 / 201 | 200 / 201 | 404 |
| Ajout, changement de rôle, retrait d'un participant | 201 / 200 / 204 | 403 | 403 | 404 |

On ne peut pas retirer ni rétrograder le propriétaire (400). Il doit d'abord donner le rôle `owner` à un autre participant, et il devient alors éditeur.

Deux champs ont été ajoutés aux voyages pour le front-end du TP2 :

- `my_role` (lecture seule) donne le rôle de l'utilisateur connecté dans le voyage : `owner`, `editor` ou `viewer`. L'interface s'en sert pour masquer les boutons, mais c'est toujours l'API qui décide. Le rôle est lu dans une sous-requête, donc la liste fait toujours deux requêtes SQL.
- `cover_image_url` est l'adresse de l'image de couverture, envoyée dans Supabase Storage par le front-end. Elle doit commencer par `https://` et, si `SUPABASE_STORAGE_HOST` est défini, être sur cet hôte, sans identifiants ni port. Une chaîne vide retire l'image. La duplication d'un voyage ne copie pas l'image.

### Météo (Open-Meteo)

`GET /api/destinations/{id}/weather/` est ouvert à tous les participants du voyage. La réponse donne les conditions actuelles (`temperature`, `wind_speed`, `precipitation`, `weather_code`). Pour chaque jour du séjour qui tombe dans les 16 jours de prévision, elle donne aussi `temperature_max`, `temperature_min`, `precipitation_sum`, `wind_speed_max` et `weather_code`. Chaque code météo WMO a une `description` en français. Les unités sont les °C, les km/h et les mm, et les heures sont celles de la destination (`timezone`).

Si la destination n'a pas de coordonnées, on la géocode d'abord avec la ville et le code pays. Sa `latitude` et sa `longitude` sont ensuite enregistrées et réutilisées aux appels suivants. Si on change la ville ou le code pays sans donner de nouvelles coordonnées, elles sont effacées.

Le géocodage reste 7 jours dans le cache Django et les prévisions 30 minutes. La clé de cache utilise la position arrondie à 4 décimales. Chaque requête vers Open-Meteo a un délai de 5 s et deux essais. Le deuxième essai a lieu seulement après une erreur réseau, un délai dépassé ou une réponse 5xx.

Les erreurs possibles sont `location_not_found` (404, ville inconnue), `no_data_available` (404, séjour complètement en dehors des 16 jours), `external_service_bad_response` (502, réponse illisible ou de forme inattendue), `external_service_unavailable` (503, service injoignable ou en erreur) et `external_service_timeout` (504).

Le service (`apps/integrations/services/open_meteo.py`) renvoie des dataclasses. Ses exceptions (`apps/integrations/exceptions.py`) ne dépendent pas de DRF, ce qui nous a permis de les réutiliser dans l'API GraphQL.

### Pays (Countries GraphQL)

`GET /api/destinations/{id}/country/` est ouvert à tous les participants. La réponse décrit le pays du `country_code` de la destination avec `code`, `name`, `native`, `capital`, `emoji` (le drapeau), `currency` (tel que le service le donne, par exemple `USD,USN,USS`), `currencies` (la même chose sous forme de liste), `continent` et `languages` (`name`, `native`). Countries GraphQL donne les noms en anglais.

La requête GraphQL est envoyée en POST à `https://countries.trevorblades.com/graphql`. Le code pays passe dans `variables` et n'est jamais mis dans le texte de la requête. Le résultat reste 24 heures dans le cache Django. Le délai et les essais sont les mêmes que pour Open-Meteo (`apps/integrations/services/http.py`).

Les erreurs possibles sont `country_not_found` (404, `country` vaut `null` pour ce code), `external_service_bad_response` (502, liste `errors` GraphQL non vide ou réponse illisible), `external_service_unavailable` (503, service injoignable, 4xx ou 5xx) et `external_service_timeout` (504).

### Vue d'ensemble d'une destination

`GET /api/destinations/{id}/overview/` regroupe tout dans une seule réponse. On y trouve `destination`, `trip`, `activities`, `activity_count` et `total_cost` (lus dans la base), `weather` (comme `/weather/`) et `country` (comme `/country/`). Open-Meteo et Countries GraphQL sont appelés en parallèle (`ThreadPoolExecutor`) pendant qu'on lit la base. Les fils secondaires ne font aucune requête SQL.

Si une source échoue, la réponse reste un 200 (dégradation partielle). Le bloc de cette source vaut `null` et `warnings` explique pourquoi :

```json
"weather": null,
"warnings": [
  {"source": "weather", "code": "external_service_unavailable",
   "message": "Open-Meteo est momentanément indisponible (erreur 503)."}
]
```

Par exemple, un séjour en dehors des 16 jours de prévision donne un avertissement `no_data_available` au lieu d'un 404. Le code de l'agrégateur est dans `apps/integrations/services/aggregator.py`.

Paramètres des listes :

| Ressource | Filtres | `ordering` |
| --- | --- | --- |
| `/api/trips/` | `status`, `start_date__gte`, `end_date__lte`, `title__icontains`, `search` (titre, description) | `start_date` (défaut), `title`, `created_at` |
| `/api/destinations/` | `trip`, `country_code`, `arrival_date__gte`, `departure_date__lte`, `search` (ville, pays) | `order` (défaut, par voyage), `arrival_date`, `city` |
| `/api/activities/` | `trip`, `destination`, `category`, `date`, `date__gte`, `date__lte`, `search` (nom, description) | `cost`, `date`, `name`, ordre chronologique par défaut |

On ajoute le préfixe `-` pour un tri décroissant, et `page` sert à la pagination.

### Format des erreurs

Toutes les erreurs ont la même forme :

```json
{
  "error": {
    "code": "validation_error",
    "message": "Les données envoyées sont invalides.",
    "details": {"end_date": ["La date de fin doit être postérieure ou égale à la date de début."]}
  }
}
```

Les valeurs les plus courantes de `code` sont `validation_error`, `integrity_error`, `not_authenticated`, `token_not_valid`, `permission_denied`, `not_found` et `throttled`. Pour les services externes, on a aussi `location_not_found`, `country_not_found`, `no_data_available`, `external_service_bad_response`, `external_service_unavailable` et `external_service_timeout`.

`details` contient les erreurs par champ (`non_field_errors` pour les erreurs globales). Sinon, c'est un objet vide. Le gestionnaire (`apps/core/exceptions.py`) transforme aussi en 400 les `ValidationError` de Django levées par les services, ainsi que les `IntegrityError`. Pour une `IntegrityError`, le message est celui de la contrainte PostgreSQL qui a été violée.

## API GraphQL

Il y a un seul point d'entrée, `POST /graphql/` (Graphene-Django). En développement, si on ouvre `http://localhost:8000/graphql/` dans le navigateur, on obtient GraphiQL. On récupère un jeton avec `POST /api/auth/token/` et on le met dans l'onglet *Headers* :

```json
{"Authorization": "Bearer <access>"}
```

| Racine | Champs |
| --- | --- |
| Query | `me`, `myTrips(status, startAfter, search, orderBy, limit, offset)`, `myTripsCount(status, startAfter, search)`, `trip(id)`, `destination(id)`, `destinationOverview(id)` |
| Mutation | `createTrip`, `updateTrip`, `deleteTrip`, `cloneTrip`, `addParticipant`, `removeParticipant`, `createDestination`, `updateDestination`, `deleteDestination`, `createActivity`, `updateActivity`, `deleteActivity` |

Chaque application (`accounts`, `trips`, `itinerary`, `integrations`) a son propre `schema.py`, et `config/schema.py` les assemble.

Les règles sont les mêmes que dans l'API REST. Tous les resolvers partent de `Trip.objects.visible_to(user)`. Les mutations réutilisent les serializers DRF (donc `Model.clean()` et les contraintes), les services (`create_trip`, `clone_trip`, `add_participant`…) et les permissions objet de `apps/core/permissions.py`. Chaque mutation tourne dans une transaction.

`Destination.weather` et `Destination.countryInfo` appellent Open-Meteo et Countries GraphQL seulement si le client les demande. Si l'appel échoue, seul ce champ est vide. `destinationOverview` garde la même dégradation partielle que l'API REST (`warnings`).

Le type `Trip` a aussi `myRole` (`OWNER`, `EDITOR` ou `VIEWER`) et `coverImageUrl`, comme l'API REST. `createTrip` et `updateTrip` acceptent `coverImageUrl`. `myRole` marche aussi pour un voyage atteint par `destination { trip }`.

`myTrips` est paginé comme l'API REST. `limit` vaut 20 par défaut (100 au maximum) et `offset` permet de sauter des voyages. `myTripsCount` donne le total avec les mêmes filtres. `myTrips` et `trip` préchargent les destinations, les activités et les participants seulement s'ils sont demandés. Le nombre de requêtes SQL ne dépend donc pas du nombre de voyages.

Le courriel d'un utilisateur n'est visible que par lui. Le mot de passe et les droits d'administration ne sont jamais exposés.

Pour l'authentification (`apps/core/views.py`, `TravelHubGraphQLView`), le jeton JWT est vérifié par le `JWTAuthentication` de SimpleJWT. Sans en-tête, la requête est anonyme et chaque champ répond `not_authenticated`. Un jeton invalide ou expiré donne un 401. Le cookie de session n'est jamais pris en compte, c'est pour ça qu'on peut exempter la vue de CSRF.

Les limites de requêtes sont les mêmes que pour l'API REST (`THROTTLE_ANON_RATE`, `THROTTLE_USER_RATE`) et les compteurs sont partagés. Un utilisateur a donc un seul quota pour REST et GraphQL. S'il le dépasse, il reçoit un 429 avec l'en-tête `Retry-After` et une erreur `throttled`.

Les erreurs gardent le code et les détails de l'erreur REST équivalente dans `extensions`, avec les noms de champs en camelCase :

```json
{
  "errors": [{
    "message": "Les données envoyées sont invalides.",
    "path": ["updateTrip"],
    "extensions": {
      "code": "validation_error",
      "details": {"endDate": ["La date de fin doit être postérieure ou égale à la date de début."]}
    }
  }],
  "data": {"updateTrip": null}
}
```

Les codes sont ceux de l'API REST (`not_authenticated`, `token_not_valid`, `throttled`, `permission_denied`, `not_found`, `validation_error`, `integrity_error` et les codes des services externes). Il y a en plus `internal_error` pour une erreur inattendue, dont le message reste caché. Un non-participant reçoit `not_found` et un lecteur qui essaie de modifier reçoit `permission_denied`. Les erreurs de syntaxe, de type ou de profondeur donnent un 400.

Pour durcir l'API, on utilise les paramètres `GRAPHQL_*`, relus à chaque requête :

| Paramètre | Développement | Production, tests |
| --- | --- | --- |
| `GRAPHQL_GRAPHIQL` | activé | désactivé |
| `GRAPHQL_INTROSPECTION` | activée | désactivée (`__schema` et `__type`, mais `__typename` reste permis) |
| `GRAPHQL_MAX_DEPTH` | 6 | 6 |

## Structure

```text
config/            projet Django (settings découpés, urls, schéma GraphQL, wsgi, asgi)
apps/core/         éléments communs (TimeStampedModel, permissions, exceptions, vue GraphQL)
apps/accounts/     utilisateur personnalisé, authentification
apps/trips/        voyages et participants
apps/itinerary/    destinations et activités
apps/integrations/ services Open-Meteo et Countries GraphQL
scripts/           sauvegarde et restauration (backup.ps1, restore.ps1)
scripts/db/        création du rôle et de la base PostgreSQL
logs/              journaux JSON rotatifs (ignoré par Git)
backups/           archives pg_dump (ignoré par Git)
.github/           CI (workflows/ci.yml) et Dependabot
postman/           collection Postman v2.1 et environnement local
frontend/          front-end Next.js du TP2 (src/, tests/, .env.example)
package.json       raccourcis npm test et npm run build vers frontend/
```

## Sécurité (OWASP API Security Top 10, 2023)

| Risque | Mesures | Tests |
| --- | --- | --- |
| API1 Broken Object Level Authorization | Chaque vue, resolver et filtre part de `Trip.objects.visible_to(user)`. Un non-participant reçoit 404, jamais 403. Les filtres `?trip=` et `?destination=` sont des `NumberFilter`, ils ne révèlent donc pas si un objet existe. Le parent (`trip`, `destination`) est cherché parmi les objets visibles. | `apps/core/tests/test_object_level_authorization.py`. On teste A contre B sur chaque point d'accès REST et chaque opération GraphQL (non-participant, lecteur, anonyme) et on vérifie que la base n'a pas changé après un refus |
| API2 Broken Authentication | Jeton d'accès JWT de 15 min. Rotation du refresh avec liste noire. On ne peut déconnecter que son propre jeton. Validateurs de mot de passe. `/graphql/` n'accepte jamais les cookies de session. | `test_security.py` (jeton falsifié, non signé, expiré, refresh utilisé comme accès), `apps/accounts/tests/` |
| API3 Broken Object Property Level Authorization | Liste blanche des champs modifiables. `owner`, `my_role`, `id`, les horodatages et les totaux sont en lecture seule. `cover_image_url` n'accepte que https et l'hôte Supabase. Pas de `is_staff` ni de groupes à l'inscription. Le rôle `owner` ne se donne pas par invitation. En GraphQL, il n'y a aucun champ de mot de passe ou de droits, et le courriel n'est visible que par son titulaire. | `test_mass_assignment.py` |
| API4 Unrestricted Resource Consumption | 100 requêtes/h en anonyme et 1000/h par utilisateur, avec un quota partagé entre REST et GraphQL. Pagination par 20 (100 au plus en GraphQL). Profondeur GraphQL limitée à 6. Délai de 5 s, deux essais et cache pour les services externes. | `test_auth_api.py`, `test_graphql_view.py` |
| API5 Broken Function Level Authorization | Permissions par rôle (`IsTripMember`, `IsTripEditor`, `IsTripOwner`). Un lecteur reçoit 403 pour toute écriture, et seul le propriétaire gère les participants. | Cas « lecteur » de `test_object_level_authorization.py`, `test_permissions.py` |
| API6 Unrestricted Access to Sensitive Business Flows | L'inscription et la connexion sont soumises à la limite anonyme. La duplication de voyages est soumise à la limite par utilisateur. | `test_auth_api.py` |
| API7 Server Side Request Forgery | Les URL d'Open-Meteo et de Countries sont des constantes. La ville est envoyée en paramètre de requête et le code pays (`^[A-Z]{2}$`) en variable GraphQL. Rien n'est concaténé. | `apps/integrations/tests/` |
| API8 Security Misconfiguration | `check --deploy` ne donne aucun avertissement. HSTS, redirection HTTPS, cookies `Secure`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` et COOP. CORS limité à `CORS_ALLOWED_ORIGINS` et aux regex ancrées des previews, sans identifiants. En production, seulement du JSON (pas d'API navigable), GraphiQL et introspection désactivés, et des 404/500 en JSON sans trace de pile (l'erreur est journalisée). Les journaux JSON ne contiennent ni jeton ni mot de passe, avec un masquage en plus par sécurité. | `test_security.py`, `test_input_validation.py`, `test_logging.py` |
| API9 Improper Inventory Management | Une seule version de l'API, décrite en entier par OpenAPI (`/api/docs/`) et par la collection Postman. | `test_api_docs.py` |
| API10 Unsafe Consumption of APIs | Les réponses externes sont validées puis converties en dataclasses. Une réponse inexploitable donne une 502, un service injoignable une 503 et un délai dépassé une 504. Seules les réponses exploitables vont dans le cache. | `test_open_meteo.py`, `test_countries.py`, `test_destination_overview.py` |

`test_input_validation.py` vérifie la validation des entrées. On y teste les dates incohérentes ou en dehors du voyage et du séjour, les montants négatifs ou trop précis, les longueurs, les choix inconnus, les codes pays, les coordonnées, les filtres et pages invalides, le JSON mal formé (400) et le mauvais type de contenu (415). Une donnée refusée n'écrit jamais rien en base.

Il reste quelques risques que nous avons acceptés. L'inscription et l'ajout d'un participant indiquent si un courriel est déjà inscrit, ce qui permet d'en deviner certains (le throttling limite ce problème). GraphQL limite la profondeur des requêtes mais pas leur largeur (plusieurs alias), et le throttling compte les requêtes HTTP. Enfin, la documentation OpenAPI reste publique en production, alors que l'introspection GraphQL y est fermée.

## Tests et qualité

```powershell
pytest                          # tests et couverture (terminal et htmlcov/index.html)
pytest --cov-fail-under=80      # échoue si la couverture totale passe sous 80 %
pytest -m "not slow"            # sans le test qui lance check --deploy dans un sous-processus
pytest apps/trips --no-cov      # une partie des tests, sans mesurer la couverture
ruff check .                    # analyse statique
ruff format .                   # formatage
python manage.py check --deploy --settings=config.settings.prod
```

La couverture (`.coveragerc`) mesure les branches de `apps/` et `config/`, sans compter les tests et les migrations. Le rapport HTML est dans `htmlcov/index.html`.

Au dernier passage (29 octobre 2026), les 724 tests passent et la couverture totale est de **98 %** (2139 instructions et 242 branches mesurées). La CI échoue si elle descend sous 80 %.

Fixtures communes (`conftest.py`) :

- `api_client` (anonyme) et `client_for(user)`
- `user_a`, `user_b`, `trip_a`, `destination_a`, `activity_a`, `trip_b`… avec les clients authentifiés `client_a` et `client_b`, pour les accès croisés
- les fabriques `make_user`, `make_trip`, `make_destination` et `make_activity`, qui créent des objets valides dont on peut remplacer n'importe quel champ
- `graphql(query, variables, user=…)` pour envoyer une requête GraphQL avec un vrai jeton
- `mock_http`, qui intercepte Open-Meteo et Countries pour qu'aucun test ne passe par le réseau

### Scénarios de test minimaux

| Domaine | Cas | Attendu | Tests pytest | Postman |
| --- | --- | --- | --- | --- |
| Auth | Sans jeton, jeton expiré, refresh révoqué après déconnexion | 401 | `test_auth_api.py`, `test_security.py::TestJwt` | Cas d'erreur (sauf le jeton expiré, qu'il faudrait signer avec la clé du serveur) |
| Voyages | Création valide, fin avant début, titre vide, filtre par statut, tri, image en http ou sur un autre hôte, `my_role` de chaque membre | 201 / 400 / 200 | `test_trip_api.py`, `test_input_validation.py` | Trips, Participants, Cas d'erreur |
| Accès | B lit, modifie, supprime le voyage de A | 404 | `test_object_level_authorization.py` | Cas d'erreur |
| Rôles | Un lecteur modifie, un éditeur supprime le voyage, un éditeur ajoute un participant | 403 | `test_trip_api.py`, `test_trip_actions.py` | Participants |
| Destinations | Dates hors du voyage, ordre en double, destination d'un voyage tiers | 400 / 404 | `test_destination_api.py`, `test_input_validation.py` | Cas d'erreur |
| Activités | Coût négatif, date hors de la destination, filtre par catégorie | 400 / 200 | `test_activity_api.py`, `test_input_validation.py` | Activities, Cas d'erreur |
| Transaction | Panne forcée pendant le clonage | 500 JSON, base inchangée | `test_services.py`, `test_trip_actions.py`, `apps/trips/tests/test_graphql.py` (`failure_midway`) | Non (panne simulée) |
| Open-Meteo | Ville inconnue, service en 500, délai dépassé | 404 / 503 / 504 | `test_open_meteo.py`, `test_destination_weather.py` | Cas d'erreur (404) |
| Countries | Code inconnu, liste `errors` GraphQL | 404 / 502 | `test_countries.py`, `test_destination_overview.py::TestCountry` | Cas d'erreur (404) |
| Agrégation | Une source en panne | 200 + `warnings` | `test_destination_overview.py` | Externes |
| GraphQL | Requête sans jeton, mutation sur un voyage tiers, validation | Erreur GraphQL avec `extensions.code` | `test_object_level_authorization.py::TestGraphqlCrossAccess`, `apps/*/tests/test_graphql.py` | Cas d'erreur |

Les pannes des services externes (500, délai, liste `errors`) et la panne du clonage sont simulées dans pytest (`mock_http`, `monkeypatch`). La collection Postman, elle, appelle les vrais services.

### Collection Postman

La collection est dans `postman/TravelHub.postman_collection.json` (format v2.1). L'environnement `TravelHub-local` est dans `postman/TravelHub.postman_environment.json` et contient `base_url`, `access`, `refresh`, `trip_id` et `destination_id`. L'autorisation *Bearer* `{{access}}` est définie sur la collection et chaque requête en hérite.

L'environnement `TravelHub-prod` (`postman/TravelHub-prod.postman_environment.json`) a les mêmes variables, avec l'API Render comme `base_url`. Il ne contient aucun secret, car le script de connexion remplit `access` et `refresh` pendant l'exécution. Une exécution complète crée deux comptes de test et un voyage dans la base Neon. Le dossier « Nettoyage » supprime le voyage, mais les comptes restent. Pour un simple contrôle, nous lançons donc seulement quelques requêtes, par exemple `postman collection run postman/TravelHub.postman_collection.json -e postman/TravelHub-prod.postman_environment.json -i "401 — sans jeton"`.

1. Dans Postman, cliquer sur *Import*, choisir les deux fichiers et sélectionner l'environnement « TravelHub-local ».
2. Lancer le serveur avec `python manage.py runserver`.
3. Sur la collection, cliquer sur *Run collection* puis sur *Run TravelHub API*.

| Dossier | Contenu |
| --- | --- |
| Auth | Inscription d'Alice et de Bob, connexion (le script *Tests* de `/api/auth/token/` garde `access` et `refresh` dans l'environnement), rotation, profil, déconnexion |
| Trips | CRUD (garde `trip_id`), `my_role` et `cover_image_url` à la création, recherche, filtre par statut, tri, statistiques, duplication |
| Destinations, Activities | CRUD (garde `destination_id`), filtres dont la catégorie, statistiques après ajout |
| Participants | Bob lecteur (403 en écriture), puis éditeur (403 pour supprimer le voyage ou ajouter un participant), puis retiré (404) |
| Externes | Météo, pays et vue d'ensemble. Sans Internet, on accepte 502, 503 ou 504 |
| GraphQL | `me`, `myTrips`, `trip`, mutations, `destinationOverview` |
| Cas d'erreur | 401 (sans jeton, jeton invalide, refresh réutilisé ou révoqué), 400 (dates, titre vide, budget et coût négatifs, image de couverture en http, ordre en double…), 404 (accès de Bob, ville et code pays inconnus), 405, 415, affectation de masse, erreurs GraphQL (voyage tiers, sans jeton, validation, profondeur) |
| Nettoyage | Suppression du voyage créé pendant l'exécution |

Chaque exécution crée deux comptes uniques et utilise des dates calculées à partir du jour même. On peut donc la relancer sans rien changer. Elle envoie une dizaine de requêtes anonymes. Avec la limite par défaut de 100/h, il faut augmenter `THROTTLE_ANON_RATE` dans `.env` si on veut faire plus d'une dizaine d'exécutions par heure. En dehors du Runner, le script de la collection rafraîchit `access` dès qu'il expire.

En ligne de commande, avec Postman CLI ou Newman :

```powershell
postman collection run postman/TravelHub.postman_collection.json -e postman/TravelHub.postman_environment.json
npx newman run postman/TravelHub.postman_collection.json -e postman/TravelHub.postman_environment.json
```
