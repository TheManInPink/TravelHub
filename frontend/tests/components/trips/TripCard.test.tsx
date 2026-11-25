import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripCard } from "@/components/trips/TripCard";
import type { TripStatus } from "@/types/api";
import { japanTrip } from "../../msw/fixtures";
import { PUBLIC_IMAGES_URL } from "../../msw/supabase";

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

  it("affiche le nombre de destinations au singulier ou au pluriel", () => {
    const { rerender } = render(<TripCard trip={{ ...japanTrip, destination_count: 1 }} />);
    expect(screen.getByText("1 destination")).toBeInTheDocument();

    rerender(<TripCard trip={{ ...japanTrip, destination_count: 3 }} />);
    expect(screen.getByText("3 destinations")).toBeInTheDocument();
  });

  it("affiche la couverture du voyage comme image décorative, par l'optimiseur", () => {
    const url = `${PUBLIC_IMAGES_URL}trips/1/0f8fad5b-d9cb-469f-a165-70867728950e.webp`;
    const { container } = render(<TripCard trip={{ ...japanTrip, cover_image_url: url }} />);

    // alt="" : l'image n'est pas annoncée, le titre de la carte nomme déjà le voyage.
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("alt", "");
    // next/image passe par /_next/image, qui redimensionne l'image selon sizes.
    expect(image?.getAttribute("src")).toMatch(/^\/_next\/image\?url=/);
    expect(image?.getAttribute("src")).toContain(encodeURIComponent(url));
    expect(image).toHaveAttribute("sizes", expect.stringContaining("22rem"));
  });

  it("montre l'image par défaut pour une adresse qui ne vient pas de notre bucket", () => {
    const url = "https://images.example.org/japon.jpg";
    const { container } = render(<TripCard trip={{ ...japanTrip, cover_image_url: url }} />);

    expect(container.querySelector("img")).toBeNull();
  });

  it("garde la place de la couverture sans image", () => {
    const { container } = render(<TripCard trip={japanTrip} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("accepte un titre de niveau 2", () => {
    render(<TripCard trip={japanTrip} titleAs="h2" />);

    expect(screen.getByRole("heading", { level: 2, name: "Japon 2027" })).toBeInTheDocument();
  });
});
