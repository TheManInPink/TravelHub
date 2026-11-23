import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Avertissement discret dans un bloc de la page : la météo d'une ville introuvable, une
// fiche pays indisponible. Contrairement à ErrorState, il ne propose pas de nouvel
// essai, car réessayer ne changerait rien. Server Component, sans état.

interface NoticeProps {
  icon: LucideIcon;
  title: string;
  /** Explication, et parfois un lien (« Modifier la destination »). */
  children: ReactNode;
  /** h3 sous le titre d'une section (h2), qui est le cas le plus courant. */
  titleAs?: "h2" | "h3" | "h4";
}

export function Notice({ icon: Icon, title, children, titleAs: Title = "h3" }: NoticeProps) {
  return (
    <div className="flex gap-3 rounded-xl border bg-muted/40 p-4">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        <Title className="font-semibold text-balance">{title}</Title>
        <div className="flex flex-col gap-2 text-pretty text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
