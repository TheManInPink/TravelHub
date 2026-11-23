// Faux cookies() et headers() qui remplacent ceux de next/headers (voir tests/setup.ts).
// En dehors d'une requête Next.js, les vrais lèvent une erreur. Un test pose un jeton
// avec cookieJar.set("th_access", "…") ou un en-tête avec requestHeaders.set(…). Tout
// est vidé après chaque test.

export const cookieJar = new Map<string, string>();

/** Options du dernier set() de chaque cookie (maxAge, httpOnly…), pour les vérifier. */
export const cookieOptions = new Map<string, Record<string, unknown>>();

/** En-têtes de la requête en cours, lus par headers(). */
export const requestHeaders = new Headers();

interface CookieInit {
  name: string;
  value: string;
  [option: string]: unknown;
}

export async function fakeCookies() {
  return {
    get(name: string) {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    has(name: string) {
      return cookieJar.has(name);
    },
    set(cookie: CookieInit) {
      const { name, value, ...options } = cookie;
      cookieJar.set(name, value);
      cookieOptions.set(name, options);
    },
    delete(name: string) {
      cookieJar.delete(name);
      cookieOptions.delete(name);
    },
  };
}

export async function fakeHeaders() {
  return requestHeaders;
}

/** Vide les cookies et les en-têtes entre deux tests. */
export function resetRequestMocks() {
  cookieJar.clear();
  cookieOptions.clear();
  for (const name of [...requestHeaders.keys()]) {
    requestHeaders.delete(name);
  }
}
