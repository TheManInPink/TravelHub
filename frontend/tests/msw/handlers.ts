import type { AnyHandler } from "msw";

// Réponses par défaut de l'API Django simulée. La liste est vide pour l'instant :
// l'étape 3 (couche d'accès aux données) ajoute les routes REST et GraphQL.
// Un test peut aussi remplacer une réponse avec server.use(...).
export const handlers: AnyHandler[] = [];
