/* sw-pinheiro.js — Service Worker do Pinheiro OS.
 *
 * Responsabilidades:
 *   - Receber Web Push e exibir a notificação (chat + tickets).
 *   - Ao clicar, focar/abrir o app na conversa correta (?conv=<id>).
 *
 * Mantido propositalmente simples: sem precache agressivo (o SPA já é servido
 * com cache-control adequado pelo Express). Foco em push/notificação.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }

  const title = data.title || 'Pinheiro OS';
  const options = {
    body: data.body || '',
    icon: '/pinheiro-logo.svg',
    badge: '/pinheiro-logo.svg',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const alvo = new URL(url, self.location.origin).href;
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsArr) {
      // Se já houver uma janela do app aberta, foca e navega
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(alvo); } catch {} }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(alvo);
  })());
});
