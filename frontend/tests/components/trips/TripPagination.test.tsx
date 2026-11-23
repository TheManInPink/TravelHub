import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TripPagination } from "@/components/trips/TripPagination";

describe("TripPagination", () => {
  it("n'affiche rien quand tout tient sur une page", () => {
    const { container } = render(<TripPagination page={1} count={20} filters={{}} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("garde les filtres dans les liens des pages voisines", () => {
    render(<TripPagination page={2} count={45} filters={{ status: "planned", search: "paris" }} />);

    expect(screen.getByRole("navigation", { name: "Pages de la liste" })).toBeInTheDocument();
    expect(screen.getByText("Page 2 sur 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Précédente" })).toHaveAttribute(
      "href",
      "/trips?status=planned&search=paris",
    );
    expect(screen.getByRole("link", { name: "Suivante" })).toHaveAttribute(
      "href",
      "/trips?status=planned&search=paris&page=3",
    );
  });

  it("désactive « Précédente » sur la première page et « Suivante » sur la dernière", () => {
    const { rerender } = render(<TripPagination page={1} count={45} filters={{}} />);
    expect(screen.getByRole("button", { name: "Précédente" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Suivante" })).toHaveAttribute("href", "/trips?page=2");

    rerender(<TripPagination page={3} count={45} filters={{}} />);
    expect(screen.getByRole("button", { name: "Suivante" })).toBeDisabled();
  });
});
