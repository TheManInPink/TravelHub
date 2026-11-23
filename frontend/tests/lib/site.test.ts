import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site";

describe("siteUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lit NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://travelhub-uqar.vercel.app ");

    expect(siteUrl().href).toBe("https://travelhub-uqar.vercel.app/");
  });

  it("prend http://localhost:3000 si la variable est vide", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");

    expect(siteUrl().href).toBe("http://localhost:3000/");
  });

  it.each(["travelhub.vercel.app", "localhost:3000", "ftp://travelhub.example"])(
    "refuse une adresse sans http:// ni https:// : %s",
    (value) => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);

      expect(() => siteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL doit être une adresse complète/);
    },
  );
});
