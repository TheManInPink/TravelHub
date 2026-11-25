import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { formatAmount, formatDate } from "@/lib/format";
import type { Trip, TripStats } from "@/types/api";

// Chiffres du tableau de bord : nombre de voyages, voyages à venir, puis budget, coût
// total et budget restant du prochain voyage. Composant d'affichage (Server Component) :
// il reçoit tout en props. NextTripStats charge les statistiques et le rend sous Suspense.

interface StatsCardsProps {
  /** Nombre total de voyages (count de Django). */
  tripCount: number;
  /** Nombre de voyages qui commencent aujourd'hui ou plus tard. */
  upcomingCount: number;
  /** Prochain voyage, ou null s'il n'y a aucun voyage à venir. */
  nextTrip: Pick<Trip, "id" | "title" | "start_date"> | null;
  /** Statistiques du prochain voyage (GET /api/trips/{id}/stats/). */
  stats?: TripStats | null;
  /** Message affiché à la place des montants quand les statistiques n'ont pas pu être lues. */
  statsError?: string | null;
}

const countFormat = new Intl.NumberFormat("fr-CA");

/** Une valeur et son libellé. dt et dd sont les enfants directs de la carte, comme le veut <dl>. */
function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Card size="sm" className="gap-1 px-(--card-spacing)">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-2xl font-semibold text-destructive tabular-nums"
            : "text-2xl font-semibold tabular-nums"
        }
      >
        {value}
      </dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </Card>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${countFormat.format(count)} ${count > 1 ? pluralForm : singular}`;
}

/** Budget restant : négatif quand le coût total dépasse le budget, null sans budget. */
function RemainingCard({ remaining }: { remaining: string | null }) {
  if (remaining === null) {
    return <StatCard label="Budget restant" value="—" hint="Aucun budget fixé" />;
  }
  if (remaining.startsWith("-")) {
    // Nous retirons le signe dans la chaîne, sans calcul en nombre flottant.
    return (
      <StatCard
        label="Budget restant"
        value={formatAmount(remaining)}
        hint={`Dépassement de ${formatAmount(remaining.slice(1))}`}
        tone="danger"
      />
    );
  }
  return <StatCard label="Budget restant" value={formatAmount(remaining)} />;
}

function NextTripAmounts({ stats, statsError }: Pick<StatsCardsProps, "stats" | "statsError">) {
  if (statsError || !stats) {
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Le budget de ce voyage n'a pas pu être chargé. {statsError}
      </p>
    );
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <StatCard
        label="Budget"
        value={stats.budget === null ? "—" : formatAmount(stats.budget)}
        hint={stats.budget === null ? "Aucun budget fixé" : undefined}
      />
      <StatCard
        label="Coût total"
        value={formatAmount(stats.total_cost)}
        hint={plural(stats.activity_count, "activité", "activités")}
      />
      <RemainingCard remaining={stats.remaining_budget} />
    </dl>
  );
}

export function StatsCards({
  tripCount,
  upcomingCount,
  nextTrip,
  stats = null,
  statsError = null,
}: StatsCardsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <dl className="grid grid-cols-2 gap-3">
        <StatCard label="Voyages" value={countFormat.format(tripCount)} hint="Au total" />
        <StatCard
          label="Voyages à venir"
          value={countFormat.format(upcomingCount)}
          hint="À partir d'aujourd'hui"
        />
      </dl>

      <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
        {nextTrip ? (
          <>
            <p className="text-sm">
              <span className="text-muted-foreground">Prochain voyage : </span>
              <Link
                href={`/trips/${nextTrip.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {nextTrip.title}
              </Link>
              <span className="text-muted-foreground">, le {formatDate(nextTrip.start_date)}</span>
            </p>
            <NextTripAmounts stats={stats} statsError={statsError} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun voyage à venir. Le budget de votre prochain voyage s'affichera ici.
          </p>
        )}
      </div>
    </div>
  );
}
