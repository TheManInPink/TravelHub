import { z } from "zod";
import type { DateRange } from "@/lib/dates";
import { fractionDigits, normalizeDecimalInput } from "@/lib/decimal";
import { formatDate } from "@/lib/format";
import { isoDate, withoutIssues } from "@/lib/validation/fields";
import type { GqlDestination } from "@/types/graphql";

// Schéma du formulaire d'une destination, partagé par DestinationForm (zodResolver) et
// par les Server Actions de actions/destinations.ts. Les règles sont celles de Django
// (apps/itinerary/models.py). Le séjour doit tenir dans le voyage : le schéma dépend
// donc des dates du voyage, que nous passons en paramètre.

/** max_length des champs city et country dans Django. */
export const PLACE_MAX = 120;

/** latitude et longitude sont des DecimalField(max_digits=9, decimal_places=6). */
const COORDINATE_DECIMALS = 6;

const DEPARTURE_BEFORE_ARRIVAL =
  "La date de départ doit être postérieure ou égale à la date d'arrivée.";

/** Ville ou pays, de 1 à 120 caractères après trim. */
function place(requiredMessage: string, label: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(PLACE_MAX, `${label} fait ${PLACE_MAX} caractères au plus.`);
}

/**
 * Latitude (de -90 à 90) ou longitude (de -180 à 180) facultative, en degrés décimaux.
 * Le champ vide donne null. La chaîne reste une chaîne, avec un point.
 */
function coordinate(label: "latitude" | "longitude", limit: number, example: string) {
  return z
    .string()
    .transform(normalizeDecimalInput)
    .refine((value) => value === "" || /^-?\d+(?:\.\d+)?$/.test(value), {
      error: `Entrez la ${label} en degrés décimaux, par exemple ${example}.`,
      abort: true,
    })
    .refine((value) => value === "" || Math.abs(Number(value)) <= limit, {
      error: `La ${label} est comprise entre -${limit} et ${limit}.`,
      abort: true,
    })
    .refine((value) => fractionDigits(value) <= COORDINATE_DECIMALS, {
      error: `La ${label} a au plus ${COORDINATE_DECIMALS} décimales.`,
    })
    .transform((value) => (value === "" ? null : value));
}

/**
 * Schéma d'une destination pour un voyage. trip contient le début et la fin du voyage :
 * l'arrivée ne peut pas précéder le début, et le départ ne peut pas suivre la fin.
 */
export function destinationSchema(trip: DateRange) {
  return (
    z
      .object({
        city: place("Entrez la ville.", "La ville"),
        country: place("Entrez le pays.", "Le pays"),
        // Django met le code en majuscules (« jp » devient « JP ») : nous aussi.
        country_code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}$/, "Entrez le code du pays en deux lettres, par exemple JP."),
        arrival_date: isoDate("Choisissez la date d'arrivée.").refine(
          (date) => date >= trip.start,
          {
            error: `L'arrivée ne peut pas précéder le début du voyage (${formatDate(trip.start)}).`,
          },
        ),
        departure_date: isoDate("Choisissez la date de départ.").refine(
          (date) => date <= trip.end,
          { error: `Le départ ne peut pas suivre la fin du voyage (${formatDate(trip.end)}).` },
        ),
        latitude: coordinate("latitude", 90, "35,0116"),
        longitude: coordinate("longitude", 180, "135,7681"),
      })
      .refine((values) => values.departure_date >= values.arrival_date, {
        path: ["departure_date"],
        error: DEPARTURE_BEFORE_ARRIVAL,
        // Deux dates "AAAA-MM-JJ" se comparent comme des chaînes.
        when: withoutIssues("arrival_date", "departure_date"),
      })
      // Les coordonnées vont ensemble, comme l'exige la contrainte de Django. L'erreur va
      // sous le champ resté vide.
      .refine((values) => values.latitude === null || values.longitude !== null, {
        path: ["longitude"],
        error: "Entrez aussi la longitude, ou laissez les deux coordonnées vides.",
        when: withoutIssues("latitude", "longitude"),
      })
      .refine((values) => values.longitude === null || values.latitude !== null, {
        path: ["latitude"],
        error: "Entrez aussi la latitude, ou laissez les deux coordonnées vides.",
        when: withoutIssues("latitude", "longitude"),
      })
  );
}

type DestinationSchema = ReturnType<typeof destinationSchema>;

/** Valeurs saisies dans le formulaire (avant trim et conversion). */
export type DestinationInput = z.input<DestinationSchema>;
/** Valeurs validées : code pays en majuscules, coordonnées en chaînes ou null. */
export type DestinationValues = z.output<DestinationSchema>;
export type DestinationField = keyof DestinationInput;

/** Noms des champs, pour ramener les details de Django sous le bon champ. */
export const DESTINATION_FIELDS: readonly DestinationField[] = [
  "city",
  "country",
  "country_code",
  "arrival_date",
  "departure_date",
  "latitude",
  "longitude",
];

/** Formulaire vide. Les dates proposées sont celles du voyage. */
export function emptyDestinationInput(trip: DateRange): DestinationInput {
  return {
    city: "",
    country: "",
    country_code: "",
    arrival_date: trip.start,
    departure_date: trip.end,
    latitude: "",
    longitude: "",
  };
}

/** Valeurs du formulaire de modification, préremplies avec la destination lue en GraphQL. */
export function destinationToInput(destination: GqlDestination): DestinationInput {
  return {
    city: destination.city,
    country: destination.country,
    country_code: destination.countryCode,
    arrival_date: destination.arrivalDate,
    departure_date: destination.departureDate,
    // Sans coordonnées, Django envoie null : les champs restent vides.
    latitude: destination.latitude ?? "",
    longitude: destination.longitude ?? "",
  };
}
