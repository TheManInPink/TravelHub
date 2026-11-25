// Adresses publiques des images Supabase : la règle de images.remotePatterns et celle de
// TripCover doivent donner la même réponse pour chaque adresse.
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicSupabaseImage, supabaseImagePatterns } from "@/lib/supabase/images";

const PROJECT_URL = "https://abcdefgh.supabase.co";
const PUBLIC_IMAGE = `${PROJECT_URL}/storage/v1/object/public/travelhub-images/trips/1/a.webp`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("supabaseImagePatterns", () => {
  it("donne le stockage public du projet", () => {
    vi.stubEnv("SUPABASE_URL", ` ${PROJECT_URL}/ `);

    expect(supabaseImagePatterns()).toEqual([
      {
        protocol: "https",
        hostname: "abcdefgh.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ]);
  });

  it.each(["", "abcdefgh.supabase.co", "http://abcdefgh.supabase.co"])(
    "donne une liste vide pour SUPABASE_URL = « %s »",
    (value) => {
      vi.stubEnv("SUPABASE_URL", value);

      expect(supabaseImagePatterns()).toEqual([]);
    },
  );
});

describe("isPublicSupabaseImage", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", PROJECT_URL);
  });

  const cases: [string, boolean][] = [
    [PUBLIC_IMAGE, true],
    [`${PUBLIC_IMAGE}?v=2`, true],
    [PUBLIC_IMAGE.replace("https://", "http://"), false],
    [PUBLIC_IMAGE.replace("abcdefgh", "autre"), false],
    [PUBLIC_IMAGE.replace(".co/", ".co:8443/"), false],
    [PUBLIC_IMAGE.replace("/public/", "/sign/"), false],
    [`${PROJECT_URL}/storage/v1/object/public/../sign/travelhub-images/a.webp`, false],
    ["https://images.example.org/japon.jpg", false],
  ];

  it.each(cases)("%s → %s", (url, expected) => {
    expect(isPublicSupabaseImage(url)).toBe(expected);
  });

  it("suit la même règle que images.remotePatterns de Next.js", () => {
    const patterns = supabaseImagePatterns();

    for (const [url] of cases) {
      expect(isPublicSupabaseImage(url), url).toBe(hasRemoteMatch([], patterns, new URL(url)));
    }
  });

  it("refuse tout sans SUPABASE_URL, et une chaîne qui n'est pas une adresse", () => {
    expect(isPublicSupabaseImage("pas une adresse")).toBe(false);

    vi.stubEnv("SUPABASE_URL", "");
    expect(isPublicSupabaseImage(PUBLIC_IMAGE)).toBe(false);
  });
});
