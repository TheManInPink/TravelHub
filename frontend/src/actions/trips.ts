"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { apiFailure, invalidInput } from "@/lib/actionFailure";
import { createTrip, deleteTrip, updateTrip } from "@/lib/api/trips";
import { expireActionSession, verifyActionSession } from "@/lib/auth/session";
import { isApiError } from "@/lib/errors";
import { withFlash } from "@/lib/flash";
import { TRIP_FIELDS, tripSchema, type TripField, type TripInput } from "@/lib/validation/trip";
import type { ActionFailure } from "@/types/actions";

// Server Actions des voyages : création, modification et suppression par l'API REST.
// Chaque action vérifie la session, revalide les valeurs avec le schéma Zod du
// formulaire, appelle Django, puis rafraîchit les pages qui montrent le voyage.
//
// En cas de succès, l'action redirige : vers le détail après une création ou une
// modification, vers la liste après une suppression. Le paramètre ?toast= de l'adresse
// fait afficher le message de succès (lib/flash.ts). Pour une erreur attendue (400, 403,
// 404, 429, délai dépassé), l'action renvoie {ok: false, message, fieldErrors} au lieu de
// lever une exception : le formulaire affiche le message et les erreurs sous les champs.
//
// redirect() lève une erreur spéciale que Next.js intercepte : il reste hors des try.

/** Identifiant REST d'un voyage. Le navigateur l'envoie, donc nous le vérifions. */
const tripIdSchema = z.int().positive();

function unknownTrip(): ActionFailure<TripField> {
  return {
    ok: false,
    message: "Ce voyage est introuvable. Il a peut-être été supprimé.",
    fieldErrors: {},
  };
}

/**
 * Erreur de Django pendant l'action. Un 401 veut dire que le jeton a expiré depuis la
 * vérification de la session : nous déconnectons l'utilisateur au lieu d'afficher
 * une erreur qu'il ne peut pas corriger.
 */
async function tripFailure(error: unknown): Promise<ActionFailure<TripField>> {
  if (isApiError(error) && error.status === 401) {
    return expireActionSession();
  }
  return apiFailure(error, TRIP_FIELDS);
}

/** La liste, le détail et le tableau de bord montrent le voyage : ils sont rafraîchis. */
function revalidateTrip(tripId: number): void {
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/dashboard");
}

/** Création (POST /api/trips/). L'utilisateur devient propriétaire du voyage. */
export async function createTripAction(values: TripInput): Promise<ActionFailure<TripField>> {
  await verifyActionSession();
  const parsed = tripSchema.safeParse(values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  let tripId: number;
  try {
    ({ id: tripId } = await createTrip(parsed.data));
  } catch (error) {
    return tripFailure(error);
  }

  revalidateTrip(tripId);
  redirect(withFlash(`/trips/${tripId}`, "trip-created"));
}

/**
 * Modification (PATCH /api/trips/{id}/). Django refuse avec un 403 si l'utilisateur
 * n'est que lecteur : la page /edit ne lui montre pas le formulaire, mais un appel
 * forgé reste possible.
 */
export async function updateTripAction(
  id: number,
  values: TripInput,
): Promise<ActionFailure<TripField>> {
  await verifyActionSession();
  const tripId = tripIdSchema.safeParse(id);
  if (!tripId.success) {
    return unknownTrip();
  }
  const parsed = tripSchema.safeParse(values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  try {
    await updateTrip(tripId.data, parsed.data);
  } catch (error) {
    return tripFailure(error);
  }

  revalidateTrip(tripId.data);
  redirect(withFlash(`/trips/${tripId.data}`, "trip-updated"));
}

/**
 * Suppression (DELETE /api/trips/{id}/), réservée au propriétaire. Django supprime aussi
 * les destinations et les activités. L'action redirige vers /trips : rester sur le
 * détail d'un voyage supprimé afficherait « Voyage introuvable ».
 */
export async function deleteTripAction(id: number): Promise<ActionFailure<TripField>> {
  await verifyActionSession();
  const tripId = tripIdSchema.safeParse(id);
  if (!tripId.success) {
    return unknownTrip();
  }

  try {
    await deleteTrip(tripId.data);
  } catch (error) {
    return tripFailure(error);
  }

  revalidateTrip(tripId.data);
  redirect(withFlash("/trips", "trip-deleted"));
}
