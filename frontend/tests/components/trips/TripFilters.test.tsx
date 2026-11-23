import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DELAY_MS, TripFilters } from "@/components/trips/TripFilters";

// Le vrai routeur de Next.js n'existe pas dans les tests : replace est un espion.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

// Faux minuteurs pour contrôler le délai de 300 ms. Seuls setTimeout et clearTimeout
// sont simulés : React planifie son rendu avec setImmediate, qui doit rester réel.
// Nous utilisons fireEvent et non user-event : user-event attend un setTimeout(0) que
// Testing Library n'avance que sous Jest, et le test resterait bloqué avec Vitest.
beforeEach(() => {
  replace.mockReset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function typeSearch(value: string) {
  fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value } });
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("TripFilters", () => {
  it("attend 300 ms après la dernière lettre avant d'écrire la recherche dans l'URL", () => {
    render(<TripFilters status="planned" />);

    typeSearch("par");
    wait(200);
    typeSearch("paris");
    wait(SEARCH_DELAY_MS - 1);
    // La deuxième lettre a relancé le délai : rien n'est encore parti.
    expect(replace).not.toHaveBeenCalled();

    wait(1);
    // Une seule requête pour toute la saisie. Le statut reste, et la page revient à 1.
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/trips?status=planned&search=paris", { scroll: false });
  });

  it("lance la recherche tout de suite avec Entrée", () => {
    render(<TripFilters />);

    typeSearch("  kyoto ");
    fireEvent.submit(screen.getByRole("search", { name: "Filtrer les voyages" }));

    expect(replace).toHaveBeenCalledWith("/trips?search=kyoto", { scroll: false });
    wait(SEARCH_DELAY_MS);
    // Entrée a annulé la recherche en attente : pas de deuxième appel.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("n'écrit pas l'URL si la recherche ne change pas", () => {
    render(<TripFilters search="paris" />);

    typeSearch("paris ");
    wait(SEARCH_DELAY_MS);

    expect(replace).not.toHaveBeenCalled();
  });

  it("efface tous les filtres", () => {
    render(<TripFilters status="draft" search="paris" ordering="title" />);

    fireEvent.click(screen.getByRole("button", { name: "Effacer les filtres" }));

    expect(replace).toHaveBeenCalledWith("/trips", { scroll: false });
    expect(screen.getByLabelText("Rechercher")).toHaveValue("");
  });

  it("montre les choix de l'URL dans les menus", () => {
    render(<TripFilters status="ongoing" ordering="-title" search="paris" />);

    expect(screen.getByLabelText("Rechercher")).toHaveValue("paris");
    expect(screen.getByLabelText("Statut")).toHaveTextContent("En cours");
    expect(screen.getByLabelText("Trier par")).toHaveTextContent("Titre, de Z à A");
  });

  it("n'affiche pas « Effacer les filtres » sans filtre", () => {
    render(<TripFilters />);

    expect(screen.getByLabelText("Statut")).toHaveTextContent("Tous les statuts");
    expect(screen.queryByRole("button", { name: "Effacer les filtres" })).not.toBeInTheDocument();
  });
});
