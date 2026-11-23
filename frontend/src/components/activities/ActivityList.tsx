import { ClockIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { activityCategoryLabel } from "@/lib/activityCategory";
import { activityCategoryFromGql } from "@/lib/api/mappers";
import type { DateRange } from "@/lib/dates";
import { sumAmounts } from "@/lib/decimal";
import { formatAmount, formatCount, formatDate, formatTime } from "@/lib/format";
import type { IsoDate } from "@/types/api";
import type { GqlActivity, GqlId } from "@/types/graphql";
import { ActivityDialog } from "./ActivityDialog";
import { DeleteActivityButton } from "./DeleteActivityButton";

// Activités d'une destination, groupées par jour (Server Component). Django les envoie
// déjà triées par date, puis par heure (les activités sans heure en dernier). Chaque jour
// affiche son nombre d'activités et son coût.
//
// Pour le propriétaire et les éditeurs, chaque activité a deux boutons : Modifier
// (ActivityDialog) et Supprimer (DeleteActivityButton). Ce sont les seuls îlots
// interactifs de la liste.

interface ActivityListProps {
  destinationId: GqlId;
  /** Arrivée et départ de la destination, pour le formulaire de modification. */
  stay: DateRange;
  activities: GqlActivity[];
  /** Vrai pour le propriétaire et les éditeurs. */
  canEdit: boolean;
}

interface ActivityDay {
  date: IsoDate;
  activities: GqlActivity[];
}

/** Regroupe les activités par date, en gardant l'ordre reçu de Django. */
export function groupByDate(activities: readonly GqlActivity[]): ActivityDay[] {
  const days = new Map<IsoDate, GqlActivity[]>();
  for (const activity of activities) {
    const day = days.get(activity.date);
    if (day) {
      day.push(activity);
    } else {
      days.set(activity.date, [activity]);
    }
  }
  return Array.from(days, ([date, items]) => ({ date, activities: items }));
}

/** « vendredi 9 avril 2027 » devient « Vendredi 9 avril 2027 » pour un titre. */
function dayTitle(date: IsoDate): string {
  const text = formatDate(date, "full");
  return text.charAt(0).toLocaleUpperCase("fr-CA") + text.slice(1);
}

interface ActivityRowProps {
  activity: GqlActivity;
  destinationId: GqlId;
  stay: DateRange;
  canEdit: boolean;
}

function ActivityRow({ activity, destinationId, stay, canEdit }: ActivityRowProps) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-medium text-pretty">{activity.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <ClockIcon aria-hidden="true" className="size-3.5" />
            {activity.startTime ? formatTime(activity.startTime) : "Sans heure fixe"}
          </span>
          <Badge variant="outline">
            {activityCategoryLabel(activityCategoryFromGql(activity.category))}
          </Badge>
        </p>
        {activity.description ? (
          <p className="text-sm text-pretty whitespace-pre-line text-muted-foreground">
            {activity.description}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <p className="mr-1 text-sm font-medium tabular-nums">{formatAmount(activity.cost)}</p>
        {canEdit ? (
          <>
            <ActivityDialog destinationId={destinationId} stay={stay} activity={activity} />
            <DeleteActivityButton
              destinationId={destinationId}
              activityId={activity.id}
              activityName={activity.name}
            />
          </>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityList({ destinationId, stay, activities, canEdit }: ActivityListProps) {
  return (
    <ol className="flex flex-col gap-4">
      {groupByDate(activities).map((day) => (
        <li key={day.date}>
          <Card>
            <CardHeader>
              <CardTitle>
                <h3 className="text-base font-semibold">{dayTitle(day.date)}</h3>
              </CardTitle>
              <CardDescription>
                {formatCount(day.activities.length, "activité", "activités")} ·{" "}
                {formatAmount(sumAmounts(day.activities.map((activity) => activity.cost)))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {day.activities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    destinationId={destinationId}
                    stay={stay}
                    canEdit={canEdit}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
