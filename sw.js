// 앱 껍데기만 보관한다. 데이터(Supabase)와 mock/ 응답은 절대 보관하지 않는다. 껍데기도 네트워크 먼저.
const CACHE = 'basket-shell-v3';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'app.js', 'api.js', 'auth.js', 'config.js', 'format.js', 'mock.js', 'model.js', 'requests.js',
  'screens/basket.js', 'screens/history.js', 'screens/login.js', 'screens/presets.js', 'screens/preview.js',
  'screens/settings.js', 'screens/setup.js', 'screens/start.js', 'risk.json',
];
const SHELL_URLS = new Set(SHELL.map((p) => new URL(p, self.registration.scope).href));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  url.search = '';
  url.hash = '';
  if (e.request.method !== 'GET' || !SHELL_URLS.has(url.href)) return;
  e.respondWith(fetch(e.request)
    .then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(url.href, res.clone()));
      return res;
    })
    .catch(() => caches.match(url.href)));
});
