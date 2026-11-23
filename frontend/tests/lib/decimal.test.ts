import { describe, expect, it } from "vitest";
import {
  fractionDigits,
  integerDigits,
  normalizeDecimalInput,
  padDecimals,
  sumAmounts,
} from "@/lib/decimal";

describe("normalizeDecimalInput", () => {
  it("retire les espaces et remplace la virgule par un point", () => {
    expect(normalizeDecimalInput("  12,50 ")).toBe("12.50");
    expect(normalizeDecimalInput("-73,5673")).toBe("-73.5673");
  });
});

describe("fractionDigits et integerDigits", () => {
  it("comptent les chiffres de chaque côté du point, sans le signe", () => {
    expect(fractionDigits("12.50")).toBe(2);
    expect(fractionDigits("12")).toBe(0);
    expect(integerDigits("-123.4")).toBe(3);
  });
});

describe("padDecimals", () => {
  it("complète les décimales avec des zéros", () => {
    expect(padDecimals("12.5", 2)).toBe("12.50");
    expect(padDecimals("12", 2)).toBe("12.00");
    expect(padDecimals("0.75", 2)).toBe("0.75");
  });
});

describe("sumAmounts", () => {
  it("additionne les centimes sans erreur d'arrondi", () => {
    // En nombres flottants, 0.1 + 0.2 donne 0.30000000000000004.
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(sumAmounts(["45.00", "12.5", "3"])).toBe("60.50");
  });

  it("donne 0.00 pour une liste vide et ignore une valeur mal formée", () => {
    expect(sumAmounts([])).toBe("0.00");
    expect(sumAmounts(["10.00", "abc"])).toBe("10.00");
  });

  it("garde le signe d'un total négatif", () => {
    expect(sumAmounts(["-12.30", "2.05"])).toBe("-10.25");
  });
});
