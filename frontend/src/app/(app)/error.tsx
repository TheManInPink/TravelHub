"use client";

import type { ErrorInfo } from "next/error";
import { RouteErrorFallback } from "@/components/feedback/RouteErrorFallback";

// Frontière d'erreur des pages protégées. Next.js impose un Client Component.
// Elle remplace la page qui a échoué, mais l'en-tête du layout (app) reste affiché.
// Une erreur du layout (app) lui-même n'arrive pas ici : app/error.tsx la reçoit.
//
// En production, Next.js masque le message des erreurs levées dans un Server Component :
// seul error.digest arrive ici. Les erreurs attendues (401, 403, 404, 429, délai dépassé)
// sont donc interceptées dans les pages et affichées avec ErrorState ou notFound()
// (étape 8). Ce fichier ne reçoit que les erreurs imprévues.

export default function AppError({ error, retry }: Pick<ErrorInfo, "error" | "retry">) {
  return <RouteErrorFallback error={error} retry={retry} />;
}
