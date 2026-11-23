import Link from "next/link";
import { MapPinOffIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";

// Affichée quand une page d'une destination appelle notFound() : destination supprimée,
// identifiant inconnu, destination d'un autre voyage que celui de l'adresse, ou voyage
// où l'utilisateur n'est pas invité (Django répond not_found, sans dire qu'il existe).
// Sans ce fichier, Next.js afficherait « Voyage introuvable » (trips/[tripId]).

export default function DestinationNotFound() {
  return (
    <EmptyState
      icon={MapPinOffIcon}
      titleAs="h1"
      title="Destination introuvable"
      description="Cette destination n'existe pas, a été supprimée, ou vous n'avez pas accès à son voyage."
      action={
        <Button asChild>
          <Link href="/trips">Retour à mes voyages</Link>
        </Button>
      }
    />
  );
}
