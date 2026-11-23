// Lecture des paramètres d'URL reçus par une page (searchParams).

/**
 * Une valeur de searchParams est une chaîne, un tableau quand le paramètre est répété
 * (?next=a&next=b), ou undefined. Nous gardons la première valeur.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
