"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { LoaderCircleIcon } from "lucide-react";
import { login } from "@/actions/auth";
import { applyFieldErrors } from "@/components/forms/applyFieldErrors";
import { FormMessage } from "@/components/forms/FormMessage";
import { TextField } from "@/components/forms/TextField";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { loginSchema, type LoginInput, type LoginValues } from "@/lib/validation/auth";

// Formulaire de connexion. C'est un Client Component : il garde l'état du formulaire,
// valide la saisie avant l'envoi (même schéma Zod que la Server Action) et désactive le
// bouton pendant l'envoi. Il ne voit jamais les jetons : login() les pose dans des
// cookies httpOnly, puis redirige.

interface LoginFormProps {
  /** Page à rouvrir après la connexion (?next=). login() vérifie qu'elle est sûre. */
  next?: string;
  /** true quand la session a expiré (?expired=1). */
  expired?: boolean;
}

export function LoginForm({ next, expired = false }: LoginFormProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginInput, unknown, LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  function onSubmit(values: LoginValues) {
    setMessage(null);
    startTransition(async () => {
      // En cas de succès, login() redirige : la suite ne s'exécute qu'en cas d'erreur.
      const failure = await login(values, next);
      if (failure) {
        setMessage(failure.message);
        applyFieldErrors(form.setError, failure.fieldErrors);
      }
    });
  }

  return (
    // noValidate : les messages viennent de Zod, en français, et non du navigateur.
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      {message ? <FormMessage variant="error">{message}</FormMessage> : null}
      {expired && !message ? (
        <FormMessage variant="info">
          Votre session a expiré. Reconnectez-vous pour continuer.
        </FormMessage>
      ) : null}
      <FieldGroup>
        <TextField
          control={form.control}
          name="username"
          label="Nom d'utilisateur"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />
        <TextField
          control={form.control}
          name="password"
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
        />
      </FieldGroup>
      <Button type="submit" size="lg" disabled={isPending} className="w-full">
        {isPending ? (
          <>
            <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
            Connexion…
          </>
        ) : (
          "Se connecter"
        )}
      </Button>
    </form>
  );
}
