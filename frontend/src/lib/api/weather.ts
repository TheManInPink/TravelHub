// Météo d'une destination en REST : GET /api/destinations/{id}/weather/.
// Django appelle Open-Meteo et garde la réponse 30 minutes en cache. Le navigateur ne
// voit jamais Open-Meteo, ni Django : il appelle le Route Handler de Next.js
// (app/api/destinations/[destinationId]/weather/route.ts), qui appelle ce module.
import "server-only";

import { djangoFetch } from "@/lib/api/django";
import { parseId } from "@/lib/api/mappers";
import { ApiError } from "@/lib/errors";
import type { DestinationWeather } from "@/types/api";

export interface WeatherOptions {
  /** Pour annuler l'appel à Django quand le navigateur abandonne sa requête. */
  signal?: AbortSignal;
}

/**
 * Conditions actuelles et prévisions des jours du séjour (dans les 16 prochains jours).
 * Django lève no_data_available si le séjour est trop loin ou déjà passé, et
 * location_not_found si le géocodage ne trouve pas la ville.
 */
export async function getDestinationWeather(
  id: number | string,
  options: WeatherOptions = {},
): Promise<DestinationWeather> {
  const destinationId = parseId(id);
  // Un identifiant qui n'est pas un entier ne part pas chez Django.
  if (destinationId === null) {
    throw new ApiError({ status: 404, code: "not_found", message: "Destination introuvable." });
  }
  return djangoFetch<DestinationWeather>(`/api/destinations/${destinationId}/weather/`, {
    signal: options.signal,
  });
}
