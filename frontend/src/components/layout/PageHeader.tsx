import type { ReactNode } from "react";

// En-tête d'une page protégée : le h1, une description et les actions de la page.
// Sur mobile, les actions passent sous le titre.

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Boutons à droite du titre, par exemple « Nouveau voyage ». */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          {title}
        </h1>
        {description ? <p className="text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
