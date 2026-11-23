import Link from "next/link";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { userDisplayName, userInitials } from "@/lib/format";
import type { User } from "@/types/api";

// Menu du compte, à droite de l'en-tête : initiales, nom, courriel et Déconnexion.
// Server Component : le menu déroulant de shadcn est un Client Component, mais nous
// pouvons le composer ici sans "use client". L'utilisateur arrive en props.

export type MenuUser = Pick<User, "username" | "email" | "first_name" | "last_name">;

export function UserMenu({ user }: { user: MenuUser }) {
  const name = userDisplayName(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Sur mobile, le nom est caché : aria-label garde un nom accessible au bouton. */}
        <Button
          variant="ghost"
          className="h-9 gap-2 px-1.5 sm:px-2"
          aria-label={`${name}, menu du compte`}
        >
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {userInitials(user)}
          </span>
          <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">{name}</span>
          <span className="truncate text-xs font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Provisoire : l'étape 4 remplace ce lien par la Server Action logout(). */}
        <DropdownMenuItem asChild>
          <Link href="/">
            <LogOutIcon aria-hidden="true" />
            Déconnexion
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
