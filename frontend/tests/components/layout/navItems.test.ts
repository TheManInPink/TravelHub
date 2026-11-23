import { describe, expect, it } from "vitest";
import { activeNavHref } from "@/components/layout/navItems";

describe("activeNavHref", () => {
  it("marque le lien dont l'adresse est le plus long préfixe du chemin", () => {
    expect(activeNavHref("/dashboard")).toBe("/dashboard");
    expect(activeNavHref("/trips")).toBe("/trips");
    expect(activeNavHref("/trips/new")).toBe("/trips/new");
    expect(activeNavHref("/trips/3")).toBe("/trips");
    expect(activeNavHref("/trips/3/destinations/7/edit")).toBe("/trips");
  });

  it("ne confond pas un préfixe de mot avec un segment", () => {
    expect(activeNavHref("/tripsfoo")).toBeNull();
    expect(activeNavHref("/trips/newest")).toBe("/trips");
    expect(activeNavHref("/")).toBeNull();
  });
});
