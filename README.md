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

# Chat interno (comunicação oficial entre funcionários)
GET    /api/chat/conversas         minhas conversas (DM/grupo/canal) + unread
GET    /api/chat/agentes           agentes ativos p/ iniciar DM/grupo (+ presença)
POST   /api/chat/dm                get-or-create conversa 1:1
POST   /api/chat/conversas         criar grupo ou canal de avisos (canal = admin)
GET    /api/chat/conversas/:id     detalhe + participantes
GET    /api/chat/conversas/:id/mensagens   ?before=&limit=  (cursor)
POST   /api/chat/conversas/:id/mensagens   enviar texto
POST   /api/chat/conversas/:id/anexos      enviar foto/áudio/vídeo (multipart)
POST   /api/chat/conversas/:id/ler         marca lido até uma mensagem
GET    /api/chat/conversas/:id/mensagens/:msgId/recibos   "quem leu" (avisos)
GET    /api/chat/media/:id         download/stream com Range (URL assinada)
GET    /api/chat/stats             KPI "Conversas 7d"
PUT    /api/chat/perfil/assinatura assinatura nas mensagens

POST   /api/sse-ticket             ticket p/ SSE (autenticado)
GET    /admin/chat/stream          stream SSE em tempo real (via ticket)

GET    /api/push/vapid-key         chave pública VAPID
POST   /api/push/subscribe         registra inscrição push do agente

GET    /api/health
```

### Chat interno em tempo real

- **DM, grupos e canal de avisos** (só admin posta, com confirmação de "quem leu").
- Mensagens de **texto, foto (com geotag), áudio e vídeo**.
- **Tempo real via SSE** + **push** para quem está offline; **presença** online/last-seen.
- **Mídia em volume no servidor** (`UPLOAD_DIR`), servida com suporte a `Range`
  (áudio/vídeo). ⚠️ No deploy, monte `UPLOAD_DIR` como **volume persistente** e
  defina `APP_SECRET` (assina as URLs de mídia) e as chaves `VAPID_*`.

## Banco

- Database: `pinheiro_os` (criado automaticamente se o user PG tiver `CREATEDB`)
- Tabelas de OS/agentes: agentes, sessões, OS, eventos, fotos, checklist, observações, posições, push, IA caches, audit log, veículos, estoque
- Tabelas do chat: `chat_conversas`, `chat_participantes`, `chat_mensagens`, `chat_anexos`, `chat_recibos`, `chat_reacoes`
- Todas migrações são `CREATE IF NOT EXISTS` — seguro rodar em todo boot
