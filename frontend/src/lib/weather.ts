// Météo vue du navigateur. WeatherPanel appelle le Route Handler de Next.js
// (/api/destinations/{id}/weather), jamais Django ni Open-Meteo. Ce module n'importe
// pas « server-only » : il ne contient ni secret ni appel à Django.

import {
  ApiError,
  NETWORK_ERROR,
  UNEXPECTED_RESPONSE,
  codeFromStatus,
  toUserMessage,
} from "@/lib/errors";
import type { BffErrorBody, DestinationWeather } from "@/types/api";
import type { GqlDestination } from "@/types/graphql";

/** Réponse du Route Handler : la météo, ou une erreur avec son statut HTTP. */
export type WeatherResult = { ok: true; weather: DestinationWeather } | WeatherFailure;

export interface WeatherFailure {
  ok: false;
  /** Statut HTTP du Route Handler, ou 0 quand il n'a pas répondu (réseau coupé). */
  status: number;
  code: string;
  /** Message en français, prêt à afficher. */
  message: string;
}

/** Champs de la destination dont dépend la météo : la ville à géocoder et les dates. */
export type WeatherTarget = Pick<
  GqlDestination,
  "id" | "city" | "countryCode" | "arrivalDate" | "departureDate" | "latitude" | "longitude"
>;

/**
 * Adresse du Route Handler pour une destination.
 *
 * Le Route Handler ignore le paramètre v. Il sert au cache du navigateur, qui garde la
 * météo 10 minutes : si la ville, le pays, les dates ou les coordonnées changent,
 * l'adresse change aussi, et le navigateur redemande la météo au lieu de montrer celle
 * d'avant la modification.
 */
export function weatherPath(destination: WeatherTarget): string {
  const version = [
    destination.city,
    destination.countryCode,
    destination.arrivalDate,
    destination.departureDate,
    destination.latitude ?? "",
    destination.longitude ?? "",
  ].join("|");
  const params = new URLSearchParams({ v: version });
  return `/api/destinations/${encodeURIComponent(destination.id)}/weather?${params}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Vérifie la forme générale de la réponse, pour ne pas planter sur une réponse inattendue. */
function isWeather(body: unknown): body is DestinationWeather {
  return (
    isRecord(body) && isRecord(body.units) && isRecord(body.current) && Array.isArray(body.daily)
  );
}

function isErrorBody(body: unknown): body is BffErrorBody {
  return (
    isRecord(body) &&
    isRecord(body.error) &&
    typeof body.error.code === "string" &&
    typeof body.error.message === "string"
  );
}

/** Échec sans message du serveur : le message vient de toUserMessage(). */
function failure(status: number, code: string): WeatherFailure {
  const message = toUserMessage(new ApiError({ status, code, message: "" }));
  return { ok: false, status, code, message };
}

/** Corps JSON de la réponse, ou undefined (page HTML d'erreur de Vercel, par exemple). */
async function readBody(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    return undefined;
  }
}

/**
 * Demande la météo au Route Handler. Ne lève pas d'erreur : une panne donne un
 * WeatherFailure. Renvoie null si la requête a été annulée (composant démonté), car
 * personne n'attend plus la réponse.
 */
export async function fetchWeather(
  path: string,
  signal: AbortSignal,
): Promise<WeatherResult | null> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(path, { signal, headers: { Accept: "application/json" } });
    body = await readBody(response);
  } catch {
    // fetch échoue sans réponse : réseau coupé, ou requête annulée.
    return signal.aborted ? null : failure(0, NETWORK_ERROR);
  }
  if (signal.aborted) {
    return null;
  }

  if (response.ok) {
    return isWeather(body) ? { ok: true, weather: body } : failure(502, UNEXPECTED_RESPONSE);
  }
  if (isErrorBody(body)) {
    return {
      ok: false,
      status: response.status,
      code: body.error.code,
      message: body.error.message,
    };
  }
  return failure(response.status, codeFromStatus(response.status));
}

/**
 * Vrai si un nouvel essai a des chances de réussir : réseau coupé, trop de requêtes,
 * ou erreur du serveur (Open-Meteo indisponible : 502, 503 ou 504).
 */
export function isRetryable(failure: WeatherFailure): boolean {
  return failure.status === 0 || failure.status === 429 || failure.status >= 500;
}
