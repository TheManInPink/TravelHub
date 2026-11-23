import type { IsoDate } from "@/types/api";

// Dates du calendrier, au fuseau du back-end.

/** Fuseau de Django (TIME_ZONE dans config/settings/base.py). */
export const APP_TIME_ZONE = "America/Toronto";

/**
 * Date du jour à Toronto, au format "AAAA-MM-JJ", comme timezone.localdate() dans Django.
 * Vercel tourne en UTC : à 20 h à Toronto, la date UTC est déjà celle du lendemain, et
 * un voyage qui finit ce soir ne serait plus « en cours ».
 */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Vrai si la date est entre le début et la fin, bornes comprises. Des dates "AAAA-MM-JJ"
 * se comparent comme des chaînes, sans passer par new Date().
 */
export function isDateWithin(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return start <= date && date <= end;
}
