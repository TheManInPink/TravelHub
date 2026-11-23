import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityForm } from "@/components/activities/ActivityForm";
import { kyotoPage } from "../../msw/fixtures";

// Les vraies Server Actions appelleraient Django : ici, ce sont des fonctions simulées.
const { createActivityAction, updateActivityAction } = vi.hoisted(() => ({
  createActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
}));
vi.mock("@/actions/activities", () => ({ createActivityAction, updateActivityAction }));

// Séjour à Kyoto dans les données de test : du 8 au 14 avril 2027.
const stay = { start: kyotoPage.arrivalDate, end: kyotoPage.departureDate };
const OUTSIDE_STAY = "Choisissez une date du séjour, entre le 8 avril 2027 et le 14 avril 2027.";
const [temple] = kyotoPage.activities;

const onSuccess = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  createActivityAction.mockReset();
  updateActivityAction.mockReset();
  onSuccess.mockReset();
  onCancel.mockReset();
});

function renderForm(activity?: typeof temple) {
  render(
    <ActivityForm
      destinationId={kyotoPage.id}
      stay={stay}
      activity={activity}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />,
  );
  return userEvent.setup();
}

/** Remplace la date proposée (le premier jour du séjour) par une autre. */
async function typeDate(user: ReturnType<typeof userEvent.setup>, date: string) {
  const input = screen.getByLabelText("Date");
  await user.clear(input);
  // user-event remplit un <input type="date"> quand le texte tapé est une date complète.
  await user.type(input, date);
}

describe("ActivityForm", () => {
  it("refuse une date hors du séjour, sans appeler l'action", async () => {
    const user = renderForm();

    await user.type(screen.getByLabelText("Nom"), "Marché Nishiki");
    await typeDate(user, "2027-04-15");
    await user.click(screen.getByRole("button", { name: "Ajouter l'activité" }));

    expect(await screen.findByText(OUTSIDE_STAY)).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription(OUTSIDE_STAY);
    expect(createActivityAction).not.toHaveBeenCalled();
  });

  it("borne le calendrier aux dates du séjour", () => {
    renderForm();

    expect(screen.getByLabelText("Date")).toHaveValue("2027-04-08");
    expect(screen.getByLabelText("Date")).toHaveAttribute("min", "2027-04-08");
    expect(screen.getByLabelText("Date")).toHaveAttribute("max", "2027-04-14");
  });

  it("envoie les valeurs saisies à createActivityAction, puis appelle onSuccess", async () => {
    createActivityAction.mockResolvedValue({ ok: true });
    const user = renderForm();

    await user.type(screen.getByLabelText("Nom"), "Marché Nishiki");
    await typeDate(user, "2027-04-10");
    await user.type(screen.getByLabelText("Heure de début"), "12:30");
    await user.type(screen.getByLabelText("Coût"), "25,50");
    await user.click(screen.getByRole("button", { name: "Ajouter l'activité" }));

    expect(createActivityAction).toHaveBeenCalledWith("3", {
      name: "Marché Nishiki",
      description: "",
      category: "sightseeing",
      date: "2027-04-10",
      start_time: "12:30",
      cost: "25,50",
    });
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("affiche sous le champ date l'erreur validation_error renvoyée par Django", async () => {
    const message =
      "La date de l'activité doit être comprise dans le séjour à Kyoto (2027-04-08 au 2027-04-12).";
    createActivityAction.mockResolvedValue({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { date: [message] },
    });
    const user = renderForm();

    await user.type(screen.getByLabelText("Nom"), "Marché Nishiki");
    await typeDate(user, "2027-04-13");
    await user.click(screen.getByRole("button", { name: "Ajouter l'activité" }));

    expect(await screen.findByText("Les données envoyées sont invalides.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription(message);
    expect(screen.getByLabelText("Date")).toHaveFocus();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("préremplit l'activité à modifier et appelle updateActivityAction avec son identifiant", async () => {
    updateActivityAction.mockResolvedValue({ ok: true });
    const user = renderForm(temple);

    expect(screen.getByLabelText("Nom")).toHaveValue("Pavillon d'or (Kinkaku-ji)");
    expect(screen.getByLabelText("Catégorie")).toHaveTextContent("Culture");
    expect(screen.getByLabelText("Heure de début")).toHaveValue("09:30");
    expect(screen.getByLabelText("Coût")).toHaveValue("45.00");

    await user.clear(screen.getByLabelText("Coût"));
    await user.type(screen.getByLabelText("Coût"), "50");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(updateActivityAction).toHaveBeenCalledWith("3", "7", {
      name: "Pavillon d'or (Kinkaku-ji)",
      description: "",
      category: "culture",
      date: "2027-04-09",
      start_time: "09:30",
      cost: "50",
    });
  });

  it("appelle onCancel avec le bouton Annuler", async () => {
    const user = renderForm();

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
