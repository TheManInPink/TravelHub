import { Suspense } from "react";
import { CountrySkeleton } from "@/components/feedback/Skeletons";
import { participantRoleFromGql } from "@/lib/api/mappers";
import { editDestinationHref } from "@/lib/itineraryPaths";
import { canEditTrip } from "@/lib/tripAccess";
import { weatherPath } from "@/lib/weather";
import type { GqlDestinationPage } from "@/types/graphql";
import { CountryCard } from "./CountryCard";
import { WeatherPanel } from "./WeatherPanel";

// Colonne latérale de la page d'une destination : la fiche pays, puis la météo
// (Server Component). Les deux viennent de services externes parfois lents, Countries
// GraphQL et Open-Meteo, que seul Django appelle. Aucune des deux ne retarde les
// activités, et chacune utilise un mode de rendu différent :
// - la fiche pays est rendue au serveur sous Suspense, puis envoyée en streaming ;
// - la météo est chargée par le navigateur (CSR), auprès du Route Handler de Next.js.

export function DestinationEnrichment({ destination }: { destination: GqlDestinationPage }) {
  const canEdit = canEditTrip(participantRoleFromGql(destination.trip.myRole));
  const path = weatherPath(destination);

  return (
    <>
      <section aria-labelledby="pays" className="flex flex-col gap-3">
        <h2 id="pays" className="text-lg font-semibold">
          Pays
        </h2>
        <Suspense fallback={<CountrySkeleton />}>
          <CountryCard destinationId={destination.id} />
        </Suspense>
      </section>

      <section aria-labelledby="meteo" className="flex flex-col gap-3">
        <h2 id="meteo" className="text-lg font-semibold">
          Météo
        </h2>
        {/* La clé change avec l'adresse : une autre destination, ou la même après une
            modification, repart de l'état de chargement. */}
        <WeatherPanel
          key={path}
          path={path}
          stay={{ start: destination.arrivalDate, end: destination.departureDate }}
          editHref={canEdit ? editDestinationHref(destination.trip.id, destination.id) : undefined}
        />
      </section>
    </>
  );
}
