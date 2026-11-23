import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, delay, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { WeatherPanel } from "@/components/enrichment/WeatherPanel";
import type { DateRange } from "@/lib/dates";
import type { BffErrorBody, DestinationWeather } from "@/types/api";
import { kyotoWeather } from "../../msw/fixtures";
import { server } from "../../msw/server";

// ErrorState appelle useRouter(), qui ne marche que dans le routeur de Next.js.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Le navigateur appelle le Route Handler de Next.js. MSW le simule à la place de Next.js.
const ROUTE = "/api/destinations/:destinationId/weather";
const PATH = "/api/destinations/3/weather?v=test";

const NBSP = " ";

/** Séjour de Kyoto dans les données de test. */
const stay: DateRange = { start: "2027-04-08", end: "2027-04-14" };

function routeReplies(status: number, body: DestinationWeather | BffErrorBody) {
  server.use(http.get(ROUTE, () => HttpResponse.json(body, { status })));
}

function errorReply(code: string, message: string): BffErrorBody {
  return { error: { code, message } };
}

describe("WeatherPanel", () => {
  it("montre le squelette, puis les conditions actuelles et une carte par jour", async () => {
    routeReplies(200, kyotoWeather);
    render(<WeatherPanel path={PATH} stay={stay} />);

    expect(screen.getByRole("status")).toHaveTextContent("Chargement de la météo");

    expect(
      await screen.findByRole("heading", { level: 3, name: "Maintenant à Kyoto" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Partiellement nuageux")).toBeInTheDocument();
    expect(screen.getByText(`17,4${NBSP}°C`, { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText("Relevé de 9 h 15, heure locale.")).toBeInTheDocument();

    const days = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(days).toHaveLength(3);
    expect(within(days[1]).getByText("ven. 9 avr.")).toHaveAttribute("datetime", "2027-04-09");
    expect(within(days[1]).getByText("Pluie faible")).toBeInTheDocument();
    // Min., max., précipitations et vent, avec les unités de la réponse.
    expect(days[1].textContent).toContain(`Min.11,4${NBSP}°C`);
    expect(days[1].textContent).toContain(`Max.18,6${NBSP}°C`);
    expect(days[1].textContent).toContain(`Précip.4,2${NBSP}mm`);
    expect(days[1].textContent).toContain(`Vent19,8${NBSP}km/h`);
    // Open-Meteo peut laisser des valeurs vides.
    expect(days[2].textContent).toContain("Conditions inconnues");
    expect(days[2].textContent).toContain("Min.n. d.");
  });

  it("prend les unités dans la réponse", async () => {
    routeReplies(200, {
      ...kyotoWeather,
      units: { temperature: "°F", wind_speed: "mph", precipitation: "inch" },
    });
    render(<WeatherPanel path={PATH} stay={stay} />);

    const days = await screen.findAllByRole("listitem");
    expect(days[1].textContent).toContain(`Max.18,6${NBSP}°F`);
    expect(days[1].textContent).toContain(`Précip.4,2${NBSP}inch`);
    expect(days[1].textContent).toContain(`Vent19,8${NBSP}mph`);
  });

  it("montre l'état vide pour no_data_available avant le séjour", async () => {
    routeReplies(404, errorReply("no_data_available", "Aucune prévision pour cette période."));
    render(<WeatherPanel path={PATH} stay={{ start: "2099-04-08", end: "2099-04-14" }} />);

    expect(
      await screen.findByRole("heading", {
        name: "Prévisions disponibles 16 jours avant l'arrivée",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("dit que le séjour est terminé pour no_data_available après le départ", async () => {
    routeReplies(404, errorReply("no_data_available", "Aucune prévision pour cette période."));
    render(<WeatherPanel path={PATH} stay={{ start: "2020-10-08", end: "2020-10-11" }} />);

    expect(await screen.findByRole("heading", { name: "Séjour terminé" })).toBeInTheDocument();
  });

  it("relance l'appel avec Réessayer après une 503", async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(ROUTE, () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json(
            errorReply("external_service_unavailable", "Le service externe ne répond pas."),
            { status: 503 },
          );
        }
        return HttpResponse.json(kyotoWeather);
      }),
    );
    render(<WeatherPanel path={PATH} stay={stay} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Le service externe ne répond pas.");
    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Partiellement nuageux")).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it("propose Réessayer après une panne réseau", async () => {
    server.use(http.get(ROUTE, () => HttpResponse.error()));
    render(<WeatherPanel path={PATH} stay={stay} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.",
    );
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });

  it("conseille de vérifier la ville pour location_not_found", async () => {
    routeReplies(404, errorReply("location_not_found", "Ville introuvable : Kyotto (JP)."));
    render(<WeatherPanel path={PATH} stay={stay} editHref="/trips/1/destinations/3/edit" />);

    expect(await screen.findByRole("heading", { name: "Ville introuvable" })).toBeInTheDocument();
    expect(screen.getByText(/Vérifiez son nom et son code pays/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier la destination" })).toHaveAttribute(
      "href",
      "/trips/1/destinations/3/edit",
    );
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("ne montre pas le lien de modification à un lecteur", async () => {
    routeReplies(404, errorReply("location_not_found", "Ville introuvable : Kyotto (JP)."));
    render(<WeatherPanel path={PATH} stay={stay} />);

    expect(
      await screen.findByText("Le propriétaire ou un éditeur du voyage peut corriger la ville."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("affiche le message sans Réessayer quand la session a expiré", async () => {
    const message = "Votre session a expiré. Rechargez la page pour vous reconnecter.";
    routeReplies(401, errorReply("not_authenticated", message));
    render(<WeatherPanel path={PATH} stay={stay} />);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Météo indisponible" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).not.toBeInTheDocument();
  });

  it("annule la requête quand le composant est démonté", async () => {
    let signal: AbortSignal | undefined;
    server.use(
      http.get(ROUTE, async ({ request }) => {
        signal = request.signal;
        await delay("infinite");
        return HttpResponse.json(kyotoWeather);
      }),
    );
    const { unmount } = render(<WeatherPanel path={PATH} stay={stay} />);
    await waitFor(() => {
      expect(signal).toBeDefined();
    });

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
