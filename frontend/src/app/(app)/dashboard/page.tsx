import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { verifySession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

// Page provisoire. L'étape 7 y affichera les compteurs et les prochains voyages, lus
// dans Django.

export default async function DashboardPage() {
  // Toujours en premier dans une page protégée : c'est la vraie vérification de la
  // session. Sans compte valide, verifySession() redirige vers la connexion.
  const user = await verifySession();

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description={`Bonjour ${user.first_name || user.username}, voici vos prochains voyages.`}
        actions={
          <Button asChild>
            <Link href="/trips/new">
              <PlusIcon aria-hidden="true" />
              Nouveau voyage
            </Link>
          </Button>
        }
      />
      <EmptyState
        icon={LayoutDashboardIcon}
        title="Votre tableau de bord arrive bientôt"
        description="Vous y verrez vos prochains voyages, leur budget et le nombre de destinations."
      />
    </>
  );
}
