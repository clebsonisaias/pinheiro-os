/**
 * Pinheiro OS — Rotas de Web Push.
 * Montado em /api/push/*
 *
 *   GET  /vapid-key   (público)      → { publicKey }
 *   POST /subscribe   (autenticado)  → grava/atualiza a inscrição do agente
 *
 * Os shapes casam com portal-tecnico/.../shared.js:registrarPWA():
 *   - GET  espera { publicKey }
 *   - POST envia { subscription, agente_id, agente_nome } (agente_id é ignorado
 *     por segurança — usamos sempre req.agente.agente_id).
 */
import { Router } from 'express';
import { query }  from '../services/db.js';
import { authMw } from './auth.js';
import { log }    from '../services/logger.js';

const router = Router();

/* ── GET /vapid-key ─────────────────────────────────────────────────────── */
router.get('/vapid-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

/* ── POST /subscribe ────────────────────────────────────────────────────── */
router.post('/subscribe', authMw, async (req, res) => {
  try {
    const sub = req.body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh   = sub?.keys?.p256dh;
    const auth     = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: 'subscription inválida' });
    }

    await query(
      `INSERT INTO push_subscriptions (agente_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET agente_id = $1, p256dh = $3, auth = $4`,
      [req.agente.agente_id, endpoint, p256dh, auth]
    );
    res.json({ ok: true });
  } catch (e) {
    log.error('[push/subscribe]', e.message);
    res.status(500).json({ error: 'erro ao registrar push' });
  }
});

export default router;
