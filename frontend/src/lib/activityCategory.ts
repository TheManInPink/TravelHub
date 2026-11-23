import type { ActivityCategory } from "@/types/api";

// Libellés français des catégories d'activité. Ce sont ceux de ActivityCategory dans
// Django (apps/itinerary/models.py). L'API REST n'envoie que la valeur ("food").

export const ACTIVITY_CATEGORY_LABELS: Readonly<Record<ActivityCategory, string>> = {
  sightseeing: "Visite",
  culture: "Culture",
  food: "Restauration",
  nature: "Nature",
  sport: "Sport",
  transport: "Transport",
  accommodation: "Hébergement",
  other: "Autre",
};

/** « Restauration » pour "food". */
export function activityCategoryLabel(category: ActivityCategory): string {
  return ACTIVITY_CATEGORY_LABELS[category];
}
