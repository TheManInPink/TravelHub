import type { Trip } from "@/types/api";
import { TripCard } from "./TripCard";

// Grille des cartes de voyage de la page /trips (Server Component). Les titres des cartes
// sont des h2, car ils suivent directement le h1 « Mes voyages ».

export function TripList({ trips }: { trips: Trip[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((trip) => (
        <li key={trip.id}>
          <TripCard trip={trip} titleAs="h2" />
        </li>
      ))}
    </ul>
  );
}
