import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { tripStatusLabel } from "@/lib/tripStatus";
import type { TripStatus } from "@/types/api";

// Statut d'un voyage en badge, avec son libellé français. Server Component.
// La couleur aide à repérer le statut, mais le texte suffit à le comprendre.

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const VARIANTS: Readonly<Record<TripStatus, BadgeVariant>> = {
  draft: "outline",
  planned: "secondary",
  ongoing: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge variant={VARIANTS[status]}>{tripStatusLabel(status)}</Badge>;
}
