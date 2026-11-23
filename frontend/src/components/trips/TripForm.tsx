"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { LoaderCircleIcon } from "lucide-react";
import { createTripAction, updateTripAction } from "@/actions/trips";
import { applyFieldErrors } from "@/components/forms/applyFieldErrors";
import { FormMessage } from "@/components/forms/FormMessage";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TRIP_STATUSES, tripStatusLabel } from "@/lib/tripStatus";
import {
  EMPTY_TRIP_INPUT,
  tripSchema,
  tripToInput,
  type TripInput,
  type TripValues,
} from "@/lib/validation/trip";
import type { Trip } from "@/types/api";

// Formulaire d'un voyage, pour la création (/trips/new) et la modification
// (/trips/{id}/edit). C'est un Client Component : React Hook Form garde l'état des
// champs, et zodResolver valide avec le même schéma que la Server Action. L'utilisateur
// voit l'erreur sous le champ avant l'envoi, et le serveur revérifie quand même.
//
// En cas de succès, l'action redirige vers le détail du voyage, où FlashToast affiche
// « Voyage créé. » ou « Voyage modifié. ». Sinon, elle renvoie le message à afficher et
// les erreurs de Django champ par champ.

interface TripFormProps {
  /** Voyage à modifier, prérempli. Sans lui, le formulaire crée un nouveau voyage. */
  trip?: Trip;
}

export function TripForm({ trip }: TripFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const descriptionId = useId();
  const statusId = useId();
  const form = useForm<TripInput, unknown, TripValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: trip ? tripToInput(trip) : EMPTY_TRIP_INPUT,
  });
  // Le calendrier de la date de fin commence à la date de début.
  const startDate = useWatch({ control: form.control, name: "start_date" });

  function onSubmit() {
    setMessage(null);
    // L'action revalide avec le même schéma : nous lui envoyons les valeurs saisies,
    // pas les valeurs transformées (budget déjà converti), que le schéma refuserait.
    const values = form.getValues();
    startTransition(async () => {
      // En cas de succès, l'action redirige : la suite ne s'exécute qu'en cas d'erreur.
      const failure = trip
        ? await updateTripAction(trip.id, values)
        : await createTripAction(values);
      setMessage(failure.message);
      applyFieldErrors(form.setError, failure.fieldErrors);
    });
  }

  const submitLabel = trip ? "Enregistrer les modifications" : "Créer le voyage";

  return (
    // noValidate : les messages viennent de Zod, en français, et non du navigateur.
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {message ? <FormMessage variant="error">{message}</FormMessage> : null}
      <FieldGroup>
        <TextField control={form.control} name="title" label="Titre" autoComplete="off" />

        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={descriptionId}>Description</FieldLabel>
              <Textarea
                {...field}
                id={descriptionId}
                rows={4}
                aria-invalid={fieldState.invalid}
                aria-describedby={`${descriptionId}-aide`}
              />
              <FieldDescription id={`${descriptionId}-aide`}>
                Facultatif. Le programme, les personnes du voyage, les idées.
              </FieldDescription>
              {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
            </Field>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="start_date"
            label="Date de début"
            type="date"
            deps={["end_date"]}
          />
          <TextField
            control={form.control}
            name="end_date"
            label="Date de fin"
            type="date"
            min={startDate || undefined}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="status"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={statusId}>Statut</FieldLabel>
                <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id={statusId}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-invalid={fieldState.invalid}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIP_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {tripStatusLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
              </Field>
            )}
          />
          <TextField
            control={form.control}
            name="budget"
            label="Budget"
            inputMode="decimal"
            autoComplete="off"
            description="Facultatif. En dollars canadiens, par exemple 1500 ou 1500,50."
          />
        </div>
      </FieldGroup>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={trip ? `/trips/${trip.id}` : "/trips"}>Annuler</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              Enregistrement…
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
