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
