"use client";

import { useState } from "react";
import { ImageUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ImageUploader } from "./ImageUploader";

// Bouton « Ajouter une image » ou « Changer l'image » posé sur la couverture du voyage,
// et son dialogue d'envoi. La page ne le montre qu'au propriétaire et aux éditeurs, et
// la Server Action vérifie aussi le rôle.
//
// Radix démonte le contenu du dialogue quand il se ferme : chaque ouverture repart sans
// fichier choisi.

interface CoverImageDialogProps {
  tripId: number;
  /** true si le voyage a déjà une image : le bouton dit alors « Changer l'image ». */
  hasCover: boolean;
}

export function CoverImageDialog({ tripId, hasCover }: CoverImageDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="shadow-sm">
          <ImageUpIcon aria-hidden="true" />
          {hasCover ? "Changer l'image" : "Ajouter une image"}
        </Button>
      </DialogTrigger>
      {/* Le bouton de fermeture de shadcn a un texte anglais : le formulaire a son
          propre bouton Annuler, et Échap ferme aussi le dialogue. */}
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Image de couverture</DialogTitle>
          <DialogDescription>
            Elle s&apos;affiche en haut du voyage et sur sa carte, pour tous les participants.
            {hasCover ? " La nouvelle image remplace l'image actuelle." : null}
          </DialogDescription>
        </DialogHeader>
        <ImageUploader
          tripId={tripId}
          onSuccess={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
