import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("garde un chemin de TravelHub, avec sa chaîne de requête", () => {
    expect(safeNextPath("/trips/3")).toBe("/trips/3");
    expect(safeNextPath("/trips?status=planned&page=2")).toBe("/trips?status=planned&page=2");
    expect(safeNextPath("/trips/3/destinations/7#activites")).toBe(
      "/trips/3/destinations/7#activites",
    );
  });

  it("refuse next=//evil.com et next=/\\evil.com, qui changent d'hôte", () => {
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("\\\\evil.com")).toBe(DEFAULT_NEXT_PATH);
    // new URL retire les tabulations : « /\t/evil.com » devient « //evil.com ».
    expect(safeNextPath("/\t/evil.com")).toBe(DEFAULT_NEXT_PATH);
  });

  it("refuse une adresse absolue ou un autre schéma", () => {
    expect(safeNextPath("https://evil.com/dashboard")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("data:text/html,bonjour")).toBe(DEFAULT_NEXT_PATH);
  });

  it("renvoie vers le tableau de bord sans next, ou vers une page qui bouclerait", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/login?next=/trips")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/register")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/api/auth/expire")).toBe(DEFAULT_NEXT_PATH);
  });
});
