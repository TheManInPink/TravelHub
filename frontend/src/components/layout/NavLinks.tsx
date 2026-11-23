"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, activeNavHref } from "./navItems";

// Liste des liens de navigation. C'est un Client Component, car usePathname() lit l'adresse
// courante dans le navigateur pour marquer le lien actif (aria-current="page").

interface NavLinksProps {
  orientation: "horizontal" | "vertical";
  /** Appelée quand un lien lance une navigation, par exemple pour fermer le menu mobile. */
  onNavigate?: () => void;
}

export function NavLinks({ orientation, onNavigate }: NavLinksProps) {
  const pathname = usePathname();
  const active = activeNavHref(pathname);

  return (
    <ul className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "items-center")}>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = href === active;
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              onNavigate={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
