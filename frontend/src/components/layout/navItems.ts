import { LayoutDashboardIcon, MapIcon, PlusIcon, type LucideIcon } from "lucide-react";

// Liens de la navigation principale, partagés par MainNav (écran large) et MobileNav.

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboardIcon },
  { href: "/trips", label: "Mes voyages", icon: MapIcon },
  { href: "/trips/new", label: "Nouveau voyage", icon: PlusIcon },
];

/**
 * Adresse du lien à marquer comme actif : le plus long préfixe du chemin. Ainsi /trips/new
 * active « Nouveau voyage », alors que /trips/3 et /trips/3/edit activent « Mes voyages ».
 */
export function activeNavHref(
  pathname: string,
  items: readonly NavItem[] = NAV_ITEMS,
): string | null {
  let active: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (active === null || href.length > active.length)) {
      active = href;
    }
  }
  return active;
}
