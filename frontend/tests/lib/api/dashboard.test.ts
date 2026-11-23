// @vitest-environment node
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { findCurrentTrip, findLastUpdatedTrip, loadDashboard } from "@/lib/api/dashboard";
import type { Paginated, Trip } from "@/types/api";
import { japanTrip } from "../../msw/fixtures";
import { DJANGO_URL } from "../../msw/handlers";
import { server } from "../../msw/server";

const TODAY = "2026-11-23";

function trip(overrides: Partial<Trip>): Trip {
  return { ...japanTrip, ...overrides };
}

function page(results: Trip[], count = results.length): Paginated<Trip> {
  return { count, next: null, previous: null, results };
}

const finished = trip({
  id: 10,
  title: "Week-end à Montréal",
  status: "completed",
  start_date: "2026-10-09",
  end_date: "2026-10-12",
  updated_at: "2026-10-01T12:00:00Z",
});
const paris = trip({
  id: 11,
  title: "Automne à Paris",
  status: "ongoing",
  start_date: "2026-11-20",
  end_date: "2026-11-27",
  updated_at: "2026-11-20T08:00:00Z",
});
const japan = trip({
  id: 12,
  title: "Printemps au Japon",
  status: "planned",
  start_date: "2027-05-02",
  end_date: "2027-05-14",
  updated_at: "2026-11-22T18:30:00Z",
});
const dakar = trip({
  id: 13,
  title: "Retrouvailles à Dakar",
  status: "draft",
  start_date: "2027-07-31",
  end_date: "2027-08-12",
  updated_at: "2026-11-21T09:00:00Z",
});

describe("loadDashboard", () => {
  it("lance les trois requêtes avec les filtres de Django et combine les réponses", async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        queries.push(Object.fromEntries(params));
        if (params.get("status") === "ongoing") {
          return HttpResponse.json(page([paris]));
        }
        if (params.has("start_date__gte")) {
          // count compte tous les voyages à venir, même ceux des pages suivantes.
          const later = trip({ id: 14, start_date: "2027-09-01", end_date: "2027-09-05" });
          const evenLater = trip({ id: 15, start_date: "2027-12-20", end_date: "2028-01-03" });
          return HttpResponse.json(page([japan, dakar, later, evenLater], 25));
        }
        return HttpResponse.json(page([dakar, japan, paris, finished], 31));
      }),
    );

    const data = await loadDashboard(TODAY);

    // Les trois requêtes partent ensemble, donc dans un ordre quelconque.
    expect(queries).toHaveLength(3);
    expect(queries).toEqual(
      expect.arrayContaining([
        { ordering: "-created_at" },
        { status: "ongoing" },
        { start_date__gte: "2026-11-23", ordering: "start_date" },
      ]),
    );
    expect(data.tripCount).toBe(31);
    expect(data.upcomingCount).toBe(25);
    expect(data.upcomingTrips.map(({ id }) => id)).toEqual([12, 13, 14]);
    expect(data.currentTrip?.id).toBe(paris.id);
    expect(data.lastUpdatedTrip?.id).toBe(japan.id);
  });

  it("renvoie des listes vides pour un utilisateur sans voyage", async () => {
    server.use(http.get(`${DJANGO_URL}/api/trips/`, () => HttpResponse.json(page([]))));

    await expect(loadDashboard(TODAY)).resolves.toEqual({
      tripCount: 0,
      currentTrip: null,
      upcomingCount: 0,
      upcomingTrips: [],
      lastUpdatedTrip: null,
    });
  });
});

describe("findCurrentTrip", () => {
  it("prend d'abord le voyage au statut « En cours »", () => {
    const sameDates = trip({ id: 20, status: "planned", start_date: TODAY, end_date: TODAY });

    expect(findCurrentTrip([paris], [sameDates, paris], TODAY)).toBe(paris);
  });

  it("sinon, cherche un voyage dont les dates contiennent aujourd'hui", () => {
    const planned = { ...paris, status: "planned" as const };

    expect(findCurrentTrip([], [finished, planned, japan], TODAY)).toBe(planned);
  });

  it("ignore un voyage annulé, même si ses dates contiennent aujourd'hui", () => {
    const cancelled = { ...paris, status: "cancelled" as const };

    expect(findCurrentTrip([], [cancelled, japan], TODAY)).toBeNull();
  });
});

describe("findLastUpdatedTrip", () => {
  it("trouve le voyage modifié le plus récemment, quel que soit l'ordre de la liste", () => {
    expect(findLastUpdatedTrip([finished, paris, japan, dakar])).toBe(japan);
    expect(findLastUpdatedTrip([dakar, japan, finished])).toBe(japan);
  });

  it("compare les instants, même avec des microsecondes ou un autre fuseau", () => {
    const withMicroseconds = trip({ id: 30, updated_at: "2026-11-22T18:30:00.000001Z" });
    const withOffset = trip({ id: 31, updated_at: "2026-11-22T14:00:00-05:00" });

    // 14 h à UTC-5 vaut 19 h UTC : c'est le plus récent des trois.
    expect(findLastUpdatedTrip([japan, withMicroseconds, withOffset])).toBe(withOffset);
  });

  it("renvoie null pour une liste vide", () => {
    expect(findLastUpdatedTrip([])).toBeNull();
  });
});
