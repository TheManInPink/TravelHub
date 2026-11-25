// @vitest-environment node
import { readFileSync } from "node:fs";
import { buildSchema, parse, validate } from "graphql";
import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import {
  CREATE_ACTIVITY_MUTATION,
  CREATE_DESTINATION_MUTATION,
  DELETE_ACTIVITY_MUTATION,
  DELETE_DESTINATION_MUTATION,
  DESTINATION_COUNTRY_QUERY,
  DESTINATION_PAGE_QUERY,
  UPDATE_ACTIVITY_MUTATION,
  UPDATE_DESTINATION_MUTATION,
  createActivity,
  createDestination,
  deleteActivity,
  getDestinationCountry,
  getDestinationPage,
  updateActivity,
} from "@/lib/api/itinerary";
import { ApiError } from "@/lib/errors";
import type { ActivityCreateInput, DestinationCreateInput } from "@/types/graphql";
import { rejection } from "../../helpers";
import { kyotoPage } from "../../msw/fixtures";
import { djangoGraphql } from "../../msw/handlers";
import { server } from "../../msw/server";

// Schéma produit par Django (python manage.py graphql_schema --out frontend/schema.graphql).
const schema = buildSchema(
  readFileSync(new URL("../../../schema.graphql", import.meta.url), "utf8"),
);

const DOCUMENTS = {
  DestinationPage: DESTINATION_PAGE_QUERY,
  DestinationCountry: DESTINATION_COUNTRY_QUERY,
  CreateDestination: CREATE_DESTINATION_MUTATION,
  UpdateDestination: UPDATE_DESTINATION_MUTATION,
  DeleteDestination: DELETE_DESTINATION_MUTATION,
  CreateActivity: CREATE_ACTIVITY_MUTATION,
  UpdateActivity: UPDATE_ACTIVITY_MUTATION,
  DeleteActivity: DELETE_ACTIVITY_MUTATION,
};

describe("documents GraphQL", () => {
  it.each(Object.entries(DOCUMENTS))("%s est valide pour le schéma de Django", (name, document) => {
    const ast = parse(document);
    // Champ mal écrit, fragment inutilisé ou variable du mauvais type : Django répondrait 400.
    expect(validate(schema, ast).map((error) => error.message)).toEqual([]);
    const operations = ast.definitions.filter(
      (definition) => definition.kind === "OperationDefinition",
    );
    expect(operations.map((operation) => operation.name?.value)).toEqual([name]);
  });
});

describe("getDestinationPage", () => {
  it("lit la destination, son voyage et ses activités", async () => {
    const destination = await getDestinationPage(3);

    expect(destination).toEqual(kyotoPage);
    expect(destination.trip.myRole).toBe("OWNER");
    expect(destination.activities[0].category).toBe("CULTURE");
  });

  it("transforme l'erreur not_found de GraphQL en ApiError", async () => {
    const error = await rejection(getDestinationPage("404"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 200,
      code: "not_found",
      message: "Destination introuvable.",
    });
  });
});

describe("getDestinationCountry", () => {
  it("renvoie null quand Countries GraphQL n'a pas de fiche", async () => {
    server.use(
      djangoGraphql.query("DestinationCountry", ({ variables }) =>
        HttpResponse.json({ data: { destination: { id: variables.id, countryInfo: null } } }),
      ),
    );
    await expect(getDestinationCountry(3)).resolves.toBeNull();
  });
});

describe("mutations de l'itinéraire", () => {
  it("createDestination envoie l'input et renvoie la destination créée", async () => {
    let variables: unknown;
    server.use(
      djangoGraphql.mutation("CreateDestination", ({ variables: received }) => {
        variables = received;
        return HttpResponse.json({
          data: { createDestination: { destination: { ...kyotoPage, id: "8" } } },
        });
      }),
    );
    const input: DestinationCreateInput = {
      trip: "1",
      order: 2,
      city: "Osaka",
      country: "Japon",
      countryCode: "jp",
      arrivalDate: "2027-04-14",
      departureDate: "2027-04-14",
    };

    const destination = await createDestination(input);

    expect(variables).toEqual({ input });
    expect(destination.id).toBe("8");
  });

  it("createActivity envoie les variables de la mutation et renvoie l'activité créée", async () => {
    let variables: unknown;
    server.use(
      djangoGraphql.mutation("CreateActivity", ({ variables: received }) => {
        variables = received;
        return HttpResponse.json({
          data: {
            createActivity: {
              activity: { ...kyotoPage.activities[0], id: "12", name: "Marché Nishiki" },
            },
          },
        });
      }),
    );
    const input: ActivityCreateInput = {
      destination: kyotoPage.id,
      name: "Marché Nishiki",
      category: "FOOD",
      date: "2027-04-10",
      startTime: "10:30",
      cost: "25.00",
    };

    const activity = await createActivity(input);

    // Une seule variable $input, avec l'identifiant de la destination en chaîne.
    expect(variables).toEqual({ input });
    expect(activity).toMatchObject({ id: "12", name: "Marché Nishiki" });
  });

  it("updateActivity envoie l'identifiant en chaîne et la catégorie en majuscules", async () => {
    let variables: unknown;
    server.use(
      djangoGraphql.mutation("UpdateActivity", ({ variables: received }) => {
        variables = received;
        return HttpResponse.json({
          data: { updateActivity: { activity: { ...kyotoPage.activities[0], category: "FOOD" } } },
        });
      }),
    );

    const activity = await updateActivity(7, { category: "FOOD" });

    expect(variables).toEqual({ id: "7", input: { category: "FOOD" } });
    expect(activity.category).toBe("FOOD");
  });

  it("deleteActivity renvoie ok et l'identifiant supprimé", async () => {
    server.use(
      djangoGraphql.mutation("DeleteActivity", ({ variables }) =>
        HttpResponse.json({ data: { deleteActivity: { ok: true, id: variables.id } } }),
      ),
    );
    await expect(deleteActivity("7")).resolves.toEqual({ ok: true, id: "7" });
  });

  it("lève unexpected_response si la mutation ne renvoie rien sans erreur", async () => {
    server.use(
      djangoGraphql.mutation("CreateDestination", () =>
        HttpResponse.json({ data: { createDestination: null } }),
      ),
    );
    const error = await rejection(
      createDestination({
        trip: "1",
        order: 2,
        city: "Osaka",
        country: "Japon",
        countryCode: "JP",
        arrivalDate: "2027-04-14",
        departureDate: "2027-04-14",
      }),
    );
    expect(error).toMatchObject({ code: "unexpected_response" });
  });
});
