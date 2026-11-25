import Link from "next/link";
import type { ReactNode } from "react";
import { HistoryIcon, MapIcon, PlaneIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { TripCard } from "@/components/trips/TripCard";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/api/dashboard";
import type { Trip, User } from "@/types/api";

// Affichage du tableau de bord (Server Component). Il reçoit les données en props :
// la page dashboard/page.tsx les charge, ce qui permet de tester ce composant avec Vitest
// (Vitest ne sait pas rendre une page asynchrone).

interface DashboardViewProps {
  user: Pick<User, "username" | "first_name">;
  data: DashboardData;
  /**
   * Statistiques, que la page enveloppe dans Suspense : elles arrivent en streaming,
   * après le reste du tableau de bord.
   */
  stats: ReactNode;
}

/** « Bonjour Alice », ou le nom d'utilisateur quand le prénom est vide. */
export function greeting(user: Pick<User, "username" | "first_name">): string {
  return `Bonjour ${user.first_name.trim() || user.username}`;
}

function QuickLinks({ lastUpdatedTrip }: { lastUpdatedTrip: Trip | null }) {
  return (
    <nav aria-label="Accès rapides" className="flex flex-wrap gap-2">
      <Button asChild>
        <Link href="/trips/new">
          <PlusIcon aria-hidden="true" />
          Nouveau voyage
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/trips">
          <MapIcon aria-hidden="true" />
          Mes voyages
        </Link>
      </Button>
      {lastUpdatedTrip ? (
        // max-w-full et truncate : un long titre ne dépasse pas de l'écran sur mobile.
        <Button asChild variant="outline" className="max-w-full">
          <Link href={`/trips/${lastUpdatedTrip.id}`}>
            <HistoryIcon aria-hidden="true" />
            <span className="truncate">Dernier voyage modifié : {lastUpdatedTrip.title}</span>
          </Link>
        </Button>
      ) : null}
    </nav>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-semibold">
      {children}
    </h2>
  );
}

export function DashboardView({ user, data, stats }: DashboardViewProps) {
  if (data.tripCount === 0) {
    return (
      <>
        <PageHeader title={greeting(user)} description="Bienvenue sur TravelHub." />
        <EmptyState
          icon={PlaneIcon}
          title="Vous n'avez encore aucun voyage"
          description="Créez votre premier voyage pour suivre ses dates, son budget et ses activités au même endroit."
          action={
            <Button asChild>
              <Link href="/trips/new">
                <PlusIcon aria-hidden="true" />
                Créer mon premier voyage
              </Link>
            </Button>
          }
        />
      </>
    );
  }

  const { currentTrip, upcomingTrips, upcomingCount } = data;

  return (
    <>
      <PageHeader title={greeting(user)} description="Voici où en sont vos voyages." />
      <QuickLinks lastUpdatedTrip={data.lastUpdatedTrip} />

      <section aria-labelledby="voyage-en-cours" className="flex flex-col gap-3">
        <SectionTitle id="voyage-en-cours">Voyage en cours</SectionTitle>
        {currentTrip ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TripCard trip={currentTrip} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Aucun voyage en cours aujourd'hui.</p>
        )}
      </section>

      <section aria-labelledby="en-chiffres" className="flex flex-col gap-3">
        <SectionTitle id="en-chiffres">En chiffres</SectionTitle>
        {stats}
      </section>

      <section aria-labelledby="prochains-voyages" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle id="prochains-voyages">Prochains voyages</SectionTitle>
          {upcomingCount > upcomingTrips.length ? (
            <Link href="/trips" className="text-sm font-medium underline-offset-4 hover:underline">
              Voir tous mes voyages
            </Link>
          ) : null}
        </div>
        {upcomingTrips.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingTrips.map((trip) => (
              <li key={trip.id}>
                <TripCard trip={trip} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun voyage à venir.{" "}
            <Link
              href="/trips/new"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Planifier un voyage
            </Link>
          </p>
        )}
      </section>
    </>
  );
}
