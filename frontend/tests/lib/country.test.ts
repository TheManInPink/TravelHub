import { describe, expect, it } from "vitest";
import { continentLabel, countryLabel, currencyLabel, languageLabels } from "@/lib/country";

describe("continentLabel", () => {
  it("traduit les continents de Countries GraphQL", () => {
    expect(continentLabel("Asia")).toBe("Asie");
    expect(continentLabel("North America")).toBe("Amérique du Nord");
  });

  it("garde un nom inconnu tel quel", () => {
    expect(continentLabel("Atlantis")).toBe("Atlantis");
  });
});

describe("countryLabel", () => {
  it("donne le nom français à partir du code pays", () => {
    expect(countryLabel({ code: "SN", name: "Senegal" })).toBe("Sénégal");
  });

  it("garde le nom anglais pour un code mal formé", () => {
    expect(countryLabel({ code: "1", name: "Somewhere" })).toBe("Somewhere");
  });
});

describe("currencyLabel", () => {
  it("donne le nom français et le code de la monnaie", () => {
    expect(currencyLabel("EUR")).toBe("euro (EUR)");
  });

  it("garde le code seul quand Intl ne connaît pas la monnaie", () => {
    expect(currencyLabel("ABC")).toBe("ABC");
  });
});

describe("languageLabels", () => {
  it("préfère le nom de la langue dans la langue elle-même", () => {
    expect(
      languageLabels([
        { name: "Japanese", native: "日本語" },
        { name: "Klingon", native: "" },
      ]),
    ).toEqual(["日本語", "Klingon"]);
  });
});
