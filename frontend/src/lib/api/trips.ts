// Voyages en REST : liste, détail, création, modification, suppression et statistiques.
// Ces fonctions tournent sur le serveur Next.js (Server Components et Server Actions).
import "server-only";

import { cache } from "react";
import { djangoFetch } from "@/lib/api/django";
import { parseId } from "@/lib/api/mappers";
import { ApiError } from "@/lib/errors";
import type {
  IsoDate,
  Paginated,
  Trip,
  TripCreatePayload,
  TripDetail,
  TripStats,
  TripStatus,
  TripUpdatePayload,
} from "@/types/api";

/** Tris acceptés par Django (ordering_fields de TripViewSet), avec ou sans « - ». */
export const TRIP_ORDERINGS = [
  "start_date",
  "-start_date",
  "title",
  "-title",
  "created_at",
  "-created_at",
] as const;

export type TripOrdering = (typeof TRIP_ORDERINGS)[number];

/** Sert à vérifier un tri lu dans l'URL (searchParams) avant d'appeler listTrips. */
export function isTripOrdering(value: string): value is TripOrdering {
  const orderings: readonly string[] = TRIP_ORDERINGS;
  return orderings.includes(value);
}

/** Filtres de GET /api/trips/, avec les noms de paramètres de Django. */
export interface ListTripsParams {
  status?: TripStatus;
  /** Mots cherchés dans le titre et la description. */
  search?: string;
  /** Numéro de page, à partir de 1 (20 voyages par page). */
  page?: number;
  ordering?: TripOrdering;
  /** Voyages qui commencent à cette date ou après. */
  start_date__gte?: IsoDate;
  /** Voyages qui finissent à cette date ou avant. */
  end_date__lte?: IsoDate;
}

/** Chemin REST d'un voyage. Un identifiant qui n'est pas un entier donne not_found, comme Django. */
function tripPath(id: number | string, action = ""): string {
  const tripId = parseId(id);
  if (tripId === null) {
    throw new ApiError({ status: 404, code: "not_found", message: "Voyage introuvable." });
  }
  return `/api/trips/${tripId}/${action}`;
}

/** GET /api/trips/ : une page des voyages de l'utilisateur connecté. */
export async function listTrips(params: ListTripsParams = {}): Promise<Paginated<Trip>> {
  const { status, search, page, ordering, start_date__gte, end_date__lte } = params;
  // Django ignore un tri inconnu sans erreur. Nous le refusons ici pour ne pas
  // afficher une liste triée autrement que demandé.
  if (ordering !== undefined && !isTripOrdering(ordering)) {
    throw new RangeError(`Tri des voyages inconnu : ${String(ordering)}`);
  }

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (search?.trim()) query.set("search", search.trim());
  if (page !== undefined && page > 1) query.set("page", String(page));
  if (ordering) query.set("ordering", ordering);
  if (start_date__gte) query.set("start_date__gte", start_date__gte);
  if (end_date__lte) query.set("end_date__lte", end_date__lte);

  const queryString = query.toString();
  return djangoFetch<Paginated<Trip>>(queryString ? `/api/trips/?${queryString}` : "/api/trips/");
}

/**
 * GET /api/trips/{id}/ : le voyage avec ses destinations et leurs activités.
 * cache() de React évite un deuxième appel quand la page et generateMetadata
 * demandent le même voyage pendant le même rendu.
 */
export const getTrip = cache(async (id: number | string): Promise<TripDetail> => {
  return djangoFetch<TripDetail>(tripPath(id));
});

/** POST /api/trips/ : l'utilisateur devient propriétaire du nouveau voyage. */
export async function createTrip(payload: TripCreatePayload): Promise<Trip> {
  return djangoFetch<Trip>("/api/trips/", { method: "POST", body: payload });
}

/** PATCH /api/trips/{id}/ : seuls les champs envoyés changent. */
export async function updateTrip(id: number | string, payload: TripUpdatePayload): Promise<Trip> {
  return djangoFetch<Trip>(tripPath(id), { method: "PATCH", body: payload });
}

/** DELETE /api/trips/{id}/ : réservé au propriétaire. Django répond 204 sans corps. */
export async function deleteTrip(id: number | string): Promise<void> {
  await djangoFetch<void>(tripPath(id), { method: "DELETE" });
}

/** GET /api/trips/{id}/stats/ : budget, coûts et répartition par catégorie. */
export async function getTripStats(id: number | string): Promise<TripStats> {
  return djangoFetch<TripStats>(tripPath(id, "stats/"));
}
