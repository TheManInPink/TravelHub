// Noms des cookies httpOnly qui gardent les jetons JWT de Django.
// djangoFetch lit th_access. Les Server Actions de connexion (étape 4) posent les deux
// cookies, et proxy.ts rafraîchit th_access avec th_refresh. Ces noms ne sont pas secrets,
// donc ce fichier n'importe pas « server-only ».

export const ACCESS_COOKIE = "th_access";
export const REFRESH_COOKIE = "th_refresh";
