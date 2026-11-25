// Journal du serveur Next.js pour les appels à Django qui échouent.
// Sur Vercel, ces lignes apparaissent dans l'onglet Logs du projet. En local, elles
// s'affichent dans le terminal de npm run dev ou de npm run start.
import "server-only";

import type { ApiError } from "@/lib/errors";

/** L'appel à Django qui a échoué. */
export interface DjangoCall {
  method: string;
  /** Chemin de l'API, par exemple /api/trips/12/. La chaîne de requête n'est pas écrite. */
  path: string;
  /** Nom de la query ou de la mutation GraphQL, par exemple DestinationPage. */
  operation?: string;
}

/**
 * Écrit une ligne JSON avec le X-Request-ID de la requête. C'est le même identifiant que
 * request_id dans les journaux de Django sur Render : une recherche de cette valeur dans
 * les deux journaux retrouve les deux côtés de la même requête. Le message de l'erreur
 * n'est pas écrit, ni le corps ou les en-têtes de la requête, qui peuvent contenir des
 * données personnelles ou le jeton.
 */
export function logDjangoFailure(error: ApiError, call: DjangoCall): void {
  console.error(
    JSON.stringify({
      level: "error",
      event: "django_failure",
      request_id: error.requestId,
      method: call.method,
      path: call.path.split("?")[0],
      ...(call.operation ? { operation: call.operation } : {}),
      status: error.status,
      code: error.code,
    }),
  );
}
