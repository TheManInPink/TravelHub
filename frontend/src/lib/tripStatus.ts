import type { TripStatus } from "@/types/api";

// Libellés français des statuts d'un voyage. Ce sont ceux de TripStatus dans Django
// (apps/trips/models.py). L'API REST n'envoie que la valeur ("planned"), sans libellé.

export const TRIP_STATUS_LABELS: Readonly<Record<TripStatus, string>> = {
  draft: "Brouillon",
  planned: "Planifié",
  ongoing: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

/** « Planifié » pour "planned". */
export function tripStatusLabel(status: TripStatus): string {
  return TRIP_STATUS_LABELS[status];
}
