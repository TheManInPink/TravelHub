import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageUploader } from "@/components/upload/ImageUploader";
import type { ActionResult } from "@/types/actions";
import { imageFile } from "../../helpers";

const { uploadTripCover, toast } = vi.hoisted(() => ({
  uploadTripCover: vi.fn<(tripId: number, formData: FormData) => Promise<ActionResult<"file">>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/actions/upload", () => ({ uploadTripCover }));
vi.mock("sonner", () => ({ toast }));

// jsdom n'a pas URL.createObjectURL : nous le simulons pour l'aperçu.
const createObjectURL = vi.fn((file: Blob) => `blob:apercu-${file.size}`);
const revokeObjectURL = vi.fn();

const MB = 1024 * 1024;

function setup(props: Partial<Parameters<typeof ImageUploader>[0]> = {}) {
  // applyAccept: false. Le sélecteur de fichiers permet de choisir « Tous les fichiers »,
  // donc l'attribut accept ne protège pas : c'est notre contrôle qui doit refuser.
  const user = userEvent.setup({ applyAccept: false });
  render(<ImageUploader tripId={1} {...props} />);
  return { user, input: screen.getByLabelText("Image"), send: sendButton };
}

function sendButton() {
  return screen.getByRole("button", { name: /Envoyer|Envoi/ });
}

beforeEach(() => {
  uploadTripCover.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe("ImageUploader", () => {
  it("refuse un fichier de 6 Mo sans appeler l'action", async () => {
    const { user, input, send } = setup();

    await user.upload(input, imageFile({ type: "image/jpeg", size: 6 * MB }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "L'image dépasse 4 Mo. Choisissez une image plus légère.",
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(send()).toBeDisabled();
    await user.click(send());
    expect(uploadTripCover).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("refuse un PDF sans appeler l'action", async () => {
    const { user, input, send } = setup();

    await user.upload(input, imageFile({ type: "application/pdf", name: "billet.pdf" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choisissez une image JPEG, PNG ou WebP.");
    expect(send()).toBeDisabled();
    await user.click(send());
    expect(uploadTripCover).not.toHaveBeenCalled();
  });

  it("propose seulement les images au sélecteur de fichiers", () => {
    setup();

    const input = screen.getByLabelText("Image");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).toHaveAccessibleDescription("JPEG, PNG ou WebP, 4 Mo au plus.");
  });

  it("montre l'aperçu, envoie l'image avec l'état du bouton, puis affiche un toast", async () => {
    let finish: (result: ActionResult<"file">) => void = () => {};
    uploadTripCover.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onSuccess = vi.fn();
    const { user, input, send } = setup({ onSuccess });
    const file = imageFile({ size: MB });

    await user.upload(input, file);

    expect(screen.getByRole("img", { name: "Aperçu de l'image choisie" })).toHaveAttribute(
      "src",
      `blob:apercu-${MB}`,
    );
    await user.click(send());

    // Pendant l'envoi : bouton désactivé, avec « Envoi… ».
    expect(send()).toHaveTextContent("Envoi…");
    expect(send()).toBeDisabled();
    expect(uploadTripCover).toHaveBeenCalledTimes(1);
    const [tripId, formData] = uploadTripCover.mock.calls[0] ?? [];
    expect(tripId).toBe(1);
    expect(formData?.get("file")).toBe(file);

    finish({ ok: true });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Image de couverture enregistrée.");
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // L'aperçu est retiré, et son adresse blob: libérée.
    expect(
      screen.queryByRole("img", { name: "Aperçu de l'image choisie" }),
    ).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith(`blob:apercu-${MB}`);
    expect(send()).toBeDisabled();
  });

  it("affiche l'erreur de l'action sous le champ et dans un toast", async () => {
    uploadTripCover.mockResolvedValue({
      ok: false,
      message: "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.",
      fieldErrors: {
        file: ["Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide."],
      },
    });
    const { user, input, send } = setup();

    await user.upload(input, imageFile({ type: "image/png" }));
    await user.click(send());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.",
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("libère l'ancien aperçu quand un autre fichier est choisi", async () => {
    const { user, input } = setup();

    await user.upload(input, imageFile({ size: 100 }));
    await user.upload(input, imageFile({ size: 200 }));

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:apercu-100");
    expect(screen.getByRole("img", { name: "Aperçu de l'image choisie" })).toHaveAttribute(
      "src",
      "blob:apercu-200",
    );
  });

  it("efface l'erreur quand un fichier valide remplace un fichier refusé", async () => {
    const { user, input, send } = setup();

    await user.upload(input, imageFile({ type: "application/pdf" }));
    await user.upload(input, imageFile());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(send()).toBeEnabled();
  });

  it("appelle onCancel avec le bouton Annuler", async () => {
    const onCancel = vi.fn();
    const { user } = setup({ onCancel });

    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
