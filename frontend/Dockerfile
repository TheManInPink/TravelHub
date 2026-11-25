# Image de production du front-end Next.js, pour lancer toute la pile sur notre poste avec
# docker compose (service frontend du docker-compose.yml de la racine). En ligne, le
# front-end tourne sur Vercel, qui n'utilise pas ce fichier.
# Pour construire l'image seule, depuis la racine : docker build -t travelhub-frontend frontend

# Étape 1 : les dépendances, aux versions exactes de package-lock.json. Le cache de npm est
# gardé par BuildKit entre deux constructions, ce qui évite de tout retélécharger.
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund


# Étape 2 : le build de production, en sortie standalone (voir output dans next.config.ts).
FROM node:26-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ces deux valeurs sont figées dans le build. NEXT_PUBLIC_SITE_URL arrive dans le
# JavaScript du navigateur, et SUPABASE_URL donne la liste des images que next/image peut
# optimiser (images.remotePatterns). Aucune n'est un secret. Les secrets (clé Supabase)
# arrivent seulement au démarrage du conteneur, et n'entrent donc jamais dans l'image.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG SUPABASE_URL=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    SUPABASE_URL=$SUPABASE_URL \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# Étape 3 : l'image d'exécution. Elle contient server.js et les seuls fichiers de
# node_modules qu'il utilise, sans npm ni les dépendances de développement.
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Les fichiers appartiennent à root, donc le serveur ne peut pas les modifier. server.js ne
# copie pas .next/static tout seul : sans lui, la page arrive sans CSS ni JavaScript.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Seul dossier où le serveur écrit : le cache des images optimisées par next/image.
RUN install -d -o node -g node /app/.next/cache

# L'utilisateur node existe déjà dans l'image officielle de Node.js.
USER node

EXPOSE 3000

# /login s'affiche sans session et sans appeler Django. Node 26 a fetch de base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "server.js"]
