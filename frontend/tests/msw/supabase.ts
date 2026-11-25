import { HttpResponse, http, type AnyHandler } from "msw";

// Supabase Storage simulé. tests/setup.ts met ces valeurs dans SUPABASE_URL,
// SUPABASE_SECRET_KEY et SUPABASE_BUCKET. La clé de test ne ressemble pas à une vraie
// clé, pour que la recherche des vraies clés dans le dépôt ne la trouve pas.
export const SUPABASE_TEST_URL = "https://supabase.test";
export const SUPABASE_TEST_KEY = "cle-secrete-factice";
export const SUPABASE_TEST_BUCKET = "travelhub-images";

/** Adresse des fichiers du bucket dans l'API de Storage (envoi et suppression). */
export const STORAGE_OBJECTS_URL = `${SUPABASE_TEST_URL}/storage/v1/object/${SUPABASE_TEST_BUCKET}`;

/** Début de l'adresse publique d'une image du bucket. */
export const PUBLIC_IMAGES_URL = `${SUPABASE_TEST_URL}/storage/v1/object/public/${SUPABASE_TEST_BUCKET}/`;

/** Supabase refuse une requête sans la clé du projet dans l'en-tête apikey. */
function hasProjectKey(request: Request): boolean {
  return request.headers.get("apikey") === SUPABASE_TEST_KEY;
}

/**
 * Erreur de Storage, comme le vrai Supabase l'envoie : statut HTTP 400, et le vrai code
 * dans statusCode (vérifié sur un projet le 24 novembre 2026).
 */
export function storageError(statusCode: string, message: string) {
  return HttpResponse.json({ statusCode, error: message, message }, { status: 400 });
}

function invalidKey() {
  return storageError("403", "Invalid Compact JWS");
}

export const supabaseHandlers: AnyHandler[] = [
  // Envoi d'un fichier : Storage répond avec la clé « bucket/chemin » et un identifiant.
  http.post(`${STORAGE_OBJECTS_URL}/*`, ({ request }) => {
    if (!hasProjectKey(request)) {
      return invalidKey();
    }
    const path = new URL(request.url).pathname.split(`/${SUPABASE_TEST_BUCKET}/`)[1];
    return HttpResponse.json({ Key: `${SUPABASE_TEST_BUCKET}/${path}`, Id: crypto.randomUUID() });
  }),

  // Suppression : le corps donne les chemins ({"prefixes": [...]}), Storage renvoie les
  // fichiers supprimés.
  http.delete(STORAGE_OBJECTS_URL, async ({ request }) => {
    if (!hasProjectKey(request)) {
      return invalidKey();
    }
    const { prefixes } = (await request.json()) as { prefixes: string[] };
    return HttpResponse.json(prefixes.map((name) => ({ name })));
  }),

  // Tout autre bucket n'existe pas, par exemple une faute dans SUPABASE_BUCKET.
  http.post(`${SUPABASE_TEST_URL}/storage/v1/object/*`, () =>
    storageError("404", "Bucket not found"),
  ),
];
