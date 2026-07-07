/**
 * push.js — Web Push (VAPID) para notificar agentes offline.
 *
 * A dependência web-push e a tabela push_subscriptions já existiam no projeto,
 * mas nunca foram ligadas. Este serviço faz a ponte.
 *
 * Config (env): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 * Sem as 3 chaves, sendPush() vira no-op (logado uma vez).
 */
import webpush from 'web-push';
import { query } from './db.js';
import { log }   from './logger.js';

let _ready = null;   // null = não checado; true/false = resultado

function init() {
  if (_ready !== null) return _ready;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@pinheiro-os.local';
  if (!pub || !priv) {
    log.warn('[push] VAPID_PUBLIC_KEY/PRIVATE_KEY ausentes — push desativado (SSE segue funcionando)');
    _ready = false;
    return _ready;
  }
  try {
    webpush.setVapidDetails(subj, pub, priv);
    _ready = true;
    log.info('[push] web-push configurado');
  } catch (e) {
    log.error('[push] falha ao configurar VAPID:', e.message);
    _ready = false;
  }
  return _ready;
}

/**
 * Envia uma notificação push a todas as inscrições de um agente.
 * Inscrições inválidas (404/410) são removidas.
 * @param {number} agenteId
 * @param {object} payload  { title, body, url?, tag?, ... } (vira JSON no SW)
 */
export async function sendPush(agenteId, payload) {
  if (!init()) return;
  let subs;
  try {
    const r = await query(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE agente_id = $1`,
      [agenteId]
    );
    subs = r.rows;
  } catch (e) {
    log.warn('[push] erro ao buscar inscrições:', e.message);
    return;
  }
  if (!subs.length) return;

  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(sub, body);
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) {
        query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [s.endpoint]).catch(() => {});
      } else {
        log.warn('[push] envio falhou:', code || e.message);
      }
    }
  }));
}
