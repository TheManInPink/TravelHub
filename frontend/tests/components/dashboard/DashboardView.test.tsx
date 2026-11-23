import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardView } from "@/components/dashboard/DashboardView";
import type { DashboardData } from "@/lib/api/dashboard";
import type { Trip } from "@/types/api";
import { aliceAccount, japanTrip, portugalTrip } from "../../msw/fixtures";

const parisTrip: Trip = {
  ...japanTrip,
  id: 3,
  title: "Automne à Paris",
  status: "ongoing",
  start_date: "2026-11-20",
  end_date: "2026-11-27",
};

const emptyData: DashboardData = {
  tripCount: 0,
  currentTrip: null,
  upcomingCount: 0,
  upcomingTrips: [],
  lastUpdatedTrip: null,
};

const stats = <p>Statistiques du prochain voyage</p>;

describe("DashboardView", () => {
  it("affiche l'EmptyState et le bouton « Créer mon premier voyage » sans aucun voyage", () => {
    render(<DashboardView user={aliceAccount} data={emptyData} stats={stats} />);

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour Alice" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Vous n'avez encore aucun voyage" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer mon premier voyage" })).toHaveAttribute(
      "href",
      "/trips/new",
    );
    // Rien d'autre : ni statistiques, ni sections vides.
    expect(screen.queryByText("Statistiques du prochain voyage")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prochains voyages" })).not.toBeInTheDocument();
  });

  it("affiche le voyage en cours, les statistiques, les prochains voyages et les accès rapides", () => {
    const data: DashboardData = {
      tripCount: 4,
      currentTrip: parisTrip,
      upcomingCount: 5,
      upcomingTrips: [japanTrip, portugalTrip],
      lastUpdatedTrip: portugalTrip,
    };

    render(<DashboardView user={aliceAccount} data={data} stats={stats} />);

    const current = screen.getByRole("region", { name: "Voyage en cours" });
    expect(within(current).getByRole("link", { name: "Automne à Paris" })).toHaveAttribute(
      "href",
      "/trips/3",
    );
    expect(within(current).getByText("En cours")).toBeInTheDocument();

    expect(
      within(screen.getByRole("region", { name: "En chiffres" })).getByText(
        "Statistiques du prochain voyage",
      ),
    ).toBeInTheDocument();

    const upcoming = screen.getByRole("region", { name: "Prochains voyages" });
    expect(within(upcoming).getAllByRole("listitem")).toHaveLength(2);
    // Cinq voyages à venir, deux affichés : un lien mène à la liste complète.
    expect(within(upcoming).getByRole("link", { name: "Voir tous mes voyages" })).toHaveAttribute(
      "href",
      "/trips",
    );

    const quickLinks = screen.getByRole("navigation", { name: "Accès rapides" });
    expect(within(quickLinks).getByRole("link", { name: "Nouveau voyage" })).toHaveAttribute(
      "href",
      "/trips/new",
    );
    expect(within(quickLinks).getByRole("link", { name: "Mes voyages" })).toHaveAttribute(
      "href",
      "/trips",
    );
    expect(
      within(quickLinks).getByRole("link", { name: "Dernier voyage modifié : Portugal" }),
    ).toHaveAttribute("href", "/trips/2");
  });

  it("le dit quand aucun voyage n'est en cours ni à venir", () => {
    const data: DashboardData = { ...emptyData, tripCount: 1, lastUpdatedTrip: japanTrip };

    render(<DashboardView user={{ username: "bob", first_name: " " }} data={data} stats={stats} />);

    expect(screen.getByRole("heading", { level: 1, name: "Bonjour bob" })).toBeInTheDocument();
    expect(screen.getByText("Aucun voyage en cours aujourd'hui.")).toBeInTheDocument();
    expect(screen.getByText(/Aucun voyage à venir/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir tous mes voyages" })).not.toBeInTheDocument();
  });
});
