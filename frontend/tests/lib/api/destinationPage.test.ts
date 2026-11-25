// @vitest-environment node
import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { loadDestinationPage } from "@/lib/api/destinationPage";
import { rejection } from "../../helpers";
import { cookieJar } from "../../mocks/cookies";
import { kyotoPage, validTokens } from "../../msw/fixtures";
import { djangoGraphql, gqlErrorBody } from "../../msw/handlers";
import { server } from "../../msw/server";

// notFound() lève une erreur dont le digest dit à Next.js d'afficher not-found.tsx.
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

beforeEach(() => {
  cookieJar.set("th_access", validTokens.access);
});

describe("loadDestinationPage", () => {
  it("renvoie la destination, son voyage et ses activités", async () => {
    await expect(loadDestinationPage("1", "3")).resolves.toEqual({
      kind: "destination",
      destination: kyotoPage,
    });
  });

  it("appelle notFound() pour l'erreur not_found de GraphQL (statut 200)", async () => {
    const error = await rejection(loadDestinationPage("1", "99"));
    expect(error).toHaveProperty("digest", NOT_FOUND_DIGEST);
  });

  it("appelle notFound() sans requête pour un identifiant qui n'est pas un entier", async () => {
    server.use(
      djangoGraphql.query("DestinationPage", () => {
        throw new Error("Django ne doit pas être appelé.");
      }),
    );

    const error = await rejection(loadDestinationPage("1", "abc"));
    expect(error).toHaveProperty("digest", NOT_FOUND_DIGEST);
  });

  it("appelle notFound() quand la destination appartient à un autre voyage", async () => {
    const error = await rejection(loadDestinationPage("2", "3"));
    expect(error).toHaveProperty("digest", NOT_FOUND_DIGEST);
  });

  it("donne un message en français et la référence pour une panne d'un service", async () => {
    server.use(
      djangoGraphql.query("DestinationPage", () =>
        HttpResponse.json(gqlErrorBody("destination", "internal_error", "Erreur interne."), {
          headers: { "X-Request-ID": "req-gql" },
        }),
      ),
    );

    await expect(loadDestinationPage("1", "3")).resolves.toEqual({
      kind: "error",
      message: "Le serveur a rencontré une erreur. Réessayez plus tard.",
      reference: "req-gql",
    });
  });
});
