import { defineConfig, devices } from "@playwright/test";

// Tests de bout en bout : un vrai navigateur sur le build de production de Next.js,
// branché sur un vrai Django (DJANGO_API_URL). Lancez d'abord npm run build.
// Vitest garde les tests rapides de tests/, Playwright le parcours complet de e2e/.

const PORT = 3100;
const isCI = Boolean(process.env.CI);

// Avec E2E_BASE_URL (par exemple https://travelhub-uqar.vercel.app), Playwright lance
// seulement e2e/production.spec.ts sur ce site, sans démarrer de serveur. Sans elle (CI,
// poste), il lance e2e/parcours.spec.ts sur le build local.
const remoteUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, "");

export default defineConfig({
  testDir: "./e2e",
  testMatch: remoteUrl ? "production.spec.ts" : "parcours.spec.ts",
  // Un seul parcours, qui écrit dans la base : pas de tests en parallèle.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  // Render ou un Django froid peut être lent : 60 s par test, 10 s par vérification.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    // localhost est un contexte sûr : Chromium accepte les cookies Secure en HTTP.
    baseURL: remoteUrl ?? `http://localhost:${PORT}`,
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // En local, PLAYWRIGHT_CHANNEL=msedge utilise Edge, déjà installé sur Windows,
        // au lieu de télécharger le Chromium de Playwright.
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      },
    },
  ],
  webServer: remoteUrl
    ? undefined
    : {
        command: `npm run start -- -p ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
