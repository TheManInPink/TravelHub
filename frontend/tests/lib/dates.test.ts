import { describe, expect, it } from "vitest";
import { isDateWithin, todayIsoDate } from "@/lib/dates";

describe("todayIsoDate", () => {
  it("donne la date de Toronto, même quand UTC est déjà au lendemain", () => {
    // 22 h 30 à Toronto (UTC-5 en hiver), mais déjà le 24 en UTC.
    expect(todayIsoDate(new Date("2026-11-24T03:30:00Z"))).toBe("2026-11-23");
    expect(todayIsoDate(new Date("2026-11-24T05:30:00Z"))).toBe("2026-11-24");
  });

  it("tient compte de l'heure d'été (UTC-4)", () => {
    expect(todayIsoDate(new Date("2026-07-01T03:30:00Z"))).toBe("2026-06-30");
    expect(todayIsoDate(new Date("2026-07-01T04:30:00Z"))).toBe("2026-07-01");
  });
});

describe("isDateWithin", () => {
  it("compte le premier et le dernier jour", () => {
    expect(isDateWithin("2026-11-20", "2026-11-20", "2026-11-27")).toBe(true);
    expect(isDateWithin("2026-11-27", "2026-11-20", "2026-11-27")).toBe(true);
    expect(isDateWithin("2026-11-23", "2026-11-20", "2026-11-27")).toBe(true);
  });

  it("refuse une date avant le début ou après la fin", () => {
    expect(isDateWithin("2026-11-19", "2026-11-20", "2026-11-27")).toBe(false);
    expect(isDateWithin("2026-11-28", "2026-11-20", "2026-11-27")).toBe(false);
  });
});
