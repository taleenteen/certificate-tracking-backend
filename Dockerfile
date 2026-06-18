# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /usr/src/app

FROM base AS development
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npx prisma generate
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

FROM base AS build
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
# Keep ALL node_modules (including devDeps: prisma CLI, ts-node) so the
# production entrypoint can run `prisma migrate deploy` and seed via ts-node.
RUN npx prisma generate && npm run build

FROM node:20-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
# Copy everything including devDeps so entrypoint has prisma + ts-node for seed
COPY --from=build --chown=app:app /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=app:app /usr/src/app/dist ./dist
COPY --from=build --chown=app:app /usr/src/app/prisma ./prisma
COPY --from=build --chown=app:app /usr/src/app/src ./src
COPY --from=build --chown=app:app /usr/src/app/package.json ./package.json
COPY --from=build --chown=app:app /usr/src/app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=app:app /usr/src/app/tsconfig.json ./tsconfig.json
COPY --chown=app:app docker-entrypoint.prod.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER app
EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
