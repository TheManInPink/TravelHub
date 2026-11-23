import type { Metadata } from "next";
import Link from "next/link";
import { DestinationForm } from "@/components/destinations/DestinationForm";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccessDenied } from "@/components/trips/AccessDenied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadDestinationPage } from "@/lib/api/destinationPage";
import { getDestinationPage } from "@/lib/api/itinerary";
import { parseId, participantRoleFromGql } from "@/lib/api/mappers";
import { verifySession } from "@/lib/auth/session";
import { destinationHref, tripHref } from "@/lib/itineraryPaths";
import { canEditTrip, participantRoleLabel } from "@/lib/tripAccess";

// Modification d'une destination. Le serveur lit la destination et son voyage par la
// query GraphQL DestinationPage, puis envoie le formulaire déjà rempli. L'envoi passe
// par la Server Action updateDestinationAction (mutation GraphQL updateDestination).
//
// Comme pour un voyage, Django laisse un lecteur lire la destination et ne refuse que
// la mutation. La page lit donc myRole, et montre l'écran d'accès refusé au lecteur.

export async function generateMetadata({
  params,
}: PageProps<"/trips/[tripId]/destinations/[destinationId]/edit">): Promise<Metadata> {
  const { destinationId } = await params;
  if (parseId(destinationId) === null) {
    return { title: "Modifier une destination" };
  }
  try {
    const destination = await getDestinationPage(destinationId);
    return { title: `Modifier ${destination.city} · ${destination.trip.title}` };
  } catch {
    return { title: "Modifier une destination" };
  }
}

export default async function EditDestinationPage({
  params,
}: PageProps<"/trips/[tripId]/destinations/[destinationId]/edit">) {
  await verifySession();
  const { tripId, destinationId } = await params;
  const data = await loadDestinationPage(tripId, destinationId);

  if (data.kind === "error") {
    return (
      <>
        <Breadcrumbs
          items={[
            { label: "Mes voyages", href: "/trips" },
            { label: "Voyage", href: tripHref(tripId) },
            { label: "Modifier" },
          ]}
        />
        <ErrorState
          titleAs="h1"
          title="La destination n'a pas pu se charger"
          message={data.message}
        />
      </>
    );
  }

  const { destination } = data;
  const { trip } = destination;
  const role = participantRoleFromGql(trip.myRole);
  const backHref = destinationHref(trip.id, destination.id);
  if (!canEditTrip(role)) {
    return (
      <AccessDenied
        title="Vous ne pouvez pas modifier cette destination"
        description={`Votre rôle dans « ${trip.title} » est ${participantRoleLabel(role).toLowerCase()}. Seuls le propriétaire et les éditeurs peuvent modifier l'itinéraire.`}
        action={
          <Button asChild>
            <Link href={backHref}>Retour à la destination</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Mes voyages", href: "/trips" },
          { label: trip.title, href: tripHref(trip.id) },
          { label: destination.city, href: backHref },
          { label: "Modifier" },
        ]}
      />
      <PageHeader title="Modifier la destination" description={destination.city} />
      <Card className="w-full max-w-2xl">
        <CardContent>
          <DestinationForm
            tripId={trip.id}
            trip={{ start: trip.startDate, end: trip.endDate }}
            destination={destination}
            cancelHref={backHref}
          />
        </CardContent>
      </Card>
    </>
  );
}
