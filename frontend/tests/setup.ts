import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { cookieJar } from "./mocks/cookies";
import { DJANGO_URL } from "./msw/handlers";
import { server } from "./msw/server";

// Adresse de l'API Django simulée par MSW. djangoFetch la relit à chaque appel.
process.env.DJANGO_API_URL = DJANGO_URL;

// cookies() de next/headers ne marche que pendant une requête Next.js. Dans tous les
// tests, il lit le faux magasin de tests/mocks/cookies.ts.
vi.mock("next/headers", async () => {
  const { fakeCookies } = await import("./mocks/cookies");
  return { cookies: fakeCookies };
});

// Une requête sans gestionnaire MSW fait échouer le test, au lieu de partir sur le réseau.
// MSW 3 a renommé l'option onUnhandledRequest en onUnhandledFrame.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  // Sans globals: true, Testing Library ne démonte pas les composants tout seul.
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  cookieJar.clear();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});
