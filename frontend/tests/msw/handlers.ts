import type { AnyHandler } from "msw";
import { graphql } from "msw/graphql";
import type { ApiErrorBody, ApiErrorDetails } from "@/types/api";

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
export const handlers: AnyHandler[] = [];
