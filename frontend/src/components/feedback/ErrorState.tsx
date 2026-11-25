"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// Erreur affichée à la place du contenu, avec un bouton Réessayer.
// C'est un Client Component, car le bouton réagit au clic. Les pages (Server Components)
// l'utilisent pour les erreurs attendues de Django (délai dépassé, 429, 503), et les
// fichiers error.tsx pour les erreurs imprévues.

interface ErrorStateProps {
  title?: string;
  /** Message en français, en général celui de toUserMessage(). */
  message: string;
  /**
   * Appelée par le bouton Réessayer, par exemple retry() dans error.tsx. Sans elle, le
   * bouton appelle router.refresh(), qui refait le rendu de la page au serveur et relit
   * donc les données de Django.
   */
  onRetry?: () => void;
  /**
   * X-Request-ID de la requête qui a échoué (errorReference). L'utilisateur peut le
   * copier et nous le donner : une recherche de cette valeur dans les journaux de Render
   * ou de Vercel retrouve la requête.
   */
  reference?: string;
  /** Liens en plus, par exemple « Retour au tableau de bord ». */
  children?: ReactNode;
  titleAs?: "h1" | "h2" | "h3";
}

export function ErrorState({
  title = "Une erreur est survenue",
  message,
  onRetry,
  reference,
  children,
  titleAs: Title = "h2",
}: ErrorStateProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRetry() {
    // Dans une transition, l'erreur reste affichée pendant le nouvel essai, et isPending
    // désactive le bouton pour éviter les doubles clics.
    startTransition(() => {
      if (onRetry) {
        onRetry();
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
      <TriangleAlertIcon aria-hidden="true" className="size-8 text-destructive" />
      {/* role="alert" fait lire le message par les lecteurs d'écran dès son affichage. */}
      <div role="alert" className="flex max-w-md flex-col gap-1">
        <Title className="text-lg font-semibold text-balance">{title}</Title>
        <p className="text-sm text-pretty text-muted-foreground">{message}</p>
      </div>
      {/* Hors de l'alerte : un lecteur d'écran ne lit pas l'identifiant à chaque erreur. */}
      {reference ? (
        <p className="max-w-md text-xs text-muted-foreground">
          Référence de l'erreur :{" "}
          <code className="font-mono break-all select-all">{reference}</code>
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={handleRetry} disabled={isPending}>
          <RotateCwIcon aria-hidden="true" className={isPending ? "animate-spin" : undefined} />
          {isPending ? "Nouvel essai…" : "Réessayer"}
        </Button>
        {children}
      </div>
    </div>
  );
}
