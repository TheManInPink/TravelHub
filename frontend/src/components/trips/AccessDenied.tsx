import Link from "next/link";
import type { ReactNode } from "react";
import { LockIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";

// Écran « accès refusé » des pages d'un voyage (Server Component) : Django a répondu
// 403, ou l'utilisateur n'a pas le rôle qu'il faut, par exemple un lecteur qui ouvre
// /trips/{id}/edit à la main.

interface AccessDeniedProps {
  title?: string;
  description?: string;
  /** Lien de sortie. Par défaut, le retour à la liste des voyages. */
  action?: ReactNode;
}

export function AccessDenied({
  title = "Vous n'avez pas accès à ce voyage",
  description = "Seuls le propriétaire et les participants invités peuvent ouvrir ce voyage. Demandez au propriétaire de vous inviter.",
  action,
}: AccessDeniedProps) {
  return (
    <EmptyState
      icon={LockIcon}
      titleAs="h1"
      title={title}
      description={description}
      action={
        action ?? (
          <Button asChild>
            <Link href="/trips">Retour à mes voyages</Link>
          </Button>
        )
      }
    />
  );
}
