import { z } from "zod";
import { ACTIVITY_CATEGORIES } from "@/lib/activityCategory";
import { activityCategoryFromGql } from "@/lib/api/mappers";
import { isDateWithin, type DateRange } from "@/lib/dates";
import { fractionDigits, integerDigits, normalizeDecimalInput, padDecimals } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { isoDate } from "@/lib/validation/fields";
import type { GqlActivity } from "@/types/graphql";

// Schéma du formulaire d'une activité, partagé par ActivityForm (zodResolver) et par les
// Server Actions de actions/activities.ts. Les règles sont celles de Django
// (apps/itinerary/models.py). La date doit tomber pendant le séjour à la destination :
// le schéma dépend donc des dates de la destination, que nous passons en paramètre.

/** max_length du champ name dans Django. */
export const ACTIVITY_NAME_MAX = 200;

/** cost est un DecimalField(max_digits=10, decimal_places=2) : 8 chiffres avant la virgule. */
const COST_INTEGER_DIGITS = 8;
const COST_DECIMALS = 2;

/** Heure "HH:MM" sur 24 heures, comme la donne <input type="time">. */
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Coût facultatif, 0 par défaut (activité gratuite), comme dans Django. Nous acceptons
 * la virgule française, puis nous envoyons une chaîne avec deux décimales ("12.50").
 */
const cost = z
  .string()
  .transform(normalizeDecimalInput)
  .refine((value) => !value.startsWith("-"), {
    error: "Le coût ne peut pas être négatif.",
    abort: true,
  })
  .refine((value) => value === "" || /^\d+(?:\.\d+)?$/.test(value), {
    error: "Entrez un montant, par exemple 25 ou 12,50.",
    abort: true,
  })
  .refine((value) => fractionDigits(value) <= COST_DECIMALS, {
    error: `Le coût a au plus ${COST_DECIMALS} décimales.`,
    abort: true,
  })
  .refine((value) => integerDigits(value) <= COST_INTEGER_DIGITS, {
    error: `Le coût a au plus ${COST_INTEGER_DIGITS} chiffres avant la virgule.`,
  })
  .transform((value) => padDecimals(value === "" ? "0" : value, COST_DECIMALS));

/** Heure de début facultative. Le champ vide donne null (pas d'heure), comme dans Django. */
const startTime = z
  .string()
  .trim()
  .refine((value) => value === "" || TIME_PATTERN.test(value), {
    error: "Entrez une heure au format HH:MM, par exemple 14:30.",
  })
  .transform((value) => (value === "" ? null : value));

/** Message quand la date tombe hors du séjour, avec les dates en français. */
export function outsideStayMessage(stay: DateRange): string {
  return `Choisissez une date du séjour, entre le ${formatDate(stay.start)} et le ${formatDate(stay.end)}.`;
}

/**
 * Schéma d'une activité pour une destination. stay contient l'arrivée et le départ de
 * la destination : la date de l'activité doit être entre les deux, bornes comprises.
 */
export function activitySchema(stay: DateRange) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, "Entrez le nom de l'activité.")
      .max(ACTIVITY_NAME_MAX, `Le nom fait ${ACTIVITY_NAME_MAX} caractères au plus.`),
    description: z.string().trim(),
    category: z.enum(ACTIVITY_CATEGORIES, "Choisissez une catégorie."),
    date: isoDate("Choisissez la date de l'activité.").refine(
      (date) => isDateWithin(date, stay.start, stay.end),
      { error: outsideStayMessage(stay) },
    ),
    start_time: startTime,
    cost,
  });
}

type ActivitySchema = ReturnType<typeof activitySchema>;

/** Valeurs saisies dans le formulaire (avant trim et conversion). */
export type ActivityInput = z.input<ActivitySchema>;
/** Valeurs validées : heure null si vide, coût en chaîne à deux décimales. */
export type ActivityValues = z.output<ActivitySchema>;
export type ActivityField = keyof ActivityInput;

/** Noms des champs, pour ramener les details de Django sous le bon champ. */
export const ACTIVITY_FIELDS: readonly ActivityField[] = [
  "name",
  "description",
  "category",
  "date",
  "start_time",
  "cost",
];

/** Formulaire vide. La date proposée est le premier jour du séjour. */
export function emptyActivityInput(stay: DateRange): ActivityInput {
  return {
    name: "",
    description: "",
    category: "sightseeing",
    date: stay.start,
    start_time: "",
    cost: "",
  };
}

/** Valeurs du formulaire de modification, préremplies avec l'activité lue en GraphQL. */
export function activityToInput(activity: GqlActivity): ActivityInput {
  return {
    name: activity.name,
    description: activity.description,
    // GraphQL écrit la catégorie en majuscules ("FOOD"), le formulaire en minuscules.
    category: activityCategoryFromGql(activity.category),
    date: activity.date,
    // Django envoie "09:30:00" : <input type="time"> attend "09:30".
    start_time: activity.startTime?.slice(0, 5) ?? "",
    // Un coût nul s'affiche comme un champ vide, qui veut dire « gratuit ».
    cost: Number(activity.cost) === 0 ? "" : activity.cost,
  };
}
