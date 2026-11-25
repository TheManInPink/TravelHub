// Données de test qui imitent les réponses de Django. Elles sont typées avec types/api.ts
// et types/graphql.ts : si un type change, TypeScript signale aussi les données de test.

import type {
  DestinationWeather,
  Paginated,
  TokenPair,
  Trip,
  TripDetail,
  TripStats,
  User,
  UserSummary,
} from "@/types/api";
import type { GqlDestinationPage } from "@/types/graphql";

export const alice: UserSummary = {
  id: 1,
  username: "alice",
  first_name: "Alice",
  last_name: "Tremblay",
};

export const japanTrip: Trip = {
  id: 1,
  title: "Japon 2027",
  description: "Deux semaines entre Tokyo et Kyoto.",
  start_date: "2027-04-01",
  end_date: "2027-04-14",
  status: "planned",
  budget: "4500.00",
  cover_image_url: "",
  owner: alice,
  my_role: "owner",
  destination_count: 1,
  activity_count: 1,
  total_cost: "45.00",
  created_at: "2026-11-01T14:00:00Z",
  updated_at: "2026-11-01T14:00:00Z",
};

export const portugalTrip: Trip = {
  ...japanTrip,
  id: 2,
  title: "Portugal",
  description: "",
  start_date: "2027-07-10",
  end_date: "2027-07-20",
  status: "draft",
  budget: null,
  my_role: "editor",
  destination_count: 0,
  activity_count: 0,
  total_cost: "0.00",
};

export const tripPage: Paginated<Trip> = {
  count: 2,
  next: null,
  previous: null,
  results: [japanTrip, portugalTrip],
};

export const japanTripDetail: TripDetail = {
  ...japanTrip,
  destinations: [
    {
      id: 3,
      order: 1,
      city: "Kyoto",
      country: "Japon",
      country_code: "JP",
      arrival_date: "2027-04-08",
      departure_date: "2027-04-14",
      latitude: "35.011600",
      longitude: "135.768100",
      activities: [
        {
          id: 7,
          name: "Pavillon d'or (Kinkaku-ji)",
          description: "",
          category: "culture",
          date: "2027-04-09",
          start_time: "09:30:00",
          cost: "45.00",
        },
      ],
    },
  ],
};

export const japanTripStats: TripStats = {
  trip: 1,
  budget: "4500.00",
  total_cost: "45.00",
  remaining_budget: "4455.00",
  destination_count: 1,
  activity_count: 1,
  average_cost: "45.00",
  by_category: [
    {
      category: "culture",
      label: "Culture",
      count: 1,
      total_cost: "45.00",
      average_cost: "45.00",
    },
  ],
};

/** Réponse de la query DestinationPage pour la destination "3". */
export const kyotoPage: GqlDestinationPage = {
  id: "3",
  order: 1,
  city: "Kyoto",
  country: "Japon",
  countryCode: "JP",
  arrivalDate: "2027-04-08",
  departureDate: "2027-04-14",
  latitude: "35.011600",
  longitude: "135.768100",
  trip: {
    id: "1",
    title: "Japon 2027",
    status: "PLANNED",
    startDate: "2027-04-01",
    endDate: "2027-04-14",
    myRole: "OWNER",
  },
  activities: [
    {
      id: "7",
      name: "Pavillon d'or (Kinkaku-ji)",
      description: "",
      category: "CULTURE",
      date: "2027-04-09",
      startTime: "09:30:00",
      cost: "45.00",
    },
  ],
};

/**
 * Réponse de GET /api/destinations/3/weather/ : Kyoto, avec trois jours du séjour dans
 * les 16 jours de prévision d'Open-Meteo.
 */
export const kyotoWeather: DestinationWeather = {
  destination: 3,
  city: "Kyoto",
  country_code: "JP",
  latitude: "35.011600",
  longitude: "135.768100",
  timezone: "Asia/Tokyo",
  units: { temperature: "°C", wind_speed: "km/h", precipitation: "mm" },
  current: {
    time: "2027-04-08T09:15",
    temperature: 17.4,
    wind_speed: 6.1,
    precipitation: 0,
    weather_code: 2,
    description: "Partiellement nuageux",
  },
  daily: [
    {
      date: "2027-04-08",
      temperature_max: 21.3,
      temperature_min: 12.8,
      precipitation_sum: 0,
      wind_speed_max: 11.2,
      weather_code: 1,
      description: "Plutôt dégagé",
    },
    {
      date: "2027-04-09",
      temperature_max: 18.6,
      temperature_min: 11.4,
      precipitation_sum: 4.2,
      wind_speed_max: 19.8,
      weather_code: 61,
      description: "Pluie faible",
    },
    {
      date: "2027-04-10",
      temperature_max: null,
      temperature_min: null,
      precipitation_sum: null,
      wind_speed_max: null,
      weather_code: null,
      description: "",
    },
  ],
};

// Authentification. L'API simulée accepte seulement ces jetons et ce mot de passe.

export const aliceAccount: User = {
  ...alice,
  email: "alice@example.com",
  date_joined: "2026-10-01T12:00:00Z",
};

export const ALICE_PASSWORD = "Voyage-Montreal-2027";

/** Paire de jetons valide, par exemple dans les cookies d'un utilisateur connecté. */
export const validTokens: TokenPair = { access: "access-valide", refresh: "refresh-valide" };

/** Paire renvoyée par la connexion, l'inscription ou le rafraîchissement. */
export const newTokens: TokenPair = { access: "access-neuf", refresh: "refresh-neuf" };
