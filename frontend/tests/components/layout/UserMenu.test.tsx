import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { UserMenu } from "@/components/layout/UserMenu";

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
    expect(screen.getByRole("menuitem", { name: "Déconnexion" })).toBeInTheDocument();
  });
});
