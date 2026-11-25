/**
 * Moaath Arena World - Service Worker (Smart Auto-Update)
 * المسار في GitHub: sw.js
 * لا حاجة لتغيير اسم الإصدار مستقبلاً:
 * - ملفات الكود (HTML/JS/JSON): الشبكة أولاً مع تحديث الكاش تلقائياً (تظهر التحديثات فوراً، وتعمل بدون إنترنت من الكاش).
 * - الوسائط الثقيلة (الصور والأصوات): الكاش أولاً لتوفير بيانات الإنترنت على شبكات 3G/4G.
 * - طلبات الخادم (Cloudflare Worker / Firebase): شبكة مباشرة دائماً لمنع الغش.
 */

const CACHE_NAME = 'moaath-arena-smart-cache';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/characters_engine.js',
  './js/game_hill_drive.js',
  './js/game_cyber_shooter.js',
  './js/tower_match/tower_assets.js',
  './js/tower_match/tower_board.js',
  './js/tower_match/tower_engine.js',
  './js/tower_match/tower_ui.js',
  './assets/tower_match/tile_sword.png',
  './assets/tower_match/tile_clock.png',
  './assets/tower_match/tile_coin.png',
  './assets/tower_match/tile_star.png',
  './assets/tower_match/tile_emerald.png',
  './assets/tower_match/tile_bolt.png',
  './assets/tower_match/spec_row_blast.png',
  './assets/tower_match/spec_bomb_3x3.png',
  './assets/tower_match/spec_prism_core.png',
  './assets/tower_match/boss_1_bronze.png',
  './assets/tower_match/boss_2_cyber.png',
  './assets/tower_match/boss_3_emerald.png',
  './assets/tower_match/boss_4_gold.png'
];

// 1. التثبيت: حفظ الملفات الأساسية فوراً
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// 2. التفعيل: تنظيف أي كاش قديم باسم مختلف والسيطرة على الصفحات
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 3. إدارة الطلبات بذكاء بدون الحاجة لتغيير رقم الإصدار
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // استثناء تام لطلبات الخادم الطرفي وFirebase (أمان ومنع غش)
  if (url.hostname.includes('workers.dev') || url.hostname.includes('firebaseio.com')) {
    return;
  }

  // الوسائط (أصوات MP3 وصور): الكاش أولاً لتوفير الإنترنت
  const isMedia = /\.(mp3|wav|ogg|png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname);
  if (isMedia) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ملفات الكود (HTML, JS, CSS, JSON): الشبكة أولاً لتحديث الكود تلقائياً، والكاش عند انقطاع الإنترنت
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
