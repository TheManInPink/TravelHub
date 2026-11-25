"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ImageIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { uploadTripCover } from "@/actions/upload";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IMAGE_ACCEPT, IMAGE_FIELD, imageFileError } from "@/lib/validation/image";

// Envoi de l'image de couverture d'un voyage. C'est un Client Component : il garde le
// fichier choisi, son aperçu et l'état de l'envoi.
//
// Le fichier est contrôlé dès qu'il est choisi (type et taille, avec le schéma Zod de
// lib/validation/image.ts). Un fichier refusé n'est jamais envoyé. L'attribut accept ne
// suffit pas : le sélecteur de fichiers permet de choisir « Tous les fichiers ».
// La Server Action refait tous les contrôles, et vérifie aussi les premiers octets.

interface ImageUploaderProps {
  tripId: number;
  /** Appelée après un envoi réussi, par exemple pour fermer le dialogue. */
  onSuccess?: () => void;
  /** Bouton Annuler, affiché seulement si cette fonction est donnée. */
  onCancel?: () => void;
}

export function ImageUploader({ tripId, onSuccess, onCancel }: ImageUploaderProps) {
  const id = useId();
  const descriptionId = `${id}-aide`;
  const errorId = `${id}-erreur`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // L'adresse blob: de l'aperçu garde le fichier en mémoire. Nous la libérons quand
  // l'aperçu change et quand le composant disparaît.
  useEffect(() => {
    if (!previewUrl) {
      return undefined;
    }
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearSelection() {
    setFile(null);
    setPreviewUrl(null);
    // Le champ se vide : choisir de nouveau le même fichier relance le contrôle.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    const message = chosen ? imageFileError(chosen) : null;
    setError(message);
    if (!chosen || message) {
      clearSelection();
      return;
    }
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choisissez une image.");
      return;
    }
    const formData = new FormData();
    formData.set(IMAGE_FIELD, file);
    startTransition(async () => {
      // Si la session a expiré, l'action redirige vers /login : la suite ne s'exécute pas.
      const result = await uploadTripCover(tripId, formData);
      if (result.ok) {
        toast.success("Image de couverture enregistrée.");
        clearSelection();
        onSuccess?.();
        return;
      }
      setError(result.fieldErrors.file?.[0] ?? null);
      toast.error(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="relative h-40 overflow-hidden rounded-lg border bg-muted sm:h-48">
        {previewUrl ? (
          // Une adresse blob: n'a pas besoin de l'optimiseur : next/image l'affiche telle quelle.
          <Image
            src={previewUrl}
            alt="Aperçu de l'image choisie"
            fill
            sizes="(min-width: 640px) 30rem, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-8" />
            <p>Aucune image choisie</p>
          </div>
        )}
      </div>

      <Field data-invalid={error !== null}>
        <FieldLabel htmlFor={id}>Image</FieldLabel>
        <Input
          ref={inputRef}
          id={id}
          name={IMAGE_FIELD}
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={isPending}
          onChange={handleChange}
          aria-invalid={error !== null}
          aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
        />
        <FieldDescription id={descriptionId}>JPEG, PNG ou WebP, 4 Mo au plus.</FieldDescription>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
        <Button type="submit" disabled={file === null || isPending}>
          {isPending ? (
            <>
              <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              Envoi…
            </>
          ) : (
            <>
              <UploadIcon aria-hidden="true" />
              Envoyer
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
