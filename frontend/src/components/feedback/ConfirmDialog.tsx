"use client";

import { useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { LoaderCircleIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Dialogue de confirmation avant une action qu'on ne peut pas annuler (suppression d'un
// voyage, puis d'une destination ou d'une activité à l'étape 9). C'est un Client
// Component : il garde l'état ouvert ou fermé du dialogue.
//
// AlertDialog de shadcn (Radix) garde le focus dans le dialogue, se ferme avec Échap et
// rend le focus au bouton qui l'a ouvert. Le dialogue reste ouvert pendant l'action, et
// ses boutons sont désactivés pour éviter un double envoi.

interface ConfirmDialogProps {
  /** Bouton qui ouvre le dialogue, par exemple « Supprimer ». */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  /** Texte du bouton de confirmation, par exemple « Supprimer le voyage ». */
  confirmLabel: string;
  /** Texte du bouton pendant l'action. */
  pendingLabel?: string;
  /**
   * Appelée après la confirmation. Le dialogue se ferme quand la promesse se termine.
   * Si elle redirige (Server Action), la page change et le dialogue disparaît avec elle.
   */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel = "Un instant…",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    // Sans preventDefault, Radix fermerait le dialogue tout de suite, avant la fin de
    // l'action, et l'utilisateur ne verrait pas qu'elle est en cours.
    event.preventDefault();
    startTransition(async () => {
      await onConfirm();
      setOpen(false);
    });
  }

  return (
    <AlertDialog
      open={open}
      // Échap et « Annuler » ne ferment pas le dialogue pendant l'action.
      onOpenChange={(next) => {
        if (!isPending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Annuler</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? (
              <>
                <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
