/**
 * Pinheiro OS — Rotas auxiliares do agente.
 * Montado em /api/agentes/*
 *
 *   GET  /config       Config runtime (TomTom key, VAPID public, sync ativo)
 *   POST /posicao      GPS heartbeat
 */
import { Router } from 'express';
import { query }   from '../services/db.js';
import { authMw }  from './auth.js';
import { audit }   from '../services/audit.js';

const router = Router();

/* ── GET /config ─────────────────────────────────────────────────────────
 * Config "pública" pro frontend — só agentes autenticados acessam,
 * o que mitiga (mas não elimina) o vazamento da TomTom key. Em produção
 * configure restrição de domínio no painel da TomTom.
 */
router.get('/config', authMw, (_req, res) => {
  res.json({
    tomtom_key:   process.env.TOMTOM_KEY    || null,
    vapid_public: process.env.VAPID_PUBLIC_KEY || null,
    sync_active:  !!(process.env.MAXXI_API_URL && process.env.MAXXI_API_KEY),
    version:      process.env.npm_package_version || '0.1.0',
  });
});

/* ── POST /posicao — GPS heartbeat ────────────────────────────────────── */
router.post('/posicao', authMw, async (req, res) => {
  try {
    const { lat, lng, accuracy, bateria } = req.body || {};

    // Validações estritas — lat/lng precisam ser número finito e dentro do globo
    const latN = Number(lat), lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: 'lat/lng obrigatórios e numéricos' });
    }
    if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
      return res.status(400).json({ error: 'lat/lng fora do globo terrestre' });
    }

    const accN = accuracy != null && Number.isFinite(+accuracy) ? +accuracy : null;
    const batN = bateria  != null && Number.isFinite(+bateria)  ? Math.min(100, Math.max(0, +bateria | 0)) : null;

    await query(
      `INSERT INTO agente_posicao (agente_id, lat, lng, accuracy, bateria)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (agente_id) DO UPDATE
         SET lat = $2, lng = $3, accuracy = $4, bateria = $5, atualizado = NOW()`,
      [req.agente.agente_id, latN, lngN, accN, batN]
    );
    res.json({ ok: true });
  } catch (e) {
    audit(req, 'posicao_erro', null, { msg: e.message });
    res.status(500).json({ error: 'erro ao salvar posição' });
  }
});

export default router;
