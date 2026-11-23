import { ACCESS_COOKIE, REFRESH_COOKIE } from "./cookieNames";

// Réglages des cookies de session, partagés par les Server Actions (cookies.ts) et par
// proxy.ts. Ce module n'importe pas « server-only » : il ne contient aucun secret, et
// proxy.ts en a besoin.

/** 14 minutes : le cookie disparaît une minute avant le JWT d'accès (15 minutes). */
export const ACCESS_MAX_AGE = 14 * 60;

/** 1 jour, comme REFRESH_TOKEN_LIFETIME dans Django. */
export const REFRESH_MAX_AGE = 24 * 60 * 60;

export const AUTH_COOKIE_NAMES = [ACCESS_COOKIE, REFRESH_COOKIE] as const;

/**
 * En-tête que proxy.ts ajoute à la requête transmise aux pages : le chemin demandé.
 * Un Server Component ne connaît pas son adresse, et verifySession() en a besoin pour
 * ?next=. Le proxy remplace toujours cet en-tête, même si le navigateur en envoie un.
 */
export const PATH_HEADER = "x-travelhub-path";

export interface AuthCookie {
  name: string;
  value: string;
  maxAge: number;
  /** JavaScript ne peut pas lire le cookie (document.cookie), ce qui protège du XSS. */
  httpOnly: true;
  /** Le cookie part avec les liens venus d'un autre site, mais pas avec leurs POST. */
  sameSite: "lax";
  path: "/";
  /** HTTPS seulement en production. En local, http://localhost doit marcher. */
  secure: boolean;
}

function authCookie(name: string, value: string, maxAge: number): AuthCookie {
  return {
    name,
    value,
    maxAge,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

/** Les deux cookies à poser après une connexion, une inscription ou un rafraîchissement. */
export function authCookies(access: string, refresh: string): AuthCookie[] {
  return [
    authCookie(ACCESS_COOKIE, access, ACCESS_MAX_AGE),
    authCookie(REFRESH_COOKIE, refresh, REFRESH_MAX_AGE),
  ];
}
