// ia-api.js — helpers para os endpoints de IA do backend Pinheiro OS
// Pinheiro é servidor próprio — endpoints resolvem em /api/ia/* same-origin.


import { apiJson, getTecToken } from '../shared';

/* ── 1. Transcrição (Voz → texto via Whisper) ───────────────────────────── */
// Envia FormData (audio binário + contexto opcional) para o backend transcrever.
// `contexto` vira o initial_prompt do Whisper — melhora muito a precisão para
// jargão técnico (ONU, splitter, dBm, CTO, drop…).
export async function transcrever(audioBlob, contexto = null) {
  const fd = new FormData();
  fd.append('audio', audioBlob, 'rec.webm');
  if (contexto) fd.append('contexto', contexto);

  // Não usa apiJson pq FormData não combina com Content-Type: application/json
  const url = window.location.origin + '/api/ia/transcribe';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'x-admin-token': getTecToken() },
    body: fd,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `HTTP ${res.status}`);
  }
  const d = await res.json();
  return d.texto || '';
}

/* ── 2. Diagnóstico pré-deslocamento ────────────────────────────────────── */
// Retorna:
//   { causa_provavel, confianca, equipamentos: [{nome, qtd}],
//     historico_resumo, sinal_serie: [number] }
export async function diagnosticar(osId) {
  return apiJson(`/api/ia/diagnostico/${encodeURIComponent(osId)}`);
}

/* ── 3. Detecção de OS duplicada (SGP × Maxxi) ──────────────────────────── */
// Retorna: { matches: [{ os_id, fonte, score, motivo, criada_em }] }
export async function buscarDuplicadas(osId) {
  return apiJson(`/api/ia/duplicadas/${encodeURIComponent(osId)}`);
}

/* ── 4. Feedback humano: "essas duas NÃO são duplicadas" ────────────────── */
// Vira dataset pra IA aprender (fine-tuning futuro).
export async function marcarNaoDuplicada(osIdA, osIdB) {
  return apiJson('/api/ia/duplicadas/dispensar', {
    method: 'POST',
    body: JSON.stringify({ a: osIdA, b: osIdB }),
  });
}

/* ── 5. Heartbeat GPS do técnico ────────────────────────────────────────── */
export async function reportarPosicao({ lat, lng, accuracy, bateria }) {
  return apiJson('/api/ia/agentes/posicao', {
    method: 'POST',
    body: JSON.stringify({ lat, lng, accuracy, bateria }),
  });
}
