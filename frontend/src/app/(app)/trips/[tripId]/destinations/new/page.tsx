import type { Metadata } from "next";
import Link from "next/link";
import { DestinationForm } from "@/components/destinations/DestinationForm";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccessDenied } from "@/components/trips/AccessDenied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadTripPage } from "@/lib/api/tripPage";
import { getTrip } from "@/lib/api/trips";
import { verifySession } from "@/lib/auth/session";
import { formatDateRange } from "@/lib/format";
import { tripHref } from "@/lib/itineraryPaths";
import { canEditTrip, participantRoleLabel } from "@/lib/tripAccess";

// Ajout d'une destination à un voyage. Le serveur lit le voyage (GET /api/trips/{id}/)
// pour connaître ses dates et le rôle de l'utilisateur, puis affiche DestinationForm.
// L'envoi passe par la Server Action createDestinationAction (mutation GraphQL
// createDestination), qui place la destination à la fin de l'itinéraire.

export async function generateMetadata({
  params,
}: PageProps<"/trips/[tripId]/destinations/new">): Promise<Metadata> {
  const { tripId } = await params;
  try {
    const trip = await getTrip(tripId);
    return { title: `Nouvelle destination · ${trip.title}` };
  } catch {
    return { title: "Nouvelle destination" };
  }
}

export default async function NewDestinationPage({
  params,
}: PageProps<"/trips/[tripId]/destinations/new">) {
  await verifySession();
  const { tripId } = await params;
  const data = await loadTripPage(tripId);

  if (data.kind === "forbidden") {
    return <AccessDenied />;
  }
  if (data.kind === "error") {
    return (
      <>
        <Breadcrumbs
          items={[{ label: "Mes voyages", href: "/trips" }, { label: "Nouvelle destination" }]}
        />
        <ErrorState
          titleAs="h1"
          title="Le voyage n'a pas pu se charger"
          message={data.message}
          reference={data.reference}
        />
      </>
    );
  }

  const { trip } = data;
  // Django refuserait la mutation d'un lecteur (permission_denied) : nous ne lui
  // montrons pas un formulaire qu'il ne pourrait pas enregistrer.
  if (!canEditTrip(trip.my_role)) {
    return (
      <AccessDenied
        title="Vous ne pouvez pas modifier cet itinéraire"
        description={`Votre rôle dans « ${trip.title} » est ${participantRoleLabel(trip.my_role).toLowerCase()}. Seuls le propriétaire et les éditeurs peuvent ajouter une destination.`}
        action={
          <Button asChild>
            <Link href={tripHref(trip.id)}>Retour au voyage</Link>
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
          { label: "Nouvelle destination" },
        ]}
      />
      <PageHeader
        title="Nouvelle destination"
        description={`Elle sera ajoutée à la fin de l'itinéraire de « ${trip.title} », ${formatDateRange(trip.start_date, trip.end_date)}.`}
      />
      <Card className="w-full max-w-2xl">
        <CardContent>
          <DestinationForm
            tripId={trip.id}
            trip={{ start: trip.start_date, end: trip.end_date }}
            cancelHref={tripHref(trip.id)}
          />
        </CardContent>
      </Card>
    </>
  );
}
