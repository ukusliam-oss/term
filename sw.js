// Offline app shell. Same-origin files are served from cache and refreshed in the background;
// the sync API (Supabase, another origin) always goes to the network. Bump VERSION on deploy.
const VERSION = 'term-v4.0.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/tokens.css', 'css/base.css', 'css/components.css', 'css/views.css',
  'js/main.js', 'js/config.js', 'js/store.js', 'js/model.js', 'js/nlp.js', 'js/ai.js', 'js/stage.js', 'js/skin.js',
  'js/motion/spring.js', 'js/motion/animate.js', 'js/motion/flip.js', 'js/motion/gesture.js',
  'js/ui/dom.js', 'js/ui/kit.js', 'js/ui/segment.js', 'js/ui/tabs.js', 'js/ui/search.js', 'js/ui/sheet.js', 'js/ui/toast.js',
  'js/views/home.js', 'js/views/timetable.js', 'js/views/planner.js', 'js/views/school.js', 'js/views/settings.js',
  'js/views/editor.js', 'js/views/sheets.js', 'js/views/focus.js', 'js/views/frame.js',
  'vendor/supabase.js',
  'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit || (e.request.mode === 'navigate' ? cache.match('index.html') : Response.error()));
    return hit || fresh;
  }));
});
