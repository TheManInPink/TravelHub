import { getTripStats } from "@/lib/api/trips";
import { isApiError, toUserMessage } from "@/lib/errors";
import type { Trip, TripStats } from "@/types/api";
import { StatsCards } from "./StatsCards";

// Server Component asynchrone : il charge les statistiques du prochain voyage
// (GET /api/trips/{id}/stats/), puis rend StatsCards. La page le place dans
// <Suspense fallback={<StatsSkeleton />}>. Le reste du tableau de bord s'affiche donc sans
// attendre cette requête, et les chiffres arrivent ensuite dans la même réponse HTTP
// (streaming).

interface NextTripStatsProps {
  tripCount: number;
  upcomingCount: number;
  nextTrip: Trip | null;
}

export async function NextTripStats({ tripCount, upcomingCount, nextTrip }: NextTripStatsProps) {
  let stats: TripStats | null = null;
  let statsError: string | null = null;
  if (nextTrip) {
    try {
      stats = await getTripStats(nextTrip.id);
    } catch (error) {
      // Une erreur attendue de Django (délai dépassé, 429, 503) ne remplace pas tout le
      // tableau de bord : seul l'encadré du budget affiche le message.
      if (!isApiError(error)) {
        throw error;
      }
      statsError = toUserMessage(error);
    }
  }

  return (
    <StatsCards
      tripCount={tripCount}
      upcomingCount={upcomingCount}
      nextTrip={nextTrip}
      stats={stats}
      statsError={statsError}
    />
  );
}
