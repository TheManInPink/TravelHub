import Link from "next/link";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatDateRange } from "@/lib/format";
import type { Trip } from "@/types/api";
import { TripStatusBadge } from "./TripStatusBadge";

// Carte d'un voyage : titre, dates, statut et coût total. Server Component, sans état.
// Le tableau de bord l'utilise ici. L'étape 8 la reprend pour la liste des voyages et
// y ajoute la couverture et le nombre de destinations.

interface TripCardProps {
  trip: Trip;
  /** Niveau du titre : h3 sous une section en h2, h2 directement sous le h1 de la page. */
  titleAs?: "h2" | "h3";
}

export function TripCard({ trip, titleAs: Title = "h3" }: TripCardProps) {
  return (
    // Toute la carte est cliquable : le lien du titre la recouvre avec after:inset-0.
    // Le contour de focus du lien se voit donc sur toute la carte.
    <Card className="relative transition-shadow hover:shadow-md has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <CardHeader>
        <CardTitle>
          <Title className="text-base font-medium text-pretty">
            <Link
              href={`/trips/${trip.id}`}
              className="outline-none after:absolute after:inset-0 after:content-['']"
            >
              {trip.title}
            </Link>
          </Title>
        </CardTitle>
        <CardDescription>{formatDateRange(trip.start_date, trip.end_date)}</CardDescription>
        <CardAction>
          <TripStatusBadge status={trip.status} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Coût total :{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatAmount(trip.total_cost)}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
