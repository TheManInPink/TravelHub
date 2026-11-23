import { NextResponse, type NextRequest, type ProxyConfig } from "next/server";
import { refreshTokens } from "@/lib/api/auth";
import { AUTH_COOKIE_NAMES, PATH_HEADER, authCookies } from "@/lib/auth/config";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth/cookieNames";
import type { TokenPair } from "@/types/api";

// Proxy de Next.js 16 : c'est le middleware recommandé par l'énoncé. Next.js 16 a
// renommé middleware.ts en proxy.ts et la fonction middleware() en proxy().
//
// Il s'exécute avant le rendu des pages du matcher (plus bas) et fait trois choses.
// 1. Une page protégée sans aucun cookie renvoie vers /login?next=<page>.
// 2. Sans th_access (expiré après 14 min) mais avec th_refresh, il demande une nouvelle
//    paire de jetons à Django. Ainsi l'utilisateur reste connecté, sans le voir.
// 3. Un utilisateur qui a déjà un cookie ne voit pas /login ni /register.
//
// Le proxy ne fait qu'un tri rapide, d'après la présence des cookies : il ne sait pas si
// th_access est encore valide. La vraie vérification est verifySession(), qui demande à
// Django en tête de chaque page protégée.

function isAuthPage(pathname: string): boolean {
  return /^\/(login|register)(\/|$)/.test(pathname);
}

/**
 * Une navigation (GET) peut être redirigée vers /login. Une Server Action arrive en POST
 * sur l'adresse de la page : nous la laissons passer, et c'est verifyActionSession()
 * qui renvoie l'utilisateur vers /login.
 */
function isNavigation(request: NextRequest): boolean {
  return request.method === "GET" || request.method === "HEAD";
}

/** Chemin demandé, pour ?next=. Le paramètre _rsc (navigation côté client) est retiré. */
function requestedPath(request: NextRequest): string {
  const params = new URLSearchParams(request.nextUrl.search);
  params.delete("_rsc");
  const search = params.toString();
  return search ? `${request.nextUrl.pathname}?${search}` : request.nextUrl.pathname;
}

/** Laisse passer la requête, avec le chemin demandé dans un en-tête pour verifySession(). */
function forward(request: NextRequest, path: string): NextResponse {
  // Copie des en-têtes faite après les éventuels request.cookies.set() : elle contient
  // donc l'en-tête Cookie à jour.
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, path);
  // request.headers : les en-têtes que les pages recevront. Ce n'est pas la réponse.
  return NextResponse.next({ request: { headers } });
}

function deleteAuthCookies(response: NextResponse): void {
  for (const name of AUTH_COOKIE_NAMES) {
    response.cookies.delete(name);
  }
}

/** Pas de session utilisable : retour à /login, avec expired=1 si un refresh existait. */
function denyAccess(request: NextRequest, path: string, expired: boolean): NextResponse {
  if (!isNavigation(request)) {
    for (const name of AUTH_COOKIE_NAMES) {
      request.cookies.delete(name);
    }
    const response = forward(request, path);
    if (expired) {
      deleteAuthCookies(response);
    }
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  if (expired) {
    loginUrl.searchParams.set("expired", "1");
  }
  loginUrl.searchParams.set("next", path);
  const response = NextResponse.redirect(loginUrl);
  if (expired) {
    deleteAuthCookies(response);
  }
  return response;
}

async function protectPage(request: NextRequest): Promise<NextResponse> {
  const path = requestedPath(request);
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value;

  if (request.cookies.has(ACCESS_COOKIE)) {
    return forward(request, path);
  }
  if (!refresh) {
    return denyAccess(request, path, false);
  }

  let tokens: TokenPair;
  try {
    tokens = await refreshTokens(refresh);
  } catch {
    // Refresh expiré ou déjà utilisé (401), trop de requêtes (429), Django injoignable :
    // dans tous les cas, l'utilisateur doit se reconnecter.
    return denyAccess(request, path, true);
  }

  // Les pages de cette requête lisent les cookies de la requête, pas ceux de la réponse.
  // Nous mettons donc les nouveaux jetons aux deux endroits.
  request.cookies.set(ACCESS_COOKIE, tokens.access);
  request.cookies.set(REFRESH_COOKIE, tokens.refresh);
  const response = forward(request, path);
  for (const cookie of authCookies(tokens.access, tokens.refresh)) {
    response.cookies.set(cookie);
  }
  return response;
}

function guestOnly(request: NextRequest): NextResponse {
  const hasCookie = request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);
  // expired=1 vient de /api/auth/expire ou d'un refresh refusé : la page de connexion doit
  // alors s'afficher, sinon /login et /dashboard se renverraient l'utilisateur en boucle.
  const expired = request.nextUrl.searchParams.get("expired") === "1";
  if (hasCookie && !expired && isNavigation(request)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }
  return NextResponse.next();
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (isAuthPage(request.nextUrl.pathname)) {
    return guestOnly(request);
  }
  return protectPage(request);
}

// Le matcher doit être écrit en littéral : Next.js le lit au build, sans exécuter le
// fichier. Chaque entrée exclut les préchargements (prefetch) de next/link. Sinon,
// survoler plusieurs liens lancerait plusieurs rafraîchissements avec le même refresh,
// et Django, qui met l'ancien refresh sur liste noire, refuserait tous les suivants.
export const config = {
  matcher: [
    {
      source: "/dashboard/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/trips/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/login",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      source: "/register",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
} satisfies ProxyConfig;
