/* eslint-disable no-restricted-globals */
/**
 * CITmax Equipe — Service Worker.
 *
 * Estratégias:
 *   - Navegação (HTML)      → network-first, fallback ao app shell em cache (offline).
 *   - Assets estáticos      → cache-first (JS/CSS/fontes/ícones com hash do Vite).
 *   - /api/*                → nunca intercepta (sempre rede; offline tratado no app).
 *   - Push                  → showNotification + avisa as abas (SW_NOVO_TICKET).
 *   - Clique na notificação → foca uma aba existente ou abre nova.
 *
 * Para forçar atualização: suba o número de CACHE_VERSION.
 */

const CACHE_VERSION = 'citmax-equipe-v1';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const ASSET_CACHE   = `${CACHE_VERSION}-assets`;

// Recursos mínimos pro app abrir offline.
const SHELL_URLS = [
  '/',
  '/manifest-tecnico.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll falha tudo-ou-nada; usamos add individual tolerante a falha.
      Promise.allSettled(SHELL_URLS.map((u) => cache.add(u)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Só mexe em requisições do próprio domínio.
  if (url.origin !== self.location.origin) return;

  // Nunca intercepta API — o app já tem fila offline própria.
  if (url.pathname.startsWith('/api/')) return;

  // Navegação (documento HTML) → network-first com fallback ao shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = (await caches.match('/')) || (await caches.match(req));
          return (
            cached ||
            new Response(
              '<h1>Offline</h1><p>Sem conexão e sem cópia em cache.</p>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            )
          );
        }
      })()
    );
    return;
  }

  // Assets estáticos (JS/CSS/fontes/imagens com hash) → cache-first.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
          const cache = await caches.open(ASSET_CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        return cached || Response.error();
      }
    })()
  );
});

/* ── Push ──────────────────────────────────────────────────────────────── */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }

  const title = data.title || 'CITmax Equipe';
  const options = {
    body:  data.body || 'Você tem uma nova atualização.',
    icon:  data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag:   data.tag || 'citmax-equipe',
    renotify: true,
    data:  { url: data.url || '/', ...data },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Avisa as abas abertas para recarregarem a fila de OS.
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsArr) {
        client.postMessage({ type: 'SW_NOVO_TICKET', payload: data });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.postMessage({ type: 'SW_NOVO_TICKET' });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })()
  );
});

// Permite que o app peça atualização imediata do SW.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
