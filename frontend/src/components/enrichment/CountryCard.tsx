import type { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Notice } from "@/components/feedback/Notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDestinationCountry } from "@/lib/api/itinerary";
import { continentLabel, countryLabel, currencyLabel, languageLabels } from "@/lib/country";
import { isApiError, toUserMessage } from "@/lib/errors";
import type { GqlCountryInfo } from "@/types/graphql";

// Fiche pays d'une destination (Server Component asynchrone). La page l'affiche dans
// <Suspense fallback={<CountrySkeleton />}>. La query GraphQL DestinationCountry attend
// Countries GraphQL (appelé par Django), et le reste de la page s'affiche sans
// l'attendre. Le HTML de la fiche arrive ensuite dans la même réponse (streaming).
//
// Le navigateur ne reçoit que ce HTML : il n'appelle ni /graphql/ ni Countries GraphQL.

/** Une information du pays et son libellé, dans une liste <dl>. */
function CountryFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** « Langue » pour une valeur, « Langues » pour plusieurs. */
function label(count: number, one: string, other: string): string {
  return count > 1 ? other : one;
}

/** Contenu de la fiche, testé avec des props. */
export function CountryDetails({ country }: { country: GqlCountryInfo }) {
  const name = countryLabel(country);
  const currencies = country.currencies.map(currencyLabel);
  const languages = languageLabels(country.languages);
  // « Nom local : France » sous « France » ne dirait rien de plus.
  const showNative = country.native !== "" && country.native !== name;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h3 className="flex items-center gap-2 text-lg">
            {/* Le nom du pays suit : le drapeau seul n'apporte rien au lecteur d'écran.
                Windows n'a pas d'emoji de drapeau : il affiche les lettres du code (FR). */}
            <span aria-hidden="true" className="text-3xl leading-none">
              {country.emoji}
            </span>
            {name}
          </h3>
        </CardTitle>
        {showNative ? <CardDescription>Nom local : {country.native}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 text-sm">
          <CountryFact label="Capitale">{country.capital ?? "Aucune"}</CountryFact>
          <CountryFact label={label(currencies.length, "Monnaie", "Monnaies")}>
            {currencies.length > 0 ? currencies.join(", ") : "Aucune"}
          </CountryFact>
          <CountryFact label="Continent">{continentLabel(country.continent)}</CountryFact>
          <CountryFact label={label(languages.length, "Langue", "Langues")}>
            {languages.length > 0 ? languages.join(", ") : "Non précisée"}
          </CountryFact>
        </dl>
        <p className="text-xs text-muted-foreground">
          Source : Countries GraphQL, par l&apos;API TravelHub.
        </p>
      </CardContent>
    </Card>
  );
}

/** Carte d'avertissement : la page reste utilisable sans la fiche pays. */
function CountryWarning({ message }: { message: string }) {
  return (
    <Notice icon={TriangleAlertIcon} title="Fiche pays indisponible">
      <p>{message}</p>
    </Notice>
  );
}

export async function CountryCard({ destinationId }: { destinationId: string }) {
  let country: GqlCountryInfo | null;
  try {
    country = await getDestinationCountry(destinationId);
  } catch (error) {
    // country_not_found (code pays inconnu) ou external_service_* (Countries GraphQL
    // lent ou en panne) : une carte d'avertissement, sans casser la page. Une erreur
    // qui n'est pas une ApiError est un bogue : elle remonte jusqu'à error.tsx.
    if (!isApiError(error)) {
      throw error;
    }
    return <CountryWarning message={toUserMessage(error)} />;
  }
  if (!country) {
    return <CountryWarning message="Countries GraphQL n'a pas de fiche pour ce pays." />;
  }
  return <CountryDetails country={country} />;
}
