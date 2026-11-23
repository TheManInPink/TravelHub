// Adresse publique du site. Next.js s'en sert comme base des liens absolus des
// métadonnées (metadataBase), par exemple pour og:image et les liens canoniques.
// NEXT_PUBLIC_SITE_URL est figée au moment du build : sur Vercel, il faut redéployer
// après l'avoir changée.

const LOCAL_SITE_URL = "http://localhost:3000";

export function siteUrl(): URL {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim() || LOCAL_SITE_URL;
  const url = URL.canParse(value) ? new URL(value) : null;
  // Sans https://, new URL() échouerait au milieu du build avec un message peu clair.
  // « localhost:3000 » passe new URL(), mais avec le protocole « localhost: ».
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL doit être une adresse complète, par exemple https://travelhub-uqar.vercel.app (valeur reçue : ${value}).`,
    );
  }
  return url;
}
