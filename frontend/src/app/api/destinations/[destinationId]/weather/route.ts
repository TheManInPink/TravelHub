import { NextResponse, type NextRequest } from "next/server";
import { getDestinationWeather } from "@/lib/api/weather";
import { getOptionalUser } from "@/lib/auth/session";
import {
  TIMEOUT_ERROR,
  errorReference,
  isApiError,
  toUserMessage,
  type ApiError,
} from "@/lib/errors";
import type { BffErrorBody, DestinationWeather } from "@/types/api";

// GET /api/destinations/{id}/weather : météo d'une destination, pour le navigateur.
// WeatherPanel (Client Component) appelle ce Route Handler après l'affichage de la page.
// Seul le serveur Next.js appelle Django, avec le jeton du cookie httpOnly. Le
// navigateur ne voit donc ni le jeton, ni Django, ni Open-Meteo.
//
// La session est vérifiée par getOptionalUser() et non par verifySession() : un fetch
// attend du JSON, pas une redirection vers la page de connexion.

/** Le navigateur garde la météo 10 minutes. Django la garde 30 minutes de son côté. */
const SUCCESS_CACHE_CONTROL = "private, max-age=600";

/** Statut que nous donnons à une requête annulée par le navigateur (convention de nginx). */
const CLIENT_CLOSED_REQUEST = 499;

function errorResponse(
  status: number,
  error: BffErrorBody["error"],
  retryAfter: number | null = null,
): NextResponse<BffErrorBody> {
  const response = NextResponse.json<BffErrorBody>({ error }, { status });
  // Une erreur ne doit pas rester en cache : le bouton Réessayer doit refaire l'appel.
  response.headers.set("Cache-Control", "no-store");
  if (retryAfter !== null) {
    response.headers.set("Retry-After", String(retryAfter));
  }
  return response;
}

/**
 * Même statut que Django. Sans réponse de Django (status 0), nous répondons 504 pour un
 * délai dépassé et 502 pour une panne réseau. Une réponse 200 illisible donne aussi 502.
 */
function errorStatus(error: ApiError): number {
  if (error.status === 0) {
    return error.code === TIMEOUT_ERROR ? 504 : 502;
  }
  return error.status >= 400 ? error.status : 502;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/destinations/[destinationId]/weather">,
) {
  const { destinationId } = await params;
  try {
    const user = await getOptionalUser();
    if (!user) {
      return errorResponse(401, {
        code: "not_authenticated",
        message: "Votre session a expiré. Rechargez la page pour vous reconnecter.",
      });
    }
    // request.signal est annulé si le navigateur abandonne la requête (page quittée).
    const weather = await getDestinationWeather(destinationId, { signal: request.signal });
    const response = NextResponse.json<DestinationWeather>(weather);
    response.headers.set("Cache-Control", SUCCESS_CACHE_CONTROL);
    // Le cache du navigateur sépare les réponses selon les cookies. Sur un ordinateur
    // partagé, le compte suivant ne reçoit donc pas la météo gardée pour le précédent.
    response.headers.set("Vary", "Cookie");
    return response;
  } catch (error) {
    if (isApiError(error)) {
      // La référence (X-Request-ID) n'existe que pour une panne : WeatherPanel l'affiche
      // sous le message, pour retrouver la requête dans les journaux.
      const body = { code: error.code, message: toUserMessage(error) };
      const reference = errorReference(error);
      return errorResponse(
        errorStatus(error),
        reference ? { ...body, reference } : body,
        error.retryAfter,
      );
    }
    // Le navigateur est parti : personne ne lira la réponse.
    if (request.signal.aborted) {
      return new NextResponse(null, { status: CLIENT_CLOSED_REQUEST });
    }
    throw error;
  }
}
