// @vitest-environment node
// Code serveur : nous le testons dans Node, sans jsdom. Le fetch de Node refuse le
// AbortSignal de jsdom.
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { djangoFetch } from "@/lib/api/django";
import { ApiError } from "@/lib/errors";
import type { User } from "@/types/api";
import { rejection } from "../../helpers";
import { cookieJar } from "../../mocks/cookies";
import { DJANGO_URL, errorBody } from "../../msw/handlers";
import { server } from "../../msw/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const alice: User = {
  id: 1,
  username: "alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Tremblay",
  date_joined: "2026-10-01T12:00:00Z",
};

describe("djangoFetch", () => {
  it("préfixe DJANGO_API_URL, ajoute le slash final et envoie le jeton du cookie", async () => {
    let received: Request | undefined;
    server.use(
      http.get(`${DJANGO_URL}/api/auth/me/`, ({ request }) => {
        received = request;
        return HttpResponse.json(alice);
      }),
    );
    cookieJar.set("th_access", "jeton-acces");

    await expect(djangoFetch<User>("/api/auth/me")).resolves.toEqual(alice);

    expect(received?.url).toBe(`${DJANGO_URL}/api/auth/me/`);
    expect(received?.headers.get("Authorization")).toBe("Bearer jeton-acces");
    expect(received?.headers.get("Accept")).toBe("application/json");
    expect(received?.headers.get("X-Request-ID")).toMatch(UUID);
    // Un GET n'a pas de corps, donc pas de Content-Type.
    expect(received?.headers.get("Content-Type")).toBeNull();
  });

  it("garde le slash avant la chaîne de requête", async () => {
    let url = "";
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({ count: 0, next: null, previous: null, results: [] });
      }),
    );
    await djangoFetch("/api/trips?status=planned");
    expect(url).toBe(`${DJANGO_URL}/api/trips/?status=planned`);
  });

  it("envoie le corps en JSON, sans jeton avec l'option public", async () => {
    let received: Request | undefined;
    let body: unknown;
    server.use(
      http.post(`${DJANGO_URL}/api/auth/token/`, async ({ request }) => {
        received = request;
        body = await request.json();
        return HttpResponse.json({ access: "a", refresh: "r" });
      }),
    );
    cookieJar.set("th_access", "ancien-jeton");

    await djangoFetch("/api/auth/token/", {
      method: "POST",
      body: { username: "alice", password: "secret" },
      public: true,
    });

    expect(received?.headers.get("Authorization")).toBeNull();
    expect(received?.headers.get("Content-Type")).toBe("application/json");
    expect(body).toEqual({ username: "alice", password: "secret" });
  });

  it("n'envoie pas d'en-tête Authorization sans cookie", async () => {
    let authorization: string | null = "absent";
    server.use(
      http.get(`${DJANGO_URL}/api/auth/me/`, ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json(
          errorBody("not_authenticated", "Informations d'authentification non fournies."),
          { status: 401 },
        );
      }),
    );
    const error = await rejection(djangoFetch("/api/auth/me/"));
    expect(authorization).toBeNull();
    expect(error).toMatchObject({ status: 401, code: "not_authenticated" });
  });

  it("lit l'enveloppe d'erreur de Django et garde son X-Request-ID", async () => {
    server.use(
      http.patch(`${DJANGO_URL}/api/trips/4/`, () =>
        HttpResponse.json(
          errorBody("validation_error", "Les données envoyées sont invalides.", {
            end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
          }),
          { status: 400, headers: { "X-Request-ID": "req-400" } },
        ),
      ),
    );

    const error = await rejection(
      djangoFetch("/api/trips/4/", { method: "PATCH", body: { end_date: "2026-01-01" } }),
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_error",
      message: "Les données envoyées sont invalides.",
      details: { end_date: ["La date de fin doit être postérieure ou égale à la date de début."] },
      requestId: "req-400",
    });
  });

  it("renvoie undefined pour un 204", async () => {
    server.use(
      http.delete(`${DJANGO_URL}/api/trips/4/`, () => new HttpResponse(null, { status: 204 })),
    );
    await expect(djangoFetch<void>("/api/trips/4/", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("garde le Retry-After d'un 429", async () => {
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, () =>
        HttpResponse.json(errorBody("throttled", "Requête ralentie."), {
          status: 429,
          headers: { "Retry-After": "42" },
        }),
      ),
    );
    const error = await rejection(djangoFetch("/api/trips/"));
    expect(error).toMatchObject({ status: 429, code: "throttled", retryAfter: 42 });
  });

  it("donne un code connu à une page d'erreur qui n'est pas du JSON", async () => {
    server.use(
      http.get(`${DJANGO_URL}/api/trips/`, () =>
        HttpResponse.html("<h1>Bad Gateway</h1>", { status: 502 }),
      ),
    );
    const error = await rejection(djangoFetch("/api/trips/"));
    expect(error).toMatchObject({ status: 502, code: "internal_error" });
  });

  it("transforme une panne réseau en ApiError network_error", async () => {
    server.use(http.get(`${DJANGO_URL}/api/trips/`, () => HttpResponse.error()));
    const error = await rejection(djangoFetch("/api/trips/"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "network_error" });
  });

  it("transforme un délai dépassé en ApiError timeout", async () => {
    // Nous remplaçons le délai de 15 s par un signal déjà expiré.
    const expired = AbortSignal.abort(new DOMException("Délai dépassé", "TimeoutError"));
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(expired);
    server.use(http.get(`${DJANGO_URL}/api/trips/`, () => HttpResponse.json({})));

    const error = await rejection(djangoFetch("/api/trips/"));

    expect(AbortSignal.timeout).toHaveBeenCalledWith(15_000);
    expect(error).toMatchObject({
      status: 0,
      code: "timeout",
      message: "Le serveur se réveille, réessayez dans un instant",
    });
  });

  it("refuse un chemin qui enverrait le jeton à un autre hôte", async () => {
    cookieJar.set("th_access", "jeton-acces");
    await expect(djangoFetch("//evil.test/api/")).rejects.toThrow("changer d'hôte");
    await expect(djangoFetch("/\\evil.test/api/")).rejects.toThrow("changer d'hôte");
    await expect(djangoFetch("api/trips/")).rejects.toThrow("commencer par");
  });
});
