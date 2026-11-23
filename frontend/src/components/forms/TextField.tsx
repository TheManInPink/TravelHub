import { useId, type ComponentProps } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldPathByValue,
  type FieldValues,
} from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Champ texte relié à React Hook Form, sur le modèle du guide des formulaires de shadcn
// (Controller + Field). Le libellé, l'aide et l'erreur sont reliés au champ (htmlFor,
// aria-describedby, aria-invalid) pour les lecteurs d'écran.
// Ce module utilise des hooks : seuls des Client Components l'importent.

/** Attributs de <input> que TextField gère lui-même, et que l'appelant ne passe pas. */
type ManagedProps =
  | "id"
  | "name"
  | "value"
  | "defaultValue"
  | "onChange"
  | "onBlur"
  | "ref"
  | "aria-invalid"
  | "aria-describedby";

interface TextFieldProps<TValues extends FieldValues, TTransformed>
  extends Omit<ComponentProps<typeof Input>, ManagedProps> {
  control: Control<TValues, unknown, TTransformed>;
  /** Nom d'un champ texte du formulaire. */
  name: FieldPathByValue<TValues, string>;
  label: string;
  /** Aide affichée sous le champ, par exemple les règles du mot de passe. */
  description?: string;
  /**
   * Champs à revalider quand celui-ci change. Par exemple, changer la date de début
   * revérifie la date de fin, dont la règle dépend des deux dates.
   */
  deps?: FieldPath<TValues>[];
}

export function TextField<TValues extends FieldValues, TTransformed = TValues>({
  control,
  name,
  label,
  description,
  deps,
  ...inputProps
}: TextFieldProps<TValues, TTransformed>) {
  const id = useId();
  const descriptionId = `${id}-aide`;
  const errorId = `${id}-erreur`;

  return (
    <Controller
      control={control}
      name={name}
      rules={deps ? { deps } : undefined}
      render={({ field, fieldState }) => {
        const describedBy = [
          description ? descriptionId : null,
          fieldState.invalid ? errorId : null,
        ].filter((value) => value !== null);
        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
              {...inputProps}
              {...field}
              id={id}
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
