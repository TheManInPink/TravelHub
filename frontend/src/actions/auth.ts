"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiFailure, invalidInput } from "@/lib/actionFailure";
import { obtainTokens, registerAccount, revokeRefreshToken } from "@/lib/api/auth";
import { REFRESH_COOKIE } from "@/lib/auth/cookieNames";
import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { safeNextPath } from "@/lib/auth/redirect";
import { isApiError } from "@/lib/errors";
import {
  loginSchema,
  registerSchema,
  type LoginField,
  type LoginInput,
  type RegisterField,
  type RegisterInput,
} from "@/lib/validation/auth";
import type { TokenPair } from "@/types/api";
import type { ActionFailure } from "@/types/actions";

// Server Actions de l'authentification. Elles tournent sur le serveur Next.js : elles
// appellent Django, puis posent les jetons dans des cookies httpOnly. Le navigateur ne
// voit jamais les jetons.
//
// Un fichier "use server" ne peut exporter que des fonctions asynchrones. Les
// constantes ci-dessous restent donc privées, et invalidInput et apiFailure viennent de
// lib/actionFailure.ts, partagé avec les actions des voyages.

const LOGIN_FIELDS: readonly LoginField[] = ["username", "password"];
const REGISTER_FIELDS: readonly RegisterField[] = [
  "username",
  "email",
  "password",
  "password_confirm",
  "first_name",
  "last_name",
];

/**
 * Connexion. Pose les cookies, puis redirige vers next si c'est une page de TravelHub,
 * sinon vers /dashboard. Renvoie une ActionFailure pour une erreur attendue, par exemple
 * « Nom d'utilisateur ou mot de passe incorrect. » (401 no_active_account).
 */
export async function login(
  values: LoginInput,
  next?: string,
): Promise<ActionFailure<LoginField> | undefined> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  let tokens: TokenPair;
  try {
    tokens = await obtainTokens(parsed.data);
  } catch (error) {
    return apiFailure(error, LOGIN_FIELDS);
  }

  await setAuthCookies(tokens.access, tokens.refresh);
  // redirect() lève une erreur spéciale que Next.js intercepte : il reste hors du try.
  // next vient du navigateur : safeNextPath refuse tout ce qui mène hors du site.
  redirect(safeNextPath(typeof next === "string" ? next : undefined));
}

/**
 * Inscription. Django crée le compte et renvoie directement une paire de jetons : nous
 * les posons, et l'utilisateur arrive connecté sur next ou sur /dashboard.
 */
export async function register(
  values: RegisterInput,
  next?: string,
): Promise<ActionFailure<RegisterField> | undefined> {
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  // La confirmation du mot de passe reste dans le formulaire : Django ne la connaît pas.
  const { username, email, password, first_name, last_name } = parsed.data;
  let tokens: TokenPair;
  try {
    ({ tokens } = await registerAccount({ username, email, password, first_name, last_name }));
  } catch (error) {
    return apiFailure(error, REGISTER_FIELDS);
  }

  await setAuthCookies(tokens.access, tokens.refresh);
  redirect(safeNextPath(typeof next === "string" ? next : undefined));
}

/**
 * Déconnexion. Django met le refresh sur liste noire, puis nous supprimons les cookies.
 * Nous les supprimons même si Django refuse (401 quand le jeton d'accès a expiré, 400
 * pour un refresh déjà révoqué) ou ne répond pas : l'utilisateur veut partir.
 */
export async function logout(): Promise<void> {
  const refresh = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      await revokeRefreshToken(refresh);
    } catch (error) {
      if (!isApiError(error)) {
        console.error("Déconnexion : appel à Django impossible.", error);
      }
    }
  }

  await clearAuthCookies();
  // Vide le cache du routeur côté navigateur : le bouton Précédent ne doit pas
  // réafficher une page privée.
  revalidatePath("/", "layout");
  redirect("/login");
}
