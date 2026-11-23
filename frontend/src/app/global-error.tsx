"use client";

import type { ErrorInfo } from "next/error";
import { Button } from "@/components/ui/button";
import { errorDigest } from "@/lib/errors";
import "./globals.css";

// Dernier recours, quand le layout racine lui-même échoue. Ce fichier remplace alors
// tout le document : il écrit ses propres <html> et <body> et importe les styles
// globaux. C'est un Client Component, donc il n'accepte pas d'export metadata : la
// balise <title> de React donne le titre de l'onglet.

export default function GlobalError({ error, retry }: Pick<ErrorInfo, "error" | "retry">) {
  const digest = errorDigest(error);

  return (
    <html lang="fr">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center font-sans antialiased">
        <title>Erreur · TravelHub</title>
        <h1 className="text-2xl font-semibold">TravelHub a rencontré un problème</h1>
        <p className="max-w-md text-pretty text-muted-foreground">
          L&apos;application n&apos;a pas pu s&apos;afficher. Réessayez dans un instant.
        </p>
        {digest ? (
          <p className="text-xs text-muted-foreground">Code de l&apos;erreur : {digest}</p>
        ) : null}
        <Button type="button" onClick={() => retry()}>
          Réessayer
        </Button>
      </body>
    </html>
  );
}
