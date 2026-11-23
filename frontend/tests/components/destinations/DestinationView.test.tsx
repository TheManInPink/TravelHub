import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DestinationView } from "@/components/destinations/DestinationView";
import type { GqlDestinationPage, GqlParticipantRole } from "@/types/graphql";
import { kyotoPage } from "../../msw/fixtures";

// Les boutons importent les Server Actions, qui appelleraient Django.
vi.mock("@/actions/activities", () => ({
  createActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
  deleteActivityAction: vi.fn(),
}));
vi.mock("@/actions/destinations", () => ({ deleteDestinationAction: vi.fn() }));

// fr-CA sépare les milliers et le symbole $ par une espace insécable (U+00A0).
const NBSP = " ";

/** Kyoto avec trois activités sur deux jours, dans l'ordre où Django les envoie. */
const kyoto: GqlDestinationPage = {
  ...kyotoPage,
  activities: [
    kyotoPage.activities[0],
    {
      id: "8",
      name: "Fushimi Inari",
      description: "Monter tôt pour éviter la foule.",
      category: "NATURE",
      date: "2027-04-10",
      startTime: "07:00:00",
      cost: "0.00",
    },
    {
      id: "9",
      name: "Dîner kaiseki",
      description: "",
      category: "FOOD",
      date: "2027-04-10",
      startTime: null,
      cost: "120.50",
    },
  ],
};

function kyotoAs(myRole: GqlParticipantRole, activities = kyoto.activities): GqlDestinationPage {
  return { ...kyoto, activities, trip: { ...kyoto.trip, myRole } };
}

describe("DestinationView", () => {
  it("affiche le fil d'Ariane, le séjour et les totaux", () => {
    render(<DestinationView destination={kyotoAs("OWNER")} />);

    const breadcrumbs = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    expect(within(breadcrumbs).getByRole("link", { name: "Japon 2027" })).toHaveAttribute(
      "href",
      "/trips/1",
    );
    expect(screen.getByRole("heading", { level: 1, name: "Kyoto" })).toBeInTheDocument();
    expect(screen.getByText("Japon (JP) · 8–14 avril 2027")).toBeInTheDocument();
    expect(screen.getByText("Activités", { selector: "dt" }).nextElementSibling?.textContent).toBe(
      "3",
    );
    // 45,00 + 0,00 + 120,50, sans erreur d'arrondi.
    expect(screen.getByText("Coût des activités").nextElementSibling?.textContent).toBe(
      `165,50${NBSP}$`,
    );
  });

  it("groupe les activités par jour, avec la catégorie, l'heure et le coût", () => {
    render(<DestinationView destination={kyotoAs("OWNER")} />);

    const [friday, saturday] = screen.getAllByRole("heading", { level: 3 });
    expect(friday).toHaveTextContent("Vendredi 9 avril 2027");
    expect(saturday).toHaveTextContent("Samedi 10 avril 2027");

    const saturdayCard = saturday.closest("li");
    expect(saturdayCard).not.toBeNull();
    const card = within(saturdayCard as HTMLElement);
    // getByText remplace l'espace insécable par une espace : nous comparons textContent.
    expect(card.getByText(/^2 activités/).textContent).toBe(`2 activités · 120,50${NBSP}$`);
    expect(card.getByText("Nature")).toBeInTheDocument();
    expect(card.getByText("7 h 00")).toBeInTheDocument();
    expect(card.getByText("Sans heure fixe")).toBeInTheDocument();
    expect(card.getByText("Monter tôt pour éviter la foule.")).toBeInTheDocument();
  });

  it("montre les boutons de modification au propriétaire et aux éditeurs", () => {
    render(<DestinationView destination={kyotoAs("EDITOR")} />);

    expect(screen.getByRole("link", { name: "Modifier" })).toHaveAttribute(
      "href",
      "/trips/1/destinations/3/edit",
    );
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter une activité" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Modifier l'activité « Fushimi Inari »" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Supprimer l'activité « Dîner kaiseki »" }),
    ).toBeInTheDocument();
  });

  it("ne montre aucun bouton de modification à un lecteur", () => {
    render(<DestinationView destination={kyotoAs("VIEWER")} />);

    expect(screen.queryByRole("link", { name: "Modifier" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Fushimi Inari")).toBeInTheDocument();
  });

  it("propose d'ajouter la première activité quand la liste est vide", () => {
    render(<DestinationView destination={kyotoAs("OWNER", [])} />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Aucune activité prévue" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Ajouter une activité" })).toHaveLength(1);
  });

  it("explique à un lecteur qui peut ajouter des activités", () => {
    render(<DestinationView destination={kyotoAs("VIEWER", [])} />);

    expect(
      screen.getByText("Le propriétaire ou un éditeur du voyage peut en ajouter."),
    ).toBeInTheDocument();
  });
});
