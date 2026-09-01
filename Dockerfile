# syntax=docker/dockerfile:1

# Build stage: needs the devDependencies, since the build is just `tsc`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production dependencies, resolved apart from the build so the final image
# never sees typescript, jest or stryker.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Long polling opens an outbound connection and listens on nothing; this port
# only matters when WEBHOOK_URL is set.
EXPOSE 3000

USER node
CMD ["node", "dist/index.js"]
