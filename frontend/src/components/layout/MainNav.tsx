import { NavLinks } from "./NavLinks";

// Navigation des écrans de 768 px et plus. En dessous, MobileNav prend le relais.

export function MainNav() {
  return (
    <nav aria-label="Navigation principale" className="hidden md:block">
      <NavLinks orientation="horizontal" />
    </nav>
  );
}
