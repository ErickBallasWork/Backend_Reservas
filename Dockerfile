# Imagen del backend para Azure Container Apps (BE-24).
# Construir:  docker build -t backend-reservas .
# Probar:     docker run -p 3001:3001 --env-file .env backend-reservas

# ---- Etapa 1: compilar ----
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- Etapa 2: imagen final, solo lo necesario para correr ----
FROM node:22-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
