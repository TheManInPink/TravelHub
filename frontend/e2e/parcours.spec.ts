import { expect, test, type Page } from "@playwright/test";

// Parcours complet dans un vrai navigateur, contre le vrai Django : inscription,
// déconnexion, page protégée, connexion, création d'un voyage, ajout d'une destination.
// Le test crée son propre compte : il n'a besoin d'aucun mot de passe ni de seed_demo.
// À la fin, il supprime le voyage créé. Le compte e2e-… reste dans la base.

/** Identifiant court et unique, pour lancer le test plusieurs fois sur la même base. */
const run = Date.now().toString(36);
const account = {
  username: `e2e-${run}`,
  firstName: "Camille",
  email: `e2e-${run}@example.com`,
  // Assez long et varié pour les validateurs de mot de passe de Django.
  password: `Parcours-${run}-Montagne!`,
};
const tripTitle = `Gaspésie ${run}`;

/** Vérifie le toast de succès affiché après une redirection (FlashToast). */
async function expectToast(page: Page, message: string) {
  await expect(page.getByText(message, { exact: true })).toBeVisible();
}

test("inscription, connexion, création d'un voyage et ajout d'une destination", async ({
  page,
}) => {
  await test.step("inscription d'un nouveau compte", async () => {
    await page.goto("/register");
    await page.getByLabel("Prénom (facultatif)").fill(account.firstName);
    await page.getByLabel("Nom d'utilisateur").fill(account.username);
    await page.getByLabel("Courriel").fill(account.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(account.password);
    await page.getByLabel("Confirmation du mot de passe").fill(account.password);
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Bonjour ${account.firstName}`,
    );
  });

  await test.step("déconnexion", async () => {
    await page.getByRole("button", { name: /menu du compte/ }).click();
    await page.getByRole("menuitem", { name: "Déconnexion" }).click();

    await expect(page).toHaveURL(/\/login$/);
  });

  await test.step("une page protégée renvoie vers la connexion, qui y ramène", async () => {
    await page.goto("/trips/new");
    await expect(page).toHaveURL("/login?next=%2Ftrips%2Fnew");

    await page.getByLabel("Nom d'utilisateur").fill(account.username);
    await page.getByLabel("Mot de passe").fill(account.password);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page).toHaveURL("/trips/new");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouveau voyage");
  });

  await test.step("création d'un voyage (REST)", async () => {
    await page.getByLabel("Titre").fill(tripTitle);
    await page.getByLabel("Date de début").fill("2027-07-01");
    await page.getByLabel("Date de fin").fill("2027-07-10");
    await page.getByLabel("Budget").fill("1500,50");
    await page.getByRole("button", { name: "Créer le voyage" }).click();

    await expect(page).toHaveURL(/\/trips\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(tripTitle);
    await expectToast(page, "Voyage créé.");
    await expect(page.getByText("1 500,50 $", { exact: true })).toBeVisible();
  });

  await test.step("ajout d'une destination (mutation GraphQL)", async () => {
    await page.getByRole("link", { name: "Ajouter une destination" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouvelle destination");

    // Les dates d'arrivée et de départ sont déjà celles du voyage.
    await page.getByLabel("Ville").fill("Percé");
    await page.getByLabel("Pays", { exact: true }).fill("Canada");
    await page.getByLabel("Code du pays").fill("ca");
    await page.getByRole("button", { name: "Ajouter la destination" }).click();

    await expect(page).toHaveURL(/\/trips\/\d+\/destinations\/\d+$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Percé");
    await expectToast(page, "Destination ajoutée.");
  });

  await test.step("la destination apparaît dans l'itinéraire du voyage", async () => {
    await page
      .getByRole("navigation", { name: "Fil d'Ariane" })
      .getByRole("link", { name: tripTitle })
      .click();

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(tripTitle);
    await expect(page.getByRole("link", { name: "Percé" })).toBeVisible();
  });

  await test.step("suppression du voyage, pour laisser la base propre", async () => {
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Supprimer le voyage" })
      .click();

    await expect(page).toHaveURL("/trips");
    await expectToast(page, "Voyage supprimé.");
    await expect(page.getByRole("link", { name: tripTitle })).toHaveCount(0);
  });
});
