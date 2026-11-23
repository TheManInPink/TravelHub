import Image from "next/image";
import { PlaneIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Image de couverture d'un voyage (Server Component). Sans image, un fond neutre avec
// une icône garde la même place, pour que toutes les cartes aient la même hauteur.
//
// L'image vient de Supabase Storage (cover_image_url, vérifiée par Django). L'étape 11
// déclare l'hôte de Supabase dans images.remotePatterns de next.config.ts. D'ici là,
// unoptimized fait charger l'image telle quelle, sans passer par l'optimiseur de
// Next.js, qui refuserait un hôte non déclaré.

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
      {url ? (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={sizes}
          preload={preload}
          unoptimized
          className="object-cover"
        />
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
