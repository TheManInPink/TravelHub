import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DestinationForm } from "@/components/destinations/DestinationForm";
import type { GqlDestination } from "@/types/graphql";
import { kyotoPage } from "../../msw/fixtures";

// Les vraies Server Actions appelleraient Django : ici, ce sont des fonctions simulées.
const { createDestinationAction, updateDestinationAction } = vi.hoisted(() => ({
  createDestinationAction: vi.fn(),
  updateDestinationAction: vi.fn(),
}));
vi.mock("@/actions/destinations", () => ({ createDestinationAction, updateDestinationAction }));

// Voyage « Japon 2027 » des données de test : du 1er au 14 avril 2027.
const trip = { start: "2027-04-01", end: "2027-04-14" };
const DEPARTURE_BEFORE_ARRIVAL =
  "La date de départ doit être postérieure ou égale à la date d'arrivée.";

beforeEach(() => {
  createDestinationAction.mockReset();
  updateDestinationAction.mockReset();
});

function renderForm(destination?: GqlDestination) {
  render(
    <DestinationForm tripId={1} trip={trip} destination={destination} cancelHref="/trips/1" />,
  );
  return userEvent.setup();
}

/** Remplace la valeur d'un champ date (préremplie avec les dates du voyage). */
async function replaceDate(user: ReturnType<typeof userEvent.setup>, label: string, date: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, date);
}

async function fillOsaka(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Ville"), "Osaka");
  await user.type(screen.getByLabelText("Pays"), "Japon");
  await user.type(screen.getByLabelText("Code du pays"), "jp");
}

describe("DestinationForm", () => {
  it("bloque un départ avant l'arrivée et affiche le message sous la date de départ", async () => {
    const user = renderForm();

    await fillOsaka(user);
    await replaceDate(user, "Date d'arrivée", "2027-04-08");
    await replaceDate(user, "Date de départ", "2027-04-05");
    await user.click(screen.getByRole("button", { name: "Ajouter la destination" }));

    expect(await screen.findByText(DEPARTURE_BEFORE_ARRIVAL)).toBeInTheDocument();
    expect(screen.getByLabelText("Date de départ")).toHaveAccessibleDescription(
      DEPARTURE_BEFORE_ARRIVAL,
    );
    expect(createDestinationAction).not.toHaveBeenCalled();
  });

  it("s'arrête à deux lettres dans le code du pays", async () => {
    const user = renderForm();

    await user.type(screen.getByLabelText("Code du pays"), "jpn");

    // maxLength bloque la troisième lettre. La Server Action refuse aussi « JPN ».
    expect(screen.getByLabelText("Code du pays")).toHaveValue("jp");
  });

  it("garde le séjour dans les dates du voyage", async () => {
    const user = renderForm();

    expect(screen.getByLabelText("Date d'arrivée")).toHaveAttribute("min", "2027-04-01");
    expect(screen.getByLabelText("Date de départ")).toHaveAttribute("max", "2027-04-14");

    await fillOsaka(user);
    await replaceDate(user, "Date d'arrivée", "2027-03-30");
    await user.click(screen.getByRole("button", { name: "Ajouter la destination" }));

    expect(
      await screen.findByText("L'arrivée ne peut pas précéder le début du voyage (1 avril 2027)."),
    ).toBeInTheDocument();
    expect(createDestinationAction).not.toHaveBeenCalled();
  });

  it("refuse une latitude sans longitude", async () => {
    const user = renderForm();

    await fillOsaka(user);
    await user.type(screen.getByLabelText("Latitude"), "34,69");
    await user.click(screen.getByRole("button", { name: "Ajouter la destination" }));

    expect(
      await screen.findByText("Entrez aussi la longitude, ou laissez les deux coordonnées vides."),
    ).toBeInTheDocument();
    expect(createDestinationAction).not.toHaveBeenCalled();
  });

  it("envoie les valeurs saisies à createDestinationAction avec l'identifiant du voyage", async () => {
    // L'action redirige en cas de succès : ici, elle ne se termine jamais.
    createDestinationAction.mockReturnValue(new Promise(() => {}));
    const user = renderForm();

    await fillOsaka(user);
    await replaceDate(user, "Date d'arrivée", "2027-04-05");
    await replaceDate(user, "Date de départ", "2027-04-08");
    await user.click(screen.getByRole("button", { name: "Ajouter la destination" }));

    expect(createDestinationAction).toHaveBeenCalledWith(1, {
      city: "Osaka",
      country: "Japon",
      country_code: "jp",
      arrival_date: "2027-04-05",
      departure_date: "2027-04-08",
      latitude: "",
      longitude: "",
    });
    expect(await screen.findByRole("button", { name: "Enregistrement…" })).toBeDisabled();
  });

  it("met l'erreur renvoyée par Django sous le champ concerné", async () => {
    const message = "Le code pays doit contenir exactement deux lettres (ISO 3166-1 alpha-2).";
    createDestinationAction.mockResolvedValue({
      ok: false,
      message: "Les données envoyées sont invalides.",
      fieldErrors: { country_code: [message] },
    });
    const user = renderForm();

    await fillOsaka(user);
    await user.click(screen.getByRole("button", { name: "Ajouter la destination" }));

    expect(await screen.findByText("Les données envoyées sont invalides.")).toBeInTheDocument();
    expect(screen.getByLabelText("Code du pays")).toHaveAccessibleDescription(
      expect.stringContaining(message),
    );
    expect(screen.getByLabelText("Code du pays")).toHaveFocus();
  });

  it("préremplit la destination à modifier et appelle updateDestinationAction", async () => {
    updateDestinationAction.mockReturnValue(new Promise(() => {}));
    const user = renderForm(kyotoPage);

    expect(screen.getByLabelText("Ville")).toHaveValue("Kyoto");
    expect(screen.getByLabelText("Latitude")).toHaveValue("35.011600");
    expect(screen.getByRole("link", { name: "Annuler" })).toHaveAttribute("href", "/trips/1");

    await user.clear(screen.getByLabelText("Ville"));
    await user.type(screen.getByLabelText("Ville"), "Kyōto");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(updateDestinationAction).toHaveBeenCalledWith("3", {
      city: "Kyōto",
      country: "Japon",
      country_code: "JP",
      arrival_date: "2027-04-08",
      departure_date: "2027-04-14",
      latitude: "35.011600",
      longitude: "135.768100",
    });
  });
});
