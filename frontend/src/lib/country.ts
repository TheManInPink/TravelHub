// Libellés français de la fiche pays. Countries GraphQL répond en anglais (« Japan »,
// « Asia »). Intl traduit le nom du pays et des monnaies à partir de leur code ISO, et
// une petite table traduit les sept continents. Sans traduction, le texte anglais reste.

import type { GqlCountryInfo } from "@/types/graphql";

const LOCALE = "fr-CA";

/** Les continents tels que Countries GraphQL les nomme. */
const CONTINENTS: Readonly<Record<string, string | undefined>> = {
  Africa: "Afrique",
  Antarctica: "Antarctique",
  Asia: "Asie",
  Europe: "Europe",
  "North America": "Amérique du Nord",
  Oceania: "Océanie",
  "South America": "Amérique du Sud",
};

/** Nom français d'un code ISO, ou undefined si Intl ne le connaît pas. */
function displayName(type: "region" | "currency", code: string): string | undefined {
  try {
    return new Intl.DisplayNames(LOCALE, { type, fallback: "none" }).of(code);
  } catch {
    // Code mal formé (« 1 », « EURO ») : Intl lève une RangeError.
    return undefined;
  }
}

/** « Asia » devient « Asie ». */
export function continentLabel(name: string): string {
  return CONTINENTS[name] ?? name;
}

/** Le code JP donne « Japon ». Sans traduction, le nom anglais de Countries GraphQL. */
export function countryLabel(country: Pick<GqlCountryInfo, "code" | "name">): string {
  return displayName("region", country.code) ?? country.name;
}

/** "JPY" devient « yen japonais (JPY) ». */
export function currencyLabel(code: string): string {
  const name = displayName("currency", code);
  return name ? `${name} (${code})` : code;
}

/** Les langues dans leur propre nom (« 日本語 »), ou en anglais si ce nom manque. */
export function languageLabels(languages: GqlCountryInfo["languages"]): string[] {
  return languages.map((language) => language.native || language.name);
}
