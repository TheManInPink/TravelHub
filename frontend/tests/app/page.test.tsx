import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("Page d'accueil", () => {
  it("présente TravelHub avec un titre principal", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Planifiez vos voyages, étape par étape" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Météo et pays" })).toBeInTheDocument();
  });

  it("mène vers la connexion et l'inscription", () => {
    render(<HomePage />);

    expect(screen.getByRole("link", { name: "Se connecter" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Créer un compte" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});
