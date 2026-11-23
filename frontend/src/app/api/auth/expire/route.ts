import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_NAMES } from "@/lib/auth/config";
import { safeNextPath } from "@/lib/auth/redirect";

// GET /api/auth/expire?next=/trips/3 : fin d'une session refusée par Django.
// verifySession() redirige ici quand le jeton est invalide (après un seed_demo --reset
// ou un changement de SECRET_KEY, par exemple). Ce Route Handler supprime les deux
// cookies, ce qu'un Server Component ne peut pas faire, puis renvoie vers
// /login?expired=1. Grâce à expired=1, proxy.ts laisse afficher la page de connexion.

export function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("expired", "1");
  loginUrl.searchParams.set("next", next);

  const response = NextResponse.redirect(loginUrl);
  for (const name of AUTH_COOKIE_NAMES) {
    // Set-Cookie vide, expiré en 1970, avec path=/ comme les cookies posés.
    response.cookies.delete(name);
  }
  // La réponse dépend des cookies : aucun cache ne doit la garder.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
