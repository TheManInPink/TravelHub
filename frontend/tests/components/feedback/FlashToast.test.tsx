import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlashToast } from "@/components/feedback/FlashToast";

// L'URL lue par useSearchParams et le toast de Sonner sont simulés.
const { searchParams, toast } = vi.hoisted(() => ({
  searchParams: { current: new URLSearchParams() },
  toast: { success: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams.current }));
vi.mock("sonner", () => ({ toast }));

function openPage(url: string) {
  window.history.pushState(null, "", url);
  searchParams.current = new URL(url, window.location.origin).searchParams;
}

beforeEach(() => {
  toast.success.mockReset();
});

describe("FlashToast", () => {
  it("affiche le message de la clé, puis retire ?toast= de l'adresse", () => {
    openPage("/trips?status=draft&toast=trip-deleted");

    render(<FlashToast />);

    expect(toast.success).toHaveBeenCalledWith("Voyage supprimé.", { id: "flash-trip-deleted" });
    // Les autres paramètres restent.
    expect(`${window.location.pathname}${window.location.search}`).toBe("/trips?status=draft");
  });

  it("n'affiche pas de texte pris dans l'URL pour une clé inconnue", () => {
    openPage("/trips/1?toast=Votre+compte+est+bloqu%C3%A9");

    render(<FlashToast />);

    expect(toast.success).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}`).toBe("/trips/1");
  });

  it("ne fait rien sans paramètre toast", () => {
    openPage("/trips?page=2");

    render(<FlashToast />);

    expect(toast.success).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?page=2");
  });
});
