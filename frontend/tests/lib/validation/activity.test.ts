import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES } from "@/lib/activityCategory";
import {
  activitySchema,
  activityToInput,
  emptyActivityInput,
  outsideStayMessage,
  type ActivityInput,
} from "@/lib/validation/activity";
import { kyotoPage } from "../../msw/fixtures";

// Séjour à Kyoto dans les données de test : du 8 au 14 avril 2027.
const stay = { start: kyotoPage.arrivalDate, end: kyotoPage.departureDate };
const schema = activitySchema(stay);

const valid: ActivityInput = {
  name: "  Marché Nishiki  ",
  description: "  Déjeuner sur place.  ",
  category: "food",
  date: "2027-04-10",
  start_time: "12:30",
  cost: "25,5",
};

/** Messages d'erreur du schéma, champ par champ. */
function fieldErrors(values: ActivityInput) {
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

describe("activitySchema", () => {
  it("retire les espaces et envoie le coût avec deux décimales", () => {
    expect(schema.parse(valid)).toEqual({
      name: "Marché Nishiki",
      description: "Déjeuner sur place.",
      category: "food",
      date: "2027-04-10",
      start_time: "12:30",
      cost: "25.50",
    });
  });

  it("accepte l'arrivée et le départ, bornes comprises", () => {
    expect(fieldErrors({ ...valid, date: "2027-04-08" })).toEqual({});
    expect(fieldErrors({ ...valid, date: "2027-04-14" })).toEqual({});
  });

  it("refuse une date hors du séjour, avec les dates en français", () => {
    const message = "Choisissez une date du séjour, entre le 8 avril 2027 et le 14 avril 2027.";
    expect(outsideStayMessage(stay)).toBe(message);
    expect(fieldErrors({ ...valid, date: "2027-04-07" })).toEqual({ date: [message] });
    expect(fieldErrors({ ...valid, date: "2027-04-15" })).toEqual({ date: [message] });
  });

  it("exige un nom de 1 à 200 caractères après trim", () => {
    expect(fieldErrors({ ...valid, name: "   " })).toEqual({
      name: ["Entrez le nom de l'activité."],
    });
    expect(fieldErrors({ ...valid, name: "a".repeat(201) })).toEqual({
      name: ["Le nom fait 200 caractères au plus."],
    });
  });

  it("accepte les 8 catégories et refuse les autres", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      expect(fieldErrors({ ...valid, category })).toEqual({});
    }
    // @ts-expect-error : une valeur forgée qui n'est pas une catégorie de Django.
    expect(fieldErrors({ ...valid, category: "party" })).toEqual({
      category: ["Choisissez une catégorie."],
    });
  });

  it("rend l'heure facultative, au format HH:MM", () => {
    expect(schema.parse({ ...valid, start_time: "" }).start_time).toBeNull();
    expect(fieldErrors({ ...valid, start_time: "24:00" })).toEqual({
      start_time: ["Entrez une heure au format HH:MM, par exemple 14:30."],
    });
    expect(fieldErrors({ ...valid, start_time: "9h30" })).toEqual({
      start_time: ["Entrez une heure au format HH:MM, par exemple 14:30."],
    });
  });

  it("met un coût vide à 0.00 et refuse un coût négatif ou mal formé", () => {
    expect(schema.parse({ ...valid, cost: "" }).cost).toBe("0.00");
    expect(fieldErrors({ ...valid, cost: "-5" })).toEqual({
      cost: ["Le coût ne peut pas être négatif."],
    });
    expect(fieldErrors({ ...valid, cost: "12,345" })).toEqual({
      cost: ["Le coût a au plus 2 décimales."],
    });
    expect(fieldErrors({ ...valid, cost: "123456789" })).toEqual({
      cost: ["Le coût a au plus 8 chiffres avant la virgule."],
    });
    expect(fieldErrors({ ...valid, cost: "gratuit" })).toEqual({
      cost: ["Entrez un montant, par exemple 25 ou 12,50."],
    });
  });
});

describe("valeurs du formulaire", () => {
  it("propose le premier jour du séjour pour une nouvelle activité", () => {
    expect(emptyActivityInput(stay)).toMatchObject({ date: "2027-04-08", cost: "" });
  });

  it("préremplit le formulaire avec une activité lue en GraphQL", () => {
    expect(activityToInput(kyotoPage.activities[0])).toEqual({
      name: "Pavillon d'or (Kinkaku-ji)",
      description: "",
      category: "culture",
      date: "2027-04-09",
      start_time: "09:30",
      cost: "45.00",
    });
  });

  it("laisse vides l'heure absente et le coût nul", () => {
    const free = { ...kyotoPage.activities[0], startTime: null, cost: "0.00" };
    expect(activityToInput(free)).toMatchObject({ start_time: "", cost: "" });
  });
});
