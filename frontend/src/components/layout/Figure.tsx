import type { ReactNode } from "react";

// Un chiffre clé et son libellé, dans une liste <dl> : le budget d'un voyage, le nombre
// d'activités d'une destination. Server Component, sans état.

interface FigureProps {
  label: string;
  children: ReactNode;
}

export function Figure({ label, children }: FigureProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
