import Link from "next/link";
import type { ReactNode } from "react";
import { PlaneIcon } from "lucide-react";
import { MainNav } from "./MainNav";
import { MobileNav } from "./MobileNav";

// En-tête des pages protégées : menu mobile, logo, navigation et menu du compte.
// Le menu du compte arrive en props (userMenu), pour que le layout décide comment
// le charger. À l'étape 4, c'est un Suspense qui attend la réponse de Django.

export function Header({ userMenu }: { userMenu: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <MobileNav />
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-1 font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <PlaneIcon aria-hidden="true" className="size-5 text-primary" />
          TravelHub
        </Link>
        <div className="ml-4">
          <MainNav />
        </div>
        <div className="ml-auto">{userMenu}</div>
      </div>
    </header>
  );
}
