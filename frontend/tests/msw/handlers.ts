import { HttpResponse, http, type AnyHandler } from "msw";
import { graphql } from "msw/graphql";
import type { ApiErrorBody, ApiErrorDetails } from "@/types/api";
import { japanTripDetail, kyotoPage, tripPage } from "./fixtures";

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

// Réponses par défaut de l'API Django simulée. Un test peut en remplacer une avec
// server.use(...), qui passe avant cette liste jusqu'à la fin du test.
export const handlers: AnyHandler[] = [
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
