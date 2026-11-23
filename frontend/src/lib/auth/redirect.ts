// Choix de la page où renvoyer l'utilisateur après la connexion (paramètre ?next=).
// Ce module n'importe pas « server-only » : proxy.ts, la route /api/auth/expire et les
// Server Actions l'utilisent, et il ne contient aucun secret.

/** Page par défaut après la connexion, et quand next n'est pas sûr. */
export const DEFAULT_NEXT_PATH = "/dashboard";

const LOCAL_ORIGIN = "http://local";

/**
 * Renvoie next s'il désigne une page de TravelHub, sinon /dashboard.
 *
 * Sans ce contrôle, un lien piégé comme /login?next=https://faux-travelhub.com enverrait
 * l'utilisateur sur un autre site juste après sa connexion (redirection ouverte). Nous
 * résolvons next par rapport à une origine fictive. Si l'origine change, next mène
 * ailleurs. C'est le cas de « //evil.com » et de « /\evil.com », car le navigateur lit
 * « \ » comme « / ».
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) {
    return DEFAULT_NEXT_PATH;
  }

  let url: URL;
  try {
    url = new URL(next, LOCAL_ORIGIN);
  } catch {
    return DEFAULT_NEXT_PATH;
  }
  if (url.origin !== LOCAL_ORIGIN) {
    return DEFAULT_NEXT_PATH;
  }

  // Revenir sur /login ou /register après la connexion n'a pas de sens, et
  // /api/auth/expire déconnecterait l'utilisateur aussitôt.
  const { pathname } = url;
  if (pathname === "/login" || pathname === "/register" || pathname.startsWith("/api/")) {
    return DEFAULT_NEXT_PATH;
  }
  // Nous reconstruisons le chemin à partir de l'URL analysée, jamais à partir de next.
  return `${pathname}${url.search}${url.hash}`;
}
