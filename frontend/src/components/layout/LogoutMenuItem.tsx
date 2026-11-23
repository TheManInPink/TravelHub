"use client";

import { useTransition } from "react";
import { LoaderCircleIcon, LogOutIcon } from "lucide-react";
import { logout } from "@/actions/auth";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

// Élément « Déconnexion » du menu du compte. C'est le seul morceau client du UserMenu :
// il réagit à la sélection et appelle la Server Action logout(), qui révoque le refresh
// dans Django, supprime les cookies et redirige vers /login.

export function LogoutMenuItem() {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event) => {
        // Le menu reste ouvert pendant l'appel, pour afficher « Déconnexion… ».
        event.preventDefault();
        startTransition(async () => {
          await logout();
        });
      }}
    >
      {isPending ? (
        <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
      ) : (
        <LogOutIcon aria-hidden="true" />
      )}
      {isPending ? "Déconnexion…" : "Déconnexion"}
    </DropdownMenuItem>
  );
}
