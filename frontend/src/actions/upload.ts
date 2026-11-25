"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiFailure } from "@/lib/actionFailure";
import { getTrip, updateTrip } from "@/lib/api/trips";
import { expireActionSession, verifyActionSession } from "@/lib/auth/session";
import { isApiError } from "@/lib/errors";
import { itineraryPaths } from "@/lib/itineraryPaths";
import { imageBucket, storagePathOf, type ImageBucket } from "@/lib/supabase/server";
import { canEditTrip } from "@/lib/tripAccess";
import {
  IMAGE_CONTENT_MESSAGE,
  IMAGE_EXTENSIONS,
  IMAGE_FIELD,
  detectImageType,
  imageFileSchema,
  type ImageField,
  type ImageType,
} from "@/lib/validation/image";
import type { ActionFailure, ActionResult } from "@/types/actions";
import type { TripDetail } from "@/types/api";

// Server Action de l'image de couverture d'un voyage.
//
// Le navigateur envoie le fichier à Next.js dans un FormData. Next.js l'envoie à Supabase
// Storage avec la clé secrète, puis enregistre l'adresse publique dans Django
// (PATCH /api/trips/{id}/ avec cover_image_url). Le navigateur n'écrit jamais lui-même
// dans Supabase, et il ne voit jamais la clé.
//
// La clé secrète contourne RLS. C'est donc ici que nous vérifions les droits, avec le
// rôle renvoyé par Django (my_role). Django vérifie encore les droits au moment du PATCH.
//
// L'action ne redirige pas. Elle rafraîchit les pages du voyage et renvoie {ok: true},
// puis ImageUploader affiche le toast.

type UploadFailure = ActionFailure<ImageField>;

/** Identifiant REST du voyage. Le navigateur l'envoie, donc nous le vérifions. */
const tripIdSchema = z.int().positive();

/**
 * Durée de cache de l'image, en secondes (un an). Chaque envoi crée un fichier au nom
 * neuf : le contenu d'une adresse ne change donc jamais.
 */
const CACHE_SECONDS = "31536000";

/**
 * Codes de Supabase Storage qui viennent de notre configuration, et non d'une panne :
 * bucket inconnu (« 404 », par exemple une faute dans SUPABASE_BUCKET) ou clé refusée
 * (« 403 »). Supabase les renvoie avec le statut HTTP 400. Réessayer ne changerait rien.
 */
const CONFIG_STATUS_CODES = new Set(["403", "404"]);

const UNKNOWN_TRIP = "Ce voyage est introuvable. Il a peut-être été supprimé.";
const NOT_ALLOWED = "Seuls le propriétaire et les éditeurs peuvent changer l'image du voyage.";
const NOT_CONFIGURED = "L'envoi d'images n'est pas configuré sur ce serveur.";
const UPLOAD_FAILED = "L'image n'a pas pu être envoyée. Réessayez dans un instant.";

function failure(message: string, fileError?: string): UploadFailure {
  return { ok: false, message, fieldErrors: fileError ? { [IMAGE_FIELD]: [fileError] } : {} };
}

/**
 * Erreur de Django. Un 401 veut dire que le jeton a expiré pendant l'action : nous
 * déconnectons l'utilisateur. Les erreurs de Django sur cover_image_url (une image d'un
 * autre hôte que SUPABASE_STORAGE_HOST, par exemple) vont sous le champ du fichier.
 */
async function djangoFailure(error: unknown): Promise<UploadFailure> {
  if (isApiError(error) && error.status === 401) {
    return expireActionSession();
  }
  return apiFailure(error, [IMAGE_FIELD], () => "cover_image_url");
}

/**
 * trips/12/<uuid>.webp. Un nom neuf à chaque envoi : le navigateur, le CDN de Supabase
 * et l'optimiseur de next/image ne peuvent pas montrer une ancienne version, et l'ancienne
 * image reste en place tant que Django n'a pas enregistré la nouvelle.
 */
function coverPath(tripId: number, type: ImageType): string {
  return `trips/${tripId}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
}

/**
 * Chemin de l'image actuelle du voyage, seulement si coverPath l'a créé pour ce voyage.
 * Un éditeur peut mettre une autre adresse du bucket par l'API REST : nous ne supprimons
 * jamais un fichier d'un autre voyage.
 */
function previousCoverPath(trip: TripDetail): string | null {
  const path = trip.cover_image_url ? storagePathOf(trip.cover_image_url) : null;
  const ownName = new RegExp(`^trips/${trip.id}/[0-9a-f-]{36}\\.(?:jpg|png|webp)$`);
  return path !== null && ownName.test(path) ? path : null;
}

/**
 * Supprime des fichiers du bucket. Un échec laisse seulement un fichier inutile : nous
 * l'écrivons dans le journal du serveur sans faire échouer l'action.
 */
async function removeFiles(bucket: ImageBucket, paths: string[]): Promise<void> {
  const { error } = await bucket.remove(paths);
  if (error) {
    console.warn(`Supabase : suppression impossible de ${paths.join(", ")}`, error.message);
  }
}

/**
 * Envoie l'image de couverture du voyage et l'enregistre dans Django. Ordre : session,
 * rôle, fichier, envoi, adresse publique, PATCH, puis suppression de l'ancienne image.
 */
export async function uploadTripCover(
  tripId: number,
  formData: FormData,
): Promise<ActionResult<ImageField>> {
  await verifyActionSession();
  const id = tripIdSchema.safeParse(tripId);
  if (!id.success) {
    return failure(UNKNOWN_TRIP);
  }

  // 1. Droits : propriétaire ou éditeur, d'après Django.
  let trip: TripDetail;
  try {
    trip = await getTrip(id.data);
  } catch (error) {
    return djangoFailure(error);
  }
  if (!canEditTrip(trip.my_role)) {
    return failure(NOT_ALLOWED);
  }

  // 2. Fichier : type annoncé et taille, puis premiers octets. Nous gardons le type
  // trouvé dans les octets : il donne l'extension et le Content-Type de l'image.
  const parsed = imageFileSchema.safeParse(
    formData instanceof FormData ? formData.get(IMAGE_FIELD) : null,
  );
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? IMAGE_CONTENT_MESSAGE;
    return failure(message, message);
  }
  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  const type = detectImageType(bytes);
  if (type === null) {
    return failure(IMAGE_CONTENT_MESSAGE, IMAGE_CONTENT_MESSAGE);
  }

  let bucket: ImageBucket;
  try {
    bucket = imageBucket();
  } catch (error) {
    // Variable absente sur Vercel : le message détaillé reste dans le journal du serveur.
    console.error(error);
    return failure(NOT_CONFIGURED);
  }

  // 3. Envoi dans Supabase Storage, puis adresse publique (calculée sans requête).
  const path = coverPath(trip.id, type);
  const { error: uploadError } = await bucket.upload(path, bytes, {
    contentType: type,
    cacheControl: CACHE_SECONDS,
    upsert: false,
  });
  if (uploadError) {
    if (uploadError.statusCode && CONFIG_STATUS_CODES.has(uploadError.statusCode)) {
      console.error(
        `Supabase : envoi refusé (${uploadError.message}). Vérifiez SUPABASE_BUCKET et SUPABASE_SECRET_KEY.`,
      );
      return failure(NOT_CONFIGURED);
    }
    console.error(`Supabase : envoi impossible de ${path}`, uploadError.message);
    return failure(UPLOAD_FAILED);
  }
  const { publicUrl } = bucket.getPublicUrl(path).data;

  // 4. Adresse enregistrée dans Django. Si Django refuse, le fichier envoyé ne sert à
  // rien : nous le supprimons avant de répondre (ou de déconnecter, pour un 401).
  try {
    await updateTrip(trip.id, { cover_image_url: publicUrl });
  } catch (error) {
    await removeFiles(bucket, [path]);
    return djangoFailure(error);
  }

  // 5. L'ancienne image n'est plus utilisée.
  const previous = previousCoverPath(trip);
  if (previous) {
    await removeFiles(bucket, [previous]);
  }

  // La liste, le tableau de bord et le détail montrent l'image.
  for (const page of itineraryPaths(trip.id)) {
    revalidatePath(page);
  }
  return { ok: true };
}
