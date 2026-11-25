// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/errors";

// tests/setup.ts remplace ce module par une fonction espion. Ici, nous testons le vrai.
const { logDjangoFailure } = await vi.importActual<typeof import("@/lib/api/log")>("@/lib/api/log");

function loggedLine(spy: { mock: { calls: unknown[][] } }): unknown {
  expect(spy.mock.calls).toHaveLength(1);
  const [line] = spy.mock.calls[0];
  expect(typeof line).toBe("string");
  return JSON.parse(line as string);
}

describe("logDjangoFailure", () => {
  it("écrit une ligne JSON avec le request_id, sans la chaîne de requête ni le message", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ApiError({
      status: 503,
      code: "internal_error",
      message: "Détail qui ne doit pas sortir",
      requestId: "req-503",
    });

    logDjangoFailure(error, { method: "GET", path: "/api/trips/?search=Paris" });

    expect(loggedLine(spy)).toEqual({
      level: "error",
      event: "django_failure",
      request_id: "req-503",
      method: "GET",
      path: "/api/trips/",
      status: 503,
      code: "internal_error",
    });
  });

  it("ajoute le nom de l'opération GraphQL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new ApiError({ status: 0, code: "timeout", message: "", requestId: "req-0" });

    logDjangoFailure(error, { method: "POST", path: "/graphql/", operation: "DestinationPage" });

    expect(loggedLine(spy)).toMatchObject({ operation: "DestinationPage", status: 0 });
  });
});
