// @vitest-environment node
// UserMenuSlot est un Server Component asynchrone : Testing Library ne sait pas le
// rendre. Nous l'appelons comme une fonction et examinons l'élément renvoyé.
import { HttpResponse, http } from "msw";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { UserMenu } from "@/components/layout/UserMenu";
import { UserMenuSlot } from "@/components/layout/UserMenuSlot";
import { cookieJar } from "../../mocks/cookies";
import { aliceAccount, validTokens } from "../../msw/fixtures";
import { DJANGO_URL } from "../../msw/handlers";
import { server } from "../../msw/server";

describe("UserMenuSlot", () => {
  it("passe l'utilisateur de /api/auth/me/ au UserMenu", async () => {
    cookieJar.set("th_access", validTokens.access);

    const element = await UserMenuSlot();

    expect(isValidElement(element)).toBe(true);
    expect(element?.type).toBe(UserMenu);
    expect(element?.props).toEqual({ user: aliceAccount });
  });

  it("n'affiche rien sans session valide", async () => {
    cookieJar.set("th_access", "jeton-invalide");

    await expect(UserMenuSlot()).resolves.toBeNull();
  });

  it("n'affiche rien si Django ne répond pas, au lieu de casser tout le layout", async () => {
    server.use(http.get(`${DJANGO_URL}/api/auth/me/`, () => HttpResponse.error()));
    cookieJar.set("th_access", validTokens.access);

    await expect(UserMenuSlot()).resolves.toBeNull();
  });
});
