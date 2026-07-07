// chat-api.js — helpers para os endpoints do chat interno (/api/chat/*).
// Pinheiro é servidor próprio → same-origin. Reusa api()/apiJson() do shared.

import { apiJson, api, getTecToken } from '../shared';

/* ── Conversas ──────────────────────────────────────────────────────────── */
export function listarConversas({ limit = 50, offset = 0 } = {}) {
  return apiJson(`/api/chat/conversas?limit=${limit}&offset=${offset}`);
}
export function detalheConversa(convId) {
  return apiJson(`/api/chat/conversas/${convId}`);
}
export function listarAgentes() {
  return apiJson('/api/chat/agentes');
}
export function abrirDM(agenteId) {
  return apiJson('/api/chat/dm', { method: 'POST', body: JSON.stringify({ agente_id: agenteId }) });
}
export function criarGrupo(titulo, participantes) {
  return apiJson('/api/chat/conversas', {
    method: 'POST',
    body: JSON.stringify({ tipo: 'grupo', titulo, participantes }),
  });
}
export function criarCanal(titulo, descricao) {
  return apiJson('/api/chat/conversas', {
    method: 'POST',
    body: JSON.stringify({ tipo: 'canal', titulo, descricao }),
  });
}
export function silenciar(convId, mudo) {
  return apiJson(`/api/chat/conversas/${convId}/mudo`, {
    method: 'PUT', body: JSON.stringify({ mudo }),
  });
}

/* ── Mensagens ──────────────────────────────────────────────────────────── */
export function listarMensagens(convId, { before = null, limit = 40 } = {}) {
  const q = new URLSearchParams({ limit: String(limit) });
  if (before) q.set('before', String(before));
  return apiJson(`/api/chat/conversas/${convId}/mensagens?${q}`);
}
export function enviarTexto(convId, texto, extra = {}) {
  return apiJson(`/api/chat/conversas/${convId}/mensagens`, {
    method: 'POST',
    body: JSON.stringify({ texto, ...extra }),
    offlineLabel: '💬 Mensagem',
  });
}
export function marcarLido(convId, ateMsgId) {
  return apiJson(`/api/chat/conversas/${convId}/ler`, {
    method: 'POST',
    body: JSON.stringify({ ate_msg_id: ateMsgId }),
  });
}
export function recibosAviso(convId, msgId) {
  return apiJson(`/api/chat/conversas/${convId}/mensagens/${msgId}/recibos`);
}

/* ── Anexos (FormData — não usa apiJson por causa do Content-Type) ───────── */
// tipo: 'foto' | 'audio' | 'video' | 'arquivo'
export async function enviarAnexo(convId, blob, { tipo, texto, lat, lng, duracao_s, nome } = {}) {
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('file', blob, nome || `${tipo}-${Date.now()}`);
  if (texto)          fd.append('texto', texto);
  if (lat != null)    fd.append('lat', String(lat));
  if (lng != null)    fd.append('lng', String(lng));
  if (duracao_s != null) fd.append('duracao_s', String(duracao_s));

  const res = await fetch(`${window.location.origin}/api/chat/conversas/${convId}/anexos`, {
    method: 'POST',
    headers: { 'x-admin-token': getTecToken() },
    body: fd,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Perfil ─────────────────────────────────────────────────────────────── */
export function salvarAssinatura(assinatura) {
  return apiJson('/api/chat/perfil/assinatura', {
    method: 'PUT', body: JSON.stringify({ assinatura }),
  });
}
export function statsChat() {
  return apiJson('/api/chat/stats');
}

// re-export por conveniência (usado por hooks que só importam daqui)
export { api };
