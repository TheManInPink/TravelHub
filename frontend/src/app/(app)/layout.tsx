import { Header } from "@/components/layout/Header";
import { UserMenu, type MenuUser } from "@/components/layout/UserMenu";

// Layout des pages protégées (tableau de bord, voyages) : en-tête, puis le contenu dans
// un conteneur de 72 rem au plus, avec des marges qui grandissent avec l'écran.

// Provisoire : l'étape 4 remplace cet utilisateur fictif par le compte lu dans Django.
const PLACEHOLDER_USER: MenuUser = {
  username: "alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Martin",
};

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      {/* Lien d'évitement : au clavier, la première tabulation permet de sauter l'en-tête. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:shadow-md focus:ring-3 focus:ring-ring/50"
      >
        Aller au contenu
      </a>
      <Header userMenu={<UserMenu user={PLACEHOLDER_USER} />} />
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
      >
        {children}
      </main>
    </>
  );
}
