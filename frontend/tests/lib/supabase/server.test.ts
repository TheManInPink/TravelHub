// @vitest-environment node
// Client Supabase du serveur : lecture des variables au moment de l'appel, messages
// clairs quand une variable manque, et adresses publiques du bucket.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase, imageBucket, storagePathOf } from "@/lib/supabase/server";

const PROJECT_URL = "https://abcdefgh.supabase.co";
const BUCKET = "travelhub-images";
const PUBLIC_PREFIX = `${PROJECT_URL}/storage/v1/object/public/${BUCKET}/`;

function stubSettings(overrides: Partial<Record<string, string>> = {}) {
  const settings = {
    SUPABASE_URL: PROJECT_URL,
    SUPABASE_SECRET_KEY: "cle-secrete-factice",
    SUPABASE_BUCKET: BUCKET,
    ...overrides,
  };
  for (const [name, value] of Object.entries(settings)) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabase", () => {
  it("ne lit pas les variables au chargement du module", async () => {
    stubSettings({ SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_BUCKET: "" });
    vi.resetModules();

    // Le build importe ce module sans les variables : l'import ne doit pas échouer.
    const server = await import("@/lib/supabase/server");

    expect(() => server.getSupabase()).toThrow(
      "Variables manquantes pour Supabase : SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_BUCKET.",
    );
  });

  it("nomme seulement les variables qui manquent", () => {
    stubSettings({ SUPABASE_BUCKET: "  " });

    expect(() => getSupabase()).toThrow("Variables manquantes pour Supabase : SUPABASE_BUCKET.");
  });

  it.each(["abcdefgh.supabase.co", "http://abcdefgh.supabase.co"])(
    "refuse une adresse qui n'est pas en https : %s",
    (value) => {
      stubSettings({ SUPABASE_URL: value });

      expect(() => getSupabase()).toThrow(/SUPABASE_URL doit être l'adresse https du projet/);
    },
  );

  it("refuse la clé publiable, qui ne peut pas écrire dans le bucket", () => {
    stubSettings({ SUPABASE_SECRET_KEY: "sb_publishable_abc123" });

    expect(() => getSupabase()).toThrow(/SUPABASE_SECRET_KEY contient la clé publiable/);
  });

  it("ne met jamais la clé dans le message d'erreur", () => {
    stubSettings({ SUPABASE_URL: "pas-une-adresse" });

    expect(() => getSupabase()).toThrow(Error);
    expect(() => getSupabase()).not.toThrow(/cle-secrete-factice/);
  });
});

describe("imageBucket", () => {
  it("construit l'adresse publique à partir de SUPABASE_URL et SUPABASE_BUCKET", () => {
    stubSettings({ SUPABASE_URL: ` ${PROJECT_URL}/ ` });

    const { data } = imageBucket().getPublicUrl("trips/1/photo.webp");

    expect(data.publicUrl).toBe(`${PUBLIC_PREFIX}trips/1/photo.webp`);
  });
});

describe("storagePathOf", () => {
  beforeEach(() => {
    stubSettings();
  });

  it("renvoie le chemin d'une image du bucket", () => {
    expect(storagePathOf(`${PUBLIC_PREFIX}trips/1/photo.webp`)).toBe("trips/1/photo.webp");
  });

  it.each([
    [
      "un autre hôte",
      "https://images.example.org/storage/v1/object/public/travelhub-images/a.webp",
    ],
    ["un autre bucket", `${PROJECT_URL}/storage/v1/object/public/autre-bucket/a.webp`],
    ["une adresse privée", `${PROJECT_URL}/storage/v1/object/sign/travelhub-images/a.webp`],
    ["le bucket sans fichier", PUBLIC_PREFIX],
    ["une chaîne qui n'est pas une adresse", "pas une adresse"],
  ])("renvoie null pour %s", (_, url) => {
    expect(storagePathOf(url)).toBeNull();
  });
});
