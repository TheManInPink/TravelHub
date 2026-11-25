// Types des opérations GraphQL envoyées à /graphql/ (documents dans lib/api/itinerary.ts).
// Ils décrivent seulement les champs que nous demandons, d'après le schéma de Django
// (python manage.py graphql_schema). Par rapport à l'API REST, trois choses changent.
// Les champs sont en camelCase, les enums en majuscules et les identifiants sont des
// chaînes ("3"). Les montants, les coordonnées, les dates et les heures restent des chaînes.

import type { DecimalString, IsoDate, IsoTime } from "./api";

/** Identifiant GraphQL (type ID), toujours une chaîne. */
export type GqlId = string;

// Enums du schéma, tirés des mêmes TextChoices que l'API REST.
export type GqlTripStatus = "DRAFT" | "PLANNED" | "ONGOING" | "COMPLETED" | "CANCELLED";
export type GqlParticipantRole = "OWNER" | "EDITOR" | "VIEWER";
export type GqlActivityCategory =
  "SIGHTSEEING" | "CULTURE" | "FOOD" | "NATURE" | "SPORT" | "TRANSPORT" | "ACCOMMODATION" | "OTHER";

// Champs demandés sur chaque type (fragments DestinationFields et ActivityFields)

/** Fragment DestinationFields. */
export interface GqlDestination {
  id: GqlId;
  order: number;
  city: string;
  country: string;
  countryCode: string;
  arrivalDate: IsoDate;
  departureDate: IsoDate;
  latitude: DecimalString | null;
  longitude: DecimalString | null;
}

/** Fragment ActivityFields. */
export interface GqlActivity {
  id: GqlId;
  name: string;
  description: string;
  category: GqlActivityCategory;
  date: IsoDate;
  startTime: IsoTime | null;
  cost: DecimalString;
}

/** Voyage d'une destination, tel que la page destination le demande. */
export interface GqlDestinationTrip {
  id: GqlId;
  title: string;
  status: GqlTripStatus;
  startDate: IsoDate;
  endDate: IsoDate;
  myRole: GqlParticipantRole;
}

/** Type CountryInfo (Countries GraphQL, en anglais). */
export interface GqlCountryInfo {
  code: string;
  name: string;
  native: string;
  capital: string | null;
  emoji: string;
  currency: string | null;
  currencies: string[];
  continent: string;
  languages: { name: string; native: string }[];
}

// Query DestinationPage

/** Destination avec son voyage et ses activités. */
export interface GqlDestinationPage extends GqlDestination {
  trip: GqlDestinationTrip;
  activities: GqlActivity[];
}

export interface DestinationPageQuery {
  /** null seulement avec une erreur not_found dans errors[]. */
  destination: GqlDestinationPage | null;
}

export interface DestinationPageQueryVariables {
  id: GqlId;
}

// Query DestinationCountry

export interface DestinationCountryQuery {
  destination: {
    id: GqlId;
    /** null si Countries GraphQL ne répond pas (avec une erreur external_service_*). */
    countryInfo: GqlCountryInfo | null;
  } | null;
}

export interface DestinationCountryQueryVariables {
  id: GqlId;
}

// Entrées des mutations (DestinationCreateInput, ActivityCreateInput, etc.)

export interface DestinationCreateInput {
  trip: GqlId;
  order: number;
  city: string;
  country: string;
  /** Code ISO 3166-1 alpha-2. Django le met en majuscules. */
  countryCode: string;
  arrivalDate: IsoDate;
  departureDate: IsoDate;
  latitude?: DecimalString | null;
  longitude?: DecimalString | null;
}

/** Seuls les champs envoyés changent. Changer de ville efface les coordonnées. */
export type DestinationUpdateInput = Partial<Omit<DestinationCreateInput, "trip">>;

export interface ActivityCreateInput {
  destination: GqlId;
  name: string;
  description?: string;
  /** OTHER par défaut. */
  category?: GqlActivityCategory;
  date: IsoDate;
  startTime?: IsoTime | null;
  cost?: DecimalString;
}

/** Seuls les champs envoyés changent. */
export type ActivityUpdateInput = Partial<Omit<ActivityCreateInput, "destination">>;

// Mutations. Le schéma déclare leur résultat nullable : il vaut null quand errors[]
// contient une erreur, et gqlFetch lève alors une ApiError.

/** Résultat de deleteDestination et de deleteActivity. */
export interface GqlDeleteResult {
  ok: boolean;
  /** Identifiant de l'objet supprimé. */
  id: GqlId;
}

export interface CreateDestinationMutation {
  createDestination: { destination: GqlDestination | null } | null;
}

export interface CreateDestinationMutationVariables {
  input: DestinationCreateInput;
}

export interface UpdateDestinationMutation {
  updateDestination: { destination: GqlDestination | null } | null;
}

export interface UpdateDestinationMutationVariables {
  id: GqlId;
  input: DestinationUpdateInput;
}

export interface DeleteDestinationMutation {
  deleteDestination: GqlDeleteResult | null;
}

export interface DeleteDestinationMutationVariables {
  id: GqlId;
}

export interface CreateActivityMutation {
  createActivity: { activity: GqlActivity | null } | null;
}

export interface CreateActivityMutationVariables {
  input: ActivityCreateInput;
}

export interface UpdateActivityMutation {
  updateActivity: { activity: GqlActivity | null } | null;
}

export interface UpdateActivityMutationVariables {
  id: GqlId;
  input: ActivityUpdateInput;
}

export interface DeleteActivityMutation {
  deleteActivity: GqlDeleteResult | null;
}

export interface DeleteActivityMutationVariables {
  id: GqlId;
}

// Réponse HTTP de /graphql/

/** Une entrée de errors[]. Pour une erreur d'un resolver, extensions.code est toujours là. */
export interface GqlError {
  message: string;
  /** Chemin du champ en erreur. Absent pour une erreur de syntaxe ou de validation. */
  path?: (string | number)[];
  extensions?: {
    /** Même code que l'erreur REST équivalente (not_found, validation_error…). */
    code?: string;
    /** Erreurs par champ, avec les noms en camelCase ({"departureDate": ["…"]}). */
    details?: Record<string, unknown>;
  };
}

/** Corps d'une réponse de /graphql/. */
export interface GqlResponse<TData> {
  data?: TData | null;
  errors?: GqlError[];
}
