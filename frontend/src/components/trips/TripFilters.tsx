"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useOptimistic, useRef, useState, useTransition } from "react";
import { LoaderCircleIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_TRIP_ORDERING,
  TRIP_ORDERING_LABELS,
  hasActiveFilters,
  isTripOrdering,
  tripListHref,
  type TripListFilters,
  type TripOrdering,
} from "@/lib/tripList";
import { TRIP_STATUSES, isTripStatus, tripStatusLabel } from "@/lib/tripStatus";

// Filtres de la liste des voyages : statut, recherche et tri. C'est un Client Component,
// car il réagit à la saisie. Il ne garde pas les filtres pour lui : il les écrit dans
// l'URL (?status=planned&search=paris), et la page, rendue au serveur, relit l'URL et
// demande à Django la bonne liste. L'adresse filtrée peut donc être partagée.
//
// La recherche part 300 ms après la dernière lettre : sans ce délai, chaque lettre
// enverrait une requête à Django. Un changement de filtre revient à la page 1.

/** Délai entre la dernière lettre tapée et la recherche. */
export const SEARCH_DELAY_MS = 300;

/** Radix Select n'accepte pas de valeur vide : « all » veut dire « tous les statuts ». */
const ALL_STATUSES = "all";

const ORDERINGS = Object.keys(TRIP_ORDERING_LABELS) as TripOrdering[];

/** Les filtres de l'URL, lus par la page. */
type TripFiltersProps = TripListFilters;

function sameFilters(a: TripListFilters, b: TripListFilters): boolean {
  return (
    a.status === b.status &&
    (a.search ?? "") === (b.search ?? "") &&
    (a.ordering ?? DEFAULT_TRIP_ORDERING) === (b.ordering ?? DEFAULT_TRIP_ORDERING)
  );
}

export function TripFilters({ status, search = "", ordering }: TripFiltersProps) {
  const router = useRouter();
  const statusId = useId();
  const searchId = useId();
  const orderingId = useId();
  const [isPending, startTransition] = useTransition();

  // Pendant la navigation, le menu montre déjà le nouveau choix (useOptimistic). Il
  // reprend ensuite les valeurs de l'URL, que la page renvoie.
  const [current, setCurrent] = useOptimistic<TripListFilters>({ status, search, ordering });

  // Le texte du champ change à chaque lettre, avant l'URL.
  const [text, setText] = useState(search);
  const [typing, setTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Si l'URL change sans la saisie (bouton Précédent du navigateur, lien « Effacer les
  // filtres »), le champ reprend la recherche de l'URL. Pas pendant la saisie : la
  // réponse d'une recherche plus ancienne effacerait les dernières lettres tapées.
  const [urlSearch, setUrlSearch] = useState(search);
  if (search !== urlSearch) {
    setUrlSearch(search);
    if (!typing && search !== text.trim()) {
      setText(search);
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function cancelPendingSearch() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function navigate(changes: TripListFilters) {
    cancelPendingSearch();
    setTyping(false);
    const next: TripListFilters = { ...current, search: text.trim(), ...changes };
    if (sameFilters(next, current)) {
      return;
    }
    startTransition(() => {
      setCurrent(next);
      // replace et non push : chaque recherche n'ajoute pas une entrée dans l'historique.
      // tripListHref ne met pas ?page= : un nouveau filtre revient à la page 1.
      router.replace(tripListHref(next), { scroll: false });
    });
  }

  function handleSearchChange(value: string) {
    setText(value);
    setTyping(true);
    cancelPendingSearch();
    timerRef.current = setTimeout(() => {
      navigate({ search: value.trim() });
    }, SEARCH_DELAY_MS);
  }

  function handleReset() {
    setText("");
    navigate({ status: undefined, search: "", ordering: undefined });
  }

  const canReset =
    hasActiveFilters(current) || text.trim() !== "" || current.ordering !== undefined;

  return (
    <form
      role="search"
      aria-label="Filtrer les voyages"
      // Entrée lance la recherche tout de suite, sans attendre le délai.
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ search: text.trim() });
      }}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Field className="sm:min-w-56 sm:flex-1">
        <FieldLabel htmlFor={searchId}>Rechercher</FieldLabel>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={searchId}
            type="search"
            value={text}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Titre ou description"
            autoComplete="off"
            enterKeyHint="search"
            className="pl-8"
          />
        </div>
      </Field>

      <Field className="sm:w-44">
        <FieldLabel htmlFor={statusId}>Statut</FieldLabel>
        <Select
          value={current.status ?? ALL_STATUSES}
          onValueChange={(value) => navigate({ status: isTripStatus(value) ? value : undefined })}
        >
          <SelectTrigger id={statusId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>Tous les statuts</SelectItem>
            {TRIP_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {tripStatusLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field className="sm:w-72">
        <FieldLabel htmlFor={orderingId}>Trier par</FieldLabel>
        <Select
          value={current.ordering ?? DEFAULT_TRIP_ORDERING}
          onValueChange={(value) => {
            if (isTripOrdering(value)) navigate({ ordering: value });
          }}
        >
          <SelectTrigger id={orderingId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDERINGS.map((value) => (
              <SelectItem key={value} value={value}>
                {TRIP_ORDERING_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* La ligne n'existe que si elle a un contenu : sur mobile, une ligne vide
          laisserait un espace sous les menus. */}
      {canReset || isPending ? (
        <div className="flex min-h-8 items-center gap-2">
          {canReset ? (
            <Button type="button" variant="ghost" onClick={handleReset}>
              <XIcon aria-hidden="true" />
              Effacer les filtres
            </Button>
          ) : null}
          {isPending ? (
            <span
              aria-hidden="true"
              className="flex items-center gap-1.5 text-sm text-muted-foreground"
            >
              <LoaderCircleIcon className="size-4 animate-spin" />
              Mise à jour…
            </span>
          ) : null}
        </div>
      ) : null}
      {/* Annonce la mise à jour de la liste, qui peut prendre une seconde sur Render.
          La zone reste toujours dans la page : un lecteur d'écran n'annonce que les
          changements d'une zone role="status" déjà présente. */}
      <span role="status" className="sr-only">
        {isPending ? "Mise à jour de la liste…" : ""}
      </span>
    </form>
  );
}
