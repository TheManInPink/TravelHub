import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "@/components/layout/UserMenu";

// La vraie Server Action appellerait Django : ici, logout est une fonction simulée.
const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/actions/auth", () => ({ logout }));

beforeEach(() => {
  logout.mockReset();
});

const alice = {
  username: "alice",
  email: "alice@example.com",
  first_name: "Alice",
  last_name: "Martin",
};

describe("UserMenu", () => {
  it("affiche les initiales et ouvre le menu du compte", async () => {
    const user = userEvent.setup();
    render(<UserMenu user={alice} />);

    const trigger = screen.getByRole("button", { name: "Alice Martin, menu du compte" });
    expect(trigger).toHaveTextContent("AM");

    await user.click(trigger);

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Alice Martin");
    expect(menu).toHaveTextContent("alice@example.com");
  });

  it("appelle la Server Action logout() depuis l'élément Déconnexion", async () => {
    // Promesse jamais résolue : la déconnexion reste en cours.
    logout.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<UserMenu user={alice} />);

    await user.click(screen.getByRole("button", { name: "Alice Martin, menu du compte" }));
    await user.click(await screen.findByRole("menuitem", { name: "Déconnexion" }));

    expect(logout).toHaveBeenCalledOnce();
    // Le menu reste ouvert et montre que la déconnexion est en cours.
    expect(await screen.findByRole("menuitem", { name: "Déconnexion…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
