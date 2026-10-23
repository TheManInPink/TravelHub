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

## Docker

Prérequis : Docker Desktop (Compose v2.23 ou plus récent). Le fichier `.env` sert aussi à Compose : ajoutez-y `POSTGRES_PASSWORD` et `PGADMIN_DEFAULT_PASSWORD` (voir `.env.example`).

```powershell
docker compose up --build        # web (Gunicorn), db (PostgreSQL 18), pgadmin
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py seed_demo
docker compose down              # arrête ; --volumes efface aussi la base
```

| Service | Adresse | Rôle |
| --- | --- | --- |
| `web` | http://localhost:8000/api/docs/ | Image du `Dockerfile`, paramètres `config.settings.prod` ; applique les migrations à chaque démarrage |
| `db` | `db:5432`, réseau interne seulement | `postgres:18`, données dans le volume `postgres-data`, contrôle `pg_isready` |
| `pgadmin` | http://localhost:5050 | Connexion avec `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD` ; le serveur « TravelHub (Docker) » est déjà déclaré |

Le `Dockerfile` construit les dépendances dans une première étape (`python:3.14-slim`), puis copie l'environnement virtuel dans l'image finale. Il exécute `collectstatic` (fichiers servis par WhiteNoise) et lance Gunicorn (`gunicorn.conf.py`, `WEB_CONCURRENCY` processus) sous un utilisateur non root. Son `HEALTHCHECK` interroge `/admin/login/`. Le service `web` remplace `DATABASE_URL` par l'hôte `db` et désactive la redirection HTTPS et HSTS pour l'accès local en HTTP. En production, derrière un proxy HTTPS, on garde les valeurs par défaut.

## Intégration continue

`.github/workflows/ci.yml`, à chaque push sur `master` et à chaque pull request :

- **Lint et tests** : service PostgreSQL 18, cache pip, `ruff check`, `ruff format --check`, puis `pytest --cov-fail-under=80`. Le résumé de couverture s'affiche dans la page de l'exécution, et `coverage.xml` et `htmlcov/` sont publiés comme artefact `coverage`.
- **Image Docker** : construction de l'image (cache GitHub Actions), puis `docker compose up --wait web` et vérification de `/api/docs/` et `/api/schema/`.

Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour pip et GitHub Actions.

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
| `config.settings.prod` | Production (`wsgi.py`, `asgi.py`, image Docker) ; vérifier avec `python manage.py check --deploy --settings=config.settings.prod` |

Variables d'environnement (voir `.env.example`) : `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, et facultativement `THROTTLE_ANON_RATE` (défaut `100/hour`) et `THROTTLE_USER_RATE` (défaut `1000/hour`). En production seulement : `CSRF_TRUSTED_ORIGINS`, `SECURE_SSL_REDIRECT` (défaut `True`), `SECURE_HSTS_SECONDS` (défaut 30 jours) et `DJANGO_LOG_LEVEL` (défaut `INFO`).

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
| GET | `/api/trips/{id}/stats/` | Coût total, budget restant, coût moyen ; nombre, somme et moyenne par catégorie |
| POST | `/api/trips/{id}/clone/` | Copie (brouillon) du voyage, de ses destinations et activités, en une transaction |
| GET, POST | `/api/trips/{id}/participants/` | Participants ; ajout par courriel (`email`, `role` editor ou viewer) |
| PATCH, DELETE | `/api/trips/{id}/participants/{user_id}/` | Changement de rôle (`owner` transfère la propriété), retrait |
| GET, POST | `/api/destinations/` | Destinations de mes voyages, création (`trip` dans le corps) |
| GET, PUT, PATCH, DELETE | `/api/destinations/{id}/` | Détail, modification, suppression |
| GET | `/api/destinations/{id}/weather/` | Météo actuelle et prévisions du séjour (Open-Meteo) |
| GET | `/api/destinations/{id}/country/` | Pays de la destination (Countries GraphQL) |
| GET | `/api/destinations/{id}/overview/` | Destination, voyage, activités, coût total, météo et pays ; dégradation partielle |
| GET, POST | `/api/activities/` | Activités de mes voyages, création (`destination` dans le corps) |
| GET, PUT, PATCH, DELETE | `/api/activities/{id}/` | Détail, modification, suppression |

Tout est authentifié par défaut (`Authorization: Bearer <access>`). Dans Swagger : `POST /api/auth/token/` → *Try it out*, copier `access`, bouton **Authorize**, coller le jeton (sans `Bearer`).

Accès aux voyages :

| Utilisateur | Lire | Modifier | Supprimer |
| --- | --- | --- | --- |
| Propriétaire | 200 | 200 | 204 |
| Éditeur | 200 | 200 | 403 |
| Lecteur | 200 | 403 | 403 |
| Non participant | 404 | 404 | 404 |

Un non-participant reçoit 404 et non 403 : l'API ne révèle pas l'existence des voyages des autres.

Les destinations et activités suivent les droits de leur voyage : lecture pour tout participant, création, modification et suppression pour le propriétaire et les éditeurs. À la création, un voyage (ou une destination) parent visible sans droit d'écriture donne 403, un parent inconnu ou invisible donne 404.

Actions sur un voyage :

| Action | Propriétaire | Éditeur | Lecteur | Non participant |
| --- | --- | --- | --- | --- |
| `stats`, `clone`, liste des participants | 200 / 201 | 200 / 201 | 200 / 201 | 404 |
| Ajout, changement de rôle, retrait d'un participant | 201 / 200 / 204 | 403 | 403 | 404 |

Le propriétaire ne peut être ni retiré ni rétrogradé (400) : il transfère d'abord la propriété en donnant le rôle `owner` à un autre participant, et devient alors éditeur.

### Météo (Open-Meteo)

`GET /api/destinations/{id}/weather/` est ouvert à tout participant du voyage. La réponse contient les conditions actuelles (`temperature`, `wind_speed`, `precipitation`, `weather_code`) et, pour chaque jour du séjour compris dans les 16 jours de prévision, `temperature_max`, `temperature_min`, `precipitation_sum`, `wind_speed_max` et `weather_code`. Chaque code météo WMO est accompagné d'une `description` en français. Unités : °C, km/h, mm ; heures locales de la destination (`timezone`).

- Une destination sans coordonnées est d'abord géocodée (ville et code pays). Ses `latitude` et `longitude` sont alors enregistrées et réutilisées aux appels suivants. Changer la ville ou le code pays sans fournir de nouvelles coordonnées les efface.
- Cache Django : géocodage 7 jours, prévisions 30 minutes, par position arrondie à 4 décimales.
- Chaque requête vers Open-Meteo a un délai de 5 s et deux essais. Le second essai n'a lieu qu'après une erreur réseau, un délai dépassé ou une réponse 5xx.
- Erreurs : `location_not_found` (404, ville inconnue), `no_data_available` (404, séjour entièrement hors des 16 jours), `external_service_unavailable` (503, service injoignable, en erreur ou réponse illisible), `external_service_timeout` (504).

Le service (`apps/integrations/services/open_meteo.py`) renvoie des dataclasses. Ses exceptions (`apps/integrations/exceptions.py`) ne dépendent pas de DRF, ce qui permettra de les réutiliser dans l'API GraphQL.

### Pays (Countries GraphQL)

`GET /api/destinations/{id}/country/` est ouvert à tout participant. La réponse décrit le pays du `country_code` de la destination : `code`, `name`, `native`, `capital`, `emoji` (drapeau), `currency` (tel que fourni, par exemple `USD,USN,USS`), `currencies` (la même chose en liste), `continent` et `languages` (`name`, `native`). Countries GraphQL fournit les noms en anglais.

- Requête GraphQL paramétrée envoyée par POST à `https://countries.trevorblades.com/graphql` : le code pays passe dans `variables`, jamais dans le texte de la requête.
- Cache Django : 24 heures. Même délai et mêmes essais qu'Open-Meteo (`apps/integrations/services/http.py`).
- Erreurs : `country_not_found` (404, `country` vaut `null` pour ce code), `external_service_unavailable` (503 : service injoignable, 5xx, liste `errors` GraphQL non vide, réponse illisible), `external_service_timeout` (504).

### Vue d'ensemble d'une destination

`GET /api/destinations/{id}/overview/` réunit en une réponse `destination`, `trip`, `activities`, `activity_count` et `total_cost` (base de données), `weather` (comme `/weather/`) et `country` (comme `/country/`). Open-Meteo et Countries GraphQL sont interrogés en parallèle (`ThreadPoolExecutor`) pendant la lecture de la base ; les fils secondaires n'exécutent aucune requête SQL.

Dégradation partielle : une source en échec ne fait pas échouer la réponse, qui reste un 200. Son bloc vaut `null` et `warnings` en donne la raison :

```json
"weather": null,
"warnings": [
  {"source": "weather", "code": "external_service_unavailable",
   "message": "Open-Meteo est momentanément indisponible (erreur 503)."}
]
```

Un séjour hors des 16 jours de prévision donne ainsi un avertissement `no_data_available` plutôt qu'un 404. L'agrégateur est dans `apps/integrations/services/aggregator.py`.

Paramètres de liste :

| Ressource | Filtres | `ordering` |
| --- | --- | --- |
| `/api/trips/` | `status`, `start_date__gte`, `end_date__lte`, `title__icontains`, `search` (titre, description) | `start_date` (défaut), `title`, `created_at` |
| `/api/destinations/` | `trip`, `country_code`, `arrival_date__gte`, `departure_date__lte`, `search` (ville, pays) | `order` (défaut, par voyage), `arrival_date`, `city` |
| `/api/activities/` | `trip`, `destination`, `category`, `date`, `date__gte`, `date__lte`, `search` (nom, description) | `cost`, `date`, `name` ; chronologique par défaut |

Préfixe `-` pour l'ordre décroissant ; `page` pour la pagination.

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

`code` vaut notamment `validation_error`, `integrity_error`, `not_authenticated`, `token_not_valid`, `permission_denied`, `not_found`, `throttled`, ou pour les services externes `location_not_found`, `country_not_found`, `no_data_available`, `external_service_unavailable` et `external_service_timeout`. `details` contient les erreurs par champ (`non_field_errors` pour les erreurs globales), un objet vide sinon. Le gestionnaire (`apps/core/exceptions.py`) convertit aussi en 400 les `ValidationError` de Django levées par les services et les `IntegrityError` ; dans ce dernier cas, le message est celui de la contrainte PostgreSQL violée.

## API GraphQL

Point d'entrée unique : `POST /graphql/` (Graphene-Django). En développement, ouvrir `http://localhost:8000/graphql/` dans le navigateur affiche GraphiQL : obtenir un jeton avec `POST /api/auth/token/`, puis, dans l'onglet *Headers* :

```json
{"Authorization": "Bearer <access>"}
```

| Racine | Champs |
| --- | --- |
| Query | `me`, `myTrips(status, startAfter, search, orderBy, limit, offset)`, `myTripsCount(status, startAfter, search)`, `trip(id)`, `destination(id)`, `destinationOverview(id)` |
| Mutation | `createTrip`, `updateTrip`, `deleteTrip`, `cloneTrip`, `addParticipant`, `removeParticipant`, `createDestination`, `updateDestination`, `deleteDestination`, `createActivity`, `updateActivity`, `deleteActivity` |

- Un `schema.py` par application (`accounts`, `trips`, `itinerary`, `integrations`), assemblés dans `config/schema.py`.
- Mêmes règles que l'API REST : tout resolver part de `Trip.objects.visible_to(user)`, les mutations réutilisent les serializers DRF (donc `Model.clean()` et les contraintes) et les services (`create_trip`, `clone_trip`, `add_participant`…), et les permissions objet de `apps/core/permissions.py`. Chaque mutation s'exécute dans une transaction.
- `Destination.weather` et `Destination.countryInfo` appellent Open-Meteo et Countries GraphQL seulement si on les demande ; un échec ne vide que ce champ. `destinationOverview` garde la dégradation partielle de l'API REST (`warnings`).
- `myTrips` est paginé comme l'API REST : `limit` vaut 20 par défaut (100 au plus), `offset` saute des voyages, et `myTripsCount` donne le total avec les mêmes filtres.
- `myTrips` et `trip` ne préchargent destinations, activités et participants que s'ils sont demandés : le nombre de requêtes SQL ne dépend pas du nombre de voyages.
- Le courriel d'un utilisateur n'est visible que par lui-même ; ni mot de passe ni droits d'administration ne sont exposés.

Authentification (`apps/core/views.py`, `TravelHubGraphQLView`) : le jeton JWT est vérifié par le `JWTAuthentication` de SimpleJWT. Sans en-tête, la requête est anonyme et chaque champ répond `not_authenticated`. Un jeton invalide ou expiré donne un 401. Le cookie de session n'est jamais pris en compte, ce qui permet d'exempter la vue de CSRF.

Limites de requêtes : les mêmes que l'API REST (`THROTTLE_ANON_RATE`, `THROTTLE_USER_RATE`), avec les mêmes compteurs. Un utilisateur dispose donc d'un seul quota pour REST et GraphQL. Au-delà, la réponse est un 429 avec l'en-tête `Retry-After` et une erreur `throttled`.

Les erreurs gardent le code et les détails de l'erreur REST équivalente, dans `extensions` (noms de champs en camelCase) :

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

Codes : ceux de l'API REST (`not_authenticated`, `token_not_valid`, `throttled`, `permission_denied`, `not_found`, `validation_error`, `integrity_error`, codes des services externes), plus `internal_error` pour une erreur inattendue, dont le message n'est pas divulgué. Un non-participant reçoit `not_found`, un lecteur qui tente une modification `permission_denied`. Les erreurs de syntaxe, de type ou de profondeur donnent un 400.

Durcissement (paramètres `GRAPHQL_*`, relus à chaque requête) :

| Paramètre | Développement | Production, tests |
| --- | --- | --- |
| `GRAPHQL_GRAPHIQL` | activé | désactivé |
| `GRAPHQL_INTROSPECTION` | activée | désactivée (`__schema`, `__type` ; `__typename` reste permis) |
| `GRAPHQL_MAX_DEPTH` | 6 | 6 |

## Structure

```text
config/            projet Django (settings découpés, urls, schéma GraphQL, wsgi, asgi)
apps/core/         éléments communs (TimeStampedModel, permissions, exceptions, vue GraphQL)
apps/accounts/     utilisateur personnalisé, authentification
apps/trips/        voyages et participants
apps/itinerary/    destinations et activités
apps/integrations/ services Open-Meteo et Countries GraphQL
scripts/db/        création, sauvegarde et restauration de la base
.github/           CI (workflows/ci.yml) et Dependabot
postman/           collection Postman v2.1 et environnement local
```

## Sécurité (OWASP API Security Top 10, 2023)

| Risque | Mesures | Tests |
| --- | --- | --- |
| API1 Broken Object Level Authorization | Chaque vue, resolver et filtre part de `Trip.objects.visible_to(user)`. Un non-participant reçoit 404, jamais 403. Les filtres `?trip=` / `?destination=` sont des `NumberFilter`, sans oracle d'existence. Un parent (`trip`, `destination`) est cherché parmi les objets visibles. | `apps/core/tests/test_object_level_authorization.py` : matrice A/B sur chaque point d'accès REST et chaque opération GraphQL (non-participant, lecteur, anonyme), base inchangée après un refus |
| API2 Broken Authentication | JWT d'accès de 15 min. Rotation du refresh avec liste noire, déconnexion limitée à son propre jeton, validateurs de mot de passe. Les cookies de session ne sont jamais acceptés par `/graphql/`. | `test_security.py` (jeton falsifié, non signé, expiré, refresh utilisé comme accès), `apps/accounts/tests/` |
| API3 Broken Object Property Level Authorization | Liste blanche de champs modifiables. `owner`, `id`, horodatages et totaux en lecture seule. Ni `is_staff` ni groupes à l'inscription. Le rôle `owner` ne s'attribue pas par invitation. GraphQL : aucun champ de mot de passe ou de droits, et le courriel n'est visible que par son titulaire. | `test_mass_assignment.py` |
| API4 Unrestricted Resource Consumption | Limites de 100 requêtes/h en anonyme et 1000/h par utilisateur, avec un quota partagé entre REST et GraphQL. Pagination par 20 (GraphQL : 100 au plus). Profondeur GraphQL limitée à 6. Services externes : délai de 5 s, deux essais, cache. | `test_auth_api.py`, `test_graphql_view.py` |
| API5 Broken Function Level Authorization | Permissions par rôle (`IsTripMember`, `IsTripEditor`, `IsTripOwner`) : un lecteur reçoit 403 sur toute écriture, et seul le propriétaire gère les participants. | matrice « lecteur » de `test_object_level_authorization.py`, `test_permissions.py` |
| API6 Unrestricted Access to Sensitive Business Flows | L'inscription et la connexion sont soumises à la limite anonyme ; la duplication de voyages à la limite par utilisateur. | `test_auth_api.py` |
| API7 Server Side Request Forgery | Les URL d'Open-Meteo et de Countries sont des constantes. La ville part en paramètre de requête ; le code pays (`^[A-Z]{2}$`) en variable GraphQL, jamais concaténé. | `apps/integrations/tests/` |
| API8 Security Misconfiguration | `check --deploy` sans avertissement. HSTS, redirection HTTPS, cookies `Secure`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` et COOP. CORS limité à `CORS_ALLOWED_ORIGINS`, sans identifiants. En production : JSON seulement (pas d'API navigable), GraphiQL et introspection désactivés, et des 404/500 en JSON sans trace de pile, l'erreur étant journalisée sur la console. | `test_security.py`, `test_input_validation.py` |
| API9 Improper Inventory Management | Une seule version de l'API, entièrement décrite par OpenAPI (`/api/docs/`) et par la collection Postman. | `test_api_docs.py` |
| API10 Unsafe Consumption of APIs | Réponses externes validées puis converties en dataclasses ; une réponse illisible devient une 503 et un délai dépassé une 504. Seules les réponses exploitables sont mises en cache. | `test_open_meteo.py`, `test_countries.py`, `test_destination_overview.py` |

Validation des entrées (`test_input_validation.py`) : dates incohérentes ou hors du voyage et du séjour, montants négatifs ou trop précis, longueurs, choix inconnus, codes pays, coordonnées, filtres et pages invalides, JSON mal formé (400), type de contenu (415). Une donnée refusée n'écrit jamais rien en base.

Risques résiduels acceptés :

- l'inscription et l'ajout d'un participant indiquent si un courriel est inscrit (énumération possible, limitée par le throttling) ;
- GraphQL limite la profondeur des requêtes, pas leur largeur (alias multiples) ; le throttling compte les requêtes HTTP ;
- la documentation OpenAPI reste publique en production, alors que l'introspection GraphQL y est fermée.

## Tests et qualité

```powershell
pytest                          # tests + couverture (terminal et htmlcov/index.html)
pytest --cov-fail-under=80      # échoue si la couverture totale passe sous 80 %
pytest -m "not slow"            # sans le test qui lance check --deploy dans un sous-processus
pytest apps/trips --no-cov      # un sous-ensemble, sans mesure de couverture
ruff check .                    # analyse statique
ruff format .                   # formatage
python manage.py check --deploy --settings=config.settings.prod
```

La couverture (`.coveragerc`) mesure les branches de `apps/` et `config/`, sans les tests ni les migrations. Rapport HTML : `htmlcov/index.html`.

Fixtures communes (`conftest.py`) :

- `api_client` (anonyme), `client_for(user)` ;
- `user_a`, `user_b`, `trip_a`, `destination_a`, `activity_a`, `trip_b`… et les clients authentifiés `client_a` et `client_b`, pour les accès croisés ;
- fabriques `make_user`, `make_trip`, `make_destination`, `make_activity` : objets valides, n'importe quel champ peut être remplacé ;
- `graphql(query, variables, user=…)` pour envoyer une requête GraphQL avec un vrai jeton ;
- `mock_http`, qui intercepte Open-Meteo et Countries : aucun test ne sort sur le réseau.

### Collection Postman

`postman/TravelHub.postman_collection.json` (format v2.1) et l'environnement `postman/TravelHub.postman_environment.json` (`base_url`, `access`, `refresh`).

1. Dans Postman : *Import*, choisir les deux fichiers, puis sélectionner l'environnement « TravelHub — local ».
2. Lancer le serveur : `python manage.py runserver`.
3. Sur la collection : *Run collection*, puis *Run TravelHub API*.

| Dossier | Contenu |
| --- | --- |
| Auth | Inscription d'Alice et de Bob, connexion (stocke `access` et `refresh` dans l'environnement), rotation, profil, déconnexion |
| Trips | CRUD, recherche et filtres, statistiques, duplication |
| Destinations, Activities | CRUD, filtres, statistiques après ajout |
| Participants | Bob lecteur (403 en écriture), éditeur, puis retiré (404) |
| Externes | Météo, pays, vue d'ensemble ; 503 ou 504 acceptés sans Internet |
| GraphQL | `me`, `myTrips`, `trip`, mutations, `destinationOverview` |
| Cas d'erreur | 400, 401, 403, 404, 405, 415, affectation de masse, erreurs GraphQL, profondeur maximale |
| Nettoyage | Suppression du voyage de l'exécution |

Chaque exécution crée deux comptes uniques et des dates relatives au jour même. Elle peut donc être relancée telle quelle. Elle envoie une dizaine de requêtes anonymes : avec la limite par défaut de 100/h, relevez `THROTTLE_ANON_RATE` dans `.env` pour enchaîner plus d'une dizaine d'exécutions par heure. Hors du Runner, le script de la collection rafraîchit `access` dès qu'il expire.

En ligne de commande : `npx newman run postman/TravelHub.postman_collection.json -e postman/TravelHub.postman_environment.json`.
