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
