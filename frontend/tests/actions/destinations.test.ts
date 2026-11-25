// @vitest-environment node
// Server Actions des destinations : nous les appelons comme des fonctions, avec MSW à la
// place de Django (API REST pour lire le voyage, /graphql/ pour les mutations).
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDestinationAction,
  deleteDestinationAction,
  updateDestinationAction,
} from "@/actions/destinations";
import type { DestinationInput } from "@/lib/validation/destination";
import { redirectTarget } from "../helpers";
import { cookieJar } from "../mocks/cookies";
import { japanTripDetail, kyotoPage, validTokens } from "../msw/fixtures";
import {
  CREATED_DESTINATION_ID,
  DJANGO_URL,
  djangoGraphql,
  gqlErrorBody,
} from "../msw/handlers";
import { server } from "../msw/server";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  redirect.mockImplementation(actual.redirect);
  return { ...actual, redirect };
});

// Une nouvelle étape du voyage « Japon 2027 » (du 1er au 14 avril 2027).
const osaka: DestinationInput = {
  city: " Osaka ",
  country: "Japon",
  country_code: "jp",
  arrival_date: "2027-04-05",
  departure_date: "2027-04-08",
  latitude: "",
  longitude: "",
};

// Le formulaire de modification de Kyoto, prérempli comme le fait destinationToInput.
const kyoto: DestinationInput = {
  city: "Kyoto",
  country: "Japon",
  country_code: "JP",
  arrival_date: "2027-04-08",
  departure_date: "2027-04-14",
  latitude: "35.011600",
  longitude: "135.768100",
};

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
  redirect.mockClear();
  cookieJar.set("th_access", validTokens.access);
  cookieJar.set("th_refresh", validTokens.refresh);
});

describe("createDestinationAction", () => {
  it("envoie les variables de createDestination, rafraîchit l'itinéraire et ouvre la destination", async () => {
    const variables = captureMutation("CreateDestination", {
      createDestination: { destination: { ...kyotoPage, id: CREATED_DESTINATION_ID } },
    });

    const target = await redirectTarget(createDestinationAction(1, osaka));

    expect(target).toBe(`/trips/1/destinations/${CREATED_DESTINATION_ID}?toast=destination-created`);
    // Noms de GraphQL en camelCase, code pays en majuscules, ville sans espaces. Sans
    // coordonnées, les deux champs ne sont pas envoyés.
    await expect(variables).resolves.toEqual({
      input: {
        trip: "1",
        order: 2,
        city: "Osaka",
        country: "Japon",
        countryCode: "JP",
        arrivalDate: "2027-04-05",
        departureDate: "2027-04-08",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1");
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/1/destinations/${CREATED_DESTINATION_ID}`);
  });

  it("place la destination après la plus grande position du voyage", async () => {
    server.use(
      http.get(`${DJANGO_URL}/api/trips/1/`, () =>
        HttpResponse.json({
          ...japanTripDetail,
          destinations: [
            { ...japanTripDetail.destinations[0], id: 3, order: 4 },
            { ...japanTripDetail.destinations[0], id: 4, order: 2 },
          ],
        }),
      ),
    );
    const variables = captureMutation("CreateDestination", {
      createDestination: { destination: { ...kyotoPage, id: CREATED_DESTINATION_ID } },
    });

    await redirectTarget(
      createDestinationAction(1, { ...osaka, latitude: "34,6937", longitude: "135,5023" }),
    );

    await expect(variables).resolves.toMatchObject({
      input: { order: 5, latitude: "34.6937", longitude: "135.5023" },
    });
  });

  it("revalide avec les dates du voyage lues dans Django, sans envoyer la mutation", async () => {
    forbidMutation("CreateDestination");

    const result = await createDestinationAction(1, { ...osaka, arrival_date: "2027-03-30" });

    expect(result).toEqual({
      ok: false,
      message: "Vérifiez les champs indiqués.",
      fieldErrors: {
        arrival_date: ["L'arrivée ne peut pas précéder le début du voyage (1 avril 2027)."],
      },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuse un code pays de trois lettres sans envoyer la mutation", async () => {
    // Le champ du formulaire s'arrête à deux lettres, mais un appel forgé peut en envoyer trois.
    forbidMutation("CreateDestination");

    const result = await createDestinationAction(1, { ...osaka, country_code: "JPN" });

    expect(result).toEqual({
      ok: false,
      message: "Vérifiez les champs indiqués.",
      fieldErrors: { country_code: ["Entrez le code du pays en deux lettres, par exemple JP."] },
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("ramène les details en camelCase de GraphQL sous les champs du formulaire", async () => {
    server.use(
      djangoGraphql.mutation("CreateDestination", () =>
        HttpResponse.json(
          gqlErrorBody("createDestination", "validation_error", "Les données envoyées sont invalides.", {
            countryCode: ["Le code pays doit contenir exactement deux lettres (ISO 3166-1 alpha-2)."],
            departureDate: ["Le départ ne peut pas suivre la fin du voyage (2027-04-14)."],
          }),
        ),
      ),
    );

    const result = await createDestinationAction(1, osaka);

    expect(result).toEqual({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: {
        country_code: ["Le code pays doit contenir exactement deux lettres (ISO 3166-1 alpha-2)."],
        departure_date: ["Le départ ne peut pas suivre la fin du voyage (2027-04-14)."],
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("affiche le refus de Django pour un lecteur", async () => {
    server.use(
      djangoGraphql.mutation("CreateDestination", () =>
        HttpResponse.json(
          gqlErrorBody(
            "createDestination",
            "permission_denied",
            "Seuls le propriétaire et les éditeurs peuvent modifier ce voyage.",
          ),
        ),
      ),
    );

    const result = await createDestinationAction(1, osaka);

    expect(result).toEqual({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
  });

  it("refuse un voyage inconnu sans envoyer la mutation", async () => {
    forbidMutation("CreateDestination");

    expect(await createDestinationAction(404, osaka)).toMatchObject({
      ok: false,
      message: "Cet élément est introuvable. Il a peut-être été supprimé.",
    });
    expect(await createDestinationAction("abc", osaka)).toMatchObject({
      ok: false,
      message: "Ce voyage est introuvable. Il a peut-être été supprimé.",
    });
  });

  it("déconnecte l'utilisateur quand /graphql/ répond 401", async () => {
    server.use(
      djangoGraphql.mutation("CreateDestination", () =>
        HttpResponse.json(
          { errors: [{ message: "Jeton expiré.", extensions: { code: "token_not_valid" } }] },
          { status: 401 },
        ),
      ),
    );

    const target = await redirectTarget(createDestinationAction(1, osaka));

    expect(target).toMatch(/^\/login\?expired=1/);
    expect(cookieJar.has("th_access")).toBe(false);
  });
});

describe("updateDestinationAction", () => {
  it("garde les coordonnées hors des variables quand l'utilisateur ne les a pas changées", async () => {
    const variables = captureMutation("UpdateDestination", {
      updateDestination: { destination: kyotoPage },
    });

    const target = await redirectTarget(
      updateDestinationAction(kyotoPage.id, { ...kyoto, city: "Kyōto" }),
    );

    expect(target).toBe("/trips/1/destinations/3?toast=destination-updated");
    // Django efface alors les anciennes coordonnées, qui étaient celles de l'autre ville.
    await expect(variables).resolves.toEqual({
      id: "3",
      input: {
        city: "Kyōto",
        country: "Japon",
        countryCode: "JP",
        arrivalDate: "2027-04-08",
        departureDate: "2027-04-14",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1/destinations/3");
  });

  it("envoie les coordonnées modifiées, ou null quand elles sont effacées", async () => {
    const changed = captureMutation("UpdateDestination", {
      updateDestination: { destination: kyotoPage },
    });
    await redirectTarget(
      updateDestinationAction(kyotoPage.id, { ...kyoto, latitude: "35,02", longitude: "135,76" }),
    );
    await expect(changed).resolves.toMatchObject({
      input: { latitude: "35.02", longitude: "135.76" },
    });

    const cleared = captureMutation("UpdateDestination", {
      updateDestination: { destination: kyotoPage },
    });
    await redirectTarget(
      updateDestinationAction(kyotoPage.id, { ...kyoto, latitude: "", longitude: "" }),
    );
    await expect(cleared).resolves.toMatchObject({ input: { latitude: null, longitude: null } });
  });

  it("donne le message global de Django quand il n'y a pas de champ en cause", async () => {
    const message =
      "Des activités de cette destination sortent des nouvelles dates : modifiez-les avant de changer les dates de la destination.";
    server.use(
      djangoGraphql.mutation("UpdateDestination", () =>
        HttpResponse.json(
          gqlErrorBody("updateDestination", "validation_error", message, {
            nonFieldErrors: [message],
          }),
        ),
      ),
    );

    const result = await updateDestinationAction(kyotoPage.id, {
      ...kyoto,
      arrival_date: "2027-04-10",
    });

    expect(result).toEqual({ ok: false, message, fieldErrors: {} });
  });

  it("répond « introuvable » pour une destination inconnue", async () => {
    forbidMutation("UpdateDestination");

    expect(await updateDestinationAction("99", kyoto)).toMatchObject({
      ok: false,
      message: "Cet élément est introuvable. Il a peut-être été supprimé.",
    });
  });
});

describe("deleteDestinationAction", () => {
  it("supprime la destination et revient sur la page du voyage", async () => {
    const variables = captureMutation("DeleteDestination", {
      deleteDestination: { ok: true, id: kyotoPage.id },
    });

    const target = await redirectTarget(deleteDestinationAction(kyotoPage.id));

    expect(target).toBe("/trips/1?toast=destination-deleted");
    await expect(variables).resolves.toEqual({ id: "3" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1");
  });

  it("ne supprime rien pour un identifiant forgé", async () => {
    forbidMutation("DeleteDestination");

    expect(await deleteDestinationAction("../3")).toMatchObject({
      ok: false,
      message: "Cette destination est introuvable. Elle a peut-être été supprimée.",
    });
  });
});
