import { DetailSkeleton, PageHeaderSkeleton } from "@/components/feedback/Skeletons";

// Affiché pendant le chargement d'un voyage et de ses pages (modification, puis
// destinations à l'étape 9). Il a la forme d'une page de détail, pas celle d'une liste.

export default function TripLoading() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Chargement du voyage…</span>
      <PageHeaderSkeleton />
      <DetailSkeleton />
    </div>
  );
}
