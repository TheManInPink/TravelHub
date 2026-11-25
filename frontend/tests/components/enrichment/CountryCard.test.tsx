import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CountryCard } from "@/components/enrichment/CountryCard";
import { getDestinationCountry } from "@/lib/api/itinerary";
import { ApiError } from "@/lib/errors";
import type { GqlCountryInfo } from "@/types/graphql";
import { rejection } from "../../helpers";

// CountryCard est un Server Component asynchrone : le test appelle la fonction, attend
// le JSX qu'elle renvoie, puis l'affiche. La query GraphQL est remplacée par un faux.
vi.mock("@/lib/api/itinerary", () => ({ getDestinationCountry: vi.fn() }));
const getCountry = vi.mocked(getDestinationCountry);

/** Fiche du Japon telle que Countries GraphQL la donne, en anglais. */
const japan: GqlCountryInfo = {
  code: "JP",
  name: "Japan",
  native: "日本",
  capital: "Tokyo",
  emoji: "🇯🇵",
  currency: "JPY",
  currencies: ["JPY"],
  continent: "Asia",
  languages: [{ name: "Japanese", native: "日本語" }],
};

/** Valeur affichée en face d'un libellé de la liste <dl>. */
function fact(label: string): string | null | undefined {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
}

async function renderCountryCard() {
  render(await CountryCard({ destinationId: "3" }));
}

describe("CountryCard", () => {
  beforeEach(() => {
    getCountry.mockReset();
  });

  it("affiche le drapeau, le nom français et les informations du pays", async () => {
    getCountry.mockResolvedValue(japan);
    await renderCountryCard();

    expect(getCountry).toHaveBeenCalledWith("3");
    const heading = screen.getByRole("heading", { level: 3, name: "Japon" });
    expect(heading).toHaveTextContent("🇯🇵");
    expect(screen.getByText("Nom local : 日本")).toBeInTheDocument();
    expect(fact("Capitale")).toBe("Tokyo");
    expect(fact("Monnaie")).toBe("yen japonais (JPY)");
    expect(fact("Continent")).toBe("Asie");
    expect(fact("Langue")).toBe("日本語");
  });

  it("n'affiche pas le nom local quand il est le même que le nom français", async () => {
    getCountry.mockResolvedValue({ ...japan, code: "FR", name: "France", native: "France" });
    await renderCountryCard();

    expect(screen.getByRole("heading", { level: 3, name: "France" })).toBeInTheDocument();
    expect(screen.queryByText(/Nom local/)).not.toBeInTheDocument();
  });

  it("met les libellés au pluriel quand il y a plusieurs monnaies ou langues", async () => {
    getCountry.mockResolvedValue({
      ...japan,
      code: "CH",
      name: "Switzerland",
      currencies: ["CHE", "CHF", "CHW"],
      languages: [
        { name: "German", native: "Deutsch" },
        { name: "French", native: "Français" },
      ],
    });
    await renderCountryCard();

    expect(screen.getByRole("heading", { level: 3, name: "Suisse" })).toBeInTheDocument();
    expect(fact("Monnaies")).toContain("franc suisse (CHF)");
    expect(fact("Langues")).toBe("Deutsch, Français");
  });

  it("donne une carte d'avertissement pour country_not_found, sans lever d'erreur", async () => {
    getCountry.mockRejectedValue(
      new ApiError({
        status: 200,
        code: "country_not_found",
        message: "Pays introuvable : ZZ n'est pas un code pays connu.",
      }),
    );
    await renderCountryCard();

    expect(screen.getByRole("heading", { name: "Fiche pays indisponible" })).toBeInTheDocument();
    expect(
      screen.getByText("Pays introuvable : ZZ n'est pas un code pays connu."),
    ).toBeInTheDocument();
  });

  it("explique que le service externe ne répond pas quand Countries GraphQL est en panne", async () => {
    getCountry.mockRejectedValue(
      new ApiError({
        status: 200,
        code: "external_service_timeout",
        message: "Countries GraphQL n'a pas répondu en 5 secondes.",
      }),
    );
    await renderCountryCard();

    expect(screen.getByRole("heading", { name: "Fiche pays indisponible" })).toBeInTheDocument();
    expect(
      screen.getByText(/Le service externe \(météo ou pays\) ne répond pas/),
    ).toBeInTheDocument();
  });

  it("laisse remonter une erreur qui n'est pas une ApiError", async () => {
    getCountry.mockRejectedValue(new TypeError("bogue"));

    expect(await rejection(CountryCard({ destinationId: "3" }))).toBeInstanceOf(TypeError);
  });
});
