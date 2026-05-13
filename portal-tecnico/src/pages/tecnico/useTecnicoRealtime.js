// useTecnicoRealtime — SSE singleton + polling fallback + notificações sensoriais
//
// Hook do portal técnico que escuta eventos do servidor em tempo real.
// CONEXÃO ÚNICA: várias instâncias do hook (TecnicoApp + ChatScreen, etc)
// compartilham a mesma EventSource — não cria múltiplas conexões SSE.
//
// Encapsula:
//   - SSE conectado ao /admin/chat/stream com ticket de curta duração
//   - Reconexão automática se SSE cair
//   - Polling fallback a cada 30s independente do SSE
//   - Som (Web Audio API beep, sem arquivo externo)
//   - Vibração no mobile
//   - Title flash quando aba não está focada
//   - Toast in-app via callback
//
// Uso:
//   const { connected } = useTecnicoRealtime({
//     userId,
//     onNovaMensagem: (data) => { ... },
//     onConversaAssumida: (data) => { ... },
//     onStatusAlterado: (data) => { ... },
//     onNovoTicket: (data) => { ... },
//     onPoll: () => loadConvs(),
//     showToast: (msg) => { ... },
//   });

import { useEffect, useRef, useState } from "react";
import { api } from "./shared";

// ── Notificações sensoriais ──────────────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { _audioCtx = null; }
  return _audioCtx;
}

// Beep curto via Web Audio API — sem dependência de arquivo .mp3
export function tocarBeep({ freq = 880, durMs = 150, vol = 0.18 } = {}) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durMs / 1000 + 0.05);
  } catch {}
}

// Padrão de "ding-dong" — 2 tons em sequência (mais marcante pra ticket)
export function tocarDingDong() {
  tocarBeep({ freq: 1046, durMs: 150, vol: 0.18 }); // C6
  setTimeout(() => tocarBeep({ freq: 880, durMs: 220, vol: 0.18 }), 160); // A5
}

export function vibrar(pattern = [180, 80, 180]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

// Title flash — pisca o título da aba quando não focada
let _titleOriginal = null;
let _titleInterval = null;
let _titleCount = 0;
let _titleMsg = "💬 Nova mensagem";
export function piscarTitle(qtd = 1, msg = "💬 Nova mensagem") {
  if (typeof document === "undefined") return;
  if (!_titleOriginal) _titleOriginal = document.title;
  _titleCount = qtd;
  _titleMsg = msg;
  if (document.hasFocus()) return;
  if (_titleInterval) clearInterval(_titleInterval);
  let toggle = false;
  _titleInterval = setInterval(() => {
    document.title = toggle ? _titleOriginal : `(${_titleCount}) ${_titleMsg}`;
    toggle = !toggle;
  }, 1100);
}
export function pararPiscarTitle() {
  if (_titleInterval) { clearInterval(_titleInterval); _titleInterval = null; }
  if (_titleOriginal) document.title = _titleOriginal;
  _titleCount = 0;
}
if (typeof window !== "undefined") {
  window.addEventListener("focus", pararPiscarTitle);
}

// ── Singleton SSE ────────────────────────────────────────────────────────────
// Uma única EventSource compartilhada por toda a árvore de componentes do
// portal técnico. Cada chamada de useTecnicoRealtime() registra/remove
// listeners locais sem criar nova conexão.

const sseListeners = new Set();
let sseEs = null;
let sseReconTimer = null;
let sseReconnectAttempts = 0;
let sseUserId = null;

const SSE_EVENTS = ['nova_mensagem', 'mensagem_agente', 'conversa_assumida', 'status_alterado', 'conversa_encerrada', 'novo_ticket', 'status_mensagem'];

async function _conectarSSE() {
  if (!sseUserId) return;
  if (sseEs) { try { sseEs.close(); } catch {} sseEs = null; }
  if (sseReconTimer) { clearTimeout(sseReconTimer); sseReconTimer = null; }

  try {
    // 1. Pede ticket de curta duração — evita JWT na URL/logs do Nginx
    const tr = await api("/api/sse-ticket", { method: "POST" });
    if (!tr.ok) throw new Error("ticket falhou");
    const { ticket } = await tr.json();
    if (!ticket) throw new Error("sem ticket");

    // 2. Conecta no SSE
    const url = `/admin/chat/stream?ticket=${encodeURIComponent(ticket)}`;
    const es = new EventSource(url);
    sseEs = es;

    es.addEventListener("init", () => {
      sseReconnectAttempts = 0;
      _emit('connected', true);
    });

    // Registra todos os tipos de eventos esperados
    SSE_EVENTS.forEach(evtName => {
      es.addEventListener(evtName, (ev) => {
        try {
          const data = JSON.parse(ev.data);
          _emit(evtName, data);
        } catch {}
      });
    });

    es.onerror = () => {
      _emit('connected', false);
      try { es.close(); } catch {}
      sseEs = null;
      // Reconexão exponencial com cap em 30s
      const attempts = ++sseReconnectAttempts;
      const delay = Math.min(1000 * Math.pow(1.5, attempts), 30000);
      sseReconTimer = setTimeout(_conectarSSE, delay);
    };
  } catch (e) {
    _emit('connected', false);
    sseReconTimer = setTimeout(_conectarSSE, 5000);
  }
}

function _emit(type, data) {
  sseListeners.forEach(l => {
    try { l(type, data); } catch {}
  });
}

function _ensureConnected(userId) {
  if (sseUserId === userId && (sseEs || sseReconTimer)) return; // já conectando ou conectado
  sseUserId = userId;
  _conectarSSE();
}

function _disconnect() {
  if (sseEs) { try { sseEs.close(); } catch {} sseEs = null; }
  if (sseReconTimer) { clearTimeout(sseReconTimer); sseReconTimer = null; }
  sseUserId = null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useTecnicoRealtime({
  userId,
  onNovaMensagem,
  onMensagemAgente,
  onConversaAssumida,
  onStatusAlterado,
  onConversaEncerrada,
  onNovoTicket,
  onStatusMensagem,
  onPoll,
  showToast,
  pollMs = 30000,
} = {}) {
  const [connected, setConnected] = useState(false);
  const pollTimer = useRef(null);

  // Ref pra callbacks evita re-bind a cada render
  const cbsRef = useRef({});
  cbsRef.current = { onNovaMensagem, onMensagemAgente, onConversaAssumida, onStatusAlterado, onConversaEncerrada, onNovoTicket, onStatusMensagem, onPoll, showToast };

  // Registra listener local no singleton
  useEffect(() => {
    if (!userId) return;

    const listener = (type, data) => {
      const c = cbsRef.current;
      if (type === 'connected') { setConnected(!!data); return; }
      if (type === 'nova_mensagem')           c.onNovaMensagem?.(data);
      else if (type === 'mensagem_agente')    c.onMensagemAgente?.(data);
      else if (type === 'conversa_assumida')  c.onConversaAssumida?.(data);
      else if (type === 'status_alterado')    c.onStatusAlterado?.(data);
      else if (type === 'conversa_encerrada') c.onConversaEncerrada?.(data);
      else if (type === 'novo_ticket')        c.onNovoTicket?.(data);
      else if (type === 'status_mensagem')    c.onStatusMensagem?.(data);
    };
    sseListeners.add(listener);
    _ensureConnected(userId);

    return () => {
      sseListeners.delete(listener);
      // Não desconecta no cleanup — outras instâncias do hook podem estar usando
      // Só desconecta se foi o último listener
      if (sseListeners.size === 0) _disconnect();
    };
  }, [userId]);

  // Polling fallback — cada instância roda o seu próprio (eles fazem coisas diferentes)
  useEffect(() => {
    if (!userId || !onPoll) return;
    pollTimer.current = setInterval(() => {
      try { cbsRef.current.onPoll?.(); } catch {}
    }, pollMs);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [userId, pollMs, onPoll]);

  return { connected };
}
