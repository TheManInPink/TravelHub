import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsCards } from "@/components/dashboard/StatsCards";
import type { TripStats } from "@/types/api";
import { japanTrip, japanTripStats } from "../../msw/fixtures";

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

/** Valeur (dd) qui suit le libellé (dt) donné. */
function valueOf(label: string): string | null {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent ?? null;
}

const stats: TripStats = {
  ...japanTripStats,
  budget: "4200.00",
  total_cost: "825.00",
  remaining_budget: "3375.00",
  activity_count: 5,
};

describe("StatsCards", () => {
  it("affiche les compteurs et les montants du prochain voyage au format fr-CA", () => {
    render(<StatsCards tripCount={4} upcomingCount={2} nextTrip={japanTrip} stats={stats} />);

    expect(valueOf("Voyages")).toBe("4");
    expect(valueOf("Voyages à venir")).toBe("2");
    expect(valueOf("Budget")).toBe(`4${NBSP}200,00${NBSP}$`);
    expect(valueOf("Coût total")).toBe(`825,00${NBSP}$`);
    expect(valueOf("Budget restant")).toBe(`3${NBSP}375,00${NBSP}$`);
    expect(screen.getByText("5 activités")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Japon 2027" })).toHaveAttribute("href", "/trips/1");
    expect(screen.getByText(/1 avril 2027/)).toBeInTheDocument();
  });

  it("signale un budget dépassé", () => {
    render(
      <StatsCards
        tripCount={1}
        upcomingCount={1}
        nextTrip={japanTrip}
        stats={{ ...stats, budget: "500.00", remaining_budget: "-325.00" }}
      />,
    );

    // Le signe moins dépend des données ICU : trait d'union ou U+2212.
    expect(valueOf("Budget restant")).toMatch(/^[-−]325,00/);
    // getByText remplace les espaces insécables par des espaces simples. textContent
    // garde le texte exact, avec les espaces de fr-CA.
    expect(screen.getByText(/^Dépassement de/).textContent).toBe(
      `Dépassement de 325,00${NBSP}$`,
    );
  });

  it("indique un voyage sans budget", () => {
    render(
      <StatsCards
        tripCount={1}
        upcomingCount={1}
        nextTrip={japanTrip}
        stats={{ ...stats, budget: null, remaining_budget: null }}
      />,
    );

    expect(valueOf("Budget")).toBe("—");
    expect(valueOf("Budget restant")).toBe("—");
    expect(screen.getAllByText("Aucun budget fixé")).toHaveLength(2);
  });

  it("affiche le message d'erreur à la place des montants", () => {
    render(
      <StatsCards
        tripCount={4}
        upcomingCount={2}
        nextTrip={japanTrip}
        statsError="Le serveur se réveille, réessayez dans un instant."
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Le budget de ce voyage n'a pas pu être chargé. Le serveur se réveille",
    );
    expect(screen.queryByText("Budget restant")).not.toBeInTheDocument();
    expect(valueOf("Voyages")).toBe("4");
  });

  it("garde les compteurs quand aucun voyage n'est à venir", () => {
    render(<StatsCards tripCount={3} upcomingCount={0} nextTrip={null} />);

    expect(valueOf("Voyages")).toBe("3");
    expect(valueOf("Voyages à venir")).toBe("0");
    expect(screen.getByText(/Aucun voyage à venir/)).toBeInTheDocument();
    expect(screen.queryByText("Budget")).not.toBeInTheDocument();
  });
});
