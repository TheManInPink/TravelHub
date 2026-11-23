import { formatCount } from "@/lib/format";
import { firstParam } from "@/lib/searchParams";
import { isTripStatus } from "@/lib/tripStatus";
import type { TripStatus } from "@/types/api";

// Filtres, tri et pagination de la liste des voyages (/trips), lus dans l'URL.
// Ce module n'importe pas « server-only » : la page (serveur) lit l'URL avec
// parseTripListQuery, et TripFilters (client) écrit l'URL avec tripListHref.

/** Tris acceptés par Django (ordering_fields de TripViewSet), avec ou sans « - ». */
export const TRIP_ORDERINGS = [
  "start_date",
  "-start_date",
  "title",
  "-title",
  "created_at",
  "-created_at",
] as const;

export type TripOrdering = (typeof TRIP_ORDERINGS)[number];

/** Sert à vérifier un tri lu dans l'URL (searchParams) avant d'appeler listTrips. */
export function isTripOrdering(value: string): value is TripOrdering {
  const orderings: readonly string[] = TRIP_ORDERINGS;
  return orderings.includes(value);
}

/** Tri de Django quand l'URL n'en donne pas (ordering de TripViewSet). */
export const DEFAULT_TRIP_ORDERING: TripOrdering = "start_date";

/** Libellés du menu de tri, dans l'ordre affiché. */
export const TRIP_ORDERING_LABELS: Readonly<Record<TripOrdering, string>> = {
  start_date: "Date de début, la plus proche d'abord",
  "-start_date": "Date de début, la plus lointaine d'abord",
  title: "Titre, de A à Z",
  "-title": "Titre, de Z à A",
  "-created_at": "Créés récemment",
  created_at: "Créés il y a longtemps",
};

/** PAGE_SIZE de PageNumberPagination dans Django (REST_FRAMEWORK de base.py). */
export const TRIPS_PAGE_SIZE = 20;

/** Une recherche plus longue n'a pas de sens et allongerait l'URL. */
const SEARCH_MAX = 100;

/** Les filtres de la liste. Une valeur absente veut dire « pas de filtre ». */
export interface TripListFilters {
  status?: TripStatus;
  /** Mots cherchés dans le titre et la description, sans espaces autour. */
  search?: string;
  ordering?: TripOrdering;
}

export interface TripListQuery extends TripListFilters {
  /** Numéro de page, à partir de 1. */
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

/** "3" donne 3. Tout ce qui n'est pas un entier positif donne la première page. */
function parsePage(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) {
    return 1;
  }
  return Number(value);
}

/**
 * Lit les filtres dans les searchParams de la page. Une valeur inconnue est ignorée,
 * comme si elle n'était pas dans l'URL. Django ignorerait aussi un tri inconnu, mais il
 * répondrait 400 pour un statut inconnu.
 */
export function parseTripListQuery(params: SearchParams): TripListQuery {
  const status = firstParam(params.status);
  const search = firstParam(params.search)?.trim().slice(0, SEARCH_MAX);
  const ordering = firstParam(params.ordering);
  return {
    status: status && isTripStatus(status) ? status : undefined,
    search: search || undefined,
    ordering: ordering && isTripOrdering(ordering) ? ordering : undefined,
    page: parsePage(firstParam(params.page)),
  };
}

/** Vrai si un filtre réduit la liste. Le tri ne compte pas : il ne retire aucun voyage. */
export function hasActiveFilters(filters: TripListFilters): boolean {
  return filters.status !== undefined || Boolean(filters.search);
}

/** Adresse de la liste avec ces filtres. La page 1 et le tri par défaut restent implicites. */
export function tripListHref(query: TripListFilters & { page?: number }): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.ordering && query.ordering !== DEFAULT_TRIP_ORDERING) {
    params.set("ordering", query.ordering);
  }
  if (query.page !== undefined && query.page > 1) params.set("page", String(query.page));
  const queryString = params.toString();
  return queryString ? `/trips?${queryString}` : "/trips";
}

/** Nombre de pages pour count voyages (au moins 1, même sans voyage). */
export function pageCount(count: number): number {
  return Math.max(1, Math.ceil(count / TRIPS_PAGE_SIZE));
}

/**
 * Phrase au-dessus de la liste : « 3 voyages », « 2 voyages trouvés » avec des filtres,
 * ou « Voyages 21 à 40 sur 45 » quand il y a plusieurs pages.
 */
export function tripListSummary(count: number, page: number, filtered: boolean): string {
  if (count <= TRIPS_PAGE_SIZE) {
    return filtered
      ? formatCount(count, "voyage trouvé", "voyages trouvés")
      : formatCount(count, "voyage", "voyages");
  }
  const first = (page - 1) * TRIPS_PAGE_SIZE + 1;
  const last = Math.min(page * TRIPS_PAGE_SIZE, count);
  return `Voyages ${first} à ${last} sur ${count}`;
}
