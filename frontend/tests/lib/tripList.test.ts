import { describe, expect, it } from "vitest";
import {
  hasActiveFilters,
  pageCount,
  parseTripListQuery,
  tripListHref,
  tripListSummary,
} from "@/lib/tripList";

describe("parseTripListQuery", () => {
  it("lit le statut, la recherche, le tri et la page", () => {
    expect(
      parseTripListQuery({
        status: "planned",
        search: "  paris ",
        ordering: "-start_date",
        page: "3",
      }),
    ).toEqual({ status: "planned", search: "paris", ordering: "-start_date", page: 3 });
  });

  it("ignore les valeurs inconnues, comme si elles n'étaient pas dans l'URL", () => {
    expect(
      parseTripListQuery({ status: "archived", search: "   ", ordering: "budget", page: "0" }),
    ).toEqual({ status: undefined, search: undefined, ordering: undefined, page: 1 });
  });

  it.each(["-2", "1.5", "abc", "", "9999999"])("donne la page 1 pour page=%s", (page) => {
    expect(parseTripListQuery({ page }).page).toBe(1);
  });

  it("garde la première valeur d'un paramètre répété", () => {
    expect(parseTripListQuery({ status: ["ongoing", "draft"] }).status).toBe("ongoing");
  });

  it("coupe une recherche trop longue", () => {
    expect(parseTripListQuery({ search: "a".repeat(150) }).search).toHaveLength(100);
  });
});

describe("tripListHref", () => {
  it("donne /trips sans filtre, sur la page 1 et avec le tri par défaut", () => {
    expect(tripListHref({})).toBe("/trips");
    expect(tripListHref({ ordering: "start_date", page: 1, search: "  " })).toBe("/trips");
  });

  it("met les filtres et la page dans l'URL", () => {
    expect(
      tripListHref({ status: "draft", search: "tour eiffel", ordering: "title", page: 2 }),
    ).toBe("/trips?status=draft&search=tour+eiffel&ordering=title&page=2");
  });
});

describe("hasActiveFilters", () => {
  it("compte le statut et la recherche, mais pas le tri", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ ordering: "-title" })).toBe(false);
    expect(hasActiveFilters({ status: "draft" })).toBe(true);
    expect(hasActiveFilters({ search: "paris" })).toBe(true);
  });
});

describe("pageCount et tripListSummary", () => {
  it("compte 20 voyages par page", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
    expect(pageCount(45)).toBe(3);
  });

  it("résume la liste en français", () => {
    expect(tripListSummary(1, 1, false)).toBe("1 voyage");
    expect(tripListSummary(4, 1, false)).toBe("4 voyages");
    expect(tripListSummary(2, 1, true)).toBe("2 voyages trouvés");
    expect(tripListSummary(45, 2, false)).toBe("Voyages 21 à 40 sur 45");
    expect(tripListSummary(45, 3, true)).toBe("Voyages 41 à 45 sur 45");
  });
});
