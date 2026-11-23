// Données du tableau de bord, lues en REST. Ce module tourne sur le serveur Next.js.
import "server-only";

import { listTrips } from "@/lib/api/trips";
import { isDateWithin } from "@/lib/dates";
import type { IsoDate, Trip } from "@/types/api";

/** Nombre de voyages affichés dans « Prochains voyages ». */
export const UPCOMING_TRIPS_SHOWN = 3;

export interface DashboardData {
  /** Nombre total de voyages de l'utilisateur (count de Django, toutes pages comprises). */
  tripCount: number;
  /** Voyage en cours aujourd'hui, ou null. */
  currentTrip: Trip | null;
  /** Nombre de voyages qui commencent aujourd'hui ou plus tard (count de Django). */
  upcomingCount: number;
  /** Les trois prochains voyages, du plus proche au plus lointain. */
  upcomingTrips: Trip[];
  /** Voyage modifié le plus récemment, cherché dans la première page. */
  lastUpdatedTrip: Trip | null;
}

/**
 * Voyage en cours : le premier voyage au statut « En cours », sinon un voyage de la liste
 * dont les dates contiennent aujourd'hui. Un voyage annulé n'est jamais en cours.
 *
 * Le second cas se calcule ici, car l'API n'a pas de filtre pour « commence avant et
 * finit après ». Elle n'a que start_date__gte et end_date__lte, et elle ignore sans
 * erreur un paramètre inconnu.
 */
export function findCurrentTrip(
  ongoingTrips: readonly Trip[],
  trips: readonly Trip[],
  today: IsoDate,
): Trip | null {
  const byStatus = ongoingTrips[0];
  if (byStatus) {
    return byStatus;
  }
  return (
    trips.find(
      (trip) => trip.status !== "cancelled" && isDateWithin(today, trip.start_date, trip.end_date),
    ) ?? null
  );
}

/**
 * Voyage dont updated_at est le plus récent. Le tri se fait ici, car Django n'accepte
 * que start_date, title et created_at pour ordering.
 */
export function findLastUpdatedTrip(trips: readonly Trip[]): Trip | null {
  let latest: Trip | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const trip of trips) {
    const time = Date.parse(trip.updated_at);
    if (time > latestTime) {
      latest = trip;
      latestTime = time;
    }
  }
  return latest;
}

/**
 * Charge le tableau de bord avec trois appels REST lancés en même temps :
 * - la première page des voyages, pour le nombre total, le voyage en cours trouvé par ses
 *   dates et le dernier voyage modifié. Elle est triée par date de création décroissante :
 *   au-delà de 20 voyages, ce sont les plus récents qui ont le plus de chances d'avoir été
 *   modifiés, ou d'être en cours ;
 * - les voyages au statut « En cours » ;
 * - les voyages qui commencent aujourd'hui ou plus tard, du plus proche au plus lointain.
 *
 * Les statistiques du prochain voyage ne sont pas chargées ici : la page les demande sous
 * Suspense, pour afficher le reste sans les attendre.
 */
export async function loadDashboard(today: IsoDate): Promise<DashboardData> {
  const [firstPage, ongoing, upcoming] = await Promise.all([
    listTrips({ ordering: "-created_at" }),
    listTrips({ status: "ongoing" }),
    listTrips({ start_date__gte: today, ordering: "start_date" }),
  ]);

  return {
    tripCount: firstPage.count,
    currentTrip: findCurrentTrip(ongoing.results, firstPage.results, today),
    upcomingCount: upcoming.count,
    upcomingTrips: upcoming.results.slice(0, UPCOMING_TRIPS_SHOWN),
    lastUpdatedTrip: findLastUpdatedTrip(firstPage.results),
  };
}
