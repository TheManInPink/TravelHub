import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccessDenied } from "@/components/trips/AccessDenied";
import { TripForm } from "@/components/trips/TripForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadTripPage } from "@/lib/api/tripPage";
import { getTrip } from "@/lib/api/trips";
import { verifySession } from "@/lib/auth/session";
import { canEditTrip, participantRoleLabel } from "@/lib/tripAccess";

// Modification d'un voyage. Le serveur charge le voyage (GET /api/trips/{id}/) et
// envoie le formulaire déjà rempli : il n'y a pas de clignotement au chargement.
// L'envoi passe par la Server Action updateTripAction (PATCH /api/trips/{id}/).
//
// Django répond 200 au GET d'un lecteur et ne refuse (403) que le PATCH. La page lit
// donc my_role, et montre l'écran d'accès refusé au lecteur au lieu d'un formulaire
// qu'il ne pourrait pas enregistrer.

export async function generateMetadata({
  params,
}: PageProps<"/trips/[tripId]/edit">): Promise<Metadata> {
  const { tripId } = await params;
  try {
    const trip = await getTrip(tripId);
    return { title: `Modifier ${trip.title}` };
  } catch {
    return { title: "Modifier un voyage" };
  }
}

export default async function EditTripPage({ params }: PageProps<"/trips/[tripId]/edit">) {
  await verifySession();
  const { tripId } = await params;
  const data = await loadTripPage(tripId);

  if (data.kind === "forbidden") {
    return <AccessDenied />;
  }
  if (data.kind === "error") {
    return (
      <>
        <Breadcrumbs items={[{ label: "Mes voyages", href: "/trips" }, { label: "Modifier" }]} />
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
  if (!canEditTrip(trip.my_role)) {
    return (
      <AccessDenied
        title="Vous ne pouvez pas modifier ce voyage"
        description={`Votre rôle dans « ${trip.title} » est ${participantRoleLabel(trip.my_role).toLowerCase()}. Seuls le propriétaire et les éditeurs peuvent le modifier.`}
        action={
          <Button asChild>
            <Link href={`/trips/${trip.id}`}>Retour au voyage</Link>
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
          { label: trip.title, href: `/trips/${trip.id}` },
          { label: "Modifier" },
        ]}
      />
      <PageHeader title="Modifier le voyage" description={trip.title} />
      <Card className="w-full max-w-2xl">
        <CardContent>
          <TripForm trip={trip} />
        </CardContent>
      </Card>
    </>
  );
}
