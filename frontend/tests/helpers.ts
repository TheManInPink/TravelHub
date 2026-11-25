// Petites fonctions partagées par les tests.

/** Attend que la promesse échoue et renvoie l'erreur, pour examiner ses propriétés. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("La promesse aurait dû échouer.");
}

/** Premiers octets de chaque format, pour que le contrôle de signature les reconnaisse. */
const SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  // « RIFF », quatre octets de taille, puis « WEBP ».
  "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  // « %PDF- »
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
};

interface ImageFileInit {
  /** Type annoncé par le navigateur. Les premiers octets suivent ce type. */
  type?: string;
  /** Taille en octets. */
  size?: number;
  name?: string;
}

/** Faux fichier de la taille voulue, qui commence par la signature de son type. */
export function imageFile({ type = "image/webp", size = 1024, name }: ImageFileInit = {}): File {
  const bytes = new Uint8Array(size);
  bytes.set((SIGNATURES[type] ?? []).slice(0, size));
  const extension = type.split("/")[1] ?? "bin";
  return new File([bytes], name ?? `photo.${extension}`, { type });
}

/**
 * Adresse d'un redirect() de next/navigation. redirect() lève une erreur dont le digest
 * vaut « NEXT_REDIRECT;replace;/login?expired=1;307; ». Échoue si ce n'est pas un redirect.
 */
export async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  const error = await rejection(promise);
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "";
  const parts = digest.split(";");
  if (parts[0] !== "NEXT_REDIRECT") {
    throw new Error(`L'erreur n'est pas un redirect() : ${String(error)}`);
  }
  return parts.slice(2, -2).join(";");
}
