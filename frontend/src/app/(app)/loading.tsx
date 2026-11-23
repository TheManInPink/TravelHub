import { ListSkeleton, PageHeaderSkeleton } from "@/components/feedback/Skeletons";

// Affiché par Next.js dès le clic sur un lien, pendant que le serveur prépare la page
// protégée. L'en-tête du layout reste visible : seul le contenu est remplacé.

export default function AppLoading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement de la page…</span>
      <PageHeaderSkeleton />
      <ListSkeleton count={3} />
    </div>
  );
}
