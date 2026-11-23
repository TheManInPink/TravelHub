// @vitest-environment node
import { HttpResponse, http } from "msw";
import {
  getRedirectUrl,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import { newTokens, validTokens } from "./msw/fixtures";
import { DJANGO_URL } from "./msw/handlers";
import { server } from "./msw/server";

const SITE = "http://localhost:3000";

function request(path: string, cookies: Record<string, string> = {}, method = "GET") {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`${SITE}${path}`, { method, headers: cookie ? { cookie } : {} });
}

/** En-tête Set-Cookie de la réponse pour ce cookie. */
function setCookie(response: Response, name: string): string | undefined {
  return response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
}

/** En-tête que NextResponse.next({ request: { headers } }) transmet à la page. */
function forwardedHeader(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name}`);
}

describe("matcher du proxy", () => {
  it("couvre les pages protégées, /login et /register, mais pas l'accueil ni les API", () => {
    for (const url of ["/dashboard", "/trips", "/trips/3/edit", "/login", "/register"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
    }
    for (const url of ["/", "/api/auth/expire", "/api/destinations/3/weather"]) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });

  it("exclut les préchargements de next/link", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: "/trips/3",
        headers: { "next-router-prefetch": "1" },
      }),
    ).toBe(false);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/dashboard", headers: { purpose: "prefetch" } }),
    ).toBe(false);
  });
});

describe("proxy sur une page protégée", () => {
  it("renvoie vers /login?next=… sans aucun cookie", async () => {
    const response = await proxy(request("/trips/3?tab=budget"));

    expect(getRedirectUrl(response)).toBe(`${SITE}/login?next=%2Ftrips%2F3%3Ftab%3Dbudget`);
  });

  it("laisse passer avec th_access et transmet le chemin à verifySession()", async () => {
    const response = await proxy(request("/dashboard", { th_access: validTokens.access }));

    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(forwardedHeader(response, "x-travelhub-path")).toBe("/dashboard");
  });

  it("rafraîchit les jetons sans th_access, sur la réponse et dans la requête transmise", async () => {
    const response = await proxy(request("/trips", { th_refresh: validTokens.refresh }));

    expect(getRedirectUrl(response)).toBeNull();
    // Le navigateur reçoit les deux nouveaux cookies…
    expect(setCookie(response, "th_access")).toContain(`th_access=${newTokens.access}`);
    expect(setCookie(response, "th_access")).toMatch(/Max-Age=840;.*HttpOnly/i);
    expect(setCookie(response, "th_refresh")).toContain(`th_refresh=${newTokens.refresh}`);
    // … et la page de cette même requête les lit déjà.
    const forwardedCookie = forwardedHeader(response, "cookie");
    expect(forwardedCookie).toContain(`th_access=${newTokens.access}`);
    expect(forwardedCookie).toContain(`th_refresh=${newTokens.refresh}`);
  });

  it("supprime les cookies et ajoute expired=1 si Django refuse le refresh", async () => {
    const response = await proxy(request("/trips/3", { th_refresh: "refresh-sur-liste-noire" }));

    expect(getRedirectUrl(response)).toBe(`${SITE}/login?expired=1&next=%2Ftrips%2F3`);
    expect(setCookie(response, "th_access")).toContain("Expires=Thu, 01 Jan 1970");
    expect(setCookie(response, "th_refresh")).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("fait de même si Django ne répond pas", async () => {
    server.use(http.post(`${DJANGO_URL}/api/auth/token/refresh/`, () => HttpResponse.error()));

    const response = await proxy(request("/dashboard", { th_refresh: validTokens.refresh }));

    expect(getRedirectUrl(response)).toBe(`${SITE}/login?expired=1&next=%2Fdashboard`);
  });

  it("ne redirige pas une Server Action (POST) : verifyActionSession() s'en charge", async () => {
    const response = await proxy(request("/trips/new", {}, "POST"));

    expect(getRedirectUrl(response)).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("proxy sur /login et /register", () => {
  it("laisse passer un visiteur sans cookie", async () => {
    const response = await proxy(request("/login?next=%2Ftrips"));

    expect(getRedirectUrl(response)).toBeNull();
  });

  it("envoie vers /dashboard un utilisateur qui a un cookie", async () => {
    for (const path of ["/login", "/register"]) {
      const response = await proxy(request(path, { th_refresh: validTokens.refresh }));
      expect(getRedirectUrl(response)).toBe(`${SITE}/dashboard`);
    }
  });

  it("affiche la connexion avec expired=1, même avec un cookie, pour éviter une boucle", async () => {
    const response = await proxy(request("/login?expired=1", { th_access: "jeton-invalide" }));

    expect(getRedirectUrl(response)).toBeNull();
  });
});
