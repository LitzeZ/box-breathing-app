const CACHE_NAME = 'box-breathing-v22-no-particles';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/script.js',
    './icon.png',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    // Force new SW to take control immediately
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    // Claim clients immediately so the new SW controls the page proper
    e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
