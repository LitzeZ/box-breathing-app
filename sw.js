// Self-destructing Service Worker
// This replaces the legacy SW to force immediate unregistration and cache clearing.

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Unregister self immediately
    self.registration.unregister()
        .then(() => {
            return self.clients.matchAll();
        })
        .then((clients) => {
            clients.forEach(client => {
                // Force reload of controlling pages
                client.navigate(client.url);
            });
        });
});
