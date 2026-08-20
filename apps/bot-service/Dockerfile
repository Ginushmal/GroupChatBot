# --- build stage ---
FROM ghcr.io/voidzero-dev/vite-plus:latest AS build
WORKDIR /app

# Copy all workspace manifests first for better Docker layer caching
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=vp:vp apps/bot-service/package.json ./apps/bot-service/
COPY --chown=vp:vp apps/admin-ui/package.json ./apps/admin-ui/
COPY --chown=vp:vp packages ./packages

# Install all dependencies (no --filter, matches official Vite+ Docker guide)
RUN vp install --frozen-lockfile

# Copy bot-service source and build
COPY --chown=vp:vp apps/bot-service ./apps/bot-service
WORKDIR /app/apps/bot-service
RUN vp run build

# Export the exact resolved Node.js binary for the runtime stage
RUN cp "$(vp env which node | head -1)" /tmp/node

# --- deps stage: production-only dependencies ---
FROM ghcr.io/voidzero-dev/vite-plus:latest AS deps
WORKDIR /app

COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=vp:vp apps/bot-service/package.json ./apps/bot-service/
COPY --chown=vp:vp apps/admin-ui/package.json ./apps/admin-ui/
COPY --chown=vp:vp packages ./packages

RUN vp install --frozen-lockfile --prod

# --- runtime stage: small, no vp ---
FROM debian:bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install curl for docker-compose healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy the exact Node.js binary resolved by Vite+
COPY --from=build /tmp/node /usr/local/bin/node

# Copy production node_modules, workspace packages, and built output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/apps/bot-service/node_modules ./apps/bot-service/node_modules
COPY --from=build /app/apps/bot-service/dist ./apps/bot-service/dist
COPY --from=build /app/apps/bot-service/package.json ./apps/bot-service/package.json

WORKDIR /app/apps/bot-service

EXPOSE 3000
CMD ["node", "dist/main.js"]
