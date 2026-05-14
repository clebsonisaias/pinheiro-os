# Pinheiro OS — Docker image
# Multi-stage: build do portal Vite + runtime Node enxuto.

# ── Stage 1: build do frontend ────────────────────────────────────────────
FROM node:20-alpine AS portal-build
WORKDIR /build

# Instala devDeps (vite, @vitejs/plugin-react). --include=dev garante isso
# mesmo se o Coolify injetar NODE_ENV=production em build-time.
COPY portal-tecnico/package*.json ./
RUN npm install --include=dev --no-audit --no-fund

# CRÍTICO: build do Vite com NODE_ENV=production, senão gera bundle de dev
# (não minificado, com warnings/checks que travam em produção e dobram
# o tamanho do JS). Coolify às vezes injeta NODE_ENV=development.
COPY portal-tecnico/ ./
ENV NODE_ENV=production
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

# Healthcheck via /api/health usando fetch nativo do Node 20 (sem dep de wget/curl).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

EXPOSE 4000
CMD ["node", "server.js"]
