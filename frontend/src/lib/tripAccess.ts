import type { ParticipantRole } from "@/types/api";

// Rôles dans un voyage et ce qu'ils permettent, d'après les permissions de Django
// (IsTripEditor pour modifier, IsTripOwner pour supprimer). L'interface s'en sert pour
// masquer les boutons inutiles. Django vérifie quand même chaque requête.

/** Libellés de ParticipantRole dans Django (apps/trips/models.py). */
export const PARTICIPANT_ROLE_LABELS: Readonly<Record<ParticipantRole, string>> = {
  owner: "Propriétaire",
  editor: "Éditeur",
  viewer: "Lecteur",
};

/** « Lecteur » pour "viewer". */
export function participantRoleLabel(role: ParticipantRole): string {
  return PARTICIPANT_ROLE_LABELS[role];
}

/** Le propriétaire et les éditeurs modifient le voyage et son itinéraire. */
export function canEditTrip(role: ParticipantRole): boolean {
  return role === "owner" || role === "editor";
}

/** Seul le propriétaire supprime le voyage. */
export function canDeleteTrip(role: ParticipantRole): boolean {
  return role === "owner";
}
