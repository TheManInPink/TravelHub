import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { firstParam } from "@/lib/searchParams";

export const metadata: Metadata = {
  title: "Connexion",
};

// Server Component : il lit ?next= et ?expired= (searchParams est une Promise depuis
// Next.js 15), puis les passe au formulaire, qui est un Client Component.

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = firstParam(params.next);
  const expired = firstParam(params.expired) === "1";
  const registerHref = next ? `/register?next=${encodeURIComponent(next)}` : "/register";

  return (
    <>
      <CardHeader>
        {/* CardTitle est une div : le h1 garde la structure des titres de la page. */}
        <CardTitle>
          <h1 className="text-xl font-semibold">Connexion</h1>
        </CardTitle>
        <CardDescription>Retrouvez vos voyages, votre itinéraire et votre budget.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} expired={expired} />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        Pas encore de compte&nbsp;?
        <Link
          href={registerHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Créer un compte
        </Link>
      </CardFooter>
    </>
  );
}
