// @vitest-environment node
import { HttpResponse, http } from "msw";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/destinations/[destinationId]/weather/route";
import type { ApiErrorBody } from "@/types/api";
import { cookieJar } from "../../../mocks/cookies";
import { kyotoWeather, validTokens } from "../../../msw/fixtures";
import { DJANGO_URL, errorBody } from "../../../msw/handlers";
import { server } from "../../../msw/server";

const DJANGO_WEATHER = `${DJANGO_URL}/api/destinations/:id/weather/`;

/** Appelle le Route Handler comme le ferait Next.js pour /api/destinations/{id}/weather. */
function getWeather(destinationId: string, init: { signal?: AbortSignal } = {}) {
  const request = new NextRequest(
    `http://localhost:3000/api/destinations/${destinationId}/weather`,
    init,
  );
  return GET(request, { params: Promise.resolve({ destinationId }) });
}

/** Adresses des requêtes envoyées à Django pendant le test. */
function djangoRequests(): string[] {
  const urls: string[] = [];
  server.events.on("request:start", ({ request }) => {
    urls.push(new URL(request.url).pathname);
  });
  return urls;
}

/** Remplace la réponse de Django pour la météo par une erreur. */
function djangoWeatherReplies(status: number, body: ApiErrorBody, headers: HeadersInit = {}) {
  server.use(http.get(DJANGO_WEATHER, () => HttpResponse.json(body, { status, headers })));
}

describe("GET /api/destinations/[destinationId]/weather", () => {
  beforeEach(() => {
    cookieJar.set("th_access", validTokens.access);
  });

  it("renvoie la météo de Django, avec le jeton et un cache privé de 10 minutes", async () => {
    let authorization: string | null = null;
    server.use(
      http.get(DJANGO_WEATHER, ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json(kyotoWeather);
      }),
    );

    const response = await getWeather("3");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(kyotoWeather);
    expect(authorization).toBe(`Bearer ${validTokens.access}`);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=600");
    expect(response.headers.get("Vary")).toContain("Cookie");
  });

  it("répond 401 not_authenticated sans cookie, sans appeler Django", async () => {
    cookieJar.clear();
    const requests = djangoRequests();

    const response = await getWeather("3");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_authenticated" },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(requests).toEqual([]);
  });

  it("répond 401 not_authenticated quand Django refuse le jeton", async () => {
    cookieJar.set("th_access", "jeton-expire");

    const response = await getWeather("3");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_authenticated" },
    });
  });

  it("garde le statut, le code et le message de Django pour no_data_available", async () => {
    const message = "Aucune prévision pour le 2027-04-08 au 2027-04-14.";
    djangoWeatherReplies(404, errorBody("no_data_available", message));

    const response = await getWeather("3");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "no_data_available", message },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("répond 503 avec un message en français quand Open-Meteo est indisponible", async () => {
    djangoWeatherReplies(
      503,
      errorBody("external_service_unavailable", "Open-Meteo est indisponible (erreur 500)."),
    );

    const response = await getWeather("3");

    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: { code: "external_service_unavailable" } });
    expect(JSON.stringify(body)).toContain("Le service externe (météo ou pays) ne répond pas");
  });

  it("transmet le Retry-After d'un 429", async () => {
    djangoWeatherReplies(429, errorBody("throttled", "Requête ralentie."), { "Retry-After": "30" });

    const response = await getWeather("3");

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toEqual({
      error: { code: "throttled", message: "Trop de requêtes. Réessayez dans 30 secondes." },
    });
  });

  it("répond 502 network_error quand Django est injoignable", async () => {
    server.use(http.get(DJANGO_WEATHER, () => HttpResponse.error()));

    const response = await getWeather("3");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "network_error" } });
  });

  it("répond 404 pour un identifiant invalide, sans demander la météo à Django", async () => {
    const requests = djangoRequests();

    const response = await getWeather("abc");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "not_found" } });
    expect(requests).toEqual(["/api/auth/me/"]);
  });

  it("répond 499 sans corps quand le navigateur a annulé la requête", async () => {
    const controller = new AbortController();
    controller.abort();

    const response = await getWeather("3", { signal: controller.signal });

    expect(response.status).toBe(499);
    await expect(response.text()).resolves.toBe("");
  });
});
