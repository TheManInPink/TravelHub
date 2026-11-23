import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityDialog } from "@/components/activities/ActivityDialog";
import { kyotoPage } from "../../msw/fixtures";

const { createActivityAction, updateActivityAction, toast } = vi.hoisted(() => ({
  createActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/actions/activities", () => ({ createActivityAction, updateActivityAction }));
vi.mock("sonner", () => ({ toast }));

const stay = { start: kyotoPage.arrivalDate, end: kyotoPage.departureDate };
const [temple] = kyotoPage.activities;

beforeEach(() => {
  createActivityAction.mockReset();
  updateActivityAction.mockReset();
  toast.success.mockReset();
});

describe("ActivityDialog", () => {
  it("ouvre le formulaire, ajoute l'activité, puis se ferme avec un toast", async () => {
    createActivityAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ActivityDialog destinationId={kyotoPage.id} stay={stay} />);

    await user.click(screen.getByRole("button", { name: "Ajouter une activité" }));
    const dialog = await screen.findByRole("dialog", { name: "Ajouter une activité" });
    expect(dialog).toHaveAccessibleDescription(
      "La date doit tomber pendant le séjour, 8–14 avril 2027.",
    );

    await user.type(screen.getByLabelText("Nom"), "Marché Nishiki");
    await user.click(screen.getByRole("button", { name: "Ajouter l'activité" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(toast.success).toHaveBeenCalledWith("Activité ajoutée.");
  });

  it("garde le dialogue ouvert quand l'action échoue", async () => {
    createActivityAction.mockResolvedValue({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
    const user = userEvent.setup();
    render(<ActivityDialog destinationId={kyotoPage.id} stay={stay} />);

    await user.click(screen.getByRole("button", { name: "Ajouter une activité" }));
    await user.type(await screen.findByLabelText("Nom"), "Marché Nishiki");
    await user.click(screen.getByRole("button", { name: "Ajouter l'activité" }));

    expect(
      await screen.findByText("Vous n'avez pas le droit de faire cette action."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("ouvre la modification depuis le bouton de l'activité, avec ses valeurs", async () => {
    const user = userEvent.setup();
    render(<ActivityDialog destinationId={kyotoPage.id} stay={stay} activity={temple} />);

    await user.click(
      screen.getByRole("button", { name: "Modifier l'activité « Pavillon d'or (Kinkaku-ji) »" }),
    );

    expect(await screen.findByRole("dialog", { name: "Modifier l'activité" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nom")).toHaveValue("Pavillon d'or (Kinkaku-ji)");
  });
});
