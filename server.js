/**
 * Pinheiro OS — Servidor Express.
 *
 * Sistema independente que:
 *   - Roda no mesmo VPS do Maxxi mas em container/processo separado
 *   - Usa o mesmo PostgreSQL (database `pinheiro_os` separado)
 *   - Puxa tickets do Maxxi via /api/v1/* (sync periódico)
 *   - Serve seu próprio frontend React (PWA do técnico)
 */
import express from 'express';
import helmet  from 'helmet';
import cors    from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import routerApi from './src/routes/index.js';
import { ensureDatabase } from './src/services/db.js';
import { migrate, seedAdmin } from './src/services/db-migrate.js';
import { iniciarSyncMaxxi } from './src/services/sync-maxxi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 4000;

/* ── Segurança / parsing ──────────────────────────────────────────────── */
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false, // SPA dev — relaxe em prod via reverse proxy
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' })); // base64 de foto até ~15mb
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/* ── Rate limit global (rotas públicas de login) ──────────────────────── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: 'muitas tentativas de login, aguarde' },
});
app.use('/api/agentes/login', loginLimiter);

/* ── API ──────────────────────────────────────────────────────────────── */
app.use(routerApi);

/* ── SPA Estático: portal-tecnico/dist (build do Vite) ────────────────── */
const SPA_DIST = join(__dirname, 'portal-tecnico', 'dist');
if (existsSync(SPA_DIST)) {
  app.use(express.static(SPA_DIST, { maxAge: '30d', index: false }));
  // Catch-all (apenas se NÃO for /api/*)
  app.get(/^(?!\/api).*/, (_req, res) => {
    const indexHtml = join(SPA_DIST, 'index.html');
    if (existsSync(indexHtml)) {
      res.setHeader('Cache-Control', 'no-cache');
      res.send(readFileSync(indexHtml, 'utf8'));
    } else {
      res.status(404).send('SPA não buildado — rode: cd portal-tecnico && npm run build');
    }
  });
} else {
  console.log('ℹ️  SPA dist não existe — backend apenas. Build em: portal-tecnico/');
}

/* ── 404 e error handler ──────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'rota não encontrada', path: req.path }));
app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'erro interno' });
});

/* ── Boot ─────────────────────────────────────────────────────────────── */
(async () => {
  try {
    if (process.env.DATABASE_URL || process.env.DATABASE_URL_PINHEIRO) {
      await ensureDatabase();
      await migrate();
      await seedAdmin();
      console.log('🌲 [Pinheiro OS] banco pronto');
    } else {
      console.warn('⚠️  DATABASE_URL não definida — backend rodando sem DB!');
    }

    // Sync com Maxxi (puxa tickets do tipo técnico/instalação)
    if (process.env.MAXXI_API_URL && process.env.MAXXI_API_KEY) {
      iniciarSyncMaxxi({
        intervaloMs: parseInt(process.env.MAXXI_SYNC_INTERVAL_MS || '30000'),
      });
    } else {
      console.log('ℹ️  Sync Maxxi desativado (MAXXI_API_URL/MAXXI_API_KEY ausentes)');
    }

    app.listen(PORT, () => {
      console.log(`🌲 Pinheiro OS rodando em http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('❌ Boot falhou:', e);
    process.exit(1);
  }
})();
