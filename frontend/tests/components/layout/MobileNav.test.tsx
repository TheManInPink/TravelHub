import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileNav } from "@/components/layout/MobileNav";

// usePathname() ne marche que dans le routeur de Next.js : nous fixons l'adresse courante.
vi.mock("next/navigation", () => ({
  usePathname: () => "/trips/new",
}));

describe("MobileNav", () => {
  it("s'ouvre au clic et se ferme avec Échap", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ouvrir le menu" }));

    const dialog = await screen.findByRole("dialog", { name: "TravelHub" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tableau de bord" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    // Sur /trips/new, seul « Nouveau voyage » est la page courante.
    expect(screen.getByRole("link", { name: "Nouveau voyage" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Mes voyages" })).not.toHaveAttribute("aria-current");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Radix rend le focus au bouton qui a ouvert le menu.
    expect(screen.getByRole("button", { name: "Ouvrir le menu" })).toHaveFocus();
  });

  it("se ferme avec le bouton Fermer le menu", async () => {
    const user = userEvent.setup();
    render(<MobileNav />);

    await user.click(screen.getByRole("button", { name: "Ouvrir le menu" }));
    await user.click(await screen.findByRole("button", { name: "Fermer le menu" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
