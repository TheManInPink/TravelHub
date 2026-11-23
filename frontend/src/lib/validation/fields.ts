import { z } from "zod";

// Morceaux de schémas Zod partagés par les formulaires (voyage, destination, activité).

/**
 * Date "AAAA-MM-JJ" obligatoire. z.iso.date() refuse aussi les dates impossibles,
 * comme le 30 février. Le champ <input type="date"> donne toujours ce format.
 */
export function isoDate(requiredMessage: string) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .pipe(z.iso.date("Entrez une date valide au format AAAA-MM-JJ."));
}

/**
 * Condition `when` d'un refine sur tout le formulaire : la règle ne s'applique que si
 * ces champs sont déjà valides. Par exemple, nous ne comparons l'arrivée et le départ
 * que si les deux dates sont bien écrites. Sans when, Zod saute la règle dès qu'un
 * autre champ (la ville, par exemple) est en erreur.
 *
 * Nous lisons les erreurs déjà trouvées, et non payload.value : celui-ci contient les
 * valeurs transformées (null pour un champ vide), que le schéma refuserait de relire.
 */
export function withoutIssues(...fields: string[]) {
  return (payload: z.core.ParsePayload): boolean =>
    !payload.issues.some((issue) => {
      const field = issue.path?.[0];
      return typeof field === "string" && fields.includes(field);
    });
}
