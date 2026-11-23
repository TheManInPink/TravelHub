import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { PlaneIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/components/feedback/EmptyState";

describe("EmptyState", () => {
  it("affiche son titre, son texte et son action", () => {
    render(
      <EmptyState
        icon={PlaneIcon}
        title="Aucun voyage pour le moment"
        description="Créez votre premier voyage pour commencer."
        action={<Link href="/trips/new">Créer un voyage</Link>}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Aucun voyage pour le moment" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Créez votre premier voyage pour commencer.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Créer un voyage" })).toHaveAttribute(
      "href",
      "/trips/new",
    );
  });

  it("n'affiche aucun lien sans action, et accepte un autre niveau de titre", () => {
    render(
      <EmptyState icon={PlaneIcon} title="Page introuvable" description="…" titleAs="h1" />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
