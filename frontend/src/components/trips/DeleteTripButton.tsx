"use client";

import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteTripAction } from "@/actions/trips";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Button } from "@/components/ui/button";

// Bouton « Supprimer » du détail d'un voyage, réservé au propriétaire (la page ne
// l'affiche que pour my_role = owner, et Django vérifie aussi). Il demande une
// confirmation, puis appelle la Server Action deleteTripAction.

interface DeleteTripButtonProps {
  tripId: number;
  tripTitle: string;
}

export function DeleteTripButton({ tripId, tripTitle }: DeleteTripButtonProps) {
  async function handleConfirm() {
    // En cas de succès, deleteTripAction redirige vers /trips, où FlashToast affiche
    // « Voyage supprimé. ». La suite ne s'exécute donc qu'en cas d'erreur.
    const failure = await deleteTripAction(tripId);
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
      title={`Supprimer « ${tripTitle} » ?`}
      description="Le voyage, ses destinations et ses activités seront supprimés pour tous les participants. Cette action est définitive."
      confirmLabel="Supprimer le voyage"
      pendingLabel="Suppression…"
      onConfirm={handleConfirm}
    />
  );
}
