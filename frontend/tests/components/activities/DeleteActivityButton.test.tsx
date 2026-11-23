import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteActivityButton } from "@/components/activities/DeleteActivityButton";

const { deleteActivityAction, toast } = vi.hoisted(() => ({
  deleteActivityAction: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/actions/activities", () => ({ deleteActivityAction }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  deleteActivityAction.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

async function confirmDeletion() {
  const user = userEvent.setup();
  render(<DeleteActivityButton destinationId="3" activityId="7" activityName="Pavillon d'or" />);
  await user.click(screen.getByRole("button", { name: "Supprimer l'activité « Pavillon d'or »" }));
  expect(
    await screen.findByRole("alertdialog", { name: "Supprimer « Pavillon d'or » ?" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Supprimer l'activité" }));
}

describe("DeleteActivityButton", () => {
  it("supprime l'activité après confirmation et affiche un toast", async () => {
    deleteActivityAction.mockResolvedValue({ ok: true });

    await confirmDeletion();

    expect(deleteActivityAction).toHaveBeenCalledWith("3", "7");
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Activité supprimée.");
    });
  });

  it("affiche l'erreur renvoyée par l'action", async () => {
    deleteActivityAction.mockResolvedValue({
      ok: false,
      message: "Cette activité est introuvable. Elle a peut-être été supprimée.",
      fieldErrors: {},
    });

    await confirmDeletion();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Cette activité est introuvable. Elle a peut-être été supprimée.",
      );
    });
  });
});
