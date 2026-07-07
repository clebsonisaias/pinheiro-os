/**
 * Pinheiro OS — Rotas de tempo real (SSE) do chat.
 *
 * Montado na RAIZ do routerApi (antes do express.static / catch-all do SPA),
 * porque o EventSource do frontend conecta em /admin/chat/stream, que NÃO
 * começa com /api e seria engolido pelo catch-all do SPA caso montado depois.
 *
 *   POST /api/sse-ticket        (autenticado)  → { ticket }
 *   GET  /admin/chat/stream     (via ticket)   → stream text/event-stream
 */
import { Router } from 'express';
import { authMw } from './auth.js';
import { mintTicket, consumeTicket, addClient, removeClient } from '../services/realtime.js';

const router = Router();

/* ── POST /api/sse-ticket — gera ticket de curta duração ────────────────── */
router.post('/api/sse-ticket', authMw, (req, res) => {
  res.json({ ticket: mintTicket(req.agente.agente_id) });
});

/* ── GET /admin/chat/stream — conexão SSE (sem authMw: usa ticket) ──────── */
router.get('/admin/chat/stream', (req, res) => {
  const agenteId = consumeTicket(req.query.ticket);
  if (!agenteId) return res.status(401).json({ error: 'ticket inválido ou expirado' });

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering':  'no',   // desliga buffering do Nginx/Coolify
  });
  if (res.flushHeaders) res.flushHeaders();

  // Evento inicial esperado pelo hook (zera o backoff de reconexão)
  res.write('event: init\n');
  res.write('data: {}\n\n');

  addClient(agenteId, res);
  req.on('close', () => removeClient(agenteId, res));
});

export default router;
