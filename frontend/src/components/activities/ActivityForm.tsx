"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { LoaderCircleIcon } from "lucide-react";
import { createActivityAction, updateActivityAction } from "@/actions/activities";
import { applyFieldErrors } from "@/components/forms/applyFieldErrors";
import { FormMessage } from "@/components/forms/FormMessage";
import { SelectField } from "@/components/forms/SelectField";
import { TextareaField } from "@/components/forms/TextareaField";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { ACTIVITY_CATEGORIES, activityCategoryLabel } from "@/lib/activityCategory";
import type { DateRange } from "@/lib/dates";
import {
  activitySchema,
  activityToInput,
  emptyActivityInput,
  type ActivityInput,
  type ActivityValues,
} from "@/lib/validation/activity";
import type { GqlActivity, GqlId } from "@/types/graphql";

// Formulaire d'une activité, affiché dans le dialogue de la page d'une destination
// (ActivityDialog), pour l'ajout et pour la modification. C'est un Client Component :
// React Hook Form garde l'état des champs, et zodResolver valide avec le même schéma
// que la Server Action, construit avec les dates du séjour.
//
// Les actions des activités ne redirigent pas. En cas de succès, onSuccess ferme le
// dialogue. La page, rafraîchie par revalidatePath dans l'action, montre déjà la liste
// à jour. Sinon, le formulaire affiche le message et les erreurs sous les champs.

/** Les 8 catégories avec leur libellé, pour la liste déroulante. */
const CATEGORY_OPTIONS = ACTIVITY_CATEGORIES.map((value) => ({
  value,
  label: activityCategoryLabel(value),
}));

interface ActivityFormProps {
  destinationId: GqlId;
  /** Arrivée et départ de la destination : la date de l'activité doit être entre les deux. */
  stay: DateRange;
  /** Activité à modifier, préremplie. Sans elle, le formulaire ajoute une activité. */
  activity?: GqlActivity;
  /** Appelée quand l'action a réussi. */
  onSuccess: () => void;
  /** Appelée par le bouton Annuler. */
  onCancel: () => void;
}

export function ActivityForm({
  destinationId,
  stay,
  activity,
  onSuccess,
  onCancel,
}: ActivityFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // Le schéma dépend des dates du séjour. useMemo évite de le refaire à chaque rendu.
  const { start, end } = stay;
  const schema = useMemo(() => activitySchema({ start, end }), [start, end]);
  const form = useForm<ActivityInput, unknown, ActivityValues>({
    resolver: zodResolver(schema),
    defaultValues: activity ? activityToInput(activity) : emptyActivityInput({ start, end }),
  });

  function onSubmit() {
    setMessage(null);
    // L'action revalide avec le même schéma : nous lui envoyons les valeurs saisies,
    // pas les valeurs transformées (coût déjà converti), que le schéma refuserait.
    const values = form.getValues();
    startTransition(async () => {
      const result = activity
        ? await updateActivityAction(destinationId, activity.id, values)
        : await createActivityAction(destinationId, values);
      if (result.ok) {
        onSuccess();
        return;
      }
      setMessage(result.message);
      applyFieldErrors(form.setError, result.fieldErrors);
    });
  }

  return (
    // noValidate : les messages viennent de Zod, en français, et non du navigateur.
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {message ? <FormMessage variant="error">{message}</FormMessage> : null}
      <FieldGroup>
        <TextField control={form.control} name="name" label="Nom" autoComplete="off" />

        <div className="grid gap-6 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="category"
            label="Catégorie"
            options={CATEGORY_OPTIONS}
          />
          <TextField
            control={form.control}
            name="cost"
            label="Coût"
            inputMode="decimal"
            autoComplete="off"
            description="Facultatif. Vide si l'activité est gratuite."
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* min et max ouvrent le calendrier sur le séjour. Zod vérifie quand même. */}
          <TextField
            control={form.control}
            name="date"
            label="Date"
            type="date"
            min={start}
            max={end}
          />
          <TextField
            control={form.control}
            name="start_time"
            label="Heure de début"
            type="time"
            description="Facultatif."
          />
        </div>

        <TextareaField
          control={form.control}
          name="description"
          label="Description"
          description="Facultatif. L'adresse, la réservation, ce qu'il faut apporter."
        />
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              Enregistrement…
            </>
          ) : activity ? (
            "Enregistrer"
          ) : (
            "Ajouter l'activité"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
