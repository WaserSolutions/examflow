const CACHE_NAME = 'examflow-v12';

self.addEventListener('install', () => {
  // Activate immediately, don't wait for old SW to finish
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete ALL old caches and take control immediately
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Reload all open tabs to get the latest version
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => client.navigate(client.url));
        });
      })
  );
});

self.addEventListener('fetch', e => {
  // Never cache API calls
  if (e.request.url.includes('supabase.co') || e.request.url.includes('mollie.com') || e.request.url.includes('jsdelivr.net')) {
    return;
  }

  // Network first, cache as fallback (offline only)
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache a copy for offline use
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
