import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorFallback } from "@/components/feedback/RouteErrorFallback";

// ErrorState appelle useRouter(), qui n'existe que dans le routeur de Next.js.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("RouteErrorFallback (error.tsx)", () => {
  it("affiche un message générique avec le digest, sans le message technique", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("relation trips_trip does not exist"), {
      digest: "2905135410",
    });
    render(<RouteErrorFallback error={error} retry={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Cette page n'a pas pu s'afficher");
    expect(alert).toHaveTextContent("2905135410");
    expect(alert).not.toHaveTextContent("relation trips_trip");
    expect(screen.getByRole("link", { name: "Retour au tableau de bord" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("appelle retry() de Next.js au clic sur Réessayer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<RouteErrorFallback error={new Error("x")} retry={retry} />);

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
