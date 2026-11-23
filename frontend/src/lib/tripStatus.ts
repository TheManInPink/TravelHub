import type { TripStatus } from "@/types/api";

// Libellés français des statuts d'un voyage. Ce sont ceux de TripStatus dans Django
// (apps/trips/models.py). L'API REST n'envoie que la valeur ("planned"), sans libellé.

/** Les 5 statuts, dans l'ordre de la vie d'un voyage. Sert au schéma Zod et aux listes. */
export const TRIP_STATUSES = [
  "draft",
  "planned",
  "ongoing",
  "completed",
  "cancelled",
] as const satisfies readonly TripStatus[];

/** Sert à vérifier un statut lu dans l'URL (searchParams). */
export function isTripStatus(value: string): value is TripStatus {
  const statuses: readonly string[] = TRIP_STATUSES;
  return statuses.includes(value);
}

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
