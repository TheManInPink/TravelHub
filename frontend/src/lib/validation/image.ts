import { z } from "zod";

// Règles d'une image de couverture. Le navigateur (ImageUploader) les applique dès le
// choix du fichier, et la Server Action uploadTripCover les applique encore, car un
// appel forgé peut envoyer n'importe quoi.
//
// La limite est de 4 Mo : Vercel refuse le corps d'une requête au-delà de 4,5 Mo, et le
// formulaire ajoute quelques octets autour du fichier. Le bucket Supabase a les mêmes
// règles (4 Mo, mêmes types), au cas où une autre application y écrirait.

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** 4 Mo, en octets (1 Mo = 1 048 576 octets, comme dans le réglage du bucket). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Valeur de l'attribut accept du champ fichier. */
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

/** Extension du fichier enregistré dans le bucket, d'après son type. */
export const IMAGE_EXTENSIONS: Readonly<Record<ImageType, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Nom du champ du FormData envoyé à uploadTripCover. */
export const IMAGE_FIELD = "file";
export type ImageField = typeof IMAGE_FIELD;

export const IMAGE_CONTENT_MESSAGE =
  "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.";

// Zod garde toutes les erreurs. Le type est vérifié avant la taille, pour qu'un gros PDF
// reçoive d'abord le message sur le type. L'interface n'affiche que le premier message.
export const imageFileSchema = z
  .file("Choisissez une image.")
  .mime([...IMAGE_TYPES], "Choisissez une image JPEG, PNG ou WebP.")
  .min(1, "Le fichier est vide.")
  .max(MAX_IMAGE_BYTES, "L'image dépasse 4 Mo. Choisissez une image plus légère.");

export function isImageType(value: string): value is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(value);
}

/** Premiers octets de chaque format (signature du fichier). */
function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * Type réel d'après les premiers octets du fichier, ou null. Le type annoncé par le
 * navigateur vient seulement de l'extension : un PDF renommé en .png serait accepté.
 * - JPEG : FF D8 FF ;
 * - PNG : 89 50 4E 47 0D 0A 1A 0A ;
 * - WebP : « RIFF », quatre octets de taille, puis « WEBP ».
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

/** Premier message d'erreur du schéma pour ce fichier, ou null s'il est valide. */
export function imageFileError(file: unknown): string | null {
  const result = imageFileSchema.safeParse(file);
  return result.success ? null : (result.error.issues[0]?.message ?? "Choisissez une image.");
}
