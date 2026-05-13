// offlineQueue.js — Fila de mutações offline pro app do técnico
//
// Por que existe: tec em campo perde sinal frequentemente (loteamento sem 4G,
// poste cego, etc). Sem fila, ele fica sem conseguir encerrar OS, fazer
// check-in ou anexar foto até voltar pra área coberta. Solução:
//   1) api() detecta offline ou network error → enfileira a mutação no IndexedDB
//      e retorna uma resposta sintética { ok: true, queued: true }.
//   2) Quando a conexão volta (`online` event ou periodic check), a fila é
//      drenada na ordem em que foi gravada.
//
// Idempotência: cada op tem um client_op_id único. Status updates (PUT) são
// naturalmente idempotentes (mudar pra mesmo status = noop). Para POST (notas,
// fotos), o backend pode duplicar, mas é trade-off aceitável: melhor 1 nota
// duplicada que perder o registro do serviço feito.
//
// Cobre: PUT/POST/PATCH/DELETE em rotas do /admin/api/tecnico/*. GETs nunca
// vão pra fila (leitura offline = mostra "—" ou cache).

const DB_NAME = 'tecnico-offline-queue';
const DB_VERSION = 1;
const STORE = 'ops';

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const result = fn(s);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const _listeners = new Set();
function notify() {
  _listeners.forEach(fn => { try { fn(); } catch {} });
}
export function onQueueChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function enqueue({ path, method, body, label }) {
  try {
    const db = await openDB();
    const op = {
      id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      path, method, body, label: label || `${method} ${path}`,
      createdAt: Date.now(),
      attempts: 0,
      lastError: null,
    };
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readwrite');
      t.objectStore(STORE).put(op);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    notify();
    return op;
  } catch (e) {
    console.error('[offlineQueue] enqueue falhou:', e.message);
    throw e;
  }
}

export async function listPending() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).index('createdAt').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function countPending() {
  const ops = await listPending();
  return ops.length;
}

async function remove(id) {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(id);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
  notify();
}

async function markFailed(id, errMsg) {
  const db = await openDB();
  await new Promise((resolve) => {
    const t = db.transaction(STORE, 'readwrite');
    const s = t.objectStore(STORE);
    const req = s.get(id);
    req.onsuccess = () => {
      const op = req.result;
      if (!op) { resolve(); return; }
      op.attempts = (op.attempts || 0) + 1;
      op.lastError = errMsg || null;
      op.lastTryAt = Date.now();
      // Backoff exponencial: 1m, 2m, 4m, 8m antes da próxima tentativa.
      // Evita martelar o backend quando uma op está falhando com 5xx.
      op.nextTryAt = Date.now() + Math.min(8, Math.pow(2, op.attempts - 1)) * 60 * 1000;
      // Após 5 tentativas dá up e remove pra não ficar reprocessando pra
      // sempre ops que o backend rejeitou (4xx que não vão se resolver
      // sozinhas, tipo OS já cancelada). Antes disso, mantém na fila.
      if (op.attempts >= 5) {
        s.delete(id);
      } else {
        s.put(op);
      }
    };
    t.oncomplete = resolve;
  });
  notify();
}

let _draining = false;

// Drena a fila sequencialmente. Para na primeira falha de rede (offline volta).
// Em erros 4xx/5xx, marca como falha (até dar up em 5 tentativas) e segue pra
// próxima — assim 1 op problemática não bloqueia a fila inteira.
export async function drain(opts = {}) {
  if (_draining) return { skipped: true };
  if (!navigator.onLine) return { offline: true };
  _draining = true;
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const force = !!opts.force;          // ignora backoff (drain manual do botão)
  const now = Date.now();
  try {
    const ops = await listPending();
    for (const op of ops) {
      // Backoff: pula ops cuja próxima tentativa ainda está no futuro,
      // a menos que o usuário tenha forçado via botão de retry manual.
      if (!force && op.nextTryAt && op.nextTryAt > now) {
        skipped++;
        continue;
      }
      // Token pode ter expirado entre enqueue e drain
      const token = localStorage.getItem('maxxi_token') || '';
      try {
        const res = await fetch(window.location.origin + '/admin' + op.path, {
          method: op.method,
          headers: {
            'x-admin-token': token,
            'Content-Type': 'application/json',
          },
          body: op.body,
        });
        if (res.ok) {
          await remove(op.id);
          success++;
        } else if (res.status === 401) {
          // Sessão expirou — para drain. Quando voltar a logar, retomar.
          break;
        } else {
          // 4xx/5xx → marca falha. Tentará de novo no próximo drain.
          let errTxt = '';
          try { errTxt = (await res.json())?.error || res.statusText; } catch { errTxt = res.statusText; }
          await markFailed(op.id, `HTTP ${res.status}: ${errTxt}`);
          failed++;
        }
      } catch (e) {
        // Network error — perdeu sinal de novo. Mantém op e para drain.
        await markFailed(op.id, e.message).catch(() => {});
        break;
      }
    }
  } finally {
    _draining = false;
  }
  return { success, failed, skipped };
}

// Inicia drain automático quando a conexão voltar + ao montar a app.
let _autoStarted = false;
export function startAutoDrain() {
  if (_autoStarted) return;
  _autoStarted = true;
  // Primeiro pulse (caso já online ao montar)
  if (navigator.onLine) drain().catch(() => {});
  window.addEventListener('online', () => drain().catch(() => {}));
  // Periodic poll a cada 30s — pega o caso onde `online` event não dispara
  // (alguns navegadores são preguiçosos)
  setInterval(() => {
    if (navigator.onLine) drain().catch(() => {});
  }, 30000);
}
