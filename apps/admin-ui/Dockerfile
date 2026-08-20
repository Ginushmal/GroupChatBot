FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-ui/package.json ./apps/admin-ui/
COPY packages ./packages

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --filter admin-ui...

COPY apps/admin-ui ./apps/admin-ui

WORKDIR /app/apps/admin-ui
RUN pnpm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/admin-ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
