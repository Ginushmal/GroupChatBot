FROM ghcr.io/voidzero-dev/vite-plus:latest AS build
WORKDIR /app

# Copy all workspace manifests first for better Docker layer caching
COPY --chown=vp:vp package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=vp:vp apps/admin-ui/package.json ./apps/admin-ui/
COPY --chown=vp:vp apps/bot-service/package.json ./apps/bot-service/
COPY --chown=vp:vp packages ./packages

# Install all dependencies (no --filter, matches official Vite+ Docker guide)
RUN vp install --frozen-lockfile

# Copy admin-ui source and build
COPY --chown=vp:vp apps/admin-ui ./apps/admin-ui
WORKDIR /app/apps/admin-ui
RUN vp run build

# Serve static files with nginx
FROM nginx:alpine AS runtime
COPY --from=build /app/apps/admin-ui/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
