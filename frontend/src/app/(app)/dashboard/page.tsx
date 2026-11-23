import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

// Page provisoire, pour voir le layout et ses états. L'étape 7 y affichera les
// compteurs et les prochains voyages, lus dans Django.

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vos prochains voyages et vos statistiques, en un coup d'œil."
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
