import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarPlusIcon, PencilIcon } from "lucide-react";
import { ActivityDialog } from "@/components/activities/ActivityDialog";
import { ActivityList } from "@/components/activities/ActivityList";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Figure } from "@/components/layout/Figure";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { participantRoleFromGql } from "@/lib/api/mappers";
import { sumAmounts } from "@/lib/decimal";
import { formatAmount, formatDate, formatDateRange } from "@/lib/format";
import { editDestinationHref, tripHref } from "@/lib/itineraryPaths";
import { canEditTrip } from "@/lib/tripAccess";
import type { GqlDestinationPage } from "@/types/graphql";
import { DeleteDestinationButton } from "./DeleteDestinationButton";

// Affichage de la page d'une destination (Server Component). La page charge la
// destination par la query GraphQL DestinationPage, puis ce composant l'affiche : Vitest
// peut le tester avec des props.
//
// Les boutons dépendent de trip.myRole : le propriétaire et les éditeurs modifient la
// destination et ses activités, un lecteur ne voit que la liste. Les dialogues et les
// boutons de suppression sont les seuls Client Components de la page.

/** Boutons de la destination, ou undefined pour un lecteur. */
function destinationActions(destination: GqlDestinationPage, canEdit: boolean): ReactNode {
  if (!canEdit) {
    return undefined;
  }
  return (
    <>
      <Button asChild variant="outline">
        <Link href={editDestinationHref(destination.trip.id, destination.id)}>
          <PencilIcon aria-hidden="true" />
          Modifier
        </Link>
      </Button>
      <DeleteDestinationButton destinationId={destination.id} city={destination.city} />
    </>
  );
}

export function DestinationView({ destination }: { destination: GqlDestinationPage }) {
  const { trip, activities } = destination;
  const canEdit = canEditTrip(participantRoleFromGql(trip.myRole));
  const stay = { start: destination.arrivalDate, end: destination.departureDate };
  const addActivity = canEdit ? (
    <ActivityDialog destinationId={destination.id} stay={stay} />
  ) : null;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Mes voyages", href: "/trips" },
          { label: trip.title, href: tripHref(trip.id) },
          { label: destination.city },
        ]}
      />

      <PageHeader
        title={destination.city}
        description={`${destination.country} (${destination.countryCode}) · ${formatDateRange(stay.start, stay.end)}`}
        actions={destinationActions(destination, canEdit)}
      />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Arrivée">{formatDate(stay.start, "medium")}</Figure>
        <Figure label="Départ">{formatDate(stay.end, "medium")}</Figure>
        <Figure label="Activités">{activities.length}</Figure>
        <Figure label="Coût des activités">
          {formatAmount(sumAmounts(activities.map((activity) => activity.cost)))}
        </Figure>
      </dl>

      <section aria-labelledby="activites" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="activites" className="text-lg font-semibold">
            Activités
          </h2>
          {activities.length > 0 ? addActivity : null}
        </div>
        {activities.length > 0 ? (
          <ActivityList
            destinationId={destination.id}
            stay={stay}
            activities={activities}
            canEdit={canEdit}
          />
        ) : (
          <EmptyState
            icon={CalendarPlusIcon}
            titleAs="h3"
            title="Aucune activité prévue"
            description={
              canEdit
                ? "Ajoutez une visite, un repas ou un transport pendant le séjour."
                : "Le propriétaire ou un éditeur du voyage peut en ajouter."
            }
            action={addActivity}
          />
        )}
      </section>
    </>
  );
}
