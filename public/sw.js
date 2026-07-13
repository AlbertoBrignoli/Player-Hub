// Service worker: riceve le Web Push e apre l'app sul contenuto giusto.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'AUVI Player' } }
  e.waitUntil(self.registration.showNotification(d.title || 'AUVI Player', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { route: d.route || '' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const route = e.notification.data && e.notification.data.route
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    if (list.length) {
      list[0].focus()
      if (route) list[0].postMessage({ type: 'push-route', route })
    } else {
      return self.clients.openWindow('/' + (route ? '#' + route : ''))
    }
  }))
})
