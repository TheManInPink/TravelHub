import Link from "next/link";
import { MapPinIcon, WalletIcon } from "lucide-react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatAmount, formatCount, formatDateRange } from "@/lib/format";
import type { Trip } from "@/types/api";
import { TripCover } from "./TripCover";
import { TripStatusBadge } from "./TripStatusBadge";

// Carte d'un voyage : couverture, titre, dates, statut, nombre de destinations et coût
// total. Server Component, sans état. Le tableau de bord (étape 7) et la liste des
// voyages (étape 8) l'utilisent.

interface TripCardProps {
  trip: Trip;
  /** Niveau du titre : h3 sous une section en h2, h2 directement sous le h1 de la page. */
  titleAs?: "h2" | "h3";
}

/** Largeur de la carte dans les grilles de 1, 2 ou 3 colonnes (max-w-6xl). */
const CARD_SIZES = "(min-width: 1024px) 22rem, (min-width: 640px) 50vw, 100vw";

export function TripCard({ trip, titleAs: Title = "h3" }: TripCardProps) {
  return (
    // Toute la carte est cliquable : le lien du titre la recouvre avec after:inset-0.
    // Le contour de focus du lien se voit donc sur toute la carte.
    <Card className="relative h-full pt-0 transition-shadow hover:shadow-md has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      {/* La couverture est décorative : le titre, juste en dessous, nomme le voyage. */}
      <TripCover url={trip.cover_image_url} alt="" sizes={CARD_SIZES} className="h-36" />
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
      <CardContent className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <MapPinIcon aria-hidden="true" className="size-4" />
          {formatCount(trip.destination_count, "destination", "destinations")}
        </p>
        <p className="flex items-center gap-1.5">
          <WalletIcon aria-hidden="true" className="size-4" />
          <span>
            Coût total :{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatAmount(trip.total_cost)}
            </span>
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
