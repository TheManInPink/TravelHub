// @vitest-environment node
// Server Actions des activités : nous les appelons comme des fonctions. MSW joue
// l'API GraphQL de Django (query DestinationPage, puis la mutation).
import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createActivityAction,
  deleteActivityAction,
  updateActivityAction,
} from "@/actions/activities";
import type { ActivityInput } from "@/lib/validation/activity";
import { redirectTarget } from "../helpers";
import { cookieJar, requestHeaders } from "../mocks/cookies";
import { kyotoPage, validTokens } from "../msw/fixtures";
import { CREATED_ACTIVITY_ID, djangoGraphql, gqlErrorBody } from "../msw/handlers";
import { server } from "../msw/server";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

// Séjour à Kyoto dans les données de test : du 8 au 14 avril 2027.
const lunch: ActivityInput = {
  name: " Marché Nishiki ",
  description: "",
  category: "food",
  date: "2027-04-10",
  start_time: "12:30",
  cost: "25,5",
};

const OUTSIDE_STAY = "Choisissez une date du séjour, entre le 8 avril 2027 et le 14 avril 2027.";
const [temple] = kyotoPage.activities;

type Variables = Record<string, unknown>;

/** Variables reçues par Django pour la prochaine mutation de ce nom. */
function captureMutation(name: string, data: Record<string, unknown>): Promise<Variables> {
  return new Promise((resolve) => {
    server.use(
      djangoGraphql.mutation(name, ({ variables }) => {
        resolve(variables);
        return HttpResponse.json({ data });
      }),
    );
  });
}

/** La mutation fait échouer le test si l'action l'envoie. */
function forbidMutation(name: string) {
  server.use(
    djangoGraphql.mutation(name, () => {
      throw new Error(`La mutation ${name} ne doit pas partir.`);
    }),
  );
}

beforeEach(() => {
  revalidatePath.mockClear();
  cookieJar.set("th_access", validTokens.access);
  cookieJar.set("th_refresh", validTokens.refresh);
});

describe("createActivityAction", () => {
  it("envoie les bonnes variables à /graphql/ et rafraîchit le voyage et la destination", async () => {
    const variables = captureMutation("CreateActivity", {
      createActivity: { activity: { ...temple, id: CREATED_ACTIVITY_ID } },
    });

    const result = await createActivityAction(kyotoPage.id, lunch);

    expect(result).toEqual({ ok: true });
    // Catégorie en majuscules, coût en chaîne à deux décimales, nom sans espaces.
    await expect(variables).resolves.toEqual({
      input: {
        destination: "3",
        name: "Marché Nishiki",
        description: "",
        category: "FOOD",
        date: "2027-04-10",
        startTime: "12:30",
        cost: "25.50",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1/destinations/3");
  });

  it("envoie startTime à null et un coût de 0.00 quand les champs sont vides", async () => {
    const variables = captureMutation("CreateActivity", {
      createActivity: { activity: { ...temple, id: CREATED_ACTIVITY_ID } },
    });

    await createActivityAction(kyotoPage.id, { ...lunch, start_time: "", cost: "" });

    await expect(variables).resolves.toMatchObject({
      input: { startTime: null, cost: "0.00" },
    });
  });

  it("refuse une date hors du séjour sans envoyer la mutation", async () => {
    forbidMutation("CreateActivity");

    const result = await createActivityAction(kyotoPage.id, { ...lunch, date: "2027-04-15" });

    expect(result).toEqual({
      ok: false,
      message: "Vérifiez les champs indiqués.",
      fieldErrors: { date: [OUTSIDE_STAY] },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("met l'erreur validation_error de Django sous le champ date", async () => {
    const message =
      "La date de l'activité doit être comprise dans le séjour à Kyoto (2027-04-08 au 2027-04-12).";
    server.use(
      djangoGraphql.mutation("CreateActivity", () =>
        HttpResponse.json(
          gqlErrorBody(
            "createActivity",
            "validation_error",
            "Les données envoyées sont invalides.",
            {
              date: [message],
            },
          ),
        ),
      ),
    );

    const result = await createActivityAction(kyotoPage.id, lunch);

    expect(result).toEqual({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { date: [message] },
    });
  });

  it("déconnecte l'utilisateur quand le jeton expire pendant la mutation", async () => {
    requestHeaders.set("x-travelhub-path", "/trips/1/destinations/3");
    server.use(
      djangoGraphql.mutation("CreateActivity", () =>
        HttpResponse.json(
          {
            errors: [
              { message: "Le jeton n'est pas valide.", extensions: { code: "token_not_valid" } },
            ],
          },
          { status: 401 },
        ),
      ),
    );

    const target = await redirectTarget(createActivityAction(kyotoPage.id, lunch));

    // Les cookies sont supprimés, puis la connexion ramène sur la destination.
    expect(target).toBe("/login?expired=1&next=%2Ftrips%2F1%2Fdestinations%2F3");
    expect(cookieJar.size).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("répond « introuvable » quand la destination n'existe plus", async () => {
    forbidMutation("CreateActivity");

    expect(await createActivityAction("99", lunch)).toEqual({
      ok: false,
      message: "Cet élément est introuvable. Il a peut-être été supprimé.",
      fieldErrors: {},
    });
  });
});

describe("updateActivityAction", () => {
  it("envoie l'identifiant de l'activité et toutes ses valeurs", async () => {
    const variables = captureMutation("UpdateActivity", {
      updateActivity: { activity: temple },
    });

    const result = await updateActivityAction(kyotoPage.id, temple.id, {
      ...lunch,
      name: "Pavillon d'or",
      category: "culture",
      start_time: "",
    });

    expect(result).toEqual({ ok: true });
    await expect(variables).resolves.toEqual({
      id: "7",
      input: {
        name: "Pavillon d'or",
        description: "",
        category: "CULTURE",
        date: "2027-04-10",
        startTime: null,
        cost: "25.50",
      },
    });
  });

  it("refuse une activité qui n'appartient pas à la destination", async () => {
    forbidMutation("UpdateActivity");

    expect(await updateActivityAction(kyotoPage.id, "99", lunch)).toEqual({
      ok: false,
      message: "Cette activité est introuvable. Elle a peut-être été supprimée.",
      fieldErrors: {},
    });
  });
});

describe("deleteActivityAction", () => {
  it("supprime l'activité et rafraîchit la page de la destination", async () => {
    const variables = captureMutation("DeleteActivity", {
      deleteActivity: { ok: true, id: temple.id },
    });

    expect(await deleteActivityAction(kyotoPage.id, temple.id)).toEqual({ ok: true });
    await expect(variables).resolves.toEqual({ id: "7" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1/destinations/3");
  });

  it("donne le message de Django pour un lecteur", async () => {
    server.use(
      djangoGraphql.mutation("DeleteActivity", () =>
        HttpResponse.json(
          gqlErrorBody(
            "deleteActivity",
            "permission_denied",
            "Seuls le propriétaire et les éditeurs peuvent modifier ce voyage.",
          ),
        ),
      ),
    );

    expect(await deleteActivityAction(kyotoPage.id, temple.id)).toEqual({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
