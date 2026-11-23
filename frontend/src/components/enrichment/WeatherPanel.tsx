"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  CalendarCheckIcon,
  CalendarClockIcon,
  CloudDrizzleIcon,
  CloudFogIcon,
  CloudIcon,
  CloudLightningIcon,
  CloudOffIcon,
  CloudRainIcon,
  CloudSnowIcon,
  CloudSunIcon,
  MapPinOffIcon,
  PencilIcon,
  SunIcon,
  ThermometerIcon,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { ErrorState } from "@/components/feedback/ErrorState";
import { Notice } from "@/components/feedback/Notice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { todayIsoDate, type DateRange } from "@/lib/dates";
import { formatMeasure, formatShortDay, formatTime } from "@/lib/format";
import { fetchWeather, isRetryable, type WeatherFailure, type WeatherResult } from "@/lib/weather";
import type { DailyForecast, DestinationWeather, WeatherUnits } from "@/types/api";

// Météo d'une destination, chargée dans le navigateur (CSR). C'est un Client Component :
// il appelle le Route Handler après l'affichage de la page, garde la réponse dans un
// état et réagit au bouton Réessayer. Open-Meteo peut être lent, et la page n'attend
// donc pas la météo pour s'afficher.
//
// Le navigateur appelle seulement /api/destinations/{id}/weather (Next.js). L'onglet
// Réseau ne montre aucun appel à Open-Meteo : c'est Django qui l'appelle.

interface WeatherPanelProps {
  /** Adresse du Route Handler, donnée par weatherPath(). */
  path: string;
  /** Séjour à la destination. Il distingue un séjour terminé d'un séjour trop lointain. */
  stay: DateRange;
  /** Page de modification de la destination, pour le propriétaire et les éditeurs. */
  editHref?: string;
}

/** Libellé d'une valeur absente de la réponse (description vide). */
const UNKNOWN_CONDITIONS = "Conditions inconnues";

// Une icône par famille de codes météo WMO, ceux qu'Open-Meteo renvoie.
type Sky =
  "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm" | "unknown";

const SKY_ICONS: Record<Sky, LucideIcon> = {
  clear: SunIcon,
  partly: CloudSunIcon,
  cloudy: CloudIcon,
  fog: CloudFogIcon,
  drizzle: CloudDrizzleIcon,
  rain: CloudRainIcon,
  snow: CloudSnowIcon,
  storm: CloudLightningIcon,
  unknown: ThermometerIcon,
};

function skyOf(code: number | null): Sky {
  if (code === null) return "unknown";
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

function WeatherIcon({ code, className }: { code: number | null; className: string }) {
  const Icon = SKY_ICONS[skyOf(code)];
  return <Icon aria-hidden="true" className={className} />;
}

/** Une mesure et son libellé, dans une liste <dl>. */
function Measure({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** "2027-04-08T09:15" (heure de la destination) devient « 9 h 15 ». */
function localTime(value: string): string {
  return formatTime(value.split("T")[1] ?? value);
}

function DayForecast({ day, units }: { day: DailyForecast; units: WeatherUnits }) {
  return (
    <li className="flex gap-3 rounded-xl border bg-card p-3">
      <WeatherIcon
        code={day.weather_code}
        className="mt-0.5 size-6 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2">
          <time dateTime={day.date} className="font-medium">
            {formatShortDay(day.date)}
          </time>
          <span className="text-sm text-muted-foreground">
            {day.description || UNKNOWN_CONDITIONS}
          </span>
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
          <Measure label="Min." value={formatMeasure(day.temperature_min, units.temperature)} />
          <Measure label="Max." value={formatMeasure(day.temperature_max, units.temperature)} />
          <Measure
            label={<abbr title="Précipitations">Précip.</abbr>}
            value={formatMeasure(day.precipitation_sum, units.precipitation)}
          />
          <Measure label="Vent" value={formatMeasure(day.wind_speed_max, units.wind_speed)} />
        </dl>
      </div>
    </li>
  );
}

function WeatherForecast({ weather }: { weather: DestinationWeather }) {
  const { units, current, daily } = weather;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-sm text-muted-foreground">Maintenant à {weather.city}</h3>
            <p className="text-3xl font-semibold tabular-nums">
              {formatMeasure(current.temperature, units.temperature)}
            </p>
            <p>{current.description || UNKNOWN_CONDITIONS}</p>
          </div>
          <WeatherIcon
            code={current.weather_code}
            className="size-10 shrink-0 text-muted-foreground"
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 text-sm">
          <Measure label="Vent" value={formatMeasure(current.wind_speed, units.wind_speed)} />
          <Measure
            label={<abbr title="Précipitations">Précip.</abbr>}
            value={formatMeasure(current.precipitation, units.precipitation)}
          />
        </dl>
        <p className="text-xs text-muted-foreground">
          Relevé de {localTime(current.time)}, heure locale.
        </p>
      </div>

      {daily.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Prévisions du séjour</h3>
          <ul className="flex flex-col gap-2">
            {daily.map((day) => (
              <DayForecast key={day.date} day={day} units={units} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Source : Open-Meteo, par l&apos;API TravelHub.
      </p>
    </div>
  );
}

/** Forme du bloc météo pendant le chargement. Il annonce lui-même le chargement. */
function WeatherSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Chargement de la météo…</span>
      <Skeleton aria-hidden="true" className="h-40 w-full rounded-xl" />
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}

interface WeatherProblemProps {
  failure: WeatherFailure;
  stay: DateRange;
  editHref?: string;
  onRetry: () => void;
}

/** Un état par sorte d'erreur : pas de prévision, ville introuvable, panne, autre. */
function WeatherProblem({ failure, stay, editHref, onRetry }: WeatherProblemProps) {
  if (failure.code === "no_data_available") {
    // Django répond no_data_available dans les deux cas. Les dates disent lequel.
    if (stay.end < todayIsoDate()) {
      return (
        <EmptyState
          icon={CalendarCheckIcon}
          titleAs="h3"
          title="Séjour terminé"
          description="Open-Meteo donne seulement les prévisions des 16 prochains jours, pas la météo des jours passés."
        />
      );
    }
    return (
      <EmptyState
        icon={CalendarClockIcon}
        titleAs="h3"
        title="Prévisions disponibles 16 jours avant l'arrivée"
        description="Open-Meteo ne prévoit que les 16 prochains jours. Revenez quand l'arrivée sera plus proche."
      />
    );
  }

  if (failure.code === "location_not_found") {
    return (
      <Notice icon={MapPinOffIcon} title="Ville introuvable">
        <p>
          Open-Meteo ne trouve pas la ville de cette destination. Vérifiez son nom et son code pays,
          par exemple « Paris » et « FR ».
        </p>
        {editHref ? (
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href={editHref}>
              <PencilIcon aria-hidden="true" />
              Modifier la destination
            </Link>
          </Button>
        ) : (
          <p>Le propriétaire ou un éditeur du voyage peut corriger la ville.</p>
        )}
      </Notice>
    );
  }

  if (isRetryable(failure)) {
    return (
      <ErrorState
        titleAs="h3"
        title="La météo n'a pas pu se charger"
        message={failure.message}
        onRetry={onRetry}
      />
    );
  }

  // 401 (session expirée), 404 (destination supprimée) : réessayer ne changerait rien.
  return (
    <Notice icon={CloudOffIcon} title="Météo indisponible">
      <p>{failure.message}</p>
    </Notice>
  );
}

export function WeatherPanel({ path, stay, editHref }: WeatherPanelProps) {
  // null pendant le chargement.
  const [result, setResult] = useState<WeatherResult | null>(null);
  // Chaque clic sur Réessayer change attempt, ce qui relance l'effet.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchWeather(path, controller.signal).then((next) => {
      if (next) {
        setResult(next);
      }
    });
    // Page quittée ou nouvel essai : la requête en cours est annulée. Le Route Handler
    // annule alors aussi son appel à Django (request.signal).
    return () => {
      controller.abort();
    };
  }, [path, attempt]);

  function retry() {
    setResult(null);
    setAttempt((count) => count + 1);
  }

  if (!result) {
    return <WeatherSkeleton />;
  }
  if (result.ok) {
    return <WeatherForecast weather={result.weather} />;
  }
  return <WeatherProblem failure={result} stay={stay} editHref={editHref} onRetry={retry} />;
}
