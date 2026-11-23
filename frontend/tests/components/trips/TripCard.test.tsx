import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCard } from "@/components/trips/TripCard";
import type { TripStatus } from "@/types/api";
import { japanTrip } from "../../msw/fixtures";

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

describe("TripCard", () => {
  it("affiche le titre, les dates, le statut en français et le coût total", () => {
    render(<TripCard trip={{ ...japanTrip, total_cost: "1250.50" }} />);

    const link = screen.getByRole("link", { name: "Japon 2027" });
    expect(link).toHaveAttribute("href", "/trips/1");
    expect(screen.getByRole("heading", { level: 3, name: "Japon 2027" })).toBeInTheDocument();
    expect(screen.getByText("1–14 avril 2027")).toBeInTheDocument();
    expect(screen.getByText("Planifié")).toBeInTheDocument();
    // getByText remplace les espaces insécables par des espaces simples. textContent
    // garde le texte exact, avec les espaces de fr-CA.
    expect(screen.getByText(/250,50/).textContent).toBe(`1${NBSP}250,50${NBSP}$`);
  });

  it.each<[TripStatus, string]>([
    ["draft", "Brouillon"],
    ["planned", "Planifié"],
    ["ongoing", "En cours"],
    ["completed", "Terminé"],
    ["cancelled", "Annulé"],
  ])("affiche le statut %s en français (« %s »)", (status, label) => {
    render(<TripCard trip={{ ...japanTrip, status }} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it("accepte un titre de niveau 2", () => {
    render(<TripCard trip={japanTrip} titleAs="h2" />);

    expect(screen.getByRole("heading", { level: 2, name: "Japon 2027" })).toBeInTheDocument();
  });
});
