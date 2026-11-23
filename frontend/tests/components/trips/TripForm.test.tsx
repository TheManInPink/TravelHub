import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripForm } from "@/components/trips/TripForm";
import { japanTrip } from "../../msw/fixtures";

// Les vraies Server Actions appelleraient Django : ici, ce sont des fonctions simulées.
const { createTripAction, updateTripAction } = vi.hoisted(() => ({
  createTripAction: vi.fn(),
  updateTripAction: vi.fn(),
}));
vi.mock("@/actions/trips", () => ({ createTripAction, updateTripAction }));

const END_BEFORE_START = "La date de fin doit être postérieure ou égale à la date de début.";

beforeEach(() => {
  createTripAction.mockReset();
  updateTripAction.mockReset();
});

async function fillTrip(title: string, start: string, end: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Titre"), title);
  // user-event remplit un <input type="date"> quand le texte tapé est une date complète.
  await user.type(screen.getByLabelText("Date de début"), start);
  await user.type(screen.getByLabelText("Date de fin"), end);
  return user;
}

describe("TripForm", () => {
  it("bloque une date de fin antérieure au début et affiche le message sous la date de fin", async () => {
    render(<TripForm />);

    const user = await fillTrip("Gaspésie 2027", "2027-07-10", "2027-07-01");
    await user.click(screen.getByRole("button", { name: "Créer le voyage" }));

    expect(await screen.findByText(END_BEFORE_START)).toBeInTheDocument();
    expect(screen.getByLabelText("Date de fin")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Date de fin")).toHaveAccessibleDescription(END_BEFORE_START);
    expect(createTripAction).not.toHaveBeenCalled();
  });

  it("affiche les champs obligatoires sans appeler l'action", async () => {
    const user = userEvent.setup();
    render(<TripForm />);

    await user.click(screen.getByRole("button", { name: "Créer le voyage" }));

    expect(await screen.findByText("Entrez un titre.")).toBeInTheDocument();
    expect(screen.getByText("Choisissez la date de début.")).toBeInTheDocument();
    expect(screen.getByText("Choisissez la date de fin.")).toBeInTheDocument();
    expect(createTripAction).not.toHaveBeenCalled();
  });

  it("envoie les valeurs saisies à createTripAction", async () => {
    // L'action redirige en cas de succès : ici, elle ne se termine jamais.
    createTripAction.mockReturnValue(new Promise(() => {}));
    render(<TripForm />);

    const user = await fillTrip("Gaspésie 2027", "2027-07-01", "2027-07-10");
    await user.type(screen.getByLabelText("Budget"), "1500,50");
    await user.click(screen.getByRole("button", { name: "Créer le voyage" }));

    expect(createTripAction).toHaveBeenCalledWith({
      title: "Gaspésie 2027",
      description: "",
      start_date: "2027-07-01",
      end_date: "2027-07-10",
      status: "draft",
      budget: "1500,50",
    });
    // Le bouton est désactivé pendant l'envoi.
    expect(await screen.findByRole("button", { name: "Enregistrement…" })).toBeDisabled();
  });

  it("met l'erreur renvoyée par Django sous le champ concerné", async () => {
    createTripAction.mockResolvedValue({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { end_date: [END_BEFORE_START] },
    });
    render(<TripForm />);

    const user = await fillTrip("Gaspésie 2027", "2027-07-01", "2027-07-10");
    await user.click(screen.getByRole("button", { name: "Créer le voyage" }));

    expect(await screen.findByText("Les données envoyées sont invalides.")).toBeInTheDocument();
    expect(screen.getByText(END_BEFORE_START)).toBeInTheDocument();
    expect(screen.getByLabelText("Date de fin")).toHaveFocus();
  });

  it("préremplit le voyage à modifier et appelle updateTripAction avec son identifiant", async () => {
    updateTripAction.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<TripForm trip={japanTrip} />);

    expect(screen.getByLabelText("Titre")).toHaveValue("Japon 2027");
    expect(screen.getByLabelText("Date de début")).toHaveValue("2027-04-01");
    expect(screen.getByLabelText("Budget")).toHaveValue("4500.00");
    expect(screen.getByLabelText("Statut")).toHaveTextContent("Planifié");
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/trips/1");

    await user.clear(screen.getByLabelText("Titre"));
    await user.type(screen.getByLabelText("Titre"), "Japon au printemps");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(updateTripAction).toHaveBeenCalledWith(1, {
      title: "Japon au printemps",
      description: "Deux semaines entre Tokyo et Kyoto.",
      start_date: "2027-04-01",
      end_date: "2027-04-14",
      status: "planned",
      budget: "4500.00",
    });
  });
});
