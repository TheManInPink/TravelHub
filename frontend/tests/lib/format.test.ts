import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatTime,
} from "@/lib/format";

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

describe("formatDate", () => {
  it("affiche une date Django en toutes lettres", () => {
    expect(formatDate("2026-11-22")).toBe("22 novembre 2026");
    expect(formatDate("2026-11-22", "medium")).toBe("22 nov. 2026");
  });

  it("ne décale pas la date selon le fuseau horaire", () => {
    // new Date("2026-01-01") donnerait le 31 décembre à Toronto.
    expect(formatDate("2026-01-01")).toBe("1 janvier 2026");
  });

  it("renvoie telle quelle une date mal formée ou impossible", () => {
    expect(formatDate("2026-02-30")).toBe("2026-02-30");
    expect(formatDate("22/11/2026")).toBe("22/11/2026");
  });
});

describe("formatDateRange", () => {
  it("regroupe le mois et l'année quand ils sont communs", () => {
    expect(formatDateRange("2026-03-12", "2026-03-18")).toBe("12–18 mars 2026");
    expect(formatDateRange("2026-03-12", "2026-03-12")).toBe("12 mars 2026");
  });

  it("garde les deux années quand le voyage change d'année", () => {
    expect(formatDateRange("2026-12-28", "2027-01-02")).toContain("janvier 2027");
    expect(formatDateRange("2026-12-28", "2027-01-02")).toContain("28 décembre 2026");
  });

  it("n'échoue pas si la fin précède le début", () => {
    expect(formatDateRange("2026-03-18", "2026-03-12")).toBe("18 mars 2026 au 12 mars 2026");
  });
});

describe("formatDateTime", () => {
  it("affiche une date ISO à l'heure de Toronto", () => {
    expect(formatDateTime("2026-11-22T23:42:00.123456Z")).toBe("22 nov. 2026, 18 h 42");
  });

  it("renvoie telle quelle une valeur illisible", () => {
    expect(formatDateTime("demain")).toBe("demain");
  });
});

describe("formatTime", () => {
  it("affiche une heure Django à la française", () => {
    expect(formatTime("14:30:00")).toBe("14 h 30");
    expect(formatTime("09:05")).toBe("9 h 05");
  });

  it("renvoie telle quelle une heure impossible ou mal formée", () => {
    expect(formatTime("25:00:00")).toBe("25:00:00");
    expect(formatTime("midi")).toBe("midi");
  });
});

describe("formatAmount", () => {
  it("affiche un montant décimal en dollars canadiens", () => {
    expect(formatAmount("4500.00")).toBe(`4${NBSP}500,00${NBSP}$`);
    expect(formatAmount("0.10")).toBe(`0,10${NBSP}$`);
  });

  it("garde tous les chiffres d'un grand montant, sans arrondi de flottant", () => {
    // En nombre flottant, 12345678901234567.89 deviendrait 12345678901234568.
    expect(formatAmount("12345678901234567.89")).toBe(
      `12${NBSP}345${NBSP}678${NBSP}901${NBSP}234${NBSP}567,89${NBSP}$`,
    );
  });

  it("renvoie telle quelle une valeur qui n'est pas un nombre décimal", () => {
    expect(formatAmount("abc")).toBe("abc");
    expect(formatAmount("")).toBe("");
  });
});
