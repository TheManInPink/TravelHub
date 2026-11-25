// @vitest-environment node
// Server Actions des voyages : nous les appelons comme des fonctions, avec MSW à la place
// de Django. next/headers est simulé pour tous les tests (tests/setup.ts) ; next/cache et
// next/navigation le sont ici.
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTripAction, deleteTripAction, updateTripAction } from "@/actions/trips";
import type { TripInput } from "@/lib/validation/trip";
import { redirectTarget } from "../helpers";
import { cookieJar, requestHeaders } from "../mocks/cookies";
import { validTokens } from "../msw/fixtures";
import { CREATED_TRIP_ID, DJANGO_URL, errorBody } from "../msw/handlers";
import { server } from "../msw/server";

// revalidatePath() ne marche que dans Next.js. Ici, c'est une fonction espion.
const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

// redirect() garde son vrai comportement (il lève l'erreur NEXT_REDIRECT que lit
// redirectTarget), mais l'espion permet de vérifier qu'il n'est pas appelé.
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  redirect.mockImplementation(actual.redirect);
  return { ...actual, redirect };
});

const values: TripInput = {
  title: " Gaspésie 2027 ",
  description: "",
  start_date: "2027-07-01",
  end_date: "2027-07-10",
  status: "planned",
  budget: "1500,50",
};

/** Corps JSON reçu par Django pour la prochaine requête vers cette méthode. */
function captureBody(method: "POST" | "PATCH"): Promise<unknown> {
  return new Promise((resolve) => {
    server.events.on("request:start", ({ request }) => {
      if (request.method === method) {
        void request.clone().json().then(resolve);
      }
    });
  });
}

/** Le gestionnaire fait échouer le test si l'action appelle Django. */
function forbidDjango(method: "post" | "patch" | "delete", path: string) {
  server.use(
    http[method](`${DJANGO_URL}${path}`, () => {
      throw new Error("Django ne doit pas être appelé.");
    }),
  );
}

beforeEach(() => {
  revalidatePath.mockClear();
  redirect.mockClear();
  // Utilisateur connecté : verifyActionSession() appelle /api/auth/me/ avec ce jeton.
  cookieJar.set("th_access", validTokens.access);
  cookieJar.set("th_refresh", validTokens.refresh);
});

describe("createTripAction", () => {
  it("envoie les valeurs validées, rafraîchit les pages et redirige vers le détail", async () => {
    const body = captureBody("POST");

    const target = await redirectTarget(createTripAction(values));

    expect(target).toBe(`/trips/${CREATED_TRIP_ID}?toast=trip-created`);
    // Zod a retiré les espaces et remplacé la virgule du budget par un point.
    await expect(body).resolves.toEqual({
      title: "Gaspésie 2027",
      description: "",
      start_date: "2027-07-01",
      end_date: "2027-07-10",
      status: "planned",
      budget: "1500.50",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(revalidatePath).toHaveBeenCalledWith(`/trips/${CREATED_TRIP_ID}`);
  });

  it("met les details d'un 400 de Django sous le champ end_date", async () => {
    server.use(
      http.post(`${DJANGO_URL}/api/trips/`, () =>
        HttpResponse.json(
          errorBody("validation_error", "Les données envoyées sont invalides.", {
            end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
          }),
          { status: 400 },
        ),
      ),
    );

    const result = await createTripAction(values);

    expect(result).toEqual({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: {
        end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
      },
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalide avec Zod avant d'appeler Django", async () => {
    forbidDjango("post", "/api/trips/");

    const result = await createTripAction({
      ...values,
      start_date: "2027-07-10",
      end_date: "2027-07-01",
    });

    expect(result.fieldErrors).toEqual({
      end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
    });
  });

  it("donne le message d'un 429 avec son délai", async () => {
    server.use(
      http.post(`${DJANGO_URL}/api/trips/`, () =>
        HttpResponse.json(errorBody("throttled", "Request was throttled."), {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
      ),
    );

    const result = await createTripAction(values);

    expect(result).toEqual({
      ok: false,
      message: "Trop de requêtes. Réessayez dans 30 secondes.",
      fieldErrors: {},
    });
  });

  it("renvoie vers la connexion sans session, sans appeler POST /api/trips/", async () => {
    cookieJar.clear();
    requestHeaders.set("x-travelhub-path", "/trips/new");
    forbidDjango("post", "/api/trips/");

    const target = await redirectTarget(createTripAction(values));

    expect(target).toBe("/login?expired=1&next=%2Ftrips%2Fnew");
  });
});

describe("updateTripAction", () => {
  it("envoie un PATCH au voyage et redirige vers son détail", async () => {
    const body = captureBody("PATCH");

    const target = await redirectTarget(updateTripAction(1, { ...values, budget: "" }));

    expect(target).toBe("/trips/1?toast=trip-updated");
    // Un budget vide est envoyé comme null : Django retire alors le budget.
    await expect(body).resolves.toMatchObject({ title: "Gaspésie 2027", budget: null });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1");
  });

  it("donne un message clair au lecteur que Django refuse (403)", async () => {
    server.use(
      http.patch(`${DJANGO_URL}/api/trips/:id/`, () =>
        HttpResponse.json(
          errorBody("permission_denied", "You do not have permission to perform this action."),
          { status: 403 },
        ),
      ),
    );

    const result = await updateTripAction(1, values);

    expect(result).toEqual({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
  });

  it("affiche la règle de Django qui n'a pas de champ (non_field_errors)", async () => {
    const message =
      "Des destinations de ce voyage sortent des nouvelles dates : modifiez-les avant de changer les dates du voyage.";
    server.use(
      http.patch(`${DJANGO_URL}/api/trips/:id/`, () =>
        HttpResponse.json(errorBody("validation_error", message, { non_field_errors: [message] }), {
          status: 400,
        }),
      ),
    );

    const result = await updateTripAction(1, values);

    expect(result).toEqual({ ok: false, message, fieldErrors: {} });
  });

  it("déconnecte l'utilisateur si Django répond 401 pendant l'action", async () => {
    requestHeaders.set("x-travelhub-path", "/trips/1/edit");
    server.use(
      http.patch(`${DJANGO_URL}/api/trips/:id/`, () =>
        HttpResponse.json(errorBody("token_not_valid", "Token is invalid or expired"), {
          status: 401,
        }),
      ),
    );

    const target = await redirectTarget(updateTripAction(1, values));

    expect(target).toBe("/login?expired=1&next=%2Ftrips%2F1%2Fedit");
    expect(cookieJar.size).toBe(0);
  });

  it("refuse un identifiant forgé sans appeler Django", async () => {
    forbidDjango("patch", "/api/trips/:id/");

    for (const id of [0, -1, 1.5, Number.NaN]) {
      await expect(updateTripAction(id, values)).resolves.toMatchObject({
        ok: false,
        message: "Ce voyage est introuvable. Il a peut-être été supprimé.",
      });
    }
  });
});

describe("deleteTripAction", () => {
  it("supprime le voyage et revient à la liste", async () => {
    const target = await redirectTarget(deleteTripAction(1));

    expect(target).toBe("/trips?toast=trip-deleted");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
  });

  it("renvoie le message du 404 d'un voyage déjà supprimé", async () => {
    const result = await deleteTripAction(99);

    expect(result).toEqual({
      ok: false,
      message: "Cet élément est introuvable. Il a peut-être été supprimé.",
      fieldErrors: {},
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
