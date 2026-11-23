import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageCount, tripListHref, type TripListFilters } from "@/lib/tripList";

// Pagination de la liste des voyages (Server Component). Django renvoie 20 voyages par
// page et le nombre total (count). Les liens gardent les filtres de l'URL, et une page
// est une adresse qu'on peut partager (?page=2).

interface TripPaginationProps {
  /** Page affichée, à partir de 1. */
  page: number;
  /** Nombre total de voyages avec ces filtres (count de Django). */
  count: number;
  filters: TripListFilters;
}

export function TripPagination({ page, count, filters }: TripPaginationProps) {
  const total = pageCount(count);
  if (total <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pages de la liste" className="flex items-center justify-between gap-2">
      {page > 1 ? (
        <Button asChild variant="outline">
          <Link href={tripListHref({ ...filters, page: page - 1 })} rel="prev">
            <ChevronLeftIcon aria-hidden="true" />
            Précédente
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          <ChevronLeftIcon aria-hidden="true" />
          Précédente
        </Button>
      )}
      <p className="text-sm text-muted-foreground tabular-nums">
        Page {Math.min(page, total)} sur {total}
      </p>
      {page < total ? (
        <Button asChild variant="outline">
          <Link href={tripListHref({ ...filters, page: page + 1 })} rel="next">
            Suivante
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          Suivante
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
