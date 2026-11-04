# Un único servicio: la API sirve también la web compilada (mismo origen => cookies fiables en iOS y sin CORS).
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN npm run build -w @fittrack/web && npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/apps/web/dist
COPY --from=build /app /app
USER node
EXPOSE 3000
# Aplica las migraciones pendientes y arranca. PORT lo define el hosting.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && node --import tsx apps/api/src/server.ts"]
