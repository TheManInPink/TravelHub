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

## Paramètres

| Module | Usage |
| --- | --- |
| `config.settings.dev` | Développement (`manage.py` par défaut) |
| `config.settings.test` | Tests (`pytest.ini`) |
| `config.settings.prod` | Production (`wsgi.py`, `asgi.py`) ; vérifier avec `python manage.py check --deploy --settings=config.settings.prod` |

Variables d'environnement (voir `.env.example`) : `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`.

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
