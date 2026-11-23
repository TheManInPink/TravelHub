import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteTripButton } from "@/components/trips/DeleteTripButton";

// La vraie Server Action appellerait Django : ici, deleteTripAction est simulée.
const { deleteTripAction, toast } = vi.hoisted(() => ({
  deleteTripAction: vi.fn(),
  toast: { error: vi.fn() },
}));
vi.mock("@/actions/trips", () => ({ deleteTripAction }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  deleteTripAction.mockReset();
  toast.error.mockReset();
});

describe("DeleteTripButton", () => {
  it("demande une confirmation avant de supprimer", async () => {
    const user = userEvent.setup();
    render(<DeleteTripButton tripId={1} tripTitle="Japon 2027" />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(
      await screen.findByRole("alertdialog", { name: "Supprimer « Japon 2027 » ?" }),
    ).toBeInTheDocument();
    expect(deleteTripAction).not.toHaveBeenCalled();
  });

  it("affiche l'erreur renvoyée par l'action dans un toast", async () => {
    deleteTripAction.mockResolvedValue({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
    const user = userEvent.setup();
    render(<DeleteTripButton tripId={1} tripTitle="Japon 2027" />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer le voyage" }));

    expect(deleteTripAction).toHaveBeenCalledWith(1);
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Vous n'avez pas le droit de faire cette action.");
    });
  });
});
