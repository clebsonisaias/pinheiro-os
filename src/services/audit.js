/**
 * audit.js — Fire-and-forget audit log.
 *
 * Captura ações sensíveis (login, logout, troca de senha, mudança de OS, etc.)
 * sem bloquear o request. Falhas são logadas mas não propagadas pro caller.
 *
 *   audit(req, 'login_ok', 'agente', { id: 12 });
 *   audit(req, 'os_status_change', `os:${osId}`, { de: 'aguardando', para: 'execucao' });
 */
import { query } from './db.js';
import { log }   from './logger.js';

function extrairIp(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req?.ip || req?.socket?.remoteAddress || null;
}

/**
 * Insere uma linha em audit_log.
 * @param {import('express').Request|null} req  request (pode ser null em jobs)
 * @param {string} acao   ação curta, snake_case (ex: 'login_ok', 'os_atribuir')
 * @param {string|null} recurso  alvo da ação (ex: 'agente:12', 'os:3401')
 * @param {object|null} detalhes  payload extra (não inclua senhas/tokens!)
 */
export function audit(req, acao, recurso = null, detalhes = null) {
  const agenteId = req?.agente?.agente_id ?? null;
  const ip       = extrairIp(req);

  // Sanidade: nunca logar campos sensíveis
  let det = detalhes;
  if (det && typeof det === 'object') {
    det = { ...det };
    for (const k of ['senha','password','senha_atual','senha_nova','token','secret','api_key']) {
      if (k in det) det[k] = '[redacted]';
    }
  }

  // Tenta INET cast — se falhar (IPv6 com brackets etc.), grava sem IP
  query(
    `INSERT INTO audit_log (agente_id, acao, recurso, detalhes, ip)
     VALUES ($1, $2, $3, $4, $5::inet)`,
    [agenteId, acao, recurso, det ? JSON.stringify(det) : null, ip]
  ).catch(() => {
    // Retry sem IP se INET cast falhar
    query(
      `INSERT INTO audit_log (agente_id, acao, recurso, detalhes)
       VALUES ($1, $2, $3, $4)`,
      [agenteId, acao, recurso, det ? JSON.stringify(det) : null]
    ).catch(e => log.warn('[audit] falha persistente:', e.message));
  });
}
