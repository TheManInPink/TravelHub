// @vitest-environment node
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import {
  createTrip,
  deleteTrip,
  getTrip,
  getTripStats,
  isTripOrdering,
  listTrips,
  type TripOrdering,
  updateTrip,
} from "@/lib/api/trips";
import { ApiError, toUserMessage } from "@/lib/errors";
import { rejection } from "../../helpers";
import { japanTrip, japanTripDetail, japanTripStats, tripPage } from "../../msw/fixtures";
import { DJANGO_URL } from "../../msw/handlers";
import { server } from "../../msw/server";

/** Compte les requêtes reçues par l'API simulée, pour vérifier qu'aucune n'est partie. */
function countRequests(): { count: number } {
  const counter = { count: 0 };
  server.events.on("request:start", () => {
    counter.count += 1;
  });
  return counter;
}

describe("listTrips", () => {
  it("lit une page de voyages", async () => {
    const page = await listTrips();

    expect(page.count).toBe(2);
    expect(page.next).toBeNull();
    expect(page.results.map((trip) => trip.title)).toEqual(["Japon 2027", "Portugal"]);
    expect(page.results[0]).toMatchObject({ budget: "4500.00", my_role: "owner" });
  });

  it("envoie les filtres avec les noms de paramètres de Django", async () => {
    let params: Record<string, string> = {};
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, ({ request }) => {
        params = Object.fromEntries(new URL(request.url).searchParams);
        return HttpResponse.json(tripPage);
      }),
    );

    await listTrips({
      status: "planned",
      search: "  japon  ",
      page: 2,
      ordering: "-start_date",
      start_date__gte: "2027-01-01",
      end_date__lte: "2027-12-31",
    });

    expect(params).toEqual({
      status: "planned",
      search: "japon",
      page: "2",
      ordering: "-start_date",
      start_date__gte: "2027-01-01",
      end_date__lte: "2027-12-31",
    });
  });

  it("n'envoie ni la page 1 ni une recherche vide", async () => {
    let url = "";
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json(tripPage);
      }),
    );
    await listTrips({ page: 1, search: "   " });
    expect(url).toBe(`${DJANGO_URL}/api/trips/`);
  });

  it("refuse un tri que Django ignorerait sans erreur", async () => {
    const requests = countRequests();
    // Valeur lue dans l'URL sans vérification, d'où la conversion.
    const ordering = "budget" as TripOrdering;

    await expect(listTrips({ ordering })).rejects.toThrow(RangeError);
    expect(requests.count).toBe(0);
    expect(isTripOrdering("-title")).toBe(true);
    expect(isTripOrdering("budget")).toBe(false);
  });
});

describe("getTrip", () => {
  it("renvoie le voyage avec ses destinations et leurs activités", async () => {
    const trip = await getTrip(1);
    expect(trip).toEqual(japanTripDetail);
    expect(trip.destinations[0].activities[0].cost).toBe("45.00");
  });

  it("transforme la 404 de Django en ApiError not_found", async () => {
    const error = await rejection(getTrip(999));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "not_found", message: "Pas trouvé." });
    expect(toUserMessage(error)).toBe("Cet élément est introuvable. Il a peut-être été supprimé.");
  });

  it("refuse un identifiant qui n'est pas un entier, sans appeler Django", async () => {
    const requests = countRequests();
    // Un paramètre d'URL comme « ../auth/me » ne doit pas viser une autre route de Django.
    for (const id of ["abc", "../auth/me", "0", "1.5"]) {
      const error = await rejection(getTrip(id));
      expect(error).toMatchObject({ status: 404, code: "not_found" });
    }
    expect(requests.count).toBe(0);
  });
});

describe("création, modification et suppression", () => {
  it("createTrip envoie un POST et renvoie le voyage créé", async () => {
    let body: unknown;
    server.use(
      http.post(`${DJANGO_URL}/api/trips/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(japanTrip, { status: 201 });
      }),
    );

    const payload = {
      title: "Japon 2027",
      start_date: "2027-04-01",
      end_date: "2027-04-14",
      budget: "4500.00",
    };
    await expect(createTrip(payload)).resolves.toEqual(japanTrip);
    expect(body).toEqual(payload);
  });

  it("updateTrip envoie un PATCH avec les seuls champs donnés", async () => {
    let method = "";
    let body: unknown;
    server.use(
      http.patch(`${DJANGO_URL}/api/trips/1/`, async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json({ ...japanTrip, status: "ongoing" });
      }),
    );

    const trip = await updateTrip("1", { status: "ongoing" });

    expect(method).toBe("PATCH");
    expect(body).toEqual({ status: "ongoing" });
    expect(trip.status).toBe("ongoing");
  });

  it("deleteTrip attend le 204 de Django", async () => {
    let deleted = false;
    server.use(
      http.delete(`${DJANGO_URL}/api/trips/1/`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(deleteTrip(1)).resolves.toBeUndefined();
    expect(deleted).toBe(true);
  });

  it("getTripStats lit /api/trips/{id}/stats/", async () => {
    server.use(
      http.get(`${DJANGO_URL}/api/trips/1/stats/`, () => HttpResponse.json(japanTripStats)),
    );
    const stats = await getTripStats(1);
    expect(stats.remaining_budget).toBe("4455.00");
    expect(stats.by_category[0].label).toBe("Culture");
  });
});
