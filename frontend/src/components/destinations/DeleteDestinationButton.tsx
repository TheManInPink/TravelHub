"use client";

import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteDestinationAction } from "@/actions/destinations";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { GqlId } from "@/types/graphql";

// Bouton « Supprimer » de la page d'une destination, pour le propriétaire et les
// éditeurs (Django vérifie aussi). Il demande une confirmation, puis appelle la Server
// Action deleteDestinationAction.

interface DeleteDestinationButtonProps {
  destinationId: GqlId;
  city: string;
}

export function DeleteDestinationButton({ destinationId, city }: DeleteDestinationButtonProps) {
  async function handleConfirm() {
    // En cas de succès, l'action redirige vers le voyage, où FlashToast affiche
    // « Destination supprimée. ». La suite ne s'exécute donc qu'en cas d'erreur.
    const failure = await deleteDestinationAction(destinationId);
    toast.error(failure.message);
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive">
          <Trash2Icon aria-hidden="true" />
          Supprimer
        </Button>
      }
      title={`Supprimer « ${city} » ?`}
      description="La destination et ses activités seront supprimées pour tous les participants du voyage. Cette action est définitive."
      confirmLabel="Supprimer la destination"
      pendingLabel="Suppression…"
      onConfirm={handleConfirm}
    />
  );
}
