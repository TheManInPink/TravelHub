// @vitest-environment node
// next.config.ts : images de Supabase, taille des Server Actions et en-têtes de sécurité.
// Le fichier lit SUPABASE_URL au chargement : chaque test le recharge avec sa valeur.
import { afterEach, describe, expect, it, vi } from "vitest";

const PROJECT_URL = "https://abcdefgh.supabase.co";

async function loadConfig(supabaseUrl: string) {
  vi.stubEnv("SUPABASE_URL", supabaseUrl);
  vi.resetModules();
  const { default: config } = await import("../next.config");
  return config;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("next.config.ts", () => {
  it("autorise les images publiques du projet Supabase", async () => {
    const config = await loadConfig(PROJECT_URL);

    // La règle elle-même est testée dans tests/lib/supabase/images.test.ts.
    expect(config.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "abcdefgh.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ]);
  });

  it.each(["", "abcdefgh.supabase.co", "http://abcdefgh.supabase.co"])(
    "n'autorise aucune image distante avec SUPABASE_URL = « %s »",
    async (value) => {
      const config = await loadConfig(value);

      expect(config.images?.remotePatterns).toEqual([]);
    },
  );

  it("garde le build habituel sans NEXT_OUTPUT (Vercel, npm run start)", async () => {
    const config = await loadConfig(PROJECT_URL);

    expect(config.output).toBeUndefined();
  });

  it("crée la sortie standalone pour l'image Docker avec NEXT_OUTPUT=standalone", async () => {
    vi.stubEnv("NEXT_OUTPUT", "standalone");
    const config = await loadConfig(PROJECT_URL);

    expect(config.output).toBe("standalone");
  });

  it("accepte des Server Actions de 5 Mo, pour une image de 4 Mo", async () => {
    const config = await loadConfig(PROJECT_URL);

    expect(config.experimental?.serverActions?.bodySizeLimit).toBe("5mb");
  });

  it("ajoute les en-têtes de sécurité à toutes les réponses", async () => {
    const config = await loadConfig(PROJECT_URL);

    const rules = (await config.headers?.()) ?? [];

    expect(rules).toHaveLength(1);
    expect(rules[0]?.source).toBe("/:path*");
    expect(Object.fromEntries(rules[0]?.headers.map((h) => [h.key, h.value]) ?? [])).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });
});
