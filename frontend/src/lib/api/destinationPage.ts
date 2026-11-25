// Chargement d'une destination pour ses pages (détail, modification), avec les erreurs
// attendues déjà triées. Ce module tourne sur le serveur Next.js.
import "server-only";

import { notFound } from "next/navigation";
import { getDestinationPage } from "@/lib/api/itinerary";
import { parseId } from "@/lib/api/mappers";
import { errorReference, isApiError, toUserMessage } from "@/lib/errors";
import type { GqlDestinationPage } from "@/types/graphql";

/**
 * Résultat du chargement : la destination, ou une erreur à afficher avec sa référence
 * (X-Request-ID) quand c'est une panne du serveur.
 */
export type DestinationPageData =
  | { kind: "destination"; destination: GqlDestinationPage }
  | { kind: "error"; message: string; reference?: string };

/**
 * Query GraphQL DestinationPage pour une page. Les erreurs attendues sont interceptées
 * ici, comme pour les voyages (lib/api/tripPage.ts) :
 * - not_found (destination supprimée, identifiant inconnu, voyage d'un autre) :
 *   notFound(), qui affiche destinations/[destinationId]/not-found.tsx ;
 * - 429, 5xx, délai dépassé : la page montre ErrorState avec le message de toUserMessage.
 *
 * En GraphQL, une erreur d'un resolver arrive avec le statut 200 : nous testons son code.
 * Django ne renvoie que les destinations visibles, donc un lecteur reçoit la sienne et
 * un inconnu reçoit not_found, jamais permission_denied.
 *
 * L'adresse doit aussi correspondre au voyage de la destination : /trips/2/destinations/3
 * n'existe pas si la destination 3 appartient au voyage 1.
 */
export async function loadDestinationPage(
  tripId: string,
  destinationId: string,
): Promise<DestinationPageData> {
  // Un identifiant qui n'est pas un entier (« abc ») ne part pas chez Django.
  if (parseId(destinationId) === null) {
    notFound();
  }

  let destination: GqlDestinationPage;
  try {
    destination = await getDestinationPage(destinationId);
  } catch (error) {
    if (!isApiError(error)) {
      throw error;
    }
    if (error.code === "not_found") {
      notFound();
    }
    return { kind: "error", message: toUserMessage(error), reference: errorReference(error) };
  }

  if (destination.trip.id !== tripId) {
    notFound();
  }
  return { kind: "destination", destination };
}
