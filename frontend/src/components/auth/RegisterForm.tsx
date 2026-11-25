"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { LoaderCircleIcon } from "lucide-react";
import { register } from "@/actions/auth";
import { applyFieldErrors } from "@/components/forms/applyFieldErrors";
import { FormMessage } from "@/components/forms/FormMessage";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { registerSchema, type RegisterInput, type RegisterValues } from "@/lib/validation/auth";

// Formulaire d'inscription. Même principe que LoginForm. Django vérifie en plus que le
// nom et le courriel sont libres, et que le mot de passe n'est ni trop courant ni trop
// proche du nom : ses messages s'affichent sous les champs concernés.

interface RegisterFormProps {
  next?: string;
  expired?: boolean;
}

const EMPTY: RegisterInput = {
  username: "",
  email: "",
  password: "",
  password_confirm: "",
  first_name: "",
  last_name: "",
};

export function RegisterForm({ next, expired = false }: RegisterFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RegisterInput, unknown, RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: EMPTY,
  });

  function onSubmit(values: RegisterValues) {
    setMessage(null);
    startTransition(async () => {
      const failure = await register(values, next);
      if (failure) {
        setMessage(failure.message);
        applyFieldErrors(form.setError, failure.fieldErrors);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {message ? <FormMessage variant="error">{message}</FormMessage> : null}
      {expired && !message ? (
        <FormMessage variant="info">Votre session a expiré.</FormMessage>
      ) : null}
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="first_name"
            label="Prénom (facultatif)"
            autoComplete="given-name"
          />
          <TextField
            control={form.control}
            name="last_name"
            label="Nom (facultatif)"
            autoComplete="family-name"
          />
        </div>
        <TextField
          control={form.control}
          name="username"
          label="Nom d'utilisateur"
          description="Lettres, chiffres et @ . + - _ seulement, sans espace."
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="email"
          label="Courriel"
          type="email"
          autoComplete="email"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="password"
          label="Mot de passe"
          type="password"
          description="8 caractères au moins, pas seulement des chiffres."
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="password_confirm"
          label="Confirmation du mot de passe"
          type="password"
          autoComplete="new-password"
        />
      </FieldGroup>
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            Création du compte…
          </>
        ) : (
          "Créer mon compte"
        )}
      </Button>
    </form>
  );
}
