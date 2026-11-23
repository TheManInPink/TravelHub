// Erreurs de l'API et messages pour l'utilisateur.
// Ce module n'importe pas « server-only », car les Client Components s'en servent aussi
// (par exemple pour afficher le message renvoyé par une Server Action). Il ne contient
// donc ni secret ni appel à Django.

import type { ApiErrorDetails } from "@/types/api";

// Codes créés par le front-end. Les autres codes viennent de Django (enveloppe REST
// {"error": {...}} ou extensions.code en GraphQL).
export const NETWORK_ERROR = "network_error";
export const TIMEOUT_ERROR = "timeout";
export const INVALID_QUERY = "invalid_query";
export const UNEXPECTED_RESPONSE = "unexpected_response";

/** Message affiché quand Django met plus de 15 s à répondre (Render Free se met en veille). */
export const TIMEOUT_MESSAGE = "Le serveur se réveille, réessayez dans un instant";

export interface ApiErrorInit {
  /** Statut HTTP de la réponse, ou 0 quand Django n'a pas répondu. */
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetails;
  /** X-Request-ID de la requête, pour retrouver la ligne dans les journaux de Django. */
  requestId?: string | null;
  /** Secondes à attendre avant de réessayer (en-tête Retry-After d'un 429). */
  retryAfter?: number | null;
  cause?: unknown;
}

/** Erreur renvoyée par Django, ou panne pendant l'appel. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message, { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.details = init.details ?? {};
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Code à utiliser quand la réponse n'a pas l'enveloppe de Django. Cela arrive surtout
 * avec la page d'erreur du proxy de Render, pendant un déploiement.
 */
export function codeFromStatus(status: number): string {
  if (status === 400) return "bad_request";
  if (status === 401) return "not_authenticated";
  if (status === 403) return "permission_denied";
  if (status === 404) return "not_found";
  if (status === 429) return "throttled";
  if (status >= 500) return "internal_error";
  return UNEXPECTED_RESPONSE;
}

const DEFAULT_MESSAGE = "Une erreur inattendue est survenue. Réessayez dans un instant.";
const EXTERNAL_SERVICE_MESSAGE =
  "Le service externe (météo ou pays) ne répond pas pour le moment. Réessayez dans quelques minutes.";

// Un message par code. Les codes créés par le front-end sont tous ici, donc leur message
// technique (en anglais ou destiné au développeur) n'arrive jamais à l'écran.
const MESSAGES: Readonly<Record<string, string | undefined>> = {
  not_authenticated: "Vous devez vous connecter pour continuer.",
  authentication_failed: "Vous devez vous connecter pour continuer.",
  token_not_valid: "Votre session a expiré. Reconnectez-vous.",
  no_active_account: "Nom d'utilisateur ou mot de passe incorrect.",
  permission_denied: "Vous n'avez pas le droit de faire cette action.",
  not_found: "Cet élément est introuvable. Il a peut-être été supprimé.",
  internal_error: "Le serveur a rencontré une erreur. Réessayez plus tard.",
  [NETWORK_ERROR]: "Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.",
  [TIMEOUT_ERROR]: `${TIMEOUT_MESSAGE}.`,
  [INVALID_QUERY]: "La requête envoyée au serveur est invalide.",
  bad_request: "La requête envoyée au serveur est invalide.",
  [UNEXPECTED_RESPONSE]: "Le serveur a renvoyé une réponse inattendue. Réessayez plus tard.",
};

function formatDuration(value: number, unit: "second" | "minute" | "hour"): string {
  return new Intl.NumberFormat("fr-CA", { style: "unit", unit, unitDisplay: "long" }).format(
    value,
  );
}

/** 90 donne « 2 minutes » et 5 donne « 5 secondes ». Nous arrondissons vers le haut. */
function formatWait(seconds: number): string {
  if (seconds < 60) return formatDuration(Math.max(1, Math.ceil(seconds)), "second");
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return formatDuration(minutes, "minute");
  return formatDuration(Math.ceil(seconds / 3600), "hour");
}

/** Message en français à montrer à l'utilisateur, quelle que soit l'erreur reçue. */
export function toUserMessage(error: unknown): string {
  if (!isApiError(error)) {
    // AbortSignal.timeout() lève une DOMException nommée TimeoutError. Nous testons son
    // nom, car la DOMException de jsdom n'hérite pas de Error.
    const name = typeof error === "object" && error !== null && "name" in error && error.name;
    if (name === "TimeoutError") {
      return `${TIMEOUT_MESSAGE}.`;
    }
    return DEFAULT_MESSAGE;
  }

  const { code } = error;

  // Django envoie un message français précis, par exemple la règle métier qui a échoué.
  if (code === "validation_error" || code === "integrity_error") {
    return error.message || "Les données envoyées sont invalides. Vérifiez les champs indiqués.";
  }
  if (code === "throttled") {
    return error.retryAfter === null
      ? "Trop de requêtes. Réessayez dans un instant."
      : `Trop de requêtes. Réessayez dans ${formatWait(error.retryAfter)}.`;
  }
  if (code.startsWith("external_service_") || code === "integration_error") {
    return EXTERNAL_SERVICE_MESSAGE;
  }

  const message = MESSAGES[code];
  if (message) {
    return message;
  }
  // Autre code de Django (location_not_found, country_not_found…) : son message est
  // déjà écrit en français pour l'utilisateur.
  return error.message || DEFAULT_MESSAGE;
}

/**
 * Identifiant (digest) que Next.js ajoute à une erreur levée au serveur. En production,
 * c'est la seule information qui arrive dans error.tsx : elle permet de retrouver
 * l'erreur dans les journaux de Vercel.
 */
export function errorDigest(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "digest" in error) {
    return typeof error.digest === "string" && error.digest ? error.digest : undefined;
  }
  return undefined;
}
