// Adresses des pages d'un voyage et de son itinéraire. Les liens des composants et les
// Server Actions (redirect, revalidatePath) les construisent ici, au même endroit.
// Les identifiants peuvent venir de l'API REST (3) ou de GraphQL ("3").

type Id = number | string;

/** "/trips/1" */
export function tripHref(tripId: Id): string {
  return `/trips/${tripId}`;
}

/** "/trips/1/destinations/new" */
export function newDestinationHref(tripId: Id): string {
  return `${tripHref(tripId)}/destinations/new`;
}

/** "/trips/1/destinations/3" */
export function destinationHref(tripId: Id, destinationId: Id): string {
  return `${tripHref(tripId)}/destinations/${destinationId}`;
}

/** "/trips/1/destinations/3/edit" */
export function editDestinationHref(tripId: Id, destinationId: Id): string {
  return `${destinationHref(tripId, destinationId)}/edit`;
}

/**
 * Pages à rafraîchir après un changement dans l'itinéraire. La liste des voyages et le
 * tableau de bord montrent aussi le nombre de destinations et le coût total.
 */
export function itineraryPaths(tripId: Id, destinationId?: Id): string[] {
  const paths = ["/trips", "/dashboard", tripHref(tripId)];
  if (destinationId !== undefined) {
    paths.push(destinationHref(tripId, destinationId));
  }
  return paths;
}
