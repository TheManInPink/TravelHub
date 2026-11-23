import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Le plugin react compile le JSX des tests.
  plugins: [react()],
  resolve: {
    // Vite 8 lit lui-même l'alias « @/* » de tsconfig.json. Le plugin vite-tsconfig-paths
    // du guide de Next.js n'est plus utile, et Vite affiche un avertissement s'il le voit.
    tsconfigPaths: true,
    alias: {
      // Hors d'un Server Component, « server-only » lève une erreur à l'import.
      // Dans les tests, nous le remplaçons par un module vide.
      "server-only": fileURLToPath(new URL("./tests/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Les composants shadcn sont générés : nous ne les testons pas directement.
      exclude: ["src/components/ui/**"],
    },
  },
});
