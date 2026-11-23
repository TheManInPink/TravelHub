import { useId } from "react";
import { Controller, type Control, type FieldPathByValue, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

// Zone de texte sur plusieurs lignes reliée à React Hook Form, sur le modèle de
// TextField : la description d'un voyage ou d'une activité.
// Ce module utilise des hooks : seuls des Client Components l'importent.

interface TextareaFieldProps<TValues extends FieldValues, TTransformed> {
  control: Control<TValues, unknown, TTransformed>;
  /** Nom d'un champ texte du formulaire. */
  name: FieldPathByValue<TValues, string>;
  label: string;
  description?: string;
  rows?: number;
}

export function TextareaField<TValues extends FieldValues, TTransformed = TValues>({
  control,
  name,
  label,
  description,
  rows = 3,
}: TextareaFieldProps<TValues, TTransformed>) {
  const id = useId();
  const descriptionId = `${id}-aide`;
  const errorId = `${id}-erreur`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const describedBy = [
          description ? descriptionId : null,
          fieldState.invalid ? errorId : null,
        ].filter((value) => value !== null);
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Textarea
              {...field}
              id={id}
              rows={rows}
              aria-invalid={fieldState.invalid}
              aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
            />
            {description ? (
              <FieldDescription id={descriptionId}>{description}</FieldDescription>
            ) : null}
            {fieldState.invalid ? <FieldError id={errorId} errors={[fieldState.error]} /> : null}
          </Field>
        );
      }}
    />
  );
}
