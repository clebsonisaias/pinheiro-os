// shared.js — constantes, helpers e api do portal técnico Pinheiro OS
// Todos os sub-arquivos importam daqui

/* ── Auth ─────────────────────────────────────────────────────────────────── */
export const LS_TOKEN = 'pinheiro_token';
export const LS_USER  = 'pinheiro_user';

export function getTecToken() { return localStorage.getItem(LS_TOKEN) || ''; }

/* ── Runtime config (TomTom key, VAPID public) ────────────────────────────── */
// A chave da TomTom já NÃO vai no bundle — vem via /api/agentes/config após
// login. Cache em window pra acesso síncrono pelos módulos (route-optimizer).
let _configPromise = null;
export function loadConfig() {
  if (!_configPromise) {
    _configPromise = apiJson('/api/agentes/config')
      .then(cfg => { window.__pinheiro_cfg__ = cfg; return cfg; })
      .catch(e => { console.warn('[config] falhou:', e.message); return {}; });
  }
  return _configPromise;
}
export function getTomtomKey() { return window.__pinheiro_cfg__?.tomtom_key || null; }
export function getVapidPublic() { return window.__pinheiro_cfg__?.vapid_public || null; }

// Resposta sintética usada quando uma mutação foi enfileirada offline.
// Mantém o formato Response pra api() continuar drop-in compatível com
// chamadas que fazem `await res.json()`.
function _makeQueuedResponse(opId, label) {
  return new Response(
    JSON.stringify({ ok: true, queued: true, op_id: opId, msg: '🟡 Salvo offline — sincronizará quando voltar sinal' }),
    { status: 202, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function api(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  const headers = {
    'x-admin-token': getTecToken(),
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  // Backend Pinheiro é servidor próprio — frontend e API são same-origin.
  const base = window.location.origin;

  // Offline conhecido: enfileira sem nem tentar
  if (isMutation && !navigator.onLine) {
    try {
      const { enqueue } = await import('./offlineQueue.js');
      const op = await enqueue({ path, method, body: opts.body || null, label: opts.offlineLabel });
      return _makeQueuedResponse(op.id, opts.offlineLabel);
    } catch {
      // IndexedDB falhou — segue pro fetch normal e deixa o erro propagar
    }
  }

  let res;
  try {
    res = await fetch(`${base}${path}`, { ...opts, headers });
  } catch (e) {
    // Network error durante a mutação (TypeError "Failed to fetch") → enfileira
    if (isMutation) {
      try {
        const { enqueue } = await import('./offlineQueue.js');
        const op = await enqueue({ path, method, body: opts.body || null, label: opts.offlineLabel });
        return _makeQueuedResponse(op.id, opts.offlineLabel);
      } catch {}
    }
    throw e;
  }
  if (res.status === 401) {
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    localStorage.removeItem('pinheiro_role');
    window.location.reload();
    throw new Error('Sessão expirada');
  }
  return res;
}

export async function apiJson(path, opts) {
  const res = await api(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

/* ── Status / Tipos ───────────────────────────────────────────────────────── */
export const ST = {
  aguardando:   { label:'Aguardando',   c:'#666',    bg:'rgba(102,102,102,.12)', icon:'⏳' },
  confirmada:   { label:'Confirmada',   c:'#3ecfff', bg:'rgba(62,207,255,.12)',  icon:'✅' },
  deslocamento: { label:'A caminho',    c:'#f5c518', bg:'rgba(245,197,24,.12)',  icon:'🚗' },
  execucao:     { label:'Em execução',  c:'#16A34A', bg:'rgba(0,200,150,.12)',   icon:'🔧' },
  concluida:    { label:'Concluída',    c:'#27c93f', bg:'rgba(39,201,63,.12)',   icon:'✔' },
  cancelada:    { label:'Cancelada',    c:'#ff4757', bg:'rgba(255,71,87,.12)',   icon:'✕' },
  aberta:       { label:'Aberta',       c:'#3ecfff', bg:'rgba(62,207,255,.1)',   icon:'📋' },
  em_andamento: { label:'Andamento',    c:'#f5c518', bg:'rgba(245,197,24,.1)',   icon:'▶' },
  fechada:      { label:'Fechada',      c:'#27c93f', bg:'rgba(39,201,63,.1)',    icon:'✓' },
};

export const TP = {
  reparo:'🔧', instalacao:'📡', manutencao:'⚙️', vistoria:'🔍', mudanca:'🚚', retirada:'🚨', outro:'📋',
};

export const CL_PADRAO = {
  reparo:     ['Verificar ONU/roteador','Testar fibra óptica','Ping gateway','Velocidade do link','Foto do equipamento'],
  instalacao: ['Cabear fibra','Splitter instalado','ONU configurada','Wi-Fi testado','Foto da instalação','Assinatura do cliente'],
  manutencao: ['Identificar problema','Executar reparo','Testar conexão','Foto antes e depois'],
  vistoria:   ['Viabilidade técnica','Foto do local','Medir sinal','Relatório preenchido'],
  mudanca:    ['Retirar equipamento antigo','Instalar novo ponto','Testar conexão','Foto da instalação'],
  outro:      ['Executar serviço','Testar resultado','Foto do serviço'],
};

/* ── Tokens de design — Pinheiro OS (branco/verde) ───────────────────────── */
export const T = {
  // Fundos
  bg:      '#ffffff',
  bg1:     '#F6FAF6',
  bg2:     '#EDF5ED',
  card:    '#ffffff',
  bord:    '#DDE8DD',
  overlay: 'rgba(0,0,0,.08)',

  // Marca
  green: '#16A34A',
  cyan:  '#0284C7',
  yel:   '#D97706',
  amber: '#D97706',
  red:   '#DC2626',
  blue:  '#2563EB',

  // Texto
  text:  '#0D1F0D',
  muted: '#6B7280',
  nano:  '#D1D5DB',

  r12: 12, r14: 14, r16: 16, r20: 20,
};

/* ── Helpers de data ──────────────────────────────────────────────────────── */
const _intlH  = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const _intlDt = new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
export const fmtH   = ts => ts ? _intlH.format(new Date(ts))  : '—';
export const fmtDt  = ts => ts ? _intlDt.format(new Date(ts)) : '—';
export const isHoje = ts => ts && new Date(ts).toDateString() === new Date().toDateString();
export const slaInfo = sla => {
  if (!sla) return null;
  const d = new Date(sla) - Date.now();
  if (d < 0) return { text:'SLA VENCIDO', c:'#ff4757' };
  const h = Math.floor(d / 3600000);
  return h < 4 ? { text:`${h}h restante`, c:'#ff9f0a' } : null;
};
export const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const TIPO_LABEL = {
  reparo:'Reparo', instalacao:'Instalação', mudanca:'Mudança',
  manutencao:'Manutenção', vistoria:'Vistoria', retirada:'Retirada', outro:'Outro',
};
export const tipoLabel = t => TIPO_LABEL[t] || (t ? (t.charAt(0).toUpperCase() + t.slice(1)) : 'OS');

/* ── PWA / Permissões ─────────────────────────────────────────────────────── */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

export function atualizarBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) navigator.setAppBadge(count).catch(() => {});
    else navigator.clearAppBadge().catch(() => {});
  }
}

export async function registrarPWA(user) {
  // O manifest e theme-color já são injetados corretamente pelo servidor no HTML.
  // Garantimos apenas que estão presentes (fallback para dev local).
  let link = document.querySelector('link[rel="manifest"]');
  if (!link || !link.href.includes('manifest-tecnico')) {
    if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link); }
    link.href = '/manifest-tecnico.json';
  }

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = '#16A34A';

  let vp = document.querySelector('meta[name="viewport"]');
  if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; document.head.appendChild(vp); }
  vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover';

  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const reg of regs) {
      if (reg.active?.scriptURL?.includes('sw-tecnico')) continue;
      await reg.unregister().catch(() => {});
    }
    const reg = await navigator.serviceWorker.register('/sw-pinheiro.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    if (!('PushManager' in window) || !user) return;
    const perm = Notification.permission;
    const permFinal = perm === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permFinal !== 'granted') return;
    const { publicKey } = await fetch('/api/push/vapid-key').then(r => r.json()).catch(() => ({}));
    if (!publicKey) return;
    // Reutiliza subscription existente; só cria nova se não houver
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    // Sempre re-registra no backend para garantir mapeamento agente_id ↔ endpoint
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), agente_id: user.id, agente_nome: user.nome }),
    });
  } catch(e) {
    console.error('[SW/Push Técnico] Erro:', e.message);
  }
}

export async function solicitarPermissoes(user) {
  // Notificações
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  // Localização — pedida logo no login pois é usada constantemente (GPS, check-in, navegação)
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
  }
  // Câmera NÃO é solicitada aqui — o sistema pede automaticamente quando o técnico
  // clica em "Tirar foto" via <input type="file" capture="environment">
  await registrarPWA(user);
}
