/**
 * Pinheiro OS — Rotas de Web Push.
 * Montado em /api/push/*
 *
 *   GET  /vapid-key   chave pública VAPID (para o navegador assinar)
 *   POST /subscribe   registra/atualiza a subscription do agente logado
 */
import { Router }    from 'express';
import { query }     from '../services/db.js';
import { authMw }    from './auth.js';
import { vapidPublicKey } from '../services/push.js';
import { log }       from '../services/logger.js';

const router = Router();

/* ── GET /vapid-key — chave pública (não é segredo) ───────────────────── */
router.get('/vapid-key', (_req, res) => {
  res.json({ publicKey: vapidPublicKey() });
});

/* ── POST /subscribe — salva subscription do agente autenticado ───────── */
router.post('/subscribe', authMw, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    const endpoint = subscription?.endpoint;
    const p256dh   = subscription?.keys?.p256dh;
    const auth     = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'subscription inválida' });
    }

    await query(
      `INSERT INTO push_subscriptions (agente_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET agente_id = EXCLUDED.agente_id,
                     p256dh    = EXCLUDED.p256dh,
                     auth      = EXCLUDED.auth`,
      [req.agente.agente_id, endpoint, p256dh, auth]
    );

    res.json({ ok: true });
  } catch (e) {
    log.error('[push/subscribe]', e.message);
    res.status(500).json({ error: 'erro ao registrar push' });
  }
});

export default router;
