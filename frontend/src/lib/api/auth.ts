import "server-only";

import type { LoginValues, RegisterValues } from "@/lib/validation/auth";
import type { RegisterResponse, TokenPair, User } from "@/types/api";
import { djangoFetch } from "./django";

// Routes REST d'authentification de Django (apps/accounts/urls.py). Les Server Actions,
// verifySession() et proxy.ts passent par ces fonctions, pour que seul src/lib/api/
// appelle Django.

/** Corps de POST /api/auth/register/ : la confirmation reste dans le formulaire. */
export type RegisterPayload = Omit<RegisterValues, "password_confirm">;

/**
 * POST /api/auth/token/ : connexion. Renvoie une paire de jetons, ou lève une ApiError
 * 401 no_active_account si le nom ou le mot de passe est faux.
 */
export function obtainTokens(credentials: LoginValues): Promise<TokenPair> {
  // public : aucun jeton à envoyer, et un vieux jeton invalide ferait répondre 401.
  return djangoFetch<TokenPair>("/api/auth/token/", {
    method: "POST",
    body: credentials,
    public: true,
  });
}

/** POST /api/auth/register/ : crée le compte et renvoie directement une paire de jetons. */
export function registerAccount(payload: RegisterPayload): Promise<RegisterResponse> {
  return djangoFetch<RegisterResponse>("/api/auth/register/", {
    method: "POST",
    body: payload,
    public: true,
  });
}

/**
 * POST /api/auth/token/refresh/ : nouvelle paire de jetons. Avec la rotation, Django met
 * l'ancien refresh sur liste noire. Il ne faut donc jamais réutiliser l'ancien.
 * proxy.ts l'appelle sans cookies() : d'où l'option public.
 */
export function refreshTokens(refresh: string): Promise<TokenPair> {
  return djangoFetch<TokenPair>("/api/auth/token/refresh/", {
    method: "POST",
    body: { refresh },
    public: true,
  });
}

/**
 * POST /api/auth/logout/ : met le refresh sur liste noire. Django exige aussi le jeton
 * d'accès, pour vérifier que le refresh appartient bien à l'utilisateur connecté.
 */
export function revokeRefreshToken(refresh: string): Promise<void> {
  return djangoFetch<void>("/api/auth/logout/", { method: "POST", body: { refresh } });
}

/** GET /api/auth/me/ : profil de l'utilisateur du jeton d'accès. */
export function getCurrentUser(): Promise<User> {
  return djangoFetch<User>("/api/auth/me/");
}
