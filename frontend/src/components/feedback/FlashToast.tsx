"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { FLASH_PARAM, flashMessage } from "@/lib/flash";

// Affiche le toast de succès d'une Server Action qui a redirigé, par exemple « Voyage
// supprimé. » sur /trips?toast=trip-deleted (voir lib/flash.ts). C'est un Client
// Component : il lit l'URL et appelle Sonner, qui vit dans le navigateur.
//
// Le layout (app) le monte une fois. useSearchParams le fait réagir à chaque navigation.

export function FlashToast() {
  const key = useSearchParams().get(FLASH_PARAM);

  useEffect(() => {
    if (key === null) {
      return;
    }
    const message = flashMessage(key);
    if (message) {
      // L'id évite un deuxième toast quand React exécute l'effet deux fois (mode strict).
      toast.success(message, { id: `flash-${key}` });
    }
    // Retire ?toast= de l'adresse sans recharger la page. Next.js suit
    // history.replaceState : un rechargement ou un lien copié ne remontre pas le toast.
    const url = new URL(window.location.href);
    url.searchParams.delete(FLASH_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [key]);

  return null;
}
