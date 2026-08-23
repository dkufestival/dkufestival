self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'piu:m', {
    body: data.body || '',
    data,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const target = windows.find((client) => 'focus' in client);
    if (target) return target.focus();
    return clients.openWindow('/');
  }));
});
