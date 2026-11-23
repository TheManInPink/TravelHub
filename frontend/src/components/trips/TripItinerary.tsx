import { CalendarDaysIcon, ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activityCategoryLabel } from "@/lib/activityCategory";
import { formatAmount, formatCount, formatDate, formatDateRange, formatTime } from "@/lib/format";
import type { NestedActivity, NestedDestination } from "@/types/api";

// Itinéraire d'un voyage (Server Component) : les destinations dans leur ordre, avec
// leurs dates et leurs activités. Django les envoie déjà triées (destinations par order,
// activités par date puis heure). L'étape 9 ajoutera un lien vers la page de chaque
// destination et le bouton « Ajouter une destination ».

function ActivityItem({ activity }: { activity: NestedActivity }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-pretty">{activity.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
            {formatDate(activity.date, "medium")}
          </span>
          {activity.start_time ? (
            <span className="flex items-center gap-1">
              <ClockIcon aria-hidden="true" className="size-3.5" />
              {formatTime(activity.start_time)}
            </span>
          ) : null}
          <Badge variant="outline">{activityCategoryLabel(activity.category)}</Badge>
        </p>
      </div>
      <p className="text-sm font-medium tabular-nums">{formatAmount(activity.cost)}</p>
    </li>
  );
}

function DestinationItem({ destination }: { destination: NestedDestination }) {
  const { activities } = destination;
  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              {/* Le numéro d'ordre est lu avant la ville : « 1. Kyoto ». */}
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground tabular-nums">
                {destination.order}
                <span className="sr-only">.</span>
              </span>
              {destination.city}
            </h3>
          </CardTitle>
          <CardDescription>
            {destination.country} ({destination.country_code}) ·{" "}
            {formatDateRange(destination.arrival_date, destination.departure_date)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {activities.length > 0
              ? formatCount(activities.length, "activité", "activités")
              : "Aucune activité prévue"}
          </h4>
          {activities.length > 0 ? (
            <ul className="divide-y">
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </li>
  );
}

export function TripItinerary({ destinations }: { destinations: NestedDestination[] }) {
  return (
    <section aria-labelledby="itineraire" className="flex flex-col gap-3">
      <h2 id="itineraire" className="text-lg font-semibold">
        Itinéraire
      </h2>
      {destinations.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {destinations.map((destination) => (
            <DestinationItem key={destination.id} destination={destination} />
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ce voyage n'a pas encore de destination.
        </p>
      )}
    </section>
  );
}
