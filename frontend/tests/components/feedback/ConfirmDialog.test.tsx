import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Button } from "@/components/ui/button";

function renderDialog(onConfirm: () => void | Promise<void>) {
  render(
    <ConfirmDialog
      trigger={<Button>Supprimer</Button>}
      title="Supprimer « Japon 2027 » ?"
      description="Cette action est définitive."
      confirmLabel="Supprimer le voyage"
      pendingLabel="Suppression…"
      onConfirm={onConfirm}
    />,
  );
}

describe("ConfirmDialog", () => {
  it("appelle onConfirm après la confirmation, puis se ferme", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Supprimer « Japon 2027 » ?" });
    expect(dialog).toHaveAccessibleDescription("Cette action est définitive.");
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Supprimer le voyage" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("n'appelle pas onConfirm quand on annule", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Annuler" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("reste ouvert et désactive ses boutons pendant l'action", async () => {
    const user = userEvent.setup();
    let finish = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(await screen.findByRole("button", { name: "Supprimer le voyage" }));

    expect(await screen.findByRole("button", { name: "Suppression…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    finish();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
