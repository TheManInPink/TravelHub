import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripDetailView } from "@/components/trips/TripDetailView";
import type { ParticipantRole, TripDetail } from "@/types/api";
import { japanTripDetail } from "../../msw/fixtures";

// Le bouton Supprimer importe la Server Action, qui appellerait Django.
vi.mock("@/actions/trips", () => ({ deleteTripAction: vi.fn() }));

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

function tripAs(role: ParticipantRole): TripDetail {
  return { ...japanTripDetail, my_role: role };
}

describe("TripDetailView", () => {
  it("affiche l'en-tête du voyage : titre, dates, statut, rôle, budget et coût total", () => {
    render(<TripDetailView trip={tripAs("owner")} />);

    expect(screen.getByRole("heading", { level: 1, name: "Japon 2027" })).toBeInTheDocument();
    expect(screen.getByText("1–14 avril 2027")).toBeInTheDocument();
    expect(screen.getByText("Planifié")).toBeInTheDocument();
    expect(screen.getByText("Votre rôle : Propriétaire")).toBeInTheDocument();
    expect(screen.getByText("Budget").nextElementSibling?.textContent).toBe(
      `4${NBSP}500,00${NBSP}$`,
    );
    expect(screen.getByText("Coût total").nextElementSibling?.textContent).toBe(`45,00${NBSP}$`);
    expect(screen.getByRole("navigation", { name: "Fil d'Ariane" })).toHaveTextContent(
      "Mes voyages",
    );
  });

  it("montre Modifier et Supprimer au propriétaire", () => {
    render(<TripDetailView trip={tripAs("owner")} />);

    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", "/trips/1/edit");
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
  });

  it("montre seulement Modifier à un éditeur, avec le nom du propriétaire", () => {
    render(<TripDetailView trip={tripAs("editor")} />);

    expect(screen.getByRole("link", { name: "Modifier" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
    expect(screen.getByText("Organisé par Alice Tremblay")).toBeInTheDocument();
  });

  it("ne montre aucun bouton de modification à un lecteur", () => {
    render(<TripDetailView trip={tripAs("viewer")} />);

    expect(screen.getByText("Votre rôle : Lecteur")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
  });

  it("affiche l'itinéraire : destination, pays, dates et activités", () => {
    render(<TripDetailView trip={tripAs("viewer")} />);

    const itinerary = screen.getByRole("region", { name: "Itinéraire" });
    // Le premier élément de la liste est la destination, les suivants ses activités.
    const [destination] = within(itinerary).getAllByRole("listitem");
    if (!destination) throw new Error("Aucune destination affichée.");
    expect(within(itinerary).getByRole("heading", { level: 3 })).toHaveTextContent("1.Kyoto");
    expect(destination).toHaveTextContent("Japon (JP)");
    expect(destination).toHaveTextContent("8–14 avril 2027");
    expect(within(destination).getByText("Pavillon d'or (Kinkaku-ji)")).toBeInTheDocument();
    expect(within(destination).getByText("Culture")).toBeInTheDocument();
    expect(within(destination).getByText("9 h 30")).toBeInTheDocument();
    expect(within(destination).getByText("1 activité")).toBeInTheDocument();
  });

  it("indique un itinéraire vide", () => {
    render(<TripDetailView trip={{ ...tripAs("owner"), destinations: [] }} />);

    expect(screen.getByText("Ce voyage n'a pas encore de destination.")).toBeInTheDocument();
  });
});
