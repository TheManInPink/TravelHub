import type { NextConfig } from "next";
import { supabaseImagePatterns } from "./src/lib/supabase/images";

/**
 * En-têtes de sécurité ajoutés à toutes les réponses :
 * - X-Content-Type-Options : le navigateur ne devine pas le type d'un fichier ;
 * - Referrer-Policy : les autres sites reçoivent seulement notre origine, sans le chemin
 *   (/trips/12) ;
 * - X-Frame-Options : aucun site ne peut afficher TravelHub dans une iframe (clickjacking) ;
 * - Permissions-Policy : la page n'a pas accès à la caméra, au micro ni à la position.
 *   Le choix d'un fichier reste possible, car il passe par le sélecteur du système.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // En développement, le terminal de `npm run dev` affiche chaque appel du serveur à
  // Django avec son adresse complète, par exemple les POST vers /graphql/. Cela montre
  // que GraphQL passe par le serveur Next.js et jamais par le navigateur.
  logging: {
    // Next.js 16 écrit aussi les arguments de chaque Server Action, donc le mot de passe
    // de loginAction et de registerAction. Nous désactivons ce journal.
    serverFunctions: false,
    fetches: {
      fullUrl: true,
    },
  },
  experimental: {
    serverActions: {
      // 1 Mo par défaut. L'image peut faire 4 Mo, et le FormData ajoute un peu autour.
      // Vercel refuse de toute façon un corps de plus de 4,5 Mo.
      bodySizeLimit: "5mb",
    },
  },
  images: {
    // Seules les images publiques de notre projet Supabase passent par l'optimiseur
    // (https://<ref>.supabase.co/storage/v1/object/public/**). Sans SUPABASE_URL, la
    // liste est vide et le build continue. Elle est figée au build : sur Vercel, il faut
    // redéployer après avoir changé SUPABASE_URL.
    remotePatterns: supabaseImagePatterns(),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
