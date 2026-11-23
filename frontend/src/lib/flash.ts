// Messages « flash » : un toast affiché sur la page où une Server Action redirige.
//
// Quand une Server Action appelle redirect(), la promesse attendue par le formulaire
// est rejetée et Next.js navigue vers la nouvelle page : le code du formulaire après
// await ne s'exécute pas. L'action ajoute donc ?toast=<clé> à l'adresse, et FlashToast
// (étape 8.4) affiche le message puis retire le paramètre de l'URL.
// Le paramètre ne contient qu'une clé connue, jamais le texte du message : une adresse
// forgée ne peut pas afficher un texte choisi par quelqu'un d'autre.

export const FLASH_PARAM = "toast";

export const FLASH_MESSAGES = {
  "trip-created": "Voyage créé.",
  "trip-updated": "Voyage modifié.",
  "trip-deleted": "Voyage supprimé.",
} as const satisfies Record<string, string>;

export type FlashKey = keyof typeof FLASH_MESSAGES;

function isFlashKey(value: string): value is FlashKey {
  return Object.hasOwn(FLASH_MESSAGES, value);
}

/** "/trips/12" et "trip-created" donnent "/trips/12?toast=trip-created". */
export function withFlash(path: string, key: FlashKey): string {
  return `${path}?${new URLSearchParams({ [FLASH_PARAM]: key }).toString()}`;
}

/** Message de la clé lue dans l'URL, ou null pour une clé absente ou inconnue. */
export function flashMessage(value: string | null | undefined): string | null {
  return value && isFlashKey(value) ? FLASH_MESSAGES[value] : null;
}
