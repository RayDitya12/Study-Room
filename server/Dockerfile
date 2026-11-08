# Build stage: installs every workspace, generates the Prisma client, bundles the server.
FROM node:22-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/tsconfig.json server/tsup.config.ts server/
COPY client/package.json client/package.json
COPY server/prisma server/prisma
COPY shared/src shared/src
COPY server/src server/src

RUN npm ci
# Guarantee the path exists even when every dependency hoists to the root,
# so the runtime COPY below cannot fail.
RUN mkdir -p server/node_modules
RUN npm run build -w server

# Runtime stage. devDependencies are kept on purpose: the CMD below runs
# `npx prisma db push`, and SPEC pins the Prisma CLI as a dev dependency, so
# pruning it would force a download on every container start.
FROM node:22-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app/server

COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/prisma ./prisma

EXPOSE 3001

CMD ["sh","-c","npx prisma db push --skip-generate && node dist/index.js"]
