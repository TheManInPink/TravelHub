import { z } from "zod";
import { isApiError, toUserMessage } from "@/lib/errors";
import type { ActionFailure } from "@/types/actions";

// Résultats d'échec communs à toutes les Server Actions de formulaire (auth, voyages).
// Ce module n'a pas "use server" : un fichier "use server" ne peut exporter que des
// actions, et ces fonctions ne doivent pas devenir des actions appelables du navigateur.

/** Erreurs du schéma Zod. Le formulaire les a déjà montrées, sauf si l'appel est forgé. */
export function invalidInput<TField extends string>(error: z.ZodError): ActionFailure<TField> {
  const { fieldErrors } = z.flattenError(error);
  return {
    ok: false,
    message: "Vérifiez les champs indiqués.",
    fieldErrors: fieldErrors as Partial<Record<TField, string[]>>,
  };
}

/**
 * Erreur attendue de Django, transformée en message pour le formulaire. Les details d'un
 * validation_error ({"end_date": ["…"]}) vont sous les champs du formulaire. Les autres
 * clés (non_field_errors, par exemple) restent dans le message global, que Django remplit
 * quand il n'y a qu'une erreur générale. Une erreur qui n'est pas une ApiError est un
 * bogue : nous la laissons remonter.
 */
export function apiFailure<TField extends string>(
  error: unknown,
  fields: readonly TField[],
): ActionFailure<TField> {
  if (!isApiError(error)) {
    throw error;
  }
  const fieldErrors: Partial<Record<TField, string[]>> = {};
  for (const field of fields) {
    const messages = error.details[field];
    if (Array.isArray(messages)) {
      fieldErrors[field] = messages.filter((m): m is string => typeof m === "string");
    }
  }
  // Le message vient du code (no_active_account, throttled, timeout…), jamais du texte
  // anglais de SimpleJWT.
  return { ok: false, message: toUserMessage(error), fieldErrors };
}
