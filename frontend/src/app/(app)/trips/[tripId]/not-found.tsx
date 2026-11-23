import Link from "next/link";
import { MapPinOffIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";

// Affichée quand une page d'un voyage appelle notFound(), par exemple quand Django
// répond 404 (étape 8). Django répond aussi 404 pour le voyage d'un autre utilisateur,
// pour ne pas révéler qu'il existe. Elle s'affiche dans le layout (app), sous l'en-tête.

export default function TripNotFound() {
  return (
    <EmptyState
      icon={MapPinOffIcon}
      titleAs="h1"
      title="Voyage introuvable"
      description="Ce voyage n'existe pas, a été supprimé, ou vous n'y avez pas accès."
      action={
        <Button asChild>
          <Link href="/trips">Retour à mes voyages</Link>
        </Button>
      }
    />
  );
}
