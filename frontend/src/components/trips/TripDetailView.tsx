import Link from "next/link";
import type { ReactNode } from "react";
import { PencilIcon } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAmount, formatDateRange, userDisplayName } from "@/lib/format";
import { canDeleteTrip, canEditTrip, participantRoleLabel } from "@/lib/tripAccess";
import type { TripDetail } from "@/types/api";
import { DeleteTripButton } from "./DeleteTripButton";
import { TripCover } from "./TripCover";
import { TripItinerary } from "./TripItinerary";
import { TripStatusBadge } from "./TripStatusBadge";

// Affichage du détail d'un voyage (Server Component). La page trips/[tripId]/page.tsx
// charge le voyage, puis ce composant l'affiche : Vitest peut le tester avec des props.
//
// Les boutons dépendent de my_role, le rôle renvoyé par Django : Modifier pour le
// propriétaire et les éditeurs, Supprimer pour le propriétaire seulement. Le bouton
// Supprimer est un Client Component (dialogue de confirmation) : c'est le seul îlot
// interactif de la page.

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** Boutons du voyage selon le rôle, ou undefined pour un lecteur (aucun bouton). */
function tripActions(trip: TripDetail): ReactNode {
  const canEdit = canEditTrip(trip.my_role);
  const canDelete = canDeleteTrip(trip.my_role);
  if (!canEdit && !canDelete) {
    return undefined;
  }
  return (
    <>
      {canEdit ? (
        <Button asChild variant="outline">
          <Link href={`/trips/${trip.id}/edit`}>
            <PencilIcon aria-hidden="true" />
            Modifier
          </Link>
        </Button>
      ) : null}
      {canDelete ? <DeleteTripButton tripId={trip.id} tripTitle={trip.title} /> : null}
    </>
  );
}

export function TripDetailView({ trip }: { trip: TripDetail }) {
  return (
    <>
      <Breadcrumbs items={[{ label: "Mes voyages", href: "/trips" }, { label: trip.title }]} />

      {/* Sans image, pas de bandeau vide : l'étape 11 ajoutera l'envoi d'une image. */}
      {trip.cover_image_url ? (
        <TripCover
          url={trip.cover_image_url}
          alt={`Couverture du voyage ${trip.title}`}
          sizes="(min-width: 1152px) 72rem, 100vw"
          preload
          className="h-40 rounded-xl sm:h-56"
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <PageHeader
          title={trip.title}
          description={formatDateRange(trip.start_date, trip.end_date)}
          actions={tripActions(trip)}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <TripStatusBadge status={trip.status} />
          <Badge variant="outline">Votre rôle : {participantRoleLabel(trip.my_role)}</Badge>
          {trip.my_role === "owner" ? null : (
            <span>Organisé par {userDisplayName(trip.owner)}</span>
          )}
        </div>
        {trip.description ? (
          <p className="max-w-prose text-pretty whitespace-pre-line">{trip.description}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Budget">{trip.budget ? formatAmount(trip.budget) : "Aucun"}</Figure>
        <Figure label="Coût total">{formatAmount(trip.total_cost)}</Figure>
        <Figure label="Destinations">{trip.destination_count}</Figure>
        <Figure label="Activités">{trip.activity_count}</Figure>
      </dl>

      <TripItinerary destinations={trip.destinations} />
    </>
  );
}
