/**
 * Pinheiro OS — Envio de Web Push (VAPID).
 *
 * O frontend (portal-tecnico) registra a subscription via POST /api/push/subscribe
 * e este módulo entrega as notificações. Se as chaves VAPID não estiverem
 * configuradas, tudo vira no-op silencioso — o resto do sistema segue normal.
 *
 * Gere as chaves uma vez com:  npx web-push generate-vapid-keys
 * e coloque em VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT.
 */
import webpush   from 'web-push';
import { query } from './db.js';
import { log }   from './logger.js';

const PUBLIC  = process.env.VAPID_PUBLIC_KEY  || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT     || 'mailto:tecnico@pinheiro.app';

let _enabled = false;
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    _enabled = true;
    log.info('[push] Web Push habilitado (VAPID configurado)');
  } catch (e) {
    log.warn('[push] VAPID inválido — push desabilitado:', e.message);
  }
} else {
  log.info('[push] VAPID ausente — push desabilitado (configure VAPID_PUBLIC_KEY/PRIVATE)');
}

export function pushEnabled() { return _enabled; }
export function vapidPublicKey() { return PUBLIC || null; }

/**
 * Envia uma notificação a todas as subscriptions de um agente.
 * Remove automaticamente subscriptions mortas (404/410).
 * Nunca lança — falha de push não pode derrubar o fluxo de negócio.
 *
 * @param {number} agenteId
 * @param {{title:string, body?:string, url?:string, tag?:string}} payload
 * @returns {Promise<{enviadas:number, removidas:number}>}
 */
export async function sendPushToAgente(agenteId, payload) {
  if (!_enabled || !agenteId) return { enviadas: 0, removidas: 0 };

  let subs;
  try {
    const { rows } = await query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE agente_id = $1`,
      [agenteId]
    );
    subs = rows;
  } catch (e) {
    log.warn('[push] erro lendo subscriptions:', e.message);
    return { enviadas: 0, removidas: 0 };
  }

  if (!subs.length) return { enviadas: 0, removidas: 0 };

  const body = JSON.stringify({
    title: payload.title || 'CITmax Equipe',
    body:  payload.body  || '',
    url:   payload.url   || '/',
    tag:   payload.tag   || 'citmax-equipe',
  });

  let enviadas = 0;
  const mortas = [];

  await Promise.all(subs.map(async (s) => {
    const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(subscription, body);
      enviadas++;
    } catch (e) {
      // 404/410 = subscription expirou/foi removida no device → limpa do banco.
      if (e.statusCode === 404 || e.statusCode === 410) {
        mortas.push(s.id);
      } else {
        log.warn('[push] falha ao enviar:', e.statusCode || e.message);
      }
    }
  }));

  if (mortas.length) {
    try {
      await query(`DELETE FROM push_subscriptions WHERE id = ANY($1::int[])`, [mortas]);
    } catch (e) {
      log.warn('[push] erro limpando subscriptions mortas:', e.message);
    }
  }

  return { enviadas, removidas: mortas.length };
}
