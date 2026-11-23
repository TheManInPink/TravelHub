import { describe, expect, it } from "vitest";
import {
  destinationSchema,
  destinationToInput,
  emptyDestinationInput,
  type DestinationInput,
} from "@/lib/validation/destination";
import { japanTrip, kyotoPage } from "../../msw/fixtures";

// Voyage « Japon 2027 » des données de test : du 1er au 14 avril 2027.
const trip = { start: japanTrip.start_date, end: japanTrip.end_date };
const schema = destinationSchema(trip);

const valid: DestinationInput = {
  city: "  Osaka ",
  country: " Japon ",
  country_code: " jp ",
  arrival_date: "2027-04-05",
  departure_date: "2027-04-08",
  latitude: "",
  longitude: "",
};

/** Messages d'erreur du schéma, champ par champ. */
function fieldErrors(values: DestinationInput) {
  const result = schema.safeParse(values);
  if (result.success) {
    return {};
  }
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (errors[issue.path.join(".")] ??= []).push(issue.message);
  }
  return errors;
}

describe("destinationSchema", () => {
  it("retire les espaces, met le code pays en majuscules et laisse les coordonnées à null", () => {
    expect(schema.parse(valid)).toEqual({
      city: "Osaka",
      country: "Japon",
      country_code: "JP",
      arrival_date: "2027-04-05",
      departure_date: "2027-04-08",
      latitude: null,
      longitude: null,
    });
  });

  it("exige une ville et un pays de 1 à 120 caractères", () => {
    expect(fieldErrors({ ...valid, city: " ", country: "x".repeat(121) })).toEqual({
      city: ["Entrez la ville."],
      country: ["Le pays fait 120 caractères au plus."],
    });
  });

  it("refuse un code pays qui n'a pas exactement deux lettres", () => {
    const message = "Entrez le code du pays en deux lettres, par exemple JP.";
    expect(fieldErrors({ ...valid, country_code: "JPN" })).toEqual({ country_code: [message] });
    expect(fieldErrors({ ...valid, country_code: "J1" })).toEqual({ country_code: [message] });
  });

  it("garde le séjour dans les dates du voyage", () => {
    expect(fieldErrors({ ...valid, arrival_date: "2027-03-31" })).toEqual({
      arrival_date: ["L'arrivée ne peut pas précéder le début du voyage (1 avril 2027)."],
    });
    expect(fieldErrors({ ...valid, departure_date: "2027-04-15" })).toEqual({
      departure_date: ["Le départ ne peut pas suivre la fin du voyage (14 avril 2027)."],
    });
    // Le premier et le dernier jour du voyage sont permis.
    expect(fieldErrors({ ...valid, arrival_date: "2027-04-01", departure_date: "2027-04-14" }))
      .toEqual({});
  });

  it("met l'erreur sur le départ quand il précède l'arrivée, même si un autre champ est faux", () => {
    expect(
      fieldErrors({ ...valid, city: "", arrival_date: "2027-04-08", departure_date: "2027-04-05" }),
    ).toEqual({
      city: ["Entrez la ville."],
      departure_date: ["La date de départ doit être postérieure ou égale à la date d'arrivée."],
    });
    // Un séjour d'un seul jour est permis.
    expect(fieldErrors({ ...valid, departure_date: "2027-04-05" })).toEqual({});
  });

  it("accepte des coordonnées ensemble, avec la virgule française", () => {
    const parsed = schema.parse({ ...valid, latitude: "34,6937", longitude: "135,5023" });
    expect(parsed).toMatchObject({ latitude: "34.6937", longitude: "135.5023" });
  });

  it("refuse une coordonnée seule, avec l'erreur sous le champ vide", () => {
    expect(fieldErrors({ ...valid, latitude: "34.6937" })).toEqual({
      longitude: ["Entrez aussi la longitude, ou laissez les deux coordonnées vides."],
    });
    expect(fieldErrors({ ...valid, longitude: "135.5023" })).toEqual({
      latitude: ["Entrez aussi la latitude, ou laissez les deux coordonnées vides."],
    });
  });

  it("refuse une coordonnée hors des limites ou trop précise", () => {
    expect(fieldErrors({ ...valid, latitude: "91", longitude: "0" })).toEqual({
      latitude: ["La latitude est comprise entre -90 et 90."],
    });
    expect(fieldErrors({ ...valid, latitude: "0", longitude: "-180.5" })).toEqual({
      longitude: ["La longitude est comprise entre -180 et 180."],
    });
    expect(fieldErrors({ ...valid, latitude: "34.1234567", longitude: "135" })).toEqual({
      latitude: ["La latitude a au plus 6 décimales."],
    });
  });
});

describe("valeurs du formulaire", () => {
  it("propose les dates du voyage pour une nouvelle destination", () => {
    expect(emptyDestinationInput(trip)).toMatchObject({
      arrival_date: "2027-04-01",
      departure_date: "2027-04-14",
    });
  });

  it("préremplit le formulaire avec une destination lue en GraphQL", () => {
    expect(destinationToInput(kyotoPage)).toEqual({
      city: "Kyoto",
      country: "Japon",
      country_code: "JP",
      arrival_date: "2027-04-08",
      departure_date: "2027-04-14",
      latitude: "35.011600",
      longitude: "135.768100",
    });
  });

  it("laisse les coordonnées vides quand Django n'en a pas", () => {
    const noCoordinates = { ...kyotoPage, latitude: null, longitude: null };
    expect(destinationToInput(noCoordinates)).toMatchObject({ latitude: "", longitude: "" });
  });
});
