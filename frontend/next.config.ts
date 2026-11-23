import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En développement, le terminal de `npm run dev` affiche chaque appel du serveur à
  // Django avec son adresse complète, par exemple les POST vers /graphql/. Cela montre
  // que GraphQL passe par le serveur Next.js et jamais par le navigateur.
  logging: {
    // Next.js 16 écrit aussi les arguments de chaque Server Action, donc le mot de passe
    // de loginAction et de registerAction. Nous désactivons ce journal.
    serverFunctions: false,
    fetches: {
      fullUrl: true,
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
