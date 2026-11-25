"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFailure, invalidInput, toCamelCase } from "@/lib/actionFailure";
import {
  createDestination,
  deleteDestination,
  getDestinationPage,
  updateDestination,
} from "@/lib/api/itinerary";
import { parseId, toGqlId } from "@/lib/api/mappers";
import { getTrip } from "@/lib/api/trips";
import { expireActionSession, verifyActionSession } from "@/lib/auth/session";
import { isApiError } from "@/lib/errors";
import { withFlash } from "@/lib/flash";
import { destinationHref, itineraryPaths, tripHref } from "@/lib/itineraryPaths";
import {
  DESTINATION_FIELDS,
  destinationSchema,
  type DestinationField,
  type DestinationInput,
  type DestinationValues,
} from "@/lib/validation/destination";
import type { ActionFailure } from "@/types/actions";
import type { TripDetail } from "@/types/api";
import type {
  DestinationCreateInput,
  DestinationUpdateInput,
  GqlDestinationPage,
  GqlId,
} from "@/types/graphql";

// Server Actions des destinations : création, modification et suppression par les
// mutations GraphQL createDestination, updateDestination et deleteDestination.
//
// Chaque action vérifie la session, relit le voyage ou la destination dans Django, puis
// valide les valeurs avec le schéma Zod du formulaire. Les dates du voyage viennent de
// Django, pas du navigateur : un appel forgé ne peut pas changer les bornes du séjour.
// En cas de succès, l'action rafraîchit les pages de l'itinéraire et redirige, avec un
// ?toast= pour le message de succès (lib/flash.ts). Pour une erreur attendue, elle
// renvoie {ok: false, message, fieldErrors}. Les details de GraphQL sont en camelCase
// ("arrivalDate") : apiFailure les ramène sous les champs du formulaire ("arrival_date").
//
// redirect() lève une erreur spéciale que Next.js intercepte : il reste hors des try.

function unknownTrip(): ActionFailure<DestinationField> {
  return {
    ok: false,
    message: "Ce voyage est introuvable. Il a peut-être été supprimé.",
    fieldErrors: {},
  };
}

function unknownDestination(): ActionFailure<DestinationField> {
  return {
    ok: false,
    message: "Cette destination est introuvable. Elle a peut-être été supprimée.",
    fieldErrors: {},
  };
}

/**
 * Erreur de Django pendant l'action. Un 401 veut dire que le jeton a expiré depuis la
 * vérification de la session : nous déconnectons l'utilisateur.
 */
async function destinationFailure(error: unknown): Promise<ActionFailure<DestinationField>> {
  if (isApiError(error) && error.status === 401) {
    return expireActionSession();
  }
  return apiFailure(error, DESTINATION_FIELDS, toCamelCase);
}

function revalidateItinerary(tripId: GqlId | number, destinationId?: GqlId): void {
  for (const path of itineraryPaths(tripId, destinationId)) {
    revalidatePath(path);
  }
}

/** Les coordonnées vont ensemble : le schéma garantit qu'elles sont toutes deux là ou absentes. */
function coordinatesOf(values: DestinationValues) {
  return values.latitude !== null && values.longitude !== null
    ? { latitude: values.latitude, longitude: values.longitude }
    : {};
}

/** Variables de createDestination, avec les noms de champs de GraphQL. */
function toCreateInput(trip: TripDetail, values: DestinationValues): DestinationCreateInput {
  // Django demande la position dans l'itinéraire. La nouvelle destination va à la fin,
  // après la plus grande position du voyage (1 pour la première destination).
  const order = Math.max(0, ...trip.destinations.map((destination) => destination.order)) + 1;
  return {
    trip: toGqlId(trip.id),
    order,
    city: values.city,
    country: values.country,
    countryCode: values.country_code,
    arrivalDate: values.arrival_date,
    departureDate: values.departure_date,
    ...coordinatesOf(values),
  };
}

/**
 * Variables de updateDestination. Quand la ville ou le code pays change sans nouvelles
 * coordonnées, Django efface les anciennes, et la météo cherche la nouvelle ville. Nous
 * n'envoyons donc les coordonnées que si l'utilisateur les a modifiées dans le formulaire.
 */
function toUpdateInput(
  current: GqlDestinationPage,
  values: DestinationValues,
): DestinationUpdateInput {
  const input: DestinationUpdateInput = {
    city: values.city,
    country: values.country,
    countryCode: values.country_code,
    arrivalDate: values.arrival_date,
    departureDate: values.departure_date,
  };
  if (values.latitude !== current.latitude || values.longitude !== current.longitude) {
    input.latitude = values.latitude;
    input.longitude = values.longitude;
  }
  return input;
}

/**
 * Ajoute une destination à la fin de l'itinéraire, puis ouvre sa page. Le voyage est lu
 * par l'API REST (GET /api/trips/{id}/) : il donne les dates et les positions déjà prises.
 */
export async function createDestinationAction(
  tripId: number | string,
  values: DestinationInput,
): Promise<ActionFailure<DestinationField>> {
  await verifyActionSession();
  const id = parseId(tripId);
  if (id === null) {
    return unknownTrip();
  }

  let trip: TripDetail;
  try {
    trip = await getTrip(id);
  } catch (error) {
    return destinationFailure(error);
  }
  const parsed = destinationSchema({ start: trip.start_date, end: trip.end_date }).safeParse(
    values,
  );
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  let destinationId: GqlId;
  try {
    ({ id: destinationId } = await createDestination(toCreateInput(trip, parsed.data)));
  } catch (error) {
    return destinationFailure(error);
  }

  revalidateItinerary(trip.id, destinationId);
  redirect(withFlash(destinationHref(trip.id, destinationId), "destination-created"));
}

/** Modifie une destination (ville, pays, dates, coordonnées), puis revient sur sa page. */
export async function updateDestinationAction(
  destinationId: GqlId,
  values: DestinationInput,
): Promise<ActionFailure<DestinationField>> {
  await verifyActionSession();
  const id = parseId(destinationId);
  if (id === null) {
    return unknownDestination();
  }

  let current: GqlDestinationPage;
  try {
    current = await getDestinationPage(id);
  } catch (error) {
    return destinationFailure(error);
  }
  const { trip } = current;
  const parsed = destinationSchema({ start: trip.startDate, end: trip.endDate }).safeParse(values);
  if (!parsed.success) {
    return invalidInput(parsed.error);
  }

  try {
    await updateDestination(id, toUpdateInput(current, parsed.data));
  } catch (error) {
    return destinationFailure(error);
  }

  revalidateItinerary(trip.id, current.id);
  redirect(withFlash(destinationHref(trip.id, current.id), "destination-updated"));
}

/**
 * Supprime une destination et ses activités, puis revient sur la page du voyage : rester
 * sur la page d'une destination supprimée afficherait « Destination introuvable ».
 */
export async function deleteDestinationAction(
  destinationId: GqlId,
): Promise<ActionFailure<DestinationField>> {
  await verifyActionSession();
  const id = parseId(destinationId);
  if (id === null) {
    return unknownDestination();
  }

  let tripId: GqlId;
  try {
    // Nous relisons la destination pour connaître son voyage, sans croire le navigateur.
    const current = await getDestinationPage(id);
    tripId = current.trip.id;
    await deleteDestination(id);
  } catch (error) {
    return destinationFailure(error);
  }

  revalidateItinerary(tripId);
  redirect(withFlash(tripHref(tripId), "destination-deleted"));
}
