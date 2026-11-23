import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView, greeting } from "@/components/dashboard/DashboardView";
import { NextTripStats } from "@/components/dashboard/NextTripStats";
import { ErrorState } from "@/components/feedback/ErrorState";
import { StatsSkeleton } from "@/components/feedback/Skeletons";
import { PageHeader } from "@/components/layout/PageHeader";
import { loadDashboard, type DashboardData } from "@/lib/api/dashboard";
import { verifySession } from "@/lib/auth/session";
import { todayIsoDate } from "@/lib/dates";
import { isApiError, toUserMessage } from "@/lib/errors";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

// Tableau de bord, rendu au serveur à chaque visite (SSR dynamique, car la page lit les
// cookies). La page charge les données, puis DashboardView les affiche.
//
// Deux temps de streaming :
// 1. loading.tsx du groupe (app) s'affiche pendant verifySession() et les trois listes
//    de voyages, lancées en parallèle ;
// 2. la page arrive ensuite avec StatsSkeleton à la place des chiffres. Les statistiques
//    du prochain voyage demandent une requête de plus, qui dépend de la liste des
//    voyages à venir. NextTripStats les charge sous Suspense, et React les envoie dans
//    la même réponse dès qu'elles sont prêtes.

export default async function DashboardPage() {
  // Toujours en premier dans une page protégée : c'est la vraie vérification de la
  // session. Sans compte valide, verifySession() redirige vers la connexion.
  const user = await verifySession();

  let data: DashboardData | null = null;
  let loadError: string | null = null;
  try {
    data = await loadDashboard(todayIsoDate());
  } catch (error) {
    // Une erreur attendue (délai dépassé au réveil de Render, 429, 503) est affichée ici
    // avec son message. error.tsx ne recevrait qu'un texte générique en production.
    if (!isApiError(error)) {
      throw error;
    }
    loadError = toUserMessage(error);
  }

  if (data === null) {
    return (
      <>
        <PageHeader title={greeting(user)} />
        <ErrorState
          title="Le tableau de bord n'a pas pu se charger"
          message={loadError ?? "Réessayez dans un instant."}
        />
      </>
    );
  }

  return (
    <DashboardView
      user={user}
      data={data}
      stats={
        <Suspense fallback={<StatsSkeleton />}>
          <NextTripStats
            tripCount={data.tripCount}
            upcomingCount={data.upcomingCount}
            nextTrip={data.upcomingTrips[0] ?? null}
          />
        </Suspense>
      }
    />
  );
}
