// Types des réponses de l'API REST de Django, écrits à la main d'après les serializers
// (apps/*/serializers.py). Les noms de champs restent en snake_case, comme dans le JSON.
// Django envoie les montants, les coordonnées, les dates et les heures sous forme de
// chaînes ("4500.00", "35.676200", "2026-11-22", "14:30:00"). Nous les gardons en string
// et lib/format.ts les met en forme sans passer par un nombre flottant.

/** Date sans heure, au format "AAAA-MM-JJ". */
export type IsoDate = string;
/** Date avec heure ISO 8601, par exemple "2026-11-22T23:42:00.123456Z". */
export type IsoDateTime = string;
/** Heure "HH:MM:SS". */
export type IsoTime = string;
/** Nombre décimal exact en chaîne, par exemple "4500.00". */
export type DecimalString = string;

// Valeurs des TextChoices de Django, en minuscules dans l'API REST.
// L'API GraphQL les écrit en majuscules (voir types/graphql.ts et lib/api/mappers.ts).
export type TripStatus = "draft" | "planned" | "ongoing" | "completed" | "cancelled";
export type ParticipantRole = "owner" | "editor" | "viewer";
export type ActivityCategory =
  | "sightseeing"
  | "culture"
  | "food"
  | "nature"
  | "sport"
  | "transport"
  | "accommodation"
  | "other";

// Comptes (apps/accounts/serializers.py)

/** UserSerializer : profil de l'utilisateur connecté (GET /api/auth/me/). */
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: IsoDateTime;
}

/** UserSummarySerializer : propriétaire d'un voyage ou participant. */
export interface UserSummary {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
}

/** TokenPairSerializer : jetons renvoyés par /api/auth/token/ et /api/auth/register/. */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** RegisterResponseSerializer : réponse de POST /api/auth/register/. */
export interface RegisterResponse {
  user: User;
  tokens: TokenPair;
}

// Voyages (apps/trips/serializers.py)

/** TripSerializer : un voyage dans la liste, après une création ou une modification. */
export interface Trip {
  id: number;
  title: string;
  description: string;
  start_date: IsoDate;
  end_date: IsoDate;
  status: TripStatus;
  /** null quand le voyage n'a pas de budget. */
  budget: DecimalString | null;
  /** Adresse de l'image dans Supabase Storage, ou chaîne vide sans image. */
  cover_image_url: string;
  owner: UserSummary;
  /** Rôle de l'utilisateur connecté. Sert à masquer les boutons qu'il ne peut pas utiliser. */
  my_role: ParticipantRole;
  destination_count: number;
  activity_count: number;
  /** Somme des coûts de toutes les activités du voyage. */
  total_cost: DecimalString;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** TripDetailSerializer : GET /api/trips/{id}/, avec les destinations et leurs activités. */
export interface TripDetail extends Trip {
  destinations: NestedDestination[];
}

/** Champs acceptés par POST /api/trips/. Les champs absents prennent leur valeur par défaut. */
export interface TripCreatePayload {
  title: string;
  description?: string;
  start_date: IsoDate;
  end_date: IsoDate;
  /** "draft" par défaut. */
  status?: TripStatus;
  budget?: DecimalString | null;
  cover_image_url?: string;
}

/** Champs acceptés par PATCH /api/trips/{id}/ : seuls les champs envoyés changent. */
export type TripUpdatePayload = Partial<TripCreatePayload>;

/** CategoryStatsSerializer : une ligne de by_category dans les statistiques. */
export interface CategoryStats {
  category: ActivityCategory;
  /** Libellé français de la catégorie, par exemple « Restauration ». */
  label: string;
  count: number;
  total_cost: DecimalString;
  average_cost: DecimalString;
}

/** TripStatsSerializer : GET /api/trips/{id}/stats/. */
export interface TripStats {
  /** Identifiant du voyage. */
  trip: number;
  budget: DecimalString | null;
  total_cost: DecimalString;
  /** Budget moins le coût total. Négatif en cas de dépassement, null sans budget. */
  remaining_budget: DecimalString | null;
  destination_count: number;
  activity_count: number;
  /** Coût moyen d'une activité, null sans activité. */
  average_cost: DecimalString | null;
  by_category: CategoryStats[];
}

/** ParticipantSerializer : GET /api/trips/{id}/participants/. */
export interface Participant {
  user: UserSummary;
  role: ParticipantRole;
  joined_at: IsoDateTime;
  /** null pour le propriétaire, qui n'a été invité par personne. */
  invited_by: UserSummary | null;
}

// Itinéraire (apps/itinerary/serializers.py)

/** NestedActivitySerializer : activité dans le détail d'un voyage. */
export interface NestedActivity {
  id: number;
  name: string;
  description: string;
  category: ActivityCategory;
  date: IsoDate;
  /** null quand l'activité n'a pas d'heure de début. */
  start_time: IsoTime | null;
  cost: DecimalString;
}

/** DestinationSummarySerializer : destination sans ses activités. */
export interface DestinationSummary {
  id: number;
  order: number;
  city: string;
  country: string;
  /** Code ISO 3166-1 alpha-2 en majuscules, par exemple "JP". */
  country_code: string;
  arrival_date: IsoDate;
  departure_date: IsoDate;
  /** Les deux coordonnées sont null ensemble tant que la ville n'est pas géocodée. */
  latitude: DecimalString | null;
  longitude: DecimalString | null;
}

/** NestedDestinationSerializer : destination et ses activités dans le détail d'un voyage. */
export interface NestedDestination extends DestinationSummary {
  activities: NestedActivity[];
}

/** DestinationSerializer : GET /api/destinations/{id}/. */
export interface Destination extends DestinationSummary {
  /** Identifiant du voyage. */
  trip: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** ActivitySerializer : GET /api/activities/{id}/. */
export interface Activity extends NestedActivity {
  /** Identifiant de la destination. */
  destination: number;
  /** Identifiant du voyage de la destination (lecture seule). */
  trip: number;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
}

// Services externes (apps/integrations/serializers.py)

/** UnitsSerializer : unités des valeurs météo. */
export interface WeatherUnits {
  /** "°C" */
  temperature: string;
  /** "km/h" */
  wind_speed: string;
  /** "mm" */
  precipitation: string;
}

/** CurrentWeatherSerializer : météo actuelle. Open-Meteo peut laisser une valeur vide. */
export interface CurrentWeather {
  /** Heure locale de la destination (ISO 8601, sans fuseau). */
  time: string;
  temperature: number | null;
  wind_speed: number | null;
  precipitation: number | null;
  /** Code météo WMO. */
  weather_code: number | null;
  /** Libellé français du code météo. */
  description: string;
}

/** DailyForecastSerializer : prévision d'un jour du séjour. */
export interface DailyForecast {
  date: IsoDate;
  temperature_max: number | null;
  temperature_min: number | null;
  precipitation_sum: number | null;
  wind_speed_max: number | null;
  weather_code: number | null;
  description: string;
}

/** ForecastSerializer : prévisions d'Open-Meteo pour une destination. */
export interface Forecast {
  /** Fuseau de la destination, par exemple "Asia/Tokyo". */
  timezone: string;
  units: WeatherUnits;
  current: CurrentWeather;
  /** Jours du séjour compris dans les 16 jours de prévision. */
  daily: DailyForecast[];
}

/** DestinationWeatherSerializer : GET /api/destinations/{id}/weather/. */
export interface DestinationWeather extends Forecast {
  /** Identifiant de la destination. */
  destination: number;
  city: string;
  country_code: string;
  /** La météo demande des coordonnées, donc elles ne sont jamais null ici. */
  latitude: DecimalString;
  longitude: DecimalString;
}

/** LanguageSerializer : langue parlée dans un pays. */
export interface Language {
  /** Nom anglais, par exemple "Japanese". */
  name: string;
  /** Nom dans la langue elle-même, par exemple "日本語". */
  native: string;
}

/** CountrySerializer : fiche pays de Countries GraphQL, en anglais. */
export interface Country {
  /** Code ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  native: string;
  capital: string | null;
  /** Drapeau. */
  emoji: string;
  /** Codes ISO 4217 séparés par des virgules, tels que fournis. */
  currency: string | null;
  /** Les mêmes codes, en liste. */
  currencies: string[];
  continent: string;
  languages: Language[];
}

// Pagination et erreurs

/** Page de PageNumberPagination (20 éléments par page). */
export interface Paginated<T> {
  count: number;
  /** Adresse de la page suivante, ou null sur la dernière page. */
  next: string | null;
  /** Adresse de la page précédente, ou null sur la première page. */
  previous: string | null;
  results: T[];
}

/**
 * Détails d'une erreur. Pour validation_error, chaque champ donne une liste de messages,
 * par exemple {"end_date": ["…"]}. Pour les autres codes, l'objet est souvent vide.
 */
export type ApiErrorDetails = Record<string, unknown>;

/** Enveloppe de toutes les erreurs REST (apps/core/exceptions.py). */
export interface ApiErrorBody {
  error: {
    /** Identifiant stable, par exemple not_found ou validation_error. */
    code: string;
    /** Phrase lisible, en français. */
    message: string;
    details: ApiErrorDetails;
  };
}

// Réponses des Route Handlers de Next.js (le BFF), lues par le navigateur

/**
 * Erreur d'un Route Handler, par exemple la météo. Le code vient de Django (ou du
 * front-end, comme network_error) et le message est déjà prêt pour l'utilisateur.
 */
export interface BffErrorBody {
  error: {
    code: string;
    message: string;
  };
}
