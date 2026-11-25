// Client Supabase du serveur Next.js, avec la clé secrète (sb_secret_…). Il sert
// seulement à envoyer et à supprimer les images du bucket public. Les pages affichent
// ensuite les images par leur adresse publique, sans aucune clé.
//
// « server-only » fait échouer le build si un Client Component importe ce module. La clé
// secrète ne peut donc pas finir dans le JavaScript envoyé au navigateur.
//
// Le client est créé au moment de l'envoi, jamais au chargement du module. Sinon,
// next build lirait les variables dès qu'il analyse une page qui importe l'action, et
// il échouerait là où elles manquent.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLIC_STORAGE_PATH } from "./images";

/** Délai maximal d'un appel à Supabase Storage, pour qu'une panne ne bloque pas l'action. */
const TIMEOUT_MS = 20_000;

interface SupabaseSettings {
  url: URL;
  secretKey: string;
  bucket: string;
}

/** Lit et vérifie les trois variables. Le message d'erreur ne contient jamais la clé. */
function readSettings(): SupabaseSettings {
  const values = {
    SUPABASE_URL: process.env.SUPABASE_URL?.trim() ?? "",
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY?.trim() ?? "",
    SUPABASE_BUCKET: process.env.SUPABASE_BUCKET?.trim() ?? "",
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Variables manquantes pour Supabase : ${missing.join(", ")}. Copiez .env.example en .env.local.`,
    );
  }

  const url = URL.canParse(values.SUPABASE_URL) ? new URL(values.SUPABASE_URL) : null;
  // Django n'accepte que des images en https (validate_cover_image_url).
  if (!url || url.protocol !== "https:") {
    throw new Error(
      `SUPABASE_URL doit être l'adresse https du projet, par exemple https://abcdefgh.supabase.co (valeur reçue : ${values.SUPABASE_URL}).`,
    );
  }
  // La clé publiable ne peut pas écrire dans le bucket, puisqu'il n'a aucune politique
  // RLS d'écriture. Supabase refuserait l'envoi avec un message peu clair.
  if (values.SUPABASE_SECRET_KEY.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SECRET_KEY contient la clé publiable. Copiez la clé secrète (Settings > API Keys).",
    );
  }
  return { url, secretKey: values.SUPABASE_SECRET_KEY, bucket: values.SUPABASE_BUCKET };
}

/** fetch avec un délai maximal. Supabase peut aussi passer son propre signal. */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}

/**
 * Nouveau client Supabase avec la clé secrète. Cette clé contourne RLS : le serveur
 * vérifie donc lui-même les droits de l'utilisateur avant chaque envoi.
 *
 * Le serveur n'a pas de session Supabase à garder (la connexion passe par Django). Nous
 * coupons donc la sauvegarde et le rafraîchissement de session de supabase-js.
 */
export function getSupabase(): SupabaseClient {
  const { url, secretKey } = readSettings();
  return createClient(url.origin, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  });
}

/** Le bucket des images (SUPABASE_BUCKET), pour upload, getPublicUrl et remove. */
export function imageBucket() {
  const { bucket } = readSettings();
  return getSupabase().storage.from(bucket);
}

export type ImageBucket = ReturnType<typeof imageBucket>;

/**
 * Chemin dans le bucket d'une adresse publique de ce bucket, ou null pour une autre
 * adresse. « https://<ref>.supabase.co/storage/v1/object/public/travelhub-images/trips/1/a.webp »
 * donne « trips/1/a.webp ». Le chemin n'est pas décodé : l'appelant le compare au format
 * des noms qu'il crée lui-même.
 */
export function storagePathOf(publicUrl: string): string | null {
  const { url, bucket } = readSettings();
  if (!URL.canParse(publicUrl)) {
    return null;
  }
  const parsed = new URL(publicUrl);
  const prefix = `${PUBLIC_STORAGE_PATH}${bucket}/`;
  if (parsed.origin !== url.origin || !parsed.pathname.startsWith(prefix)) {
    return null;
  }
  return parsed.pathname.slice(prefix.length) || null;
}
