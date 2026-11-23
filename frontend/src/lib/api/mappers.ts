// Conversions entre l'API REST et l'API GraphQL de Django.
// REST écrit les enums en minuscules ("planned") et GraphQL en majuscules ("PLANNED").
// REST donne des identifiants entiers (3) et GraphQL des chaînes ("3").
// Les montants restent des chaînes des deux côtés, donc ils n'ont pas besoin de conversion.
// Chaque correspondance est écrite en entier : si Django ajoute une valeur, TypeScript
// signale la ligne qui manque.

import type { ActivityCategory, ParticipantRole, TripStatus } from "@/types/api";
import type {
  GqlActivityCategory,
  GqlId,
  GqlParticipantRole,
  GqlTripStatus,
} from "@/types/graphql";

const TRIP_STATUS_TO_GQL: Record<TripStatus, GqlTripStatus> = {
  draft: "DRAFT",
  planned: "PLANNED",
  ongoing: "ONGOING",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const TRIP_STATUS_FROM_GQL: Record<GqlTripStatus, TripStatus> = {
  DRAFT: "draft",
  PLANNED: "planned",
  ONGOING: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const PARTICIPANT_ROLE_TO_GQL: Record<ParticipantRole, GqlParticipantRole> = {
  owner: "OWNER",
  editor: "EDITOR",
  viewer: "VIEWER",
};

const PARTICIPANT_ROLE_FROM_GQL: Record<GqlParticipantRole, ParticipantRole> = {
  OWNER: "owner",
  EDITOR: "editor",
  VIEWER: "viewer",
};

const ACTIVITY_CATEGORY_TO_GQL: Record<ActivityCategory, GqlActivityCategory> = {
  sightseeing: "SIGHTSEEING",
  culture: "CULTURE",
  food: "FOOD",
  nature: "NATURE",
  sport: "SPORT",
  transport: "TRANSPORT",
  accommodation: "ACCOMMODATION",
  other: "OTHER",
};

const ACTIVITY_CATEGORY_FROM_GQL: Record<GqlActivityCategory, ActivityCategory> = {
  SIGHTSEEING: "sightseeing",
  CULTURE: "culture",
  FOOD: "food",
  NATURE: "nature",
  SPORT: "sport",
  TRANSPORT: "transport",
  ACCOMMODATION: "accommodation",
  OTHER: "other",
};

export function tripStatusToGql(status: TripStatus): GqlTripStatus {
  return TRIP_STATUS_TO_GQL[status];
}

export function tripStatusFromGql(status: GqlTripStatus): TripStatus {
  return TRIP_STATUS_FROM_GQL[status];
}

export function participantRoleToGql(role: ParticipantRole): GqlParticipantRole {
  return PARTICIPANT_ROLE_TO_GQL[role];
}

export function participantRoleFromGql(role: GqlParticipantRole): ParticipantRole {
  return PARTICIPANT_ROLE_FROM_GQL[role];
}

export function activityCategoryToGql(category: ActivityCategory): GqlActivityCategory {
  return ACTIVITY_CATEGORY_TO_GQL[category];
}

export function activityCategoryFromGql(category: GqlActivityCategory): ActivityCategory {
  return ACTIVITY_CATEGORY_FROM_GQL[category];
}

/** 3 ou "3" devient l'identifiant GraphQL "3". */
export function toGqlId(id: number | string): GqlId {
  return String(id);
}

/**
 * Identifiant REST tiré d'un paramètre d'URL ("12") ou d'un identifiant GraphQL.
 * Renvoie null si ce n'est pas un entier positif, par exemple "abc" ou "../auth/me".
 */
export function parseId(value: number | string): number | null {
  const text = String(value);
  if (!/^[1-9]\d*$/.test(text)) {
    return null;
  }
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}
