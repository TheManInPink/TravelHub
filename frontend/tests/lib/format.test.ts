import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatCount,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMeasure,
  formatShortDay,
  formatTime,
  userDisplayName,
  userInitials,
} from "@/lib/format";

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

describe("formatDate", () => {
  it("affiche une date Django en toutes lettres", () => {
    expect(formatDate("2026-11-22")).toBe("22 novembre 2026");
    expect(formatDate("2026-11-22", "medium")).toBe("22 nov. 2026");
  });

  it("ajoute le jour de la semaine avec le style full", () => {
    expect(formatDate("2027-04-09", "full")).toBe("vendredi 9 avril 2027");
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

describe("formatShortDay", () => {
  it("donne le jour, la date et le mois en abrégé", () => {
    expect(formatShortDay("2027-04-09")).toBe("ven. 9 avr.");
  });

  it("renvoie telle quelle une date mal formée", () => {
    expect(formatShortDay("demain")).toBe("demain");
  });
});

describe("formatMeasure", () => {
  it("garde une décimale et colle l'unité par une espace insécable", () => {
    expect(formatMeasure(17.44, "°C")).toBe(`17,4${NBSP}°C`);
    expect(formatMeasure(0, "mm")).toBe(`0${NBSP}mm`);
    expect(formatMeasure(-3.5, "°C")).toBe(`-3,5${NBSP}°C`);
  });

  it("affiche « n. d. » quand Open-Meteo n'a pas de valeur", () => {
    expect(formatMeasure(null, "km/h")).toBe("n. d.");
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

describe("formatCount", () => {
  it("met le singulier pour 0 et 1, comme le veut le français", () => {
    expect(formatCount(0, "destination", "destinations")).toBe("0 destination");
    expect(formatCount(1, "destination", "destinations")).toBe("1 destination");
    expect(formatCount(2, "destination", "destinations")).toBe("2 destinations");
  });

  it("sépare les milliers avec une espace insécable", () => {
    expect(formatCount(1500, "voyage", "voyages")).toBe(`1${NBSP}500 voyages`);
  });
});

describe("userDisplayName et userInitials", () => {
  it("affiche le prénom et le nom", () => {
    const user = { username: "alice", first_name: "Alice", last_name: "Martin" };
    expect(userDisplayName(user)).toBe("Alice Martin");
    expect(userInitials(user)).toBe("AM");
  });

  it("garde une lettre accentuée et accepte un nom absent", () => {
    const user = { username: "elodie", first_name: "élodie", last_name: "" };
    expect(userDisplayName(user)).toBe("élodie");
    expect(userInitials(user)).toBe("É");
  });

  it("revient au nom d'utilisateur sans prénom ni nom", () => {
    const user = { username: "bob", first_name: " ", last_name: "" };
    expect(userDisplayName(user)).toBe("bob");
    expect(userInitials(user)).toBe("B");
  });
});
