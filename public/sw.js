const CACHE_NAME = 'omnidrop-cache-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/qrcode.js',
  '/peerjs.min.js',
  '/supabase-client.js',
  '/ads.txt',
  '/manifest.json',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// IndexedDB Helper for Web Share Target
function openShareDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('omnidrop_share_db', 1);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('shares')) {
        db.createObjectStore('shares', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveShareData(data) {
  const db = await openShareDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shares', 'readwrite');
    const store = tx.objectStore('shares');
    store.put({
      id: 'pending_share',
      timestamp: Date.now(),
      ...data
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Intercept Native Web Share Target POST (Photos, Files, Safari, etc.)
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const title = formData.get('title') || '';
        const text = formData.get('text') || '';
        const sharedUrl = formData.get('url') || '';
        const files = formData.getAll('files') || [];

        await saveShareData({
          title,
          text,
          url: sharedUrl,
          files
        });
      } catch (err) {
        console.error('Error handling Web Share Target:', err);
      }
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }

  // Intercept Native Web Share Target GET (fallback)
  if (url.pathname === '/share-target' && event.request.method === 'GET') {
    event.respondWith((async () => {
      try {
        const title = url.searchParams.get('title') || '';
        const text = url.searchParams.get('text') || '';
        const sharedUrl = url.searchParams.get('url') || '';

        await saveShareData({
          title,
          text,
          url: sharedUrl,
          files: []
        });
      } catch (err) {
        console.error('Error handling Web Share Target GET:', err);
      }
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }

  // Never cache API endpoints
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
