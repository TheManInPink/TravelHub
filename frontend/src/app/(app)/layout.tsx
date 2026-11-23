import { Suspense } from "react";
import { FlashToast } from "@/components/feedback/FlashToast";
import { UserMenuSkeleton } from "@/components/feedback/Skeletons";
import { Header } from "@/components/layout/Header";
import { UserMenuSlot } from "@/components/layout/UserMenuSlot";

// Layout des pages protégées (tableau de bord, voyages) : en-tête, puis le contenu dans
// un conteneur de 72 rem au plus, avec des marges qui grandissent avec l'écran.
//
// Le layout n'attend pas Django : UserMenuSlot charge l'utilisateur sous Suspense, et
// le squelette tient sa place. La vérification de la session se fait dans chaque page
// (verifySession()), car le layout n'est pas réexécuté à chaque navigation.

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
      <Header
        userMenu={
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenuSlot />
          </Suspense>
        }
      />
      <main
        id="contenu"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 outline-none sm:px-6 sm:py-8 lg:px-8"
      >
        {children}
      </main>
      {/* Toast de succès après une Server Action qui redirige (?toast=…). Suspense :
          useSearchParams ne doit pas bloquer le rendu du layout. */}
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
    </>
  );
}
