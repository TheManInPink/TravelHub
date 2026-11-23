// @vitest-environment node
// Code serveur : nous le testons dans Node, comme les autres modules de src/lib/api/.
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import {
  getAccessToken,
  getOptionalUser,
  verifyActionSession,
  verifySession,
} from "@/lib/auth/session";
import { ApiError } from "@/lib/errors";
import { redirectTarget, rejection } from "../../helpers";
import { cookieJar, cookieOptions, requestHeaders } from "../../mocks/cookies";
import { aliceAccount, newTokens, validTokens } from "../../msw/fixtures";
import { DJANGO_URL, errorBody } from "../../msw/handlers";
import { server } from "../../msw/server";

describe("setAuthCookies et clearAuthCookies", () => {
  it("pose deux cookies httpOnly, SameSite=Lax, de 14 minutes et d'un jour", async () => {
    await setAuthCookies(newTokens.access, newTokens.refresh);

    expect(cookieJar.get("th_access")).toBe(newTokens.access);
    expect(cookieJar.get("th_refresh")).toBe(newTokens.refresh);
    const common = { httpOnly: true, sameSite: "lax", path: "/", secure: false };
    expect(cookieOptions.get("th_access")).toEqual({ ...common, maxAge: 14 * 60 });
    expect(cookieOptions.get("th_refresh")).toEqual({ ...common, maxAge: 24 * 60 * 60 });
  });

  it("supprime les deux cookies", async () => {
    cookieJar.set("th_access", "a").set("th_refresh", "r").set("autre", "x");

    await clearAuthCookies();

    expect([...cookieJar.keys()]).toEqual(["autre"]);
  });
});

describe("getOptionalUser", () => {
  it("renvoie null sans cookie, sans appeler Django", async () => {
    // onUnhandledFrame: "error" ferait échouer le test si une requête partait.
    await expect(getOptionalUser()).resolves.toBeNull();
    await expect(getAccessToken()).resolves.toBeUndefined();
  });

  it("renvoie l'utilisateur de GET /api/auth/me/", async () => {
    cookieJar.set("th_access", validTokens.access);

    await expect(getOptionalUser()).resolves.toEqual(aliceAccount);
  });

  it("renvoie null si Django répond 401", async () => {
    cookieJar.set("th_access", "jeton-invalide");

    await expect(getOptionalUser()).resolves.toBeNull();
  });

  it("laisse remonter une panne de Django, qui ne veut pas dire que la session a expiré", async () => {
    server.use(
      http.get(`${DJANGO_URL}/api/auth/me/`, () =>
        HttpResponse.json(errorBody("internal_error", "Erreur"), { status: 503 }),
      ),
    );
    cookieJar.set("th_access", validTokens.access);

    const error = await rejection(getOptionalUser());

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503 });
  });
});

describe("verifySession", () => {
  it("renvoie l'utilisateur quand le jeton est valide", async () => {
    cookieJar.set("th_access", validTokens.access);

    await expect(verifySession()).resolves.toEqual(aliceAccount);
  });

  it("redirige vers /api/auth/expire avec la page demandée, transmise par proxy.ts", async () => {
    cookieJar.set("th_access", "jeton-invalide");
    requestHeaders.set("x-travelhub-path", "/trips/3?tab=budget");

    await expect(redirectTarget(verifySession())).resolves.toBe(
      "/api/auth/expire?next=%2Ftrips%2F3%3Ftab%3Dbudget",
    );
    // Un Server Component ne peut pas supprimer de cookie : c'est le travail de la route.
    expect(cookieJar.has("th_access")).toBe(true);
  });

  it("ne reprend pas un chemin dangereux de l'en-tête", async () => {
    requestHeaders.set("x-travelhub-path", "//evil.com");

    await expect(redirectTarget(verifySession())).resolves.toBe(
      "/api/auth/expire?next=%2Fdashboard",
    );
  });
});

describe("verifyActionSession", () => {
  it("supprime les cookies et redirige vers /login?expired=1", async () => {
    cookieJar.set("th_access", "jeton-invalide").set("th_refresh", "refresh-invalide");
    requestHeaders.set("x-travelhub-path", "/trips/3");

    await expect(redirectTarget(verifyActionSession())).resolves.toBe(
      "/login?expired=1&next=%2Ftrips%2F3",
    );
    expect(cookieJar.size).toBe(0);
  });
});
