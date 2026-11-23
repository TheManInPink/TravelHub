import { HttpResponse, http, type AnyHandler } from "msw";
import { graphql } from "msw/graphql";
import type { ApiErrorBody, ApiErrorDetails } from "@/types/api";
import {
  ALICE_PASSWORD,
  aliceAccount,
  japanTripDetail,
  kyotoPage,
  newTokens,
  tripPage,
  validTokens,
} from "./fixtures";

// Adresse de l'API Django simulée. tests/setup.ts la met dans DJANGO_API_URL.
export const DJANGO_URL = "http://django.test";
export const GRAPHQL_URL = `${DJANGO_URL}/graphql/`;

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
];
