import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

describe("Breadcrumbs", () => {
  it("met un lien sur chaque niveau, sauf sur la page courante", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Voyages", href: "/trips" },
          { label: "Automne à Paris", href: "/trips/3" },
          { label: "Paris" },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Fil d'Ariane" });
    expect(within(nav).getByRole("link", { name: "Voyages" })).toHaveAttribute("href", "/trips");
    expect(within(nav).getByRole("link", { name: "Automne à Paris" })).toHaveAttribute(
      "href",
      "/trips/3",
    );
    // shadcn donne role="link" à la page courante, mais sans href et avec aria-current.
    const current = within(nav).getByText("Paris");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).not.toHaveAttribute("href");
  });
});
