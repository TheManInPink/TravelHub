import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "@/components/auth/RegisterForm";

const { register } = vi.hoisted(() => ({ register: vi.fn() }));
vi.mock("@/actions/auth", () => ({ register }));

beforeEach(() => {
  register.mockReset();
});

async function fill(values: Record<string, string>) {
  const user = userEvent.setup();
  for (const [label, value] of Object.entries(values)) {
    await user.type(screen.getByLabelText(label), value);
  }
  await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
}

const helene = {
  "Nom d'utilisateur": "hélène",
  Courriel: "helene@example.com",
  "Mot de passe": "Voyage-Gaspesie-2027",
  "Confirmation du mot de passe": "Voyage-Gaspesie-2027",
};

describe("RegisterForm", () => {
  it("signale une confirmation différente sans appeler l'action", async () => {
    render(<RegisterForm />);

    await fill({ ...helene, "Confirmation du mot de passe": "Autre-chose-2027" });

    expect(
      await screen.findByText("Les deux mots de passe ne correspondent pas."),
    ).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("envoie le compte et affiche l'erreur de Django sous le nom d'utilisateur", async () => {
    register.mockResolvedValue({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { username: ["Un utilisateur avec ce nom existe déjà."] },
    });
    render(<RegisterForm />);

    await fill(helene);

    expect(await screen.findByText("Les données envoyées sont invalides.")).toBeInTheDocument();
    expect(screen.getByText("Un utilisateur avec ce nom existe déjà.")).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith(
      {
        username: "hélène",
        email: "helene@example.com",
        password: "Voyage-Gaspesie-2027",
        password_confirm: "Voyage-Gaspesie-2027",
        first_name: "",
        last_name: "",
      },
      undefined,
    );
  });
});
