import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverImageDialog } from "@/components/upload/CoverImageDialog";
import { imageFile } from "../../helpers";

const { uploadTripCover, toast } = vi.hoisted(() => ({
  uploadTripCover: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/actions/upload", () => ({ uploadTripCover }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  uploadTripCover.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:apercu");
  URL.revokeObjectURL = vi.fn();
});

describe("CoverImageDialog", () => {
  it("ouvre le dialogue, envoie l'image, puis se ferme", async () => {
    uploadTripCover.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<CoverImageDialog tripId={1} hasCover={false} />);

    await user.click(screen.getByRole("button", { name: "Ajouter une image" }));
    const dialog = await screen.findByRole("dialog", { name: "Image de couverture" });
    expect(dialog).toHaveAccessibleDescription(
      "Elle s'affiche en haut du voyage et sur sa carte, pour tous les participants.",
    );

    await user.upload(screen.getByLabelText("Image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(uploadTripCover).toHaveBeenCalledWith(1, expect.any(FormData));
  });

  it("dit que la nouvelle image remplace l'actuelle, et se ferme avec Annuler", async () => {
    const user = userEvent.setup();
    render(<CoverImageDialog tripId={1} hasCover />);

    await user.click(screen.getByRole("button", { name: "Changer l'image" }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleDescription(
      /La nouvelle image remplace l'image actuelle\.$/,
    );
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(uploadTripCover).not.toHaveBeenCalled();
  });
});
