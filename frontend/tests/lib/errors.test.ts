import { describe, expect, it } from "vitest";
import {
  ApiError,
  type ApiErrorInit,
  codeFromStatus,
  errorDigest,
  isApiError,
  toUserMessage,
} from "@/lib/errors";

function apiError(code: string, extra: Partial<ApiErrorInit> = {}) {
  return new ApiError({ status: 400, code, message: "", ...extra });
}

// Intl sépare le nombre et l'unité par une espace insécable (« 2 minutes »), mais pas
// toujours (« 1 seconde »), selon la version d'ICU de Node. Nous comparons donc le texte
// avec des espaces normales.
function throttledMessage(retryAfter: number): string {
  const error = apiError("throttled", { status: 429, retryAfter });
  return toUserMessage(error).replace(/\s/gu, " ");
}

describe("ApiError", () => {
  it("garde le statut, le code, les détails et l'identifiant de requête", () => {
    const error = new ApiError({
      status: 404,
      code: "not_found",
      message: "Pas trouvé.",
      requestId: "abc-123",
    });
    expect(error).toBeInstanceOf(Error);
    expect(isApiError(error)).toBe(true);
    expect(error.name).toBe("ApiError");
    expect(error.message).toBe("Pas trouvé.");
    expect(error.details).toEqual({});
    expect(error.requestId).toBe("abc-123");
    expect(error.retryAfter).toBeNull();
  });

  it("donne un code connu quand la réponse n'a pas l'enveloppe de Django", () => {
    expect(codeFromStatus(404)).toBe("not_found");
    expect(codeFromStatus(429)).toBe("throttled");
    expect(codeFromStatus(502)).toBe("internal_error");
    expect(codeFromStatus(418)).toBe("unexpected_response");
  });
});

describe("toUserMessage", () => {
  it("dit combien de temps attendre après un throttled avec Retry-After", () => {
    expect(throttledMessage(120)).toBe("Trop de requêtes. Réessayez dans 2 minutes.");
    expect(throttledMessage(90)).toBe("Trop de requêtes. Réessayez dans 2 minutes.");
    expect(throttledMessage(1)).toBe("Trop de requêtes. Réessayez dans 1 seconde.");
    // 59 min 59 s s'arrondit à 60 minutes, que nous écrivons « 1 heure ».
    expect(throttledMessage(3599)).toBe("Trop de requêtes. Réessayez dans 1 heure.");
  });

  it("reste poli quand un throttled n'a pas de Retry-After", () => {
    expect(toUserMessage(apiError("throttled", { status: 429 }))).toBe(
      "Trop de requêtes. Réessayez dans un instant.",
    );
  });

  it("reprend le message français de Django pour une erreur de validation", () => {
    const error = apiError("validation_error", {
      message: "Le voyage doit garder au moins un propriétaire.",
    });
    expect(toUserMessage(error)).toBe("Le voyage doit garder au moins un propriétaire.");
    expect(toUserMessage(apiError("validation_error"))).toBe(
      "Les données envoyées sont invalides. Vérifiez les champs indiqués.",
    );
  });

  it("traduit les codes d'authentification et de permission", () => {
    expect(toUserMessage(apiError("not_authenticated"))).toBe(
      "Vous devez vous connecter pour continuer.",
    );
    expect(toUserMessage(apiError("token_not_valid"))).toBe(
      "Votre session a expiré. Reconnectez-vous.",
    );
    expect(toUserMessage(apiError("permission_denied"))).toBe(
      "Vous n'avez pas le droit de faire cette action.",
    );
    expect(toUserMessage(apiError("not_found"))).toBe(
      "Cet élément est introuvable. Il a peut-être été supprimé.",
    );
  });

  it("regroupe les erreurs des services externes", () => {
    for (const code of [
      "external_service_unavailable",
      "external_service_timeout",
      "external_service_bad_response",
    ]) {
      expect(toUserMessage(apiError(code, { status: 503 }))).toBe(
        "Le service externe (météo ou pays) ne répond pas pour le moment. Réessayez dans quelques minutes.",
      );
    }
  });

  it("explique une panne réseau, un délai dépassé et une erreur interne", () => {
    expect(toUserMessage(apiError("network_error", { status: 0 }))).toBe(
      "Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.",
    );
    expect(toUserMessage(apiError("timeout", { status: 0 }))).toBe(
      "Le serveur se réveille, réessayez dans un instant.",
    );
    expect(toUserMessage(new DOMException("délai", "TimeoutError"))).toBe(
      "Le serveur se réveille, réessayez dans un instant.",
    );
    expect(toUserMessage(apiError("internal_error", { status: 500 }))).toBe(
      "Le serveur a rencontré une erreur. Réessayez plus tard.",
    );
  });

  it("garde le message de Django pour un autre code, sinon un message générique", () => {
    expect(toUserMessage(apiError("location_not_found", { message: "Lieu introuvable." }))).toBe(
      "Lieu introuvable.",
    );
    expect(toUserMessage(new Error("Cannot read properties of undefined"))).toBe(
      "Une erreur inattendue est survenue. Réessayez dans un instant.",
    );
    expect(toUserMessage("texte")).toBe(
      "Une erreur inattendue est survenue. Réessayez dans un instant.",
    );
  });

  it("ne montre jamais le message technique d'un code créé par le front-end", () => {
    const error = apiError("invalid_query", { message: "Cannot query field 'x' on type 'Trip'." });
    expect(toUserMessage(error)).toBe("La requête envoyée au serveur est invalide.");
  });
});

describe("errorDigest", () => {
  it("lit le digest ajouté par Next.js", () => {
    const error = Object.assign(new Error("Masqué en production"), { digest: "2905135410" });
    expect(errorDigest(error)).toBe("2905135410");
  });

  it("renvoie undefined sans digest, ou pour une valeur qui n'est pas un objet", () => {
    expect(errorDigest(new Error("x"))).toBeUndefined();
    expect(errorDigest({ digest: 42 })).toBeUndefined();
    expect(errorDigest({ digest: "" })).toBeUndefined();
    expect(errorDigest("texte")).toBeUndefined();
    expect(errorDigest(null)).toBeUndefined();
  });
});
