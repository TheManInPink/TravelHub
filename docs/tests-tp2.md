# Tests et qualité du front-end (TP2, étape 12)

Ce document résume les tests du front-end Next.js et nos contrôles de qualité. Il sert de source à la section « Tests » du rapport. Les chiffres datent du 24 novembre 2026, sur la branche `frontend/tests`.

## 1. Lancer les tests

Depuis `frontend/` :

```powershell
npm test               # Vitest, tous les tests
npm run test:coverage  # les mêmes tests, avec la couverture (dossier coverage/, ignoré par Git)
npm run lint           # ESLint, qui échoue dès le premier avertissement
npm run format:check   # format Prettier (npm run format corrige)
npm run typecheck      # next typegen, puis TypeScript 7
npm run build          # puis, avec Django démarré :
npm run test:e2e       # parcours Playwright de bout en bout (section 9)
```

Le job « Front-end » de la CI (`.github/workflows/ci.yml`) lance le lint, le format, le typecheck, les tests Vitest et le build à chaque pull request. Le job « Parcours E2E (Playwright) » lance le parcours de bout en bout contre un vrai Django.

Résultat : 70 fichiers de test Vitest et 514 tests, tous verts, plus le parcours Playwright.

Les tests Vitest n'appellent jamais le vrai Django ni le vrai Supabase. MSW intercepte `fetch` et joue l'API REST, l'API GraphQL (`/graphql/`) et Supabase Storage. Dans les tests de composants, les Server Actions sont remplacées par des fonctions simulées (`vi.mock`), et `next/navigation` par un faux routeur. `tests/setup.ts` simule aussi `cookies()` et `headers()` de `next/headers`.

## 2. Les cinq tests exigés

| Type exigé | Fichier | Nom du test |
| --- | --- | --- |
| Rendu d'un composant | `tests/components/trips/TripCard.test.tsx` | affiche le titre, les dates, le statut en français et le coût total |
| Interaction | `tests/components/trips/TripFilters.test.tsx` | met le statut choisi dans l'URL, garde la recherche et le tri, et revient à la page 1 |
| Interaction | `tests/components/feedback/ConfirmDialog.test.tsx` | s'ouvre au clic sur Supprimer, appelle onConfirm une seule fois, puis se ferme |
| Appel d'API simulé (REST) | `tests/lib/api/trips.test.ts` | lit une page de voyages |
| Appel d'API simulé (GraphQL) | `tests/lib/api/itinerary.test.ts` | createActivity envoie les variables de la mutation et renvoie l'activité créée |
| Cas d'erreur | `tests/components/enrichment/WeatherPanel.test.tsx` | affiche l'erreur d'une 503, puis les prévisions après Réessayer |
| Cas d'erreur | `tests/lib/api/django.test.ts` | transforme une 404 de Django en ApiError not_found, avec un message français |
| Validation d'un formulaire | `tests/components/trips/TripForm.test.tsx` | bloque une date de fin antérieure au début et affiche le message sous la date de fin |

Dans le test de `TripFilters`, `useRouter` est simulé. Le test ouvre le menu « Statut » au clavier (Flèche bas), choisit « Planifié » avec Entrée, puis vérifie l'adresse passée à `router.replace`. Le test de `TripForm` vérifie aussi que le message est relié au champ (`aria-describedby`) et que la Server Action n'est pas appelée.

## 3. Cas limites

| Cas | Tests | Ce que nous vérifions |
| --- | --- | --- |
| Budget négatif | `validation/trip.test.ts` (refuse le budget -10) et `TripForm.test.tsx` (refuse un budget négatif sous le champ Budget, sans appeler l'action) | Le message « Le budget ne peut pas être négatif. » s'affiche sous le champ, et rien n'est envoyé |
| Code pays de 3 lettres | `validation/destination.test.ts` (refuse un code pays qui n'a pas exactement deux lettres), `DestinationForm.test.tsx` (s'arrête à deux lettres dans le code du pays) et `actions/destinations.test.ts` (refuse un code pays de trois lettres sans envoyer la mutation) | Le champ bloque la troisième lettre. Un appel forgé à la Server Action est refusé, sans mutation GraphQL |
| Session expirée pendant une action | `actions/trips.test.ts`, `actions/destinations.test.ts`, `actions/activities.test.ts` et `actions/upload.test.ts` | Django répond 401. L'action supprime les cookies et redirige vers `/login?expired=1&next=…` |
| Image trop lourde | `validation/image.test.ts` (4 Mo tout juste, puis un octet de plus, puis 6 Mo), `ImageUploader.test.tsx` (refuse un fichier de 6 Mo sans appeler l'action), `actions/upload.test.ts` (refuse une image de 6 Mo avant l'envoi) et `next.config.test.ts` (Server Actions de 5 Mo) | L'image est refusée dans le navigateur, puis encore dans la Server Action, avant tout envoi à Supabase |

## 4. Tableau test → exigence

Les références EF viennent du cahier des charges (`docs/plan-tp2.md`, section 3). Les chemins sont relatifs à `frontend/tests/`.

| Exigence | Fichiers de test | Ce que nous vérifions |
| --- | --- | --- |
| EF-01 Application Next.js | `lib/site.test.ts`, `lib/api/django.test.ts` (DJANGO_API_URL), `next.config.test.ts`, `lib/server-only.test.ts` | Les adresses lues dans l'environnement sont vérifiées. La configuration de Next.js accepte les images de Supabase, des Server Actions de 5 Mo et ajoute les en-têtes de sécurité |
| EF-02 Interface en composants | Les 32 fichiers de `components/`, `a11y/labels.test.tsx` | Chaque composant affiche les données reçues en props. Les formulaires ont tous leurs libellés |
| EF-03 Routage et navigation | `components/layout/` (Breadcrumbs, MobileNav, navItems, PageHeader), `components/trips/TripPagination.test.tsx`, `lib/tripList.test.ts`, `app/page.test.tsx` | Fil d'Ariane, lien actif, menu mobile, liens de pagination et adresses des filtres. La page d'accueil mène à la connexion et à l'inscription |
| EF-04 Tableau de bord | `lib/api/dashboard.test.ts`, `components/dashboard/` (DashboardView, StatsCards) | Voyage en cours, prochains voyages, compteurs et budget restant du prochain voyage |
| EF-04, EF-05 Formats | `lib/format.test.ts`, `lib/dates.test.ts`, `lib/decimal.test.ts` | Montants et dates en fr-CA, fuseau de Toronto, calculs décimaux sans nombre flottant |
| EF-05 Gestion des voyages | `components/trips/` (TripCard, TripFilters, TripForm, TripPagination, TripDetailView, DeleteTripButton), `actions/trips.test.ts`, `lib/api/tripPage.test.ts`, `lib/validation/trip.test.ts` | Liste, filtres dans l'URL, création, modification, suppression avec confirmation, boutons selon le rôle, erreurs 400, 403, 404 et 429 |
| EF-06 Destinations et activités | `components/destinations/`, `components/activities/`, `actions/destinations.test.ts`, `actions/activities.test.ts`, `lib/api/destinationPage.test.ts`, `lib/validation/destination.test.ts`, `lib/validation/activity.test.ts` | Itinéraire ordonné, activités groupées par jour, formulaires bornés aux dates du voyage ou du séjour, mutations GraphQL, puis `revalidatePath` |
| EF-07 Informations enrichies | `components/enrichment/` (WeatherPanel, CountryCard), `app/api/destinations/weather.test.ts`, `lib/weather.test.ts`, `lib/country.test.ts` | Le navigateur appelle seulement le Route Handler de Next.js, jamais Open-Meteo. États chargement, vide, séjour terminé et erreur. Fiche pays en français |
| EF-08 API REST | `lib/api/django.test.ts`, `lib/api/trips.test.ts` | GET, POST, PATCH et DELETE, slash final, jeton Bearer lu dans le cookie, enveloppe d'erreur de Django, panne réseau et délai dépassé |
| EF-09 API GraphQL | `lib/api/graphql.test.ts`, `lib/api/itinerary.test.ts`, `lib/api/mappers.test.ts` | Query et mutations avec variables, `errors[]` traité, 401 et 429 sans `data`. Les documents sont validés contre `schema.graphql`. Enums et identifiants convertis entre REST et GraphQL |
| EF-10 Server et Client Components | `quality/clientComponents.test.ts`, `lib/server-only.test.ts` | Chaque fichier `"use client"` a sa raison. Aucune page n'est un Client Component, et aucun fichier client n'importe le code serveur |
| EF-11 Rendu et données | `actions/*.test.ts`, `app/api/destinations/weather.test.ts` | Chaque mutation rafraîchit les bonnes pages avec `revalidatePath`. La météo a un cache privé de 10 minutes, et ses erreurs ne sont pas gardées en cache |
| EF-12 États de l'interface | `components/feedback/` (EmptyState, ErrorState, RouteErrorFallback, FlashToast, ConfirmDialog), `WeatherPanel.test.tsx` | État vide, erreur avec Réessayer, code d'erreur de Next.js affiché, toast après une redirection |
| EF-13 Authentification | `proxy.test.ts`, `lib/auth/session.test.ts`, `lib/auth/redirect.test.ts`, `actions/auth.test.ts`, `app/api/auth/expire.test.ts`, `components/auth/`, `components/layout/UserMenu*.test.tsx` | Redirection vers `/login?next=…`, rafraîchissement du jeton dans le proxy, cookies httpOnly de 14 minutes et d'un jour, session expirée, adresse `next` sûre, déconnexion |
| EF-14 Validation et erreurs | `lib/validation/`, `lib/errors.test.ts`, tests des formulaires | Mêmes règles que Django, avant l'envoi et dans la Server Action. Message sous le bon champ. Message français pour 400, 401, 403, 404, 429, 5xx et panne réseau |
| EF-15 Supabase | `actions/upload.test.ts`, `lib/supabase/`, `lib/validation/image.test.ts`, `components/upload/`, `next.config.test.ts` | Rôle vérifié avant l'envoi, type et taille contrôlés deux fois, premiers octets du fichier, ancienne image supprimée, clé secrète lue seulement côté serveur |
| EF-16 Tests et qualité | Toute la suite, `quality/`, `a11y/` | `npm test` vert, lint et typecheck sans avertissement |
| Parcours complet (EF-03, EF-05, EF-06, EF-13) | `e2e/parcours.spec.ts` (Playwright, hors de `tests/`) | Dans un vrai navigateur, contre le vrai Django : inscription, déconnexion, page protégée, connexion, création d'un voyage, ajout d'une destination, suppression |
| Accessibilité (section 4) | `a11y/labels.test.tsx`, `ConfirmDialog.test.tsx`, `MobileNav.test.tsx`, `TripFilters.test.tsx`, tests des formulaires (`aria-describedby`, `aria-invalid`) | Libellés, noms des boutons, focus gardé dans les dialogues, menu utilisable au clavier |

## 5. Fichiers "use client"

Tout le reste est un Server Component. Le test `quality/clientComponents.test.ts` garde cette liste à jour. Un nouveau fichier `"use client"` le fait échouer tant que sa raison n'est pas écrite. Le même test vérifie qu'aucune page ni aucun layout n'est un Client Component, et qu'aucun fichier client n'importe `lib/api`, `lib/auth` ou `lib/supabase`.

| Fichier | Raison |
| --- | --- |
| `src/app/(app)/error.tsx` | Frontière d'erreur : Next.js impose un Client Component. |
| `src/app/error.tsx` | Frontière d'erreur : Next.js impose un Client Component. Elle attrape aussi les erreurs des layouts (app) et (auth). |
| `src/app/global-error.tsx` | Frontière d'erreur : Next.js impose un Client Component. Elle remplace tout le document si le layout racine échoue. |
| `src/components/activities/ActivityDialog.tsx` | État ouvert ou fermé du dialogue d'activité. |
| `src/components/activities/ActivityForm.tsx` | React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi. |
| `src/components/activities/DeleteActivityButton.tsx` | Passe une fonction onConfirm à ConfirmDialog et affiche un toast si l'action échoue. Une fonction ne peut pas venir d'un Server Component. |
| `src/components/auth/LoginForm.tsx` | React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi. Le bouton est désactivé pendant l'envoi. |
| `src/components/auth/RegisterForm.tsx` | React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi. Le bouton est désactivé pendant l'envoi. |
| `src/components/destinations/DeleteDestinationButton.tsx` | Passe une fonction onConfirm à ConfirmDialog et affiche un toast si l'action échoue. Une fonction ne peut pas venir d'un Server Component. |
| `src/components/destinations/DestinationForm.tsx` | React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi. |
| `src/components/enrichment/WeatherPanel.tsx` | Chargement de la météo dans le navigateur (CSR), état de la réponse et bouton Réessayer. |
| `src/components/feedback/ConfirmDialog.tsx` | État ouvert ou fermé du dialogue et état d'envoi de l'action (useTransition). |
| `src/components/feedback/ErrorState.tsx` | Le bouton Réessayer réagit au clic et appelle retry() ou router.refresh(). |
| `src/components/feedback/FlashToast.tsx` | Lit l'URL avec useSearchParams, affiche un toast Sonner et retire ?toast= avec history.replaceState. |
| `src/components/feedback/RouteErrorFallback.tsx` | Contenu des frontières d'erreur : useEffect écrit l'erreur dans la console du navigateur, et le bouton Réessayer appelle retry(). |
| `src/components/layout/LogoutMenuItem.tsx` | Réagit à la sélection dans le menu du compte et appelle la Server Action logout() avec son état d'envoi. |
| `src/components/layout/MobileNav.tsx` | État ouvert ou fermé du panneau de navigation mobile, refermé après un clic sur un lien. |
| `src/components/layout/NavLinks.tsx` | usePathname() lit l'adresse courante pour marquer le lien actif (aria-current). |
| `src/components/trips/DeleteTripButton.tsx` | Passe une fonction onConfirm à ConfirmDialog et affiche un toast si l'action échoue. Une fonction ne peut pas venir d'un Server Component. |
| `src/components/trips/TripFilters.tsx` | useRouter écrit les filtres dans l'URL, avec un délai de 300 ms sur la saisie de la recherche. |
| `src/components/trips/TripForm.tsx` | React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi. |
| `src/components/upload/CoverImageDialog.tsx` | État ouvert ou fermé du dialogue d'envoi de l'image. |
| `src/components/upload/ImageUploader.tsx` | Champ <input type=file>, aperçu avec URL.createObjectURL (API du navigateur) et état de l'envoi. |

Les 10 fichiers de `components/ui/` marqués `"use client"` (alert-dialog, dialog, dropdown-menu, field, label, select, separator, sheet, sonner, tabs) sont générés par shadcn. Les composants Radix qu'ils enveloppent gardent un état (ouvert, fermé, valeur choisie) et réagissent aux événements, donc ils ont besoin du navigateur.

## 6. Qualité du code

| Contrôle | Résultat | Comment |
| --- | --- | --- |
| ESLint | 0 erreur, 0 avertissement | `npm run lint` passe maintenant `--max-warnings 0` : un avertissement fait échouer la CI |
| TypeScript | 0 erreur | `npm run typecheck`, en mode `strict` |
| `any` | Aucun, dans `src/` comme dans `tests/` | Règle `@typescript-eslint/no-explicit-any` en erreur |
| `console.log` | Aucun | Règle `no-console`, qui permet seulement `console.warn` et `console.error` |
| Format | Tous les fichiers au format Prettier | `npm run format:check` dans la CI. `.prettierrc.json` fixe des lignes de 100 caractères. Les composants générés par shadcn restent hors de Prettier |
| Contournements | Aucun `eslint-disable`, aucun `@ts-ignore` | Un seul `@ts-expect-error`, dans `tests/lib/validation/activity.test.ts`, pour envoyer au schéma une catégorie forgée |

Six appels à `console.warn` ou `console.error` restent, et ils sont voulus. Cinq sont dans les Server Actions (`actions/auth.ts`, `actions/upload.ts`) et écrivent dans les journaux de Vercel, par exemple quand Supabase refuse un envoi. Le sixième est dans `RouteErrorFallback.tsx` et montre l'erreur complète dans la console du navigateur.

## 7. Responsive et clavier

Nous avons vérifié chaque page sur le build de production (`next start`), branché sur l'API Django locale (`seed_demo`, compte `alice`). Un Edge sans interface, piloté par le protocole DevTools, a ouvert 12 pages à 360, 768 et 1280 px. Pour chaque page et chaque largeur, le script a mesuré le défilement horizontal et cherché les champs sans libellé. À 360 et 1280 px, il a aussi parcouru la page avec la touche Tab et vérifié que chaque élément atteint change d'aspect quand il reçoit le focus.

| Page | 360 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| `/` | OK | OK | OK |
| `/login` | OK | OK | OK |
| `/register` | OK | OK | OK |
| `/dashboard` | OK | OK (corrigé) | OK |
| `/trips` | OK | OK (corrigé) | OK |
| `/trips/new` | OK | OK (corrigé) | OK |
| `/trips/62` | OK | OK (corrigé) | OK |
| `/trips/62/edit` | OK | OK (corrigé) | OK |
| `/trips/62/destinations/new` | OK | OK (corrigé) | OK |
| `/trips/62/destinations/51` | OK | OK (corrigé) | OK |
| `/trips/62/destinations/51/edit` | OK | OK (corrigé) | OK |
| `/trips/999999` (voyage introuvable) | OK | OK (corrigé) | OK |

« OK » veut dire : aucun défilement horizontal, aucun champ sans libellé, aucun bouton sans nom, et un focus visible sur chaque arrêt de la touche Tab (282 arrêts en tout).

**Problème trouvé et corrigé.** À 768 px, la largeur où la navigation de bureau apparaît, les liens « Tableau de bord », « Mes voyages » et « Nouveau voyage » passaient sur deux lignes dans l'en-tête des pages connectées. Les liens ne passent plus à la ligne (`whitespace-nowrap` dans `NavLinks.tsx`), et le nom de l'utilisateur à côté de son avatar n'apparaît qu'à partir de 1024 px (`UserMenu.tsx`). Le bouton garde son nom accessible, « Alice Tremblay, menu du compte ».

**Parcours au clavier.**

| Parcours | Résultat |
| --- | --- |
| Lien d'évitement | C'est le premier arrêt de la touche Tab. Entrée place le focus sur `<main id="contenu">`, et la touche Tab suivante arrive dans le contenu |
| Filtre de statut sur `/trips` | Flèche bas ouvre le menu sur l'option choisie, Flèche bas passe à « Brouillon », Entrée change l'adresse en `/trips?status=draft` et rend le focus au menu |
| Dialogue de suppression sur `/trips/61` | Entrée sur « Supprimer » ouvre le dialogue avec le focus sur « Annuler ». La touche Tab reste dans le dialogue. Échap le ferme et rend le focus à « Supprimer ». Rien n'est supprimé |
| Menu mobile à 360 px | Entrée sur « Ouvrir le menu » ouvre le panneau, avec le focus dedans et les trois liens. Échap le ferme et rend le focus au bouton |

**Libellés.** En plus du contrôle dans le navigateur, le test `a11y/labels.test.tsx` rend les huit formulaires (connexion, inscription, voyage en création et en modification, filtres, destination, activité, image). Il vérifie que chaque champ a une étiquette `<label>` reliée et que chaque bouton a un nom.

## 8. Couverture

`npm run test:coverage` mesure la couverture de `src/`, sans `components/ui/` (généré par shadcn).

| Mesure | Couverture |
| --- | --- |
| Instructions | 85,8 % (1354 sur 1579) |
| Branches | 83,8 % (916 sur 1093) |
| Fonctions | 89,0 % (387 sur 435) |
| Lignes | 86,0 % (1320 sur 1535) |

| Dossier | Lignes couvertes |
| --- | --- |
| `actions/` | 93,8 % |
| `app/api/` (Route Handlers) | 97,1 % |
| `components/` | 91,6 % |
| `lib/` | 98,4 % |
| `proxy.ts` | 98,2 % |
| `app/` (pages et layouts) | 1,9 % |

Les pages et les layouts de `app/` sont des Server Components `async`, que Vitest ne sait pas rendre. Nous testons à leur place les composants d'affichage et les fonctions de chargement qu'ils appellent. Sans ces 154 lignes, la couverture des lignes monte à 95,4 %.

## 9. Parcours de bout en bout (Playwright)

Vitest ne sait pas rendre une page `async` complète, c'est-à-dire un Server Component qui appelle Django. Le test Playwright `e2e/parcours.spec.ts` comble ce manque. Il ouvre un vrai navigateur sur le build de production de Next.js (`next start`, port 3100), branché sur un vrai Django et un vrai PostgreSQL. Il suit ces étapes, chacune dans un `test.step` :

1. Inscription d'un nouveau compte, qui arrive sur le tableau de bord (« Bonjour Camille »).
2. Déconnexion par le menu du compte.
3. Ouverture de `/trips/new` sans session. Le proxy renvoie vers `/login?next=%2Ftrips%2Fnew`, et la connexion ramène sur `/trips/new`.
4. Création d'un voyage (REST). La page du voyage s'ouvre avec le toast « Voyage créé. » et le budget « 1 500,50 $ ».
5. Ajout d'une destination (mutation GraphQL). La page de la destination s'ouvre avec le toast « Destination ajoutée. ».
6. Retour au voyage par le fil d'Ariane. La destination est dans l'itinéraire.
7. Suppression du voyage avec le dialogue de confirmation. La liste ne le montre plus.

Le test crée son propre compte `e2e-…`. Il n'a donc besoin d'aucun mot de passe ni de `seed_demo`, et il peut tourner plusieurs fois sur la même base. Il supprime le voyage qu'il a créé, mais le compte reste dans la base.

En local, il passe en 21 secondes environ, deux fois de suite, avec Edge (`PLAYWRIGHT_CHANNEL=msedge`). Dans la CI, le job « Parcours E2E (Playwright) » démarre PostgreSQL et Django, installe le Chromium de Playwright, fait le build de Next.js, puis lance le parcours. Le parcours y passe en 7 secondes, et tout le job prend environ une minute et demie. En cas d'échec, il publie le rapport Playwright, avec la trace, et le journal de Django.

## 10. Lighthouse

Nous avons mesuré `/login` et `/trips` avec Lighthouse 13.6 dans Edge sans interface, sur le build de production branché sur le Django local. Pour `/trips`, Lighthouse envoyait les cookies de session d'`alice`. Le mode mobile est le profil par défaut de Lighthouse, qui simule une connexion 4G lente et un processeur quatre fois plus lent. Le mode bureau utilise `--preset=desktop`.

| Page | Mode | Performance | Accessibilité | Bonnes pratiques | SEO | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/login` | mobile | 91 | 100 | 100 | 100 | 0,9 s | 380 ms | 0 |
| `/login` | bureau | 100 | 100 | 100 | 100 | 0,2 s | 20 ms | 0 |
| `/trips` | mobile | 79 | 100 | 100 | 100 | 3,8 s | 390 ms | 0 |
| `/trips` | bureau | 99 | 100 | 100 | 100 | 0,9 s | 40 ms | 0 |

L'accessibilité, les bonnes pratiques et le SEO sont à 100 partout, et aucune mise en page ne bouge pendant le chargement (CLS de 0).

**LCP de `/trips` sur mobile.** Le plus grand élément est la description sous le titre « Mes voyages ». La page attend Django (session, puis liste des voyages), et Next.js l'envoie dans un second morceau, après le squelette de `loading.tsx`. Nous avons essayé d'afficher le titre tout de suite et de garder seulement la liste sous `Suspense`. Le HTML montrait quand même le squelette de `loading.tsx` en premier, car Next.js envoie toujours le contenu de la page après lui. Le LCP n'a pas bougé (3,7 s au lieu de 3,8 s), donc nous avons gardé la version d'origine. Le vrai levier serait moins de JavaScript sur la page : Lighthouse signale du code inutilisé et 390 ms de blocage avec le processeur ralenti. Sur ordinateur, la même page obtient 99.

**Deux remarques que nous gardons.**

- Le cache « aller-retour » (bfcache) n'est pas utilisé. Les pages connectées répondent avec `Cache-Control: no-store`, car elles contiennent des données privées.
- L'audit `label-content-name-mismatch`, qui ne compte pas dans le score, signale le bouton du compte sur mobile. On y voit les initiales « AT », alors que le nom accessible est « Alice Tremblay, menu du compte ». Les initiales sont décoratives (`aria-hidden`), et le nom accessible contient le nom complet de l'utilisateur.
