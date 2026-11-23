import "server-only";

import { cookies } from "next/headers";
import { AUTH_COOKIE_NAMES, authCookies } from "./config";

// Écriture des cookies de session. Next.js n'autorise cookies().set() et delete() que
// dans une Server Action ou un Route Handler. Un Server Component peut lire un cookie,
// mais pas le supprimer : c'est pour cela que verifySession() passe par /api/auth/expire.

/** Pose th_access (14 min) et th_refresh (1 jour), httpOnly et SameSite=Lax. */
export async function setAuthCookies(access: string, refresh: string): Promise<void> {
  const store = await cookies();
  for (const cookie of authCookies(access, refresh)) {
    store.set(cookie);
  }
}

/** Supprime th_access et th_refresh (Set-Cookie vide, expiré, avec path=/). */
export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  for (const name of AUTH_COOKIE_NAMES) {
    store.delete(name);
  }
}
