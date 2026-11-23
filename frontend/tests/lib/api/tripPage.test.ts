// @vitest-environment node
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { loadTripPage } from "@/lib/api/tripPage";
import { rejection } from "../../helpers";
import { cookieJar } from "../../mocks/cookies";
import { japanTripDetail, validTokens } from "../../msw/fixtures";
import { DJANGO_URL, errorBody } from "../../msw/handlers";
import { server } from "../../msw/server";

function respondWith(status: number, code: string, headers: Record<string, string> = {}) {
  server.use(
    http.get(`${DJANGO_URL}/api/trips/:id/`, () =>
      HttpResponse.json(errorBody(code, "…"), { status, headers }),
    ),
  );
}

beforeEach(() => {
  cookieJar.set("th_access", validTokens.access);
});

describe("loadTripPage", () => {
  it("renvoie le voyage avec ses destinations", async () => {
    await expect(loadTripPage("1")).resolves.toEqual({ kind: "trip", trip: japanTripDetail });
  });

  it("appelle notFound() pour un 404 de Django ou un identifiant qui n'est pas un entier", async () => {
    for (const id of ["99", "abc"]) {
      const error = await rejection(loadTripPage(id));
      // notFound() lève une erreur dont le digest dit à Next.js d'afficher not-found.tsx.
      expect(error).toHaveProperty("digest", "NEXT_HTTP_ERROR_FALLBACK;404");
    }
  });

  it("signale un accès refusé (403)", async () => {
    respondWith(403, "permission_denied");

    await expect(loadTripPage("1")).resolves.toEqual({ kind: "forbidden" });
  });

  it("donne le message français d'un 429 ou d'un 503", async () => {
    respondWith(429, "throttled", { "Retry-After": "120" });
    await expect(loadTripPage("1")).resolves.toEqual({
      kind: "error",
      // ICU met une espace insécable entre le nombre et l'unité.
      message: "Trop de requêtes. Réessayez dans 2 minutes.",
    });

    respondWith(503, "internal_error");
    await expect(loadTripPage("1")).resolves.toEqual({
      kind: "error",
      message: "Le serveur a rencontré une erreur. Réessayez plus tard.",
    });
  });
});
