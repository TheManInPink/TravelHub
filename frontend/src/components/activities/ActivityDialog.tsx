"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { DateRange } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import type { GqlActivity, GqlId } from "@/types/graphql";
import { ActivityForm } from "./ActivityForm";

// Dialogue d'ajout ou de modification d'une activité, sur la page d'une destination.
// C'est un Client Component : il garde l'état ouvert ou fermé du dialogue.
//
// Radix démonte le contenu du dialogue quand il se ferme. Le formulaire repart donc de
// ses valeurs par défaut à chaque ouverture : vide pour un ajout, l'activité à jour
// pour une modification.

interface ActivityDialogProps {
  destinationId: GqlId;
  /** Arrivée et départ de la destination. */
  stay: DateRange;
  /** Activité à modifier. Sans elle, le dialogue ajoute une activité. */
  activity?: GqlActivity;
}

export function ActivityDialog({ destinationId, stay, activity }: ActivityDialogProps) {
  const [open, setOpen] = useState(false);

  function handleSuccess() {
    setOpen(false);
    toast.success(activity ? "Activité modifiée." : "Activité ajoutée.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {activity ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Modifier l'activité « ${activity.name} »`}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden="true" />
            Ajouter une activité
          </Button>
        )}
      </DialogTrigger>
      {/* Le bouton de fermeture de shadcn a un texte anglais : le formulaire a son
          propre bouton Annuler, et Échap ferme aussi le dialogue. */}
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{activity ? "Modifier l'activité" : "Ajouter une activité"}</DialogTitle>
          <DialogDescription>
            La date doit tomber pendant le séjour, {formatDateRange(stay.start, stay.end)}.
          </DialogDescription>
        </DialogHeader>
        <ActivityForm
          destinationId={destinationId}
          stay={stay}
          activity={activity}
          onSuccess={handleSuccess}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
