"use client";

import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLinks } from "./NavLinks";

// Menu des écrans de moins de 768 px, dans un panneau latéral (Sheet de shadcn).
// C'est un Client Component, car il garde l'état ouvert ou fermé du panneau, pour le
// fermer après un clic sur un lien. Radix gère la touche Échap et garde le focus dans
// le panneau tant qu'il est ouvert.

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir le menu">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* Le bouton de fermeture de shadcn est en anglais (« Close ») : nous mettons le nôtre. */}
      <SheetContent side="left" showCloseButton={false} className="w-72">
        <SheetHeader className="flex-row items-center justify-between">
          <SheetTitle>TravelHub</SheetTitle>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer le menu">
              <XIcon aria-hidden="true" />
            </Button>
          </SheetClose>
        </SheetHeader>
        <SheetDescription className="sr-only">Pages principales de TravelHub</SheetDescription>
        <nav aria-label="Navigation principale" className="px-2">
          <NavLinks orientation="vertical" onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
