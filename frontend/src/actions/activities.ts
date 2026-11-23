"use server";

import { revalidatePath } from "next/cache";
import { apiFailure, invalidInput, toCamelCase } from "@/lib/actionFailure";
import {
  createActivity,
  deleteActivity,
  getDestinationPage,
  updateActivity,
} from "@/lib/api/itinerary";
import { activityCategoryToGql, parseId, toGqlId } from "@/lib/api/mappers";
import { expireActionSession, verifyActionSession } from "@/lib/auth/session";
import { isApiError } from "@/lib/errors";
import { itineraryPaths } from "@/lib/itineraryPaths";
import {
  ACTIVITY_FIELDS,
  activitySchema,
  type ActivityField,
  type ActivityInput,
  type ActivityValues,
} from "@/lib/validation/activity";
import type { ActionFailure, ActionResult } from "@/types/actions";
import type { ActivityUpdateInput, GqlDestinationPage, GqlId } from "@/types/graphql";

// Server Actions des activités : création, modification et suppression par les
// mutations GraphQL createActivity, updateActivity et deleteActivity.
//
// Ces actions ne redirigent pas. Le formulaire vit dans un dialogue de la page de la
// destination : après le succès, revalidatePath fait renvoyer la page à jour dans la
// réponse de l'action, et la liste des activités change sans rechargement.
//
// Chaque action relit d'abord la destination (query DestinationPage). Elle connaît ainsi
// les dates du séjour pour le schéma Zod, le voyage à rafraîchir, et elle vérifie que
// l'activité modifiée appartient bien à cette destination.

type ActivityFailure = ActionFailure<ActivityField>;

function unknownDestination(): ActivityFailure {
  return {
    ok: false,
    message: "Cette destination est introuvable. Elle a peut-être été supprimée.",
    fieldErrors: {},
  };
}

function unknownActivity(): ActivityFailure {
  return {
    ok: false,
    message: "Cette activité est introuvable. Elle a peut-être été supprimée.",
    fieldErrors: {},
  };
}

/**
 * Erreur de Django pendant l'action. Un 401 veut dire que le jeton a expiré depuis la
 * vérification de la session : nous déconnectons l'utilisateur.
 */
async function activityFailure(error: unknown): Promise<ActivityFailure> {
  if (isApiError(error) && error.status === 401) {
    return expireActionSession();
  }
  return apiFailure(error, ACTIVITY_FIELDS, toCamelCase);
}

function revalidateDestination(destination: GqlDestinationPage): void {
  for (const path of itineraryPaths(destination.trip.id, destination.id)) {
    revalidatePath(path);
  }
}

/**
 * Destination de l'activité, ou l'échec à renvoyer. Un identifiant qui n'est pas un
 * entier (appel forgé) ne part pas chez Django.
 */
async function loadDestination(
  destinationId: GqlId,
): Promise<GqlDestinationPage | ActivityFailure> {
  const id = parseId(destinationId);
  if (id === null) {
    return unknownDestination();
  }
  try {
    return await getDestinationPage(id);
  } catch (error) {
    return activityFailure(error);
  }
}

function isFailure(value: GqlDestinationPage | ActivityFailure): value is ActivityFailure {
  return "ok" in value;
}

/** Valide les valeurs avec les dates du séjour lues dans Django. */
function parseActivity(destination: GqlDestinationPage, values: ActivityInput) {
  return activitySchema({
    start: destination.arrivalDate,
    end: destination.departureDate,
  }).safeParse(values);
}

/**
 * Variables communes à createActivity et updateActivity. GraphQL écrit la catégorie en
 * majuscules ("FOOD"). Le coût est déjà une chaîne à deux décimales ("12.50"), et une
 * heure vide vaut null : en modification, cela efface l'heure de début.
 */
function toActivityInput(values: ActivityValues): Required<ActivityUpdateInput> {
  return {
    name: values.name,
    description: values.description,
    category: activityCategoryToGql(values.category),
    date: values.date,
    startTime: values.start_time,
    cost: values.cost,
  };
}

/** L'activité fait-elle partie de la destination ? Sinon, l'appel est forgé ou périmé. */
function belongsTo(destination: GqlDestinationPage, activityId: GqlId): boolean {
  return destination.activities.some((activity) => activity.id === toGqlId(activityId));
}

/** Ajoute une activité à la destination. */
export async function createActivityAction(
  destinationId: GqlId,
  values: ActivityInput,
): Promise<ActionResult<ActivityField>> {
  await verifyActionSession();
  const destination = await loadDestination(destinationId);
  if (isFailure(destination)) {
    return destination;
  }
  const parsed = parseActivity(destination, values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  try {
    await createActivity({ destination: destination.id, ...toActivityInput(parsed.data) });
  } catch (error) {
    return activityFailure(error);
  }

  revalidateDestination(destination);
  return { ok: true };
}

/** Modifie une activité de la destination. */
export async function updateActivityAction(
  destinationId: GqlId,
  activityId: GqlId,
  values: ActivityInput,
): Promise<ActionResult<ActivityField>> {
  await verifyActionSession();
  const destination = await loadDestination(destinationId);
  if (isFailure(destination)) {
    return destination;
  }
  if (!belongsTo(destination, activityId)) {
    return unknownActivity();
  }
  const parsed = parseActivity(destination, values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  try {
    await updateActivity(activityId, toActivityInput(parsed.data));
  } catch (error) {
    return activityFailure(error);
  }

  revalidateDestination(destination);
  return { ok: true };
}

/** Supprime une activité de la destination. */
export async function deleteActivityAction(
  destinationId: GqlId,
  activityId: GqlId,
): Promise<ActionResult<ActivityField>> {
  await verifyActionSession();
  const destination = await loadDestination(destinationId);
  if (isFailure(destination)) {
    return destination;
  }
  if (!belongsTo(destination, activityId)) {
    return unknownActivity();
  }

  try {
    await deleteActivity(activityId);
  } catch (error) {
    return activityFailure(error);
  }

  revalidateDestination(destination);
  return { ok: true };
}
