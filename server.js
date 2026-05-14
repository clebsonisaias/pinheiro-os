/**
 * Pinheiro OS — Servidor Express.
 *
 * Sistema independente que:
 *   - Roda no mesmo VPS do Maxxi mas em container/processo separado
 *   - Usa o mesmo PostgreSQL (database `pinheiro_os` separado)
 *   - Puxa tickets do Maxxi via /api/v1/* (sync periódico)
 *   - Serve seu próprio frontend React (PWA do técnico)
 */
import express     from 'express';
import helmet      from 'helmet';
import cors        from 'cors';
import rateLimit   from 'express-rate-limit';
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import routerApi from './src/routes/index.js';
import { ensureDatabase }      from './src/services/db.js';
import { migrate, seedAdmin }  from './src/services/db-migrate.js';
import { iniciarSyncMaxxi }    from './src/services/sync-maxxi.js';
import { log }                 from './src/services/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 4000;

// Estado de boot — exposto via /api/health pro Coolify e pro frontend
// detectarem rapidamente que estamos em modo degradado.
const bootState = { db: 'pending', dbError: null };
app.locals.bootState = bootState;

/* ── Trust proxy (necessário pro req.ip funcionar atrás do Coolify) ─────── */
app.set('trust proxy', 1);

/* ── Segurança ─────────────────────────────────────────────────────────── */
app.disable('x-powered-by');

// CSP permissivo mas defensivo — adapte conforme o frontend evoluir.
// 'self' + Google Fonts + TomTom (se for chamado direto do front).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src':  ["'self'", "'unsafe-inline'"],          // Vite inlines pequenos chunks
      'style-src':   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src':    ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src':     ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https://api.tomtom.com', 'https://*.tomtom.com'],
      'worker-src':  ["'self'", 'blob:'],
      'manifest-src':["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

/* ── CORS — whitelist via env ALLOWED_ORIGINS (CSV) ────────────────────── */
const allowedOriginsList = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Sem origin = same-origin / curl / mobile native — sempre OK
    if (!origin) return cb(null, true);
    // Em dev, libera tudo se ALLOWED_ORIGINS vazio
    if (allowedOriginsList.length === 0) return cb(null, true);
    if (allowedOriginsList.includes(origin)) return cb(null, true);
    log.warn('[cors] bloqueado:', origin);
    cb(new Error('Origin não permitida'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '20mb' })); // base64 de foto até ~15mb
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/* ── Rate limit no login ───────────────────────────────────────────────── */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
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
  log.info('SPA dist não existe — backend apenas. Build em: portal-tecnico/');
}

/* ── 404 e error handler ──────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'rota não encontrada', path: req.path }));
app.use((err, req, res, _next) => {
  log.error('[unhandled]', err);
  res.status(err.status || 500).json({ error: err.message || 'erro interno' });
});

/* ── Validação de env vars ANTES de qualquer coisa ─────────────────────── */
function validarEnvCriticas() {
  const url = process.env.DATABASE_URL_PINHEIRO || process.env.DATABASE_URL || '';
  if (!url) {
    log.warn('━'.repeat(64));
    log.warn('⚠️  DATABASE_URL não definida!');
    log.warn('   Configure no Coolify → Environment Variables → DATABASE_URL');
    log.warn('━'.repeat(64));
    return false;
  }
  if (/\b(USER|SENHA|PASS|PASSWORD|HOST|HOSTNAME|DB_NAME|DBNAME)\b/.test(url)) {
    log.error('━'.repeat(64));
    log.error('⛔ DATABASE_URL contém PLACEHOLDERS do .env.example não substituídos!');
    log.error('');
    log.error('   Você precisa SUBSTITUIR os valores no painel do Coolify:');
    log.error('     1. Abra o app Pinheiro no Coolify');
    log.error('     2. Aba "Environment Variables"');
    log.error('     3. Edite DATABASE_URL — use os MESMOS valores do Maxxi');
    log.error('        (o Pinheiro troca o nome do db automaticamente)');
    log.error('     4. Salve e clique em "Redeploy"');
    log.error('');
    log.error('   Exemplo do que NÃO pode ter:');
    log.error('     postgres://USER:SENHA@HOST:5432/maxxi_db   ← errado');
    log.error('   Exemplo correto:');
    log.error('     postgres://maxxi:abc123@10.0.0.5:5432/maxxi_db');
    log.error('━'.repeat(64));
    return false;
  }
  return true;
}

/* ── Boot ─────────────────────────────────────────────────────────────── */
// Sobe o listener PRIMEIRO e tenta o DB em background. Assim, mesmo que o
// Postgres esteja inacessível (host errado, credenciais inválidas, rede caída),
// o processo continua vivo, /api/health responde e o proxy reverso NÃO mostra
// "no available server" pro usuário — exibe a página com o estado real.
app.listen(PORT, () => {
  log.info(`🌲 Pinheiro OS rodando em http://localhost:${PORT}`);
});

(async () => {
  const envOk = validarEnvCriticas();
  if (!envOk) {
    bootState.db = 'degraded';
    bootState.dbError = 'env_invalida';
    log.warn('[pinheiro] subindo em modo DEGRADADO — env inválida. Só /api/health responde.');
    return;
  }

  try {
    await ensureDatabase();
    await migrate();
    await seedAdmin();
    bootState.db = 'ok';
    log.info('[pinheiro] banco pronto');
  } catch (e) {
    bootState.db = 'degraded';
    bootState.dbError = e.message;
    log.error('━'.repeat(64));
    log.error('⛔ Falha ao preparar banco — subindo em modo DEGRADADO');
    log.error('   ' + e.message);
    log.error('   Verifique no Coolify: DATABASE_URL e se o Postgres está acessível.');
    log.error('━'.repeat(64));
    return;
  }

  if (process.env.MAXXI_API_URL && process.env.MAXXI_API_KEY) {
    iniciarSyncMaxxi({
      intervaloMs: parseInt(process.env.MAXXI_SYNC_INTERVAL_MS || '30000'),
    });
  } else {
    log.info('Sync Maxxi desativado (MAXXI_API_URL/MAXXI_API_KEY ausentes)');
  }
})();
