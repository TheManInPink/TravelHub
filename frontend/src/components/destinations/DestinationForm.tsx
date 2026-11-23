"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { LoaderCircleIcon } from "lucide-react";
import { createDestinationAction, updateDestinationAction } from "@/actions/destinations";
import { applyFieldErrors } from "@/components/forms/applyFieldErrors";
import { FormMessage } from "@/components/forms/FormMessage";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import type { DateRange } from "@/lib/dates";
import {
  destinationSchema,
  destinationToInput,
  emptyDestinationInput,
  type DestinationInput,
  type DestinationValues,
} from "@/lib/validation/destination";
import type { GqlDestination } from "@/types/graphql";

// Formulaire d'une destination, pour l'ajout (/trips/{id}/destinations/new) et la
// modification (/trips/{id}/destinations/{id}/edit). C'est un Client Component : React
// Hook Form garde l'état des champs, et zodResolver valide avec le même schéma que la
// Server Action, construit avec les dates du voyage.
//
// L'ordre dans l'itinéraire n'est pas un champ : la Server Action place une nouvelle
// destination à la fin. En cas de succès, l'action redirige vers la page de la
// destination, où FlashToast affiche le message. Sinon, elle renvoie le message à
// afficher et les erreurs de Django champ par champ.

interface DestinationFormProps {
  tripId: number | string;
  /** Début et fin du voyage : le séjour doit tenir entre les deux. */
  trip: DateRange;
  /** Destination à modifier, préremplie. Sans elle, le formulaire ajoute une destination. */
  destination?: GqlDestination;
  /** Page où revient le bouton Annuler. */
  cancelHref: string;
}

export function DestinationForm({ tripId, trip, destination, cancelHref }: DestinationFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Le schéma dépend des dates du voyage. useMemo évite de le refaire à chaque rendu.
  const { start, end } = trip;
  const schema = useMemo(() => destinationSchema({ start, end }), [start, end]);
  const form = useForm<DestinationInput, unknown, DestinationValues>({
    resolver: zodResolver(schema),
    defaultValues: destination
      ? destinationToInput(destination)
      : emptyDestinationInput({ start, end }),
  });
  // Le calendrier du départ commence à l'arrivée.
  const arrivalDate = useWatch({ control: form.control, name: "arrival_date" });

  function onSubmit() {
    setMessage(null);
    // L'action revalide avec le même schéma : nous lui envoyons les valeurs saisies,
    // pas les valeurs transformées (code pays en majuscules, coordonnées à null).
    const values = form.getValues();
    startTransition(async () => {
      // En cas de succès, l'action redirige : la suite ne s'exécute qu'en cas d'erreur.
      const failure = destination
        ? await updateDestinationAction(destination.id, values)
        : await createDestinationAction(tripId, values);
      setMessage(failure.message);
      applyFieldErrors(form.setError, failure.fieldErrors);
    });
  }

  return (
    // noValidate : les messages viennent de Zod, en français, et non du navigateur.
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {message ? <FormMessage variant="error">{message}</FormMessage> : null}
      <FieldGroup>
        <TextField control={form.control} name="city" label="Ville" autoComplete="off" />

        <div className="grid gap-6 sm:grid-cols-[1fr_10rem]">
          <TextField
            control={form.control}
            name="country"
            label="Pays"
            autoComplete="country-name"
          />
          <TextField
            control={form.control}
            name="country_code"
            label="Code du pays"
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={2}
            description="Deux lettres, par exemple JP."
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* min et max ouvrent le calendrier sur le voyage. Zod vérifie quand même. */}
          <TextField
            control={form.control}
            name="arrival_date"
            label="Date d'arrivée"
            type="date"
            min={start}
            max={end}
            deps={["departure_date"]}
          />
          <TextField
            control={form.control}
            name="departure_date"
            label="Date de départ"
            type="date"
            min={arrivalDate || start}
            max={end}
          />
        </div>

        <FieldSet>
          <FieldLegend variant="label">Coordonnées (facultatif)</FieldLegend>
          <FieldDescription>
            Sans coordonnées, TravelHub cherche la ville pour afficher la météo. Remplissez
            les deux champs ou aucun.
          </FieldDescription>
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="latitude"
              label="Latitude"
              inputMode="decimal"
              autoComplete="off"
              deps={["longitude"]}
            />
            <TextField
              control={form.control}
              name="longitude"
              label="Longitude"
              inputMode="decimal"
              autoComplete="off"
              deps={["latitude"]}
            />
          </div>
        </FieldSet>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Annuler</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              Enregistrement…
            </>
          ) : destination ? (
            "Enregistrer les modifications"
          ) : (
            "Ajouter la destination"
          )}
        </Button>
      </div>
    </form>
  );
}
