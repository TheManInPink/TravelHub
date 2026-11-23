"use client";

import Link from "next/link";
import type { ErrorInfo } from "next/error";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { errorDigest } from "@/lib/errors";
import { ErrorState } from "./ErrorState";

// Contenu commun de app/error.tsx et de app/(app)/error.tsx.
//
// En production, Next.js masque le message des erreurs levées dans un Server Component.
// error.message devient un texte générique en anglais, et seul error.digest permet de
// retrouver l'erreur dans les journaux de Vercel. Nous n'affichons donc jamais
// error.message. Les erreurs attendues (401, 403, 404, 429, délai dépassé) ne doivent
// pas arriver jusqu'ici : les pages les interceptent et les affichent avec ErrorState ou
// notFound() (étape 8). Ce composant ne voit que les erreurs imprévues.

export function RouteErrorFallback({ error, retry }: Pick<ErrorInfo, "error" | "retry">) {
  useEffect(() => {
    // En développement, la console du navigateur montre l'erreur complète.
    console.error(error);
  }, [error]);

  const digest = errorDigest(error);
  const message = digest
    ? `Une erreur inattendue est survenue. Réessayez dans un instant. Si le problème continue, notez ce code : ${digest}.`
    : "Une erreur inattendue est survenue. Réessayez dans un instant.";

  return (
    // retry() refait le rendu du segment au serveur, donc relit les données de Django.
    // reset() ne ferait que réafficher les composants, avec les mêmes données.
    <ErrorState
      title="Cette page n'a pas pu s'afficher"
      message={message}
      onRetry={retry}
      titleAs="h1"
    >
      <Button asChild variant="outline">
        <Link href="/dashboard">Retour au tableau de bord</Link>
      </Button>
    </ErrorState>
  );
}
