import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ActivityForm } from "@/components/activities/ActivityForm";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { DestinationForm } from "@/components/destinations/DestinationForm";
import { TripFilters } from "@/components/trips/TripFilters";
import { TripForm } from "@/components/trips/TripForm";
import { ImageUploader } from "@/components/upload/ImageUploader";
import { japanTrip, kyotoPage } from "../msw/fixtures";

// Chaque champ des formulaires a un libellé, et chaque bouton un nom (exigence non
// fonctionnelle « accessible au clavier, libellés sur tous les champs »). Un lecteur
// d'écran lit ce nom quand la touche Tab arrive sur le champ.

// Les Server Actions et le routeur n'existent pas dans les tests. Les formulaires ne
// sont pas envoyés ici : de simples fonctions vides suffisent.
vi.mock("@/actions/auth", () => ({ login: vi.fn(), register: vi.fn() }));
vi.mock("@/actions/trips", () => ({ createTripAction: vi.fn(), updateTripAction: vi.fn() }));
vi.mock("@/actions/destinations", () => ({
  createDestinationAction: vi.fn(),
  updateDestinationAction: vi.fn(),
}));
vi.mock("@/actions/activities", () => ({
  createActivityAction: vi.fn(),
  updateActivityAction: vi.fn(),
}));
vi.mock("@/actions/upload", () => ({ uploadTripCover: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const trip = { start: japanTrip.start_date, end: japanTrip.end_date };
const stay = { start: kyotoPage.arrivalDate, end: kyotoPage.departureDate };

const FORMS: [string, () => ReactElement][] = [
  ["LoginForm", () => <LoginForm />],
  ["RegisterForm", () => <RegisterForm />],
  ["TripForm (création)", () => <TripForm />],
  ["TripForm (modification)", () => <TripForm trip={japanTrip} />],
  ["TripFilters", () => <TripFilters status="planned" search="paris" />],
  ["DestinationForm", () => <DestinationForm tripId={1} trip={trip} cancelHref="/trips/1" />],
  [
    "ActivityForm",
    () => (
      <ActivityForm
        destinationId={kyotoPage.id}
        stay={stay}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    ),
  ],
  ["ImageUploader", () => <ImageUploader tripId={1} />],
];

/** Champs et boutons que la touche Tab ou un lecteur d'écran peut atteindre. */
function reachable(container: HTMLElement, selector: string): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(selector)].filter(
    // Radix Select ajoute un <select> caché (aria-hidden) pour l'envoi natif du formulaire.
    (element) => element.getAttribute("type") !== "hidden" && !element.closest("[aria-hidden]"),
  );
}

/** Description courte d'un élément, pour le message d'échec. */
function describeElement(element: HTMLElement): string {
  const type = element.getAttribute("type");
  const name = element.getAttribute("name");
  return `<${element.tagName.toLowerCase()}${type ? ` type="${type}"` : ""}${name ? ` name="${name}"` : ""}>`;
}

/** Les champs de saisie, y compris les menus de Radix (un bouton avec role="combobox"). */
const FIELDS = "input, select, textarea, [role='combobox']";

describe("libellés des formulaires", () => {
  it.each(FORMS)("%s : chaque champ a une étiquette <label> reliée", (_, form) => {
    const { container } = render(form());
    const fields = reachable(container, FIELDS);

    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      // Une vraie étiquette, visible et cliquable, pas seulement un placeholder.
      const { labels } = field as HTMLInputElement;
      expect(labels?.length ?? 0, describeElement(field)).toBeGreaterThan(0);
      expect(field, describeElement(field)).toHaveAccessibleName();
    }
  });

  it.each(FORMS)("%s : chaque bouton a un nom", (_, form) => {
    const { container } = render(form());

    for (const button of reachable(container, "button, [role='button'], a[href]")) {
      expect(button, describeElement(button)).toHaveAccessibleName();
    }
  });
});
