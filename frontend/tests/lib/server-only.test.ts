import { describe, expect, it } from "vitest";

describe("alias de server-only", () => {
  it("permet d'importer un module serveur dans les tests", async () => {
    // Sans l'alias de vitest.config.mts, cet import lève une erreur.
    await expect(import("server-only")).resolves.toBeDefined();
  });
});
