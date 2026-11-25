// Client de l'API GraphQL de Django (/graphql/), utilisé seulement par le serveur Next.js.
// Il réutilise djangoRequest : même jeton, même X-Request-ID et même délai que l'API REST.
// Les erreurs GraphQL n'ont pas la forme des erreurs REST.
// - Erreur d'un resolver : HTTP 200, avec errors[].extensions.code et parfois data.
// - Jeton invalide (401) ou trop de requêtes (429) : errors[0].extensions.code, sans data.
// - Erreur de syntaxe ou de validation du document : HTTP 400, sans code ni data.
import "server-only";

import {
  djangoRequest,
  isRecord,
  parseRetryAfter,
  readJson,
  reportFailure,
} from "@/lib/api/django";
import { ApiError, INVALID_QUERY, codeFromStatus } from "@/lib/errors";
import type { GqlError } from "@/types/graphql";

const GRAPHQL_PATH = "/graphql/";

/**
 * « query DestinationPage($id: ID!) { … } » donne DestinationPage, pour le journal. Le
 * document peut commencer par ses fragments : nous cherchons donc le mot query ou mutation
 * n'importe où.
 */
export function operationName(query: string): string | undefined {
  return /\b(?:query|mutation)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(query)?.[1];
}

export interface GqlFetchOptions {
  /** Pour annuler la requête, par exemple quand le navigateur ferme la connexion. */
  signal?: AbortSignal;
}

function isGqlError(value: unknown): value is GqlError {
  return isRecord(value) && typeof value.message === "string";
}

/** Les entrées de errors[], ou une liste vide s'il n'y en a pas. */
function graphqlErrors(body: unknown): GqlError[] {
  if (!isRecord(body) || !Array.isArray(body.errors)) {
    return [];
  }
  const errors: unknown[] = body.errors;
  return errors.filter(isGqlError);
}

/**
 * Envoie une query ou une mutation GraphQL en POST et renvoie son champ data.
 * Lève une ApiError dès que errors[] n'est pas vide, même si data est en partie rempli.
 * Pour une erreur d'un resolver, status vaut 200 : testez plutôt error.code.
 */
export async function gqlFetch<TData, TVars extends object = Record<string, never>>(
  query: string,
  variables?: TVars,
  options: GqlFetchOptions = {},
): Promise<TData> {
  try {
    return await postGraphql<TData, TVars>(query, variables, options);
  } catch (error) {
    reportFailure(error, { method: "POST", path: GRAPHQL_PATH, operation: operationName(query) });
    throw error;
  }
}

async function postGraphql<TData, TVars extends object>(
  query: string,
  variables: TVars | undefined,
  options: GqlFetchOptions,
): Promise<TData> {
  const { response, requestId } = await djangoRequest(GRAPHQL_PATH, {
    method: "POST",
    body: variables === undefined ? { query } : { query, variables },
    signal: options.signal,
  });
  const body = await readJson(response, requestId);
  const retryAfter = parseRetryAfter(response.headers);

  const errors = graphqlErrors(body);
  if (errors.length > 0) {
    // La première erreur suffit à l'interface. Les autres concernent souvent le même champ.
    const firstError = errors[0];
    // Un 400 sans code vient de graphql-core : le document ou ses variables sont invalides.
    const code =
      firstError.extensions?.code ??
      (response.status === 400 ? INVALID_QUERY : codeFromStatus(response.status));
    throw new ApiError({
      status: response.status,
      code,
      message: firstError.message,
      details: firstError.extensions?.details ?? {},
      requestId,
      retryAfter,
    });
  }

  if (!response.ok || !isRecord(body) || body.data === undefined || body.data === null) {
    throw new ApiError({
      status: response.status,
      code: codeFromStatus(response.status),
      message: `Réponse GraphQL inattendue (HTTP ${response.status}).`,
      requestId,
      retryAfter,
    });
  }
  // Le type TData décrit les champs demandés dans le document (types/graphql.ts).
  return body.data as TData;
}
