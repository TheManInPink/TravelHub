import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Squelettes affichés pendant le chargement (loading.tsx et fallback de Suspense).
// Ils sont masqués aux lecteurs d'écran (aria-hidden) : c'est le conteneur qui annonce
// le chargement, avec role="status" et un texte caché.

/** Forme d'une carte de voyage : image, titre, dates et statut. */
export function TripCardSkeleton() {
  return (
    <Card aria-hidden="true" className="pt-0">
      <Skeleton className="h-36 w-full rounded-none" />
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-5 w-20 rounded-full" />
      </CardContent>
    </Card>
  );
}

/** Grille de cartes, pour la liste des voyages et le tableau de bord. */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <TripCardSkeleton key={index} />
      ))}
    </div>
  );
}

/** Page de détail : un bloc principal et une colonne à droite sur grand écran. */
export function DetailSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Une carte de chiffre : libellé, valeur et précision. */
function StatCardSkeleton() {
  return (
    <Card size="sm" className="gap-2 px-(--card-spacing)">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-7 w-28 max-w-full" />
      <Skeleton className="h-3 w-16" />
    </Card>
  );
}

/**
 * Chiffres du tableau de bord, en attendant NextTripStats (même grille que StatsCards).
 * Il sert seul de fallback à Suspense, donc il annonce lui-même le chargement.
 */
export function StatsSkeleton() {
  return (
    <div role="status" className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <span className="sr-only">Chargement des statistiques…</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
        <Skeleton className="h-4 w-2/3" />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Titre et description d'une page, en attendant PageHeader. */
export function PageHeaderSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** Place du menu du compte, le temps que Django renvoie l'utilisateur (étape 4). */
export function UserMenuSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-2">
      <Skeleton className="size-8 rounded-full" />
      <Skeleton className="hidden h-4 w-24 sm:block" />
    </div>
  );
}
