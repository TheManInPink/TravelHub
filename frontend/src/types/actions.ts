// Résultat d'une Server Action de formulaire. En cas de succès, l'action redirige :
// elle ne renvoie donc un objet qu'en cas d'erreur attendue (identifiants faux,
// validation de Django, trop de requêtes, serveur endormi).

export interface ActionFailure<TField extends string = string> {
  ok: false;
  /** Message global, en français, affiché au-dessus du formulaire. */
  message: string;
  /** Messages à afficher sous chaque champ (schéma Zod ou details de Django). */
  fieldErrors: Partial<Record<TField, string[]>>;
}
