import type { Metadata } from "next";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { AccessDenied } from "@/components/trips/AccessDenied";
import { TripDetailView } from "@/components/trips/TripDetailView";
import { loadTripPage } from "@/lib/api/tripPage";
import { getTrip } from "@/lib/api/trips";
import { verifySession } from "@/lib/auth/session";

// Détail d'un voyage, rendu au serveur à chaque visite (SSR). params est une Promise
// depuis Next.js 15. La page charge le voyage (GET /api/trips/{id}/, avec ses
// destinations et leurs activités), puis TripDetailView l'affiche. Seuls le bouton
// Supprimer et l'envoi de l'image de couverture sont des Client Components.

export async function generateMetadata({
  params,
}: PageProps<"/trips/[tripId]">): Promise<Metadata> {
  const { tripId } = await params;
  try {
    // Même appel que la page : cache() de React n'envoie qu'une requête à Django.
    const trip = await getTrip(tripId);
    return { title: trip.title };
  } catch {
    // La page affiche l'erreur elle-même. Le titre reste générique.
    return { title: "Voyage" };
  }
}

export default async function TripPage({ params }: PageProps<"/trips/[tripId]">) {
  await verifySession();
  const { tripId } = await params;
  const data = await loadTripPage(tripId);

  if (data.kind === "forbidden") {
    return <AccessDenied />;
  }
  if (data.kind === "error") {
    return (
      <>
        <Breadcrumbs items={[{ label: "Mes voyages", href: "/trips" }, { label: "Voyage" }]} />
        <ErrorState titleAs="h1" title="Le voyage n'a pas pu se charger" message={data.message} />
      </>
    );
  }
  return <TripDetailView trip={data.trip} />;
}
