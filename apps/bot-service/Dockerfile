FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot-service/package.json ./apps/bot-service/
COPY packages ./packages

# Install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --filter bot-service...

COPY apps/bot-service ./apps/bot-service

# Build bot-service
WORKDIR /app/apps/bot-service
RUN pnpm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache curl

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bot-service/package.json ./apps/bot-service/

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod --filter bot-service...

COPY --from=builder /app/apps/bot-service/dist ./apps/bot-service/dist

WORKDIR /app/apps/bot-service

EXPOSE 3000

CMD ["node", "dist/main.js"]
