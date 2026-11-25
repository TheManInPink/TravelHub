import type { Metadata } from "next";
import { DestinationView } from "@/components/destinations/DestinationView";
import { DestinationEnrichment } from "@/components/enrichment/DestinationEnrichment";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { loadDestinationPage } from "@/lib/api/destinationPage";
import { getDestinationPage } from "@/lib/api/itinerary";
import { parseId } from "@/lib/api/mappers";
import { verifySession } from "@/lib/auth/session";
import { tripHref } from "@/lib/itineraryPaths";

// Page d'une destination, rendue au serveur à chaque visite (SSR). Elle lit la
// destination, son voyage et ses activités en une seule query GraphQL (DestinationPage),
// envoyée par le serveur Next.js : le navigateur n'appelle jamais /graphql/.
// Après l'ajout, la modification ou la suppression d'une activité, la Server Action
// appelle revalidatePath, et Next.js renvoie cette page à jour sans rechargement.
//
// Le rendu est hybride. Les activités arrivent avec la page (SSR), la fiche pays suit
// en streaming sous Suspense, et la météo est chargée ensuite par le navigateur (CSR).

export async function generateMetadata({
  params,
}: PageProps<"/trips/[tripId]/destinations/[destinationId]">): Promise<Metadata> {
  const { destinationId } = await params;
  if (parseId(destinationId) === null) {
    return { title: "Destination" };
  }
  try {
    // Même appel que la page : cache() de React n'envoie qu'une requête à Django.
    const destination = await getDestinationPage(destinationId);
    return { title: `${destination.city} · ${destination.trip.title}` };
  } catch {
    return { title: "Destination" };
  }
}

export default async function DestinationDetailPage({
  params,
}: PageProps<"/trips/[tripId]/destinations/[destinationId]">) {
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
            { label: "Destination" },
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
  return (
    <DestinationView
      destination={data.destination}
      aside={<DestinationEnrichment destination={data.destination} />}
    />
  );
}
