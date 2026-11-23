import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// Une requête sans gestionnaire MSW fait échouer le test, au lieu de partir sur le réseau.
// MSW 3 a renommé l'option onUnhandledRequest en onUnhandledFrame.
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

afterEach(() => {
  // Sans globals: true, Testing Library ne démonte pas les composants tout seul.
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
