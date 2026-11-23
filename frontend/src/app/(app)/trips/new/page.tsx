import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { PageHeader } from "@/components/layout/PageHeader";
import { TripForm } from "@/components/trips/TripForm";
import { Card, CardContent } from "@/components/ui/card";
import { verifySession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Nouveau voyage",
};

// Création d'un voyage. La page (Server Component) vérifie la session, puis affiche
// TripForm, un Client Component. L'envoi passe par la Server Action createTripAction
// (POST /api/trips/), qui redirige vers le détail du nouveau voyage.

export default async function NewTripPage() {
  await verifySession();

  return (
    <>
      <Breadcrumbs
        items={[{ label: "Mes voyages", href: "/trips" }, { label: "Nouveau voyage" }]}
      />
      <PageHeader
        title="Nouveau voyage"
        description="Vous en serez le propriétaire. Vous ajouterez les destinations ensuite."
      />
      <Card className="w-full max-w-2xl">
        <CardContent>
          <TripForm />
        </CardContent>
      </Card>
    </>
  );
}
