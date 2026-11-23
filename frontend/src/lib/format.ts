// Mise en forme des valeurs reçues de Django, en français canadien.
// Django envoie les dates ("2026-11-22"), les heures ("14:30:00") et les montants
// ("4500.00") sous forme de chaînes. Nous ne passons jamais par un nombre flottant
// pour les montants, et une valeur mal formée est renvoyée telle quelle.

import { APP_TIME_ZONE } from "./dates";

const LOCALE = "fr-CA";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

type DateStyle = "long" | "medium" | "short";

// Une date sans heure est lue en UTC et affichée en UTC. Sinon, new Date("2026-11-22")
// tombe le 21 novembre au soir à Toronto, et le serveur (en UTC) ne donnerait pas
// le même texte que le navigateur.
function parseDateOnly(value: string): Date | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Rejette les dates impossibles comme 2026-02-30, que Date.UTC décale au mois suivant.
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) {
    return null;
  }
  return date;
}

function dateFormatter(dateStyle: DateStyle): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle, timeZone: "UTC" });
}

function isDecimal(value: string): value is `${number}` {
  return DECIMAL_PATTERN.test(value);
}

/** "2026-11-22" devient « 22 novembre 2026 ». */
export function formatDate(value: string, dateStyle: DateStyle = "long"): string {
  const date = parseDateOnly(value);
  return date ? dateFormatter(dateStyle).format(date) : value;
}

/** Deux dates "AAAA-MM-JJ" deviennent une période, par exemple « 12–18 mars 2026 ». */
export function formatDateRange(
  start: string,
  end: string,
  dateStyle: DateStyle = "long",
): string {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate || endDate < startDate) {
    return `${formatDate(start, dateStyle)} au ${formatDate(end, dateStyle)}`;
  }
  return dateFormatter(dateStyle).formatRange(startDate, endDate);
}

/** Une date ISO avec heure (created_at) affichée à l'heure de Toronto. */
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

/** "14:30:00" devient « 14 h 30 ». */
export function formatTime(value: string): string {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    return value;
  }
  const [, hours, minutes] = match;
  if (Number(hours) > 23 || Number(minutes) > 59) {
    return value;
  }
  const date = new Date(Date.UTC(1970, 0, 1, Number(hours), Number(minutes)));
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/** "4500.00" devient « 4 500,00 $ ». Intl lit la chaîne décimale exacte, sans flottant. */
export function formatAmount(value: string, currency = "CAD"): string {
  if (!isDecimal(value)) {
    return value;
  }
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(value);
}

/** Ce qu'il faut d'un utilisateur pour l'afficher (User ou UserSummary de types/api.ts). */
export interface NamedUser {
  username: string;
  first_name: string;
  last_name: string;
}

/** « Alice Martin », ou le nom d'utilisateur quand le prénom et le nom sont vides. */
export function userDisplayName(user: NamedUser): string {
  const fullName = `${user.first_name.trim()} ${user.last_name.trim()}`.trim();
  return fullName || user.username;
}

/** Première lettre, en majuscule. Array.from garde entier un caractère hors du BMP. */
function initial(value: string): string {
  return (Array.from(value.trim())[0] ?? "").toLocaleUpperCase(LOCALE);
}

/** « AM » pour Alice Martin, « É » pour Élodie sans nom, « B » pour l'utilisateur bob. */
export function userInitials(user: NamedUser): string {
  const initials = initial(user.first_name) + initial(user.last_name);
  return initials || initial(user.username);
}
