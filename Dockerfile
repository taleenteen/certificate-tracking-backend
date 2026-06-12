# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /usr/src/app

FROM base AS development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:20-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=app:app /usr/src/app/dist ./dist
COPY --from=build --chown=app:app /usr/src/app/prisma ./prisma
USER app
EXPOSE 3001
CMD ["node", "dist/main.js"]
