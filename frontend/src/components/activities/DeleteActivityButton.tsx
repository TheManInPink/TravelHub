"use client";

import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteActivityAction } from "@/actions/activities";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { Button } from "@/components/ui/button";
import type { GqlId } from "@/types/graphql";

// Bouton « Supprimer » d'une activité, sur la page de sa destination. La page ne
// l'affiche qu'au propriétaire et aux éditeurs, et Django vérifie aussi. Il demande une
// confirmation, puis appelle la Server Action deleteActivityAction.
//
// L'action ne redirige pas : elle rafraîchit la page, et l'activité disparaît de la liste.

interface DeleteActivityButtonProps {
  destinationId: GqlId;
  activityId: GqlId;
  activityName: string;
}

export function DeleteActivityButton({
  destinationId,
  activityId,
  activityName,
}: DeleteActivityButtonProps) {
  async function handleConfirm() {
    const result = await deleteActivityAction(destinationId, activityId);
    if (result.ok) {
      toast.success("Activité supprimée.");
    } else {
      toast.error(result.message);
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Supprimer l'activité « ${activityName} »`}
          className="text-destructive hover:text-destructive"
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      }
      title={`Supprimer « ${activityName} » ?`}
      description="L'activité sera supprimée pour tous les participants du voyage. Cette action est définitive."
      confirmLabel="Supprimer l'activité"
      pendingLabel="Suppression…"
      onConfirm={handleConfirm}
    />
  );
}
