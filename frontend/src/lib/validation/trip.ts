import { z } from "zod";
import { TRIP_STATUSES } from "@/lib/tripStatus";
import type { Trip } from "@/types/api";

// Schéma du formulaire d'un voyage, partagé par TripForm (zodResolver) et par les Server
// Actions de actions/trips.ts. L'utilisateur voit l'erreur tout de suite, et le serveur
// revalide quand même, car un appel à une Server Action peut être forgé.
// Les règles sont celles de Django (apps/trips/models.py et serializers.py).

/** max_length du champ title dans Django. */
export const TITLE_MAX = 200;

/** budget est un DecimalField(max_digits=10, decimal_places=2) : 8 chiffres avant la virgule. */
const BUDGET_INTEGER_DIGITS = 8;
const BUDGET_DECIMALS = 2;

const END_BEFORE_START = "La date de fin doit être postérieure ou égale à la date de début.";

/**
 * Date "AAAA-MM-JJ" obligatoire. z.iso.date() refuse aussi les dates impossibles,
 * comme le 30 février. Le champ <input type="date"> donne toujours ce format.
 */
function isoDate(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .pipe(z.iso.date("Entrez une date valide au format AAAA-MM-JJ."));
}

/**
 * Budget facultatif. Le champ vide donne null (pas de budget), comme dans Django.
 * Nous acceptons la virgule française (1500,50), puis nous envoyons un point à Django.
 * La chaîne reste une chaîne : nous ne passons jamais par un nombre flottant.
 */
const budget = z
  .string()
  .trim()
  .transform((value) => value.replace(",", "."))
  .refine((value) => !value.startsWith("-"), {
    error: "Le budget ne peut pas être négatif.",
    abort: true,
  })
  .refine((value) => value === "" || /^\d+(?:\.\d+)?$/.test(value), {
    error: "Entrez un montant, par exemple 1500 ou 1500,50.",
    abort: true,
  })
  .refine((value) => (value.split(".")[1] ?? "").length <= BUDGET_DECIMALS, {
    error: `Le budget a au plus ${BUDGET_DECIMALS} décimales.`,
    abort: true,
  })
  .refine((value) => (value.split(".")[0] ?? "").length <= BUDGET_INTEGER_DIGITS, {
    error: `Le budget a au plus ${BUDGET_INTEGER_DIGITS} chiffres avant la virgule.`,
  })
  .transform((value) => (value === "" ? null : value));

const dates = z.object({
  start_date: isoDate("Choisissez la date de début."),
  end_date: isoDate("Choisissez la date de fin."),
});

export const tripSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Entrez un titre.")
      .max(TITLE_MAX, `Le titre fait ${TITLE_MAX} caractères au plus.`),
    // Django retire aussi les espaces au début et à la fin (trim_whitespace de DRF).
    description: z.string().trim(),
    ...dates.shape,
    status: z.enum(TRIP_STATUSES, "Choisissez un statut."),
    budget,
  })
  .refine((values) => values.end_date >= values.start_date, {
    path: ["end_date"],
    error: END_BEFORE_START,
    // Sans when, Zod ne compare pas les dates tant qu'un autre champ (le titre, par
    // exemple) est en erreur. Nous les comparons dès que les deux dates sont valides.
    // Deux dates "AAAA-MM-JJ" se comparent comme des chaînes.
    when: (payload) => dates.safeParse(payload.value).success,
  });

/** Valeurs saisies dans le formulaire (avant trim et conversion du budget). */
export type TripInput = z.input<typeof tripSchema>;
/** Valeurs validées, envoyées à Django (budget en chaîne décimale ou null). */
export type TripValues = z.output<typeof tripSchema>;
export type TripField = keyof TripInput;

/** Noms des champs, pour ramener les details de Django sous le bon champ. */
export const TRIP_FIELDS: readonly TripField[] = [
  "title",
  "description",
  "start_date",
  "end_date",
  "status",
  "budget",
];

/** Valeurs d'un formulaire vide : un brouillon sans budget. */
export const EMPTY_TRIP_INPUT: TripInput = {
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  status: "draft",
  budget: "",
};

/** Valeurs du formulaire de modification, préremplies avec le voyage reçu de Django. */
export function tripToInput(trip: Trip): TripInput {
  return {
    title: trip.title,
    description: trip.description,
    start_date: trip.start_date,
    end_date: trip.end_date,
    status: trip.status,
    // Sans budget, Django envoie null : le champ reste vide.
    budget: trip.budget ?? "",
  };
}
