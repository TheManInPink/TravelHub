import { useId } from "react";
import { Controller, type Control, type FieldPathByValue, type FieldValues } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Liste déroulante reliée à React Hook Form, sur le modèle de TextField : le statut d'un
// voyage, la catégorie d'une activité. Le Select de shadcn (Radix) n'est pas un <select>
// natif : le Controller lui passe la valeur et le rappel onValueChange.
// Ce module utilise des hooks : seuls des Client Components l'importent.

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps<TValues extends FieldValues, TTransformed> {
  control: Control<TValues, unknown, TTransformed>;
  /** Nom d'un champ texte du formulaire. */
  name: FieldPathByValue<TValues, string>;
  label: string;
  options: readonly SelectOption[];
  description?: string;
}

export function SelectField<TValues extends FieldValues, TTransformed = TValues>({
  control,
  name,
  label,
  options,
  description,
}: SelectFieldProps<TValues, TTransformed>) {
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
            <Select name={field.name} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={id}
                ref={field.ref}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
                aria-describedby={describedBy.length > 0 ? describedBy.join(" ") : undefined}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
