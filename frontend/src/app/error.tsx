"use client";

import type { ErrorInfo } from "next/error";
import { RouteErrorFallback } from "@/components/feedback/RouteErrorFallback";

// Frontière d'erreur générale, dans le layout racine. Elle attrape les erreurs des
// layouts (app) et (auth), que app/(app)/error.tsx ne couvre pas, car un error.tsx ne
// protège pas le layout de son propre dossier. Une erreur du layout racine va dans
// global-error.tsx.
//
// En production, Next.js masque le message des erreurs levées dans un Server Component :
// seul error.digest arrive ici. Les erreurs attendues (401, 403, 404, 429, délai dépassé)
// sont donc interceptées dans les pages et affichées avec ErrorState ou notFound()
// (étape 8).

export default function RootError({ error, retry }: Pick<ErrorInfo, "error" | "retry">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <RouteErrorFallback error={error} retry={retry} />
    </main>
  );
}
