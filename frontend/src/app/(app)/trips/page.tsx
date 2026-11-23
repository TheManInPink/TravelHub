import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestionIcon, PlaneIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { TripFilters } from "@/components/trips/TripFilters";
import { TripList } from "@/components/trips/TripList";
import { TripPagination } from "@/components/trips/TripPagination";
import { Button } from "@/components/ui/button";
import { listTrips } from "@/lib/api/trips";
import { verifySession } from "@/lib/auth/session";
import { isApiError, toUserMessage } from "@/lib/errors";
import {
  hasActiveFilters,
  parseTripListQuery,
  tripListHref,
  tripListSummary,
} from "@/lib/tripList";
import type { Paginated, Trip } from "@/types/api";

export const metadata: Metadata = {
  title: "Mes voyages",
};

// Liste des voyages, rendue au serveur à chaque visite (SSR). Les filtres, le tri et la
// page sont dans l'URL : la page les lit dans searchParams (une Promise depuis
// Next.js 15), puis demande à Django la bonne page de voyages (GET /api/trips/).
// TripFilters, un Client Component, ne fait qu'écrire l'URL.

function NewTripButton() {
  return (
    <Button asChild>
      <Link href="/trips/new">
        <PlusIcon aria-hidden="true" />
        Nouveau voyage
      </Link>
    </Button>
  );
}

export default async function TripsPage({ searchParams }: PageProps<"/trips">) {
  await verifySession();
  const query = parseTripListQuery(await searchParams);
  const { page, ...filters } = query;

  let result: Paginated<Trip> | null = null;
  let loadError: string | null = null;
  let pageMissing = false;
  try {
    result = await listTrips(query);
  } catch (error) {
    // Erreurs attendues (délai dépassé au réveil de Render, 429, 503) : affichées ici
    // avec leur message, car error.tsx ne recevrait qu'un texte générique en production.
    if (!isApiError(error)) {
      throw error;
    }
    // Django répond 404 (« Page non valide. ») pour une page après la dernière.
    if (error.status === 404 && page > 1) {
      pageMissing = true;
    } else {
      loadError = toUserMessage(error);
    }
  }

  const filtered = hasActiveFilters(filters);
  const header = (
    <PageHeader
      title="Mes voyages"
      description="Les voyages dont vous êtes propriétaire ou participant."
      actions={<NewTripButton />}
    />
  );

  // Aucun voyage du tout : les filtres ne serviraient à rien.
  if (result && result.count === 0 && !filtered) {
    return (
      <>
        {header}
        <EmptyState
          icon={PlaneIcon}
          title="Vous n'avez encore aucun voyage"
          description="Créez votre premier voyage pour suivre ses dates, son budget et ses activités au même endroit."
          action={<NewTripButton />}
        />
      </>
    );
  }

  let content;
  if (pageMissing) {
    content = (
      <EmptyState
        icon={FileQuestionIcon}
        title="Cette page n'existe pas"
        description="La liste a moins de pages, par exemple après une suppression."
        action={
          <Button asChild variant="outline">
            <Link href={tripListHref(filters)}>Revenir à la première page</Link>
          </Button>
        }
      />
    );
  } else if (result === null) {
    content = (
      <ErrorState
        title="La liste des voyages n'a pas pu se charger"
        message={loadError ?? "Réessayez dans un instant."}
      />
    );
  } else if (result.count === 0) {
    content = (
      <EmptyState
        icon={SearchXIcon}
        title="Aucun voyage ne correspond à ces filtres"
        description="Essayez un autre statut ou d'autres mots, ou effacez les filtres."
        action={
          <Button asChild variant="outline">
            <Link href="/trips">Effacer les filtres</Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <p role="status" className="text-sm text-muted-foreground">
          {tripListSummary(result.count, page, filtered)}
        </p>
        <TripList trips={result.results} />
        <TripPagination page={page} count={result.count} filters={filters} />
      </>
    );
  }

  return (
    <>
      {header}
      <TripFilters {...filters} />
      {content}
    </>
  );
}
