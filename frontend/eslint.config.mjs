import { defineConfig, globalIgnores } from "eslint/config";
import eslintReact from "@eslint-react/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import { importX } from "eslint-plugin-import-x";
import jsxA11yX from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// Nous reprenons les règles de eslint-config-next 16.4 (core-web-vitals et typescript).
// Ses plugins react, import et jsx-a11y n'acceptent pas ESLint 10, donc nous utilisons
// des plugins qui l'acceptent : @eslint-react, import-x et jsx-a11y-x.
const sourceFiles = ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"];

/** Sélecteur de process.env.NOM et de process.env["NOM"]. */
function envVariable(name) {
  return `MemberExpression[object.property.name='env']:matches([property.name='${name}'], [property.value='${name}'])`;
}

const DJANGO_URL_RULE = {
  selector: envVariable("DJANGO_API_URL"),
  message:
    "Seuls les modules de src/lib/api/ appellent Django. Utilisez djangoFetch() ou gqlFetch().",
};

const SUPABASE_KEY_RULE = {
  selector: envVariable("SUPABASE_SECRET_KEY"),
  message:
    "Seul src/lib/supabase/server.ts lit la clé secrète de Supabase. Utilisez getSupabase().",
};

export default defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Rapport HTML de « vitest run --coverage », généré.
    "coverage/**",
    // Rapports et traces de Playwright, générés.
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
  {
    name: "travelhub/globals",
    files: sourceFiles,
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // TypeScript, comme eslint-config-next/typescript.
  tseslint.configs.recommended,
  {
    name: "travelhub/typescript",
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
    },
  },

  // React, les règles des hooks et celles de Next.js (dont les Core Web Vitals).
  { ...eslintReact.configs["recommended-typescript"], files: sourceFiles },
  { ...reactHooks.configs.flat.recommended, files: sourceFiles },
  {
    // Les règles des hooks viennent du plugin officiel de React, comme dans
    // eslint-config-next. Nous coupons leurs doublons dans @eslint-react, sinon
    // chaque erreur serait signalée deux fois.
    name: "travelhub/hooks-sans-doublons",
    files: sourceFiles,
    rules: {
      "@eslint-react/error-boundaries": "off",
      "@eslint-react/exhaustive-deps": "off",
      "@eslint-react/purity": "off",
      "@eslint-react/rules-of-hooks": "off",
      "@eslint-react/set-state-in-effect": "off",
      "@eslint-react/set-state-in-render": "off",
      "@eslint-react/static-components": "off",
      "@eslint-react/unsupported-syntax": "off",
      "@eslint-react/use-memo": "off",
    },
  },
  { ...nextPlugin.configs["core-web-vitals"], files: sourceFiles },

  // Accessibilité et imports : les mêmes règles que eslint-config-next.
  {
    name: "travelhub/accessibilite-et-imports",
    files: sourceFiles,
    plugins: {
      "jsx-a11y-x": jsxA11yX,
      "import-x": importX,
    },
    rules: {
      "import-x/no-anonymous-default-export": "warn",
      "jsx-a11y-x/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y-x/aria-props": "warn",
      "jsx-a11y-x/aria-proptypes": "warn",
      "jsx-a11y-x/aria-unsupported-elements": "warn",
      "jsx-a11y-x/role-has-required-aria-props": "warn",
      "jsx-a11y-x/role-supports-aria-props": "warn",
    },
  },

  // Qualité : aucun any, et aucun console.log oublié. console.warn et console.error restent
  // permis : au serveur, ils écrivent dans les journaux de Vercel. no-explicit-any vient
  // déjà de tseslint.configs.recommended, nous la gardons visible ici.
  {
    name: "travelhub/qualite",
    files: sourceFiles,
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },

  // Seuls les modules de src/lib/api/ appellent Django, et seul src/lib/supabase/ lit la
  // clé secrète de Supabase. Ailleurs, lire ces variables est une erreur.
  // Pour une même règle, le dernier bloc qui vise un fichier remplace les autres. Chaque
  // fichier ne tombe donc que dans un des trois blocs.
  {
    name: "travelhub/variables-serveur",
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/api/**", "src/lib/supabase/**"],
    rules: { "no-restricted-syntax": ["error", DJANGO_URL_RULE, SUPABASE_KEY_RULE] },
  },
  {
    name: "travelhub/variables-serveur-lib-api",
    files: ["src/lib/api/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", SUPABASE_KEY_RULE] },
  },
  {
    name: "travelhub/variables-serveur-lib-supabase",
    files: ["src/lib/supabase/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", DJANGO_URL_RULE] },
  },

  // Fichiers générés par shadcn, que nous ne modifions pas à la main.
  {
    name: "travelhub/shadcn",
    files: ["src/components/ui/**"],
    rules: {
      "@eslint-react/no-array-index-key": "off",
    },
  },
]);
