// @vitest-environment node
// Server Action de l'image de couverture : nous l'appelons comme une fonction, avec MSW
// à la place de Django et de Supabase Storage (tests/msw/supabase.ts).
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadTripCover } from "@/actions/upload";
import type { TripDetail } from "@/types/api";
import { imageFile, redirectTarget } from "../helpers";
import { cookieJar } from "../mocks/cookies";
import { japanTripDetail, validTokens } from "../msw/fixtures";
import { DJANGO_URL, errorBody } from "../msw/handlers";
import { server } from "../msw/server";
import { PUBLIC_IMAGES_URL, STORAGE_OBJECTS_URL, SUPABASE_TEST_URL } from "../msw/supabase";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

const TRIP_URL = `${DJANGO_URL}/api/trips/1/`;

/** Nom créé par l'action : trips/1/<uuid>.<extension>. */
const COVER_PATH = /^trips\/1\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Ancienne image du voyage 1, créée par une action précédente. */
const PREVIOUS_PATH = "trips/1/0f8fad5b-d9cb-469f-a165-70867728950e.jpg";

function formWith(file: File | string): FormData {
  const formData = new FormData();
  formData.set("file", file);
  return formData;
}

/** Le voyage 1 tel que Django le renvoie, avec quelques champs changés. */
function tripIs(changes: Partial<TripDetail>) {
  server.use(http.get(TRIP_URL, () => HttpResponse.json({ ...japanTripDetail, ...changes })));
}

/** Copie de chaque requête envoyée pendant le test, à Django comme à Supabase. */
function recordRequests(): Request[] {
  const requests: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.clone());
  });
  return requests;
}

function storageRequests(requests: Request[], method: "POST" | "DELETE"): Request[] {
  return requests.filter((r) => r.method === method && r.url.startsWith(SUPABASE_TEST_URL));
}

function djangoPatches(requests: Request[]): Request[] {
  return requests.filter((r) => r.method === "PATCH" && r.url.startsWith(DJANGO_URL));
}

/** Chemins supprimés dans le bucket ({"prefixes": [...]} de chaque DELETE). */
async function removedPaths(requests: Request[]): Promise<string[]> {
  const bodies = await Promise.all(
    storageRequests(requests, "DELETE").map((r) => r.json() as Promise<{ prefixes: string[] }>),
  );
  return bodies.flatMap((body) => body.prefixes);
}

function uploadedPath(request: Request): string {
  return decodeURIComponent(new URL(request.url).pathname).replace(
    new URL(`${STORAGE_OBJECTS_URL}/`).pathname,
    "",
  );
}

beforeEach(() => {
  revalidatePath.mockClear();
  // Utilisateur connecté : verifyActionSession() appelle /api/auth/me/ avec ce jeton.
  cookieJar.set("th_access", validTokens.access);
  cookieJar.set("th_refresh", validTokens.refresh);
});

describe("uploadTripCover", () => {
  it("envoie l'image dans Supabase, enregistre son adresse dans Django et rafraîchit les pages", async () => {
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(imageFile({ size: 2048 })));

    expect(result).toEqual({ ok: true });
    const [upload] = storageRequests(requests, "POST");
    expect(upload).toBeDefined();
    if (!upload) return;
    const path = uploadedPath(upload);
    expect(path).toMatch(COVER_PATH);
    expect(path.endsWith(".webp")).toBe(true);
    expect(upload.headers.get("content-type")).toBe("image/webp");
    expect(upload.headers.get("cache-control")).toBe("max-age=31536000");
    expect(upload.headers.get("x-upsert")).toBe("false");
    expect((await upload.arrayBuffer()).byteLength).toBe(2048);

    const [patch] = djangoPatches(requests);
    await expect(patch?.json()).resolves.toEqual({
      cover_image_url: `${PUBLIC_IMAGES_URL}${path}`,
    });
    // Le voyage n'avait pas d'image : rien à supprimer.
    expect(storageRequests(requests, "DELETE")).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/trips/1");
    expect(revalidatePath).toHaveBeenCalledWith("/trips");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("supprime l'ancienne image après l'enregistrement de la nouvelle", async () => {
    tripIs({ cover_image_url: `${PUBLIC_IMAGES_URL}${PREVIOUS_PATH}` });
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(imageFile({ type: "image/png" })));

    expect(result).toEqual({ ok: true });
    await expect(removedPaths(requests)).resolves.toEqual([PREVIOUS_PATH]);
  });

  it.each([
    [
      "d'un autre hôte",
      `https://images.example.org/storage/v1/object/public/travelhub-images/${PREVIOUS_PATH}`,
    ],
    ["d'un autre voyage", `${PUBLIC_IMAGES_URL}trips/2/0f8fad5b-d9cb-469f-a165-70867728950e.jpg`],
    ["au nom choisi à la main", `${PUBLIC_IMAGES_URL}trips/1/japon.jpg`],
  ])("ne supprime pas une ancienne image %s", async (_, url) => {
    tripIs({ cover_image_url: url });
    const requests = recordRequests();

    await expect(uploadTripCover(1, formWith(imageFile()))).resolves.toEqual({ ok: true });

    expect(storageRequests(requests, "DELETE")).toHaveLength(0);
  });

  it("garde le type trouvé dans les octets, même si l'extension annonce un autre format", async () => {
    // Un JPEG nommé photo.png : le navigateur annonce image/png.
    const jpeg = new File([await imageFile({ type: "image/jpeg" }).arrayBuffer()], "photo.png", {
      type: "image/png",
    });
    const requests = recordRequests();

    await expect(uploadTripCover(1, formWith(jpeg))).resolves.toEqual({ ok: true });

    const [upload] = storageRequests(requests, "POST");
    expect(upload?.headers.get("content-type")).toBe("image/jpeg");
    expect(upload && uploadedPath(upload)).toMatch(/\.jpg$/);
  });

  it("refuse un lecteur sans rien envoyer à Supabase", async () => {
    tripIs({ my_role: "viewer" });
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(imageFile()));

    expect(result).toEqual({
      ok: false,
      message: "Seuls le propriétaire et les éditeurs peuvent changer l'image du voyage.",
      fieldErrors: {},
    });
    expect(requests.filter((r) => r.url.startsWith(SUPABASE_TEST_URL))).toHaveLength(0);
    expect(djangoPatches(requests)).toHaveLength(0);
  });

  it.each([
    ["un PDF", imageFile({ type: "application/pdf" }), "Choisissez une image JPEG, PNG ou WebP."],
    [
      "une image de 6 Mo",
      imageFile({ size: 6 * 1024 * 1024 }),
      "L'image dépasse 4 Mo. Choisissez une image plus légère.",
    ],
    ["un texte à la place du fichier", "photo.webp", "Choisissez une image."],
  ])("refuse %s avant l'envoi", async (_, file, message) => {
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(file));

    expect(result).toEqual({ ok: false, message, fieldErrors: { file: [message] } });
    expect(requests.filter((r) => r.url.startsWith(SUPABASE_TEST_URL))).toHaveLength(0);
  });

  it("refuse un PDF renommé en .png grâce aux premiers octets", async () => {
    const fakePng = new File(
      [await imageFile({ type: "application/pdf" }).arrayBuffer()],
      "photo.png",
      { type: "image/png" },
    );
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(fakePng));

    const message = "Le contenu du fichier n'est pas une image JPEG, PNG ou WebP valide.";
    expect(result).toEqual({ ok: false, message, fieldErrors: { file: [message] } });
    expect(storageRequests(requests, "POST")).toHaveLength(0);
  });

  it("supprime le fichier envoyé si Django refuse l'adresse", async () => {
    server.use(
      http.patch(TRIP_URL, () =>
        HttpResponse.json(
          errorBody("validation_error", "Les données envoyées sont invalides.", {
            cover_image_url: ["L'image doit être hébergée sur abcdefgh.supabase.co."],
          }),
          { status: 400 },
        ),
      ),
    );
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(imageFile()));

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { file: ["L'image doit être hébergée sur abcdefgh.supabase.co."] },
    });
    const [upload] = storageRequests(requests, "POST");
    expect(upload).toBeDefined();
    await expect(removedPaths(requests)).resolves.toEqual([upload && uploadedPath(upload)]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("supprime le fichier envoyé puis déconnecte si le jeton expire pendant le PATCH", async () => {
    server.use(
      http.patch(TRIP_URL, () =>
        HttpResponse.json(errorBody("token_not_valid", "Token is invalid or expired"), {
          status: 401,
        }),
      ),
    );
    const requests = recordRequests();

    const target = await redirectTarget(uploadTripCover(1, formWith(imageFile())));

    expect(target).toMatch(/^\/login\?expired=1/);
    await expect(removedPaths(requests)).resolves.toHaveLength(1);
    expect(cookieJar.has("th_access")).toBe(false);
  });

  it.each([
    [
      "refuse l'envoi",
      () =>
        HttpResponse.json(
          {
            statusCode: "413",
            error: "Payload too large",
            message: "The object exceeded the maximum allowed size",
          },
          { status: 413 },
        ),
    ],
    ["ne répond pas", () => HttpResponse.error()],
  ])("répond par un message si Supabase %s, sans appeler Django", async (_, reply) => {
    server.use(http.post(`${STORAGE_OBJECTS_URL}/*`, reply));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const requests = recordRequests();

    const result = await uploadTripCover(1, formWith(imageFile()));

    expect(result).toEqual({
      ok: false,
      message: "L'image n'a pas pu être envoyée. Réessayez dans un instant.",
      fieldErrors: {},
    });
    expect(djangoPatches(requests)).toHaveLength(0);
  });

  it("répond par un message si Supabase n'est pas configuré", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await uploadTripCover(1, formWith(imageFile()));

      expect(result).toEqual({
        ok: false,
        message: "L'envoi d'images n'est pas configuré sur ce serveur.",
        fieldErrors: {},
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    ["un bucket mal écrit dans SUPABASE_BUCKET", "SUPABASE_BUCKET", "travelhub-image"],
    ["une clé que Supabase refuse", "SUPABASE_SECRET_KEY", "cle-refusee"],
  ])("dit que l'envoi n'est pas configuré pour %s, sans appeler Django", async (_, name, value) => {
    vi.stubEnv(name, value);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const requests = recordRequests();

    try {
      const result = await uploadTripCover(1, formWith(imageFile()));

      expect(result).toEqual({
        ok: false,
        message: "L'envoi d'images n'est pas configuré sur ce serveur.",
        fieldErrors: {},
      });
      // Le journal du serveur nomme les variables à vérifier, sans jamais la clé.
      expect(String(logged.mock.calls[0]?.[0])).toContain("Vérifiez SUPABASE_BUCKET");
      expect(JSON.stringify(logged.mock.calls)).not.toContain("cle-refusee");
      expect(djangoPatches(requests)).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([0, -3, 1.5, Number.NaN])("refuse l'identifiant %s sans appeler Django", async (id) => {
    const requests = recordRequests();

    const result = await uploadTripCover(id, formWith(imageFile()));

    expect(result).toMatchObject({
      ok: false,
      message: "Ce voyage est introuvable. Il a peut-être été supprimé.",
    });
    expect(requests.filter((r) => r.url.includes("/api/trips/"))).toHaveLength(0);
  });

  it("répond « introuvable » quand Django ne trouve pas le voyage", async () => {
    const requests = recordRequests();

    const result = await uploadTripCover(99, formWith(imageFile()));

    expect(result).toEqual({
      ok: false,
      message: "Cet élément est introuvable. Il a peut-être été supprimé.",
      fieldErrors: {},
    });
    expect(requests.filter((r) => r.url.startsWith(SUPABASE_TEST_URL))).toHaveLength(0);
  });

  it("redirige vers la connexion sans session, avant tout envoi", async () => {
    cookieJar.clear();
    const requests = recordRequests();

    const target = await redirectTarget(uploadTripCover(1, formWith(imageFile())));

    expect(target).toMatch(/^\/login\?expired=1/);
    expect(requests.filter((r) => r.url.startsWith(SUPABASE_TEST_URL))).toHaveLength(0);
  });
});
