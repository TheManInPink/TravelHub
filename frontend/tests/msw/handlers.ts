import { HttpResponse, http, type AnyHandler } from "msw";
import { graphql, type GraphQLResponseBody, type GraphQLVariables } from "msw/graphql";
import type { ApiErrorBody, ApiErrorDetails } from "@/types/api";
import {
  ALICE_PASSWORD,
  aliceAccount,
  japanTrip,
  japanTripDetail,
  kyotoPage,
  kyotoWeather,
  newTokens,
  tripPage,
  validTokens,
} from "./fixtures";

// Adresse de l'API Django simulée. tests/setup.ts la met dans DJANGO_API_URL.
export const DJANGO_URL = "http://django.test";
export const GRAPHQL_URL = `${DJANGO_URL}/graphql/`;

/** Identifiant que Django donne au voyage créé par POST /api/trips/. */
export const CREATED_TRIP_ID = 5;

/** Identifiants GraphQL de la destination et de l'activité créées par les mutations. */
export const CREATED_DESTINATION_ID = "8";
export const CREATED_ACTIVITY_ID = "12";

// Depuis MSW 3, les gestionnaires GraphQL sont toujours liés à une adresse.
export const djangoGraphql = graphql.link(GRAPHQL_URL);

/** Enveloppe d'erreur REST de Django : {"error": {"code", "message", "details"}}. */
export function errorBody(
  code: string,
  message: string,
  details: ApiErrorDetails = {},
): ApiErrorBody {
  return { error: { code, message, details } };
}

/**
 * Erreur d'un resolver GraphQL, comme Django l'envoie : statut 200, data à null pour le
 * champ, et le code dans extensions. Les details sont en camelCase ({"date": ["…"]}).
 */
export function gqlErrorBody(
  field: string,
  code: string,
  message: string,
  details: Record<string, string[]> = {},
): GraphQLResponseBody<Record<string, null>> {
  return {
    data: { [field]: null },
    errors: [{ message, path: [field], extensions: { code, details } }],
  };
}

/** Valeurs JSON simples, comme celles des variables d'une mutation. */
type JsonRecord = Record<string, string | number | boolean | null>;

/** Champs de variables.input, sans le parent (trip ou destination) que la réponse n'a pas. */
function inputFields(variables: GraphQLVariables, parent?: string): JsonRecord {
  const input = variables.input as JsonRecord;
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== parent));
}

/** Le 401 de /graphql/ pour un jeton invalide : errors[] sans data. */
function gqlInvalidToken(): HttpResponse<GraphQLResponseBody<null>> {
  return HttpResponse.json(
    {
      errors: [
        {
          message: "Le jeton n'est pas valide.",
          extensions: { code: "token_not_valid", details: {} },
        },
      ],
    },
    { status: 401 },
  );
}

/** Le 401 de SimpleJWT pour un jeton expiré, invalide ou sur liste noire. */
function invalidToken() {
  return HttpResponse.json(errorBody("token_not_valid", "Token is invalid or expired"), {
    status: 401,
  });
}

function hasValidAccess(request: Request): boolean {
  return request.headers.get("Authorization") === `Bearer ${validTokens.access}`;
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json();
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

// Réponses par défaut de l'API Django simulée. Un test peut en remplacer une avec
// server.use(...), qui passe avant cette liste jusqu'à la fin du test.
export const handlers: AnyHandler[] = [
  // Connexion : seul alice avec son mot de passe obtient des jetons.
  http.post(`${DJANGO_URL}/api/auth/token/`, async ({ request }) => {
    const { username, password } = await jsonBody(request);
    if (username === aliceAccount.username && password === ALICE_PASSWORD) {
      return HttpResponse.json(newTokens);
    }
    return HttpResponse.json(
      errorBody("no_active_account", "No active account found with the given credentials"),
      { status: 401 },
    );
  }),

  // Inscription : le nom « alice » est déjà pris, les autres sont acceptés.
  http.post(`${DJANGO_URL}/api/auth/register/`, async ({ request }) => {
    const body = await jsonBody(request);
    if (body.username === aliceAccount.username) {
      return HttpResponse.json(
        errorBody("validation_error", "Les données envoyées sont invalides.", {
          username: ["Un utilisateur avec ce nom existe déjà."],
        }),
        { status: 400 },
      );
    }
    return HttpResponse.json({ user: aliceAccount, tokens: newTokens }, { status: 201 });
  }),

  // Rafraîchissement : seul le refresh valide donne une nouvelle paire (rotation).
  http.post(`${DJANGO_URL}/api/auth/token/refresh/`, async ({ request }) => {
    const { refresh } = await jsonBody(request);
    return refresh === validTokens.refresh ? HttpResponse.json(newTokens) : invalidToken();
  }),

  // Déconnexion : Django exige le jeton d'accès en plus du refresh.
  http.post(`${DJANGO_URL}/api/auth/logout/`, ({ request }) =>
    hasValidAccess(request) ? new HttpResponse(null, { status: 204 }) : invalidToken(),
  ),

  // Profil : alice pour le jeton d'accès valide, 401 sinon.
  http.get(`${DJANGO_URL}/api/auth/me/`, ({ request }) =>
    hasValidAccess(request) ? HttpResponse.json(aliceAccount) : invalidToken(),
  ),

  // Liste des voyages. MSW ne tient pas compte de la chaîne de requête (?status=…).
  http.get(`${DJANGO_URL}/api/trips/`, () => HttpResponse.json(tripPage)),

  // Détail d'un voyage : le voyage 1 existe, les autres donnent la 404 de Django.
  http.get(`${DJANGO_URL}/api/trips/:id/`, ({ params }) => {
    if (params.id === String(japanTripDetail.id)) {
      return HttpResponse.json(japanTripDetail);
    }
    return HttpResponse.json(errorBody("not_found", "Pas trouvé."), { status: 404 });
  }),

  // Création d'un voyage : Django renvoie le voyage créé, avec l'identifiant 5.
  http.post(`${DJANGO_URL}/api/trips/`, async ({ request }) => {
    if (!hasValidAccess(request)) {
      return invalidToken();
    }
    const body = await jsonBody(request);
    return HttpResponse.json({ ...japanTrip, ...body, id: CREATED_TRIP_ID }, { status: 201 });
  }),

  // Modification : seul le voyage 1 existe.
  http.patch(`${DJANGO_URL}/api/trips/:id/`, async ({ params, request }) => {
    if (!hasValidAccess(request)) {
      return invalidToken();
    }
    if (params.id !== String(japanTrip.id)) {
      return HttpResponse.json(errorBody("not_found", "Pas trouvé."), { status: 404 });
    }
    return HttpResponse.json({ ...japanTrip, ...(await jsonBody(request)) });
  }),

  // Suppression : 204 sans corps pour le voyage 1, 404 pour les autres.
  http.delete(`${DJANGO_URL}/api/trips/:id/`, ({ params, request }) => {
    if (!hasValidAccess(request)) {
      return invalidToken();
    }
    if (params.id !== String(japanTrip.id)) {
      return HttpResponse.json(errorBody("not_found", "Pas trouvé."), { status: 404 });
    }
    return new HttpResponse(null, { status: 204 });
  }),

  // Météo d'une destination : Django exige un jeton valide. Seule la destination 3 (Kyoto)
  // existe, les autres donnent la 404 de Django.
  http.get(`${DJANGO_URL}/api/destinations/:id/weather/`, ({ params, request }) => {
    if (!hasValidAccess(request)) {
      return invalidToken();
    }
    if (params.id !== String(kyotoWeather.destination)) {
      return HttpResponse.json(errorBody("not_found", "Pas trouvé."), { status: 404 });
    }
    return HttpResponse.json(kyotoWeather);
  }),

  // Page d'une destination en GraphQL : la destination "3" existe, les autres donnent
  // une erreur not_found dans errors[], avec le statut 200 comme le fait Django.
  djangoGraphql.query("DestinationPage", ({ variables }) => {
    if (variables.id === kyotoPage.id) {
      return HttpResponse.json({ data: { destination: kyotoPage } });
    }
    return HttpResponse.json({
      data: { destination: null },
      errors: [
        {
          message: "Destination introuvable.",
          path: ["destination"],
          extensions: { code: "not_found", details: {} },
        },
      ],
    });
  }),

  // Mutations de l'itinéraire. Comme Django, elles exigent un jeton valide (sinon 401
  // sans data). Seules la destination "3" et l'activité "7" existent : les autres
  // donnent not_found dans errors[], avec le statut 200.
  djangoGraphql.mutation("CreateDestination", ({ request, variables }) => {
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    const destination = {
      ...kyotoPage,
      latitude: null,
      longitude: null,
      ...inputFields(variables, "trip"),
      id: CREATED_DESTINATION_ID,
    };
    return HttpResponse.json({ data: { createDestination: { destination } } });
  }),

  djangoGraphql.mutation("UpdateDestination", ({ request, variables }) => {
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    if (variables.id !== kyotoPage.id) {
      return HttpResponse.json(
        gqlErrorBody("updateDestination", "not_found", "Destination introuvable."),
      );
    }
    const destination = { ...kyotoPage, ...inputFields(variables) };
    return HttpResponse.json({ data: { updateDestination: { destination } } });
  }),

  djangoGraphql.mutation("DeleteDestination", ({ request, variables }) => {
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    if (variables.id !== kyotoPage.id) {
      return HttpResponse.json(
        gqlErrorBody("deleteDestination", "not_found", "Destination introuvable."),
      );
    }
    return HttpResponse.json({ data: { deleteDestination: { ok: true, id: kyotoPage.id } } });
  }),

  djangoGraphql.mutation("CreateActivity", ({ request, variables }) => {
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    const activity = {
      ...kyotoPage.activities[0],
      ...inputFields(variables, "destination"),
      id: CREATED_ACTIVITY_ID,
    };
    return HttpResponse.json({ data: { createActivity: { activity } } });
  }),

  djangoGraphql.mutation("UpdateActivity", ({ request, variables }) => {
    const [existing] = kyotoPage.activities;
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    if (variables.id !== existing.id) {
      return HttpResponse.json(gqlErrorBody("updateActivity", "not_found", "Activité introuvable."));
    }
    const activity = { ...existing, ...inputFields(variables) };
    return HttpResponse.json({ data: { updateActivity: { activity } } });
  }),

  djangoGraphql.mutation("DeleteActivity", ({ request, variables }) => {
    const [existing] = kyotoPage.activities;
    if (!hasValidAccess(request)) {
      return gqlInvalidToken();
    }
    if (variables.id !== existing.id) {
      return HttpResponse.json(gqlErrorBody("deleteActivity", "not_found", "Activité introuvable."));
    }
    return HttpResponse.json({ data: { deleteActivity: { ok: true, id: existing.id } } });
  }),
];
