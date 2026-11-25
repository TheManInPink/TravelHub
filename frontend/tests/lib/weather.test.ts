import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { fetchWeather, isRetryable, weatherPath, type WeatherFailure } from "@/lib/weather";
import { kyotoPage, kyotoWeather } from "../msw/fixtures";
import { server } from "../msw/server";

const ROUTE = "/api/destinations/:destinationId/weather";

function failure(status: number): WeatherFailure {
  return { ok: false, status, code: "x", message: "x" };
}

describe("weatherPath", () => {
  it("donne l'adresse du Route Handler avec la version de la destination", () => {
    const path = weatherPath(kyotoPage);
    const url = new URL(path, "http://localhost");

    expect(url.pathname).toBe("/api/destinations/3/weather");
    expect(url.searchParams.get("v")).toBe("Kyoto|JP|2027-04-08|2027-04-14|35.011600|135.768100");
  });

  it("change d'adresse quand la ville ou les dates changent", () => {
    const path = weatherPath(kyotoPage);

    expect(weatherPath({ ...kyotoPage, city: "Osaka", latitude: null, longitude: null })).not.toBe(
      path,
    );
    expect(weatherPath({ ...kyotoPage, departureDate: "2027-04-15" })).not.toBe(path);
  });
});

describe("fetchWeather", () => {
  it("renvoie la météo d'une réponse 200", async () => {
    server.use(http.get(ROUTE, () => HttpResponse.json(kyotoWeather)));

    await expect(
      fetchWeather("/api/destinations/3/weather", new AbortController().signal),
    ).resolves.toEqual({ ok: true, weather: kyotoWeather });
  });

  it("donne un message français pour une page d'erreur sans JSON", async () => {
    server.use(http.get(ROUTE, () => new HttpResponse("<html>Erreur</html>", { status: 500 })));

    await expect(
      fetchWeather("/api/destinations/3/weather", new AbortController().signal),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      code: "internal_error",
      message: "Le serveur a rencontré une erreur. Réessayez plus tard.",
    });
  });

  it("garde la référence de l'erreur envoyée par le Route Handler", async () => {
    server.use(
      http.get(ROUTE, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "Erreur du serveur.", reference: "req-1" } },
          { status: 503 },
        ),
      ),
    );

    await expect(
      fetchWeather("/api/destinations/3/weather", new AbortController().signal),
    ).resolves.toEqual({
      ok: false,
      status: 503,
      code: "internal_error",
      message: "Erreur du serveur.",
      reference: "req-1",
    });
  });

  it("refuse une réponse 200 qui n'a pas la forme de la météo", async () => {
    server.use(http.get(ROUTE, () => HttpResponse.json({ ok: true })));

    await expect(
      fetchWeather("/api/destinations/3/weather", new AbortController().signal),
    ).resolves.toMatchObject({ ok: false, status: 502, code: "unexpected_response" });
  });

  it("renvoie null pour une requête annulée", async () => {
    server.use(http.get(ROUTE, () => HttpResponse.json(kyotoWeather)));
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchWeather("/api/destinations/3/weather", controller.signal),
    ).resolves.toBeNull();
  });
});

describe("isRetryable", () => {
  it("propose un nouvel essai pour le réseau, un 429 et les erreurs du serveur", () => {
    expect(isRetryable(failure(0))).toBe(true);
    expect(isRetryable(failure(429))).toBe(true);
    expect(isRetryable(failure(502))).toBe(true);
    expect(isRetryable(failure(503))).toBe(true);
    expect(isRetryable(failure(504))).toBe(true);
  });

  it("ne propose rien pour une erreur que réessayer ne changerait pas", () => {
    expect(isRetryable(failure(401))).toBe(false);
    expect(isRetryable(failure(404))).toBe(false);
  });
});
