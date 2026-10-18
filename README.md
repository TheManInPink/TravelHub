# TravelHub

Back-end Django de planification et de gestion de voyages (TP1) : API REST (Django REST Framework), API GraphQL (Graphene-Django), PostgreSQL, intégration d'Open-Meteo et de Countries GraphQL.

## Prérequis

| Outil | Version |
| --- | --- |
| Python | 3.14 (`C:\Python314\python.exe`) |
| PostgreSQL | 18 (service `postgresql-x64-18`) |
| pgAdmin | 4 |
| Git | 2.x |

Sur ce poste, la commande `py` lance Python 3.15 par défaut : créez l'environnement virtuel avec Python 3.14 explicitement.

## Installation (PowerShell)

```powershell
git clone <url-du-depot> TravelHub
cd TravelHub
C:\Python314\python.exe -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements-dev.txt

Copy-Item .env.example .env      # puis remplacer SECRET_KEY et le mot de passe de DATABASE_URL
.\scripts\db\create_database.ps1 # crée le rôle et la base décrits par DATABASE_URL
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Générer une clé secrète :

```powershell
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Créer la base avec pgAdmin plutôt qu'avec le script

Dans pgAdmin, ouvrez *Query Tool* sur le serveur PostgreSQL 18 et exécutez, avec le mot de passe de votre `.env` :

```sql
CREATE ROLE travelhub LOGIN CREATEDB PASSWORD 'mot-de-passe-du-.env';
CREATE DATABASE travelhub OWNER travelhub ENCODING 'UTF8';
```

Le droit `CREATEDB` permet à pytest de créer la base `test_travelhub`.

### Mot de passe `postgres` oublié

Dans un PowerShell ouvert **en tant qu'administrateur**, à la racine du projet :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\db\reset_postgres_password.ps1
```

Le script sauvegarde `pg_hba.conf`, autorise temporairement les connexions locales sans mot de passe, définit le nouveau mot de passe, restaure toujours la configuration d'origine, puis crée le rôle et la base de TravelHub.

## Données de démonstration

```powershell
python manage.py seed_demo                         # 3 utilisateurs, 4 voyages, destinations et activités
python manage.py seed_demo --reset                 # supprime puis recrée les données de démo
python manage.py seed_demo --reset --password "…"  # comptes de démo avec un mot de passe
```

La commande est idempotente : la relancer ne crée pas de doublons. Les comptes de démo (`alice`, `mamadou`, `yuki`) ont un courriel en `@demo.travelhub.example` ; `--reset` ne supprime que ces comptes et leurs voyages. Sans `--password` ni variable `DEMO_PASSWORD`, ils ne peuvent pas se connecter. Les dates sont relatives au jour de l'exécution : un voyage terminé, un en cours, un planifié et un brouillon, à Montréal, Paris, Tokyo et Dakar. Pour les consulter, connectez-vous à `/admin/` avec le superutilisateur.

## Paramètres

| Module | Usage |
| --- | --- |
| `config.settings.dev` | Développement (`manage.py` par défaut) |
| `config.settings.test` | Tests (`pytest.ini`) |
| `config.settings.prod` | Production (`wsgi.py`, `asgi.py`) ; vérifier avec `python manage.py check --deploy --settings=config.settings.prod` |

Variables d'environnement (voir `.env.example`) : `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, et facultativement `THROTTLE_ANON_RATE` (défaut `100/hour`) et `THROTTLE_USER_RATE` (défaut `1000/hour`).

## API REST

Documentation interactive : `/api/docs/` (Swagger UI), `/api/redoc/` (ReDoc), schéma OpenAPI brut : `/api/schema/`.

| Méthode | Chemin | Rôle |
| --- | --- | --- |
| POST | `/api/auth/register/` | Inscription ; renvoie l'utilisateur et une paire de jetons |
| POST | `/api/auth/token/` | Connexion (`username`, `password`) ; jeton d'accès 15 min, de rafraîchissement 1 jour |
| POST | `/api/auth/token/refresh/` | Nouveau jeton d'accès ; rotation : l'ancien refresh est mis sur liste noire |
| POST | `/api/auth/logout/` | Met le refresh fourni sur liste noire (authentifié, son propre jeton seulement) |
| GET | `/api/auth/me/` | Profil de l'utilisateur connecté |
| GET, POST | `/api/trips/` | Mes voyages (paginés par 20), création |
| GET, PUT, PATCH, DELETE | `/api/trips/{id}/` | Détail avec destinations et activités, modification, suppression |

Tout est authentifié par défaut (`Authorization: Bearer <access>`). Dans Swagger : `POST /api/auth/token/` → *Try it out*, copier `access`, bouton **Authorize**, coller le jeton (sans `Bearer`).

Accès aux voyages :

| Utilisateur | Lire | Modifier | Supprimer |
| --- | --- | --- | --- |
| Propriétaire | 200 | 200 | 204 |
| Éditeur | 200 | 200 | 403 |
| Lecteur | 200 | 403 | 403 |
| Non participant | 404 | 404 | 404 |

Un non-participant reçoit 404 et non 403 : l'API ne révèle pas l'existence des voyages des autres.

Paramètres de liste : `status`, `start_date__gte`, `end_date__lte`, `title__icontains`, `search` (titre et description), `ordering` (`start_date`, `title`, `created_at`, préfixe `-` pour décroissant), `page`.

## Structure

```text
config/            projet Django (settings découpés, urls, wsgi, asgi)
apps/core/         éléments communs (TimeStampedModel, permissions, exceptions)
apps/accounts/     utilisateur personnalisé, authentification
apps/trips/        voyages et participants
apps/itinerary/    destinations et activités
apps/integrations/ services Open-Meteo et Countries GraphQL
scripts/db/        création, sauvegarde et restauration de la base
```

## Qualité

```powershell
pytest                       # tests
pytest --cov=apps --cov-report=html
ruff check .                 # analyse statique
ruff format .                # formatage
```
