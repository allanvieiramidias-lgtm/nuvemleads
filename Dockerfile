# Versões: DECISOES §1. Imagem gerada no GitHub Actions (DECISOES §15). Ajustes: DECISOES §28.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev && rm -rf .next/cache

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 1001 app && mkdir -p /data/uploads && chown app /data/uploads
WORKDIR /app
# HOSTNAME: o Docker preenche com o id do contêiner; o servidor precisa ouvir em todas as interfaces.
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=app /app/package.json ./
COPY --from=build --chown=app /app/next.config.ts ./
COPY --from=build --chown=app /app/node_modules ./node_modules
COPY --from=build --chown=app /app/drizzle ./drizzle
COPY --from=build --chown=app /app/public ./public
COPY --from=build --chown=app /app/.next ./.next
COPY --from=build --chown=app /app/dist ./dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
