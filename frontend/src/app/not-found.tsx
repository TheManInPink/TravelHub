import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { Button } from "@/components/ui/button";

// Page 404 générale : une adresse qui ne correspond à aucune route, ou un notFound()
// sans not-found.tsx plus proche. Elle s'affiche dans le layout racine, sans l'en-tête.

export const metadata: Metadata = {
  title: "Page introuvable",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <EmptyState
        icon={CompassIcon}
        titleAs="h1"
        title="Page introuvable"
        description="Cette adresse ne correspond à aucune page de TravelHub. Vérifiez le lien, ou repartez d'une page connue."
        action={
          <>
            <Button asChild>
              <Link href="/dashboard">Tableau de bord</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Accueil</Link>
            </Button>
          </>
        }
      />
    </main>
  );
}
