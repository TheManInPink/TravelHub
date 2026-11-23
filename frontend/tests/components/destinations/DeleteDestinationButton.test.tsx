import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteDestinationButton } from "@/components/destinations/DeleteDestinationButton";

const { deleteDestinationAction, toast } = vi.hoisted(() => ({
  deleteDestinationAction: vi.fn(),
  toast: { error: vi.fn() },
}));
vi.mock("@/actions/destinations", () => ({ deleteDestinationAction }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  deleteDestinationAction.mockReset();
  toast.error.mockReset();
});

describe("DeleteDestinationButton", () => {
  it("demande une confirmation, appelle l'action et affiche son erreur", async () => {
    deleteDestinationAction.mockResolvedValue({
      ok: false,
      message: "Vous n'avez pas le droit de faire cette action.",
      fieldErrors: {},
    });
    const user = userEvent.setup();
    render(<DeleteDestinationButton destinationId="3" city="Kyoto" />);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Supprimer « Kyoto » ?" }),
    ).toBeInTheDocument();
    expect(deleteDestinationAction).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Supprimer la destination" }));

    expect(deleteDestinationAction).toHaveBeenCalledWith("3");
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Vous n'avez pas le droit de faire cette action.");
    });
  });
});
