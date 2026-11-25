import Image from "next/image";
import { PlaneIcon } from "lucide-react";
import { isPublicSupabaseImage } from "@/lib/supabase/images";
import { cn } from "@/lib/utils";

// Image de couverture d'un voyage (Server Component). L'image vient du bucket public de
// Supabase Storage (cover_image_url, vérifiée par Django). next/image la redimensionne
// et la convertit en WebP selon sizes, grâce à images.remotePatterns de next.config.ts.
//
// Sans image, l'image par défaut (un dégradé avec un avion) garde la même place, pour
// que toutes les cartes aient la même hauteur. Nous la montrons aussi pour une adresse
// d'un autre hôte : next/image la refuserait (erreur en développement, image cassée en
// production). Cela arrive seulement si Django n'a pas SUPABASE_STORAGE_HOST.
//
// isPublicSupabaseImage lit SUPABASE_URL, qui n'existe que sur le serveur : ce composant
// doit rester un Server Component.

interface TripCoverProps {
  /** cover_image_url du voyage : une adresse https, ou une chaîne vide sans image. */
  url: string;
  /** Texte de remplacement. Vide quand le titre du voyage est juste à côté. */
  alt: string;
  /** Largeur affichée, pour que le navigateur choisisse la bonne taille d'image. */
  sizes: string;
  /** true pour l'image du haut de la page : le navigateur la charge en priorité. */
  preload?: boolean;
  className?: string;
}

export function TripCover({ url, alt, sizes, preload = false, className }: TripCoverProps) {
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {url && isPublicSupabaseImage(url) ? (
        <Image src={url} alt={alt} fill sizes={sizes} preload={preload} className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex size-full items-center justify-center bg-linear-to-br from-muted to-secondary"
        >
          <PlaneIcon className="size-8 text-muted-foreground/60" />
        </div>
      )}
    </div>
  );
}
