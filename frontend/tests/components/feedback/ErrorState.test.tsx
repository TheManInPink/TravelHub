import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorState } from "@/components/feedback/ErrorState";

// useRouter() ne marche que dans le routeur de Next.js. Ici, refresh est une fonction espion.
// vi.hoisted la crée avant vi.mock, que Vitest remonte en tête du fichier.
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("ErrorState", () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it("annonce le message comme une alerte", () => {
    render(<ErrorState message="Le serveur se réveille, réessayez dans un instant." />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Le serveur se réveille, réessayez dans un instant.",
    );
    expect(screen.getByRole("heading", { name: "Une erreur est survenue" })).toBeInTheDocument();
  });

  it("appelle onRetry au clic sur Réessayer", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState message="Erreur" onRetry={onRetry} />);

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("recharge les données de la page sans onRetry", async () => {
    const user = userEvent.setup();
    render(<ErrorState message="Erreur" />);

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(refresh).toHaveBeenCalledOnce();
  });
});
