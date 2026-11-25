// Chargement d'un voyage pour ses pages (détail, modification), avec les erreurs
// attendues déjà triées. Ce module tourne sur le serveur Next.js.
import "server-only";

import { notFound } from "next/navigation";
import { getTrip } from "@/lib/api/trips";
import { isApiError, toUserMessage } from "@/lib/errors";
import type { TripDetail } from "@/types/api";

/** Résultat du chargement : le voyage, un accès refusé, ou une erreur à afficher. */
export type TripPageData =
  { kind: "trip"; trip: TripDetail } | { kind: "forbidden" } | { kind: "error"; message: string };

/**
 * GET /api/trips/{id}/ pour une page. Les erreurs attendues sont interceptées ici, car
 * en production error.tsx ne reçoit qu'un message générique :
 * - 404 (voyage supprimé, identifiant inconnu, voyage d'un autre) : notFound(), qui
 *   affiche trips/[tripId]/not-found.tsx ;
 * - 403 : la page montre l'écran « Vous n'avez pas accès à ce voyage » ;
 * - 429, 5xx, délai dépassé : la page montre ErrorState avec le message de toUserMessage.
 *
 * getTrip passe par cache() de React : la page et generateMetadata ne font qu'un appel.
 */
export async function loadTripPage(tripId: string): Promise<TripPageData> {
  try {
    return { kind: "trip", trip: await getTrip(tripId) };
  } catch (error) {
    if (!isApiError(error)) {
      throw error;
    }
    if (error.status === 404) {
      notFound();
    }
    if (error.status === 403) {
      return { kind: "forbidden" };
    }
    return { kind: "error", message: toUserMessage(error) };
  }
}
