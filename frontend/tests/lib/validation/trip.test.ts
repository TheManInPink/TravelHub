import { describe, expect, it } from "vitest";
import { isTripStatus, TRIP_STATUSES } from "@/lib/tripStatus";
import { tripSchema, tripToInput, type TripInput } from "@/lib/validation/trip";
import { japanTrip, portugalTrip } from "../../msw/fixtures";

const valid: TripInput = {
  title: "  Gaspésie 2027  ",
  description: "  Tour de la péninsule.  ",
  start_date: "2027-07-01",
  end_date: "2027-07-10",
  status: "planned",
  budget: "1500,50",
};

/** Messages d'erreur du schéma, champ par champ. */
function fieldErrors(values: TripInput) {
  const result = tripSchema.safeParse(values);
  if (result.success) {
    return {};
  }
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

describe("tripSchema", () => {
  it("retire les espaces et envoie le budget avec un point", () => {
    expect(tripSchema.parse(valid)).toEqual({
      title: "Gaspésie 2027",
      description: "Tour de la péninsule.",
      start_date: "2027-07-01",
      end_date: "2027-07-10",
      status: "planned",
      budget: "1500.50",
    });
  });

  it("donne null pour un budget vide", () => {
    expect(tripSchema.parse({ ...valid, budget: "   " }).budget).toBeNull();
  });

  it("refuse un titre vide ou de plus de 200 caractères", () => {
    expect(fieldErrors({ ...valid, title: "   " })).toEqual({ title: ["Entrez un titre."] });
    expect(fieldErrors({ ...valid, title: "a".repeat(201) })).toEqual({
      title: ["Le titre fait 200 caractères au plus."],
    });
    expect(tripSchema.safeParse({ ...valid, title: "a".repeat(200) }).success).toBe(true);
  });

  it("met l'erreur sur end_date quand la fin est avant le début", () => {
    expect(fieldErrors({ ...valid, start_date: "2027-07-10", end_date: "2027-07-01" })).toEqual({
      end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
    });
  });

  it("compare les dates même si un autre champ est en erreur", () => {
    expect(
      fieldErrors({ ...valid, title: "", start_date: "2027-07-10", end_date: "2027-07-01" }),
    ).toEqual({
      title: ["Entrez un titre."],
      end_date: ["La date de fin doit être postérieure ou égale à la date de début."],
    });
  });

  it("accepte un voyage d'un seul jour", () => {
    expect(
      tripSchema.safeParse({ ...valid, start_date: "2027-07-01", end_date: "2027-07-01" }).success,
    ).toBe(true);
  });

  it("refuse une date vide, mal formée ou impossible", () => {
    expect(fieldErrors({ ...valid, start_date: "" })).toEqual({
      start_date: ["Choisissez la date de début."],
    });
    expect(fieldErrors({ ...valid, end_date: "10/07/2027" })).toEqual({
      end_date: ["Entrez une date valide au format AAAA-MM-JJ."],
    });
    expect(fieldErrors({ ...valid, end_date: "2027-02-30" })).toEqual({
      end_date: ["Entrez une date valide au format AAAA-MM-JJ."],
    });
  });

  it("refuse un statut inconnu", () => {
    // Un appel forgé à la Server Action peut envoyer n'importe quelle valeur.
    const forged = { ...valid, status: "archived" } as unknown as TripInput;
    expect(fieldErrors(forged)).toEqual({ status: ["Choisissez un statut."] });
  });

  it.each([
    ["0", "0"],
    ["1500", "1500"],
    ["1500.5", "1500.5"],
    ["99999999.99", "99999999.99"],
  ])("accepte le budget %s", (input, output) => {
    expect(tripSchema.parse({ ...valid, budget: input }).budget).toBe(output);
  });

  it.each([
    ["-10", "Le budget ne peut pas être négatif."],
    ["abc", "Entrez un montant, par exemple 1500 ou 1500,50."],
    ["1 500", "Entrez un montant, par exemple 1500 ou 1500,50."],
    ["12.345", "Le budget a au plus 2 décimales."],
    ["123456789", "Le budget a au plus 8 chiffres avant la virgule."],
  ])("refuse le budget %s", (input, message) => {
    expect(fieldErrors({ ...valid, budget: input })).toEqual({ budget: [message] });
  });
});

describe("tripToInput", () => {
  it("préremplit le formulaire avec le voyage", () => {
    expect(tripToInput(japanTrip)).toEqual({
      title: "Japon 2027",
      description: "Deux semaines entre Tokyo et Kyoto.",
      start_date: "2027-04-01",
      end_date: "2027-04-14",
      status: "planned",
      budget: "4500.00",
    });
  });

  it("laisse le budget vide quand Django envoie null", () => {
    expect(tripToInput(portugalTrip).budget).toBe("");
  });
});

describe("isTripStatus", () => {
  it("reconnaît les 5 statuts de Django et rien d'autre", () => {
    expect(TRIP_STATUSES.every(isTripStatus)).toBe(true);
    expect(isTripStatus("archived")).toBe(false);
    expect(isTripStatus("")).toBe(false);
  });
});
