import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripDetailView } from "@/components/trips/TripDetailView";
import type { ParticipantRole, TripDetail } from "@/types/api";
import { japanTripDetail } from "../../msw/fixtures";
import { PUBLIC_IMAGES_URL } from "../../msw/supabase";

// Le bouton Supprimer et l'envoi de l'image importent des Server Actions, qui
// appelleraient Django et Supabase.
vi.mock("@/actions/trips", () => ({ deleteTripAction: vi.fn() }));
vi.mock("@/actions/upload", () => ({ uploadTripCover: vi.fn() }));

const COVER_URL = `${PUBLIC_IMAGES_URL}trips/1/0f8fad5b-d9cb-469f-a165-70867728950e.webp`;

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

  it.each(["owner", "editor"] as const)(
    "montre l'image par défaut et « Ajouter une image » au rôle %s",
    (role) => {
      const { container } = render(<TripDetailView trip={tripAs(role)} />);

      expect(screen.getByRole("button", { name: "Ajouter une image" })).toBeInTheDocument();
      // L'image par défaut est décorative : aucune balise img.
      expect(container.querySelector("img")).toBeNull();
    },
  );

  it("montre la couverture et « Changer l'image » quand le voyage a une image", () => {
    render(<TripDetailView trip={{ ...tripAs("editor"), cover_image_url: COVER_URL }} />);

    const cover = screen.getByRole("img", { name: "Couverture du voyage Japon 2027" });
    expect(cover.getAttribute("src")).toContain(encodeURIComponent(COVER_URL));
    expect(screen.getByRole("button", { name: "Changer l'image" })).toBeInTheDocument();
  });

  it("ne montre pas le bouton d'envoi à un lecteur, ni de bandeau vide", () => {
    const { container, unmount } = render(<TripDetailView trip={tripAs("viewer")} />);
    expect(screen.queryByRole("button", { name: /image/ })).not.toBeInTheDocument();
    expect(container.querySelector(".bg-linear-to-br")).toBeNull();
    unmount();

    render(<TripDetailView trip={{ ...tripAs("viewer"), cover_image_url: COVER_URL }} />);
    expect(
      screen.getByRole("img", { name: "Couverture du voyage Japon 2027" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /image/ })).not.toBeInTheDocument();
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

  it("mène de chaque destination à sa page", () => {
    render(<TripDetailView trip={tripAs("viewer")} />);

    expect(screen.getByRole("link", { name: "Kyoto" })).toHaveAttribute(
      "href",
      "/trips/1/destinations/3",
    );
  });

  it("montre « Ajouter une destination » au propriétaire et aux éditeurs seulement", () => {
    const { unmount } = render(<TripDetailView trip={tripAs("editor")} />);
    expect(screen.getByRole("link", { name: "Ajouter une destination" })).toHaveAttribute(
      "href",
      "/trips/1/destinations/new",
    );
    unmount();

    render(<TripDetailView trip={tripAs("viewer")} />);
    expect(
      screen.queryByRole("link", { name: "Ajouter une destination" }),
    ).not.toBeInTheDocument();
  });

  it("propose d'ajouter la première destination quand l'itinéraire est vide", () => {
    render(<TripDetailView trip={{ ...tripAs("owner"), destinations: [] }} />);

    const itinerary = screen.getByRole("region", { name: "Itinéraire" });
    expect(
      within(itinerary).getByRole("heading", { name: "Ce voyage n'a pas encore de destination" }),
    ).toBeInTheDocument();
    expect(
      within(itinerary).getAllByRole("link", { name: "Ajouter une destination" }),
    ).toHaveLength(1);
  });

  it("indique à un lecteur qui peut ajouter une destination", () => {
    render(<TripDetailView trip={{ ...tripAs("viewer"), destinations: [] }} />);

    expect(
      screen.getByText("Le propriétaire ou un éditeur du voyage peut en ajouter."),
    ).toBeInTheDocument();
  });
});
