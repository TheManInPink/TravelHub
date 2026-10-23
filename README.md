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
```

## Qualité

```powershell
pytest                       # tests
pytest --cov=apps --cov-report=html
ruff check .                 # analyse statique
ruff format .                # formatage
```
