import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { firstParam } from "@/lib/searchParams";

export const metadata: Metadata = {
  title: "Créer un compte",
};

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const params = await searchParams;
  const next = firstParam(params.next);
  const expired = firstParam(params.expired) === "1";
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold">Créer un compte</h1>
        </CardTitle>
        <CardDescription>
          Un compte suffit pour planifier vos voyages et inviter vos compagnons de route.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RegisterForm next={next} expired={expired} />
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        Déjà un compte&nbsp;?
        <Link
          href={loginHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Se connecter
        </Link>
      </CardFooter>
    </>
  );
}
