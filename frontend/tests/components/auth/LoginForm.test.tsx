import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/auth/LoginForm";

// La vraie Server Action appellerait Django : ici, login est une fonction simulée.
const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock("@/actions/auth", () => ({ login }));

beforeEach(() => {
  login.mockReset();
});

async function fillAndSubmit(username: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Nom d'utilisateur"), username);
  await user.type(screen.getByLabelText("Mot de passe"), password);
  await user.click(screen.getByRole("button", { name: "Se connecter" }));
}

describe("LoginForm", () => {
  it("affiche les erreurs de validation sans appeler l'action", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole("button", { name: "Se connecter" }));

    expect(await screen.findByText("Entrez votre nom d'utilisateur.")).toBeInTheDocument();
    expect(screen.getByText("Entrez votre mot de passe.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom d'utilisateur")).toHaveAttribute("aria-invalid", "true");
    expect(login).not.toHaveBeenCalled();
  });

  it("affiche l'erreur renvoyée par l'action", async () => {
    login.mockResolvedValue({
      ok: false,
      message: "Nom d'utilisateur ou mot de passe incorrect.",
      fieldErrors: {},
    });
    render(<LoginForm next="/trips/3" />);

    await fillAndSubmit(" alice ", "mauvais");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nom d'utilisateur ou mot de passe incorrect.",
    );
    // Zod a retiré les espaces, et la page demandée suit les valeurs.
    expect(login).toHaveBeenCalledWith({ username: "alice", password: "mauvais" }, "/trips/3");
  });

  it("met une erreur de Django sous le champ concerné", async () => {
    login.mockResolvedValue({
      ok: false,
      message: "Vérifiez les champs indiqués.",
      fieldErrors: { username: ["Ce nom d'utilisateur est désactivé."] },
    });
    render(<LoginForm />);

    await fillAndSubmit("alice", "secret");

    expect(await screen.findByText("Ce nom d'utilisateur est désactivé.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nom d'utilisateur")).toHaveFocus();
  });

  it("désactive le bouton pendant l'envoi", async () => {
    // Promesse jamais résolue : l'envoi reste en cours.
    login.mockReturnValue(new Promise(() => {}));
    render(<LoginForm />);

    await fillAndSubmit("alice", "secret");

    expect(await screen.findByRole("button", { name: "Connexion…" })).toBeDisabled();
  });

  it("annonce une session expirée", () => {
    render(<LoginForm expired />);

    expect(screen.getByRole("status")).toHaveTextContent("Votre session a expiré");
  });
});
