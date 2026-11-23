import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getCurrentUser } from "@/lib/api/auth";
import { isApiError } from "@/lib/errors";
import type { User } from "@/types/api";
import { PATH_HEADER } from "./config";
import { ACCESS_COOKIE } from "./cookieNames";
import { clearAuthCookies } from "./cookies";
import { safeNextPath } from "./redirect";

// Couche d'accès à la session (le « DAL » du guide d'authentification de Next.js).
// proxy.ts redirige vite, mais c'est ici que se fait la vraie vérification : Django
// confirme que le jeton est valide. Chaque page protégée appelle verifySession() en
// premier, car un layout n'est pas réexécuté à chaque navigation.

/** Jeton d'accès du cookie httpOnly th_access, ou undefined. */
export async function getAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

/**
 * Utilisateur connecté (GET /api/auth/me/), ou null sans jeton ou si Django répond 401.
 * Ne redirige jamais. cache() de React évite un deuxième appel à Django quand le layout
 * et la page le demandent pendant le même rendu.
 * Les autres erreurs (délai dépassé, 503) remontent : elles ne veulent pas dire que la
 * session a expiré.
 */
export const getOptionalUser = cache(async (): Promise<User | null> => {
  if (!(await getAccessToken())) {
    return null;
  }
  try {
    return await getCurrentUser();
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      return null;
    }
    throw error;
  }
});

/** Chemin de la page demandée, que proxy.ts transmet dans l'en-tête x-travelhub-path. */
async function requestedPath(): Promise<string> {
  return safeNextPath((await headers()).get(PATH_HEADER));
}

/**
 * Pour les Server Components : renvoie l'utilisateur, ou redirige vers /api/auth/expire.
 *
 * Nous ne redirigeons pas directement vers /login. Un Server Component ne peut pas
 * supprimer de cookie : le cookie invalide resterait, et proxy.ts renverrait aussitôt
 * l'utilisateur de /login vers /dashboard, en boucle. Le Route Handler /api/auth/expire
 * supprime les cookies, puis redirige vers /login?expired=1.
 */
export const verifySession = cache(async (): Promise<User> => {
  const user = await getOptionalUser();
  if (user) {
    return user;
  }
  const next = await requestedPath();
  redirect(`/api/auth/expire?next=${encodeURIComponent(next)}`);
});

/**
 * Pour les Server Actions qui demandent un compte (étapes 8 et 9) : renvoie
 * l'utilisateur, ou supprime les cookies et redirige vers /login?expired=1.
 *
 * Une Server Action peut supprimer les cookies elle-même. Elle ne doit pas rediriger
 * vers /api/auth/expire : Next.js suit cette redirection par un fetch interne du
 * serveur, et la suppression des cookies n'arriverait jamais au navigateur.
 */
export async function verifyActionSession(): Promise<User> {
  const user = await getOptionalUser();
  if (user) {
    return user;
  }
  await clearAuthCookies();
  const next = await requestedPath();
  redirect(`/login?expired=1&next=${encodeURIComponent(next)}`);
}
