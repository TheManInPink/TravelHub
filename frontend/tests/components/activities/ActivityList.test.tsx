import { describe, expect, it } from "vitest";
import { groupByDate } from "@/components/activities/ActivityList";
import type { GqlActivity } from "@/types/graphql";
import { kyotoPage } from "../../msw/fixtures";

const [temple] = kyotoPage.activities;

function activity(id: string, date: string): GqlActivity {
  return { ...temple, id, date };
}

describe("groupByDate", () => {
  it("regroupe les activités par jour, dans l'ordre reçu de Django", () => {
    const days = groupByDate([
      activity("1", "2027-04-09"),
      activity("2", "2027-04-10"),
      activity("3", "2027-04-10"),
    ]);

    expect(days.map((day) => [day.date, day.activities.map((item) => item.id)])).toEqual([
      ["2027-04-09", ["1"]],
      ["2027-04-10", ["2", "3"]],
    ]);
  });

  it("donne une liste vide sans activité", () => {
    expect(groupByDate([])).toEqual([]);
  });
});
