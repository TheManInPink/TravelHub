// @vitest-environment node
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { gqlFetch } from "@/lib/api/graphql";
import { ApiError } from "@/lib/errors";
import { rejection } from "../../helpers";
import { cookieJar } from "../../mocks/cookies";
import { GRAPHQL_URL, djangoGraphql } from "../../msw/handlers";
import { server } from "../../msw/server";

const QUERY = "query DestinationCity($id: ID!) { destination(id: $id) { id city } }";

interface DestinationCity {
  destination: { id: string; city: string } | null;
}

describe("gqlFetch", () => {
  it("envoie la query et ses variables en POST sur /graphql/ et renvoie data", async () => {
    let received: Request | undefined;
    let body: unknown;
    server.use(
      http.post(GRAPHQL_URL, async ({ request }) => {
        received = request;
        body = await request.json();
        return HttpResponse.json({ data: { destination: { id: "3", city: "Kyoto" } } });
      }),
    );
    cookieJar.set("th_access", "jeton-acces");

    const data = await gqlFetch<DestinationCity, { id: string }>(QUERY, { id: "3" });

    expect(data).toEqual({ destination: { id: "3", city: "Kyoto" } });
    expect(received?.method).toBe("POST");
    expect(received?.headers.get("Authorization")).toBe("Bearer jeton-acces");
    expect(received?.headers.get("Content-Type")).toBe("application/json");
    expect(body).toEqual({ query: QUERY, variables: { id: "3" } });
  });

  it("lève ApiError validation_error avec ses details quand errors[] n'est pas vide", async () => {
    // Erreur d'un resolver : statut 200, data en partie vide et extensions.code.
    server.use(
      djangoGraphql.mutation("CreateDestination", () =>
        HttpResponse.json({
          data: { createDestination: null },
          errors: [
            {
              message: "Les données envoyées sont invalides.",
              path: ["createDestination"],
              extensions: {
                code: "validation_error",
                details: { departureDate: ["La date de départ précède la date d'arrivée."] },
              },
            },
          ],
        }),
      ),
    );

    const error = await rejection(
      gqlFetch(
        "mutation CreateDestination($input: DestinationCreateInput!) { createDestination(input: $input) { destination { id } } }",
        { input: {} },
      ),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: "validation_error",
      message: "Les données envoyées sont invalides.",
      details: { departureDate: ["La date de départ précède la date d'arrivée."] },
    });
  });

  it("lit le code d'un 401 sans data (jeton expiré)", async () => {
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json(
          {
            errors: [
              {
                message: "Le jeton n'est valide pour aucun type de jeton",
                extensions: { code: "token_not_valid", details: { messages: [] } },
              },
            ],
          },
          { status: 401 },
        ),
      ),
    );
    const error = await rejection(gqlFetch(QUERY, { id: "3" }));
    expect(error).toMatchObject({ status: 401, code: "token_not_valid" });
  });

  it("garde le Retry-After d'un 429", async () => {
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json(
          {
            errors: [
              { message: "Requête ralentie.", extensions: { code: "throttled", details: {} } },
            ],
          },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );
    const error = await rejection(gqlFetch(QUERY, { id: "3" }));
    expect(error).toMatchObject({ status: 429, code: "throttled", retryAfter: 30 });
  });

  it("traite un 400 sans code comme une erreur de requête", async () => {
    // Erreur de syntaxe ou champ inconnu : graphql-core répond sans extensions.code.
    server.use(
      http.post(GRAPHQL_URL, () =>
        HttpResponse.json(
          {
            errors: [
              {
                message: "Cannot query field 'ville' on type 'Destination'.",
                locations: [{ line: 1, column: 42 }],
              },
            ],
          },
          { status: 400 },
        ),
      ),
    );
    const error = await rejection(gqlFetch(QUERY, { id: "3" }));
    expect(error).toMatchObject({ status: 400, code: "invalid_query", details: {} });
  });

  it("lève une ApiError si la réponse n'a ni data ni errors", async () => {
    server.use(
      http.post(GRAPHQL_URL, () => HttpResponse.html("<h1>Bad Gateway</h1>", { status: 502 })),
    );
    const error = await rejection(gqlFetch(QUERY, { id: "3" }));
    expect(error).toMatchObject({ status: 502, code: "internal_error" });
  });
});
