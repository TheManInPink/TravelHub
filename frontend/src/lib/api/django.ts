// Client de l'API REST de Django, utilisé seulement par le serveur Next.js (BFF).
// Le navigateur n'appelle jamais Django. Il appelle Next.js, qui lit le jeton dans le
// cookie httpOnly th_access et l'envoie à Django dans l'en-tête Authorization.
import "server-only";

import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/auth/cookieNames";
import {
  ApiError,
  NETWORK_ERROR,
  TIMEOUT_ERROR,
  TIMEOUT_MESSAGE,
  UNEXPECTED_RESPONSE,
  codeFromStatus,
} from "@/lib/errors";
import type { ApiErrorBody } from "@/types/api";

/** Délai maximal d'un appel. Sur Render Free, Django peut mettre une minute à se réveiller. */
const TIMEOUT_MS = 15_000;

/** Django reprend cet identifiant dans ses journaux et le renvoie dans la réponse. */
const REQUEST_ID_HEADER = "X-Request-ID";

export interface DjangoRequestInit extends Omit<RequestInit, "body" | "cache"> {
  /** Corps de la requête, envoyé en JSON. */
  body?: unknown;
  /** true pour un appel sans jeton (connexion, inscription, rafraîchissement du jeton). */
  public?: boolean;
}

export interface DjangoResponse {
  response: Response;
  requestId: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiBaseUrl(): URL {
  const value = process.env.DJANGO_API_URL?.trim();
  if (!value) {
    throw new Error("DJANGO_API_URL n'est pas définie. Copiez .env.example en .env.local.");
  }
  const url = URL.canParse(value) ? new URL(value) : null;
  // Sans ce test, une valeur comme « travelhub-uqar-api.onrender.com,localhost » (celle
  // de ALLOWED_HOSTS) donne seulement « TypeError: Invalid URL » au rendu de la page.
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error(
      `DJANGO_API_URL doit être une adresse complète, par exemple https://travelhub-uqar-api.onrender.com (valeur reçue : ${value}).`,
    );
  }
  return url;
}

/** "/api/trips/12" devient "http://localhost:8000/api/trips/12/". */
export function djangoUrl(path: string): URL {
  if (!path.startsWith("/")) {
    throw new Error(`Le chemin de l'API doit commencer par « / » : ${path}`);
  }
  const base = apiBaseUrl();
  const url = new URL(path, base);
  // « //exemple.com » ou « /\exemple.com » changeraient d'hôte, et le jeton partirait ailleurs.
  if (url.origin !== base.origin) {
    throw new Error(`Le chemin de l'API ne doit pas changer d'hôte : ${path}`);
  }
  // Les routes REST de Django finissent toutes par « / ». Sans lui, Django répond 404,
  // ou 500 pour un POST (APPEND_SLASH ne peut pas rediriger un corps de requête).
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

/** Secondes de l'en-tête Retry-After (Django envoie un nombre entier), ou null. */
export function parseRetryAfter(headers: Headers): number | null {
  const value = headers.get("Retry-After")?.trim();
  return value && /^\d+$/.test(value) ? Number(value) : null;
}

/** Transforme l'échec de fetch (réseau coupé, délai dépassé) en ApiError. */
function transportError(error: unknown, requestId: string): unknown {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new ApiError({
      status: 0,
      code: TIMEOUT_ERROR,
      message: TIMEOUT_MESSAGE,
      requestId,
      cause: error,
    });
  }
  // Requête annulée par l'appelant (signal) : ce n'est pas une panne, on la laisse passer.
  if (error instanceof Error && error.name === "AbortError") {
    return error;
  }
  return new ApiError({
    status: 0,
    code: NETWORK_ERROR,
    message: "Impossible de joindre l'API Django.",
    requestId,
    cause: error,
  });
}

/**
 * Envoie la requête à Django et renvoie la réponse brute, sans lire son corps.
 * djangoFetch (REST) et gqlFetch (GraphQL) l'utilisent, puis lisent chacun leur format.
 */
export async function djangoRequest(
  path: string,
  init: DjangoRequestInit = {},
): Promise<DjangoResponse> {
  const { body, public: isPublic = false, headers: initHeaders, signal, ...rest } = init;
  const url = djangoUrl(path);
  const requestId = crypto.randomUUID();

  const headers = new Headers(initHeaders);
  headers.set("Accept", "application/json");
  headers.set(REQUEST_ID_HEADER, requestId);
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (!isPublic) {
    // cookies() est asynchrone depuis Next.js 15.
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...rest,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Une réponse obtenue avec un jeton ne doit jamais aller dans un cache partagé.
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return { response, requestId: response.headers.get(REQUEST_ID_HEADER) ?? requestId };
  } catch (error) {
    throw transportError(error, requestId);
  }
}

/** Lit le corps en JSON. Renvoie undefined pour un corps vide ou qui n'est pas du JSON. */
export async function readJson(response: Response, requestId: string): Promise<unknown> {
  let text: string;
  try {
    // Le délai de 15 s court encore pendant la lecture du corps.
    text = await response.text();
  } catch (error) {
    throw transportError(error, requestId);
  }
  if (!text) {
    return undefined;
  }
  try {
    const data: unknown = JSON.parse(text);
    return data;
  } catch {
    // Par exemple la page HTML du proxy de Render pendant un déploiement.
    return undefined;
  }
}

function isErrorBody(data: unknown): data is ApiErrorBody {
  if (!isRecord(data) || !isRecord(data.error)) {
    return false;
  }
  const { code, message, details } = data.error;
  return typeof code === "string" && typeof message === "string" && isRecord(details);
}

/** ApiError tirée de l'enveloppe {"error": {"code", "message", "details"}} de Django. */
function restError(response: Response, data: unknown, requestId: string): ApiError {
  const retryAfter = parseRetryAfter(response.headers);
  if (isErrorBody(data)) {
    const { code, message, details } = data.error;
    return new ApiError({ status: response.status, code, message, details, requestId, retryAfter });
  }
  return new ApiError({
    status: response.status,
    code: codeFromStatus(response.status),
    message: `Réponse inattendue de l'API Django (HTTP ${response.status}).`,
    requestId,
    retryAfter,
  });
}

/**
 * Appelle une route REST de Django et renvoie le JSON de la réponse.
 * Lève une ApiError pour un statut d'erreur, une panne réseau ou un délai dépassé.
 * Renvoie undefined pour un 204 (suppression) : appelez alors djangoFetch<void>.
 */
export async function djangoFetch<T>(path: string, init: DjangoRequestInit = {}): Promise<T> {
  const { response, requestId } = await djangoRequest(path, init);
  if (response.status === 204) {
    // TypeScript ne peut pas savoir que T vaut void ici, d'où la conversion.
    return undefined as T;
  }
  const data = await readJson(response, requestId);
  if (!response.ok) {
    throw restError(response, data, requestId);
  }
  if (data === undefined) {
    throw new ApiError({
      status: response.status,
      code: UNEXPECTED_RESPONSE,
      message: `Réponse de l'API Django sans JSON (HTTP ${response.status}).`,
      requestId,
    });
  }
  // Le type T décrit la réponse attendue (types/api.ts). Nous faisons confiance à Django.
  return data as T;
}
