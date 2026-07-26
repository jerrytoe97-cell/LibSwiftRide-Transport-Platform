FROM node:26-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM base AS dependencies
COPY pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY apps/api apps/api
RUN pnpm --filter @libswiftride/api prisma:generate && pnpm --filter @libswiftride/api build

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=app:app /app/apps/api/package.json ./apps/api/package.json
USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
