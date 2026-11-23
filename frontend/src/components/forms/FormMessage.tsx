import type { ReactNode } from "react";
import { CircleAlertIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Message global au-dessus d'un formulaire : l'erreur renvoyée par la Server Action, ou
// une information comme « Votre session a expiré ». Une erreur est annoncée tout de
// suite par les lecteurs d'écran (role="alert"), une information plus discrètement.

interface FormMessageProps {
  variant: "error" | "info";
  children: ReactNode;
}

export function FormMessage({ variant, children }: FormMessageProps) {
  const Icon = variant === "error" ? CircleAlertIcon : InfoIcon;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        variant === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border bg-muted text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
