/**
 * realtime.js — SSE (Server-Sent Events) em memória para o chat interno.
 *
 * Mantém, por processo, o mapa de clientes conectados (agente → conexões SSE)
 * e um registro de tickets de curta duração usados para autenticar a conexão
 * EventSource (que não pode enviar o header x-admin-token).
 *
 * Fluxo (casado com portal-tecnico/.../useTecnicoRealtime.js):
 *   1. Frontend autenticado faz POST /api/sse-ticket  → { ticket }
 *   2. Abre EventSource('/admin/chat/stream?ticket=…')
 *   3. Servidor valida+consome o ticket (uso único) e registra a conexão
 *   4. Eventos são empurrados via emitToAgente(s)(id, evento, dados)
 *
 * Presença: um agente está "online" enquanto tiver ≥1 conexão SSE ativa.
 * `agentes.ultimo_visto` é atualizado no connect e no disconnect.
 */
import crypto from 'node:crypto';
import { query } from './db.js';
import { log }   from './logger.js';

// agenteId (Number) → Set<res>
const clients = new Map();
// ticket (String) → { agenteId, exp }
const tickets = new Map();

const TICKET_TTL_MS = 30_000;   // ticket vale 30s (uso único)
const HEARTBEAT_MS  = 25_000;   // ping p/ manter a conexão viva atrás do proxy

/* ── Tickets ───────────────────────────────────────────────────────────── */
export function mintTicket(agenteId) {
  const ticket = crypto.randomBytes(18).toString('base64url');
  tickets.set(ticket, { agenteId: Number(agenteId), exp: Date.now() + TICKET_TTL_MS });
  return ticket;
}

/** Valida e CONSOME o ticket (uso único). Retorna agenteId ou null. */
export function consumeTicket(ticket) {
  if (!ticket) return null;
  const t = tickets.get(ticket);
  if (!t) return null;
  tickets.delete(ticket);
  if (t.exp < Date.now()) return null;
  return t.agenteId;
}

// Varredura preguiçosa de tickets expirados (evita crescer sem limite)
function limparTicketsExpirados() {
  const agora = Date.now();
  for (const [k, v] of tickets) if (v.exp < agora) tickets.delete(k);
}

/* ── Clientes / presença ───────────────────────────────────────────────── */
export function addClient(agenteId, res) {
  const id = Number(agenteId);
  let set = clients.get(id);
  if (!set) { set = new Set(); clients.set(id, set); }
  set.add(res);
  marcarVisto(id);
}

export function removeClient(agenteId, res) {
  const id = Number(agenteId);
  const set = clients.get(id);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(id);
  marcarVisto(id);
}

export function isOnline(agenteId) {
  const set = clients.get(Number(agenteId));
  return !!(set && set.size > 0);
}

export function onlineIds() {
  return [...clients.keys()];
}

function marcarVisto(agenteId) {
  query(`UPDATE agentes SET ultimo_visto = NOW() WHERE id = $1`, [agenteId]).catch(() => {});
}

/* ── Emissão ───────────────────────────────────────────────────────────── */
function escrever(res, evento, dados) {
  try {
    res.write(`event: ${evento}\n`);
    res.write(`data: ${JSON.stringify(dados)}\n\n`);
  } catch { /* conexão morta — será limpa no 'close' */ }
}

export function emitToAgente(agenteId, evento, dados) {
  const set = clients.get(Number(agenteId));
  if (!set) return;
  for (const res of set) escrever(res, evento, dados);
}

export function emitToAgentes(ids, evento, dados) {
  const vistos = new Set();
  for (const id of ids) {
    const n = Number(id);
    if (vistos.has(n)) continue;
    vistos.add(n);
    emitToAgente(n, evento, dados);
  }
}

/* ── Heartbeat global (comentário SSE, ignorado pelo EventSource) ──────── */
let _hb = null;
export function iniciarHeartbeat() {
  if (_hb) return;
  _hb = setInterval(() => {
    limparTicketsExpirados();
    for (const set of clients.values()) {
      for (const res of set) { try { res.write(': ping\n\n'); } catch {} }
    }
  }, HEARTBEAT_MS);
  if (_hb.unref) _hb.unref();
  log.info('[realtime] heartbeat SSE iniciado');
}
