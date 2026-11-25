import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  detectImageType,
  imageFileError,
  imageFileSchema,
} from "@/lib/validation/image";
import { imageFile } from "../../helpers";

const MB = 1024 * 1024;

describe("imageFileSchema", () => {
  it("accepte une image WebP de 1 Mo", () => {
    const file = imageFile({ type: "image/webp", size: MB });

    expect(imageFileSchema.safeParse(file).success).toBe(true);
  });

  it.each(["image/jpeg", "image/png"] as const)("accepte une petite image %s", (type) => {
    expect(imageFileSchema.safeParse(imageFile({ type, size: 2048 })).success).toBe(true);
  });

  it("accepte une image de 4 Mo tout juste, et refuse un octet de plus", () => {
    expect(imageFileError(imageFile({ size: MAX_IMAGE_BYTES }))).toBeNull();
    expect(imageFileError(imageFile({ size: MAX_IMAGE_BYTES + 1 }))).toBe(
      "L'image dépasse 4 Mo. Choisissez une image plus légère.",
    );
  });

  it("refuse une image de 6 Mo", () => {
    expect(imageFileError(imageFile({ size: 6 * MB }))).toBe(
      "L'image dépasse 4 Mo. Choisissez une image plus légère.",
    );
  });

  it("refuse un PDF, avec le message sur le type même s'il est trop gros", () => {
    const pdf = imageFile({ type: "application/pdf", name: "billet.pdf", size: 6 * MB });

    expect(imageFileError(pdf)).toBe("Choisissez une image JPEG, PNG ou WebP.");
  });

  it("refuse un fichier vide", () => {
    expect(imageFileError(new File([], "vide.png", { type: "image/png" }))).toBe(
      "Le fichier est vide.",
    );
  });

  it.each([null, "photo.webp"])("refuse une valeur qui n'est pas un fichier : %s", (value) => {
    expect(imageFileError(value)).toBe("Choisissez une image.");
  });
});

describe("detectImageType", () => {
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "reconnaît la signature de %s",
    async (type) => {
      const bytes = new Uint8Array(await imageFile({ type, size: 64 }).arrayBuffer());

      expect(detectImageType(bytes)).toBe(type);
    },
  );

  it.each([
    ["un PDF", "%PDF-1.7"],
    ["un fichier RIFF qui n'est pas du WebP (WAVE)", "RIFF\u0000\u0000\u0000\u0000WAVEfmt "],
    ["un fichier vide", ""],
  ])("renvoie null pour %s", (_, content) => {
    expect(detectImageType(new TextEncoder().encode(content))).toBeNull();
  });
});
