# Pinheiro OS — Docker image
# Multi-stage: build do portal Vite + runtime Node enxuto.

# ── Stage 1: build do frontend ────────────────────────────────────────────
FROM node:20-alpine AS portal-build
# Força modo "development" durante o build, senão npm pula devDependencies
# (vite, @vitejs/plugin-react). Coolify costuma injetar NODE_ENV=production
# em build-time o que quebra tudo.
ENV NODE_ENV=development
WORKDIR /build
COPY portal-tecnico/package*.json ./
# --include=dev é o cinto-e-suspensório: garante devDeps independente de NODE_ENV
RUN npm install --include=dev --no-audit --no-fund
COPY portal-tecnico/ ./
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# @node-rs/bcrypt já vem com binários prebuilt pra alpine — não precisa
# de python3/make/g++ como o bcrypt nativo.

# Backend deps (somente production)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Código do backend
COPY server.js ./
COPY src/ ./src/

# SPA buildado vem do stage anterior
COPY --from=portal-build /build/dist ./portal-tecnico/dist

# Healthcheck via /api/health
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1

EXPOSE 4000
CMD ["node", "server.js"]
