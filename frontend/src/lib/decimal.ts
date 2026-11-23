import type { DecimalString } from "@/types/api";

// Petits calculs sur les montants en chaînes ("45.00"), comme Django les envoie.
// Un nombre flottant arrondirait mal les centimes (0.1 + 0.2 ne donne pas 0.3), donc
// nous comptons en centimes entiers. Un entier reste exact jusqu'à 2^53, soit bien plus
// que les 99 999 999,99 $ qu'un coût peut valoir dans Django. Ce module ne dépend de
// rien : le navigateur (formulaires) et le serveur (pages) peuvent l'importer.

const AMOUNT_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Valeur saisie dans un champ de montant ou de coordonnée : sans espaces au début et à
 * la fin, et avec un point à la place de la virgule française ("12,50" donne "12.50").
 */
export function normalizeDecimalInput(value: string): string {
  return value.trim().replace(",", ".");
}

/** Nombre de chiffres après le point : 2 pour "12.50", 0 pour "12". */
export function fractionDigits(value: string): number {
  return (value.split(".")[1] ?? "").length;
}

/** Nombre de chiffres avant le point, sans le signe : 2 pour "-12.5". */
export function integerDigits(value: string): number {
  return (value.replace("-", "").split(".")[0] ?? "").length;
}

/**
 * Complète les décimales avec des zéros : "12.5" donne "12.50" et "12" donne "12.00".
 * La valeur doit déjà être un nombre décimal valide avec au plus ce nombre de décimales.
 */
export function padDecimals(value: string, decimals: number): DecimalString {
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(decimals, "0")}`;
}

/** "45.00" donne 4500. Renvoie null si la chaîne n'est pas un montant à 2 décimales au plus. */
function toCents(value: string): number | null {
  const match = AMOUNT_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, sign, integer, fraction = ""] = match;
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return sign === "-" ? -cents : cents;
}

/**
 * Somme exacte de montants, par exemple le coût total des activités d'une destination.
 * ["45.00", "12.5"] donne "57.50". Une valeur mal formée compte pour zéro.
 */
export function sumAmounts(values: readonly string[]): DecimalString {
  const total = values.reduce((sum, value) => sum + (toCents(value) ?? 0), 0);
  const sign = total < 0 ? "-" : "";
  const absolute = Math.abs(total);
  const cents = String(absolute % 100).padStart(2, "0");
  return `${sign}${Math.floor(absolute / 100)}.${cents}`;
}
