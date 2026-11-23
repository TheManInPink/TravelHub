import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/layout/PageHeader";

describe("PageHeader", () => {
  it("affiche le titre de la page en h1 avec ses actions", () => {
    render(
      <PageHeader
        title="Mes voyages"
        description="Tous vos voyages, passés et à venir."
        actions={<button type="button">Nouveau voyage</button>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeInTheDocument();
    expect(screen.getByText("Tous vos voyages, passés et à venir.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nouveau voyage" })).toBeInTheDocument();
  });
});
