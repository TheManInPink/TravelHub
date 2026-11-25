// Adresses publiques des images de notre projet Supabase. Ce module ne contient aucun
// secret : il lit seulement SUPABASE_URL. next.config.ts s'en sert pour
// images.remotePatterns, et TripCover pour savoir si next/image peut afficher une image.
// La règle est donc écrite une seule fois.

/** Les fichiers d'un bucket public sont servis sous /storage/v1/object/public/<bucket>/. */
export const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";

/** Forme d'une entrée de images.remotePatterns dans next.config.ts. */
export interface SupabaseImagePattern {
  protocol: "https";
  hostname: string;
  port: string;
  pathname: string;
}

/**
 * Adresse du projet d'après SUPABASE_URL, ou null si la variable manque ou n'est pas une
 * adresse https. Nous n'appelons jamais new URL(undefined), qui lèverait
 * « TypeError: Invalid URL » et arrêterait le build.
 */
function projectUrl(): URL | null {
  const value = process.env.SUPABASE_URL?.trim();
  if (!value || !URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);
  return url.protocol === "https:" ? url : null;
}

/** images.remotePatterns : le stockage public du projet, ou une liste vide sans projet. */
export function supabaseImagePatterns(): SupabaseImagePattern[] {
  const url = projectUrl();
  if (!url) {
    return [];
  }
  return [
    {
      protocol: "https",
      hostname: url.hostname,
      port: url.port,
      pathname: `${PUBLIC_STORAGE_PATH}**`,
    },
  ];
}

/**
 * true si l'adresse est une image publique de notre projet, donc acceptée par
 * images.remotePatterns. Une autre adresse ferait échouer next/image : erreur au rendu en
 * développement, image cassée en production.
 */
export function isPublicSupabaseImage(src: string): boolean {
  const project = projectUrl();
  if (!project || !URL.canParse(src)) {
    return false;
  }
  const url = new URL(src);
  return (
    url.protocol === "https:" &&
    url.host === project.host &&
    url.pathname.startsWith(PUBLIC_STORAGE_PATH)
  );
}
