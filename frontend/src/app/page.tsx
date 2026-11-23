import Link from "next/link";
import { CloudSunIcon, MapPinIcon, PlaneIcon, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Page d'accueil publique. Elle ne lit ni cookie ni donnée, donc Next.js la génère
// une seule fois au build (rendu statique).

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const features: Feature[] = [
  {
    icon: PlaneIcon,
    title: "Vos voyages",
    description:
      "Créez un voyage avec ses dates et son budget, puis invitez vos compagnons de route.",
  },
  {
    icon: MapPinIcon,
    title: "Un itinéraire clair",
    description:
      "Ajoutez les destinations dans l'ordre et planifiez les activités de chaque journée.",
  },
  {
    icon: CloudSunIcon,
    title: "Météo et pays",
    description:
      "Consultez les prévisions de chaque destination et la fiche de son pays avant de partir.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-4 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          TravelHub
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Planifiez vos voyages, étape par étape
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          TravelHub réunit vos destinations, vos activités et votre budget au même endroit.
          Vous voyez d&apos;un coup d&apos;œil ce qui vous attend, jour après jour.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/login">Se connecter</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/register">Créer un compte</Link>
          </Button>
        </div>
      </section>

      <section aria-label="Fonctionnalités" className="grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <Icon aria-hidden="true" className="mb-2 size-6 text-primary" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
