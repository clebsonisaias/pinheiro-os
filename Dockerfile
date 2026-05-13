# Pinheiro OS — Docker image
# Multi-stage: build do portal Vite + runtime Node enxuto.

# ── Stage 1: build do frontend ────────────────────────────────────────────
FROM node:20-alpine AS portal-build
WORKDIR /build
COPY portal-tecnico/package*.json ./
RUN npm install --no-audit --no-fund
COPY portal-tecnico/ ./
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Backend deps
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
