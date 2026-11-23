// Faux magasin de cookies qui remplace cookies() de next/headers (voir tests/setup.ts).
// En dehors d'une requête Next.js, le vrai cookies() lève une erreur. Un test pose un
// jeton avec cookieJar.set("th_access", "…"), et le magasin est vidé après chaque test.

export const cookieJar = new Map<string, string>();

export async function fakeCookies() {
  return {
    get(name: string) {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
  };
}
