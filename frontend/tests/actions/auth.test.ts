// @vitest-environment node
// Server Actions : nous les appelons comme des fonctions, avec MSW à la place de Django.
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { login, logout, register } from "@/actions/auth";
import type { RegisterInput } from "@/lib/validation/auth";
import { redirectTarget } from "../helpers";
import { cookieJar } from "../mocks/cookies";
import { ALICE_PASSWORD, newTokens, validTokens } from "../msw/fixtures";
import { DJANGO_URL } from "../msw/handlers";
import { server } from "../msw/server";

// revalidatePath() ne marche que dans Next.js. Ici, c'est une fonction espion.
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

beforeEach(() => {
  revalidatePath.mockClear();
});

const newAccount: RegisterInput = {
  username: "hélène",
  email: "helene@example.com",
  password: "Voyage-Gaspesie-2027",
  password_confirm: "Voyage-Gaspesie-2027",
  first_name: "Hélène",
  last_name: "Gagnon",
};

describe("login", () => {
  it("pose les cookies et revient à la page demandée", async () => {
    const target = await redirectTarget(
      login({ username: "alice", password: ALICE_PASSWORD }, "/trips/3"),
    );

    expect(target).toBe("/trips/3");
    expect(cookieJar.get("th_access")).toBe(newTokens.access);
    expect(cookieJar.get("th_refresh")).toBe(newTokens.refresh);
  });

  it("refuse next=//evil.com et next=/\\evil.com, et redirige vers /dashboard", async () => {
    for (const next of ["//evil.com", "/\\evil.com"]) {
      await expect(
        redirectTarget(login({ username: "alice", password: ALICE_PASSWORD }, next)),
      ).resolves.toBe("/dashboard");
    }
  });

  it("renvoie le message français de no_active_account, sans poser de cookie", async () => {
    const result = await login({ username: "alice", password: "mauvais" });

    expect(result).toEqual({
      ok: false,
      message: "Nom d'utilisateur ou mot de passe incorrect.",
      fieldErrors: {},
    });
    expect(cookieJar.size).toBe(0);
  });

  it("revalide avec Zod avant d'appeler Django", async () => {
    // Si l'action appelait Django, ce gestionnaire ferait échouer le test.
    server.use(
      http.post(`${DJANGO_URL}/api/auth/token/`, () => {
        throw new Error("Django ne doit pas être appelé.");
      }),
    );

    const result = await login({ username: " ", password: "" });

    expect(result?.fieldErrors).toEqual({
      username: ["Entrez votre nom d'utilisateur."],
      password: ["Entrez votre mot de passe."],
    });
  });

  it("donne le délai d'attente d'un 429", async () => {
    server.use(
      http.post(`${DJANGO_URL}/api/auth/token/`, () =>
        HttpResponse.json(
          { error: { code: "throttled", message: "Request was throttled.", details: {} } },
          { status: 429, headers: { "Retry-After": "90" } },
        ),
      ),
    );

    const result = await login({ username: "alice", password: ALICE_PASSWORD });

    // ICU met une espace insécable (U+00A0) entre le nombre et « minutes ».
    expect(result?.message).toBe("Trop de requêtes. Réessayez dans 2 minutes.");
  });
});

describe("register", () => {
  it("crée le compte, pose les cookies et redirige vers le tableau de bord", async () => {
    let body: unknown;
    server.use(
      http.post(`${DJANGO_URL}/api/auth/register/`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            user: { id: 9, ...newAccount, date_joined: "2026-11-23T00:00:00Z" },
            tokens: newTokens,
          },
          { status: 201 },
        );
      }),
    );

    await expect(redirectTarget(register(newAccount))).resolves.toBe("/dashboard");

    // La confirmation du mot de passe n'est pas envoyée à Django.
    expect(body).toEqual({
      username: "hélène",
      email: "helene@example.com",
      password: "Voyage-Gaspesie-2027",
      first_name: "Hélène",
      last_name: "Gagnon",
    });
    expect(cookieJar.get("th_access")).toBe(newTokens.access);
  });

  it("met les erreurs de validation de Django sous les champs", async () => {
    const result = await register({ ...newAccount, username: "alice" });

    expect(result).toEqual({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { username: ["Un utilisateur avec ce nom existe déjà."] },
    });
    expect(cookieJar.size).toBe(0);
  });
});

describe("logout", () => {
  it("met le refresh sur liste noire, supprime les cookies et redirige vers /login", async () => {
    let revoked: unknown;
    server.use(
      http.post(`${DJANGO_URL}/api/auth/logout/`, async ({ request }) => {
        revoked = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    cookieJar.set("th_access", validTokens.access).set("th_refresh", validTokens.refresh);

    await expect(redirectTarget(logout())).resolves.toBe("/login");

    expect(revoked).toEqual({ refresh: validTokens.refresh });
    expect(cookieJar.size).toBe(0);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("supprime les cookies même si Django répond 401", async () => {
    cookieJar.set("th_access", "jeton-expire").set("th_refresh", validTokens.refresh);

    await expect(redirectTarget(logout())).resolves.toBe("/login");

    expect(cookieJar.size).toBe(0);
  });
});
