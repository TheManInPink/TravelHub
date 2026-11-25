import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { resetRequestMocks } from "./mocks/cookies";
import { DJANGO_URL } from "./msw/handlers";
import { server } from "./msw/server";
import { SUPABASE_TEST_BUCKET, SUPABASE_TEST_KEY, SUPABASE_TEST_URL } from "./msw/supabase";

// Adresse de l'API Django simulée par MSW. djangoFetch la relit à chaque appel.
process.env.DJANGO_API_URL = DJANGO_URL;

// Supabase Storage simulé par MSW. getSupabase() relit ces variables à chaque envoi.
process.env.SUPABASE_URL = SUPABASE_TEST_URL;
process.env.SUPABASE_SECRET_KEY = SUPABASE_TEST_KEY;
process.env.SUPABASE_BUCKET = SUPABASE_TEST_BUCKET;

// cookies() et headers() de next/headers ne marchent que pendant une requête Next.js.
// Dans tous les tests, ils lisent les faux magasins de tests/mocks/cookies.ts.
vi.mock("next/headers", async () => {
  const { fakeCookies, fakeHeaders } = await import("./mocks/cookies");
  return { cookies: fakeCookies, headers: fakeHeaders };
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
  resetRequestMocks();
  vi.restoreAllMocks();
});

afterAll(() => {
  server.close();
});
