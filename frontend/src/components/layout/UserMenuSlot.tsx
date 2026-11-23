import { getOptionalUser } from "@/lib/auth/session";
import { UserMenu } from "./UserMenu";

// Server Component asynchrone qui charge l'utilisateur pour le menu du compte. Le layout
// (app) le place dans un Suspense : l'en-tête et la page s'affichent sans attendre
// Django, et le squelette du menu tient la place en attendant.
//
// Ce n'est pas une vérification de sécurité. Un layout n'est pas réexécuté à chaque
// navigation : c'est verifySession(), en tête de chaque page, qui protège les données.

export async function UserMenuSlot() {
  let user;
  try {
    user = await getOptionalUser();
  } catch {
    // Django ne répond pas : la page affichera l'erreur avec son bouton Réessayer.
    // Une erreur levée ici remplacerait tout le layout, en-tête compris.
    return null;
  }
  // Session expirée : verifySession() dans la page redirige déjà vers la connexion.
  return user ? <UserMenu user={user} /> : null;
}
