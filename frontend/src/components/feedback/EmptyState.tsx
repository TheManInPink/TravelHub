import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// État vide : une liste sans élément, une page sans contenu. Server Component, car il
// n'a ni état ni événement. L'action est un lien ou un bouton passé par la page.

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Lien ou bouton qui propose la suite, par exemple « Créer un voyage ». */
  action?: ReactNode;
  /** Niveau du titre. h2 sous le titre d'une page, h1 quand l'état vide est toute la page. */
  titleAs?: "h1" | "h2" | "h3";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  titleAs: Title = "h2",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>
      <div className="flex max-w-md flex-col gap-1">
        <Title className="text-lg font-semibold text-balance">{title}</Title>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
