# 🌲 Pinheiro OS

Sistema de Gestão de Ordens de Serviço de campo. Agrega OS do **SGP** e do **Maxxi** numa fila única e operada pelos técnicos da prestadora.

> Projeto **independente** do Maxxi. Roda em servidor próprio, banco próprio, mesma infra.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 20+ ESM (Express 5) |
| Banco | PostgreSQL (database `pinheiro_os` — mesmo servidor do Maxxi) |
| Frontend | React 18 + Vite + PWA |
| IA | Whisper (OpenAI) para transcrição de voz |
| Deploy | Docker (multi-stage build) → Coolify |

## Estrutura

```
pinheiro/
├── server.js                # Entry point Express
├── package.json
├── Dockerfile               # Multi-stage: build Vite + runtime Node
├── .env.example
├── src/
│   ├── routes/
│   │   ├── index.js         # Router agregador
│   │   ├── auth.js          # /api/agentes/{login,logout,me}
│   │   ├── os.js            # /api/os/*
│   │   └── ia.js            # /api/ia/{transcribe,diagnostico,duplicadas}
│   └── services/
│       ├── db.js            # Pool PG + ensureDatabase()
│       ├── db-migrate.js    # Schema (14 tabelas)
│       └── sync-maxxi.js    # Puxa tickets técnico/instalação do Maxxi (30s)
└── portal-tecnico/          # SPA React (PWA do técnico)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── pages/...        # TecnicoApp, LoginScreen, HomeScreen, IA, etc.
```

## Setup local

```bash
cd pinheiro
cp .env.example .env          # edite com suas credenciais
npm install                   # backend
cd portal-tecnico && npm install && cd ..
npm run dev                   # backend em 4000
# em outro terminal:
cd portal-tecnico && npm run dev  # frontend Vite em 5173 (com proxy /api → 4000)
```

Primeiro login: `admin` / `admin123` (configurável via `PINHEIRO_ADMIN_SENHA`).

## Build de produção

```bash
npm run build:all             # builda o portal Vite (dist/) e instala deps
npm start                     # serve API + SPA estático na mesma porta
```

## Docker

```bash
docker build -t pinheiro-os .
docker run -p 4000:4000 --env-file .env pinheiro-os
```

## Deploy Coolify

1. Aponte um app novo para este repo (pasta `/pinheiro`)
2. Configure as variáveis de ambiente do `.env.example`
3. Adicione subdomínio: `pinheiro.citmax.com.br`
4. Deploy — o Dockerfile já faz tudo

## Integração com Maxxi

O Pinheiro consome **somente** a API pública do Maxxi (`/api/v1/*`):

- Puxa tickets das categorias **técnico** e **instalação** (filtro automático)
- Marca cada ticket importado como `os.fonte='MXX'`
- Sync incremental a cada 30s (cursor `updated_since` em `sistema_kv`)
- Conflitos `UNIQUE(fonte, fonte_id)` → upsert idempotente

Para habilitar:
```env
MAXXI_API_URL=https://citmax.com.br/api/v1
MAXXI_API_KEY=<chave com escopo read>
```

## Endpoints

```
POST   /api/agentes/login
POST   /api/agentes/logout
GET    /api/agentes/me
PUT    /api/agentes/me/senha

GET    /api/os/minhas              ?status=&dia=hoje
GET    /api/os/fila                (despachador/admin)
GET    /api/os/:id                 detalhe completo (eventos, fotos, checklist…)
POST   /api/os                     criar OS local
PUT    /api/os/:id/status
PUT    /api/os/:id/atribuir        (despachador/admin)
POST   /api/os/:id/observacao
POST   /api/os/:id/checklist/:itemId/toggle

POST   /api/ia/transcribe          multipart (audio + contexto)
GET    /api/ia/diagnostico/:os_id
GET    /api/ia/duplicadas/:os_id
POST   /api/ia/duplicadas/dispensar
POST   /api/ia/agentes/posicao     GPS heartbeat

GET    /api/health
```

## Banco

- Database: `pinheiro_os` (criado automaticamente se o user PG tiver `CREATEDB`)
- 14 tabelas: agentes, sessões, OS, eventos, fotos, checklist, observações, posições, push, IA caches, audit log, veículos, estoque
- Todas migrações são `CREATE IF NOT EXISTS` — seguro rodar em todo boot
