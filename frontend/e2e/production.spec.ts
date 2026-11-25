import { expect, test, type Page } from "@playwright/test";

// Parcours complet sur la version en ligne (Vercel, Render, Neon, Supabase), lancé à la
// main avant la démo : E2E_BASE_URL=https://travelhub-uqar.vercel.app (voir le README).
// Il couvre tout ce que l'énoncé demande : inscription, déconnexion, connexion, voyage
// (REST), destination et activité (GraphQL), météo, fiche pays, image de couverture
// (Supabase), puis déconnexion. Il crée son propre compte e2e-prod-… : il n'a besoin
// d'aucun mot de passe de démo. Il supprime son voyage à la fin. Le compte et l'image
// restent : le README explique comment les supprimer.

const run = Date.now().toString(36);
const account = {
  username: `e2e-prod-${run}`,
  firstName: "Camille",
  email: `e2e-prod-${run}@example.com`,
  password: `Parcours-${run}-Montagne!`,
};
const tripTitle = `Vérification ${run}`;
const activityName = "Visite du Louvre";

/** Image PNG de 1 × 1 pixel : assez pour vérifier l'envoi vers Supabase. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Date AAAA-MM-JJ dans quelques jours, à l'heure de Toronto comme l'application. */
function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

async function expectToast(page: Page, message: string) {
  await expect(page.getByText(message, { exact: true })).toBeVisible();
}

// API Django sur Render, réveillée avant le parcours (E2E_API_URL pour en viser une autre).
const API_URL = process.env.E2E_API_URL ?? "https://travelhub-uqar-api.onrender.com";

// Open-Meteo et Countries GraphQL répondent en quelques secondes : 4 minutes suffisent.
test.setTimeout(240_000);

// Render gratuit s'endort après 15 minutes. Sans ce réveil, la première action dépasse le
// délai de 15 s de djangoFetch (« Le serveur se réveille »), alors que Django finit quand
// même de traiter la requête : l'inscription créerait le compte sans ouvrir la session.
test.beforeAll(async ({ request }) => {
  test.setTimeout(150_000);
  const response = await request.get(`${API_URL}/health/`, { timeout: 120_000 });
  expect(response.status(), "réveil de l'API").toBe(200);
});

test("parcours complet sur les URL publiques", async ({ page }) => {
  // Le navigateur ne doit parler qu'à Next.js (BFF) : jamais à Render ni à Supabase.
  const directCalls: string[] = [];
  page.on("request", (request) => {
    const { hostname } = new URL(request.url());
    if (hostname.endsWith("onrender.com") || hostname.endsWith("supabase.co")) {
      directCalls.push(request.url());
    }
  });

  await test.step("inscription d'un nouveau compte", async () => {
    await page.goto("/register");
    await page.getByLabel("Prénom (facultatif)").fill(account.firstName);
    await page.getByLabel("Nom d'utilisateur").fill(account.username);
    await page.getByLabel("Courriel").fill(account.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
    await page.getByLabel("Confirmation du mot de passe").fill(account.password);
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    // Le premier appel peut réveiller Render.
    await expect(page).toHaveURL("/dashboard", { timeout: 90_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Bonjour ${account.firstName}`,
    );
  });

  await test.step("déconnexion puis connexion", async () => {
    await page.getByRole("button", { name: /menu du compte/ }).click();
    await page.getByRole("menuitem", { name: "Déconnexion" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Nom d'utilisateur").fill(account.username);
    await page.getByLabel("Mot de passe").fill(account.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  await test.step("création d'un voyage (REST)", async () => {
    await page.goto("/trips/new");
    await page.getByLabel("Titre").fill(tripTitle);
    // Dans quelques jours : Open-Meteo donne les prévisions jusqu'à 16 jours à l'avance.
    await page.getByLabel("Date de début").fill(isoDate(2));
    await page.getByLabel("Date de fin").fill(isoDate(6));
    await page.getByRole("button", { name: "Créer le voyage" }).click();

    await expect(page).toHaveURL(/\/trips\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(tripTitle);
    await expectToast(page, "Voyage créé.");
  });

  await test.step("image de couverture (Supabase Storage)", async () => {
    await page.getByRole("button", { name: "Ajouter une image" }).click();
    const dialog = page.getByRole("dialog", { name: "Image de couverture" });
    await dialog
      .getByLabel("Image")
      .setInputFiles({ name: "couverture.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Envoyer" }).click();

    await expectToast(page, "Image de couverture enregistrée.");
    await expect(page.getByRole("button", { name: "Changer l'image" })).toBeVisible();
    // next/image sert l'image depuis Vercel (/_next/image), pas depuis Supabase.
    await expect(page.locator('img[src*="/_next/image"]').first()).toBeVisible();
  });

  await test.step("ajout d'une destination (mutation GraphQL)", async () => {
    await page.getByRole("link", { name: "Ajouter une destination" }).click();
    await page.getByLabel("Ville").fill("Paris");
    await page.getByLabel("Pays", { exact: true }).fill("France");
    await page.getByLabel("Code du pays").fill("fr");
    await page.getByRole("button", { name: "Ajouter la destination" }).click();

    await expect(page).toHaveURL(/\/trips\/\d+\/destinations\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paris");
    await expectToast(page, "Destination ajoutée.");
  });

  await test.step("fiche pays (Countries GraphQL) et météo (Open-Meteo)", async () => {
    const country = page.getByRole("region", { name: "Pays" });
    await expect(country.getByText("Capitale")).toBeVisible({ timeout: 30_000 });
    await expect(country.getByText("Paris", { exact: true })).toBeVisible();

    const weather = page.getByRole("region", { name: "Météo" });
    await expect(weather.getByRole("heading", { name: "Prévisions du séjour" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(weather.getByText("Maintenant à Paris")).toBeVisible();
  });

  await test.step("ajout d'une activité (mutation GraphQL)", async () => {
    await page.getByRole("button", { name: "Ajouter une activité" }).click();
    const dialog = page.getByRole("dialog", { name: "Ajouter une activité" });
    await dialog.getByLabel("Nom").fill(activityName);
    await dialog.getByRole("button", { name: "Ajouter l'activité" }).click();

    await expectToast(page, "Activité ajoutée.");
    await expect(page.getByText(activityName, { exact: true })).toBeVisible();
  });

  await test.step("suppression du voyage", async () => {
    await page
      .getByRole("navigation", { name: "Fil d'Ariane" })
      .getByRole("link", { name: tripTitle })
      .click();
    // La page de la destination a aussi un bouton « Supprimer ». Il faut attendre la page
    // du voyage, sinon le clic part sur l'ancienne page pendant la navigation.
    await expect(page).toHaveURL(/\/trips\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(tripTitle);
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Supprimer le voyage" })
      .click();

    await expect(page).toHaveURL("/trips");
    await expectToast(page, "Voyage supprimé.");
  });

  await test.step("déconnexion", async () => {
    await page.getByRole("button", { name: /menu du compte/ }).click();
    await page.getByRole("menuitem", { name: "Déconnexion" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login?next=%2Fdashboard");
  });

  expect(directCalls, "appels du navigateur vers Render ou Supabase").toEqual([]);
});
