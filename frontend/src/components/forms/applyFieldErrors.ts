import type { FieldPath, FieldValues, UseFormSetError } from "react-hook-form";

/**
 * Affiche sous chaque champ l'erreur renvoyée par une Server Action (details de Django),
 * et place le focus sur le premier champ en erreur.
 */
export function applyFieldErrors<TValues extends FieldValues>(
  setError: UseFormSetError<TValues>,
  fieldErrors: Partial<Record<FieldPath<TValues>, string[]>>,
): void {
  let first = true;
  // Object.entries perd le type des clés : nous le redonnons.
  const entries = Object.entries(fieldErrors) as [FieldPath<TValues>, string[] | undefined][];
  for (const [name, messages] of entries) {
    const message = messages?.[0];
    if (message) {
      setError(name, { type: "server", message }, { shouldFocus: first });
      first = false;
    }
  }
}
