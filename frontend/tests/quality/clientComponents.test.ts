// @vitest-environment node
// Les fichiers "use client" de src/ et la raison de chacun (exigence EF-10). Ce tableau
// sert de source au rapport. Un nouveau fichier "use client" fait échouer le test tant
// que sa raison n'est pas écrite ici, et un fichier qui redevient un Server Component
// doit sortir de la liste.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

/** Dossier des composants générés par shadcn, que nous ne modifions pas à la main. */
const SHADCN_DIR = "components/ui/";

const FORM_REASON =
  "React Hook Form garde l'état des champs, et zodResolver valide avec le schéma de la Server Action avant l'envoi.";
const DELETE_REASON =
  "Passe une fonction onConfirm à ConfirmDialog et affiche un toast si l'action échoue. Une fonction ne peut pas venir d'un Server Component.";
const ERROR_BOUNDARY_REASON = "Frontière d'erreur : Next.js impose un Client Component.";

/** Chemin depuis src/ → raison du "use client". */
const CLIENT_COMPONENTS: Readonly<Record<string, string>> = {
  "app/(app)/error.tsx": ERROR_BOUNDARY_REASON,
  "app/error.tsx": `${ERROR_BOUNDARY_REASON} Elle attrape aussi les erreurs des layouts (app) et (auth).`,
  "app/global-error.tsx": `${ERROR_BOUNDARY_REASON} Elle remplace tout le document si le layout racine échoue.`,
  "components/activities/ActivityDialog.tsx": "État ouvert ou fermé du dialogue d'activité.",
  "components/activities/ActivityForm.tsx": FORM_REASON,
  "components/activities/DeleteActivityButton.tsx": DELETE_REASON,
  "components/auth/LoginForm.tsx": `${FORM_REASON} Le bouton est désactivé pendant l'envoi.`,
  "components/auth/RegisterForm.tsx": `${FORM_REASON} Le bouton est désactivé pendant l'envoi.`,
  "components/destinations/DeleteDestinationButton.tsx": DELETE_REASON,
  "components/destinations/DestinationForm.tsx": FORM_REASON,
  "components/enrichment/WeatherPanel.tsx":
    "Chargement de la météo dans le navigateur (CSR), état de la réponse et bouton Réessayer.",
  "components/feedback/ConfirmDialog.tsx":
    "État ouvert ou fermé du dialogue et état d'envoi de l'action (useTransition).",
  "components/feedback/ErrorState.tsx":
    "Le bouton Réessayer réagit au clic et appelle retry() ou router.refresh().",
  "components/feedback/FlashToast.tsx":
    "Lit l'URL avec useSearchParams, affiche un toast Sonner et retire ?toast= avec history.replaceState.",
  "components/feedback/RouteErrorFallback.tsx":
    "Contenu des frontières d'erreur : useEffect écrit l'erreur dans la console du navigateur, et le bouton Réessayer appelle retry().",
  "components/layout/LogoutMenuItem.tsx":
    "Réagit à la sélection dans le menu du compte et appelle la Server Action logout() avec son état d'envoi.",
  "components/layout/MobileNav.tsx":
    "État ouvert ou fermé du panneau de navigation mobile, refermé après un clic sur un lien.",
  "components/layout/NavLinks.tsx":
    "usePathname() lit l'adresse courante pour marquer le lien actif (aria-current).",
  "components/trips/DeleteTripButton.tsx": DELETE_REASON,
  "components/trips/TripFilters.tsx":
    "useRouter écrit les filtres dans l'URL, avec un délai de 300 ms sur la saisie de la recherche.",
  "components/trips/TripForm.tsx": FORM_REASON,
  "components/upload/CoverImageDialog.tsx": "État ouvert ou fermé du dialogue d'envoi de l'image.",
  "components/upload/ImageUploader.tsx":
    "Champ <input type=file>, aperçu avec URL.createObjectURL (API du navigateur) et état de l'envoi.",
};

/** Fichiers .ts et .tsx de src/, avec des / même sous Windows. */
function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => /\.tsx?$/.test(path))
    .sort();
}

function read(path: string): string {
  return readFileSync(`${SRC}${path}`, "utf8");
}

/** La directive doit être la première ligne du fichier pour que Next.js la voie. */
function isClientFile(path: string): boolean {
  return /^["']use client["'];?\s*$/m.test(read(path).trimStart().split("\n")[0] ?? "");
}

const clientFiles = sourceFiles().filter(isClientFile);

describe('fichiers "use client"', () => {
  it("ont chacun leur raison dans la liste du rapport", () => {
    const ours = clientFiles.filter((path) => !path.startsWith(SHADCN_DIR));

    expect(ours).toEqual(Object.keys(CLIENT_COMPONENTS).sort());
  });

  it("ne comptent aucune page ni aucun layout", () => {
    const routes = clientFiles.filter((path) => /(^|\/)(page|layout)\.tsx$/.test(path));

    expect(routes).toEqual([]);
  });

  it("n'importent pas le code réservé au serveur (lib/api, lib/auth, lib/supabase)", () => {
    // Ces modules lisent les cookies ou les clés secrètes et commencent par import
    // "server-only" : le build échouerait. Le test le dit plus tôt, avec le nom du fichier.
    const offenders = clientFiles.filter((path) =>
      /from ["']@\/lib\/(api|auth|supabase)\//.test(read(path)),
    );

    expect(offenders).toEqual([]);
  });
});
