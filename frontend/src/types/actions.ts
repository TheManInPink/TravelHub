// Résultat d'une Server Action de formulaire. La plupart des actions redirigent en cas
// de succès : elles ne renvoient donc un objet qu'en cas d'erreur attendue (identifiants
// faux, validation de Django, trop de requêtes, serveur endormi). Les actions des
// activités ne redirigent pas : la page reste ouverte et se met à jour sur place.

export interface ActionFailure<TField extends string = string> {
  ok: false;
  /** Message global, en français, affiché au-dessus du formulaire. */
  message: string;
  /** Messages à afficher sous chaque champ (schéma Zod ou details de Django). */
  fieldErrors: Partial<Record<TField, string[]>>;
}

/** Succès d'une action qui ne redirige pas, par exemple l'ajout d'une activité. */
export interface ActionSuccess {
  ok: true;
}

/** Résultat d'une action qui ne redirige pas : succès, ou erreur à afficher. */
export type ActionResult<TField extends string = string> = ActionSuccess | ActionFailure<TField>;
