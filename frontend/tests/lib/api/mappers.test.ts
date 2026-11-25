import { describe, expect, it } from "vitest";
import {
  activityCategoryFromGql,
  activityCategoryToGql,
  parseId,
  participantRoleFromGql,
  participantRoleToGql,
  toGqlId,
  tripStatusFromGql,
  tripStatusToGql,
} from "@/lib/api/mappers";
import type { ActivityCategory, ParticipantRole, TripStatus } from "@/types/api";

const STATUSES: TripStatus[] = ["draft", "planned", "ongoing", "completed", "cancelled"];
const ROLES: ParticipantRole[] = ["owner", "editor", "viewer"];
const CATEGORIES: ActivityCategory[] = [
  "sightseeing",
  "culture",
  "food",
  "nature",
  "sport",
  "transport",
  "accommodation",
  "other",
];

describe("enums REST et GraphQL", () => {
  it("convertit chaque statut dans les deux sens", () => {
    for (const status of STATUSES) {
      expect(tripStatusToGql(status)).toBe(status.toUpperCase());
      expect(tripStatusFromGql(tripStatusToGql(status))).toBe(status);
    }
  });

  it("convertit chaque rôle dans les deux sens", () => {
    for (const role of ROLES) {
      expect(participantRoleToGql(role)).toBe(role.toUpperCase());
      expect(participantRoleFromGql(participantRoleToGql(role))).toBe(role);
    }
  });

  it("convertit chaque catégorie dans les deux sens", () => {
    for (const category of CATEGORIES) {
      expect(activityCategoryToGql(category)).toBe(category.toUpperCase());
      expect(activityCategoryFromGql(activityCategoryToGql(category))).toBe(category);
    }
  });
});

describe("identifiants", () => {
  it("écrit l'identifiant GraphQL en chaîne", () => {
    expect(toGqlId(3)).toBe("3");
    expect(toGqlId("3")).toBe("3");
  });

  it("accepte seulement un entier positif", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId(12)).toBe(12);
    for (const value of [
      "0",
      "-1",
      "1.5",
      "1e3",
      "abc",
      "",
      " 3",
      "../auth/me",
      "99999999999999999",
    ]) {
      expect(parseId(value)).toBeNull();
    }
  });
});
